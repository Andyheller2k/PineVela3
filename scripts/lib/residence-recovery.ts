/** Trusted operator evidence from real encrypted archives. Not an HTTP/RPC API. */
import path from 'node:path';
import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type SupabaseDatabase} from '../../supabase/db.js';
import {canonical,readPrivateRecoveryFile,readStorageSnapshot,storageSnapshotDigest,type StorageSnapshot} from '../../supabase/storageBackup.js';
import {notify} from '../../supabase/notifications.js';
import {storageCheckpoint,storageArchiveRoot,reconstructStorageBackup} from './storage-checkpoint.js';

const checked=Symbol('verified-residence-recovery');
type Pause={id:string;proposalId:string;founderId:string;createdAt:string;state:string;scopeDigest:string;hostelName:string;current:boolean;quorum:boolean;status:string};
type Evidence={preparation_id:string;checkpoint_id:string;storage_archive_id:string;project_ref:string;dump_sha256:string;storage_inventory_digest:string;
 manifest_sha256:string;scope_digest:string;preparation_created_at:string;checkpoint_created_at:string;objects:number;bytes:number};
export type VerifiedResidenceRecovery={readonly [checked]:true;readonly pause:Pause;readonly evidence:Evidence;readonly snapshot:StorageSnapshot};
export async function recoveryPreparation(c:PoolClient,proposalId:string):Promise<Pause> {
  const result=(await c.query(`select jsonb_build_object('id',f.id,'proposalId',p.id,'founderId',f.founder_context_id,'createdAt',f.created_at,
    'state',f.state,'scopeDigest',f.preview_digest,'hostelName',p.preview->>'hostelName','current',private.residence_review_current(p),
    'quorum',private.residence_review_quorum(p.id),'status',p.status) as pause
    from private.residence_deletion_preparations f join public.admin_proposals p on p.id=f.proposal_id where p.id=$1`,[uuid(proposalId)])).rows[0]?.pause;
  if(!result)throw new ApiError(409,'Start a keyed founder preparation pause before recording backups.','residence_preparation_missing');
  if(result.state!=='frozen'||result.status!=='approved'||!result.current||!result.quorum)
    throw new ApiError(409,'The preparation pause or its approved consent changed.','residence_preparation_changed');
  return result;
}
export async function verifyResidenceRecoveryFiles(proposalId:string,checkpointId:string,storageArchiveId:string):Promise<VerifiedResidenceRecovery> {
  uuid(proposalId);uuid(checkpointId);uuid(storageArchiveId);
  const {binding,snapshot,inspection:pause,createdAt}=await storageCheckpoint(checkpointId,c=>recoveryPreparation(c,proposalId));
  if(!pause||!Number.isFinite(Date.parse(createdAt))||Date.parse(createdAt)<Date.parse(pause.createdAt)||Date.parse(createdAt)>Date.now())
    throw new ApiError(409,'The checkpoint must include the actual current preparation pause.');
  const reconstructed=reconstructStorageBackup(storageArchiveId,binding,snapshot);
  const manifest=readPrivateRecoveryFile(path.join(storageArchiveRoot(),storageArchiveId+'.pvstorage','manifest.pvsb'),32*1024*1024+33);
  return Object.freeze({[checked]:true as const,pause,snapshot,evidence:{preparation_id:pause.id,checkpoint_id:binding.checkpointId,
    storage_archive_id:storageArchiveId,project_ref:binding.projectRef,dump_sha256:binding.dumpSha256,
    storage_inventory_digest:reconstructed.inventoryDigest,manifest_sha256:crypto.createHash('sha256').update(manifest).digest('hex'),
    scope_digest:pause.scopeDigest,preparation_created_at:pause.createdAt,checkpoint_created_at:createdAt,objects:reconstructed.objects,bytes:reconstructed.bytes}});
}
/** Native guard independently rechecks consent, pause and catalog. Filesystem
 * verification is trusted operator work, not an assertion accepted from a browser. */
export async function recordResidenceRecovery(c:PoolClient,verified:VerifiedResidenceRecovery,projectRef:string) {
  if(verified?.[checked]!==true)throw new ApiError(409,'Actual recovery archives must be verified first.');
  if(verified.evidence.project_ref!==projectRef)throw new ApiError(409,'Recovery archives belong to another project.');
  await c.query("select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))");
  await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
  const live=await recoveryPreparation(c,verified.pause.proposalId);
  if(['id','founderId','createdAt','scopeDigest'].some(k=>live[k as keyof Pause]!==verified.pause[k as keyof Pause]))
    throw new ApiError(409,'The archived preparation does not match the live pause.');
  if(storageSnapshotDigest(await readStorageSnapshot(c))!==verified.evidence.storage_inventory_digest)
    throw new ApiError(409,'Storage changed after the checkpoint. Prepare and restore a fresh backup.');
  const nativeDigest=(await c.query('select private.residence_recovery_catalog_digest() as digest')).rows[0].digest;
  const evidence={...verified.evidence,native_catalog_digest:nativeDigest};
  const normalized=(await c.query("select to_jsonb(r)-'verified_at' as proof from jsonb_populate_record(null::private.residence_recovery_evidence,$1) r",[JSON.stringify(evidence)])).rows[0].proof;
  const saved=(await c.query("select to_jsonb(r)-'verified_at' as proof,verified_at from private.residence_recovery_evidence r where preparation_id=$1",[live.id])).rows[0];
  if(saved){
    if(canonical(saved.proof)!==canonical(normalized))
      throw new ApiError(409,'A different recovery archive is already recorded for this pause.');
    return {success:true,noChange:true,preparationId:live.id,verifiedAt:saved.verified_at};
  }
  await c.query("select set_config('pinevela.residence_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(normalized)]);
  const receipt=(await c.query(`insert into private.residence_recovery_evidence(preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,
    storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes)
    select preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,native_catalog_digest,manifest_sha256,
    scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes from jsonb_populate_record(null::private.residence_recovery_evidence,$1)
    returning verified_at`,[JSON.stringify(evidence)])).rows[0];
  const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
  await notify(c,admins,{category:'admin_governance',title:'Residence preparation backups verified',
    message:`${live.hostelName}: recovery backups were verified for the paused review. Deletion remains unavailable.`,link:'governance'});
  await c.query("insert into private.audit_events(event_type,resource_type,resource_id) values('residence_recovery_verified','residence_preparation',$1)",[live.id]);
  return {success:true,noChange:false,preparationId:live.id,verifiedAt:receipt.verified_at};
}
export async function attachResidenceRecovery(db:SupabaseDatabase,projectRef:string,proposalId:string,checkpointId:string,storageArchiveId:string) {
  const verified=await verifyResidenceRecoveryFiles(proposalId,checkpointId,storageArchiveId);
  return db.system(c=>recordResidenceRecovery(c,verified,projectRef));
}
