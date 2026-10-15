/** Real archived Google subjects/sessions, disposable native DB only. No provider
 * mocks, new Auth users, email-confirmation edits or live product fixtures. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {enrollmentInput,reserveEnrollment} from '../supabase/enrollment.js';
import {googleManagerInput,googleManagerDevelopmentEnabled,completeGoogleManagerEnrollment} from '../supabase/googleManagerEnrollment.js';
import {registrationStatus} from '../supabase/accountStatus.js';
import {readNotifications} from '../supabase/notifications.js';
const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4)throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks=0,stage='restore';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}check(typeof status==='number'?error instanceof ApiError&&error.status===status:error?.code===status,label);}
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const digest=async()=>(await db.pool.query(`select md5(jsonb_build_object(
   'users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),
   'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),
   'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text) as value`)).rows[0].value;
  const originalAuth=await digest();stage='native setup';
  const fixture=await db.system(async c=>{
   const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name',u.email)as name,s.id as sid
    from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp())order by created_at desc limit 1)s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id
      and i.provider='google'and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
    order by(lower(u.email)='finalform2k@gmail.com')desc,u.id limit 4`)).rows;
   check(people.length===4,'Four genuine Google subjects with native sessions');
   const primary=async(p:any)=>{
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
    await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[p.sid,p.id,id]);
    return {authUserId:p.id,sessionId:p.sid,contextId:id,kind:'primary'} as VerifiedActor;
   };
   const owner=await primary(people[0]),foreign=await primary(people[1]);
   const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
    const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),hash=crypto.createHash('sha256').update(sql).digest('hex');
    if(ledger.has(version))assert.equal(ledger.get(version),hash);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,hash]);}
   }
   return {owner,foreign,candidate:people[2],other:people[3],existing:people[1]};
  });
  const {owner,foreign,candidate,other,existing}=fixture;
  const run=<T>(actor:VerifiedActor,work:(c:PoolClient)=>Promise<T>)=>db.authorizedSystem(actor,[actor.kind],work);
  stage='local-only policy';
  const local:any={get:()=> '127.0.0.1:3001',socket:{remoteAddress:'127.0.0.1'}};
  check(!googleManagerDevelopmentEnabled(local,{}),'Development Google enrollment is disabled by default');
  check(googleManagerDevelopmentEnabled(local,{NODE_ENV:'development',PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT:'true'}),'Explicit loopback development setting is accepted');
  for(const env of [{NODE_ENV:'production',PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT:'true'},
   {NODE_ENV:'development',PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT:'TRUE'},
   {NODE_ENV:'development',PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT:'true',PINEVELA_PUBLIC_ORIGIN:'https://pinevela.example'}])
   check(!googleManagerDevelopmentEnabled(local,env),'Production/public/ambiguous policy cannot enable development signup');
  for(const req of [{...local,get:()=> 'untrusted.invalid'}, {...local,socket:{remoteAddress:'203.0.113.1'}}])
   check(!googleManagerDevelopmentEnabled(req,{PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT:'true'}),'Remote requests cannot enable the loopback route');
  const input=googleManagerInput({kind:'manager',email:candidate.email,name:candidate.name,phone:'+233241234567',role:'admin',verified:true,userId:foreign.authUserId});
  check(input.kind==='manager'&&input.password===''&&!('role'in input)&&!('userId'in input),'Form claims do not set identity, role or password');
  await denied(async()=>googleManagerInput({...input,kind:'admin'}),400,'Development enrollment cannot create administrators');
  await denied(async()=>enrollmentInput({...input,password:crypto.randomBytes(18).toString('base64url'),development:true}),400,'Ordinary email-password enrollment retains organization-domain rules');
  const nonce=crypto.randomBytes(32).toString('hex');
  stage='reservation and role deferral';
  await denied(()=>run(owner,c=>reserveEnrollment(c,owner,{...input,email:existing.email},nonce,undefined,true)),409,'Existing user/administrator identities cannot be adopted through Google enrollment');
  await denied(()=>run(owner,c=>reserveEnrollment(c,owner,{...input,kind:'resident'},nonce,undefined,true)),400,'Google manager reservation cannot select another portal type');
  const id=await run(owner,c=>reserveEnrollment(c,owner,input,nonce,undefined,true));
  await db.system(c=>c.query('select private.initialize_auth_profile($1,null)',[candidate.id]));
  check(!(await db.pool.query('select 1 from public.profiles where id=$1',[candidate.id])).rowCount,'OAuth user creation alone grants no app profile or role');
  const proof={authUserId:candidate.id,sessionId:candidate.sid,email:candidate.email};
  await denied(()=>run(foreign,c=>completeGoogleManagerEnrollment(c,foreign,id,nonce,proof)),404,'Foreign primary cannot finish another enrollment');
  await denied(()=>run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,'0'.repeat(64),proof)),403,'Missing one-time enrollment challenge cannot grant a role');
  await denied(()=>run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,nonce,{...proof,email:other.email})),403,'Google mailbox must match the reserved address');
  await denied(()=>run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,nonce,{...proof,authUserId:other.id})),403,'Email equality cannot substitute another Auth UUID');
  await denied(()=>run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,nonce,{...proof,sessionId:crypto.randomUUID()})),403,'A forged or missing native Google session cannot grant a role');
  const beforeBinding=(await db.pool.query('select to_jsonb(s) as row from private.account_sessions s where session_id=$1',[owner.sessionId])).rows[0].row;
  stage='verified Google completion';
  const completed=await run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,nonce,proof));
  check(completed.status==='pending_review','Google identity proof completes enrollment without SMTP');
  const saved=(await run(owner,c=>registrationStatus(c,owner))).managerAccount;
  check(saved.email===candidate.email&&saved.emailVerified&&saved.requiresPropertyRegistration&&!saved.isApproved,'Owner can continue property registration while manager approval remains pending');
  const context=(await db.pool.query('select * from public.account_contexts where id=$1',[saved.id])).rows[0];
  check(context.kind==='manager'&&context.status==='pending'&&context.primary_owner_id===owner.authUserId,'Only the exact owned pending manager portal is created');
  await denied(()=>run({...proof,contextId:context.id,kind:'manager'},async()=>undefined),401,'Google proof does not bypass manager inspection or portal activation');
  check(!(await db.pool.query('select 1 from private.account_sessions where auth_user_id=$1',[candidate.id])).rowCount,'Temporary secondary Google proof never becomes an app login');
  check(JSON.stringify((await db.pool.query('select to_jsonb(s) as row from private.account_sessions s where session_id=$1',[owner.sessionId])).rows[0].row)===JSON.stringify(beforeBinding),'Primary app session stays unchanged');
  const count=(await db.pool.query('select count(*)::int n from public.notifications')).rows[0].n;
  await run(owner,c=>completeGoogleManagerEnrollment(c,owner,id,nonce,proof));
  check((await db.pool.query('select count(*)::int n from public.notifications')).rows[0].n===count,'Exact successful completion retry does not duplicate notices');
  check((await db.readActor(owner,c=>readNotifications(c,owner))).some(n=>n.title==='Account Email Verified'),'Primary owner receives actual identity verification notice');
  check(!(await run(foreign,c=>registrationStatus(c,foreign))).managerAccount,'Foreign owner still cannot see the manager enrollment');
  const cancelledNonce=crypto.randomBytes(32).toString('hex');
  const cancelled=await run(foreign,c=>reserveEnrollment(c,foreign,{...input,email:other.email},cancelledNonce,undefined,true));
  await run(foreign,c=>c.query("update private.account_enrollments set status='cancelled' where id=$1",[cancelled]));
  await denied(()=>run(foreign,c=>completeGoogleManagerEnrollment(c,foreign,cancelled,cancelledNonce,{authUserId:other.id,sessionId:other.sid,email:other.email})),409,'Cancelled enrollment cannot be completed by a late callback');
  check(await digest()===originalAuth,'All Auth users, identities, verification timestamps and sessions stay exact');
  stage='native security advisors';
  const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
  fs.writeFileSync('.security/migration-reset/google-manager-enrollment-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});
  check(advisor.status===0,'Native security advisors completed');const findings=JSON.parse(advisor.stdout.toString());
  check(Array.isArray(findings.results||findings)&&(findings.results||findings).length===0,'Native security advisors report zero findings');
  const result={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,genuineGooglePopupAcceptancePending:true,emailDeliveryDeferredToLaunchSetup:true};
  fs.writeFileSync('.security/migration-reset/google-manager-enrollment-native.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
 }finally{await db.close();}
},{applicationCheckpoint});}catch(error:any){fs.writeFileSync('.security/migration-reset/google-manager-enrollment-failure.log',String(error.stack||error),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:error.code||null,error:error instanceof assert.AssertionError?error.message:'Native Google enrollment check failed; diagnostics saved privately.'}));process.exitCode=1;}
