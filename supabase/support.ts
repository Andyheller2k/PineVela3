import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { bodyFields, type SettingsGrant } from './adminSettings.js';
import { checkApprovalKey, deniedApprovalKey, requireApprovalGrant } from './adminGovernance.js';
import { notify } from './notifications.js';
import { AttemptBudgets } from '../resourceSecurity.js';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, SUPPORT_TYPES } from '../supportModel.js';
import { checkProfileContext } from './profiles.js';
import { deliverSupportEmail, supportMailConfiguration } from './supportEmail.js';
import { residentContactEmail } from './residentContact.js';

const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };
const digest = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const tokenDigest = (value: unknown) => { if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(value)) throw new ApiError(400, 'Enter the complete private access code.'); return digest(value); };
function text(value: unknown, label: string, max: number, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) throw new ApiError(400, `Enter ${label} (${min}–${max} characters).`);
  return value.trim();
}
function email(value: unknown) { const s = text(value, 'a contact email', 254).toLowerCase(); if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s)) throw new ApiError(400, 'Enter a valid email address.'); return s; }
export async function supportOperator(c: PoolClient) {
  if (!(await c.query('select private.support_operator() as allowed')).rows[0].allowed) throw new ApiError(403, 'An active invited customer-service account is required.');
}
const ticketSelect = `id,reference,subject,category,type,status,priority,requester_name as "requesterName",requester_email as "requesterEmail",
 requester_context_id as "requesterId",requester_kind as "requesterKind",assigned_to as "assignedTo",version,created_at as "createdAt",updated_at as "updatedAt",source`;
