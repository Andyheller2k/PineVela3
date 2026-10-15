/** Reconstruct each saved photograph locally. No provider writes. */
import {storageCheckpoint,reconstructStorageBackup} from './lib/storage-checkpoint.js';
try {
  if(process.argv.length!==4)throw new Error('Pass the database checkpoint UUID and Storage archive UUID.');
  const {binding,snapshot}=await storageCheckpoint(process.argv[2]);
  const result=reconstructStorageBackup(process.argv[3],binding,snapshot);
  console.log(JSON.stringify({...result,checkpointId:binding.checkpointId,encryptedArchiveVerified:true,localByteReconstructionPassed:true,
    cloudRecordsModified:0,cloudObjectsModified:0,providerReuploadVerified:false,writerFreezeVerified:false}));
}catch{
  console.error(JSON.stringify({storageRestoreRehearsalFailed:true,cloudRecordsModified:0,cloudObjectsModified:0}));process.exitCode=1;
}
