/** Private, authenticated object-byte recovery archives. This module performs no
 * cloud writes and grants no deletion authority. PostgreSQL and Storage must be
 * frozen separately before a checkpoint can authorize destructive execution. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {PoolClient} from 'pg';
import {MEDIA_BUCKET,MAX_MEDIA_BYTES,isStorageFolderMarker} from './storage.js';

const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest=/^[a-f0-9]{64}$/;
const objectPath=/^contexts\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\/([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.(png|webp)$/;
const MAX_OBJECTS=10000,MAX_TOTAL_BYTES=4*1024*1024*1024,MAX_MANIFEST_BYTES=32*1024*1024;
type Row=Record<string,any>;
export type StorageSnapshot={buckets:Row[];objects:Row[];assets:Row[];multipartUploads:number};
export type StorageBackupBinding={projectRef:string;checkpointId:string;dumpSha256:string};
type Entry={id:string;path:string;byte_size:number;sha256:string;file:string;source:'asset'|'orphan'};
type Manifest={version:1;id:string;binding:StorageBackupBinding;inventoryDigest:string;createdAt:string;snapshot:StorageSnapshot;entries:Entry[]};
const sha=(bytes:Buffer|string)=>crypto.createHash('sha256').update(bytes).digest('hex');
export function canonical(value:any):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value!==null&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  const result=JSON.stringify(value);if(result===undefined)throw new Error('Unsupported recovery metadata.');return result;
}
export function storageSnapshotDigest(snapshot:StorageSnapshot){return sha(canonical(snapshot));}
/** One MVCC statement captures the supported catalog, including orphan uploads.
 * Limit+1 sentinels force oversized inventories to fail instead of silently
 * treating pagination/truncation as a complete backup. */
export async function readStorageSnapshot(c:PoolClient):Promise<StorageSnapshot> {
  return (await c.query(`select jsonb_build_object(
    'buckets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from storage.buckets order by id limit 501) t),
    'objects',(select coalesce(jsonb_agg(to_jsonb(t) order by bucket_id,name,id),'[]'::jsonb) from (select * from storage.objects order by bucket_id,name,id limit 10001) t),
    'assets',(select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from (select * from public.media_assets order by id limit 10001) t),
    'multipartUploads',(select count(*) from storage.s3_multipart_uploads)) as snapshot`)).rows[0].snapshot;
}
function validBinding(b:StorageBackupBinding) {
  if(!b||!/^[a-z0-9]{20}$/.test(b.projectRef)||!uuid.test(b.checkpointId)||!digest.test(b.dumpSha256))throw new Error('Invalid database recovery binding.');
}
/** Unsupported/foreign objects block a full recovery claim rather than being
 * silently skipped. Non-ready reservations without an object remain metadata;
 * ready assets without bytes are always a hard failure. */
