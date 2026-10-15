import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { bodyFields, requireAdministrator, type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { requireManagerKeyGrant, managerKeyError } from './managerKeys.js';
import { ownedMedia } from './media.js';
import { notify, notifyPrimaryOwner } from './notifications.js';
import { internationalPhone } from '../internationalPhone.js';

function text(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value))
    throw new ApiError(400, 'Enter valid residence and contact details.');
  return value.trim();
}
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function assignedResidence(c: PoolClient, actor: VerifiedActor, id: string) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Use your assigned manager account.');
  const home = (await c.query(`select h.* from public.residences h where h.id=$1 and exists(
    select 1 from public.manager_assignments a where a.residence_id=h.id and a.manager_context_id=$2 and a.ended_at is null)
    for update of h`, [id, actor.contextId])).rows[0];
  if (!home) throw new ApiError(404, 'Assigned residence not found.');
  if (home.status !== 'approved') throw new ApiError(409, 'Residence changes require an approved property.');
  if (!(await c.query('select id from public.manager_assignments where residence_id=$1 and manager_context_id=$2 and ended_at is null for share', [id, actor.contextId])).rowCount)
    throw new ApiError(409, 'Your manager assignment changed.');
  return home;
}
async function residenceFields(c: PoolClient, home: any, managerId: string) {
  const profile = (await c.query(`select p.display_name,p.phone from public.account_contexts x
    join public.profiles p on p.id=x.auth_user_id where x.id=$1 and x.kind='manager'`, [managerId])).rows[0];
  return { name: home.name, cover: home.cover_path || '', gallery: home.gallery_paths,
    managerName: home.manager_contact_name || profile?.display_name || '', managerPhone: home.contact_phone || profile?.phone || '',
    managerPhoneCountry: home.contact_country || '', blocks: (await c.query('select id,name from public.blocks where residence_id=$1 order by created_at,id', [home.id])).rows };
}
async function removalAllowed(c: PoolClient, residenceId: string, blocks: any[]) {
  const blocked = await c.query(`select b.id from public.blocks b where b.residence_id=$1 and not(b.id=any($2::uuid[]))
    and (exists(select 1 from public.floors f where f.block_id=b.id)
      or exists(select 1 from public.staff_assignments s where s.assigned_block_id=b.id))`, [residenceId, blocks.map(b => b.id)]);
  if (blocked.rowCount) throw new ApiError(409, 'A block with floors, rooms, beds or staff history cannot be removed. Rename it instead.');
}
async function normalizeChanges(c: PoolClient, actor: VerifiedActor, home: any, before: any, changes: any) {
  bodyFields(changes, ['name', 'cover', 'gallery', 'managerName', 'managerPhone', 'managerPhoneCountry', 'blocks']);
  if (!Object.keys(changes).length) throw new ApiError(400, 'Supply the changed residence fields.');
  const after = structuredClone(before);
  for (const key of ['name', 'managerName']) if (changes[key] !== undefined) after[key] = text(changes[key], 160);
  if (changes.managerPhone !== undefined || changes.managerPhoneCountry !== undefined) {
    try { const phone = internationalPhone(changes.managerPhone ?? before.managerPhone, changes.managerPhoneCountry ?? before.managerPhoneCountry);
      after.managerPhone = phone.number; after.managerPhoneCountry = phone.country;
    } catch (e) { throw new ApiError(400, (e as Error).message); }
  }
  if (changes.cover !== undefined) {
    if (changes.cover !== before.cover) await ownedMedia(c, actor, changes.cover, 'hostel');
    after.cover = changes.cover;
  }
  if (changes.gallery !== undefined) {
    if (!Array.isArray(changes.gallery) || changes.gallery.length < 1 || changes.gallery.length > 3 || new Set(changes.gallery).size !== changes.gallery.length)
      throw new ApiError(400, 'Provide 1–3 distinct interior photographs.');
    for (const photo of changes.gallery) if (!before.gallery.includes(photo)) await ownedMedia(c, actor, photo, 'hostel');
    after.gallery = changes.gallery;
  }
  if (changes.blocks !== undefined) {
    if (!Array.isArray(changes.blocks) || changes.blocks.length < 1 || changes.blocks.length > 100) throw new ApiError(400, 'Provide between 1 and 100 blocks.');
    const names = new Set<string>(), ids = new Set<string>();
    after.blocks = changes.blocks.map((b: any) => {
      bodyFields(b, ['id', 'name']); const name = text(b.name, 100);
      if (names.has(name.toLowerCase())) throw new ApiError(400, 'Block names must be distinct.'); names.add(name.toLowerCase());
      const id = b.id === undefined || b.id === '' || b.id === null ? crypto.randomUUID() : uuid(b.id);
      if (ids.has(id) || b.id && !before.blocks.some((old: any) => old.id === id)) throw new ApiError(400, 'Use each existing block ID only in its own residence.');
      ids.add(id); return { id, name };
    });
    await removalAllowed(c, home.id, after.blocks);
  }
  if (digest(before) === digest(after)) throw new ApiError(400, 'No changes were made.');
  return after;
}
async function nextRequestAt(c: PoolClient, managerId: string) {
  return (await c.query(`select extract(epoch from max(submitted_at)+interval '30 days')*1000 as next
    from public.residence_change_requests where manager_context_id=$1`, [managerId])).rows[0].next;
}
export async function managerResidenceChanges(c: PoolClient, actor: VerifiedActor) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Manager account required.');
  const homes = (await c.query(`select h.* from public.residences h join public.manager_assignments a on a.residence_id=h.id
    where a.manager_context_id=$1 and a.ended_at is null order by a.assigned_at,h.id`, [actor.contextId])).rows;
  const hostels = []; for (const home of homes) hostels.push({ id: home.id, ...await residenceFields(c, home, actor.contextId) });
  return { hostels, nextRequestAt: Number(await nextRequestAt(c, actor.contextId)) || 0 };
}
export async function submitResidenceChanges(c: PoolClient, actor: VerifiedActor, body: any) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Manager account required.');
  bodyFields(body, ['hostelId', 'changes']);
  if (!actor.managerKeyVersion) throw managerKeyError();
  await requireManagerKeyGrant(c, actor);
  await c.query("select set_config('pinevela.manager_change_key_version',$1,true)", [actor.managerKeyVersion]);
  await c.query("select pg_advisory_xact_lock(hashtextextended('residence-change:'||$1,0))", [actor.contextId]);
  const next = Number(await nextRequestAt(c, actor.contextId)), now = Number((await c.query('select extract(epoch from clock_timestamp())*1000 as now')).rows[0].now);
  if (next > now) throw new ApiError(429, 'Residence change requests are limited to one every 30 days.');
  const home = await assignedResidence(c, actor, uuid(body.hostelId)), before = await residenceFields(c, home, actor.contextId);
  const after = await normalizeChanges(c, actor, home, before, body.changes);
  const r = (await c.query(`insert into public.residence_change_requests(residence_id,manager_context_id,baseline_digest,before_fields,after_fields)
    values($1,$2,$3,$4,$5) returning id`, [home.id, actor.contextId, digest(before), before, after])).rows[0];
  const admins = (await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'`)).rows.map(r => r.context_id);
  await notify(c, admins, { category: 'admin_governance', title: 'Residence changes awaiting review', message: `Requested updates to "${home.name}" are ready for the Admin Board.`, sender: actor.contextId, link: 'residence_changes' });
  await notify(c, [actor.contextId], { category: 'verification', title: 'Residence changes submitted', message: `Your updates to "${home.name}" are awaiting approval.`, link: '/manager/dashboard' });
  await notifyPrimaryOwner(c, actor.contextId, { category: 'verification', title: 'Residence changes submitted', message: `Updates to "${home.name}" are awaiting administrator approval.` });
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'residence_changes_submitted','residence_change_request',$2)", [actor.contextId, r.id]);
  return { success: true, id: r.id };
}
const projection = (r: any) => ({ id: r.id, kind: 'residence-change', type: 'residence_change', hostelId: r.residence_id,
  hostelName: r.before_fields.name, managerId: r.manager_context_id, managerName: r.manager_name,
  subject: `Residence update: ${r.before_fields.name}`, before: r.before_fields, after: r.after_fields,
  status: r.status[0].toUpperCase() + r.status.slice(1), createdAt: r.submitted_at, reviewedAt: r.decided_at, reason: r.decision_notes, adminNotes: r.decision_notes });
