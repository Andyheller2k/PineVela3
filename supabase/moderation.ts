import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { bodyFields, requireAdministrator, type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { checkProfileContext } from './profiles.js';
import { createSupportTicket, readSupportTicket, supportOperator } from './support.js';
import { notify } from './notifications.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { decryptReportedMessage } from '../marketEncryptionProtocol.js';

const reasons = ['fake_item', 'broken_item', 'false_name', 'false_identity', 'false_location', 'scam', 'harassment', 'unsafe', 'other'];
const actions = ['no_action', 'warning', 'ban', 'restrict', 'restore', 'delete', 'remove_listing'];
const types = ['profile', 'store', 'listing', 'message'];
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const fingerprint = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function text(value: unknown, min: number, max: number) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new ApiError(400, `Enter ${min}–${max} characters.`);
  return value.trim();
}
async function audit(c: PoolClient, a: VerifiedActor, id: string, event: string, details = {}) {
  await c.query('insert into private.content_report_events(ticket_id,actor_context_id,event_type,details) values($1,$2,$3,$4)', [id, a.contextId, event, JSON.stringify(details)]);
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values($1,$2,'content_report',$3)", [a.contextId, event, id]);
}
async function adminRecipients(c: PoolClient) {
  return (await c.query(`select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'`)).rows.map(r => r.context_id);
}
async function message(c: PoolClient, actor: VerifiedActor, id: string) {
  const row = (await c.query(`select m.*,s.seller_context_id,p.display_name as sender_name,
   case when m.sender_context_id=m.buyer_context_id then s.seller_context_id else m.buyer_context_id end as recipient_context_id
   from public.market_messages m join public.stores s on s.id=m.store_id
   join public.account_contexts x on x.id=m.sender_context_id join public.profiles p on p.id=x.auth_user_id
   where m.id=$1 and (m.buyer_context_id=$2 or s.seller_context_id=$2)`, [id, actor.contextId])).rows[0];
  if (!row) throw new ApiError(404, 'That message is unavailable in this account.');
  return row;
}
async function target(c: PoolClient, a: VerifiedActor, type: string, id: string) {
  let row: any;
  if (type === 'message') {
    const m = await message(c, a, id);
    row = { id, contextId: m.sender_context_id, kind: m.sender_context_id === m.buyer_context_id ? 'primary' : 'seller', name: m.sender_name, storeId: m.store_id, buyerId: m.buyer_context_id };
  } else if (type === 'store' || type === 'listing') {
    row = (await c.query(type === 'store' ? `select s.id,s.seller_context_id as "contextId",'seller' as kind,s.name,s.id as "storeId"
      from public.stores s where s.id=$1 and (exists(select 1 from private.store_catalog p where p.id=s.id)
       or exists(select 1 from public.market_orders o where o.store_id=s.id and o.buyer_context_id=$2)
       or exists(select 1 from public.market_messages m where m.store_id=s.id and m.buyer_context_id=$2))`
      : `select l.id,s.seller_context_id as "contextId",'seller' as kind,l.title as name,s.id as "storeId"
      from public.listings l join public.stores s on s.id=l.store_id where l.id=$1
       and (exists(select 1 from private.listing_catalog p where p.id=l.id)
        or exists(select 1 from public.market_orders o where o.listing_id=l.id and o.buyer_context_id=$2))`, [id, a.contextId])).rows[0];
  } else {
    row = (await c.query(`select x.id,x.id as "contextId",x.kind,coalesce((select s.name from public.stores s join private.store_catalog catalog on catalog.id=s.id where s.seller_context_id=x.id limit 1),p.display_name) as name from public.account_contexts x join public.profiles p on p.id=x.auth_user_id
      where x.id=$1 and (exists(select 1 from public.stores s join private.store_catalog catalog on catalog.id=s.id where s.seller_context_id=x.id)
       or exists(select 1 from public.market_messages m join public.stores s on s.id=m.store_id where
        (m.buyer_context_id=$2 and s.seller_context_id=x.id) or (s.seller_context_id=$2 and m.buyer_context_id=x.id))
       or exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id where
        (o.buyer_context_id=$2 and s.seller_context_id=x.id) or (s.seller_context_id=$2 and o.buyer_context_id=x.id)))`, [id, a.contextId])).rows[0];
  }
  if (!row) throw new ApiError(404, 'This profile, store or item is unavailable for reporting.');
  const own = (await c.query(`select coalesce(t.primary_owner_id,t.auth_user_id)=coalesce(a.primary_owner_id,a.auth_user_id) as same_owner
    from public.account_contexts t join public.account_contexts a on a.id=$2 where t.id=$1`, [row.contextId, a.contextId])).rows[0];
  if (row.contextId === a.contextId || own?.same_owner) throw new ApiError(400, 'You cannot report your own profile or content.');
  row.name = String(row.name).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) || type;
  return row;
}
const reportSelect = `r.ticket_id as "ticketId",t.reference,r.target_type as "targetType",r.target_id as "targetId",r.target_context_id as "targetContextId",r.target_kind as "targetKind",
 r.target_name as "targetName",r.reason,r.details,r.status,r.version,r.created_at as "createdAt",r.updated_at as "updatedAt"`;
