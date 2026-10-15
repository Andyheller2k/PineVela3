import type {SupabaseDatabase} from '../../supabase/db.js';
import {ApiError} from '../../supabase/db.js';
import {systemWipeExecutionRequestsEnabled} from '../../supabase/systemWipeExecutionRequests.js';
import {processSystemWipeExecutionRequest} from './system-wipe-execution-worker.js';
import {residenceWorkerDiagnostic} from './residence-worker-batch.js';

/** Bounded polling; preview neither restores archives nor changes request states. */
export async function runSystemWipeWorkerBatch(db:SupabaseDatabase,options:{execute:boolean;projectRef:string;signal?:AbortSignal}){
 const execution={pending:0,completed:0,invalidated:0,skipped:0,failed:0};
 const result=()=>({readOnly:!options.execute,stopping:options.signal?.aborted===true,limit:10,execution,storageObjectsModified:0});
 if(options.signal?.aborted)return result();
 if(options.execute&&!systemWipeExecutionRequestsEnabled())throw new ApiError(503,'Reviewed wipe execution is not enabled.');
 const rows=(await db.pool.query("select id from private.system_wipe_execution_requests where state='requested'order by created_at,id limit 10")).rows;
 execution.pending=rows.length;
 if(options.execute)for(const row of rows){
  if(options.signal?.aborted)break;
  try{
   const outcome=await processSystemWipeExecutionRequest(db,row.id,options.projectRef);
   if('skipped'in outcome||'noChange'in outcome)execution.skipped++;
   else if(outcome.status==='invalidated')execution.invalidated++;else execution.completed++;
  }catch(error){residenceWorkerDiagnostic(error);execution.failed++;}
 }
 return result();
}
