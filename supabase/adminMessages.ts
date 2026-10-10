import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { requireAdministrator } from './adminSettings.js';
import { notify } from './notifications.js';

const groups: Record<string, string> = { managers: 'manager', residents: 'resident', users: 'primary', marketers: 'seller', staff: 'staff' };
const roles: Record<string, string> = { manager: 'manager', student: 'resident', resident: 'resident', user: 'primary', merchant: 'seller', staff: 'staff' };
const displayRoles: Record<string, string> = { primary: 'user', resident: 'student', manager: 'manager', seller: 'merchant', staff: 'staff' };
const digest = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { work(req as AuthRequest, res).catch(next); };

export function checkMessageContext(actor: VerifiedActor, expected: unknown) {
  if (expected !== undefined && expected !== actor.contextId) throw new ApiError(409, 'Your active account changed. Reopen the message gateway.');
}
function fields(body: any, allowed: string[]) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k)))
    throw new ApiError(400, 'Invalid message request.');
}
function selection(body: any) {
  if (!Array.isArray(body.groups) || body.groups.length > 5 || body.groups.some((g: unknown) => typeof g !== 'string' || !Object.hasOwn(groups, g)) ||
      !Array.isArray(body.accounts) || body.accounts.length > 2000) throw new ApiError(400, 'Choose supported recipient groups or specific accounts.');
  const selected = body.accounts.map((a: any) => {
    fields(a, ['id', 'role']);
    if (typeof a.role !== 'string' || !Object.hasOwn(roles, a.role)) throw new ApiError(400, 'Unsupported recipient account type.');
    return [roles[a.role], uuid(a.id).toLowerCase()];
  });
  return { kinds: [...new Set<string>(body.groups.map((g: string) => groups[g]))].sort(),
    selected: [...new Map<string, string[]>(selected.map((a: string[]) => [JSON.stringify(a), a])).values()].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) };
}
export async function messageAccounts(c: PoolClient, a: VerifiedActor) {
  await requireAdministrator(c, a);
  return (await c.query(`select x.id,x.kind,p.display_name as name,p.email from public.account_contexts x
    join public.profiles p on p.id=x.auth_user_id where x.status='active' and x.kind=any($1::text[])
    order by x.kind,x.id`, [Object.values(groups)])).rows.map(r => ({ id: r.id, role: displayRoles[r.kind], name: r.name, email: r.email }));
}
async function recipients(c: PoolClient, a: VerifiedActor, chosen: ReturnType<typeof selection>, lock = false) {
  await requireAdministrator(c, a);
  const rows = (await c.query(`select id,kind from public.account_contexts where status='active' and kind=any($1::text[])
    order by id ${lock ? 'for share' : ''}`, [Object.values(groups)])).rows;
  for (const [kind, id] of chosen.selected) if (!rows.some(r => r.id === id && r.kind === kind))
    throw new ApiError(409, 'A selected account is no longer available. Refresh the recipient list.');
  const result = rows.filter(r => chosen.kinds.includes(r.kind) || chosen.selected.some(([kind, id]) => kind === r.kind && id === r.id));
  if (!result.length || result.length > 2000) throw new ApiError(400, 'Choose between 1 and 2000 actual recipient accounts.');
  const counts: Record<string, number> = {};
  for (const r of result) counts[displayRoles[r.kind]] = (counts[displayRoles[r.kind]] || 0) + 1;
  return { ids: result.map(r => r.id), counts };
}
export async function previewMessage(c: PoolClient, a: VerifiedActor, body: any) {
  fields(body, ['groups', 'accounts']);
  const chosen = selection(body), targets = await recipients(c, a, chosen);
  const row = (await c.query(`insert into private.admin_message_deliveries(sender_context_id,selection_digest,recipient_context_ids,recipient_counts)
    values($1,$2,$3,$4) returning id,expires_at`, [a.contextId, digest(chosen), targets.ids, targets.counts])).rows[0];
  return { fingerprint: row.id, count: targets.ids.length, counts: targets.counts, expiresAt: row.expires_at };
}
export async function sendMessage(c: PoolClient, a: VerifiedActor, body: any) {
  fields(body, ['groups', 'accounts', 'title', 'message', 'type', 'fingerprint']);
  await requireAdministrator(c, a);
  const chosen = selection(body);
  if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 120 || typeof body.message !== 'string' || !body.message.trim() || body.message.length > 4000 ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body.title + body.message) || !['info', 'success', 'warning', 'error'].includes(body.type ?? 'info'))
    throw new ApiError(400, 'Enter a title up to 120 characters, a message up to 4000 characters and a supported message type.');
  const token = uuid(body.fingerprint), title = body.title.trim(), message = body.message.trim(), type = body.type ?? 'info';
  const content = digest([title, message, type]);
  const row = (await c.query(`select *,expires_at<=clock_timestamp() as expired from private.admin_message_deliveries
    where id=$1 and sender_context_id=$2 for update`, [token, a.contextId])).rows[0];
  if (!row || row.selection_digest !== digest(chosen)) throw new ApiError(409, 'Review this recipient selection before sending.');
  if (row.notification_id) {
    if (row.content_digest !== content) throw new ApiError(409, 'This preview has already sent a different announcement.');
    return { success: true, batchId: row.id, count: row.recipient_context_ids.length, counts: row.recipient_counts, sentAt: row.completed_at };
  }
  if (row.expired) throw new ApiError(409, 'The recipient preview expired. Review a fresh preview.');
  const targets = await recipients(c, a, chosen, true);
  if (JSON.stringify(targets.ids) !== JSON.stringify(row.recipient_context_ids)) throw new ApiError(409, 'The recipient selection changed. Review a fresh preview.');
  const notificationId = await notify(c, targets.ids, { category: 'admin_message', title, message, sender: a.contextId, adminMessageType: type });
  const saved = (await c.query(`update private.admin_message_deliveries set notification_id=$2,content_digest=$3,completed_at=clock_timestamp()
    where id=$1 returning completed_at`, [row.id, notificationId, content])).rows[0];
  await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values($1,'admin_message_sent','notification',$2,jsonb_build_object('batchId',$3::text,'count',$4::integer))`, [a.contextId, notificationId, row.id, targets.ids.length]);
  return { success: true, batchId: row.id, count: targets.ids.length, counts: targets.counts, sentAt: saved.completed_at };
}
export function installAdminMessages(app: Express, auth: SupabaseAuth) {
  const run = (req: AuthRequest, work: (c: PoolClient) => Promise<unknown>) => {
    checkMessageContext(req.actor, req.headers['x-pinevela-account-context']);
    return auth.db.authorizedSystem(req.actor, ['admin'], work);
  };
  app.get('/api/admin/messages/accounts', auth.require(['admin']), route(async (req, res) => res.json(await run(req, c => messageAccounts(c, req.actor)))));
  app.post('/api/admin/messages/preview', auth.require(['admin']), route(async (req, res) => res.json(await run(req, c => previewMessage(c, req.actor, req.body)))));
  app.post('/api/admin/messages', auth.require(['admin']), route(async (req, res) => res.json(await run(req, c => sendMessage(c, req.actor, req.body)))));
}
