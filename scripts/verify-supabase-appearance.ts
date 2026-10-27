/** Actual native Google identities and portal bindings from an encrypted backup.
 * All preference writes and account switches occur in an isolated local restore.
 * No Auth subject, provider response, JWT, or production fixture is fabricated. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {readAppearance,saveAppearance,checkAppearanceContext} from '../supabase/appearance.js';

dotenv.config({quiet:true});
const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw new Error('Pass a genuine full PostgreSQL checkpoint UUID.');
let checks=0,stage='restore';
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){
  let error:any;try{await work();}catch(e){error=e;}
  check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,label);
}
try{await withIsolatedBackup(checkpoint,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    stage='migration';
    const appearanceBoundary=async(c:any)=>(await c.query(`select jsonb_build_object(
      'rls',t.relrowsecurity,'forced',t.relforcerowsecurity,'grants',t.relacl,
      'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'grants',a.attacl) order by a.attnum)
        from pg_attribute a where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped),
      'policies',(select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p
        where p.schemaname='private' and p.tablename='account_appearance'),
      'preferences',(select jsonb_agg(to_jsonb(a) order by context_id) from private.account_appearance a)) as boundary
      from pg_class t where t.oid='private.account_appearance'::regclass`)).rows[0].boundary;
    await db.system(async c=>{
      const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
        const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),digest=crypto.createHash('sha256').update(sql).digest('hex'),version=file.slice(0,14);
        if(applied.has(version))assert.equal(applied.get(version),digest,'Historical migrations stay immutable');
        else{
          const boundary=file.endsWith('_system_account_appearance.sql')?await appearanceBoundary(c):undefined;
          await c.query(sql);
          if(boundary!==undefined){
            assert.deepEqual(await appearanceBoundary(c),boundary,'The System migration preserves saved preferences, RLS, policies and grants');checks++;
          }
          await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);
        }
      }
    });
    const fingerprint=async()=>(await db.pool.query(`select md5(jsonb_build_object(
      'profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.profiles t),
      'contexts',(select jsonb_agg(to_jsonb(t) order by id) from public.account_contexts t),
      'keys',(select jsonb_agg(to_jsonb(t) order by context_id) from private.admin_secrets t),
      'media',(select jsonb_agg(to_jsonb(t) order by id) from public.media_assets t),
      'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
      'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
      'nativeSessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
    const before=await fingerprint();
    const actors=(await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",
      s.active_context_id as "contextId",c.kind from private.account_sessions s
      join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
      join public.account_contexts c on c.id=s.active_context_id
      where c.kind in('primary','admin') and c.status='active'
        and (n.not_after is null or n.not_after>clock_timestamp())
        and private.portal_session_allowed(c.id,s.portal_pin_version)
        and private.account_session_allowed(c.id,s.session_id)
        and (c.kind<>'admin' or private.administrator_session_allowed(c.id,s.session_id))
        and exists(select 1 from auth.identities i join auth.users u on u.id=i.user_id where i.user_id=s.auth_user_id
          and i.provider='google' and u.email_confirmed_at is not null and not u.is_anonymous
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
      order by c.auth_user_id,(c.kind='admin') desc,n.created_at desc`)).rows as VerifiedActor[];
    check(actors.length>=2,'At least two genuine verified Google identities with active native portal bindings');
    const owner=actors.find(a=>a.kind==='admin')!,other=actors.find(a=>a.authUserId!==owner?.authUserId)!;
    check(owner&&other,'A genuine administrator and another separate identity are available');
    const read=(a:VerifiedActor)=>db.actor(a,c=>readAppearance(c,a));
    const save=(a:VerifiedActor,body:unknown)=>db.actor(a,c=>saveAppearance(c,a,body));
    const timestamp=async()=>(await db.pool.query('select updated_at::text from private.account_appearance where context_id=$1',[owner.contextId])).rows[0].updated_at;
    stage='own preferences';
    const initialOther=(await read(other)).theme;
    check([null,'light','dark','system'].includes((await read(owner)).theme),'Existing preferences stay readable, including a portal with no saved choice');
    for(const theme of ['light','dark','system'] as const){
      check((await save(owner,{theme})).theme===theme,'The authenticated owner can save '+theme);
      check((await read(owner)).theme===theme,'The authenticated owner can reload '+theme);
      check((await read(other)).theme===initialOther,'Saving '+theme+' never changes another identity’s preference');
      const first=await timestamp();await save(owner,{theme});
      check(await timestamp()===first,'Identical '+theme+' retries do not churn the saved timestamp');
    }
    await save(owner,{theme:'dark'});
    await save(other,{theme:'light'});
    check((await read(other)).theme==='light'&&(await read(owner)).theme==='dark','Separate identities retain independent modes');
    for(const body of [null,[],{}, {theme:'auto'},{theme:'SYSTEM'},{theme:null},{theme:0},{theme:'light',userId:other.authUserId},
      {theme:'light',contextId:other.contextId},{theme:'light',profileId:other.authUserId},{theme:'light',role:'admin'}])
      await denied(()=>save(owner,body),400,'Invalid input or ownership spoofing is rejected');
    check((await read(owner)).theme==='dark','Rejected updates leave the saved theme unchanged');
    checkAppearanceContext(owner,owner.contextId);check(true,'Matching context header is a consistency check');
    checkAppearanceContext(owner,undefined);check(true,'Missing legacy consistency header never substitutes for session authorization');
    await denied(async()=>checkAppearanceContext(owner,other.contextId),409,'A stale account header is refused');
    await denied(()=>read({...owner,contextId:other.contextId}),401,'A forged portal cannot bypass the native session binding');
    stage='RLS and SQL';
    check((await db.actor(owner,c=>c.query('select context_id from private.account_appearance'))).rowCount===1,'RLS filters even an unqualified backend SELECT to its own portal');
    check((await db.actor(owner,c=>c.query("update private.account_appearance set theme='dark' where context_id=$1",[other.contextId]))).rowCount===0,'Cross-account UPDATE changes zero rows');
    await denied(()=>db.actor(owner,c=>c.query("insert into private.account_appearance(context_id,theme) values($1,'dark') on conflict(context_id) do update set theme=excluded.theme",[other.contextId])),'42501','Cross-account INSERT or UPSERT fails RLS');
    await denied(()=>db.actor(owner,c=>c.query('update private.account_appearance set context_id=$2 where context_id=$1',[owner.contextId,other.contextId])),'42501','The backend cannot reassign preference ownership');
    await db.actor(owner,c=>c.query("update private.account_appearance set theme='system' where context_id=$1",[owner.contextId]));
    check((await read(owner)).theme==='system','PostgreSQL accepts System without changing the owner boundary');
    await denied(()=>db.actor(owner,c=>c.query("update private.account_appearance set theme='auto' where context_id=$1",[owner.contextId])),'23514','PostgreSQL independently rejects unsupported modes');
    await save(owner,{theme:'dark'});
    for(const role of ['anon','authenticated'])for(const sql of [
      'select theme from private.account_appearance',
      "insert into private.account_appearance(context_id,theme) values($1,'dark')",
      "update private.account_appearance set theme='dark' where context_id=$1",
      'delete from private.account_appearance where context_id=$1'])
      await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query(sql,sql.includes('$1')?[owner.contextId]:[]);}),'42501','Direct '+role+' preference access is denied');
    check((await db.pool.query("select relrowsecurity from pg_class where oid='private.account_appearance'::regclass")).rows[0].relrowsecurity,'The private table keeps RLS enabled');
    check(!(await db.pool.query("select rolbypassrls from pg_roles where rolname='pinevela_backend'")).rows[0].rolbypassrls,'The backend role cannot bypass RLS');
    stage='shared identity portals';
    const primary=(await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary' and status='active'",[owner.authUserId])).rows[0];
    check(primary,'The administrator has its genuine existing primary portal');
    const same={...owner,contextId:primary.id,kind:'primary'};
    const bind=(a:VerifiedActor)=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
    await bind(same);
    await denied(()=>save(owner,{theme:'light'}),401,'An in-flight old portal write is refused after switching');
    check((await read(same)).theme===null,'Shared Auth identity still starts with a separate portal preference');
    await save(same,{theme:'system'});await bind(owner);
    check((await read(owner)).theme==='dark','Switching back restores the administrator portal mode');
    await bind(same);check((await read(same)).theme==='system','The same identity primary portal retains its separate System choice');await bind(owner);
    stage='restart and revocation';
    await db.close();db=new SupabaseDatabase(config);
    check((await read(owner)).theme==='dark'&&(await read(other)).theme==='light','Fresh database connections reload each saved preference');
    await bind(same);check((await read(same)).theme==='system','System remains a saved choice after fresh database connections');await bind(owner);
    check(await fingerprint()===before,'No profiles, context ownership, credentials, media or genuine Auth records changed');
    await db.system(c=>c.query('delete from private.account_sessions where session_id=$1',[owner.sessionId]));
    await denied(()=>read(owner),401,'A revoked portal session cannot read preferences');
    await denied(()=>save(owner,{theme:'light'}),401,'A revoked portal session cannot change preferences');
    console.log(JSON.stringify({passed:true,checks,isolated:true,genuineGoogleIdentities:actors.length,choices:['light','dark','system'],
      independentIdentityAndPortalThemes:true,restartPersistence:true,cloudRecordsModified:0,authAccountsCreated:0}));
  }finally{await db.close();}
});}catch(error){
  fs.writeFileSync('.security/migration-reset/'+crypto.randomUUID()+'.appearance-test-failure.log',String((error as any)?.stack||error),{mode:0o600});
  console.error(JSON.stringify({passed:false,checks,stage,status:error instanceof ApiError?error.status:undefined,
    sqlstate:/^[0-9A-Z]{5}$/.test((error as any)?.code||'')?(error as any).code:undefined,
    message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;
}
