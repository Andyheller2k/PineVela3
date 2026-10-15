/** Read an actual full PostgreSQL checkpoint and its genuine provider marker.
 * No cloud fixture, Auth identity, provider response or Storage object is created. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError} from '../supabase/db.js';
import {SupabaseStorage,isStorageFolderMarker} from '../supabase/storage.js';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {readStorageSnapshot,storageRecoveryObjects} from '../supabase/storageBackup.js';
dotenv.config({quiet:true});
const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw new Error('Pass a genuine full PostgreSQL checkpoint UUID.');
let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try{await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);
  try{
    let error:any;
    const portrait=(await db.pool.query('select avatar_asset_id from public.profiles where avatar_asset_id is not null limit 1')).rows[0];
    check(portrait,'A genuine saved portrait is present in this checkpoint');
    try{await db.system(c=>c.query("update public.media_assets set state='failed' where id=$1",[portrait.avatar_asset_id]));}catch(e){error=e;}
    check(error?.code==='23514','Referenced portraits cannot be marked failed by operator bookkeeping');
    error=undefined;
    try{await db.system(async c=>{await c.query('set local role authenticated');await c.query("update public.media_assets set state='failed'");});}catch(e){error=e;}
    check(error?.code==='42501','Browser roles cannot perform operator metadata corrections');
    const snapshot=await db.system(c=>readStorageSnapshot(c)),objects=storageRecoveryObjects(snapshot);
    check(objects.length===snapshot.objects.length,'Every actual archived Storage object is included');
    const markers=objects.filter(o=>isStorageFolderMarker(o.path));
    check(markers.length>0,'A genuine Studio folder marker is available for provider acceptance');
    const storage=new SupabaseStorage(),hash=crypto.createHash('sha256').update(Buffer.alloc(0)).digest('hex');
    for(const marker of markers){
      check(marker.byte_size===0&&marker.sha256===hash&&marker.source==='orphan','Only empty authenticated markers receive recovery support');
      for(const change of ['size','mime','path']){
        const changed=structuredClone(snapshot),row=changed.objects.find(o=>o.name===marker.path)!;
        if(change==='size')row.metadata.size=1;
        if(change==='mime')row.metadata.mimetype='image/png';
        if(change==='path')row.name='../.emptyFolderPlaceholder';
        let refused=false;try{storageRecoveryObjects(changed);}catch{refused=true;}
        check(refused,'Adversarial marker '+change+' cannot weaken recovery validation');
      }
      const bytes=await storage.downloadForBackup(marker.path,{byte_size:0,sha256:hash});
      check(bytes.length===0,'An actual authenticated provider read verifies zero bytes');
      error=undefined;
      try{await storage.download(marker.path,{byte_size:0,sha256:hash});}catch(e){error=e;}
      check(error instanceof ApiError&&error.status===400,'Application photograph reads reject folder markers');
    }
    console.log(JSON.stringify({passed:true,checks,genuineFolderMarkers:markers.length,actualProviderMarkerRead:true,
      linkedPortraitProtected:true,cloudRecordsModified:0,cloudObjectsModified:0}));
  }finally{await db.close();}
});}catch(error){console.error(JSON.stringify({passed:false,checks,
  code:error instanceof ApiError?error.code:undefined,status:error instanceof ApiError?error.status:undefined}));process.exitCode=1;}
