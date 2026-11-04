import {termsAcceptance} from '../legalPolicy.js';
/** Admin reads on isolated native records and genuine archived Google identities. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
import {saveStoreProfile} from '../supabase/storeSetup.js';
import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {hashPortalPin,checkPortalPin} from '../supabase/portalAccess.js';
import {reactivateSeller} from '../supabase/sellerReactivation.js';
import {administratorStores,administratorManagerRestrictions} from '../supabase/adminStoreOverview.js';

const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(!checkpoint||!applicationCheckpoint)throw Error('Pass actual Auth and pre-enrollment archive UUIDs.');
let checks=0,stage='restore';const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
try{await withIsolatedBackup(checkpoint,async config=>{
 const db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)d`)).rows[0].d;
 const beforeAuth=await authDigest();stage='native domain fixture';
 const f=await db.system(async c=>{
  const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','')name,s.id sid
   from auth.users u join lateral(select id from auth.sessions where user_id=u.id and(not_after is null or not_after>clock_timestamp())order by created_at desc limit 1)s on true
   where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb)
   order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 3`)).rows;
  check(people.length===3,'Genuine archived verified identities available');
  const owners:VerifiedActor[]=[];for(const p of people.slice(0,2)){
   await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
   const id=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;
   const a={contextId:id,authUserId:p.id,sessionId:p.sid,kind:'primary'};owners.push(a);
   await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[p.sid,p.id,id]);
  }
  const owner=owners[0],p=people[2],nonce=crypto.randomBytes(32).toString('hex');
  const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)values($1,$2,'seller',$3,$4,$5,clock_timestamp()+interval'24 hours')returning id",[owner.contextId,owner.authUserId,p.email,crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:p.name,phone:''})])).rows[0].id;
  await c.query('select private.initialize_auth_profile($1,$2)',[p.id,nonce]);
  const sellerId=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='seller'",[p.id])).rows[0].id;
  const seller={contextId:sellerId,authUserId:p.id,sessionId:p.sid,kind:'seller'};
  await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[p.sid,p.id,sellerId]);
  const adminId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'admin','active')returning id",[owner.authUserId])).rows[0].id;
  await c.query('insert into public.admin_memberships(context_id,slot)values($1,1)',[adminId]);
  const managerId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'manager','pending')returning id",[p.id,owner.authUserId])).rows[0].id;
  await c.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id)values($1,'manager_account',clock_timestamp()-interval'1 day','Expired reviewed manager registration cooldown',$3),($2,'residence',clock_timestamp()+interval'2 days','Active reviewed residence registration cooldown',$3)",[owner.contextId,managerId,adminId]);
  const pin='85274196';await c.query('insert into private.portal_access_keys(context_id,pin_hash)values($1,$2)',[sellerId,await hashPortalPin(pin)]);
  await c.query("insert into private.platform_settings(key,value)values('platform','{\"registrationFee\":0}'::jsonb)on conflict(key)do update set value=private.platform_settings.value||excluded.value");
  return{owner,other:owners[1],seller,admin:{...owner,contextId:adminId,kind:'admin'},managerId,enrollment,pin,proof:{authUserId:p.id,email:p.email,sessionId:p.sid},name:p.name};
 });
 stage='migrations';await db.system(async c=>{
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(file.slice(0,14)))assert.equal(ledger.get(file.slice(0,14)),digest);
   else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[file.slice(0,14),digest]);}
  }
 });
 async function run<T>(a:VerifiedActor,work:(c:any)=>Promise<T>){return db.system(async c=>{
  await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]);
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);return work(c);
 });}
 async function denied(work:()=>Promise<unknown>,status:number,label:string){let error:any;try{await work();}catch(e){error=e;}check(error instanceof ApiError&&error.status===status,label);}
 async function adminRead<T>(a:VerifiedActor,work:(c:any)=>Promise<T>){
  await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[a.sessionId,a.contextId]));
  return db.authorizedSystem(a,['admin'],work);
 }
 const stores=()=>adminRead(f.admin,c=>administratorStores(c,f.admin));
 const bans=()=>adminRead(f.admin,c=>administratorManagerRestrictions(c,f.admin));
 stage='admin-only reads';check((await stores()).length===0,'Empty native store inventory returns no fabricated cards');
 const restrictions=await bans();check(restrictions.length===2,'Both native cooldowns are retained for review');
 const manager=restrictions.find(r=>r.kind==='residence'),primary=restrictions.find(r=>r.kind==='manager_account');
 check(manager?.accountId===f.managerId&&manager.isActive===true,'Residence cooldown applies to the exact manager portal');
 check(primary?.accountId===f.owner.contextId&&primary.isActive===false,'Manager-account cooldown applies to primary identity and reports expiry');
 check(manager?.managerEmail===f.proof.email&&manager.userEmail!==f.proof.email,'Separate manager and primary mailbox relationships resolve correctly');
 check(!Object.hasOwn(primary!,'bypassApproved')&&!Object.hasOwn(primary!,'bypassRequested'),'No legacy single-admin waiver state is manufactured');
 await denied(()=>adminRead(f.other,c=>administratorStores(c,f.other)),403,'Ordinary primary cannot read admin store inventory');
 await denied(()=>adminRead(f.other,c=>administratorManagerRestrictions(c,f.other)),403,'Ordinary primary cannot read admin cooldowns');
 await denied(()=>adminRead({...f.other,kind:'admin'},c=>administratorStores(c,{...f.other,kind:'admin'})),401,'Forged admin role without native binding denied');
 await denied(()=>run(f.admin,c=>administratorStores(c,{...f.admin,authUserId:f.other.authUserId})),403,'Cross-identity administrator projection denied');
 await denied(()=>adminRead({...f.admin,sessionId:crypto.randomUUID()},c=>administratorStores(c,f.admin)),401,'Missing native Auth session denied');
 stage='approved setup and actual zero-fee registration';
 await run(f.owner,c=>finishEnrollment(c,f.owner,f.enrollment,f.proof));
 const application=await run(f.owner,c=>submitSellerApplication(c,f.owner,{enrollmentId:f.enrollment,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261013',storeName:f.name,certified:true,termsAcceptance:termsAcceptance(true)}));
 await run(f.admin,c=>decideSellerApplication(c,f.admin,{id:application.application.id},true));
 let store=(await stores())[0];check(store.applicationId===application.application.id&&store.registrationGeneration===0,'Exact current approval/generation represented');
 check(store.ownerName===f.name&&store.studentEmail===f.proof.email,'Saved student identity represents actual seller');
 check(store.statusLabel==='Setup pending'&&!store.isActive&&!store.registrationFeePaid,'Pending store is not counted as active');
 await run(f.seller,c=>saveStoreProfile(c,f.seller,{storeName:f.name,username:'admin-overview-'+f.seller.contextId,location:'KNUST Campus',category:'General Campus Essentials',deliveryMode:'Campus Delivery',phone:'0241234567',phoneCountry:'GH',description:''},true));
 store=(await stores())[0];check(store.statusLabel==='Registration payment pending'&&!store.isActive,'Completed setup still requires verified registration');
 const checkout=await run(f.seller,c=>prepareCheckout(c,f.seller,{requestId:crypto.randomUUID(),purpose:'activation',plan:'default'}));
 check(checkout.record.mode==='free','Zero-fee native policy exercises fulfillment without mocked provider replies');
 await run(f.seller,c=>fulfillCheckout(c,checkout.record.id));
 store=(await stores())[0];check(store.isActive&&store.statusLabel==='Active'&&store.registrationFeePaid,'Fulfilled native registration is counted as active');
 check(Boolean(store.semesterExpiresAt)&&Boolean(store.subscriptionExpiresAt),'Access and subscription dates come from native periods');
 check(!JSON.stringify(store).match(/token_digest|pin_hash|key_hash|password_hash|refresh_token/),'DTO excludes credential columns');
 const originalId=store.id;stage='retained historical registration';
 await db.system(async c=>{await c.query("update public.stores set status='closed' where id=$1",[originalId]);await c.query("update public.account_contexts set status='closed' where id=$1",[f.seller.contextId]);});
 const proof=await run(f.owner,c=>checkPortalPin(c,f.seller.contextId,f.pin));check(proof.allowed,'Current seller PIN authorizes isolated re-registration');
 await run(f.owner,c=>reactivateSeller(c,f.owner,f.enrollment,f.proof,proof.version));
 const next=await run(f.owner,c=>submitSellerApplication(c,f.owner,{enrollmentId:f.enrollment,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261013',storeName:f.name,certified:true,termsAcceptance:termsAcceptance(true)}));
 await run(f.admin,c=>decideSellerApplication(c,f.admin,{id:next.application.id},true));
 const inventory=await stores();check(inventory.length===2,'Historical and new stores are shown separately');
 const old=inventory.find(s=>s.id===originalId)!,current=inventory.find(s=>s.id!==originalId)!;
 check(!old.isCurrent&&!old.isActive&&old.statusLabel==='Closed'&&old.registrationFeePaid,'Paid historical store remains closed and does not contribute active count');
 check(current.isCurrent&&!current.isActive&&!current.registrationFeePaid&&current.registrationGeneration===1,'Fresh store cannot inherit historical payment/access');
 check(new Set(inventory.map(s=>s.applicationId)).size===2,'Exact approval join produces no cycle cross-product');
 check(await authDigest()===beforeAuth,'All real provider identities and Auth sessions remain byte-for-byte unchanged');
 fs.writeFileSync('.security/migration-reset/admin-store-overview-native.json',JSON.stringify({status:'passed',checks,isolated:true,cloudWrites:false,authChanged:false,providerRepliesMocked:false},null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify({status:'passed',checks,isolated:true,cloudWrites:false,authChanged:false}));
 }finally{await db.close();}
},{applicationCheckpoint});}catch(error:any){console.error(JSON.stringify({status:'failed',stage,checks,code:error?.code||null,message:String(error?.message||error)}));process.exitCode=1;}