async function event(c: PoolClient, id: string, a: VerifiedActor | null, type: string, details = {}) {
  await c.query('insert into private.support_events(ticket_id,actor_context_id,event_type,details)values($1,$2,$3,$4)', [id, a?.contextId || null, type, JSON.stringify(details)]);
}
async function accessAudit(c: PoolClient, a: VerifiedActor, action: string, id: string) {
  await c.query('insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)values($1,$2,\'customer_service\',$3)', [a.contextId, action, id]);
}
async function recipients(c: PoolClient) {
  return (await c.query(`select m.context_id as id from private.support_memberships m join public.account_contexts x on x.id=m.context_id
   where m.status='active' and x.status='active' union select m.context_id from public.admin_memberships m
   join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'`)).rows.map(r => r.id);
}
async function caseAccess(c: PoolClient, a: VerifiedActor | null, id: string, accessToken?: unknown, operator = false, lock = false) {
  if (operator) await supportOperator(c);
  const item = (await c.query(`select * from private.support_tickets where id=$1 ${lock ? 'for update' : ''}`, [uuid(id)])).rows[0];
  if (!item || (!operator && (a ? item.requester_context_id !== a.contextId : item.requester_context_id !== null || item.guest_token_digest !== tokenDigest(accessToken))))
    throw new ApiError(404, 'This support request is unavailable. Check the reference and private access code.');
  return item;
}
export async function readSupportTicket(c: PoolClient, a: VerifiedActor | null, id: string, accessToken?: unknown, operator = false) {
  await caseAccess(c, a, id, accessToken, operator);
  const item = (await c.query(`select ${ticketSelect} from private.support_tickets where id=$1`, [id])).rows[0];
  item.messages = (await c.query(`select m.id,m.body,m.internal,m.author_name as "authorName",m.author_role as "authorRole",m.created_at as "createdAt"
   ${operator ? ',o.status as "emailStatus"' : ''} from private.support_messages m
   ${operator ? 'left join private.support_email_outbox o on o.message_id=m.id' : ''}
   where m.ticket_id=$1 and (not m.internal or $2) order by m.created_at,m.id`, [id, operator])).rows;
  return item;
}
export async function createSupportTicket(c: PoolClient, a: VerifiedActor | null, body: any) {
  bodyFields(body, ['subject', 'body', 'category', 'type', 'source', 'requestKey', ...(a ? [] : ['name', 'email', 'accessToken', 'website'])]);
  if (body.website) throw new ApiError(400, 'This request could not be submitted.');
  const subject = text(body.subject, 'a subject', 160, 3), message = text(body.body, 'your question or report', 6000, 3), key = uuid(body.requestKey);
  if (/[\r\n]/.test(subject)) throw new ApiError(400, 'Keep the subject on one line.');
  if (typeof body.category !== 'string' || typeof body.type !== 'string' || !Object.hasOwn(SUPPORT_CATEGORIES, body.category) || !Object.hasOwn(SUPPORT_TYPES, body.type)) throw new ApiError(400, 'Choose a request type and topic.');
  const source = text(body.source || '/', 'a page path', 300);
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(source)) throw new ApiError(400, 'Use a page path without private links or query parameters.');
  let name: string, contact: string, guest: string | null = null;
  if (a) {
    const person = (await c.query(`select p.display_name,u.email from public.profiles p join auth.users u on u.id=p.id
     where p.id=$1 and u.email_confirmed_at is not null and not u.is_anonymous and u.deleted_at is null`, [a.authUserId])).rows[0];
    if (!person) throw new ApiError(403, 'Verify your account email before submitting a signed-in request.');
    name = person.display_name; contact = await residentContactEmail(c,a)||person.email;
  } else { name = text(body.name, 'your name', 120); contact = email(body.email); guest = tokenDigest(body.accessToken); }
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`support-request:${a?.contextId || contact}`]);
  const existing = (await c.query(`select t.id,t.guest_token_digest,t.subject,t.type,t.category,t.source,t.requester_name,t.requester_email,m.body
    from private.support_tickets t join private.support_messages m on m.ticket_id=t.id and m.request_key=t.request_key
    where t.requester_context_id is not distinct from $1::uuid and t.request_key=$2`, [a?.contextId || null, key])).rows[0];
  if (existing) {
    if (existing.guest_token_digest !== guest || existing.subject !== subject || existing.body !== message || existing.type !== body.type || existing.category !== body.category || existing.source !== source
      || !a && (existing.requester_name !== name || existing.requester_email !== contact)) throw new ApiError(409, 'This submission key has already been used. Start a new request.');
    return readSupportTicket(c, a, existing.id, body.accessToken);
  }
  if ((await c.query(`select count(*)::int as n from private.support_tickets where created_at>clock_timestamp()-interval'1 hour'
   and (case when $1::uuid is null then requester_context_id is null and lower(requester_email)=$2 else requester_context_id=$1 end)`, [a?.contextId || null, contact])).rows[0].n >= (a ? 20 : 5))
    throw new ApiError(429, 'Too many requests. Follow up on an existing case, or try again later.');
  const item = (await c.query(`insert into private.support_tickets(requester_context_id,requester_kind,requester_name,requester_email,guest_token_digest,
   request_key,type,category,subject,source)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)returning id,reference`,
  [a?.contextId || null, a?.kind || null, name, contact, guest, key, body.type, body.category, subject, source])).rows[0];
  await c.query(`insert into private.support_messages(ticket_id,request_key,author_context_id,author_name,author_role,body)
   values($1,$2,$3,$4,'requester',$5)`, [item.id, key, a?.contextId || null, name, message]);
  await event(c, item.id, a, 'created');
  await notify(c, await recipients(c), { category: 'support', title: `New support request · ${item.reference}`, message: `${body.type === 'question' ? 'Question' : 'Report'}: ${subject}`, sender: a?.contextId, link: `/customer-service?ticket=${item.id}` });
  if (a) await notify(c, [a.contextId], { category: 'support', title: `Request received · ${item.reference}`, message: 'You can track your request and read replies in Help.', link: `/help?ticket=${item.id}` });
  return readSupportTicket(c, a, item.id, body.accessToken);
}
export async function replySupportTicket(c: PoolClient, a: VerifiedActor | null, id: string, body: any, operator = false) {
  bodyFields(body, ['body', 'requestKey', 'version', ...(operator ? ['internal'] : a ? [] : ['accessToken'])]);
  const item = await caseAccess(c, a, id, body.accessToken, operator, true), key = uuid(body.requestKey), message = text(body.body, 'a reply', 6000, 3);
  const internal = operator && body.internal === true;
  if (operator && body.internal !== undefined && typeof body.internal !== 'boolean') throw new ApiError(400, 'Choose a public reply or an internal note.');
  const old = (await c.query('select author_context_id,body,internal from private.support_messages where ticket_id=$1 and request_key=$2', [id, key])).rows[0];
  if (old) {
    if (old.author_context_id !== (a?.contextId || null) || old.body !== message || old.internal !== internal) throw new ApiError(409, 'This reply key has already been used.');
    return readSupportTicket(c, a, id, body.accessToken, operator);
  }
  if (body.version !== item.version) throw new ApiError(409, 'This case changed. Refresh it before sending your reply.');
  if (!operator && ['resolved', 'closed'].includes(item.status)) throw new ApiError(409, 'Reopen this request before adding a reply.');
  const recent = (await c.query(`select count(*)::int as n from private.support_messages where ticket_id=$1 and created_at>clock_timestamp()-interval'1 minute'`, [id])).rows[0].n;
  if (recent >= 20) throw new ApiError(429, 'Please wait before sending more messages.');
  const name = a ? (await c.query('select display_name from public.profiles where id=$1', [a.authUserId])).rows[0].display_name : item.requester_name;
  const reply = (await c.query(`insert into private.support_messages(ticket_id,request_key,author_context_id,author_name,author_role,internal,body)
   values($1,$2,$3,$4,$5,$6,$7)returning id`, [id, key, a?.contextId || null, name, operator ? a?.kind === 'admin' ? 'admin' : 'agent' : 'requester', internal, message])).rows[0];
  await c.query(`update private.support_tickets set version=version+1,updated_at=clock_timestamp(),
   status=case when $2 then status when $3 then 'awaiting_user' else 'open' end where id=$1`, [id, internal, operator]);
  await event(c, id, a, internal ? 'internal_note' : 'reply');
  if (operator && !internal) {
    await c.query(`insert into private.support_email_outbox(message_id,ticket_id,recipient_email,subject,body)values($1,$2,$3,$4,$5)`,
      [reply.id, id, item.requester_email, `PineVela · ${item.reference} · ${item.subject}`,
        `Hello ${item.requester_name},\n\n${message}\n\nPineVela Customer Service\nReference: ${item.reference}\n\nReply through Help in PineVela to keep your case history together. Never share your password, room key, payment PIN or private administrator key.`]);
    if (item.requester_context_id) await notify(c, [item.requester_context_id], { category: 'support', title: `Support replied · ${item.reference}`, message: message.slice(0, 500), sender: a!.contextId, link: `/help?ticket=${id}` });
  } else if (!operator) await notify(c, await recipients(c), { category: 'support', title: `New follow-up · ${item.reference}`, message: item.subject, sender: a?.contextId, link: `/customer-service?ticket=${id}` });
  return readSupportTicket(c, a, id, body.accessToken, operator);
}
export async function updateSupportTicket(c: PoolClient, a: VerifiedActor | null, id: string, body: any, operator = false) {
  bodyFields(body, ['version', 'status', ...(operator ? ['priority', 'assignedTo'] : a ? [] : ['accessToken'])]);
  const item = await caseAccess(c, a, id, body.accessToken, operator, true);
  if (item.version !== body.version) throw new ApiError(409, 'This case changed. Refresh it before updating.');
  if (body.status !== undefined && (typeof body.status !== 'string' || !Object.hasOwn(SUPPORT_STATUSES, body.status))) throw new ApiError(400, 'Choose a supported status.');
  if (!operator && (body.status !== 'open' || !['resolved', 'closed'].includes(item.status))) throw new ApiError(403, 'You can reopen your own resolved or closed request.');
  if (operator && body.priority !== undefined && !['normal', 'high'].includes(body.priority)) throw new ApiError(400, 'Choose normal or high priority.');
  const assigned = body.assignedTo === undefined ? item.assigned_to : body.assignedTo === null ? null : uuid(body.assignedTo);
  if (body.assignedTo !== undefined && assigned && !(await c.query(`select 1 from private.support_memberships m join public.account_contexts x on x.id=m.context_id
    where m.context_id=$1 and m.status='active' and x.status='active'`, [assigned])).rowCount) throw new ApiError(400, 'Choose an active customer-service member.');
  await c.query(`update private.support_tickets set status=$2,priority=$3,assigned_to=$4,version=version+1,updated_at=clock_timestamp() where id=$1`,
    [id, body.status || item.status, body.priority || item.priority, assigned]);
  await event(c, id, a, 'updated', { status: body.status || item.status, priority: body.priority || item.priority, assignedTo: assigned });
  if (operator && item.requester_context_id && body.status && body.status !== item.status) await notify(c, [item.requester_context_id],
    { category: 'support', title: `${item.reference} · ${SUPPORT_STATUSES[body.status as keyof typeof SUPPORT_STATUSES]}`, message: item.subject, sender: a!.contextId, link: `/help?ticket=${id}` });
  return readSupportTicket(c, a, id, body.accessToken, operator);
}

