import type { Express,Request,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { hashCredentialAsync,verifyCredentialAsync } from '../accountSecurity.js';
import { notify } from './notifications.js';
import { checkAdministratorSettingsKey, deniedKey, requireSettingsGrant, settingsEvent, type SettingsGrant } from './adminSettings.js';
import { notifyPrimaryOwner } from './notifications.js';
import { managerAuthorizationCode } from './activationCodes.js';
const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => { work(req as AuthRequest,res).catch(next); };
export const managerKeyError = () => new ApiError(403,'Enter your current manager secret key to authorize this action.','manager_key_required');
export function managerKeyNeeded(req:Pick<Request,'method'|'path'>) {
  const path = req.path.replace(/\/+$/,'');
  return !['GET','HEAD','OPTIONS'].includes(req.method) &&
    !['/api/manager/secret-key/issue','/api/manager/secret-key/petition','/api/auth/context','/api/auth/logout',
      '/api/auth/appearance','/api/auth/maintenance-notice/dismiss',
      // This endpoint can record only the live account's own current agreement.
      // It must be available before the manager dashboard/key prompt mounts.
      '/api/legal/accept',
      // Avatar media and the manager-only avatar save stay bound to the live
      // Auth identity. The general profile route still protects contact edits.
      '/api/storage/upload-profile-image','/api/auth/profile/avatar',
      // Inbox read receipts are scoped to the authenticated recipient. Visible
      // alerts mark themselves read, so challenging them queues key dialogs.
      '/api/notifications/read-all'].includes(path) && !/^\/api\/admin-messages\/[^/]+\/ack$/.test(path)
    && !/^\/api\/notifications\/[^/]+\/read$/.test(path)
    && !['/api/manager/welcome/ensure','/api/manager/welcome/ack'].includes(path)
    && !/^\/api\/support\/tickets(?:\/[^/]+(?:\/replies)?)?$/.test(path)
    && path !== '/api/reports';
}
export async function managerBootstrapAllowed(client:PoolClient,actor:VerifiedActor,path:string) {
  if (actor.kind !== 'manager' || !['/api/hostels/register','/api/storage/upload-hostel-image','/api/hostel-verifications/submit'].includes(path.replace(/\/+$/,''))) return false;
  return !(await client.query('select id from public.manager_assignments where manager_context_id = $1 and ended_at is null',[actor.contextId])).rowCount;
}
export async function managerKeyStatus(client:PoolClient,actor:VerifiedActor) {
  if (actor.kind !== 'manager') throw new ApiError(403,'Manager account required.');
  const assigned = await client.query('select id from public.manager_assignments where manager_context_id = $1 and ended_at is null',[actor.contextId]);
  const key = (await client.query('select key_hash from private.manager_operation_keys where manager_context_id = $1',[actor.contextId])).rows[0];
  const active=(await client.query("select id from public.account_contexts where id=$1 and kind='manager' and status='active'",[actor.contextId])).rowCount;
  return {available:Boolean(active),hasResidence:Boolean(assigned.rowCount),issueRequired:!key?.key_hash};
}
export async function issueManagerKey(client:PoolClient,actor:VerifiedActor) {
  const status = await managerKeyStatus(client,actor);
  if (!status.available) throw new ApiError(409,'An active verified manager portal is required.');
  await client.query('insert into private.manager_operation_keys(manager_context_id) values ($1) on conflict do nothing',[actor.contextId]);
  const current = (await client.query('select key_hash from private.manager_operation_keys where manager_context_id = $1 for update',[actor.contextId])).rows[0];
  if (current.key_hash) throw new ApiError(409,'Your key has already been shown. Petition the admin board if it was lost.');
  const key = managerAuthorizationCode();
  await client.query('update private.manager_operation_keys set key_hash = $2,issued_at = now() where manager_context_id = $1',[actor.contextId,await hashCredentialAsync(key)]);
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values ($1,'manager_secret_key_issued','account_context',$1)`,[actor.contextId]);
  return {key};
}
/** Self-service rotation requires a live proof of this manager's existing key.
 * The native hash/version trigger invalidates stale proofs atomically. */
export async function rotateManagerKey(client:PoolClient,actor:VerifiedActor) {
  if (actor.kind !== 'manager' || actor.managerKeyVersion === undefined) throw managerKeyError();
  // A concurrent request may already hold the shared version proof. Refuse a
  // second rotation rather than deadlocking while both upgrade that row lock.
  if (!(await client.query("select pg_try_advisory_xact_lock(hashtextextended('pinevela-manager-code-rotation:' || $1::text,0)) as allowed",[actor.contextId])).rows[0].allowed)
    throw new ApiError(409,'A manager code change is already in progress. Please retry.');
  await requireManagerKeyGrant(client,actor);
  const current=(await client.query('select key_hash from private.manager_operation_keys where manager_context_id=$1 for update',[actor.contextId])).rows[0];
  if (!current?.key_hash) throw managerKeyError();
  let key: string;
  do { key=managerAuthorizationCode(); } while (await verifyCredentialAsync(key,current.key_hash));
  await client.query('update private.manager_operation_keys set key_hash=$2,issued_at=clock_timestamp() where manager_context_id=$1',[actor.contextId,await hashCredentialAsync(key)]);
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values($1,'manager_secret_key_rotated','account_context',$1)`,[actor.contextId]);
  await notify(client,[actor.contextId],{category:'verification',title:'Manager authorization code changed',
    message:'Your previous manager key no longer works. Keep your new six-digit authorization code private.',sender:actor.contextId,link:'settings'});
  return {key};
}
/** A denial returns rather than throws so failed guesses commit before the HTTP
 * error. Never place the raw key in a session, audit event or notification. */
