/** Operator-only immutable plan, freshly verified from the actual recovery archives. */
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {prepareResidenceCleanup} from './lib/residence-cleanup.js';
dotenv.config({quiet:true});let db:SupabaseDatabase|undefined;
try {
  if(process.argv.length!==5)throw new Error('Pass proposal, database checkpoint and Storage archive UUIDs.');
  db=new SupabaseDatabase();
  const result=await prepareResidenceCleanup(db,new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],...process.argv.slice(2) as [string,string,string]);
  console.log(JSON.stringify({...result,deletionPerformed:false,cloudObjectsModified:0}));
}catch{console.error(JSON.stringify({cleanupPlanFailed:true,deletionPerformed:false,cloudObjectsModified:0}));process.exitCode=1;}
finally{await db?.close();}
