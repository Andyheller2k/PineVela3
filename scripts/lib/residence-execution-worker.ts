/** Trusted operator only. No restore subprocess runs in the public API process. */
import {ApiError,uuid,type SupabaseDatabase,type VerifiedActor} from '../../supabase/db.js';
import {notify} from '../../supabase/notifications.js';
import {executeResidenceCore,verifyResidenceExecutionFiles} from './residence-execution.js';

export async function processResidenceExecutionRequest(db:SupabaseDatabase,requestId:string,projectRef:string) {
 const id=uuid(requestId),lock=await db.pool.connect();
 let held=false;
 try{
  held=(await lock.query("select pg_try_advisory_lock(hashtextextended('residence-execution-request:'||$1::text,0)) as held",[id])).rows[0].held;
  if(!held)return {success:true,skipped:true};
  const request=(await db.pool.query(`select r.*,private.residence_execution_request_current(r) as current
   from private.residence_execution_requests r where r.id=$1`,[id])).rows[0];
  if(!request)throw new ApiError(404,'Reviewed execution request not found.');
  if(request.state==='completed')return {success:true,noChange:true,status:'executed',executionId:request.execution_id};
  if(request.state==='invalidated')return {success:true,skipped:true,status:'invalidated'};
  if(!request.current)return await db.system(async c=>{
   await c.query("select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))");
   await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
   const changed=await c.query(`update private.residence_execution_requests r set state='invalidated'
    where id=$1 and state='requested' and not private.residence_execution_request_current(r) returning failure_code`,[id]);
   if(!changed.rowCount)return {success:true,skipped:true};
   const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
   await notify(c,admins,{category:'admin_governance',title:'Reviewed residence deletion request closed',
    message:'The requested deletion lost current founder consent. No records were deleted; give fresh consent or cancel preparation to resume housing.',link:'governance'});
   await c.query("insert into private.audit_events(event_type,resource_type,resource_id) values('residence_execution_request_invalidated','admin_proposal',$1)",[request.proposal_id]);
   return {success:true,status:'invalidated'};
  });
  const actor:VerifiedActor={authUserId:request.auth_user_id,sessionId:request.session_id,contextId:request.founder_context_id,kind:'admin'};
  // The immutable native request proves prior own-key verification. The worker
  // derives its exact version; current authorization/session/key are rechecked.
  const grant={allowed:true,version:request.approval_key_version};
  const verified=await verifyResidenceExecutionFiles(db,actor,grant,request.proposal_id);
  return await db.authorizedSystem(actor,['admin'],async c=>{
   const current=(await c.query(`select r.authorization_id from private.residence_execution_requests r
    where id=$1 and private.residence_execution_request_current(r) for update`,[id])).rows[0];
   if(!current||current.authorization_id!==request.authorization_id)throw new ApiError(409,'The requested consent expired or changed.');
   const result=await executeResidenceCore(c,actor,grant,verified,projectRef);
   const changed=await c.query("update private.residence_execution_requests set state='completed',execution_id=$2 where id=$1 and state='requested'",[id,result.executionId]);
   if(changed.rowCount!==1)throw new ApiError(409,'The execution request changed.');
   return result;
  },false,false,true);
 }finally{
  if(held)await lock.query("select pg_advisory_unlock(hashtextextended('residence-execution-request:'||$1::text,0))",[id]).catch(()=>undefined);
  lock.release(true);
 }
}
