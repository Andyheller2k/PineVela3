/** Real PostgreSQL concurrency against an encrypted genuine checkpoint.
 * No fabricated identities/sessions, provider replies or cloud product writes. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {readNotifications} from '../supabase/notifications.js';
import {housingDashboardRows} from '../supabase/dashboardReads.js';
import {administratorStores,administratorManagerRestrictions} from '../supabase/adminStoreOverview.js';
import {accountDirectory} from '../supabase/accountReviews.js';
const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a genuine PostgreSQL backup UUID.');
let checks=0,stage='restore';const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>{resolve=r;});return{promise,resolve};};
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config),auth=new SupabaseAuth(db);
 try{
  const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
   'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
   'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
   'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t),
   'profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.profiles t),
   'bindings',(select jsonb_agg(to_jsonb(t) order by session_id) from private.account_sessions t),
   'keys',(select jsonb_agg(to_jsonb(t) order by context_id) from private.admin_secrets t))::text) as digest`)).rows[0].digest;
  const before=await fingerprint();
  const actors=(await db.pool.query(`select distinct on(c.id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
   from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
   join public.account_contexts c on c.id=s.active_context_id and c.auth_user_id=s.auth_user_id
   join public.admin_memberships m on m.context_id=c.id where c.kind='admin' and c.status='active' and m.status='active'
   and(n.not_after is null or n.not_after>clock_timestamp()) and private.administrator_session_allowed(c.id,s.session_id)
   and exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id where i.user_id=s.auth_user_id
    and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and u.email_confirmed_at is not null and not u.is_anonymous)
   order by c.id,n.created_at desc`)).rows as VerifiedActor[];
  check(actors.length>=2,'At least two actual archived Google administrator bindings');const [owner,other]=actors;
  stage='shared read exclusion';
  const entered=deferred(),release=deferred(),writers:Promise<void>[]=[];let admittedWriters=0;
  const held=db.readActor(owner,async c=>{await c.query('select 1');entered.resolve();await release.promise;});
  await entered.promise;
  try{
   await db.readActor(other,c=>c.query('select 1'));check(true,'Second scoped read completes while first read remains held');
   await db.authorizedRead(other,['admin'],c=>c.query('select 1'));check(true,'Privileged authorized read also shares the reader lock');
   for(const actor of [{...owner,contextId:other.contextId},{...owner,authUserId:other.authUserId},{...owner,sessionId:other.sessionId},{...owner,kind:'primary'}]){
    let error:any;try{await db.readActor(actor,c=>c.query('select 1'));}catch(e){error=e;}
    check(error instanceof ApiError&&error.status===401,'Read path retains exact session/context/kind binding');
   }
   let wrongRole:any;try{await db.authorizedRead(owner,['manager'],c=>c.query('select 1'));}catch(e){wrongRole=e;}
   check(wrongRole instanceof ApiError&&wrongRole.status===403,'Privileged read still checks allowed server roles');
   let secret:any;try{await db.readActor(owner,c=>c.query('select settings_key_hash from private.admin_secrets'));}catch(e){secret=e;}
   check(secret?.code==='42501','Scoped reader cannot retrieve private administrator keys');
   for(const privileged of [false,true])writers.push(privileged
    ?db.authorizedSystem(other,['admin'],async()=>{admittedWriters++;})
    :db.actor(other,async()=>{admittedWriters++;}));
   const deadline=Date.now()+3000;let waiting=0;
   while(Date.now()<deadline){waiting=(await db.pool.query("select count(*)::int as count from pg_locks where locktype='advisory' and not granted")).rows[0].count;if(waiting>=2)break;await new Promise(r=>setTimeout(r,20));}
   check(waiting>=2&&admittedWriters===0,'Both actual mutation wrappers wait behind the held reader');
  }finally{release.resolve();await held;await Promise.all(writers);}
  check(admittedWriters===2,'Both mutation wrappers proceed after readers commit');
  stage='exclusive writer exclusion';
  for(const kind of ['scoped','system']as const){
   const entered=deferred(),release=deferred(),writers:Promise<void>[]=[];let admittedWriters=0;let began=false;
   const reader=db.readActor(other,async()=>{began=true;});
   await reader;check(began,'Reader succeeds without an active writer');
   const held=kind==='scoped'?db.actor(owner,async()=>{entered.resolve();await release.promise;})
    :db.authorizedSystem(owner,['admin'],async()=>{entered.resolve();await release.promise;});
   await entered.promise;
   try{await db.system(async c=>{
    const r=await c.query("select pg_try_advisory_xact_lock_shared(hashtextextended('platform-settings',0)) as allowed");
    check(!r.rows[0].allowed,kind+' mutation wrapper still excludes readers');
   });}finally{release.resolve();await held;}
   await db.readActor(other,c=>c.query('select 1'));check(true,'Reads resume after the writer commits');
  }
  stage='actual projections';
  const person=await auth.projection(owner);check(person.id===owner.contextId&&person.role==='admin'&&person.isVerified,'Own Auth projection remains correct');
  check(Array.isArray(await db.readActor(owner,c=>readNotifications(c,owner))),'Actual own notifications read');
  for(const kind of ['staff','issues','bargains','board','activities']as const)
   check(Array.isArray(await db.readActor(owner,c=>housingDashboardRows(c,kind))),'Actual RLS dashboard projection '+kind);
  check(Array.isArray(await db.authorizedRead(owner,['admin'],c=>administratorStores(c,owner))),'Actual administrator store read');
  check(Array.isArray(await db.authorizedRead(owner,['admin'],c=>administratorManagerRestrictions(c,owner))),'Actual administrator restrictions read');
  check(Array.isArray((await db.authorizedRead(owner,['admin'],c=>accountDirectory(c,owner))).users),'Actual account directory read');
  check(await fingerprint()===before,'Genuine Auth, profiles, bindings and private keys remain byte exact');
  const result={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,concurrentReads:true,
   exclusiveMutationsPreserved:true,rlsAndSessionBindingPreserved:true,cloudRecordsModified:0,authRecordsChanged:false,providerRepliesMocked:false};
  fs.writeFileSync('.security/migration-reset/administrator-read-concurrency-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
 }finally{await db.close();}
});}catch(e:any){fs.writeFileSync('.security/migration-reset/administrator-read-concurrency-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e.code||null,error:e instanceof assert.AssertionError?e.message:'Native read verification failed; diagnostics saved privately.'}));process.exitCode=1;}
