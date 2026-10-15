/** Isolated native worker core only. No HTTP/CLI execution entry is enabled. */
import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor}from'../../supabase/db.js';
import {requireApprovalGrant}from'../../supabase/adminGovernance.js';
import type {SettingsGrant}from'../../supabase/adminSettings.js';
import {recordSystemWipeRecovery,type VerifiedSystemWipeRecovery}from'./system-wipe-recovery.js';
export async function executePrimaryWipeCore(c:PoolClient,a:VerifiedActor,grant:SettingsGrant,verified:VerifiedSystemWipeRecovery,projectRef:string){
 await requireApprovalGrant(c,a,grant);
 if(!(await c.query("select 1 from public.admin_memberships where context_id=$1 and slot=1 and status='active'",[a.contextId])).rowCount)
  throw new ApiError(403,'Only the current founder can execute a reviewed primary closure.');
 await recordSystemWipeRecovery(c,verified,projectRef);
 const authorization=(await c.query(`select id from private.system_wipe_execution_authorizations a where preparation_id=$1
  and founder_context_id=$2 and auth_user_id=$3 and session_id=$4 and approval_key_version=$5
  and private.system_wipe_execution_authorization_current(a) order by created_at desc limit 1`,
  [verified.preparation.id,a.contextId,a.authUserId,a.sessionId,grant.version])).rows[0];
 if(!authorization)throw new ApiError(409,'Fresh final founder consent is required.');
 const receipt=(await c.query("select to_jsonb(r)-'verified_at' as proof from private.system_wipe_recovery_evidence r where preparation_id=$1",[verified.preparation.id])).rows[0];
 await c.query("select set_config('pinevela.primary_wipe_confirmation','CLOSE REVIEWED PRIMARY ACCOUNTS',true),set_config('pinevela.primary_wipe_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(receipt.proof)]);
 const row=(await c.query('select private.run_primary_wipe($1)as id',[authorization.id])).rows[0];
 return{success:true,executionId:row.id,authIdentitiesRetained:true,storageObjectsModified:0};
}
