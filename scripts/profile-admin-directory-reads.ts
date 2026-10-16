/** Read-only hosted SQL timings using an already active genuine administrator
 * binding. Never reads a browser token, changes data or prints account records.
 * SQL-only figures exclude HTTP/provider authentication and are not page timings. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import {SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {adminResidenceRows} from '../supabase/residenceRegistration.js';
import {administratorStores,administratorManagerRestrictions} from '../supabase/adminStoreOverview.js';
import {accountDirectory} from '../supabase/accountReviews.js';
import {housingDashboardRows} from '../supabase/dashboardReads.js';
import {paymentLedger} from '../supabase/payments.js';
import {administratorSellerApplications} from '../supabase/sellerRegistration.js';

dotenv.config({quiet:true});
const mode=process.argv[2];
assert.ok(process.argv.length===3&&['baseline','after'].includes(mode),'Pass baseline or after.');
const directory='.security/migration-reset';
assert.equal(fs.statSync(directory).mode&0o077,0,'Private evidence directory required.');
const db=new SupabaseDatabase();
const report:any={mode,at:new Date().toISOString(),cloudWrites:0,sqlOnly:true,providerOrBrowserCredentialsRead:false};
const diagnosticStarted=performance.now();
try{
 const actor=(await db.pool.query(`select s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
  from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
  join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
  join public.admin_memberships m on m.context_id=c.id where c.kind='admin' and c.status='active' and m.status='active'
   and(n.not_after is null or n.not_after>clock_timestamp()) and private.administrator_session_allowed(c.id,s.session_id)
  order by n.created_at desc limit 1`)).rows[0] as VerifiedActor|undefined;
 assert.ok(actor,'An already active genuine administrator binding is required.');
 // Native authorization uses SELECT FOR SHARE, which PostgreSQL forbids in a
 // READ ONLY transaction. Retain those locks and reject write commands instead.
 const originalSystem=db.system.bind(db);
 let queries=0;
 db.system=(work,admission)=>originalSystem(async c=>{
  const originalQuery=c.query,query=c.query.bind(c);
  c.query=((...args:any[])=>{
   const sql=typeof args[0]==='string'?args[0]:args[0]?.text;
   assert.ok(typeof sql==='string'&&sql.split(';').every((statement:string)=>!statement.trim()||/^\s*(select|set\s+local)\b/i.test(statement)),
    'Only existing SELECT projections, locks and transaction-local settings may run.');
   queries++;return (query as any)(...args);
  }) as typeof c.query;
  try{return await work(c);}finally{c.query=originalQuery;}
 },admission);
 let result:any;
 const started=performance.now();
 if(mode==='after'){
  const {administratorDashboardDirectories}=await import('../supabase/adminDashboardDirectories.js');
  result=await administratorDashboardDirectories(db,actor);
 }else{
  const routes=[
   ['residences',()=>db.authorizedRead(actor,['admin'],c=>adminResidenceRows(c,actor))],
   ['managerRestrictions',()=>db.authorizedRead(actor,['admin'],c=>administratorManagerRestrictions(c,actor))],
   ['boardRequests',()=>db.readActor(actor,c=>housingDashboardRows(c,'board'))],
   ['activities',()=>db.readActor(actor,c=>housingDashboardRows(c,'activities'))],
   ['digitalMarketApps',()=>db.readActor(actor,administratorSellerApplications)],
   ['digitalMarketStores',()=>db.authorizedRead(actor,['admin'],c=>administratorStores(c,actor))],
   ['paymentRecords',()=>db.authorizedSystem(actor,['admin'],c=>paymentLedger(c,actor))],
   ['allUsersData',()=>db.authorizedRead(actor,['admin'],c=>accountDirectory(c,actor))],
  ] as const;
  const reads=await Promise.allSettled(routes.map(async([name,read])=>{
   const t=performance.now();
   try {const data=await read();return {name,ms:Math.round(performance.now()-t),data};}
   catch(error:any){report.failedRead={name,ms:Math.round(performance.now()-t),code:error.code||null};throw error;}
  }));
  for(const read of reads)if(read.status==='rejected')throw read.reason;
  const fulfilled=reads.map(read=>(read as PromiseFulfilledResult<any>).value);
  report.reads=fulfilled.map(({name,ms})=>({name,ms}));
  result=Object.fromEntries(fulfilled.map(({name,data})=>[name,data]));
 }
 report.elapsedMs=Math.round(performance.now()-started);
 report.projectionAndAuthorizationQueries=queries;
 report.counts=Object.fromEntries(Object.entries(result).map(([key,value]:[string,any])=>[key,Array.isArray(value)?value.length:value.users.length]));
 // Stable keys demonstrate retained records without disclosing their contents.
 report.recordFingerprints=Object.fromEntries(Object.entries(result).map(([key,value]:[string,any])=>[key,
  crypto.createHash('sha256').update(JSON.stringify((Array.isArray(value)?value:value.users).map((r:any)=>r.id).sort())).digest('hex')]));
 report.passed=true;
}catch(error:any){report.passed=false;report.error={code:error.code||null,name:error.name};process.exitCode=1;}
finally{await db.close();}
report.totalDiagnosticElapsedMs=Math.round(performance.now()-diagnosticStarted);
fs.writeFileSync(`${directory}/admin-directory-sql-${mode}.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify(report));