export async function residenceChangeRows(c: PoolClient) {
  return (await c.query(`select v.*,p.display_name as manager_name from public.residence_change_requests v
    join public.account_contexts x on x.id=v.manager_context_id join public.profiles p on p.id=x.auth_user_id
    where private.current_kind()='admin' or (v.manager_context_id=private.current_context_id() and private.can_manage_residence(v.residence_id))
    order by v.submitted_at desc,v.id limit 1000`)).rows.map(projection);
}
async function requestRow(c: PoolClient, id: string) {
  const r = (await c.query('select * from public.residence_change_requests where id=$1 for update', [id])).rows[0];
  if (!r) throw new ApiError(404, 'Residence change request not found.'); return r;
}
/** Purpose-separated proof of an actual diff read. The signer derives solely from
 * this administrator's private random approval-key verifier. Native key rotation
 * invalidates it; raw keys and verifiers never leave the server. It grants no
 * decision authority without the separate current approval key/session checks. */
async function reviewSigner(c: PoolClient, actor: VerifiedActor) {
  await requireAdministrator(c, actor);
  const s = (await c.query('select approval_key_hash,approval_key_version from private.admin_secrets where context_id=$1 for share', [actor.contextId])).rows[0];
  if (!s?.approval_key_hash) throw new ApiError(403, 'Enroll your approval key before reviewing residence changes.');
  return { key: Buffer.from(crypto.hkdfSync('sha256', Buffer.from(s.approval_key_hash), Buffer.from('pinevela/residence-change-review/v1'), Buffer.from(actor.contextId), 32)), version: s.approval_key_version };
}
const requestDigest = (r: any) => digest([r.id, r.residence_id, r.manager_context_id, r.baseline_digest, r.before_fields, r.after_fields, r.status]);
export async function reviewResidenceChanges(c: PoolClient, actor: VerifiedActor, id: string) {
  const signer = await reviewSigner(c, actor), r = await requestRow(c, id);
  const p = (await c.query('select display_name from public.profiles where id=(select auth_user_id from public.account_contexts where id=$1)', [r.manager_context_id])).rows[0];
  const now = Number((await c.query('select extract(epoch from clock_timestamp()) as now')).rows[0].now);
  const payload = Buffer.from(JSON.stringify({ request: r.id, digest: requestDigest(r), context: actor.contextId, session: actor.sessionId,
    version: signer.version, expires: now + 1800 })).toString('base64url');
  const reviewToken = payload + '.' + crypto.createHmac('sha256', signer.key).update(payload).digest('base64url'); signer.key.fill(0);
  return { request: projection({ ...r, manager_name: p?.display_name }), reviewToken };
}
export async function decideResidenceChanges(c: PoolClient, actor: VerifiedActor, grant: SettingsGrant, id: string, body: any) {
  bodyFields(body, ['decision', 'approvalKey', 'reviewToken', 'reason']);
  await requireApprovalGrant(c, actor, grant);
  if (!['approve', 'reject'].includes(body.decision)) throw new ApiError(400, 'Choose approve or reject.');
  const reason = body.reason === undefined || body.reason === '' ? '' : text(body.reason, 2000);
  if (body.decision === 'reject' && !reason) throw new ApiError(400, 'Provide a rejection reason.');
  // Match manager mutations' residence-before-request lock order.
  const target = (await c.query('select residence_id from public.residence_change_requests where id=$1', [id])).rows[0];
  if (!target) throw new ApiError(404, 'Residence change request not found.');
  await c.query('select id from public.residences where id=$1 for update', [target.residence_id]);
  const r = await requestRow(c, id);
  if (r.status !== 'pending') throw new ApiError(409, 'This request has already been decided.');
  const signer = await reviewSigner(c, actor), parts = typeof body.reviewToken === 'string' && body.reviewToken.length <= 4096 ? body.reviewToken.split('.') : [];
  let valid = false;
  try {
    if (parts.length === 2) {
      const expected = crypto.createHmac('sha256', signer.key).update(parts[0]).digest(), signature = Buffer.from(parts[1], 'base64url');
      const proof = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      const now = Number((await c.query('select extract(epoch from clock_timestamp()) as now')).rows[0].now);
      valid = signature.length === expected.length && crypto.timingSafeEqual(expected, signature)
        && proof.request === r.id && proof.context === actor.contextId && proof.session === actor.sessionId && proof.version === signer.version
        && proof.digest === requestDigest(r) && typeof proof.expires === 'number' && proof.expires > now && proof.expires <= now + 1800;
    }
  } catch { valid = false; } finally { signer.key.fill(0); }
  if (!valid) throw new ApiError(409, 'View this request in your current session before confirming a decision.');
  if (body.decision === 'approve') {
    const manager = (await c.query("select c.auth_user_id,c.status from public.account_contexts c where c.id=$1 and c.kind='manager' for share", [r.manager_context_id])).rows[0];
    if (manager?.status !== 'active') throw new ApiError(409, 'The requesting manager is no longer active.');
    const submittingActor = { ...actor, contextId: r.manager_context_id, authUserId: manager.auth_user_id, kind: 'manager' };
    const home = await assignedResidence(c, submittingActor, r.residence_id), current = await residenceFields(c, home, r.manager_context_id);
    if (digest(current) !== r.baseline_digest || digest(current) !== digest(r.before_fields)) throw new ApiError(409, 'Residence details changed. Reject this stale request and request a new submission.');
    const after = r.after_fields;
    for (const url of [after.cover, ...after.gallery].filter(Boolean)) if (url !== current.cover && !current.gallery.includes(url)) await ownedMedia(c, submittingActor, url, 'hostel');
    await removalAllowed(c, home.id, after.blocks);
    if (digest(current.blocks) !== digest(after.blocks)) {
      await c.query('delete from public.blocks where residence_id=$1 and not(id=any($2::uuid[]))', [home.id, after.blocks.map((b: any) => b.id)]);
      // Temporarily move only this residence's unique names so swaps remain valid.
      for (const b of current.blocks) if (after.blocks.some((n: any) => n.id === b.id)) await c.query('update public.blocks set name=$2 where id=$1', [b.id, crypto.randomUUID()]);
      for (const b of after.blocks) {
        if (current.blocks.some((old: any) => old.id === b.id)) await c.query('update public.blocks set name=$2 where id=$1', [b.id, b.name]);
        else await c.query('insert into public.blocks(id,residence_id,name) values($1,$2,$3)', [b.id, home.id, b.name]);
      }
    }
    const nameChanged=current.managerName!==after.managerName;
    const phoneChanged=current.managerPhone!==after.managerPhone || current.managerPhoneCountry!==after.managerPhoneCountry;
    await c.query(`update public.residences set name=$2,cover_path=$3,gallery_paths=$4,manager_contact_name=$5,
      contact_phone=$6,contact_country=$7,updated_at=clock_timestamp() where id=$1`, [home.id, after.name, after.cover || null, after.gallery,
      nameChanged ? after.managerName || null : home.manager_contact_name,
      phoneChanged ? after.managerPhone || null : home.contact_phone,
      phoneChanged ? after.managerPhoneCountry || null : home.contact_country]);
  }
  await c.query('update public.residence_change_requests set status=$2,decision_notes=$3 where id=$1', [id, body.decision === 'approve' ? 'approved' : 'rejected', reason]);
  const notice = { category: 'verification', title: body.decision === 'approve' ? 'Residence changes approved' : 'Residence changes rejected',
    message: body.decision === 'approve' ? `Your updates to "${r.before_fields.name}" were approved and applied.` : `Your updates to "${r.before_fields.name}" were rejected. Reason: ${reason}`, sender: actor.contextId, link: '/manager/dashboard' };
  await notify(c, [r.manager_context_id], notice); await notifyPrimaryOwner(c, r.manager_context_id, notice);
  const admins = (await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r => r.context_id);
  await notify(c, admins, { ...notice, category: 'admin_governance', link: 'residence_changes' });
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'residence_change_request',$3)", [actor.contextId, `residence_changes_${body.decision}`, id]);
  return { success: true };
}
export function installResidenceChanges(app: Express, auth: SupabaseAuth) {
  const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
  app.get('/api/manager/residence-requests', auth.require(['manager']), route(async (req, res) => res.json(await auth.db.authorizedSystem(req.actor, ['manager'], c => managerResidenceChanges(c, req.actor)))));
  app.post('/api/board-requests', auth.require(['manager']), route(async (req, res) => res.json(await auth.db.authorizedSystem(req.actor, ['manager'], c => submitResidenceChanges(c, req.actor, req.body)))));
  app.get('/api/board-requests/:id/review', auth.require(['admin']), route(async (req, res) => res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => reviewResidenceChanges(c, req.actor, uuid(req.params.id))))));
  app.post('/api/board-requests/:id/decision', auth.require(['admin']), route(async (req, res) => {
    const grant = await auth.db.authorizedSystem(req.actor, ['admin'], c => checkApprovalKey(c, req.actor, req.body?.approvalKey)); deniedApprovalKey(grant);
    return res.json(await auth.db.authorizedSystem(req.actor, ['admin'], c => decideResidenceChanges(c, req.actor, grant, uuid(req.params.id), req.body)));
  }));
  app.put('/api/board-requests/:id', auth.require(['admin']), (_req, res) => res.status(410).json({ error: 'General request editing is retired. View the residence diff and confirm with your approval key.' }));
}