export async function createSupportInvitation(c: PoolClient, a: VerifiedActor, grant: SettingsGrant, body: any) {
  await requireApprovalGrant(c, a, grant);
  const contact = email(body.email), name = text(body.fullName, 'the customer-service member’s name', 120);
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`support-invite:${contact}`]);
  await c.query(`update private.support_invitations set status='cancelled' where email=$1 and status='pending' and expires_at<=clock_timestamp()`, [contact]);
  const subject = (await c.query('select id from auth.users where lower(email)=$1', [contact])).rows;
  if (subject.length > 1 || subject[0] && (await c.query(`select 1 from public.account_contexts c where c.auth_user_id=$1 and (c.kind<>'primary'
   or exists(select 1 from private.support_memberships m where m.context_id=c.id))`, [subject[0].id])).rowCount) throw new ApiError(409, 'Use a separate verified email without another operational or support account.');
  if ((await c.query(`select 1 from private.support_invitations where email=$1 and status='pending'`, [contact])).rowCount) throw new ApiError(409, 'Cancel the existing invitation before issuing another.');
  const token = crypto.randomBytes(32).toString('base64url');
  const invitation = (await c.query(`insert into private.support_invitations(email,full_name,token_digest,issuer_context_id,approval_key_version,reserved_subject_id)
    values($1,$2,$3,$4,$5,$6)returning id,expires_at as "expiresAt"`, [contact, name, digest(token), a.contextId, grant.version, subject[0]?.id || null])).rows[0];
  await accessAudit(c, a, 'customer_service_invited', invitation.id);
  return { ...invitation, invitationToken: token, email: contact, fullName: name };
}
export async function acceptSupportInvitation(c: PoolClient, a: VerifiedActor, token: unknown, accept = true) {
  const hash = tokenDigest(token);
  if (a.kind !== 'primary') throw new ApiError(403, 'Use the invited email’s verified primary account.');
  const invitation = (await c.query(`select i.*,m.status as membership_status from private.support_invitations i
    left join private.support_memberships m on m.invitation_id=i.id where i.token_digest=$1
    and exists(select 1 from auth.users u where u.id=$2 and lower(u.email)=i.email and u.email_confirmed_at is not null
     and not u.is_anonymous and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
     and (i.reserved_subject_id is null or i.reserved_subject_id=u.id))
    and ((i.status='pending' and i.expires_at>clock_timestamp() and private.support_issuer_valid(i))
     or(i.status='accepted' and i.accepted_context_id=$3)) for update of i`, [hash, a.authUserId, a.contextId])).rows[0];
  if (!invitation) throw new ApiError(403, 'This invitation is unavailable for your verified email, or has expired or been cancelled.');
  if (!accept) return { fullName: invitation.full_name, email: invitation.email, expiresAt: invitation.expires_at, status: invitation.status, membershipStatus: invitation.membership_status };
  if (invitation.status === 'accepted') return { success: true, accessAvailable: invitation.membership_status === 'active' };
  await c.query("select set_config('pinevela.support_invitation_digest',$1,true)", [hash]);
  await c.query('insert into private.support_memberships(context_id,invitation_id)values($1,$2)', [a.contextId, invitation.id]);
  await c.query(`update private.support_invitations set status='accepted',accepted_context_id=$2,accepted_at=clock_timestamp() where id=$1`, [invitation.id, a.contextId]);
  await accessAudit(c, a, 'customer_service_invitation_accepted', invitation.id);
  await notify(c, [a.contextId], { category: 'support', title: 'Customer-service access activated', message: 'Your invited customer-service workspace is ready.', link: '/customer-service' });
  return { success: true, accessAvailable: true };
}

