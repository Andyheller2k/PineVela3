/** Genuine saved identities/sessions, restored locally. No Auth identity, token,
 * provider response or verification timestamp is fabricated. No cloud writes. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { SupabaseDatabase, ApiError } from '../supabase/db.js';
import { initializeRetainedGooglePrimary,unavailableAccountError } from '../supabase/googleSignup.js';
import { googleAccountMissing } from '../googleAuth.js';

const [backup] = process.argv.slice(2);
if (!backup) throw new Error('Pass the restore-verified database checkpoint UUID.');
let checks=0;
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
await withIsolatedBackup(backup,async config=>{
  const db=new SupabaseDatabase(config);
  const digest=async()=>(await db.pool.query(`select md5(jsonb_build_object(
    'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
    'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
    'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as value`)).rows[0].value;
  try {
    const before=await digest();
    const baseline=(await db.pool.query(`select
      (select count(*)::integer from public.admin_memberships) as administrators,
      (select count(*)::integer from public.residences) as residences,
      (select count(*)::integer from public.stores) as stores`)).rows[0];
    const subjects=(await db.pool.query(`select u.id,s.id as session_id,u.email from auth.users u
      join lateral(select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp())
        order by created_at desc limit 1) s on true
      where u.email_confirmed_at is not null and u.is_anonymous is false
        and not exists(select 1 from public.profiles p where p.id=u.id)
        and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
          and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
      order by u.id limit 2`)).rows;
    check(subjects.length===2,'Two genuine retained Google subjects with native live sessions are available');
    const [first,second]=subjects;
    const identity={authUserId:first.id,sessionId:first.session_id};
    const missing=await db.system(c=>unavailableAccountError(c,first.id));
    check(missing.status===403 && missing.code==='google_profile_missing','A retained subject without a profile receives the same-account signup instruction');
    let publicFailure:any;try{googleAccountMissing();}catch(error){publicFailure=error;}
    check(publicFailure?.reason==='missing','The callback uses the existing safe missing-profile error category');
    async function denied(work:()=>Promise<unknown>,label:string){let error:unknown;try{await work();}catch(e){error=e;}
      check(error instanceof ApiError && error.status===401,label);}
    await denied(()=>db.system(c=>initializeRetainedGooglePrimary(c,{...identity,sessionId:second.session_id})),'Another subject session cannot initialize a profile');
    await denied(()=>db.system(c=>initializeRetainedGooglePrimary(c,{...identity,sessionId:crypto.randomUUID()})),'Unknown session cannot initialize a profile');
    await denied(()=>db.system(c=>initializeRetainedGooglePrimary(c,{...identity,authUserId:crypto.randomUUID()})),'Unknown subject cannot initialize a profile');
    // Actual removal of saved records is confined to a rolled-back local transaction.
    for(const [sql,label] of [
      ['delete from auth.sessions where id=$1','Revoked native session cannot initialize a profile'],
      ["delete from auth.identities where user_id=$1 and provider='google'",'Missing Google identity cannot initialize a profile'],
    ]){
      const client=await db.pool.connect();
      try{
        await client.query('begin');
        await client.query(sql,[sql.includes('auth.sessions')?first.session_id:first.id]);
        await denied(()=>initializeRetainedGooglePrimary(client,identity),label);
      }finally{await client.query('rollback');client.release();}
    }
    check(!(await db.pool.query('select id from public.profiles where id=$1',[first.id])).rowCount,'Denied attempts leave no profile');
    const results=await Promise.all([
      db.system(c=>initializeRetainedGooglePrimary(c,identity)),
      db.system(c=>initializeRetainedGooglePrimary(c,identity)),
    ]);
    check(results.filter(Boolean).length===1,'Concurrent signup creates the profile only once');
    const person=(await db.pool.query('select * from public.profiles where id=$1',[first.id])).rows[0];
    check(person.id===first.id&&person.email===first.email.toLowerCase(),'Signup preserves exact verified Auth UUID and mailbox');
    check(person.primary_owner_id===null,'Retained subject becomes its own primary user');
    check(person.avatar_path===null&&person.avatar_asset_id===null,'No old account photograph is copied');
    const contexts=(await db.pool.query('select kind,status,primary_owner_id from public.account_contexts where auth_user_id=$1',[first.id])).rows;
    check(contexts.length===1&&contexts[0].kind==='primary'&&contexts[0].status==='active'&&contexts[0].primary_owner_id===null,'Only one ordinary primary context is created');
    check((await db.pool.query('select count(*)::integer as total from public.admin_memberships')).rows[0].total===baseline.administrators,'Signup never grants administrator membership');
    check((await db.pool.query('select count(*)::integer as total from public.residences')).rows[0].total===baseline.residences,'Signup does not restore old residences');
    check((await db.pool.query('select count(*)::integer as total from public.stores')).rows[0].total===baseline.stores,'Signup does not restore old stores');
    check(!(await db.pool.query('select id from public.profiles where id=$1',[second.id])).rowCount,'Another retained identity is not initialized');
    check(await db.system(c=>initializeRetainedGooglePrimary(c,identity))===false,'Repeat signup leaves the existing profile intact');
    const afterPerson=(await db.pool.query('select * from public.profiles where id=$1',[first.id])).rows[0];
    check(JSON.stringify(afterPerson)===JSON.stringify(person),'Repeat signup cannot overwrite saved profile fields');
    const inactive=await db.system(c=>unavailableAccountError(c,first.id));
    check(inactive.status===403 && inactive.code===undefined,'An existing inactive profile is not treated as missing or eligible for reinitialization');
    for(const role of ['anon','authenticated','pinevela_backend']) {
      const allowed=(await db.pool.query('select has_function_privilege($1,\'private.initialize_auth_profile(uuid,text)\',\'execute\') as allowed',[role])).rows[0].allowed;
      check(allowed===false,'Initializer remains inaccessible to '+role);
    }
    check(await digest()===before,'All genuine Auth users, Google identities and native sessions remain unchanged');
    console.log(JSON.stringify({passed:true,checks,isolatedNativeSignup:true,cloudRecordsModified:0,authUsersFabricated:0,providerMocks:0,positiveProviderBrowserTested:false}));
  }finally{await db.close();}
});
