/** Read-only by default; --execute handles only immutable keyed requests. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {processResidenceExecutionRequest} from './lib/residence-execution-worker.js';
dotenv.config({quiet:true});
if(process.argv.length>3||process.argv[2]&&process.argv[2]!=='--execute')throw new Error('Only --execute is accepted.');
const db=new SupabaseDatabase(),projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
try{
 const requests=(await db.pool.query("select id from private.residence_execution_requests where state='requested' order by created_at,id limit 10")).rows;
 if(!process.argv[2])console.log(JSON.stringify({pendingInBatch:requests.length,batchLimit:10,readOnly:true}));
 else{
  let completed=0,skipped=0,invalidated=0,failed=0;
  for(const request of requests)try{
   const result=await processResidenceExecutionRequest(db,request.id,projectRef);
   if('skipped' in result||'noChange' in result)skipped++;else if(result.status==='invalidated')invalidated++;else completed++;
  }catch(error){
   failed++;fs.writeFileSync('.security/migration-reset/'+crypto.randomUUID()+'.residence-execution-worker.log',error instanceof Error?error.stack||error.message:'Execution failed',{mode:0o600});
  }
  console.log(JSON.stringify({completed,skipped,invalidated,failed,batchLimit:10}));if(failed)process.exitCode=1;
 }
}finally{await db.close();}
