/** Trusted operator process. Native request identity, never worker input, selects
 * the founder, exact grant version, saved recovery files and reviewed scope. */
import {ApiError,uuid,type SupabaseDatabase,type VerifiedActor} from '../../supabase/db.js';
import {notify} from '../../supabase/notifications.js';
import {systemWipeExecutionRequestsEnabled} from '../../supabase/systemWipeExecutionRequests.js';
import {executeOperationalWipeCore,verifyOperationalWipeExecutionFiles} from './operational-wipe-execution.js';

export async function processSystemWipeExecutionRequest(db:SupabaseDatabase,requestId:string,projectRef:string){
 if(!systemWipeExecutionRequestsEnabled())throw new ApiError(503,'Reviewed wipe execution is not enabled.');
 const id=uuid(requestId),lock=await db.pool.connect();let held=false;
 try{
  held=(await lock.query("select pg_try_advisory_lock(hashtextextended('system-wipe-execution-request:'||$1::text,0))as held",[id])).rows[0].held;
  if(!held)return{success:true,skipped:true};
  const request=(await db.pool.query('select q.*,private.system_wipe_execution_request_current(q)as current from private.system_wipe_execution_requests q where id=$1',[id])).rows[0];
  if(!request)throw new ApiError(404,'Reviewed wipe request not found.');
  // Reconcile a lost COMMIT reply from durable state before considering work.
  if(request.state==='completed')return{success:true,noChange:true,status:'executed',executionId:request.execution_id};
  if(request.state==='invalidated')return{success:true,skipped:true,status:'invalidated'};
  if(!request.current)return await db.system(async c=>{
   await c.query("select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))");
   await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
   const current=(await c.query('select q.id from private.system_wipe_execution_requests q where id=$1 and state=\'requested\'and not private.system_wipe_execution_request_current(q)for update',[id])).rows[0];
   if(!current)return{success:true,skipped:true};
   if(!systemWipeExecutionRequestsEnabled())throw new ApiError(503,'Reviewed wipe execution is not enabled.');
   const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active'and x.status='active'")).rows.map(r=>r.context_id);
   const notice=await notify(c,admins,{category:'admin_governance',title:'Reviewed system wipe request invalidated',link:'governance',
    message:'This queued request lost current founder consent and cannot execute. Review the preparation before giving fresh consent.'});
   await c.query("update private.system_wipe_execution_requests set state='invalidated',terminal_notification_id=$2 where id=$1",[id,notice]);
   await c.query("insert into private.audit_events(event_type,resource_type,resource_id)values('system_wipe_execution_request_invalidated','system_wipe_execution_request',$1)",[id]);
   return{success:true,status:'invalidated'};
  });
  const actor:VerifiedActor={authUserId:request.auth_user_id,sessionId:request.session_id,contextId:request.founder_context_id,kind:'admin'};
  const grant={allowed:true,version:request.approval_key_version};
  const verified=await verifyOperationalWipeExecutionFiles(db,actor,grant,request.proposal_id);
  return await db.authorizedSystem(actor,['admin'],async c=>{
   const current=(await c.query('select q.*,private.system_wipe_execution_request_current(q)as current from private.system_wipe_execution_requests q where id=$1 for update',[id])).rows[0];
   if(current?.state==='completed')return{success:true,noChange:true,status:'executed',executionId:current.execution_id};
   if(!systemWipeExecutionRequestsEnabled())throw new ApiError(503,'Reviewed wipe execution is not enabled.');
   if(!current?.current||current.authorization_id!==request.authorization_id)throw new ApiError(409,'The queued consent expired or changed during recovery verification.');
   const result=await executeOperationalWipeCore(c,actor,grant,verified,projectRef);
   await c.query("update private.system_wipe_execution_requests set state='completed',execution_id=$2 where id=$1",[id,result.executionId]);
   return{...result,status:'executed'};
  },false,false,true);
 }finally{
  if(held)await lock.query("select pg_advisory_unlock(hashtextextended('system-wipe-execution-request:'||$1::text,0))",[id]).catch(()=>undefined);
  lock.release(true);
 }
}
