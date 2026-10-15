/** Trusted operator planning. No deletion authority, Storage writes or public API. */
import type {PoolClient} from 'pg';
import {ApiError,uuid,type SupabaseDatabase} from '../../supabase/db.js';
import {canonical} from '../../supabase/storageBackup.js';
import {recordResidenceRecovery,verifyResidenceRecoveryFiles,type VerifiedResidenceRecovery} from './residence-recovery.js';
import {notify} from '../../supabase/notifications.js';

export async function recordResidenceCleanupPlan(c:PoolClient,verified:VerifiedResidenceRecovery,projectRef:string) {
  // Recheck the actual verified archives, current consent and catalog through the
  // existing receipt boundary, including exact-match reconciliation on retries.
  await recordResidenceRecovery(c,verified,projectRef);
  const id=verified.pause.id;
  const proof=(await c.query(`with derived as materialized(select private.residence_cleanup_preview($1::uuid) as plan)
    select jsonb_build_object('preparation_id',$1::uuid,
    'native_catalog_digest',private.residence_recovery_catalog_digest(),
    'plan',plan,'plan_digest',encode(sha256(convert_to(plan::text,'UTF8')),'hex')) as proof from derived`,[id])).rows[0].proof;
  const saved=(await c.query("select to_jsonb(t)-'created_at' as proof,created_at from private.residence_cleanup_plans t where preparation_id=$1",[id])).rows[0];
  if(saved){
    if(canonical(saved.proof)!==canonical(proof))throw new ApiError(409,'Cleanup references changed. Cancel the pause and review a fresh scope.');
    return {success:true,noChange:true,preparationId:id,plannedAt:saved.created_at,removeCount:proof.plan.removeCount,retainCount:proof.plan.retainCount};
  }
  await c.query("select set_config('pinevela.residence_cleanup_checked',$1::jsonb::text,true)",[JSON.stringify(proof)]);
  const row=(await c.query(`insert into private.residence_cleanup_plans(preparation_id,native_catalog_digest,plan,plan_digest)
    select preparation_id,native_catalog_digest,plan,plan_digest from jsonb_populate_record(null::private.residence_cleanup_plans,$1)
    returning created_at`,[JSON.stringify(proof)])).rows[0];
  const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
  await notify(c,admins,{category:'admin_governance',title:'Residence Storage cleanup planned',
    message:`${verified.pause.hostelName}: ${proof.plan.removeCount} exclusive housing images are planned for cleanup; ${proof.plan.retainCount} images are retained. No records or images were deleted.`,link:'governance'});
  await c.query("insert into private.audit_events(event_type,resource_type,resource_id) values('residence_cleanup_planned','residence_preparation',$1)",[id]);
  return {success:true,noChange:false,preparationId:id,plannedAt:row.created_at,removeCount:proof.plan.removeCount,retainCount:proof.plan.retainCount};
}
export async function prepareResidenceCleanup(db:SupabaseDatabase,projectRef:string,proposalId:string,checkpointId:string,storageArchiveId:string) {
  uuid(proposalId);const verified=await verifyResidenceRecoveryFiles(proposalId,checkpointId,storageArchiveId);
  return db.system(c=>recordResidenceCleanupPlan(c,verified,projectRef));
}
