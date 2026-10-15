/** Real provider acceptance with the actual cover image and an existing verified
 * Google owner's primary portal. No Auth users/sessions, operational rows or
 * published media are created. One temporary private object is journaled first,
 * then removed exclusively through the Storage API. No provider mocks. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {readStorageSnapshot,storageSnapshotDigest,verifyStorageBackup} from '../supabase/storageBackup.js';
import {storageArchiveRoot,storageCheckpoint} from './lib/storage-checkpoint.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';

dotenv.config({quiet:true});
if(process.argv.length!==3||process.argv[2]!=='--execute')throw new Error('Use --execute for this real temporary-object acceptance check.');
const directory=storageArchiveRoot(),db=new SupabaseDatabase(),storage=new SupabaseStorage();
let objectPath:string|undefined,journal:string|undefined,checks=0,cleaned=false;
let image:Buffer|undefined;
const check=(value:unknown)=>{if(!value)throw new Error('Storage recovery acceptance assertion failed.');checks++;};
function record(state:string,details:Record<string,unknown>={}) {
  const file=journal!,temporary=file+'.next',fd=fs.openSync(temporary,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,JSON.stringify({version:1,purpose:'storage-recovery-acceptance',objectPath,state,updatedAt:new Date().toISOString(),...details})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  fs.renameSync(temporary,file);const dir=fs.openSync(directory,fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}
}
async function run(script:string,args:string[]=[]) {
  return new Promise<any>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx',script,...args],{env:process.env,stdio:['ignore','pipe','ignore']});
    let output='',tooLarge=false;
    child.stdout.on('data',chunk=>{output+=chunk.toString();if(output.length>65536){tooLarge=true;child.kill();}});
    child.once('error',()=>reject(new Error('Recovery subprocess could not start.')));
    child.once('close',code=>{if(code!==0||tooLarge)return reject(new Error('Recovery subprocess failed.'));
      try{resolve(JSON.parse(output.trim()));}catch{reject(new Error('Recovery subprocess output could not be verified.'));}});
  });
}
const fingerprint=()=>db.system(async c=>(await c.query(`select encode(extensions.digest(jsonb_build_object(
  'users',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from auth.users t),
  'identities',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from auth.identities t),
  'sessions',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from auth.sessions t),
  'profiles',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.profiles t),
  'contexts',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from public.account_contexts t))::text,'sha256'),'hex') as digest`)).rows[0].digest);
try{
  const baseline=await db.system(c=>readStorageSnapshot(c));
  if(baseline.objects.length||baseline.assets.length||baseline.multipartUploads)throw new Error('Run this isolated provider check before operational media exists.');
  const owner=await db.system(async c=>(await c.query(`select x.id from public.account_contexts x join auth.users u on u.id=x.auth_user_id
    where x.kind='primary' and x.status='active' and u.email_confirmed_at is not null and not coalesce(u.is_anonymous,false)
    and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
      and i.identity_data->>'email_verified'='true' and lower(i.identity_data->>'email')=lower(u.email))
    and exists(select 1 from auth.sessions s where s.user_id=u.id and (s.not_after is null or s.not_after>now()))
    order by x.id limit 1`)).rows[0]);
  if(!owner)throw new Error('An existing verified Google primary owner with an actual native session is required.');
  const before=await fingerprint(),id=crypto.randomUUID();image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  objectPath=`contexts/${owner.id}/${id}.png`;journal=path.join(directory,id+'.provider-check.json');record('prepared');
  console.log(JSON.stringify({phase:'temporary_private_image_upload',checks}));
  await storage.upload(objectPath,image);record('uploaded');
  const expected={byte_size:image.length,sha256:crypto.createHash('sha256').update(image).digest('hex')};
  const downloaded=await storage.download(objectPath,expected);try{check(downloaded.equals(image));}finally{downloaded.fill(0);}
  console.log(JSON.stringify({phase:'database_checkpoint_and_full_restore',checks}));
  const backup=await run('scripts/backup-supabase-database.ts');
  const checkpointId=path.basename(backup.archive,'.pvpg');
  const restored=await run('scripts/rehearse-supabase-backup.ts',[checkpointId]);
  check(restored.isolatedLocalRestorePassed&&restored.storageObjects===1);record('database_restored',{checkpointId});
  console.log(JSON.stringify({phase:'encrypted_storage_backup_and_byte_reconstruction',checks}));
  const saved=await run('scripts/backup-supabase-storage.ts',[checkpointId]);
  check(saved.objects===1&&saved.orphanObjects===1&&saved.encrypted&&saved.roundTripVerified);
  const rehearsal=await run('scripts/rehearse-supabase-storage-backup.ts',[checkpointId,saved.id]);
  check(rehearsal.localByteReconstructionPassed&&rehearsal.objects===1&&rehearsal.bytes===image.length);
  const {binding,snapshot}=await storageCheckpoint(checkpointId);let recovered=false;
  verifyStorageBackup(directory,saved.id,binding,snapshot,(entry,bytes)=>{check(entry.path===objectPath&&bytes.equals(image));recovered=true;});check(recovered);
  record('archive_verified',{checkpointId,archiveId:saved.id});
  // Exercise archive -> actual provider upload -> verified download too. Removal
  // remains confined to this exact journaled, unpublished, generated test object.
  await storage.remove(objectPath);record('provider_restore_pending',{checkpointId,archiveId:saved.id});
  let restoredBytes:Buffer|undefined;
  verifyStorageBackup(directory,saved.id,binding,snapshot,(_,bytes)=>{restoredBytes=Buffer.from(bytes);});
  try{await storage.upload(objectPath,restoredBytes!);}finally{restoredBytes?.fill(0);}
  const roundTrip=await storage.download(objectPath,expected);try{check(roundTrip.equals(image));}finally{roundTrip.fill(0);}
  record('provider_restore_verified',{checkpointId,archiveId:saved.id});
  await storage.remove(objectPath);cleaned=true;
  check(storageSnapshotDigest(await db.system(c=>readStorageSnapshot(c)))===storageSnapshotDigest(baseline));
  check(await fingerprint()===before);
  record('complete',{checkpointId,archiveId:saved.id,checks,providerReuploadVerified:true});
  console.log(JSON.stringify({passed:true,checks,checkpointId,archiveId:saved.id,actualImageBytes:image.length,
    providerUploadDownloadVerified:true,encryptedArchiveVerified:true,localByteReconstructionPassed:true,providerReuploadVerified:true,
    temporaryObjectRemoved:true,authRecordsChanged:0,applicationRecordsChanged:0,providerMocks:0,writerFreezeVerified:false}));
}catch{
  console.error(JSON.stringify({storageRecoveryAcceptanceFailed:true,checks,cleanupRequired:!!objectPath&&!cleaned}));process.exitCode=1;
}finally{
  image?.fill(0);
  if(objectPath&&!cleaned) {
    try{await storage.remove(objectPath);record('failed_but_object_removed',{checks});}
    catch{console.error(JSON.stringify({temporaryObjectCleanupPending:true,journalRetainedPrivately:true}));process.exitCode=1;}
  }
  await db.close();
}
