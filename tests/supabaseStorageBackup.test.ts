import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createStorageBackup,verifyStorageBackup,storageRecoveryObjects,storageSnapshotDigest,readPrivateRecoveryFile,
  type StorageSnapshot,type StorageBackupBinding} from '../supabase/storageBackup.js';
import {SupabaseStorage} from '../supabase/storage.js';

// Use the project's current PineVela PNG bytes. These filesystem-only recovery
// tests create no application accounts/data and simulate no provider response.
const image=fs.readFileSync('public/icons/pinevela-192.png'),hash=crypto.createHash('sha256').update(image).digest('hex');
function fixture() {
  const owner=crypto.randomUUID(),asset=crypto.randomUUID(),orphan=crypto.randomUUID();
  const snapshot:StorageSnapshot={buckets:[{id:'pinevela-media',public:false}],multipartUploads:0,
    assets:[{id:asset,owner_context_id:owner,bucket_id:'pinevela-media',object_path:`contexts/${owner}/${asset}.png`,byte_size:image.length,sha256:hash,state:'ready'}],
    objects:[asset,orphan].map(id=>({id:crypto.randomUUID(),name:`contexts/${owner}/${id}.png`,bucket_id:'pinevela-media',metadata:{size:image.length,mimetype:'image/png'}}))};
  const binding:StorageBackupBinding={projectRef:'abcdefghijklmnopqrst',checkpointId:crypto.randomUUID(),dumpSha256:hash};
  const directory=fs.mkdtempSync('/tmp/pv-storage-test-');fs.chmodSync(directory,0o700);
  return {snapshot,binding,directory};
}
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
async function archive(f:ReturnType<typeof fixture>) {
  return createStorageBackup(f.directory,f.binding,f.snapshot,async()=>Buffer.from(image),async()=>f.snapshot);
}
async function using(work:(f:ReturnType<typeof fixture>)=>Promise<void>|void){const f=fixture();try{await work(f);}finally{fs.rmSync(f.directory,{recursive:true,force:true});}}

