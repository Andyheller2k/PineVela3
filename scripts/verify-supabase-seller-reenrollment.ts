import {termsAcceptance} from '../legalPolicy.js';
/** Isolated domain scenarios using genuine archived Google identities and sessions. */
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication,sellerStatus} from '../supabase/sellerRegistration.js';
import {reactivateSeller} from '../supabase/sellerReactivation.js';
import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {saveStoreProfile,sellerStore} from '../supabase/storeSetup.js';
import {hashPortalPin,checkPortalPin} from '../supabase/portalAccess.js';
const [checkpoint,applicationCheckpoint]=process.argv.slice(2);if(!checkpoint||!applicationCheckpoint)throw Error('Pass actual Auth and pre-enrollment archive UUIDs.');
let checks=0,stage='restore';const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('u',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'i',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'s',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text) d`)).rows[0].d;
 const beforeAuth=await authDigest();stage='fixture';
 const f=await db.system(async c=>{
  const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') name,s.id sid
   from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp())order by created_at desc limit 1)s on true
   where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb)
   order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 3`)).rows;check(people.length===3,'Actual verified identities available');
  const owners:VerifiedActor[]=[];for(const p of people.slice(0,2)){await c.query('select private.initialize_auth_profile($1,null)',[p.id]);const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
   const a={contextId:id,authUserId:p.id,sessionId:p.sid,kind:'primary'};owners.push(a);await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[a.sessionId,a.authUserId,id]);}
  const nonce=crypto.randomBytes(32).toString('hex'),p=people[2],owner=owners[0];
  const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)values($1,$2,'seller',$3,$4,$5,clock_timestamp()+interval'24 hours')returning id",[owner.contextId,owner.authUserId,p.email,crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:p.name,phone:''})])).rows[0].id;
  await c.query('select private.initialize_auth_profile($1,$2)',[p.id,nonce]);const sid=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='seller'",[p.id])).rows[0].id;
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:owner.authUserId,session_id:owner.sessionId,role:'authenticated'})]);
  const seller={contextId:sid,authUserId:p.id,sessionId:p.sid,kind:'seller'};await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[p.sid,p.id,sid]);
  const adminId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'admin','active')returning id",[owner.authUserId])).rows[0].id;
  await c.query('insert into public.admin_memberships(context_id,slot)values($1,1)',[adminId]);
  const pin='72519386';await c.query('insert into private.portal_access_keys(context_id,pin_hash)values($1,$2)',[sid,await hashPortalPin(pin)]);
  // The independent resident portal shares only this actual Auth identity.
  const resident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','pending')returning id",[p.id,owner.authUserId])).rows[0].id;
  await c.query('insert into private.portal_access_keys(context_id,pin_hash)values($1,$2)',[resident,await hashPortalPin('59318642')]);
  await c.query("insert into private.platform_settings(key,value)values('platform','{\"registrationFee\":0}'::jsonb) on conflict(key)do update set value=private.platform_settings.value||excluded.value");
  return{owner,other:owners[1],seller,enrollment,pin,resident,proof:{authUserId:p.id,email:p.email,sessionId:p.sid},admin:{...owner,contextId:adminId,kind:'admin'},name:p.name};
 });
 stage='migrations';await db.system(async c=>{const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()){const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),digest=crypto.createHash('sha256').update(sql).digest('hex');if(ledger.has(file.slice(0,14)))assert.equal(ledger.get(file.slice(0,14)),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[file.slice(0,14),digest]);}}});
 async function run<T>(a:VerifiedActor,work:(c:any)=>Promise<T>){return db.system(async c=>{await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);return work(c);});}
 async function denied(work:()=>Promise<unknown>,code:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}check(typeof code==='number'?e instanceof ApiError&&e.status===code:e?.code===code,label);}
 const payload={enrollmentId:f.enrollment,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261013',storeName:f.name,certified:true,termsAcceptance:termsAcceptance(true)};
 stage='initial registration';await run(f.owner,c=>finishEnrollment(c,f.owner,f.enrollment,f.proof));const original=await run(f.owner,c=>submitSellerApplication(c,f.owner,payload));
 await run(f.admin,c=>decideSellerApplication(c,f.admin,{id:original.application.id},true));
 const store=(await db.pool.query('select * from public.stores where seller_context_id=$1',[f.seller.contextId])).rows[0];check(store.application_id===original.application.id&&store.registration_generation===0,'Initial store binds its exact generation-zero approval');
 check((await run(f.owner,c=>sellerStatus(c,f.owner))).store.id===store.id,'Original status resolves correctly');
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,null)),409,'Active seller cannot re-register');
 const setup={storeName:f.name,username:'cycle-'+f.seller.contextId,location:payload.university,category:payload.categoryToSell,deliveryMode:'Campus Delivery',phone:'0241234567',phoneCountry:'GH',description:''};
 await run(f.seller,c=>saveStoreProfile(c,f.seller,setup,true));
 const checkoutRequest={requestId:crypto.randomUUID(),purpose:'activation',plan:'default'};
 const checkout=await run(f.seller,c=>prepareCheckout(c,f.seller,checkoutRequest));
 check(checkout.record.mode==='free','Actual isolated zero-registration-fee policy; no provider reply fabricated');
 check((await run(f.seller,c=>fulfillCheckout(c,checkout.record.id))).accessGranted,'Old store has its own actual free registration receipt');
 const oldPayments=(await db.pool.query('select jsonb_agg(to_jsonb(p)order by id)d from public.payments p where store_id=$1',[store.id])).rows[0].d;
 stage='isolated closure';await db.system(async c=>{await c.query("update public.stores set status='closed' where id=$1",[store.id]);await c.query("update public.account_contexts set status='closed' where id=$1",[f.seller.contextId]);});
 check((await run(f.owner,c=>sellerStatus(c,f.owner))).application===null,'Closed portal presents re-enrollment instead of old approved store');
 const history=(await db.pool.query('select to_jsonb(a) d from public.seller_applications a where id=$1',[original.application.id])).rows[0].d;
 const sibling=(await db.pool.query('select to_jsonb(c) d,to_jsonb(k) pin from public.account_contexts c join private.portal_access_keys k on k.context_id=c.id where c.id=$1',[f.resident])).rows[0];
 const key=(await db.pool.query('select version from private.portal_access_keys where context_id=$1',[f.seller.contextId])).rows[0];
 await denied(()=>run(f.owner,c=>c.query("update public.account_contexts set status='active' where id=$1",[f.seller.contextId])),'42501','Raw closed-to-active bypass denied');
 await denied(()=>run(f.owner,c=>c.query('update public.account_contexts set seller_generation=1 where id=$1',[f.seller.contextId])),'42501','Raw generation increment denied');
 await denied(()=>run(f.other,c=>reactivateSeller(c,f.other,f.enrollment,f.proof,String(key.version))),404,'Foreign primary cannot reuse retained seller');
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,{...f.proof,sessionId:f.other.sessionId},String(key.version))),403,'Other identity session denied');
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,null)),403,'Missing seller PIN proof denied');
 for(let i=0;i<5;i++)check(!(await run(f.owner,c=>checkPortalPin(c,f.seller.contextId,'11111111'))).allowed,'Failed PIN attempt denied');
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,String(key.version))),403,'Locked PIN cannot reuse prior proof');
 // Reset local failed-attempt fixture with native expiry; never alter Auth times.
 await db.system(c=>c.query("update private.portal_access_keys set locked_until=clock_timestamp()-interval'1 second' where context_id=$1",[f.seller.contextId]));
 const pin=await run(f.owner,c=>checkPortalPin(c,f.seller.contextId,f.pin));check(pin.allowed,'Actual current PIN verifies');
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,String(Number(pin.version)+1))),403,'Stale PIN version denied');
 await denied(()=>run(f.owner,async c=>{await c.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)values($1,'seller_account',clock_timestamp()+interval'1 day','Isolated retained registration check',$2)",[f.owner.contextId,f.admin.contextId]);return reactivateSeller(c,f.owner,f.enrollment,f.proof,pin.version);}),403,'Retained primary registration ban blocks seller re-entry');
 await denied(()=>run(f.owner,async c=>{await c.query("update public.stores set status='pending' where id=$1",[store.id]);return reactivateSeller(c,f.owner,f.enrollment,f.proof,pin.version);}),409,'Unclosed old store blocks re-entry');
 await db.system(c=>c.query(`create function private.test_seller_notice_failure()returns trigger language plpgsql as $$begin if new.title='Seller identity confirmed for re-registration' then raise exception 'Isolated notice failure' using errcode='23514';end if;return new;end;$$;create trigger test_seller_notice_failure before insert on public.notifications for each row execute function private.test_seller_notice_failure();`));
 await denied(()=>run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,pin.version)),'23514','Notice failure rolls back seller re-entry');
 check((await db.pool.query('select seller_generation,status from public.account_contexts where id=$1',[f.seller.contextId])).rows[0].status==='closed','Failed re-entry preserves closed generation');
 await db.system(c=>c.query('drop trigger test_seller_notice_failure on public.notifications;drop function private.test_seller_notice_failure();'));
 stage='reenrollment';const attempts=await Promise.all([run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,pin.version)),run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,pin.version))]);
 check(attempts.filter(x=>!x.alreadyReactivated).length===1,'Concurrent re-entry increments once');
 check((await db.pool.query('select seller_generation,status from public.account_contexts where id=$1',[f.seller.contextId])).rows[0].seller_generation===1,'Retained portal has a fresh registration generation');
 check(!(await db.pool.query('select 1 from private.account_sessions where active_context_id=$1',[f.seller.contextId])).rowCount,'Old seller app bindings revoked');
 check((await run(f.owner,c=>sellerStatus(c,f.owner))).application===null,'Old approval does not appear as current registration');
 check((await db.pool.query("select count(*)::int n from private.audit_events where resource_id=$1 and event_type='seller_reenrollment_verified'",[f.seller.contextId])).rows[0].n===1,'One immutable re-entry audit');
 await denied(()=>run(f.admin,c=>decideSellerApplication(c,f.admin,{id:original.application.id},true)),409,'Old approval retries cannot authorize new cycle');
 await denied(()=>run(f.admin,c=>c.query("update public.stores set status='pending' where id=$1",[store.id])),'23514','Old store cannot reopen');
 stage='new registration';const next=await run(f.owner,c=>submitSellerApplication(c,f.owner,payload));check(next.application.id!==original.application.id&&next.application.registrationGeneration===1,'New application retains distinct history');
 await run(f.admin,c=>decideSellerApplication(c,f.admin,{id:next.application.id},true));
 const current=await run(f.owner,c=>sellerStatus(c,f.owner));check(current.store.id!==store.id&&!current.store.registrationFeePaid&&!current.store.setupCompleted,'New store requires fresh setup and registration payment');
 const resolved=await run(f.seller,c=>sellerStore(c,f.seller));check(resolved.id===current.store.id,'Seller setup resolves only the current store');
 await denied(()=>run(f.admin,c=>c.query('update public.stores set application_id=$2 where id=$1',[current.store.id,original.application.id])),'23514','Store cannot adopt old approval');
 await denied(()=>run(f.admin,c=>c.query("insert into public.stores(seller_context_id,primary_owner_id,name,campus,primary_category,application_id)select seller_context_id,primary_owner_id,name,campus,primary_category,$2 from public.stores where id=$1",[current.store.id,original.application.id])),'23514','New store cannot be inserted with old approval');
 const oldResult=await run(f.seller,c=>fulfillCheckout(c,checkout.record.id));
 check(!oldResult.accessGranted&&oldResult.historical&&!oldResult.store,'Historical callback cannot advertise new store access');
 await denied(()=>run(f.seller,c=>prepareCheckout(c,f.seller,checkoutRequest)),409,'Old checkout retry key cannot carry across registrations');
 check(!(await run(f.owner,c=>sellerStatus(c,f.owner))).store.registrationFeePaid,'Retrying old paid receipt does not pay for new store');
 assert.deepEqual((await db.pool.query('select jsonb_agg(to_jsonb(p)order by id)d from public.payments p where store_id=$1',[store.id])).rows[0].d,oldPayments);checks++;
 check(!(await db.pool.query('select private.store_is_public($1) eligible',[store.id])).rows[0].eligible,'Old paid store remains unavailable publicly');
 await denied(()=>run(f.admin,c=>c.query('delete from public.seller_applications where id=$1',[original.application.id])),'42501','Old approval history cannot be deleted');
 await run(f.owner,async c=>{await c.query('set local role pinevela_backend');check((await c.query('select id from private.seller_application_details')).rowCount===2,'Primary scoped projection preserves both application histories');});
 await run(f.other,async c=>{await c.query('set local role pinevela_backend');check((await c.query('select id from private.seller_application_details')).rowCount===0,'Another primary cannot read seller history');});
 check((await run(f.owner,c=>sellerStatus(c,f.owner))).application.id===next.application.id,'Primary status chooses current application');
 assert.deepEqual((await db.pool.query('select to_jsonb(a)d from public.seller_applications a where id=$1',[original.application.id])).rows[0].d,history);checks++;
 assert.deepEqual((await db.pool.query('select to_jsonb(c)d,to_jsonb(k)pin from public.account_contexts c join private.portal_access_keys k on k.context_id=c.id where c.id=$1',[f.resident])).rows[0],sibling);checks++;
 check(await authDigest()===beforeAuth,'All genuine Auth rows and sessions retained unchanged');
 await run(f.seller,c=>saveStoreProfile(c,f.seller,{...setup,username:setup.username+'-new'},true));
 const freshQuote=await run(f.seller,c=>prepareCheckout(c,f.seller,{requestId:crypto.randomUUID(),purpose:'activation',plan:'default'}));
 check(freshQuote.record.id!==checkout.record.id&&freshQuote.record.store_id===current.store.id,'Fresh registration creates a distinct receipt for the new store');
 check((await run(f.seller,c=>fulfillCheckout(c,freshQuote.record.id))).accessGranted,'New store activates only through its own registration receipt');
 check((await db.pool.query('select count(distinct store_id)::int n from public.store_fee_periods where store_id=any($1::uuid[])',[[store.id,current.store.id]])).rows[0].n===2,'Each store retains independent two-month access periods');
 check(!(await db.pool.query('select private.store_is_public($1) eligible',[store.id])).rows[0].eligible,'New activation leaves the old store closed');
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/seller-reenrollment-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native security advisors complete');const reportData=JSON.parse(advisor.stdout.toString()),findings=reportData.results||reportData;check(Array.isArray(findings)&&!findings.length,'No native security advisor findings');
 const report={passed:true,checks,isolatedNative:true,authFabricated:false,cloudRecordsModified:0,providerBrowserVerified:false};fs.writeFileSync('.security/migration-reset/seller-reenrollment-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }finally{await db.close();}
},{applicationCheckpoint});}catch(error){fs.writeFileSync('.security/migration-reset/seller-reenrollment-failure.json',JSON.stringify({stage,checks,error:String(error),stack:(error as Error).stack},null,2),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:(error as any)?.code,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
