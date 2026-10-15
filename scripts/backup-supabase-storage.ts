/** Read-only, full object-byte backup paired to an already rehearsed PostgreSQL
 * checkpoint. Missing, changed, unsupported and foreign objects fail closed. */
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {createStorageBackup,readStorageSnapshot,storageSnapshotDigest} from '../supabase/storageBackup.js';
import {storageArchiveRoot,storageCheckpoint} from './lib/storage-checkpoint.js';

dotenv.config({quiet:true});
try {
  if(process.argv.length!==3)throw new Error('Pass one fully rehearsed database checkpoint UUID.');
  const {binding,snapshot}=await storageCheckpoint(process.argv[2]);
  const db=new SupabaseDatabase(),storage=new SupabaseStorage();
  try{
    if(new URL(process.env.SUPABASE_URL!).hostname.split('.')[0]!==binding.projectRef)throw new Error('Database checkpoint belongs to a different Supabase project.');
    const current=()=>db.system(c=>readStorageSnapshot(c));
    if(storageSnapshotDigest(await current())!==storageSnapshotDigest(snapshot))throw new Error('Live Storage differs from the PostgreSQL checkpoint. Create and rehearse a fresh database backup.');
    const result=await createStorageBackup(storageArchiveRoot(),binding,snapshot,
      o=>storage.downloadForBackup(o.path,o),current);
    console.log(JSON.stringify({...result,checkpointId:binding.checkpointId,encrypted:true,roundTripVerified:true,
      cloudRecordsModified:0,cloudObjectsModified:0,writerFreezeVerified:false}));
  }finally{await db.close();}
}catch(error){
  // Never expose libpq/HTTP diagnostics, object paths or a connection URI.
  console.error(JSON.stringify({storageBackupFailed:true,noDeletionPerformed:true,
    reason:error instanceof Error&&error.message.startsWith('Live Storage differs')?'checkpoint_changed':'recovery_incomplete'}));
  process.exitCode=1;
}
