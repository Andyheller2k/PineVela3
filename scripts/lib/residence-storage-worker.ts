/** Trusted operator worker. Native completed consent owns the job; no HTTP/RPC
 * accepts paths, owners, recovery proof or provider outcomes. */
import {ApiError,uuid,type SupabaseDatabase} from '../../supabase/db.js';
import crypto from 'node:crypto';
import path from 'node:path';
import {SupabaseStorage} from '../../supabase/storage.js';
import {canonical,readPrivateRecoveryFile} from '../../supabase/storageBackup.js';
import {storageCheckpoint,storageArchiveRoot,reconstructStorageBackup} from './storage-checkpoint.js';
import {notify} from '../../supabase/notifications.js';

const prepared=Symbol('prepared-residence-storage'),missing=Symbol('observed-residence-storage-absence');
type Lease={id:string;asset_id:string;token:string;state:string;expires_at:Date};
type Prepared={readonly [prepared]:true;readonly lease:Lease;readonly path:string;readonly identity:any;readonly sha256:string;readonly bytes:number};
type Absence={readonly [missing]:true;readonly work:Prepared};
async function nativeTask(db:SupabaseDatabase,asset:string){
 return db.system(async c=>{
  const row=(await c.query(`select t.candidate,e.proposal_id,e.preparation_id,e.founder_context_id,e.resources,
   r.checkpoint_id,r.storage_archive_id,to_jsonb(r)-'verified_at' as recovery,
   jsonb_build_object('id',o.id,'version',o.version,'updatedAt',o.updated_at) as object
   from private.residence_storage_cleanup_tasks t join private.residence_executions e on e.id=t.execution_id
   join private.residence_recovery_evidence r on r.preparation_id=e.preparation_id
   left join storage.objects o on o.name=t.candidate->>'path' and o.bucket_id=t.candidate->>'bucket'
   where t.asset_id=$1 and private.residence_cleanup_task_valid(t.asset_id)`,[asset])).rows[0];
  if(!row)throw new ApiError(409,'An exact completed reviewed cleanup task is required.');
  if(!row.object?.id)row.object=null;return row;
 });
}
export async function claimResidenceStorageTask(db:SupabaseDatabase,asset:string):Promise<Lease|null>{
 return db.system(async c=>{
  const row=(await c.query('select * from private.claim_residence_storage_cleanup($1)',[uuid(asset)])).rows[0];
  return row?.id?row:null;
 });
}
async function currentLease(db:SupabaseDatabase,lease:Lease,states:string[]=['deleting']){
 return db.system(async c=>{
  const row=(await c.query(`select id from private.residence_storage_cleanup_attempts where id=$1 and token=$2 and asset_id=$3
   and state=any($4::text[]) and expires_at>clock_timestamp() and private.residence_cleanup_unshared(asset_id)`,[lease.id,lease.token,lease.asset_id,states])).rows[0];
  if(!row)throw new ApiError(409,'Cleanup lease expired or references changed.');
 });
}
function providerMatches(info:Record<string,unknown>,row:any){
 return info.id===row.object?.id && info.version===row.object?.version && info.name===row.candidate.path
  && info.bucket_id===row.candidate.bucket && Number(info.size)===row.candidate.bytes && info.content_type==='image/png'
  && Date.parse(String(info.last_modified))===Date.parse(row.object.updatedAt);
}
export async function prepareResidenceStorageTask(db:SupabaseDatabase,lease:Lease):Promise<Prepared>{
 await currentLease(db,lease,['claimed']);
 const row=await nativeTask(db,lease.asset_id);
 const {binding,snapshot,inspection,createdAt}=await storageCheckpoint(row.checkpoint_id,async c=>(await c.query(`
  select f.id,f.proposal_id,f.founder_context_id,to_jsonb(f.created_at) as created_at,f.preview_digest,f.state,p.status,p.kind,p.baseline_digest,
   p.preview->'resources' as resources from private.residence_deletion_preparations f
   join public.admin_proposals p on p.id=f.proposal_id where f.id=$1 and p.id=$2`,[row.preparation_id,row.proposal_id])).rows[0]);
 // A completed decision delegates cleanup beyond its original 24-hour review.
 // Revalidate the exact historical frozen snapshot and actual bytes without
 // treating an archived session or expired review as current authority.
 if(!inspection||inspection.state!=='frozen'||inspection.status!=='approved'||inspection.kind!=='residence_deletion'
  ||inspection.founder_context_id!==row.founder_context_id||inspection.preview_digest!==row.recovery.scope_digest
  ||inspection.baseline_digest!==row.recovery.scope_digest||canonical(inspection.resources)!==canonical(row.resources))
  throw new ApiError(409,'The archive does not contain the exact original approved scope.');
 const reconstructed=reconstructStorageBackup(row.storage_archive_id,binding,snapshot);
 const manifest=readPrivateRecoveryFile(path.join(storageArchiveRoot(),row.storage_archive_id+'.pvstorage','manifest.pvsb'),32*1024*1024+33);
 const evidence={preparation_id:inspection.id,checkpoint_id:binding.checkpointId,storage_archive_id:row.storage_archive_id,
  project_ref:binding.projectRef,dump_sha256:binding.dumpSha256,storage_inventory_digest:reconstructed.inventoryDigest,
  manifest_sha256:crypto.createHash('sha256').update(manifest).digest('hex'),scope_digest:inspection.preview_digest,
  preparation_created_at:inspection.created_at,checkpoint_created_at:createdAt,objects:reconstructed.objects,bytes:reconstructed.bytes};
 const proof=Object.fromEntries(Object.entries(row.recovery).filter(([k])=>k!=='native_catalog_digest'));
 const normalized=await db.system(async c=>(await c.query("select to_jsonb(r)-array['verified_at','native_catalog_digest'] as proof from jsonb_populate_record(null::private.residence_recovery_evidence,$1) r",[JSON.stringify(evidence)])).rows[0].proof);
 if(canonical(proof)!==canonical(normalized)||!snapshot.assets.some(a=>a.id===lease.asset_id
  &&a.object_path===row.candidate.path&&a.sha256===row.candidate.sha256&&a.byte_size===row.candidate.bytes))
  throw new ApiError(409,'Exact archived cleanup bytes could not be verified.');
 const storage=new SupabaseStorage(),info=await storage.objectInfo(row.candidate.path);
 if(info){
  if(!providerMatches(info,row))throw new ApiError(409,'The provider object identity changed.');
  const bytes=await storage.downloadForBackup(row.candidate.path,{byte_size:row.candidate.bytes,sha256:row.candidate.sha256},60000);bytes.fill(0);
 }else if(row.object)throw new ApiError(409,'Provider absence disagrees with the native object catalog.');
 await db.system(async c=>{
  await c.query("select set_config('pinevela.residence_cleanup_token',$1,true)",[lease.token]);
  await c.query("select set_config('pinevela.residence_cleanup_verified',$1::jsonb::text,true)",
   [JSON.stringify({attemptId:lease.id,recovery:row.recovery,object:row.object})]);
  const updated=await c.query("update private.residence_storage_cleanup_attempts set state='deleting',object_identity=$3::jsonb where id=$1 and token=$2",[lease.id,lease.token,JSON.stringify(row.object)]);
  if(updated.rowCount!==1)throw new ApiError(409,'Cleanup lease no longer exists.');
 });
 return Object.freeze({[prepared]:true as const,lease,path:row.candidate.path,identity:row.object,sha256:row.candidate.sha256,bytes:row.candidate.bytes});
}
export async function removePreparedResidenceStorageTask(db:SupabaseDatabase,work:Prepared):Promise<Absence>{
 if(work?.[prepared]!==true)throw new ApiError(409,'Fresh verified cleanup preparation is required.');
 await currentLease(db,work.lease);
 const row=await nativeTask(db,work.lease.asset_id),storage=new SupabaseStorage(),info=await storage.objectInfo(work.path);
 if(canonical(row.object)!==canonical(work.identity))throw new ApiError(409,'The native object identity changed.');
 if(info){
  if(!providerMatches(info,row))throw new ApiError(409,'The provider object changed before removal.');
  const bytes=await storage.downloadForBackup(work.path,{byte_size:work.bytes,sha256:work.sha256},60000);bytes.fill(0);
  await currentLease(db,work.lease);await storage.remove(work.path);
 }
 if(await storage.objectInfo(work.path))throw new ApiError(503,'Storage removal is not yet confirmed.');
 return Object.freeze({[missing]:true as const,work});
}
export async function completeResidenceStorageTask(db:SupabaseDatabase,result:Absence){
 if(result?.[missing]!==true)throw new ApiError(409,'An actual provider absence observation is required.');
 const work=result.work;
 // Recheck absence after a restart/delay, even if a prior API response was lost.
 if(await new SupabaseStorage().objectInfo(work.path))throw new ApiError(409,'The object is present again.');
 return db.system(async c=>{
  await c.query("select set_config('pinevela.residence_cleanup_token',$1,true)",[work.lease.token]);
  await c.query("select set_config('pinevela.residence_cleanup_missing',$1,true)",[work.lease.id]);
  const changed=await c.query("update private.residence_storage_cleanup_attempts set state='completed' where id=$1 and token=$2",[work.lease.id,work.lease.token]);
  if(changed.rowCount!==1)throw new ApiError(409,'Cleanup lease no longer exists.');
  await c.query("insert into private.audit_events(event_type,resource_type,resource_id,event_data) values('residence_storage_removed','media_asset',$1,$2)",
   [work.lease.asset_id,JSON.stringify({attemptId:work.lease.id,providerAbsenceObserved:true})]);
  const admins=(await c.query("select m.context_id from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.status='active' and x.status='active'")).rows.map(r=>r.context_id);
  await notify(c,admins,{category:'admin_governance',title:'Residence image cleanup confirmed',message:'An approved exclusive residence image was removed through Storage and its absence verified.',link:'governance'});
  return {success:true,assetId:work.lease.asset_id,providerAbsenceVerified:true};
 });
}
export async function failResidenceStorageTask(db:SupabaseDatabase,lease:Lease,code:'verification_failed'|'storage_unavailable'){
 await db.system(async c=>{
  await c.query("select set_config('pinevela.residence_cleanup_token',$1,true)",[lease.token]);
  await c.query("update private.residence_storage_cleanup_attempts set state='failed',error_code=$3 where id=$1 and token=$2 and state in('claimed','deleting') and expires_at>clock_timestamp()",[lease.id,lease.token,code]);
 });
}
export async function processResidenceStorageTask(db:SupabaseDatabase,asset:string){
 const lease=await claimResidenceStorageTask(db,asset);if(!lease)return {claimed:false};
 try{
  const work=await prepareResidenceStorageTask(db,lease),absence=await removePreparedResidenceStorageTask(db,work);
  return await completeResidenceStorageTask(db,absence);
 }catch(error){
  await failResidenceStorageTask(db,lease,error instanceof ApiError&&error.status===503?'storage_unavailable':'verification_failed').catch(()=>undefined);
  throw error;
 }
}