export function storageRecoveryObjects(snapshot:StorageSnapshot) {
  if(!snapshot||!Array.isArray(snapshot.buckets)||!Array.isArray(snapshot.objects)||!Array.isArray(snapshot.assets)||
    snapshot.buckets.length>500||snapshot.objects.length>MAX_OBJECTS||snapshot.assets.length>MAX_OBJECTS||snapshot.multipartUploads!==0||
    Buffer.byteLength(canonical(snapshot))>MAX_MANIFEST_BYTES-1024*1024)throw new Error('Unsupported or unfinished Storage inventory.');
  const bucket=snapshot.buckets.find(b=>b.id===MEDIA_BUCKET);
  if(!bucket||bucket.public!==false)throw new Error('A private PineVela media bucket is required.');
  const assets=new Map<string,Row>(),objects=new Set<string>();let total=0;
  for(const a of snapshot.assets) {
    const match=typeof a.object_path==='string'?objectPath.exec(a.object_path):null;
    if(!match||match[1]!==a.owner_context_id||match[2]!==a.id||a.bucket_id!==MEDIA_BUCKET||!digest.test(a.sha256)||
      !Number.isSafeInteger(a.byte_size)||a.byte_size<1||a.byte_size>MAX_MEDIA_BYTES||assets.has(a.object_path)||
      !['ready','reserved','failed','removing'].includes(a.state))throw new Error('Invalid saved media ownership or integrity metadata.');
    assets.set(a.object_path,a);
  }
  const result=snapshot.objects.map(o=>{
    const match=typeof o.name==='string'?objectPath.exec(o.name):null;
    const size=typeof o.metadata?.size==='number'?o.metadata.size:NaN;
    if(o.bucket_id===MEDIA_BUCKET&&uuid.test(o.id)&&isStorageFolderMarker(o.name)&&size===0&&o.metadata?.mimetype==='application/octet-stream') {
      if(objects.has(o.name)||assets.has(o.name))throw new Error('Invalid folder marker recovery metadata.');
      objects.add(o.name);
      return {id:o.id,path:o.name,byte_size:0,sha256:sha(Buffer.alloc(0)),source:'orphan' as const};
    }
    if(o.bucket_id!==MEDIA_BUCKET||!uuid.test(o.id)||!match||objects.has(o.name)||!Number.isSafeInteger(size)||
      size<1||size>MAX_MEDIA_BYTES||o.metadata?.mimetype!==`image/${match[3]}`)throw new Error('Unsupported Storage object; recovery cannot omit it.');
    objects.add(o.name);total+=size;
    if(total>MAX_TOTAL_BYTES)throw new Error('Storage recovery exceeds the bounded archive capacity.');
    const a=assets.get(o.name);
    if(a&&a.byte_size!==size)throw new Error('Storage size differs from the saved media reservation.');
    return {id:match[2],path:o.name,byte_size:size,sha256:a?.sha256 as string|undefined,source:(a?'asset':'orphan') as 'asset'|'orphan'};
  });
  for(const a of assets.values())if(a.state==='ready'&&!objects.has(a.object_path))throw new Error('Ready media is missing its Storage object.');
  if(new Set(result.map(o=>o.id)).size!==result.length)throw new Error('Storage recovery object IDs are ambiguous.');
  return result;
}
export function privateRecoveryDirectory(directory:string) {
  const s=fs.lstatSync(directory);if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0)throw new Error('Recovery directory must be private and regular.');
}
export function readPrivateRecoveryFile(file:string,maximum:number) {
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {const s=fs.fstatSync(fd);if(!s.isFile()||(s.mode&0o077)!==0||s.size>maximum)throw new Error('Private bounded recovery file required.');
    const bytes=fs.readFileSync(fd);if(bytes.length!==s.size||bytes.length>maximum)throw new Error('Recovery file changed during reading.');return bytes;
  }finally{fs.closeSync(fd);}
}
function writePrivate(file:string,bytes:Buffer) {
  const fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
function syncDirectory(directory:string){const fd=fs.openSync(directory,fs.constants.O_RDONLY);try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function seal(bytes:Buffer,key:Buffer,aad:string) {
  const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce);c.setAAD(Buffer.from(aad));
  return Buffer.concat([Buffer.from('PVSB1'),nonce,c.update(bytes),c.final(),c.getAuthTag()]);
}
function open(bytes:Buffer,key:Buffer,aad:string) {
  if(bytes.length<33||!bytes.subarray(0,5).equals(Buffer.from('PVSB1')))throw new Error('Invalid Storage recovery archive.');
  const c=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));c.setAAD(Buffer.from(aad));c.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([c.update(bytes.subarray(17,-16)),c.final()]);
}
function manifestAAD(id:string,b:StorageBackupBinding){return 'pinevela:storage:manifest:'+id+':'+canonical(b);}
function objectAAD(id:string,b:StorageBackupBinding,inventory:string,e:Entry){return 'pinevela:storage:object:'+id+':'+canonical(b)+':'+inventory+':'+canonical(e);}

