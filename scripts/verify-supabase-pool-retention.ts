/** Genuine PostgreSQL checkpoint, actual pool timers and account-independent
 * reads. No cloud connections, invented users, credentials or provider replies. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dotenv from 'dotenv';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,databaseConfig} from '../supabase/db.js';

dotenv.config({quiet:true});
const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a genuine PostgreSQL backup UUID.');
let checks=0,stage='production pool configuration';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const pause=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));
const eventually=async(predicate:()=>boolean|Promise<boolean>,label:string)=>{
 const deadline=Date.now()+3000;
 do{if(await predicate()){check(true,label);return;}await pause(20);}while(Date.now()<deadline);
 check(false,label);
};
try{
 // Resolve actual production configuration without logging it or connecting to
 // that host. Only its minimum is applied to the disposable restored database.
 const production=databaseConfig(),minimum=production.min;
 check(minimum===1,'Production database configuration retains one established connection');
 check(production.max===8&&production.idleTimeoutMillis===30000&&production.connectionTimeoutMillis===15000
  &&production.statement_timeout===15000&&production.query_timeout===30000&&production.ssl.rejectUnauthorized===true,
 'Retention preserves the existing maximum, deadlines and verified TLS boundary');
 stage='restore';
 await withIsolatedBackup(checkpoint,async config=>{
  const idleTimeoutMillis=100;
  const monitor=new SupabaseDatabase({...config,max:1,min:0,idleTimeoutMillis:0});
  const control=new SupabaseDatabase({...config,max:2,min:0,idleTimeoutMillis});
  const retained=new SupabaseDatabase({...config,max:2,min:minimum,idleTimeoutMillis});
  let controlClosed=false,retainedClosed=false;
  try{
   const fingerprint=async()=>(await monitor.pool.query(`select md5(jsonb_build_object(
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
   stage='lazy creation and idle control';
   check(control.pool.totalCount===0&&retained.pool.totalCount===0,'Neither pool opens an eager connection');
   await pause(idleTimeoutMillis*2);
   check(control.pool.totalCount===0&&retained.pool.totalCount===0,'Minimum retention does not create connections while unused');
   const controlPid=Number((await control.pool.query('select pg_backend_pid() as pid')).rows[0].pid);
   check(control.pool.totalCount===1&&control.pool.idleCount===1,'Control obtains and releases an actual PostgreSQL connection');
   await eventually(()=>control.pool.totalCount===0&&control.pool.idleCount===0,'Minimum-zero control evicts its idle connection');
   await eventually(async()=>(await monitor.pool.query('select 1 from pg_stat_activity where pid=$1',[controlPid])).rowCount===0,
    'Control eviction actually disconnects the PostgreSQL backend');
   stage='minimum retention and burst contraction';
   const first=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(first.role===config.user&&retained.pool.totalCount===1&&retained.pool.idleCount===1,'Retained pool opens only on first real system read');
   await pause(idleTimeoutMillis*3);
   check(retained.pool.totalCount===1&&retained.pool.idleCount===1,'Established minimum connection survives multiple actual idle intervals');
   const reused=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(reused.pid===first.pid&&reused.role===config.user,'Post-idle checkout reuses the same actual PostgreSQL backend');
   const one=await retained.pool.connect();let two:PoolClient|undefined;
   let burstPids:number[]=[];
   try{
    two=await retained.pool.connect();
    burstPids=[Number((await one.query('select pg_backend_pid() as pid')).rows[0].pid),Number((await two.query('select pg_backend_pid() as pid')).rows[0].pid)];
    check(burstPids[0]!==burstPids[1]&&retained.pool.totalCount===2,'Genuine concurrent checkout can expand above the minimum');
   }finally{one.release();two?.release();}
   check(retained.pool.idleCount===2,'Both burst connections return to the idle pool');
   await eventually(()=>retained.pool.totalCount===1&&retained.pool.idleCount===1,'Idle burst connections contract to exactly the configured minimum');
   await eventually(async()=>(await monitor.pool.query('select pid from pg_stat_activity where pid=any($1::integer[])',[burstPids])).rowCount===1,
    'Extra idle PostgreSQL backend is actually disconnected');
   const stable=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(burstPids.includes(Number(stable.pid))&&stable.role===config.user,'Remaining connection is a genuine retained burst backend');
   stage='transaction and restricted-role cleanup';
   const catalog=(await retained.publicRows('select pg_backend_pid() as pid,current_user as role'))[0];
   check(catalog.pid===stable.pid&&catalog.role==='pinevela_catalog','Public read reuses the retained backend with its restricted transaction-local role');
   const committed=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(committed.pid===stable.pid&&committed.role===config.user,'Catalog commit clears the restricted role before the next system read');
   const intentional=new Error('Intentional isolated read rollback');let attempts=0,rollbackError:unknown;
   try{await retained.system(async c=>{attempts++;await c.query('set local role pinevela_catalog');throw intentional;});}catch(error){rollbackError=error;}
   check(rollbackError===intentional&&attempts===1,'Application error rolls back once without replaying the transaction');
   const afterRollback=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(afterRollback.pid===stable.pid&&afterRollback.role===config.user,'Rollback clears transaction-local role while retaining the reusable connection');
   let denied:any;try{await retained.publicRows('select 1 from private.admin_secrets');}catch(error){denied=error;}
   check(denied?.code==='42501','Retained catalog connection cannot access private credentials');
   const afterDenied=await retained.system(async c=>(await c.query('select pg_backend_pid() as pid,current_user as role')).rows[0]);
   check(afterDenied.pid===stable.pid&&afterDenied.role===config.user,'Native permission denial rolls back without leaking role state into reuse');
   const backend=(await monitor.pool.query('select state,xact_start from pg_stat_activity where pid=$1',[stable.pid])).rows[0];
   check(backend?.state==='idle'&&backend.xact_start===null,'Retained idle backend has no unfinished transaction');
   stage='drain and original-data fingerprint';
   await retained.close();retainedClosed=true;
   check(retained.pool.totalCount===0&&retained.pool.idleCount===0,'Database close drains the retained minimum');
   await eventually(async()=>(await monitor.pool.query('select 1 from pg_stat_activity where pid=$1',[stable.pid])).rowCount===0,
    'Database close disconnects the retained PostgreSQL backend');
   await control.close();controlClosed=true;
   check(await fingerprint()===before,'Auth, identities, sessions, bindings, credentials, settings, catalogs and history remain byte exact');
   const result={passed:true,checks,isolatedNative:true,genuineArchivedRecords:true,productionMinimum:minimum,
    productionIdleTimeoutMillis:production.idleTimeoutMillis,testIdleTimeoutMillis:idleTimeoutMillis,testMaximum:2,
    eagerConnectionsCreated:0,minimumZeroControlEvicted:true,minimumOneConnectionRetained:true,extraIdleConnectionsEvicted:true,
    actualBackendReused:true,commitAndRollbackRoleCleanupPreserved:true,privateCredentialAccessDenied:true,closeDrainsMinimum:true,
    cloudConnectionsOpened:0,cloudRecordsModified:0,authRecordsChanged:false,providerRepliesMocked:false};
   fs.writeFileSync('.security/migration-reset/pool-retention-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  }finally{
   if(!retainedClosed)await retained.close();if(!controlClosed)await control.close();await monitor.close();
  }
 });
}catch(error:any){
 fs.writeFileSync('.security/migration-reset/pool-retention-failure.log',String(error.stack||error),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,code:/^[A-Z0-9_]+$/.test(error?.code||'')?error.code:undefined,
  error:error instanceof assert.AssertionError?error.message:'Native pool-retention verification failed; diagnostics saved privately.'}));process.exitCode=1;
}
