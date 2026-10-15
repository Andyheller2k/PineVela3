/** Native worker core. No HTTP/RPC entry or provider deletion is enabled here. */
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor,type SupabaseDatabase} from '../../supabase/db.js';
import {requireApprovalGrant} from '../../supabase/adminGovernance.js';
import type {SettingsGrant} from '../../supabase/adminSettings.js';
import {recordResidenceCleanupPlan} from './residence-cleanup.js';
import {verifyResidenceRecoveryFiles,type VerifiedResidenceRecovery} from './residence-recovery.js';

/** Caller has acquired exclusive housing admission before actor/governance locks. */
export async function executeResidenceCore(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,
 verified:VerifiedResidenceRecovery,projectRef:string){
 await requireApprovalGrant(c,actor,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
  throw new ApiError(403,'Only the founder can execute reviewed residence removal.');
 // This checks the unforgeable recovery brand, exact archived files, native scope,
 // current catalog and immutable receipt/plan before native admission exists.
 await recordResidenceCleanupPlan(c,verified,projectRef);
 const authorization=(await c.query(`select a.id from private.residence_execution_authorizations a
  where a.preparation_id=$1 and a.founder_context_id=$2 and a.auth_user_id=$3 and a.session_id=$4
   and a.approval_key_version=$5 and private.residence_execution_authorization_current(a)
  order by a.created_at desc limit 1`,[verified.pause.id,actor.contextId,actor.authUserId,actor.sessionId,grant.version])).rows[0];
 if(!authorization)throw new ApiError(409,'Give fresh final founder consent for the exact saved recovery plan.');
 const receipt=(await c.query("select to_jsonb(r)-'verified_at' as proof from private.residence_recovery_evidence r where preparation_id=$1",[verified.pause.id])).rows[0];
 await c.query("select set_config('pinevela.residence_execution_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(receipt.proof)]);
 await c.query("select set_config('pinevela.residence_execution_confirmation','DELETE APPROVED HOSTEL',true)");
 const result=(await c.query('select private.run_residence_execution($1) as id',[authorization.id])).rows[0];
 const tasks=Number((await c.query('select count(*) from private.residence_storage_cleanup_tasks where execution_id=$1',[result.id])).rows[0].count);
 return {success:true,executionId:result.id,status:'executed',storageCleanup:tasks?'queued':'not_required',cleanupTasks:tasks,providerObjectsRemoved:0};
}
/** Reconcile a lost response by its immutable completed receipt, never by replaying
 * removal. A genuine current founder and current separately verified key are required. */
export async function completedResidenceExecution(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,proposalId:string){
 await requireApprovalGrant(c,actor,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
  throw new ApiError(403,'Only the founder can reconcile reviewed residence execution.');
 const row=(await c.query(`select e.id,e.completed_at,(select count(*) from private.residence_storage_cleanup_tasks t where t.execution_id=e.id) as tasks
  from private.residence_executions e where e.proposal_id=$1 and e.state='completed'`,[uuid(proposalId)])).rows[0];
 return row?{success:true,noChange:true,executionId:row.id,status:'executed',completedAt:row.completed_at,cleanupTasks:Number(row.tasks)}:null;
}
/** Archive identifiers are derived from the server's saved receipt, never a client
 * path/owner. Restoration occurs outside the live mutation transaction. */
export async function verifyResidenceExecutionFiles(db:SupabaseDatabase,actor:VerifiedActor,grant:SettingsGrant,proposalId:string){
 const target=uuid(proposalId);
 const receipt=await db.authorizedSystem(actor,['admin'],async c=>{
  await requireApprovalGrant(c,actor,grant);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
   throw new ApiError(403,'Only the founder can execute reviewed residence removal.');
  const saved=(await c.query(`select r.checkpoint_id,r.storage_archive_id from private.residence_recovery_evidence r
   join private.residence_deletion_preparations f on f.id=r.preparation_id where f.proposal_id=$1 and f.state='frozen'`,[target])).rows[0];
  if(!saved)throw new ApiError(409,'A reviewed pause and verified recovery receipt are required.');return saved;
 });
 return verifyResidenceRecoveryFiles(target,receipt.checkpoint_id,receipt.storage_archive_id);
}