export async function createStorageBackup(directory:string,binding:StorageBackupBinding,snapshot:StorageSnapshot,
  download:(object:ReturnType<typeof storageRecoveryObjects>[number])=>Promise<Buffer>,
  recheck:()=>Promise<StorageSnapshot>) {
  privateRecoveryDirectory(directory);validBinding(binding);const objects=storageRecoveryObjects(snapshot);
  const id=crypto.randomUUID(),inventoryDigest=storageSnapshotDigest(snapshot),key=crypto.randomBytes(32);
  const partial=path.join(directory,'.partial-'+id),destination=path.join(directory,id+'.pvstorage');
  fs.mkdirSync(partial,{mode:0o700});
  try {
    writePrivate(path.join(partial,'key'),key);const entries:Entry[]=[];
    for(const o of objects) {
      const bytes=await download(o);
      try{
        const hash=sha(bytes);if(bytes.length!==o.byte_size||(o.sha256&&o.sha256!==hash))throw new Error('Storage recovery bytes do not match the saved object.');
        const entry:Entry={...o,sha256:hash,file:o.id+'.pvblob'};
        writePrivate(path.join(partial,entry.file),seal(bytes,key,objectAAD(id,binding,inventoryDigest,entry)));entries.push(entry);
      }finally{bytes.fill(0);}
    }
    // A long network copy holds no SQL locks. Compare the resulting catalog to
    // the archived PostgreSQL snapshot. Execution additionally needs a durable
    // writer freeze; a before/after match alone never certifies one.
    if(storageSnapshotDigest(await recheck())!==inventoryDigest)throw new Error('Storage inventory changed; create a fresh database checkpoint and retry.');
    const manifest:Manifest={version:1,id,binding,inventoryDigest,createdAt:new Date().toISOString(),snapshot,entries};
    const encoded=Buffer.from(canonical(manifest));if(encoded.length>MAX_MANIFEST_BYTES)throw new Error('Storage recovery manifest is too large.');
    writePrivate(path.join(partial,'manifest.pvsb'),seal(encoded,key,manifestAAD(id,binding)));encoded.fill(0);
    // Verify every sealed file before publishing the completed directory.
    verifyDirectory(partial,id,binding,snapshot);syncDirectory(partial);
    fs.renameSync(partial,destination);syncDirectory(directory);
    return {id,objects:entries.length,orphanObjects:entries.filter(e=>e.source==='orphan').length,folderMarkers:entries.filter(e=>isStorageFolderMarker(e.path)).length,bytes:entries.reduce((n,e)=>n+e.byte_size,0),inventoryDigest};
  }catch(error){fs.rmSync(partial,{recursive:true,force:true});throw error;}finally{key.fill(0);}
}
function verifyDirectory(directory:string,id:string,binding:StorageBackupBinding,expected:StorageSnapshot,
  onObject?:(entry:Entry,bytes:Buffer)=>void) {
  privateRecoveryDirectory(directory);validBinding(binding);if(!uuid.test(id))throw new Error('Invalid Storage recovery ID.');
  const key=readPrivateRecoveryFile(path.join(directory,'key'),32);if(key.length!==32)throw new Error('Invalid Storage recovery key.');
  try {
    const bytes=open(readPrivateRecoveryFile(path.join(directory,'manifest.pvsb'),MAX_MANIFEST_BYTES+33),key,manifestAAD(id,binding));
    let m:Manifest;try{m=JSON.parse(bytes.toString());}finally{bytes.fill(0);}
    if(m.version!==1||m.id!==id||canonical(m.binding)!==canonical(binding)||m.inventoryDigest!==storageSnapshotDigest(expected)||
      storageSnapshotDigest(m.snapshot)!==m.inventoryDigest||!Array.isArray(m.entries))throw new Error('Storage recovery does not match the database checkpoint.');
    const originals=storageRecoveryObjects(expected);
    if(m.entries.length!==originals.length)throw new Error('Incomplete Storage recovery archive.');
    const files=new Set(['key','manifest.pvsb']);let total=0;
    for(let i=0;i<originals.length;i++) {
      const e=m.entries[i],o=originals[i];
      if(!e||e.id!==o.id||e.path!==o.path||e.byte_size!==o.byte_size||e.source!==o.source||!digest.test(e.sha256)||
        (o.sha256&&e.sha256!==o.sha256)||e.file!==o.id+'.pvblob'||files.has(e.file))throw new Error('Storage recovery object manifest mismatch.');
      files.add(e.file);
      const data=open(readPrivateRecoveryFile(path.join(directory,e.file),MAX_MEDIA_BYTES+33),key,objectAAD(id,binding,m.inventoryDigest,e));
      try{if(data.length!==e.byte_size||sha(data)!==e.sha256)throw new Error('Storage recovery object integrity failed.');total+=data.length;onObject?.(e,data);}finally{data.fill(0);}
    }
    if(fs.readdirSync(directory).some(f=>!files.has(f)))throw new Error('Unexpected Storage recovery files.');
    return {objects:originals.length,orphanObjects:originals.filter(e=>e.source==='orphan').length,folderMarkers:originals.filter(e=>isStorageFolderMarker(e.path)).length,bytes:total,inventoryDigest:m.inventoryDigest};
  }finally{key.fill(0);}
}
export function verifyStorageBackup(directory:string,id:string,binding:StorageBackupBinding,snapshot:StorageSnapshot,
  onObject?:(entry:Entry,bytes:Buffer)=>void) {
  privateRecoveryDirectory(directory);if(!uuid.test(id))throw new Error('Invalid Storage recovery ID.');
  return verifyDirectory(path.join(directory,id+'.pvstorage'),id,binding,snapshot,onObject);
}
