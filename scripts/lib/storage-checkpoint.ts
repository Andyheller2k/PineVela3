import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './isolated-postgres.js';
import {privateRecoveryDirectory,readPrivateRecoveryFile,readStorageSnapshot,verifyStorageBackup,type StorageBackupBinding,type StorageSnapshot} from '../../supabase/storageBackup.js';
import {isStorageFolderMarker} from '../../supabase/storage.js';

export function storageArchiveRoot() {
  // Do not follow a replaced .security parent into a public directory.
  for(const dir of ['.security','.security/migration-reset'])privateRecoveryDirectory(path.resolve(dir));
  const directory=path.resolve('.security/migration-reset/storage');
  if(!fs.existsSync(directory))fs.mkdirSync(directory,{mode:0o700});
  privateRecoveryDirectory(directory);return directory;
}
export async function storageCheckpoint<T=undefined>(checkpointId:string,inspect?: (client:PoolClient)=>Promise<T>) {
  if(!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(checkpointId))throw new Error('Pass the database checkpoint UUID.');
  for(const dir of ['.security','.security/migration-reset'])privateRecoveryDirectory(path.resolve(dir));
  const directory=path.resolve('.security/migration-reset');
  const metadata=JSON.parse(readPrivateRecoveryFile(path.join(directory,checkpointId+'.json'),1024*1024).toString());
  const rehearsal=JSON.parse(readPrivateRecoveryFile(path.join(directory,checkpointId+'.restore.json'),1024*1024).toString());
  if(!metadata.accessControlIncluded||!metadata.encrypted||!metadata.decryptedRoundTripVerified||
    !['auth','public','private','storage'].every(s=>metadata.sourceSchemas?.includes(s))||
    !rehearsal.isolatedLocalRestorePassed||rehearsal.archiveSha256!==metadata.dumpSha256||
    (metadata.serverSecrets&&!rehearsal.serverPinKeyVerified))throw new Error('A fully rehearsed privilege-aware database checkpoint is required.');
  const binding:StorageBackupBinding={projectRef:metadata.projectRef,checkpointId,dumpSha256:metadata.dumpSha256};
  const snapshot=await withIsolatedBackup(checkpointId,async config=>{
    const pool=new Pool(config),client=await pool.connect();
    try{return {catalog:await readStorageSnapshot(client),inspection:inspect?await inspect(client):undefined};}finally{client.release();await pool.end();}
  });
  return {binding,snapshot:snapshot.catalog,inspection:snapshot.inspection,createdAt:metadata.createdAt};
}
/** Reconstruct actual archive bytes into private local files; no provider writes. */
export function reconstructStorageBackup(archiveId:string,binding:StorageBackupBinding,snapshot:StorageSnapshot) {
  const temporary=fs.mkdtempSync(path.join('/tmp','pv-storage-restore-'));fs.chmodSync(temporary,0o700);
  try{return verifyStorageBackup(storageArchiveRoot(),archiveId,binding,snapshot,(entry,bytes)=>{
    const file=path.join(temporary,entry.id+(isStorageFolderMarker(entry.path)?'.folder-marker':'.png')),fd=fs.openSync(file,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
    try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const recovered=fs.readFileSync(file);
    try{if(recovered.length!==entry.byte_size||crypto.createHash('sha256').update(recovered).digest('hex')!==entry.sha256)throw new Error('Reconstructed photograph integrity failed.');}
    finally{recovered.fill(0);}
  });}finally{fs.rmSync(temporary,{recursive:true,force:true});}
}
