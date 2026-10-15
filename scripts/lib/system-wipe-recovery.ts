/** Operator-only evidence from actual restored PostgreSQL and authenticated
 * Storage archives. No HTTP assertions or credentials can authorize recovery. */
import path from 'node:path';import crypto from 'node:crypto';import type {PoolClient} from 'pg';
import {ApiError,uuid,type SupabaseDatabase} from '../../supabase/db.js';
import {canonical,readPrivateRecoveryFile,readStorageSnapshot,storageSnapshotDigest} from '../../supabase/storageBackup.js';
import {notify} from '../../supabase/notifications.js';
import {storageCheckpoint,storageArchiveRoot,reconstructStorageBackup} from './storage-checkpoint.js';
const checked=Symbol('verified-system-wipe-recovery');
type Preparation={id:string;proposalId:string;founderId:string;createdAt:string;state:string;scopeDigest:string;current:boolean;quorum:boolean;status:string;founderDecision:string;pausedAt:string|null;pauseState:string|null};
type Evidence={preparation_id:string;checkpoint_id:string;storage_archive_id:string;project_ref:string;dump_sha256:string;storage_inventory_digest:string;native_catalog_digest:string;manifest_sha256:string;scope_digest:string;preparation_created_at:string;checkpoint_created_at:string;objects:number;bytes:number};
export type VerifiedSystemWipeRecovery={readonly [checked]:true;readonly preparation:Readonly<Preparation>;readonly evidence:Readonly<Evidence>};
export async function systemWipeRecoveryPreparation(c:PoolClient,proposalId:string):Promise<Preparation>{
 const found=(await c.query(`select jsonb_build_object('id',f.id,'proposalId',p.id,'founderId',f.founder_context_id,'createdAt',f.created_at,'state',f.state,'scopeDigest',f.scope_digest,
  'current',private.system_wipe_current(p),'quorum',private.system_wipe_quorum(p.id),'status',p.status,'founderDecision',p.wipe_final_decision)as preparation
  from private.system_wipe_preparations f join public.admin_proposals p on p.id=f.proposal_id where p.id=$1`,[uuid(proposalId)])).rows[0]?.preparation;
 if(!found)throw new ApiError(409,'Start a keyed founder backup preparation first.','system_wipe_preparation_missing');
 if(found.state!=='active'||found.status!=='approved'||!found.current||!found.quorum||found.founderDecision!=='approve-backup')throw new ApiError(409,'The exact preparation or five-admin founder consent changed.','system_wipe_preparation_changed');
 const hasPauses=(await c.query("select to_regclass('private.system_wipe_freezes')is not null as present")).rows[0].present;
 const pause=hasPauses?(await c.query("select jsonb_build_object('pausedAt',created_at,'pauseState',state)as pause from private.system_wipe_freezes where preparation_id=$1",[found.id])).rows[0]?.pause:null;
 Object.assign(found,{pausedAt:null,pauseState:null},pause||{});
 return found;
}
export async function verifySystemWipeRecoveryFiles(proposalId:string,checkpointId:string,storageArchiveId:string):Promise<VerifiedSystemWipeRecovery>{
 uuid(proposalId);uuid(checkpointId);uuid(storageArchiveId);
 const {binding,snapshot,inspection,createdAt}=await storageCheckpoint(checkpointId,async c=>({preparation:await systemWipeRecoveryPreparation(c,proposalId),catalogDigest:(await c.query('select private.residence_recovery_catalog_digest()as digest')).rows[0].digest}));
 const prep=inspection!.preparation;
 if(!Number.isFinite(Date.parse(createdAt))||Date.parse(createdAt)<Date.parse(prep.createdAt)||Date.parse(createdAt)>Date.now())throw new ApiError(409,'The restored checkpoint must include this actual backup preparation.');
 if(prep.pauseState==='frozen'&&Date.parse(createdAt)<Date.parse(prep.pausedAt!))throw new ApiError(409,'The restored checkpoint must include the actual reviewed write pause.');
 const reconstructed=reconstructStorageBackup(storageArchiveId,binding,snapshot);
 const manifest=readPrivateRecoveryFile(path.join(storageArchiveRoot(),storageArchiveId+'.pvstorage','manifest.pvsb'),32*1024*1024+33);
 const evidence={preparation_id:prep.id,checkpoint_id:binding.checkpointId,storage_archive_id:storageArchiveId,project_ref:binding.projectRef,dump_sha256:binding.dumpSha256,
  storage_inventory_digest:reconstructed.inventoryDigest,native_catalog_digest:inspection!.catalogDigest,manifest_sha256:crypto.createHash('sha256').update(manifest).digest('hex'),
  scope_digest:prep.scopeDigest,preparation_created_at:prep.createdAt,checkpoint_created_at:createdAt,objects:reconstructed.objects,bytes:reconstructed.bytes};
 return Object.freeze({[checked]:true as const,preparation:Object.freeze(prep),evidence:Object.freeze(evidence)});
}
export async function recordSystemWipeRecovery(c:PoolClient,verified:VerifiedSystemWipeRecovery,projectRef:string){
 if(verified?.[checked]!==true)throw new ApiError(409,'Actual recovery files must be verified first.');
 if(verified.evidence.project_ref!==projectRef)throw new ApiError(409,'Recovery files belong to another project.');
 await c.query("select pg_advisory_xact_lock(hashtextextended('residence-deletion-freeze',0))");
 await c.query("select pg_advisory_xact_lock(hashtextextended('platform-settings',0))");
 const live=await systemWipeRecoveryPreparation(c,verified.preparation.proposalId);
 if(['id','founderId','createdAt','scopeDigest','pausedAt','pauseState'].some(k=>live[k as keyof Preparation]!==verified.preparation[k as keyof Preparation]))throw new ApiError(409,'The archived preparation and write pause do not match the current review.');
 if(storageSnapshotDigest(await readStorageSnapshot(c))!==verified.evidence.storage_inventory_digest||(await c.query('select private.residence_recovery_catalog_digest()as digest')).rows[0].digest!==verified.evidence.native_catalog_digest)throw new ApiError(409,'Storage changed after the checkpoint. Prepare and restore fresh recovery files.');
 const evidence=verified.evidence;
 const normalized=(await c.query("select to_jsonb(r)-'verified_at'as proof from jsonb_populate_record(null::private.system_wipe_recovery_evidence,$1)r",[JSON.stringify(evidence)])).rows[0].proof;
 const saved=(await c.query("select to_jsonb(r)-'verified_at'as proof,verified_at from private.system_wipe_recovery_evidence r where preparation_id=$1",[live.id])).rows[0];
 if(saved){if(canonical(saved.proof)!==canonical(normalized))throw new ApiError(409,'Different recovery evidence is already recorded for this preparation.');return{success:true,noChange:true,preparationId:live.id,verifiedAt:saved.verified_at,executionAvailable:false};}
 await c.query("select set_config('pinevela.system_wipe_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(normalized)]);
 const receipt=(await c.query(`insert into private.system_wipe_recovery_evidence(preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes)
  select preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes from jsonb_populate_record(null::private.system_wipe_recovery_evidence,$1)returning verified_at`,[JSON.stringify(evidence)])).rows[0];
 const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
 await notify(c,admins,{category:'admin_governance',title:'System wipe recovery backups verified',message:live.pauseState==='frozen'?'An operator restored the database including the reviewed write pause and verified actual encrypted Storage bytes. Accounts and history remain. Fresh founder consent is required; operational execution remains disabled.':'An operator restored the database and verified actual encrypted Storage bytes for this exact review. Accounts and history remain. This unpaused snapshot cannot authorize execution.',link:'governance'});
 await c.query("insert into private.audit_events(event_type,resource_type,resource_id)values('system_wipe_recovery_verified','system_wipe_preparation',$1)",[live.id]);
 return{success:true,noChange:false,preparationId:live.id,verifiedAt:receipt.verified_at,executionAvailable:false};
}
export async function attachSystemWipeRecovery(db:SupabaseDatabase,projectRef:string,proposalId:string,checkpointId:string,storageArchiveId:string){
 const verified=await verifySystemWipeRecoveryFiles(proposalId,checkpointId,storageArchiveId);return db.system(c=>recordSystemWipeRecovery(c,verified,projectRef));
}
