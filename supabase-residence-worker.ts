/** Standalone production worker. Preview is the default; no public HTTP listener. */
import {setTimeout as pause} from 'node:timers/promises';
import dotenv from 'dotenv';
import {SupabaseDatabase} from './supabase/db.js';
import {runResidenceWorkerBatch,residenceWorkerDiagnostic} from './scripts/lib/residence-worker-batch.js';
dotenv.config({quiet:true});
const args=process.argv.slice(2);
if(args.some(a=>!['--execute','--watch'].includes(a))||new Set(args).size!==args.length){
 console.error('Only --execute and --watch are accepted.');process.exit(2);
}
const execute=args.includes('--execute'),watch=args.includes('--watch'),stop=new AbortController();
const requestStop=()=>{if(!stop.signal.aborted){stop.abort();console.log(JSON.stringify({event:'stopping',drainingCurrentJob:true}));}};
process.once('SIGTERM',requestStop);process.once('SIGINT',requestStop);
let db:SupabaseDatabase|undefined,started=false;
try{
 db=new SupabaseDatabase();
 if(!(await db.pool.query("select 1 from private.schema_migrations where version='20261012014440'")).rowCount)
  throw new Error('Apply all Supabase migrations before starting the residence worker.');
 const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
 started=true;
 console.log(JSON.stringify({event:'started',readOnly:!execute,watch,pollSeconds:15}));
 while(!stop.signal.aborted){
  try{
   const outcome=await runResidenceWorkerBatch(db,{execute,projectRef,signal:stop.signal});
   console.log(JSON.stringify({event:'cycle',...outcome}));
   if(!watch&&(outcome.execution.failed||outcome.storage.failed))process.exitCode=1;
  }catch(error){
   residenceWorkerDiagnostic(error);console.error(JSON.stringify({event:'cycle_failed',diagnosticSavedPrivately:true}));
   if(!watch)process.exitCode=1;
  }
  if(!watch||stop.signal.aborted)break;
  try{await pause(15000,undefined,{signal:stop.signal});}catch(error){if(!stop.signal.aborted)throw error;}
 }
}catch(error){
 try{residenceWorkerDiagnostic(error);}catch{/* Never expose credentials when private diagnostics are unavailable. */}
 console.error(JSON.stringify({event:started?'worker_failed':'startup_failed',readOnly:!execute}));process.exitCode=1;
}finally{
 await db?.close();
 console.log(JSON.stringify({event:'stopped',drained:true}));
 process.removeListener('SIGTERM',requestStop);process.removeListener('SIGINT',requestStop);
}
