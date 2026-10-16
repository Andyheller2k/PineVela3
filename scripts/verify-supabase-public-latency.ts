/** Real archived PostgreSQL and local HTTP only. No invented actors, catalog
 * fixtures, credentials, provider replies, settings grants or cloud writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {Server} from 'node:http';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase} from '../supabase/db.js';
import {createSupabaseApp} from '../supabase/app.js';

const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a genuine PostgreSQL backup UUID.');
let checks=0,stage='restore';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);let server:Server|undefined,closeRealtime:(()=>Promise<void>)|undefined;
 let observing=false,observed:string[]=[];
 // Forward each real query unchanged; retain SQL text only for request-level
 // operation counts. Parameters, results, cookies and credentials are not saved.
 db.pool.on('connect',client=>{
  const query=client.query;
  client.query=function(...args:any[]){
   if(observing)observed.push(typeof args[0]==='string'?args[0]:args[0]?.text||'');
   return (query as any).apply(this,args);
  } as typeof client.query;
 });
 try{
  const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
   'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
   'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
   'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t),
   'profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.profiles t),
   'bindings',(select jsonb_agg(to_jsonb(t) order by session_id) from private.account_sessions t),
   'keys',(select jsonb_agg(to_jsonb(t) order by context_id) from private.admin_secrets t),
   'settings',(select jsonb_agg(to_jsonb(t) order by key) from private.platform_settings t),
   'residences',(select jsonb_agg(to_jsonb(t) order by id) from public.residences t),
   'stores',(select jsonb_agg(to_jsonb(t) order by id) from public.stores t),
   'listings',(select jsonb_agg(to_jsonb(t) order by id) from public.listings t),
   'notifications',(select jsonb_agg(to_jsonb(t) order by id) from public.notifications t),
   'audit',(select jsonb_agg(to_jsonb(t) order by id) from private.audit_events t))::text) as digest`)).rows[0].digest;
  const before=await fingerprint();
  const initial=(await db.pool.query(`select private.platform_available() as available,
   exists(select 1 from private.platform_settings where key='platform') as settings_row`)).rows[0];
  check(initial.available===true,
   'Actual archived checkpoint has maintenance disabled');
  const actual=(await db.pool.query(`select
   (select id from public.residences order by registered_at,id limit 1) as residence,
   (select id from public.stores order by created_at,id limit 1) as store,
   (select id from public.account_contexts order by created_at,id limit 1) as context`)).rows[0];
  check(!!actual.context,'Genuine archived account context exists for absent-resource negative cases');
  const residenceId=actual.residence||actual.context,storeId=actual.store||actual.context;
  const homeIds=(await db.publicRows('select id from private.residence_catalog order by registered_at desc')).map(row=>row.id);
  const productIds=(await db.publicRows('select id from private.listing_catalog order by created_at desc')).map(row=>row.id);
  const storeExists=(await db.publicRows('select id from private.store_catalog where id=$1',[storeId])).length>0;
  check((await db.publicRows('select current_user as role')).every(row=>row.role==='pinevela_catalog'),
   'Actual public projection runs under restricted pinevela_catalog role');
  for(const sql of ['select approval_key_hash from private.admin_secrets','select id from auth.users']){
   let error:any;try{await db.publicRows(sql);}catch(e){error=e;}
   check(error?.code==='42501','Restricted catalog role cannot read private credentials or Auth subjects');
  }
  stage='public maintenance lock ordering';
  const barrierEntered=deferred(),barrierRelease=deferred();let holderPid=0;
  const held=db.system(async c=>{
   holderPid=Number((await c.query("select pg_backend_pid() as pid,pg_advisory_xact_lock(hashtextextended('platform-maintenance',0))")).rows[0].pid);
   barrierEntered.resolve();await barrierRelease.promise;
  });
  await barrierEntered.promise;let completed=false;
  const blocked=db.publicRows('select current_user as role').then(rows=>{completed=true;return{rows,error:null};},error=>({rows:[],error}));
  try{
   let waiting=false;const deadline=Date.now()+3000;
   while(Date.now()<deadline){waiting=(await db.pool.query(`select exists(select 1 from pg_locks
    where locktype='advisory' and not granted and mode='ShareLock' and $1::integer=any(pg_blocking_pids(pid))) as waiting`,[holderPid])).rows[0].waiting;
    if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));}
   check(waiting&&!completed,'Public projection waits for actual exclusive maintenance transition lock');
  }finally{barrierRelease.resolve();await held;}
  const resumed=await blocked;if(resumed.error)throw resumed.error;
  check(resumed.rows[0]?.role==='pinevela_catalog','Public projection resumes with its restricted role after maintenance barrier release');
  const projectionGate='pinevela-public-latency-projection-hold',projectionEntered=deferred(),projectionRelease=deferred();
  let projectionHolderPid=0;
  const gate=db.system(async c=>{
   projectionHolderPid=Number((await c.query('select pg_backend_pid() as pid,pg_advisory_xact_lock(hashtextextended($1,0))',[projectionGate])).rows[0].pid);
   projectionEntered.resolve();await projectionRelease.promise;
  });
  await projectionEntered.promise;
  const publicRead=db.publicRows('select current_user as role,pg_advisory_xact_lock(hashtextextended($1,0))',[projectionGate])
   .then(rows=>({rows,error:null}),error=>({rows:[],error}));
  let writer:Promise<void>|undefined;const writerEntered=deferred(),writerRelease=deferred();let admittedWriter=false;
  try{
   let waitingPid=0;const deadline=Date.now()+3000;
   while(Date.now()<deadline){waitingPid=Number((await db.pool.query(`select pid from pg_locks where locktype='advisory'
    and not granted and $1::integer=any(pg_blocking_pids(pid)) limit 1`,[projectionHolderPid])).rows[0]?.pid||0);
    if(waitingPid)break;await new Promise(resolve=>setTimeout(resolve,20));}
   check(waitingPid>0,'Actual public projection remains open behind an independent test-only advisory barrier');
   writer=db.system(async c=>{await c.query("select pg_advisory_xact_lock(hashtextextended('platform-maintenance',0))");admittedWriter=true;writerEntered.resolve();await writerRelease.promise;});
   let waiting=false;const deadlineWriter=Date.now()+3000;
   while(Date.now()<deadlineWriter){waiting=(await db.pool.query(`select exists(select 1 from pg_locks where locktype='advisory'
    and not granted and mode='ExclusiveLock' and $1::integer=any(pg_blocking_pids(pid))) as waiting`,[waitingPid])).rows[0].waiting;
    if(waiting)break;await new Promise(resolve=>setTimeout(resolve,20));}
   check(waiting&&!admittedWriter,'In-flight public projection excludes a concurrent maintenance transition');
   projectionRelease.resolve();await gate;const projection=await publicRead;if(projection.error)throw projection.error;
   check(projection.rows[0]?.role==='pinevela_catalog','Held public read remains scoped to the catalog role');
   await writerEntered.promise;check(admittedWriter,'Maintenance transition proceeds after the public transaction commits');
  }finally{projectionRelease.resolve();writerRelease.resolve();await gate;await publicRead;await writer;}
  stage='actual public and denied HTTP';
  const {app}=createSupabaseApp(db);closeRealtime=app.locals.closeRealtime;server=app.listen(0,'127.0.0.1');
  await new Promise<void>((resolve,reject)=>{server!.once('listening',resolve);server!.once('error',reject);});
  const address=server.address();assert(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const requestSqlCounts:{method:string;route:string;queries:number}[]=[];
  const request=async(path:string,status:number,method='GET')=>{
   observed=[];observing=true;
   try{
    const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000)}),body=await response.text(),queries=[...observed];
    requestSqlCounts.push({method,route:path.replace(/\/[a-f0-9-]{36}(?=\/|$)/g,'/:id'),queries:queries.length});
    check(response.status===status,`Actual HTTP ${method} ${path} returns ${status}`);
    check(response.headers.get('cache-control')?.includes('no-store')&&response.headers.get('x-content-type-options')==='nosniff',
     'Moved routes preserve API cache and content-type security headers');
    return{response,data:body?JSON.parse(body):null,queries};
   }finally{observing=false;}
  };
  for(const method of ['GET','HEAD'])for(const path of ['/api/auth/me','/api/auth/me/']){
   const result=await request(path,401,method);
   check(result.queries.length===0,'Unsigned session probe returns genuine 401 without any SQL');
   check(!result.response.headers.has('set-cookie'),'Denied unsigned probe creates no provider session or cookie');
  }
  const catalogs:[string,number][]=[['/api/hostels',200],[`/api/hostels/${residenceId}`,homeIds.includes(residenceId)?200:404],
   ['/api/digital-market/products',200],[`/api/digital-market/stores/${storeId}`,storeExists?200:404]];
  for(const [path,status]of catalogs){
   const result=await request(path,status);
   check(!result.queries.some(sql=>/^select private\.platform_available\(\) as available$/.test(sql)),
    'Catalog avoids preliminary standalone maintenance transaction');
   check(result.queries.some(sql=>sql.includes("pg_advisory_xact_lock_shared(hashtextextended('platform-maintenance',0));select private.platform_available()")),
    'Actual catalog still executes ordered native maintenance lock and availability admission');
   check(result.queries.some(sql=>sql==='set local role pinevela_catalog'),'Actual HTTP catalog retains its restricted SQL role');
   if(path==='/api/hostels')check(JSON.stringify(result.data.map((row:any)=>row.id))===JSON.stringify(homeIds),'Residence HTTP results match actual native published projection');
   if(path==='/api/digital-market/products')check(JSON.stringify(result.data.map((row:any)=>row.id))===JSON.stringify(productIds),'Product HTTP results match actual native published projection');
  }
  for(const [path,method]of [['/api/notifications','GET'],[`/api/hostels/${residenceId}/structure`,'GET'],['/api/digital-market/products','POST']]){
   const result=await request(path,401,method);
   check(result.queries.some(sql=>sql==='select private.platform_available() as available'),
    'Private route and catalog write retain existing global maintenance boundary');
  }
  stage='maintenance transition grant denial';
  // The genuine archive may have no platform row yet. An UPSERT exercises the
  // native INSERT/UPDATE guard in either state; a zero-row UPDATE would not.
  let toggleError:any;try{await db.system(c=>c.query(`insert into private.platform_settings(key,value)
   values('platform','{"maintenanceMode":true}'::jsonb) on conflict(key) do update
   set value=private.platform_settings.value||'{"maintenanceMode":true}'::jsonb`));}catch(error){toggleError=error;}
  check(toggleError?.code==='42501','Existing native maintenance trigger rejects an ungranted operator transition');
  check((await db.pool.query('select private.platform_available() as available')).rows[0].available===true,
   'Denied transition leaves actual maintenance state unchanged');
  check(await fingerprint()===before,'Auth, identities, sessions, bindings, credentials, settings, catalog records and history remain byte exact');
  const source=fs.readFileSync('supabase/db.ts','utf8'),availability=source.indexOf('if (!admission[1]?.rows[0]?.available)'),catalogRole=source.indexOf("await client.query('set local role pinevela_catalog')");
  check(availability>=0&&availability<catalogRole,'Source review confirms missing or false native admission fails before catalog role selection');
  const result={passed:true,checks,isolatedNative:true,realHttp:true,genuineArchivedRecords:true,providerRepliesMocked:false,
   publicMaintenanceLockPreserved:true,restrictedCatalogRolePreserved:true,unsignedSessionProbeSqlQueries:0,
   privateRouteMaintenanceBoundaryPreserved:true,maintenanceStateChanged:false,settingsGrantsForged:false,
   maintenanceEnabledIntegrationVerified:false,maintenanceEnabledCoverageLimit:'No genuine enabled-maintenance archive or human settings-key grant was available; native grant enforcement was preserved.',
   archivedPlatformSettingsRowPresent:initial.settings_row===true,
   requestSqlCounts,
   populatedResidenceCatalog:homeIds.length>0,populatedProductCatalog:productIds.length>0,populatedStoreDetail:storeExists,
   cloudRecordsModified:0,authRecordsChanged:false};
  fs.writeFileSync('.security/migration-reset/public-latency-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
 }finally{
  observing=false;await closeRealtime?.();
  if(server){server.closeAllConnections();await new Promise<void>((resolve,reject)=>server!.close(error=>error?reject(error):resolve()));}
  await db.close();
 }
});}catch(error:any){
 fs.writeFileSync('.security/migration-reset/public-latency-failure.log',String(error.stack||error),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,status:error instanceof ApiError?error.status:undefined,
  code:/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:undefined,error:error instanceof assert.AssertionError?error.message:'Native public-latency verification failed; diagnostics saved privately.'}));process.exitCode=1;
}
