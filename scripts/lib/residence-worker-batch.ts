/** Bounded durable polling. Provider/Auth authority remains in the native workers. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type {SupabaseDatabase} from '../../supabase/db.js';
import {privateRecoveryDirectory} from '../../supabase/storageBackup.js';
import {processResidenceExecutionRequest} from './residence-execution-worker.js';
import {processResidenceStorageTask} from './residence-storage-worker.js';

export function residenceWorkerDiagnostic(error:unknown) {
 const root=path.resolve('.security/migration-reset');
 privateRecoveryDirectory(path.resolve('.security'));privateRecoveryDirectory(root);
 const fd=fs.openSync(path.join(root,crypto.randomUUID()+'.residence-worker.log'),
  fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,error instanceof Error?error.stack||error.message:'Worker failed');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
}
export async function runResidenceWorkerBatch(db:SupabaseDatabase,options:{execute:boolean;projectRef:string;signal?:AbortSignal}) {
 const execution={pending:0,completed:0,invalidated:0,skipped:0,failed:0};
 const storage={pending:0,completed:0,skipped:0,failed:0};
 const result=()=>({readOnly:!options.execute,stopping:options.signal?.aborted===true,limits:{execution:10,storage:20},execution,storage});
 if(options.signal?.aborted)return result();
 const requests=(await db.pool.query("select id from private.residence_execution_requests where state='requested' order by created_at,id limit 10")).rows;
 execution.pending=requests.length;
 if(options.execute)for(const request of requests){
  if(options.signal?.aborted)break;
  try{
   const outcome=await processResidenceExecutionRequest(db,request.id,options.projectRef);
   if('skipped' in outcome||'noChange' in outcome)execution.skipped++;
   else if(outcome.status==='invalidated')execution.invalidated++;else execution.completed++;
  }catch(error){residenceWorkerDiagnostic(error);execution.failed++;}
 }
 if(options.signal?.aborted)return result();
 const jobs=(await db.pool.query(`select t.asset_id from private.residence_storage_cleanup_tasks t
  where not exists(select 1 from private.residence_storage_cleanup_attempts a where a.asset_id=t.asset_id and a.state='completed')
   and not exists(select 1 from private.residence_storage_cleanup_attempts a where a.asset_id=t.asset_id
    and a.state in('claimed','deleting') and a.expires_at>clock_timestamp())
  order by t.created_at,t.asset_id limit 20`)).rows;
 storage.pending=jobs.length;
 if(options.execute)for(const job of jobs){
  if(options.signal?.aborted)break;
  try{const outcome=await processResidenceStorageTask(db,job.asset_id);if('claimed' in outcome)storage.skipped++;else storage.completed++;}
  catch(error){residenceWorkerDiagnostic(error);storage.failed++;}
 }
 return result();
}