export function installSupport(app: Express, auth: SupabaseAuth) {
  const db = auth.db, budgets = new AttemptBudgets();
  const guard: RequestHandler = (req, _res, next) => { try { checkProfileContext((req as AuthRequest).actor, req.headers['x-pinevela-profile-context']); next(); } catch (e) { next(e); } };
  const budget = (req: AuthRequest, scope: string, maximum = 30) => budgets.reserve([{ scope, identity: req.actor?.contextId || req.ip || req.socket.remoteAddress || '', maximum, windowMs: 600000 }]);
  let sending: Promise<unknown> | undefined, stopping = false;
  const flush = () => { if (stopping) return Promise.resolve(); if (!sending) sending = deliverSupportEmail(db).catch(() => {}).finally(() => { sending = undefined; }); return sending; };
  const timer = setInterval(() => void flush(), 30000); timer.unref();
  app.locals.closeSupport = async () => { stopping = true; clearInterval(timer); await sending; };

  app.post('/api/public/support/tickets', route(async (req, res) => { budget(req, 'guest-support-create', 6); return res.status(201).json(await db.availableSystem(c => createSupportTicket(c, null, req.body))); }));
  app.post('/api/public/support/tickets/:id/read', route(async (req, res) => { bodyFields(req.body, ['accessToken']); budget(req, 'guest-support-read', 60); return res.json(await db.availableSystem(c => readSupportTicket(c, null, req.params.id, req.body.accessToken))); }));
  app.post('/api/public/support/tickets/:id/replies', route(async (req, res) => { budget(req, 'guest-support-reply'); return res.json(await db.availableSystem(c => replySupportTicket(c, null, req.params.id, req.body))); }));
  app.patch('/api/public/support/tickets/:id', route(async (req, res) => { budget(req, 'guest-support-update'); return res.json(await db.availableSystem(c => updateSupportTicket(c, null, req.params.id, req.body))); }));

  app.get('/api/support/tickets', auth.require(), guard, route(async (req, res) => {
    if (Object.keys(req.query).length) throw new ApiError(400, 'Account requests do not accept identity or queue filters.');
    return res.json(await db.readActor(req.actor, c => c.query(`select ${ticketSelect} from private.support_tickets where requester_context_id=$1 order by updated_at desc,id limit 100`, [req.actor.contextId]).then(r => r.rows)));
  }));
  app.post('/api/support/tickets', auth.require(), guard, route(async (req, res) => { budget(req, 'support-create'); return res.status(201).json(await db.authorizedSystem(req.actor, [req.actor.kind], c => createSupportTicket(c, req.actor, req.body))); }));
  app.get('/api/support/tickets/:id', auth.require(), guard, route(async (req, res) => res.json(await db.authorizedRead(req.actor, [req.actor.kind], c => readSupportTicket(c, req.actor, req.params.id)))));
  app.post('/api/support/tickets/:id/replies', auth.require(), guard, route(async (req, res) => { budget(req, 'support-reply'); return res.json(await db.authorizedSystem(req.actor, [req.actor.kind], c => replySupportTicket(c, req.actor, req.params.id, req.body))); }));
  app.patch('/api/support/tickets/:id', auth.require(), guard, route(async (req, res) => res.json(await db.authorizedSystem(req.actor, [req.actor.kind], c => updateSupportTicket(c, req.actor, req.params.id, req.body)))));

  app.get('/api/customer-service/tickets', auth.require(['primary', 'admin']), guard, route(async (req, res) => {
    if (Object.keys(req.query).some(k => !['status', 'category', 'search', 'page'].includes(k))) throw new ApiError(400, 'Unsupported queue filter.');
    const status = req.query.status || '', category = req.query.category || '', search = req.query.search || '', page = Number(req.query.page || 0);
    if (typeof search !== 'string' || search.length > 120 || typeof status !== 'string' || typeof category !== 'string' || status && !Object.hasOwn(SUPPORT_STATUSES, status) || category && !Object.hasOwn(SUPPORT_CATEGORIES, category) || !Number.isSafeInteger(page) || page < 0 || page > 10000) throw new ApiError(400, 'Choose valid filters.');
    return res.json(await db.authorizedRead(req.actor, ['primary', 'admin'], async c => {
      await supportOperator(c);
      const rows = (await c.query(`select ${ticketSelect} from private.support_tickets where ($1='' or status=$1)and($2='' or category=$2)
       and($3='' or position(lower($3) in lower(reference||' '||subject||' '||requester_name||' '||requester_email||' '||coalesce(requester_context_id::text,'')))>0)
       order by updated_at desc,id limit 26 offset $4`, [status, category, search, page * 25])).rows;
      const members = (await c.query(`select m.context_id as id,p.display_name as name from private.support_memberships m join public.account_contexts x on x.id=m.context_id
       join public.profiles p on p.id=x.auth_user_id where m.status='active' and x.status='active' order by p.display_name`)).rows;
      return { tickets: rows.slice(0, 25), hasMore: rows.length > 25, members, emailConfigured: !!supportMailConfiguration() };
    }));
  }));
  app.get('/api/customer-service/tickets/:id', auth.require(['primary', 'admin']), guard, route(async (req, res) => res.json(await db.authorizedRead(req.actor, ['primary', 'admin'], c => readSupportTicket(c, req.actor, req.params.id, undefined, true)))));
  app.post('/api/customer-service/tickets/:id/replies', auth.require(['primary', 'admin']), guard, route(async (req, res) => { budget(req, 'agent-reply', 100); const item = await db.authorizedSystem(req.actor, ['primary', 'admin'], c => replySupportTicket(c, req.actor, req.params.id, req.body, true)); void flush(); return res.json(item); }));
  app.patch('/api/customer-service/tickets/:id', auth.require(['primary', 'admin']), guard, route(async (req, res) => res.json(await db.authorizedSystem(req.actor, ['primary', 'admin'], c => updateSupportTicket(c, req.actor, req.params.id, req.body, true)))));
  app.post('/api/customer-service/tickets/:id/retry-email', auth.require(['primary', 'admin']), guard, route(async (req, res) => {
    bodyFields(req.body, []); budget(req, 'support-email-retry', 20);
    await db.authorizedSystem(req.actor, ['primary', 'admin'], async c => { await caseAccess(c, req.actor, req.params.id, undefined, true, true);
      await c.query(`update private.support_email_outbox set status='queued',attempts=0,available_at=clock_timestamp(),last_error=null where ticket_id=$1 and status='failed'`, [req.params.id]); });
    void flush(); return res.json({ success: true });
  }));

  const grant = async (a: VerifiedActor, key: unknown) => { budgets.reserve([{ scope: 'support-admin-key', identity: a.contextId, maximum: 20, windowMs: 60000 }]); const g = await db.authorizedSystem(a, ['admin'], c => checkApprovalKey(c, a, key)); deniedApprovalKey(g); return g; };
  app.get('/api/admin/customer-service', auth.require(['admin']), guard, route(async (req, res) => res.json(await db.authorizedRead(req.actor, ['admin'], async c => ({
    invitations: (await c.query(`select id,email,full_name as "fullName",status,expires_at as "expiresAt",created_at as "createdAt" from private.support_invitations order by created_at desc limit 100`)).rows,
    members: (await c.query(`select m.context_id as id,m.status,p.display_name as name,p.email from private.support_memberships m join public.account_contexts x on x.id=m.context_id join public.profiles p on p.id=x.auth_user_id order by m.created_at`)).rows,
  })))));
  app.post('/api/admin/customer-service/invitations', auth.require(['admin']), guard, route(async (req, res) => { bodyFields(req.body, ['email', 'fullName', 'privateKey']); const g = await grant(req.actor, req.body.privateKey); return res.status(201).json(await db.authorizedSystem(req.actor, ['admin'], c => createSupportInvitation(c, req.actor, g, req.body))); }));
  app.post('/api/admin/customer-service/invitations/:id/cancel', auth.require(['admin']), guard, route(async (req, res) => {
    bodyFields(req.body, ['privateKey']); const g = await grant(req.actor, req.body.privateKey);
    await db.authorizedSystem(req.actor, ['admin'], async c => { await requireApprovalGrant(c, req.actor, g); if (!(await c.query(`update private.support_invitations set status='cancelled' where id=$1 and status='pending'`, [uuid(req.params.id)])).rowCount) throw new ApiError(409, 'This invitation is no longer pending.'); await accessAudit(c, req.actor, 'customer_service_invitation_cancelled', req.params.id); }); return res.json({ success: true });
  }));
  app.patch('/api/admin/customer-service/members/:id', auth.require(['admin']), guard, route(async (req, res) => {
    bodyFields(req.body, ['status', 'privateKey']); if (!['active', 'suspended'].includes(req.body.status)) throw new ApiError(400, 'Choose active or suspended.'); const g = await grant(req.actor, req.body.privateKey);
    await db.authorizedSystem(req.actor, ['admin'], async c => { await requireApprovalGrant(c, req.actor, g); if (!(await c.query('update private.support_memberships set status=$2,updated_at=clock_timestamp() where context_id=$1', [uuid(req.params.id), req.body.status])).rowCount) throw new ApiError(404, 'Customer-service member not found.'); await accessAudit(c, req.actor, `customer_service_${req.body.status}`, req.params.id); }); return res.json({ success: true });
  }));
  for (const action of ['inspect', 'accept']) app.post(`/api/auth/support-invitation/${action}`, auth.require(['primary']), guard, route(async (req, res) => { bodyFields(req.body, ['invitationToken']); budget(req, 'support-invitation', 20); return res.json(await db.authorizedSystem(req.actor, ['primary'], c => acceptSupportInvitation(c, req.actor, req.body.invitationToken, action === 'accept'))); }));
}