test('actual image bytes and orphan objects recover from authenticated encrypted files',async()=>using(async f=>{
  const saved=await archive(f);assert.equal(saved.objects,2);assert.equal(saved.orphanObjects,1);
  let restored=0;
  const result=verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot,(_,bytes)=>{assert.deepEqual(bytes,image);restored++;});
  assert.equal(restored,2);assert.equal(result.bytes,image.length*2);
  const dir=path.join(f.directory,saved.id+'.pvstorage');
  assert.equal(fs.statSync(dir).mode&0o077,0);
  for(const file of fs.readdirSync(dir)) {
    assert.equal(fs.statSync(path.join(dir,file)).mode&0o077,0);
    if(file!=='key')assert.equal(fs.readFileSync(path.join(dir,file)).includes(image.subarray(0,64)),false);
  }
}));
test('empty bucket recovery is verified without claiming object-byte provider coverage',async()=>using(async f=>{
  f.snapshot.assets=[];f.snapshot.objects=[];let reads=0;
  const saved=await createStorageBackup(f.directory,f.binding,f.snapshot,async()=>{reads++;throw new Error('Unexpected download.');},async()=>f.snapshot);
  assert.equal(reads,0);assert.equal(verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot).objects,0);
}));
test('metadata key order does not invalidate the same PostgreSQL snapshot',async()=>using(f=>{
  const s=copy(f.snapshot);s.objects[0].metadata={mimetype:'image/png',size:image.length};
  assert.equal(storageSnapshotDigest(s),storageSnapshotDigest(f.snapshot));
}));
test('changed catalog discards the entire partial archive',async()=>using(async f=>{
  const changed=copy(f.snapshot);changed.assets[0].state='removing';
  await assert.rejects(createStorageBackup(f.directory,f.binding,f.snapshot,async()=>Buffer.from(image),async()=>changed),/inventory changed/);
  assert.deepEqual(fs.readdirSync(f.directory),[]);
}));
test('failed download publishes no completion marker or leftover key',async()=>using(async f=>{
  let reads=0;
  await assert.rejects(createStorageBackup(f.directory,f.binding,f.snapshot,async()=>{if(reads++)throw new Error('Interrupted read.');return Buffer.from(image);},async()=>f.snapshot),/Interrupted/);
  assert.deepEqual(fs.readdirSync(f.directory),[]);
}));
test('incorrect byte size and digest block archive creation',async()=>using(async f=>{
  for(const bad of [image.subarray(1),Buffer.alloc(image.length)]) {
    await assert.rejects(createStorageBackup(f.directory,f.binding,f.snapshot,async()=>Buffer.from(bad),async()=>f.snapshot),/do not match/);
    assert.deepEqual(fs.readdirSync(f.directory),[]);
  }
}));
test('project, checkpoint and database digest are cryptographically bound',async()=>using(async f=>{
  const saved=await archive(f);
  for(const binding of [{...f.binding,projectRef:'zyxwvutsrqponmlkjihg'},{...f.binding,checkpointId:crypto.randomUUID()},{...f.binding,dumpSha256:'0'.repeat(64)}])
    assert.throws(()=>verifyStorageBackup(f.directory,saved.id,binding,f.snapshot));
}));
test('a different saved object inventory cannot borrow a valid archive',async()=>using(async f=>{
  const saved=await archive(f),changed=copy(f.snapshot);changed.objects[0].metadata.etag='different';
  assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,changed),/does not match/);
}));
for(const kind of ['manifest','object','key'] as const)test(`tampered ${kind} blocks recovery`,async()=>using(async f=>{
  const saved=await archive(f),directory=path.join(f.directory,saved.id+'.pvstorage');
  const file=kind==='manifest'?'manifest.pvsb':kind==='key'?'key':fs.readdirSync(directory).find(n=>n.endsWith('.pvblob'))!;
  const target=path.join(directory,file),bytes=fs.readFileSync(target);bytes[bytes.length-1]^=1;fs.writeFileSync(target,bytes);
  assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot));
}));
test('missing and extra files block a complete recovery claim',async()=>using(async f=>{
  const saved=await archive(f),directory=path.join(f.directory,saved.id+'.pvstorage');
  fs.writeFileSync(path.join(directory,'extra'),image,{mode:0o600});
  assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot),/Unexpected/);
  fs.unlinkSync(path.join(directory,'extra'));
  fs.unlinkSync(path.join(directory,fs.readdirSync(directory).find(n=>n.endsWith('.pvblob'))!));
  assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot));
}));
test('cross-archive object swaps cannot pass authentication',async()=>using(async f=>{
  const a=await archive(f),b=await archive(f),first=path.join(f.directory,a.id+'.pvstorage'),second=path.join(f.directory,b.id+'.pvstorage');
  const file=fs.readdirSync(first).find(n=>n.endsWith('.pvblob'))!;
  fs.copyFileSync(path.join(second,file),path.join(first,file));
  assert.throws(()=>verifyStorageBackup(f.directory,a.id,f.binding,f.snapshot));
}));
test('symlinks, public files and path traversal are refused',async()=>using(async f=>{
  const saved=await archive(f),directory=path.join(f.directory,saved.id+'.pvstorage'),key=path.join(directory,'key');
  fs.chmodSync(key,0o644);assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot),/Private bounded/);
  fs.chmodSync(key,0o600);fs.renameSync(key,key+'.saved');fs.symlinkSync(key+'.saved',key);
  assert.throws(()=>verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot));
  assert.throws(()=>verifyStorageBackup(f.directory,'../../anything',f.binding,f.snapshot),/Invalid/);
  const changed=copy(f.snapshot);changed.objects[0].name='../../outside.png';assert.throws(()=>storageRecoveryObjects(changed),/Unsupported Storage/);
}));
test('oversized private files are rejected before reading bytes',async()=>using(f=>{
  const file=path.join(f.directory,'bounded');fs.writeFileSync(file,image,{mode:0o600});
  assert.throws(()=>readPrivateRecoveryFile(file,16),/Private bounded/);
}));
test('ready media without object bytes and mismatched ownership are refused',async()=>using(f=>{
  for(const mutate of [(s:StorageSnapshot)=>{s.objects=[];},(s:StorageSnapshot)=>{s.assets[0].owner_context_id=crypto.randomUUID();},
    (s:StorageSnapshot)=>{s.assets[0].byte_size++;},(s:StorageSnapshot)=>{s.assets[0].sha256='invalid';}]) {
    const changed=copy(f.snapshot);mutate(changed);assert.throws(()=>storageRecoveryObjects(changed));
  }
}));
test('foreign objects, duplicate paths, bad MIME, unsafe sizes and multipart uploads cannot be skipped',async()=>using(f=>{
  for(const mutate of [(s:StorageSnapshot)=>{s.objects[0].bucket_id='other-bucket';},(s:StorageSnapshot)=>{s.objects.push(s.objects[0]);},
    (s:StorageSnapshot)=>{s.objects[0].metadata.mimetype='text/html';},(s:StorageSnapshot)=>{s.objects[0].metadata.size=0;},
    (s:StorageSnapshot)=>{s.objects[0].metadata.size=6291457;},(s:StorageSnapshot)=>{s.multipartUploads=1;},(s:StorageSnapshot)=>{s.buckets[0].public=true;}]) {
    const changed=copy(f.snapshot);mutate(changed);assert.throws(()=>storageRecoveryObjects(changed));
  }
}));
test('unfinished reservations without object bytes remain recoverable metadata',async()=>using(async f=>{
  f.snapshot.objects=[];f.snapshot.assets[0].state='failed';const saved=await archive(f);
  assert.equal(verifyStorageBackup(f.directory,saved.id,f.binding,f.snapshot).objects,0);
}));
test('normal image downloads still require the saved digest before any provider call',async()=>{
  const storage=new SupabaseStorage();
  for(const sha256 of [undefined,null,'','invalid'])await assert.rejects(storage.download('unused',{byte_size:image.length,sha256:sha256 as any}),/integrity metadata is required/);
  for(const byte_size of [0,-1,6*1024*1024+1,1.5])await assert.rejects(storage.downloadForBackup('unused',{byte_size}),/Invalid photograph recovery metadata/);
});
test('capacity limits reject a truncated catalog rather than treating it as a full snapshot',async()=>using(f=>{
  for(const field of ['objects','assets'] as const) {
    const changed=copy(f.snapshot);changed[field]=Array.from({length:10001},()=>({}));
    assert.throws(()=>storageRecoveryObjects(changed),/Unsupported or unfinished/);
  }
  const changed=copy(f.snapshot);changed.buckets=Array.from({length:501},()=>({}));
  assert.throws(()=>storageRecoveryObjects(changed),/Unsupported or unfinished/);
}));
