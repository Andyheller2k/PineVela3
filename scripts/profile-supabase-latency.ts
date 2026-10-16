/** Read-only live timings. No browser credentials, fake actors or user data writes. */
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import {setTimeout as delay} from 'node:timers/promises';
import {Pool,type PoolClient} from 'pg';
import {databaseConfig,uuid} from '../supabase/db.js';
import {takeTransactionAdmission} from '../supabase/transactionAdmission.js';

dotenv.config({quiet:true});
const label=process.argv[2]||'baseline';
if(!['baseline','after'].includes(label)||process.argv.length>3)throw new Error('Pass baseline or after.');
const directory=path.resolve('.security/migration-reset');
if(!fs.statSync(directory).isDirectory()||fs.statSync(directory).mode&0o077)throw new Error('Private evidence directory required.');
const report:any={label,measuredAt:new Date().toISOString(),http:[],database:{},cloudWrites:0};
const elapsed=(start:number)=>Math.round(performance.now()-start);
report.http=await Promise.all([
 ['preview','http://127.0.0.1:3001/api/health'],
 ['provider',new URL('/auth/v1/health',process.env.SUPABASE_URL!).href],
].map(async([name,url])=>{const start=performance.now();try{
 const r=await fetch(url,{signal:AbortSignal.timeout(10000)});await r.arrayBuffer();return{name,status:r.status,ms:elapsed(start)};
}catch(e:any){return{name,error:e.cause?.code||e.name,ms:elapsed(start)};}}));
const pool=new Pool({...databaseConfig(),max:1,application_name:'pinevela-latency-profile'});
pool.on('error',()=>{});
let client:PoolClient|undefined;
let stage='connect';
try{
 const start=performance.now();client=await pool.connect();report.database.connectMs=elapsed(start);
 stage='round-trip';
 report.database.roundTripsMs=[];
 for(let i=0;i<5;i++){const t=performance.now();await client.query('select 1');report.database.roundTripsMs.push(elapsed(t));}
 report.database.admission=[];
 stage='admission';
 for(let round=0;round<2;round++)for(const mode of ['sequential','batched']){
  await client.query('begin read only');const t=performance.now();
  try{
   if(mode==='batched')await takeTransactionAdmission(client,{administrator:'read'});
   else for(const key of ['residence-deletion-freeze','account-policies','platform-maintenance','platform-settings'])
    await client.query('select pg_advisory_xact_lock_shared(hashtextextended($1,0))',[key]);
   report.database.admission.push({round,mode,roundTrips:mode==='batched'?1:4,ms:elapsed(t)});
  }finally{await client.query('rollback');}
 }
 stage='connections';
 report.database.applicationConnections=(await client.query(`select state,wait_event_type as "waitType",count(*)::int as connections,
  round(max(extract(epoch from clock_timestamp()-xact_start))*1000)::bigint as "longestTransactionMs"
  from pg_stat_activity where application_name='pinevela-supabase' group by state,wait_event_type order by state,wait_event_type`)).rows;
 if(label==='after'){
  stage='idle-retention';
  const established=client;
  client.release();client=undefined;
  const idleStart=performance.now();await delay(31000);
  const checkout=performance.now();client=await pool.connect();
  report.database.idleRetention={idleMs:elapsed(idleStart),sameConnection:client===established,
   checkoutMs:elapsed(checkout),connections:pool.totalCount};
  const queryStart=performance.now();await client.query('select 1');
  report.database.idleRetention.queryMs=elapsed(queryStart);
 }
 const reviewPath=path.join(directory,'development-cleanup-proposal.json');
 if(fs.existsSync(reviewPath)){
  stage='cleanup-review';
  const saved=JSON.parse(fs.readFileSync(reviewPath,'utf8'));
  await client.query('begin read only');
  try{
   report.cleanup=(await client.query(`select p.status,p.preview->>'hostelName' as property,
    private.residence_review_current(p) as current,
    (select jsonb_agg(jsonb_build_object('slot',m.slot,'decision',v.decision) order by m.slot)
      from public.admin_votes v join public.admin_memberships m on m.context_id=v.administrator_context_id where v.proposal_id=p.id) as votes,
    (select state from private.residence_deletion_preparations f where f.proposal_id=p.id) as preparation
    from public.admin_proposals p where p.id=$1 and p.kind='residence_deletion'`,[uuid(saved.proposal.id)])).rows[0]||{missing:true};
  }finally{await client.query('rollback');}
 }
}catch(e:any){
 report.database.error={stage,code:e.code||null,name:e.name||'Error'};
 // Full transport details remain in private evidence, never in console output.
 fs.writeFileSync(path.join(directory,`latency-${label}-error.txt`),String(e.stack||e)+'\n',{mode:0o600});
 process.exitCode=1;
}
finally{client?.release();await pool.end();}
fs.writeFileSync(path.join(directory,`latency-${label}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
