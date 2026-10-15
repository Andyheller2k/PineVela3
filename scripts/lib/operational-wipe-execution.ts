/** Trusted native core only. No public route or executable operator command. */
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor,type SupabaseDatabase} from '../../supabase/db.js';
import {requireApprovalGrant} from '../../supabase/adminGovernance.js';
import type {SettingsGrant} from '../../supabase/adminSettings.js';
import {recordSystemWipeRecovery,verifySystemWipeRecoveryFiles,type VerifiedSystemWipeRecovery} from './system-wipe-recovery.js';

/** Archive identifiers come from the private saved receipt. Restore subprocesses
 * run in the operator process, outside the live mutation transaction. */
export async function verifyOperationalWipeExecutionFiles(db:SupabaseDatabase,actor:VerifiedActor,grant:SettingsGrant,proposalId:string){
 const target=uuid(proposalId);
 const saved=await db.authorizedSystem(actor,['admin'],async c=>{
  await requireApprovalGrant(c,actor,grant);
  if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
   throw new ApiError(403,'Only the current founder may execute reviewed operational closure.');
  const receipt=(await c.query(`select r.checkpoint_id,r.storage_archive_id from private.system_wipe_recovery_evidence r
   join private.system_wipe_preparations f on f.id=r.preparation_id join private.system_wipe_freezes z on z.preparation_id=f.id
   where f.proposal_id=$1 and f.state='active'and z.state='frozen'`,[target])).rows[0];
  if(!receipt)throw new ApiError(409,'A paused scope and its saved verified recovery receipt are required.');
  return receipt;
 });
 return verifySystemWipeRecoveryFiles(target,saved.checkpoint_id,saved.storage_archive_id);
}

export async function executeOperationalWipeCore(c:PoolClient,actor:VerifiedActor,grant:SettingsGrant,
 verified:VerifiedSystemWipeRecovery,projectRef:string){
 await requireApprovalGrant(c,actor,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[actor.contextId])).rowCount)
  throw new ApiError(403,'Only the current founder can execute reviewed operational closure.');
 await recordSystemWipeRecovery(c,verified,projectRef);
 const authorization=(await c.query(`select id from private.system_wipe_execution_authorizations a where preparation_id=$1
  and founder_context_id=$2 and auth_user_id=$3 and session_id=$4 and approval_key_version=$5
  and private.system_wipe_execution_authorization_current(a)order by created_at desc limit 1`,
  [verified.preparation.id,actor.contextId,actor.authUserId,actor.sessionId,grant.version])).rows[0];
 if(!authorization)throw new ApiError(409,'Fresh final founder consent is required.');
 const receipt=(await c.query("select to_jsonb(r)-'verified_at'as proof from private.system_wipe_recovery_evidence r where preparation_id=$1",[verified.preparation.id])).rows[0];
 await c.query("select set_config('pinevela.operational_wipe_confirmation','CLOSE REVIEWED OPERATIONAL PORTALS',true),set_config('pinevela.primary_wipe_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(receipt.proof)]);
 const row=(await c.query('select private.run_operational_wipe($1)as id',[authorization.id])).rows[0];
 return{success:true,executionId:row.id,authIdentitiesRetained:true,historyRetained:true,storageObjectsModified:0};
}
