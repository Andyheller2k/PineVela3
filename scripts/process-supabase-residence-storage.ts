/** Read-only by default. --execute processes only native, already approved jobs. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {processResidenceStorageTask} from './lib/residence-storage-worker.js';
dotenv.config({quiet:true});
if(process.argv.length>3||process.argv[2]&&process.argv[2]!=='--execute')throw new Error('Only --execute is accepted.');
const db=new SupabaseDatabase();
try{
 const jobs=(await db.pool.query(`select t.asset_id from private.residence_storage_cleanup_tasks t
  where not exists(select 1 from private.residence_storage_cleanup_attempts a where a.asset_id=t.asset_id and a.state='completed')
  order by t.created_at,t.asset_id limit 20`)).rows;
 if(!process.argv[2])console.log(JSON.stringify({pendingInBatch:jobs.length,batchLimit:20,readOnly:true}));
 else{
  let completed=0,skipped=0,failed=0;
  for(const job of jobs)try{const result=await processResidenceStorageTask(db,job.asset_id);if('claimed' in result)skipped++;else completed++;}
  catch(error){
   failed++;const file=path.join('.security/migration-reset',crypto.randomUUID()+'.residence-storage-worker.log');
   fs.writeFileSync(file,error instanceof Error?error.stack||error.message:'Cleanup failed',{mode:0o600});
  }
  console.log(JSON.stringify({completed,skipped,failed,batchLimit:20,publicExecutionEnabled:false}));if(failed)process.exitCode=1;
 }
}finally{await db.close();}
