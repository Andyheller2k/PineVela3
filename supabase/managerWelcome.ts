import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError, type VerifiedActor } from './db.js';
import type { AuthRequest, SupabaseAuth } from './auth.js';
import { notify } from './notifications.js';

const CATEGORY = 'manager_welcome';
const TITLE = 'Welcome to PineVela Manager';
const MESSAGE = 'Your manager portal is ready. If your residence setup is pending, open Register Property to complete it. Approved properties unlock management tools.';
const route = (work: (req: AuthRequest, res: any) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { work(req as AuthRequest, res).catch(next); };

/** Idempotent for the live manager context, including concurrent first visits. */
export async function ensureManagerWelcome(client: PoolClient, actor: VerifiedActor) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Manager account required.');
  await client.query("select pg_advisory_xact_lock(hashtextextended('manager-welcome:' || $1::text,0))", [actor.contextId]);
  const existing = (await client.query(`select n.id,r.popup_acknowledged_at from public.notifications n
    join public.notification_recipients r on r.notification_id=n.id
    where r.context_id=$1 and n.category=$2 and n.title=$3 order by n.created_at limit 1`,
    [actor.contextId, CATEGORY, TITLE])).rows[0];
  if (existing) return { show: existing.popup_acknowledged_at === null, notificationId: existing.id, created: false };
  const notificationId = await notify(client, [actor.contextId], {
    category: CATEGORY, title: TITLE, message: MESSAGE, sender: actor.contextId, link: '/manager/dashboard',
  });
  return { show: true, notificationId, created: true };
}

export async function acknowledgeManagerWelcome(client: PoolClient, actor: VerifiedActor) {
  if (actor.kind !== 'manager') throw new ApiError(403, 'Manager account required.');
  const changed = await client.query(`update public.notification_recipients r
    set popup_acknowledged_at=coalesce(r.popup_acknowledged_at,now())
    from public.notifications n where r.notification_id=n.id and r.context_id=$1
      and n.category=$2 and n.title=$3 returning n.id`, [actor.contextId, CATEGORY, TITLE]);
  if (!changed.rowCount) throw new ApiError(404, 'Manager welcome message not found.');
  return { success: true };
}

export function installManagerWelcome(app: Express, auth: SupabaseAuth) {
  app.post('/api/manager/welcome/ensure', auth.require(['manager']), route(async (req, res) => {
    res.json(await auth.db.authorizedSystem(req.actor, ['manager'], client => ensureManagerWelcome(client, req.actor)));
  }));
  app.put('/api/manager/welcome/ack', auth.require(['manager']), route(async (req, res) => {
    res.json(await auth.db.authorizedSystem(req.actor, ['manager'], client => acknowledgeManagerWelcome(client, req.actor)));
  }));
}