export async function checkManagerKey(client:PoolClient,actor:VerifiedActor,value:unknown):Promise<{allowed:boolean;version?:string;locked?:boolean}> {
  if (actor.kind !== 'manager') throw new ApiError(403,'Manager account required.');
  const key = (await client.query('select * from private.manager_operation_keys where manager_context_id = $1 for update',[actor.contextId])).rows[0];
  if (!key?.key_hash) return {allowed:false};
  if (key.locked_until && new Date(key.locked_until).getTime() > Date.now()) return {allowed:false,locked:true};
  if (typeof value !== 'string' || !value) return {allowed:false};
  const valid = value.length <= 128 && await verifyCredentialAsync(value,key.key_hash);
  if (!valid) {
    await client.query(`update private.manager_operation_keys set
      failed_attempts = case when locked_until <= clock_timestamp() then 1 else least(failed_attempts + 1,5) end,
      locked_until = case when (case when locked_until <= clock_timestamp() then 0 else failed_attempts end) >= 4
        then clock_timestamp() + interval '15 minutes' else null end where manager_context_id = $1`,[actor.contextId]);
    return {allowed:false};
  }
  await client.query('update private.manager_operation_keys set failed_attempts = 0,locked_until = null where manager_context_id = $1',[actor.contextId]);
  return {allowed:true,version:String(key.version)};
}
export async function requireManagerKeyGrant(client:PoolClient,actor:VerifiedActor) {
  if (actor.kind !== 'manager' || actor.managerKeyVersion === undefined) return;
  const key = await client.query(`select manager_context_id from private.manager_operation_keys where manager_context_id = $1
    and key_hash is not null and version = $2 and (locked_until is null or locked_until <= clock_timestamp()) for share`,[actor.contextId,actor.managerKeyVersion]);
  if (!key.rowCount) throw managerKeyError();
}
export async function petitionManagerKey(client:PoolClient,actor:VerifiedActor,reason:unknown) {
  if (typeof reason !== 'string' || !reason.trim() || reason.trim().length > 2000) throw new ApiError(400,'Explain why you need a new key, up to 2,000 characters.');
  if (!(await managerKeyStatus(client,actor)).available) throw new ApiError(409,'An active verified manager portal is required.');
  const pending = await client.query("select id from private.manager_key_petitions where manager_context_id = $1 and status = 'pending'",[actor.contextId]);
  if (pending.rowCount) throw new ApiError(409,'A key-reset petition is already pending.');
  const item = (await client.query(`insert into private.manager_key_petitions(manager_context_id,reason) values ($1,$2)
    returning id,manager_context_id as "managerId",reason,'Pending' as status,created_at as "createdAt"`,[actor.contextId,reason.trim()])).rows[0];
  const admins = (await client.query(`select c.id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id
    where c.kind = 'admin' and c.status = 'active' and m.status = 'active'`)).rows.map(row => row.id);
  await notify(client,admins,{category:'admin_governance',title:'Manager Secret-Key Reset Requested',
    message:'A manager submitted a secret-key recovery petition for administrator review.',sender:actor.contextId,link:'residence_changes'});
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id)
    values ($1,'manager_secret_key_reset_requested','manager_key_petition',$2)`,[actor.contextId,item.id]);
  return item;
}
export async function resetManagerKey(client:PoolClient,actor:VerifiedActor,managerId:string,grant:SettingsGrant) {
  await requireSettingsGrant(client,actor,grant);
  const manager=(await client.query(`select c.id from public.account_contexts c where c.id=$1 and c.kind='manager'
    and c.status='active'
    for share of c`,[managerId])).rows[0];
  if(!manager)throw new ApiError(404,'Active manager not found.');
  await client.query('insert into private.manager_operation_keys(manager_context_id) values($1) on conflict do nothing',[managerId]);
  await client.query('update private.manager_operation_keys set key_hash=null,issued_at=null,failed_attempts=0,locked_until=null where manager_context_id=$1',[managerId]);
  await client.query("update private.manager_key_petitions set status='approved',decided_at=clock_timestamp(),decided_by_context_id=$2 where manager_context_id=$1 and status='pending'",[managerId,actor.contextId]);
  const notice={category:'verification',title:'Manager secret key reset',message:'Your previous manager key is invalid. Generate and privately save its replacement from your manager account.',sender:actor.contextId,link:'/manager/dashboard'};
  await notify(client,[managerId],notice);await notifyPrimaryOwner(client,managerId,notice);
  await settingsEvent(client,actor,'manager_secret_key_reset','Manager secret key reset','A manager’s operation key was invalidated through keyed administrator recovery.');
  return {success:true};
}
export function installManagerKeys(app:Express,auth:SupabaseAuth) {
  app.post('/api/admin/managers/:id/reset-request-key',auth.require(['admin']),route(async(req,res)=>{
    if(!req.body || Array.isArray(req.body) || Object.keys(req.body).some(k=>k!=='settingsKey'))throw new ApiError(400,'Only your settings key is accepted.');
    const grant=await auth.db.authorizedSystem(req.actor,['admin'],c=>checkAdministratorSettingsKey(c,req.actor,req.body.settingsKey));deniedKey(grant);
    return res.json(await auth.db.authorizedSystem(req.actor,['admin'],c=>resetManagerKey(c,req.actor,uuid(req.params.id),grant)));
  }));
  app.get('/api/manager/secret-key',auth.require(['manager']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['manager'],c => managerKeyStatus(c,req.actor)))));
  app.post('/api/manager/secret-key/issue',auth.require(['manager']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['manager'],c => issueManagerKey(c,req.actor)))));
  app.post('/api/manager/secret-key/rotate',auth.require(['manager']),route(async (req,res) => {
    if(req.body && (Array.isArray(req.body) || Object.keys(req.body).length)) throw new ApiError(400,'No manager identity or code may be supplied in the request body.');
    return res.json(await auth.db.authorizedSystem(req.actor,['manager'],c => rotateManagerKey(c,req.actor)));
  }));
  app.post('/api/manager/secret-key/petition',auth.require(['manager']),route(async (req,res) => {
    try { return res.status(201).json(await auth.db.authorizedSystem(req.actor,['manager'],c => petitionManagerKey(c,req.actor,req.body?.reason))); }
    catch (error) { if ((error as any)?.code === '23505') throw new ApiError(409,'A key-reset petition is already pending.'); throw error; }
  }));
  app.get('/api/admin/manager-key-petitions',auth.require(['admin']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin'],async c =>
    (await c.query(`select k.id,k.manager_context_id as "managerId",p.display_name as "managerName",k.reason,initcap(k.status) as status,
      k.created_at as "createdAt",k.decided_at as "decidedAt" from private.manager_key_petitions k
      join public.account_contexts ac on ac.id = k.manager_context_id join public.profiles p on p.id = ac.auth_user_id order by k.created_at desc limit 500`)).rows))));
  app.get('/api/admin/manager-request-keys',auth.require(['admin']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin'],async c =>
    (await c.query(`select c.id,p.display_name as name,(select h.name from public.manager_assignments a join public.residences h on h.id = a.residence_id
      where a.manager_context_id = c.id and a.ended_at is null order by a.assigned_at limit 1) as "hostelName"
      from public.account_contexts c join public.profiles p on p.id = c.auth_user_id where c.kind = 'manager' and c.status = 'active'`)).rows))));
}
