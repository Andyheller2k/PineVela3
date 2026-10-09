/** Cloud schema rehearsal: genuine existing subjects, actual SQL, complete rollback.
 * Private random test keys are inserted before the draft DDL, never persisted. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { SupabaseDatabase, ApiError, type VerifiedActor } from '../supabase/db.js';
import { hashCredentialAsync } from '../accountSecurity.js';
import { administratorSettingsStatus, checkAdministratorSettingsKey, enrollAdministratorSettingsKey, saveReceivingAccount } from '../supabase/adminSettings.js';
dotenv.config({quiet:true});
const db = new SupabaseDatabase();
let checks=0, passed=false;
const rollback = new Error('Rehearsal rollback');
function check(value:unknown,label:string){assert.ok(value,label);checks++;}
const inventory = async () => (await db.pool.query(`select (select count(*) from auth.users) as users,
  (select count(*) from auth.sessions) as sessions,(select count(*) from public.profiles) as profiles,
  (select count(*) from private.admin_secrets) as secrets,(select count(*) from private.schema_migrations) as migrations`)).rows[0];
try {
  const before = await inventory();
  try { await db.system(async c => {
    check(!(await c.query("select version from private.schema_migrations where version='20261009230000'")).rowCount,'Draft is not already committed');
    const people=(await c.query(`select distinct on(u.id) u.id,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
      join auth.identities i on i.user_id=u.id and i.provider='google' where u.email_confirmed_at is not null and not u.is_anonymous
        and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 3`)).rows;
    check(people.length===3,'Genuine verified Google subjects available');
    const actors:VerifiedActor[]=[],keys:string[]=[];
    for(const [i,p] of people.entries()){
      await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
      const id=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[p.id])).rows[0].id;
      await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[id,i+1]);
      const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
      await c.query('insert into private.admin_secrets(context_id,settings_key_hash,settings_enrolled_at) values($1,$2,case when $2::text is null then null else now() end)',[id,i===2?null:await hashCredentialAsync(`settings:${id}:${key}`)]);
      const a={authUserId:p.id,sessionId:p.session_id,contextId:id,kind:'admin'};actors.push(a);
      await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
    }
    await c.query(fs.readFileSync('supabase/migrations/20261009230000_administrator_settings_keys.sql','utf8'));
    async function bind(a:VerifiedActor){await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
    async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){await c.query('savepoint negative');let err:any;try{await work();}catch(e){err=e;}await c.query('rollback to savepoint negative');check(typeof expected==='number'?err instanceof ApiError && err.status===expected:err?.code===expected,label);}
    await bind(actors[0]);
    const status=await administratorSettingsStatus(c,actors[0]);
    check(status.mainId===actors[0].contextId && status.members.length===3,'Actual roster is readable');
    check(!JSON.stringify(status).includes(keys[0]),'Settings status contains no key');
    check(!(await checkAdministratorSettingsKey(c,actors[0],keys[1])).allowed,'Foreign administrator key is denied');
    const grant=await checkAdministratorSettingsKey(c,actors[0],keys[0]);check(grant.allowed,'Correct separate settings key accepted');
    await saveReceivingAccount(c,actors[0],grant,'','live');
    check((await c.query("select count(*) from public.notifications where category='admin_settings'")).rows[0].count==='1','Receiving-account change emits actual settings notice');
    check((await c.query('select count(*) from public.notification_recipients')).rows[0].count==='3','All actual administrators receive notice');
    await saveReceivingAccount(c,actors[0],grant,'','live');
    check((await c.query('select count(*) from public.notifications')).rows[0].count==='1','No-op destination change is idempotent');
    await bind(actors[1]);
    await denied(()=>saveReceivingAccount(c,actors[1],grant,'','live'),403,'Cross-administrator grant rejected');
    await bind(actors[2]);
    await denied(()=>enrollAdministratorSettingsKey(c,actors[2],{}),403,'Old genuine session cannot enroll');
    const hash=await hashCredentialAsync(`settings:${actors[2].contextId}:${keys[2]}`);
    await denied(()=>c.query('update private.admin_secrets set settings_key_hash=$2 where context_id=$1',[actors[2].contextId,hash]),'42501','SQL independently requires fresh authentication');
    await bind(actors[0]);
    await denied(()=>c.query('update private.admin_secrets set settings_key_hash=$2 where context_id=$1',[actors[0].contextId,hash]),'42501','Existing key cannot be replaced');
    for(let attempt=0;attempt<5;attempt++)check(!(await checkAdministratorSettingsKey(c,actors[0],crypto.randomBytes(32).toString('hex'))).allowed,'Bad key rejected');
    check((await checkAdministratorSettingsKey(c,actors[0],keys[0])).locked,'Five attempts lock even a correct key');
    await denied(()=>saveReceivingAccount(c,actors[0],grant,'','live'),403,'Lock invalidates an earlier grant');
    for(const role of ['anon','authenticated','pinevela_backend']){
      await denied(async()=>{await c.query('set local role '+role);return c.query('select settings_key_hash from private.admin_secrets');},'42501',role+' cannot read keys');
      await denied(async()=>{await c.query('set local role '+role);return c.query("update private.platform_settings set value='{}'");},'42501',role+' cannot overwrite settings');
    }
    passed=true;throw rollback;
  }); } catch(error){if(error!==rollback)throw error;}
  assert.deepEqual(await inventory(),before);checks++;
  check(!(await db.pool.query("select exists(select 1 from information_schema.columns where table_schema='private' and table_name='admin_secrets' and column_name='settings_key_version') as exists")).rows[0].exists,'DDL rolled back completely');
  console.log(JSON.stringify({checks,passed,cloudFixtureCommitted:false,authAccountsCreated:0,providerMocks:0}));
} catch(error:any){console.error(JSON.stringify({passed:false,checks,status:error instanceof ApiError?error.status:undefined,sqlstate:/^[0-9A-Z]{5}$/.test(error?.code)?error.code:undefined,assertion:error?.code==='ERR_ASSERTION'?error.message:undefined}));process.exitCode=1;}
finally{await db.close();}