async function reportQueue(c: PoolClient, page = 0, status = '') {
  await supportOperator(c);
  const rows = (await c.query(`select ${reportSelect},
   (select jsonb_build_object('messageId',e.message_id,'encodedText',encode(e.plaintext,'base64'),'encrypted',e.encrypted,'senderName',e.sender_name,'createdAt',e.created_at,'consentAt',e.consent_at) from private.content_report_evidence e where e.ticket_id=r.ticket_id) as evidence,
   (select jsonb_build_object('id',n.id,'action',n.action,'reason',n.reason,'by',n.author_context_id,'createdAt',n.created_at) from private.content_report_recommendations n where n.ticket_id=r.ticket_id) as recommendation,
   (select jsonb_build_object('decision',d.decision,'reason',d.reason,'by',d.administrator_context_id,'proposalId',d.proposal_id,'createdAt',d.created_at) from private.content_report_decisions d where d.ticket_id=r.ticket_id) as decision
   from private.content_reports r join private.support_tickets t on t.id=r.ticket_id
   where ($2='' or r.status=$2)
   order by case when r.status='recommended' then 0 when r.status='submitted' then 1 else 2 end,r.updated_at desc,r.ticket_id limit 26 offset $1`, [page * 25, status])).rows;
  for (const row of rows) if (row.evidence) { row.evidence.text = Buffer.from(row.evidence.encodedText, 'base64').toString('utf8'); delete row.evidence.encodedText; }
  return { reports: rows.slice(0, 25), hasMore: rows.length > 25 };
}
export async function readContentReport(c: PoolClient, a: VerifiedActor, id: string, operator = false) {
  if (operator) await supportOperator(c);
  const r = (await c.query(`select ${reportSelect} from private.content_reports r join private.support_tickets t on t.id=r.ticket_id where r.ticket_id=$1 and ($2 or r.reporter_context_id=$3)`, [uuid(id), operator, a.contextId])).rows[0];
  if (!r) return null;
  if (operator) {
    r.evidence = (await c.query(`select message_id as "messageId",plaintext as text,encrypted,sender_name as "senderName",created_at as "createdAt",consent_at as "consentAt" from private.content_report_evidence where ticket_id=$1`, [id])).rows[0] || null;
    if (r.evidence) r.evidence.text = r.evidence.text.toString('utf8');
    r.recommendation = (await c.query(`select id,action,reason,author_context_id as "by",created_at as "createdAt" from private.content_report_recommendations where ticket_id=$1`, [id])).rows[0] || null;
    r.decision = (await c.query(`select decision,reason,administrator_context_id as "by",proposal_id as "proposalId",created_at as "createdAt" from private.content_report_decisions where ticket_id=$1`, [id])).rows[0] || null;
  }
  return r;
}
export async function createContentReport(c: PoolClient, a: VerifiedActor, body: any) {
  bodyFields(body, ['targetType', 'targetId', 'reason', 'details', 'requestKey', 'evidence']);
  if (!types.includes(body.targetType) || !reasons.includes(body.reason)) throw new ApiError(400, 'Choose a report target and reason.');
  const id = uuid(body.targetId), key = uuid(body.requestKey), details = text(body.details, 10, 6000);
  let evidenceId: string | null = null, evidenceKey: string | null = null;
  if (body.evidence !== undefined) {
    bodyFields(body.evidence, ['messageId', 'key', 'consent']);
    if (body.evidence.consent !== true) throw new ApiError(400, 'Consent is required to share this selected message with customer service.');
    evidenceId = uuid(body.evidence.messageId);
    if (body.evidence.key !== undefined && (typeof body.evidence.key !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.evidence.key))) throw new ApiError(400, 'Use the selected message disclosure key.');
    evidenceKey = body.evidence.key || null;
  }
  if (body.targetType === 'message' && evidenceId !== id) throw new ApiError(400, 'Share the selected message as evidence before reporting it.');
  const hash = fingerprint([body.targetType, id, body.reason, details, evidenceId, evidenceKey]);
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`content-report:${a.contextId}`]);
  const old = (await c.query(`select r.ticket_id,r.request_fingerprint from private.content_reports r join private.support_tickets t on t.id=r.ticket_id where r.reporter_context_id=$1 and t.request_key=$2`, [a.contextId, key])).rows[0];
  if (old) {
    if (old.request_fingerprint !== hash) throw new ApiError(409, 'This report request key already has different contents.');
    return { ...(await readSupportTicket(c, a, old.ticket_id)), report: await readContentReport(c, a, old.ticket_id) };
  }
  const item = await target(c, a, body.targetType, id);
  let proof: any = null, plaintext = '';
  if (evidenceId) {
    proof = await message(c, a, evidenceId);
    if ((body.targetType === 'store' || body.targetType === 'listing') && proof.store_id !== item.storeId
      || body.targetType === 'listing' && proof.listing_id !== id
      || body.targetType === 'profile' && proof.sender_context_id !== id && proof.recipient_context_id !== id) throw new ApiError(400, 'The selected message does not relate to this report.');
    if (proof.encryption_version && !evidenceKey) throw new ApiError(400, 'Unlock this message and share its selected disclosure key.');
    try { plaintext = proof.encryption_version ? await decryptReportedMessage(proof, evidenceKey!) : proof.body; }
    catch { throw new ApiError(400, 'This message disclosure could not be authenticated. Unlock and select it again.'); }
    if (typeof plaintext !== 'string' || !plaintext.length || plaintext.length > 5000) throw new ApiError(400, 'The selected message evidence is invalid.');
  }
  const ticket = await createSupportTicket(c, a, { subject: `Report ${body.targetType}: ${String(item.name).replace(/\s+/g, ' ')}`.slice(0, 160), body: details, category: 'marketplace', type: 'report', source: '/digital-market', requestKey: key });
  if ((await c.query('select 1 from private.content_reports where ticket_id=$1', [ticket.id])).rowCount) throw new ApiError(409, 'This report already exists.');
  await c.query(`insert into private.content_reports(ticket_id,reporter_context_id,target_type,target_id,target_context_id,target_kind,target_name,reason,details,request_fingerprint)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [ticket.id, a.contextId, body.targetType, id, item.contextId, item.kind, String(item.name).slice(0, 300), body.reason, details, hash]);
  if (proof) {
    // Store the authenticated selected text and exact encrypted record, never a
    // private identity key, recovery phrase, conversation key, or AES key.
    const snapshot = { id: proof.id, requestId: proof.request_id, buyerId: proof.buyer_context_id, storeId: proof.store_id, senderId: proof.sender_context_id, recipientId: proof.recipient_context_id, body: proof.body, encryptionVersion: proof.encryption_version ?? null, encryptedPayload: proof.encrypted_payload ?? null };
    await c.query(`insert into private.content_report_evidence(ticket_id,message_id,message_snapshot,plaintext,encrypted,sender_name,consent_context_id,created_at)values($1,$2,$3,$4,$5,$6,$7,$8)`, [ticket.id, proof.id, JSON.stringify(snapshot), Buffer.from(plaintext, 'utf8'), !!proof.encryption_version, proof.sender_name, a.contextId, proof.created_at]);
  }
  await audit(c, a, ticket.id, 'content_report_submitted', { targetType: body.targetType, targetId: id, selectedMessageId: evidenceId });
  return { ...ticket, report: await readContentReport(c, a, ticket.id) };
}
export async function recommendContentReport(c: PoolClient, a: VerifiedActor, id: string, body: any) {
  await supportOperator(c); bodyFields(body, ['action', 'reason', 'version', 'requestKey']);
  if (!actions.includes(body.action)) throw new ApiError(400, 'Choose a supported recommendation.');
  const reason = text(body.reason, 10, 2000), key = uuid(body.requestKey);
  const item = (await c.query('select * from private.content_reports where ticket_id=$1 for update', [uuid(id)])).rows[0];
  if (!item) throw new ApiError(404, 'Content report not found.');
  const old = (await c.query('select * from private.content_report_recommendations where ticket_id=$1', [id])).rows[0];
  if (old) {
    if (old.request_key !== key || old.author_context_id !== a.contextId || old.action !== body.action || old.reason !== reason) throw new ApiError(409, 'This report has already been recommended for administrator review.');
    return { report: await readContentReport(c, a, id, true) };
  }
  if (item.version !== body.version || item.status !== 'submitted') throw new ApiError(409, 'This report changed. Refresh before submitting your review.');
  if (body.action === 'remove_listing' && item.target_type !== 'listing') throw new ApiError(400, 'Item removal can only be recommended for an item report.');
  await c.query(`insert into private.content_report_recommendations(ticket_id,action,reason,author_context_id,request_key)values($1,$2,$3,$4,$5)`, [id, body.action, reason, a.contextId, key]);
  await c.query("update private.content_reports set status='recommended',version=version+1,updated_at=clock_timestamp() where ticket_id=$1", [id]);
  await audit(c, a, id, 'content_report_recommended', { action: body.action });
  await notify(c, await adminRecipients(c), { category: 'support', title: 'Content report requires administrator review', message: 'Customer service submitted a recommendation. No account or item has been changed.', sender: a.contextId, link: `/customer-service?ticket=${id}` });
  return { report: await readContentReport(c, a, id, true) };
}
export async function decideContentReport(c: PoolClient, a: VerifiedActor, grant: SettingsGrant, id: string, body: any) {
  await requireAdministrator(c, a); await requireApprovalGrant(c, a, grant);
  bodyFields(body, ['decision', 'reason', 'version', 'privateKey', 'proposalId']);
  if (!['dismiss', 'escalate'].includes(body.decision)) throw new ApiError(400, 'Choose dismiss or escalate for governed review.');
  const reason = text(body.reason, 10, 2000), proposalId = body.proposalId === undefined ? null : uuid(body.proposalId);
  const item = (await c.query('select * from private.content_reports where ticket_id=$1 for update', [uuid(id)])).rows[0];
  if (!item) throw new ApiError(404, 'Content report not found.');
  const old = (await c.query('select * from private.content_report_decisions where ticket_id=$1', [id])).rows[0];
  if (old) {
    if (old.administrator_context_id !== a.contextId || old.decision !== body.decision || old.reason !== reason || old.proposal_id !== proposalId) throw new ApiError(409, 'An administrator already reviewed this report.');
    return { report: await readContentReport(c, a, id, true) };
  }
  if (item.version !== body.version || item.status !== 'recommended') throw new ApiError(409, 'Customer service must submit a current recommendation first.');
  const recommended = (await c.query('select action from private.content_report_recommendations where ticket_id=$1', [id])).rows[0];
  if (proposalId) {
    const proposal = (await c.query('select kind,target_context_id,status,preview from public.admin_proposals where id=$1 for share', [proposalId])).rows[0];
    if (body.decision !== 'escalate' || !['ban', 'restrict', 'restore'].includes(recommended.action) || !proposal || proposal.kind !== 'account_action' || proposal.target_context_id !== item.target_context_id || proposal.preview?.action !== recommended.action || !['pending', 'approved', 'executed'].includes(proposal.status)) throw new ApiError(400, 'Link an active matching account proposal from the existing governed review tools.');
  }
  await c.query(`insert into private.content_report_decisions(ticket_id,decision,reason,administrator_context_id,proposal_id)values($1,$2,$3,$4,$5)`, [id, body.decision, reason, a.contextId, proposalId]);
  await c.query('update private.content_reports set status=$2,version=version+1,updated_at=clock_timestamp() where ticket_id=$1', [id, body.decision === 'dismiss' ? 'dismissed' : 'escalated']);
  await audit(c, a, id, 'content_report_administrator_review', { decision: body.decision, proposalId });
  await notify(c, [item.reporter_context_id], { category: 'support', title: 'Your content report was reviewed', message: body.decision === 'dismiss' ? 'An administrator reviewed the report. Customer service can explain the outcome in your support case.' : 'Your report was escalated for the appropriate governed review. Escalation does not mean a sanction has been applied.', sender: a.contextId, link: `/help?ticket=${id}` });
  return { report: await readContentReport(c, a, id, true) };
}
export function installModeration(app: Express, auth: SupabaseAuth) {
  const db = auth.db, budgets = new AttemptBudgets();
  const checked: RequestHandler = (req, _res, next) => { try {
    checkProfileContext((req as AuthRequest).actor, req.headers['x-pinevela-profile-context']);
    const paged = req.method === 'GET' && ['/api/customer-service/reports', '/api/admin/reports'].includes(req.path);
    if (Object.keys(req.query).some(k => !paged || !['page', 'status'].includes(k))) throw new ApiError(400, 'Report identity is derived from your current account.');
    next();
  } catch (e) { next(e); } };
  const page = (value: unknown) => { if (value === undefined) return 0; if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,4})$/.test(value) || Number(value) > 10000) throw new ApiError(400, 'Choose a valid report page.'); return Number(value); };
  const status = (value: unknown) => { if (value === undefined || value === '') return ''; if (typeof value !== 'string' || !['submitted', 'recommended', 'escalated', 'dismissed'].includes(value)) throw new ApiError(400, 'Choose a valid report status.'); return value; };
  const budget = (a: VerifiedActor, scope: string, max = 30) => budgets.reserve([{ scope, identity: a.contextId, maximum: max, windowMs: 600000 }]);
  app.post('/api/reports', auth.require(), checked, route(async (req, res) => { budget(req.actor, 'content-report-create'); res.status(201).json(await db.authorizedSystem(req.actor, [req.actor.kind], c => createContentReport(c, req.actor, req.body))); }));
  app.get('/api/reports', auth.require(), checked, route(async (req, res) => res.json(await db.readActor(req.actor, async c => ({ reports: (await c.query(`select ${reportSelect} from private.content_reports r join private.support_tickets t on t.id=r.ticket_id where r.reporter_context_id=$1 order by r.created_at desc,r.ticket_id limit 100`, [req.actor.contextId])).rows })))));
  app.get('/api/customer-service/reports/:id', auth.require(['primary', 'admin']), checked, route(async (req, res) => res.json(await db.authorizedRead(req.actor, ['primary', 'admin'], async c => ({ report: await readContentReport(c, req.actor, req.params.id, true) })))));
  app.get('/api/customer-service/reports', auth.require(['primary', 'admin']), checked, route(async (req, res) => { const number = page(req.query.page), state = status(req.query.status); res.json(await db.authorizedRead(req.actor, ['primary', 'admin'], c => reportQueue(c, number, state))); }));
  app.post('/api/customer-service/reports/:id/recommend', auth.require(['primary', 'admin']), checked, route(async (req, res) => { budget(req.actor, 'content-report-review'); res.json(await db.authorizedSystem(req.actor, ['primary', 'admin'], c => recommendContentReport(c, req.actor, req.params.id, req.body))); }));
  app.get('/api/admin/reports', auth.require(['admin']), checked, route(async (req, res) => { const number = page(req.query.page), state = status(req.query.status); res.json(await db.authorizedRead(req.actor, ['admin'], async c => {
    await requireAdministrator(c, req.actor);
    return reportQueue(c, number, state);
  })); }));
  app.post('/api/admin/reports/:id/decision', auth.require(['admin']), checked, route(async (req, res) => {
    bodyFields(req.body, ['decision', 'reason', 'version', 'privateKey', 'proposalId']); budget(req.actor, 'content-report-admin-key', 20);
    const grant = await db.authorizedSystem(req.actor, ['admin'], c => checkApprovalKey(c, req.actor, req.body.privateKey)); deniedApprovalKey(grant);
    res.json(await db.authorizedSystem(req.actor, ['admin'], c => decideContentReport(c, req.actor, grant, req.params.id, req.body)));
  }));
}
