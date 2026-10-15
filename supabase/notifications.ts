import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, uuid, type VerifiedActor } from './db.js';
import { SupabaseAuth, type AuthRequest } from './auth.js';
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler => (req, res, next) => { work(req as AuthRequest, res).catch(next); };

/** Call within the same authorized transaction that changes the workflow state. */
export async function notify(client: PoolClient, recipients: string[], notice: { category: string; title: string; message: string; sender?: string; link?: string; adminMessageType?: string }) {
  const ids = [...new Set(recipients)];
  if (!ids.length) return;
  const { rows: [record] } = await client.query(`insert into public.notifications(sender_context_id,category,title,message,link,admin_message_type)
    values ($1,$2,$3,$4,$5,$6) returning id`, [notice.sender || null, notice.category, notice.title, notice.message, notice.link || null, notice.adminMessageType || null]);
  await client.query('insert into public.notification_recipients(notification_id,context_id) select $1,unnest($2::uuid[])', [record.id, ids]);
  await client.query("select pg_notify('pinevela_notifications',id::text) from unnest($1::uuid[]) id", [ids]);
  return record.id;
}
export async function notifyPrimaryOwner(client: PoolClient, applicantContext: string, notice: Parameters<typeof notify>[2]) {
  const { rows } = await client.query(`select primary_context.id from public.account_contexts applicant
    join public.account_contexts primary_context on primary_context.auth_user_id = coalesce(applicant.primary_owner_id, applicant.auth_user_id)
    and primary_context.kind = 'primary' and primary_context.status = 'active' where applicant.id = $1`, [applicantContext]);
  return notify(client, rows.map(r => r.id), notice);
}
export async function readNotifications(client: PoolClient, actor: VerifiedActor, market = false) {
  const rows = (await client.query(`select n.*, r.read_at, r.popup_acknowledged_at from public.notifications n
    join public.notification_recipients r on r.notification_id=n.id where r.context_id=$1
    and ($2::boolean=false or n.category like 'market%' or n.category='admin_message') order by n.created_at desc,n.id limit 500`, [actor.contextId, market])).rows;
  return rows.map(n => ({ id: n.id, title: n.title, message: n.message, type: n.admin_message_type || n.category, category: n.category,
    date: n.created_at, read: n.read_at !== null, link: n.link, adminMessage: n.category === 'admin_message',
    module: ['admin_settings','admin_governance'].includes(n.category) ? n.category : undefined,
    marketChat:n.category==='market_message',messageId:n.market_message_id || n.id,marketRatingId:n.market_review_id || undefined }));
}
export async function pendingMessages(client: PoolClient, actor: VerifiedActor) {
  return (await client.query(`select n.id,n.title,n.message,n.admin_message_type as type,n.created_at as date from public.notifications n
    join public.notification_recipients r on r.notification_id=n.id where r.context_id=$1
    and n.category='admin_message' and r.popup_acknowledged_at is null order by n.created_at,n.id limit 100`, [actor.contextId])).rows;
}
export async function acknowledgeMessage(client: PoolClient, actor: VerifiedActor, id: string) {
  const changed = await client.query(`update public.notification_recipients r set popup_acknowledged_at=coalesce(r.popup_acknowledged_at,now())
    where notification_id=$1 and context_id=$2 and exists(select 1 from public.notifications n where n.id=r.notification_id and n.category='admin_message')`, [uuid(id), actor.contextId]);
  if (!changed.rowCount) throw new ApiError(404, 'Message not found.');
  return { success: true };
}
export function installNotifications(app: Express, auth: SupabaseAuth) {
  const db = auth.db;
  app.get('/api/notifications', auth.require(), route(async (req, res) => {
    const market = ['market','seller','merchant','ecommerce'].includes(String(req.query.scope || req.query.category || ''));
    return res.json(await db.readActor(req.actor, client => readNotifications(client, req.actor, market)));
  }));
  app.put('/api/notifications/read-all', auth.require(), route(async (req, res) => {
    await db.actor(req.actor, client => client.query('update public.notification_recipients set read_at = coalesce(read_at,now()) where context_id = $1', [req.actor.contextId]));
    return res.json({ success: true });
  }));
  app.put('/api/notifications/:id/read', auth.require(), route(async (req, res) => {
    const changed = await db.actor(req.actor, client => client.query('update public.notification_recipients set read_at = coalesce(read_at,now()) where notification_id = $1 and context_id = $2', [uuid(req.params.id), req.actor.contextId]));
    if (!changed.rowCount) throw new ApiError(404, 'Notification not found.'); return res.json({ success: true });
  }));
  app.get('/api/admin-messages/pending', auth.require(), route(async (req, res) => {
    if (req.headers['x-pinevela-account-context'] !== undefined && req.headers['x-pinevela-account-context'] !== req.actor.contextId) throw new ApiError(409,'Your active account changed.');
    return res.json(await db.readActor(req.actor, client => pendingMessages(client, req.actor)));
  }));
  app.post('/api/admin-messages/:id/ack', auth.require(), route(async (req, res) => {
    if (req.headers['x-pinevela-account-context'] !== undefined && req.headers['x-pinevela-account-context'] !== req.actor.contextId) throw new ApiError(409,'Your active account changed.');
    return res.json(await db.actor(req.actor, client => acknowledgeMessage(client, req.actor, req.params.id)));
  }));
}
