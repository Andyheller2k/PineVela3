/** Operator-only recovery preparation. Never grants consent or performs deletion. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import dotenv from 'dotenv';
import {SupabaseDatabase,ApiError,uuid} from '../supabase/db.js';
import {privateRecoveryDirectory} from '../supabase/storageBackup.js';
import {attachResidenceRecovery,recoveryPreparation} from './lib/residence-recovery.js';
dotenv.config({quiet:true});
const args=process.argv.slice(2);
let db:SupabaseDatabase|undefined,journal:string|undefined;
async function command(script:string,values:string[]) {
  return new Promise<any>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx',script,...values],{stdio:['ignore','pipe','pipe'],env:process.env});
    const output:Buffer[]=[];let bytes=0,failed=false;
    const timeout=setTimeout(()=>{failed=true;child.kill('SIGTERM');},360000);
    child.stdout.on('data',(b:Buffer)=>{bytes+=b.length;if(bytes>2*1024*1024){failed=true;child.kill('SIGTERM');}else output.push(b);});
    // Diagnostics can include server connection details. Keep them out of public output.
    child.stderr.on('data',()=>{});
    child.on('error',()=>{clearTimeout(timeout);reject(new Error('Recovery subprocess could not start.'));});
    child.on('close',code=>{clearTimeout(timeout);if(failed||code!==0)return reject(new Error('Recovery subprocess did not complete.'));
      try{const lines=Buffer.concat(output).toString().trim().split('\n');resolve(JSON.parse(lines.at(-1)!));}catch{reject(new Error('Recovery subprocess did not return a verified result.'));}});
  });
}
try {
  if(args.length!==1&&args.length!==3)throw new Error('Pass a proposal UUID, or a proposal UUID plus database checkpoint and Storage archive UUIDs.');
  const [proposalId]=args.map(uuid);db=new SupabaseDatabase();
  await db.system(c=>recoveryPreparation(c,proposalId));
  for(const directory of ['.security','.security/migration-reset'])privateRecoveryDirectory(path.resolve(directory));
  const dir=path.resolve('.security/migration-reset/residence-recovery');if(!fs.existsSync(dir))fs.mkdirSync(dir,{mode:0o700});privateRecoveryDirectory(dir);
  journal=path.join(dir,proposalId+'.'+crypto.randomUUID()+'.json');
  let checkpointId=args[1],storageId=args[2];
  const progress:any={proposalId,startedAt:new Date().toISOString(),state:'preparing',checkpointId:checkpointId||null,storageArchiveId:storageId||null};
  const save=()=>{const fd=fs.openSync(journal!,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_NOFOLLOW,0o600);
    try{fs.writeFileSync(fd,JSON.stringify(progress,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};save();
  if(args.length===1){
    const backup=await command('scripts/backup-supabase-database.ts',[]);
    checkpointId=uuid(path.basename(backup.archive,'.pvpg'));progress.checkpointId=checkpointId;save();
    await command('scripts/rehearse-supabase-backup.ts',[checkpointId]);progress.state='database-restored';save();
    const storage=await command('scripts/backup-supabase-storage.ts',[checkpointId]);storageId=uuid(storage.id);
    progress.storageArchiveId=storageId;progress.state='storage-backed-up';save();
  }else{uuid(checkpointId);uuid(storageId);}
  const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
  const result=await attachResidenceRecovery(db,projectRef,proposalId,checkpointId,storageId);
  progress.state='recorded';progress.finishedAt=new Date().toISOString();save();
  console.log(JSON.stringify({...result,housingPauseVerified:true,projectWideWriterFreezeVerified:false,noDeletionPerformed:true,cloudObjectsModified:0}));
}catch(error){
  console.error(JSON.stringify({recoveryPreparationFailed:true,noDeletionPerformed:true,
    code:error instanceof ApiError?error.code||'recovery_rejected':'recovery_incomplete',journalRetained:!!journal}));
  process.exitCode=1;
}finally{await db?.close();}
