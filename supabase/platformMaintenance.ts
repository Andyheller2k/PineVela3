import type { Express, RequestHandler } from 'express';
import { ApiError, uuid } from './db.js';
import type { SupabaseAuth, AuthRequest } from './auth.js';
import { bodyFields } from './adminSettings.js';
import { MAINTENANCE_MESSAGE } from '../platformSettings.js';

export const maintenanceError = () => new ApiError(503,MAINTENANCE_MESSAGE,'platform_maintenance');
/** Runs before upload/body parsing. Exempt authentication paths still verify their
 * selected portal in bind(); the raw-body payment webhook is mounted before this. */
export function maintenanceBoundary(auth: SupabaseAuth): RequestHandler {
  return (req,res,next) => {
    const path=req.path.toLowerCase().replace(/\/+$/,'');
    const publicRead=['GET','HEAD'].includes(req.method) && ['/settings','/health'].includes(path);
    const authEntry=req.method==='POST' && ['/auth/login','/digital-market/login','/auth/verification-team-login',
      '/verification-teams/login','/auth/logout','/auth/google/start'].includes(path)
      || req.method==='GET' && path==='/auth/google/callback';
    if (publicRead || authEntry) return next();
    auth.db.system(async c=>(await c.query('select private.platform_available() as available')).rows[0].available)
      .then(async available=>{
        if (available) return next();
        // Authenticate the actual cookie and current membership; request roles and
        // claimed administrator IDs cannot grant maintenance recovery access.
        if (!String(req.headers.cookie || '').includes('pv_sb_access=')) throw maintenanceError();
        const {actor}=await auth.authenticate(req,res);
        if (actor.kind!=='admin') throw maintenanceError();
        await auth.db.authorizedSystem(actor,['admin'],async()=>undefined);
        next();
      }).catch(next);
  };
}
export async function recoveryNotice(auth: SupabaseAuth, actor: AuthRequest['actor']) {
  return auth.db.readActor(actor,async c=>{
    const serverTime=(await c.query('select clock_timestamp() as time')).rows[0].time;
    const notice=(await c.query(`select n.id,n.message,n.expires_at as "expiresAt" from private.maintenance_recovery_notices n
      join private.maintenance_recovery_recipients r on r.notice_id=n.id where r.context_id=$1 and r.dismissed_at is null
      and n.id=private.latest_maintenance_notice() and n.created_at<=clock_timestamp() and n.expires_at>clock_timestamp()`,[actor.contextId])).rows[0] || null;
    return {serverTime,notice};
  });
}
export async function dismissRecoveryNotice(auth: SupabaseAuth, actor: AuthRequest['actor'], body: unknown) {
  bodyFields(body,['noticeId']);const id=uuid((body as any).noticeId);
  await auth.db.actor(actor,async c=>{
    const updated=await c.query(`update private.maintenance_recovery_recipients r set dismissed_at=coalesce(dismissed_at,clock_timestamp())
      where r.notice_id=$1 and r.context_id=$2 and exists(select 1 from private.maintenance_recovery_notices n
        where n.id=r.notice_id and n.id=private.latest_maintenance_notice() and n.created_at<=clock_timestamp() and n.expires_at>clock_timestamp())`,[id,actor.contextId]);
    if (!updated.rowCount) throw new ApiError(409,'This notice changed, expired or is not available for your account.');
  });
  return {success:true};
}
export function installRecoveryNotice(app: Express, auth: SupabaseAuth) {
  const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
  app.get('/api/auth/maintenance-notice',auth.require(),route(async(req,res)=>res.json(await recoveryNotice(auth,req.actor))));
  app.post('/api/auth/maintenance-notice/dismiss',auth.require(),route(async(req,res)=>res.json(await dismissRecoveryNotice(auth,req.actor,req.body))));
}
