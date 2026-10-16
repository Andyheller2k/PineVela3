/** Native account checks against an encrypted genuine checkpoint restored only
 * into a disposable Unix-socket cluster. No provider reply or identity fixtures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase} from '../supabase/db.js';
import {requireAccountAccess} from '../supabase/accountAccess.js';

const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a genuine PostgreSQL backup UUID.');
let checks=0,stage='restore';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
type ArchivedSession={contextId:string;authUserId:string;sessionId:string};

try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
   'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
   'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
   'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t),
   'contexts',(select jsonb_agg(to_jsonb(t) order by id) from public.account_contexts t),
   'bindings',(select jsonb_agg(to_jsonb(t) order by session_id) from private.account_sessions t),
   'policies',(select jsonb_agg(to_jsonb(t) order by context_id) from private.account_policies t),
   'epochs',(select jsonb_agg(to_jsonb(t) order by context_id) from private.account_access_epochs t))::text) as digest`)).rows[0].digest;
  const before=await fingerprint();
  const sessions=(await db.pool.query(`select distinct on(c.id) c.id as "contextId",c.auth_user_id as "authUserId",s.id as "sessionId"
   from public.account_contexts c join auth.sessions s on s.user_id=c.auth_user_id
   join auth.users u on u.id=c.auth_user_id
   where c.status='active' and u.email_confirmed_at is not null and not u.is_anonymous
    and private.account_session_allowed(c.id,s.id)
   order by c.id,s.created_at desc`)).rows as ArchivedSession[];
  check(sessions.length>0,'Checkpoint contains actual active verified session/context relationships');
  const own=sessions[0],foreign=sessions.find(s=>s.authUserId!==own.authUserId);
  check(foreign,'Checkpoint contains a second real Auth subject for cross-account denial');

  let calls=0;
  const counted=(c:PoolClient)=>({query:(...args:any[])=>{calls++;return (c.query as any)(...args);}} as PoolClient);
  stage='native positive access';
  await db.system(async c=>{
   const expected=(await c.query('select private.account_access($1) as access',[own.contextId])).rows[0].access;
   calls=0;const actual=await requireAccountAccess(counted(c),own.contextId,[],own.sessionId);
   check(!actual.banned&&Array.isArray(actual.restrictions),'Actual verified session retains native account access');
   check(JSON.stringify(actual)===JSON.stringify(expected),'Combined query retains the exact native account policy projection');
   check(calls===1,'Verified account policy and session are checked in one database round trip');
   calls=0;const noSession=await requireAccountAccess(counted(c),own.contextId);
   check(JSON.stringify(noSession)===JSON.stringify(expected)&&calls===1,'Sessionless policy lookup retains its original single-query behavior');
  });

  const denied=async(work:()=>Promise<unknown>,label:string)=>{
   let error:unknown;try{await work();}catch(e){error=e;}
   check(error instanceof ApiError&&error.status===401&&error.code==='account_signin_required',label);
  };
  stage='cross-account session';
  await db.system(c=>denied(()=>requireAccountAccess(c,own.contextId,[],foreign!.sessionId),'An actual other user session cannot authorize this context'));

  stage='immediate native revocation';
  const client=await db.pool.connect();
  try{
   await client.query('begin');
   await client.query('delete from auth.sessions where id=$1 and user_id=$2',[own.sessionId,own.authUserId]);
   calls=0;
   await denied(()=>requireAccountAccess(counted(client),own.contextId,[],own.sessionId),'Deleting the real archived native session immediately denies access');
   check(calls===1,'Revocation failure still uses the live combined query');
  }finally{await client.query('rollback');client.release();}
  await db.system(async c=>{
   const actual=await requireAccountAccess(c,own.contextId,[],own.sessionId);
   check(!actual.banned,'Access is restored only after rolling back the archived session deletion');
  });
  check(await fingerprint()===before,'Genuine Auth, contexts, bindings, policies and epochs remain byte exact');

  const result={passed:true,checks,isolatedNative:true,genuineArchivedIdentities:true,
   accountPolicyAndSessionQueries:1,crossAccountDenied:true,immediateRevocationPreserved:true,
   policyOrSessionCache:false,providerRepliesMocked:false,cloudRecordsModified:0,archivedRecordsChanged:false};
  fs.writeFileSync('.security/migration-reset/account-access-latency-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
 }finally{await db.close();}
});}catch(error:any){
 fs.writeFileSync('.security/migration-reset/account-access-latency-failure.log',String(error.stack||error),{mode:0o600});
 console.error(JSON.stringify({passed:false,stage,checks,code:error.code||null,
  error:error instanceof assert.AssertionError?error.message:'Native account access verification failed; diagnostics saved privately.'}));
 process.exitCode=1;
}
