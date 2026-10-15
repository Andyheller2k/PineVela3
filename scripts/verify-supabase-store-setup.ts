import {freeStoreVerification} from './lib/free-store-verification.js';
/** Real PostgreSQL/RLS checks using existing confirmed Auth subjects. Enrollment
 * and product fixtures roll back; no provider response, identity or email is mocked. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {saveStoreProfile,sellerStore} from '../supabase/storeSetup.js';
import {MARKET_DEFAULT_COVERS,MARKET_DEFAULT_LOGO} from '../marketBranding.js';
import {STORE_DELIVERY_METHODS} from '../storeDelivery.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication,sellerStatus} from '../supabase/sellerRegistration.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'store_setup_checks',checks}));};
try{
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from auth.users) as users,(select count(*) from auth.sessions) as sessions,
    (select count(*) from public.profiles) as profiles,(select count(*) from private.account_enrollments) as enrollments,
    (select count(*) from public.seller_applications) as applications,(select count(*) from public.stores) as stores,
    (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audit`)).rows[0];
  const before=await counts();if(before.profiles!=='0')throw new Error('Run before operational profiles exist.');
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const f of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()){
    const sql=fs.readFileSync(path.join('supabase/migrations',f),'utf8');if(ledger.has(f.slice(0,14)))assert.equal(ledger.get(f.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
  }
  const subjects=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
  if(subjects.length!==4)throw new Error('Four existing confirmed subjects required.');
  const [root,other,child,foreignChild]=subjects;
  async function primary(p:any):Promise<VerifiedActor>{await c.query('select private.initialize_auth_profile($1,null)',[p.id]);const contextId=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id;return {authUserId:p.id,sessionId:p.session_id,contextId,kind:'primary'};}
  const owner=await primary(root),foreignOwner=await primary(other);
  async function bind(a:VerifiedActor){await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
    on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  async function enrollment(p:any,a:VerifiedActor){const nonce=crypto.randomBytes(32).toString('hex');const id=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
    values($1,$2,'seller',$3,$4,$5,now()+interval '24 hours') returning id`,[a.contextId,a.authUserId,p.email.toLowerCase(),crypto.createHash('sha256').update(nonce).digest('hex'),JSON.stringify({displayName:p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || p.email,phone:''})])).rows[0].id;
    await c.query('select private.initialize_auth_profile($1,$2)',[p.id,nonce]);const ctx=(await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='seller'",[p.id])).rows[0].id;
    await bind(a);await finishEnrollment(c,a,id,{authUserId:p.id,email:p.email.toLowerCase(),sessionId:p.session_id});return {id,actor:{authUserId:p.id,sessionId:p.session_id,contextId:ctx,kind:'seller'} as VerifiedActor};}
  const own=await enrollment(child,owner),foreign=await enrollment(foreignChild,foreignOwner);
  const admin:VerifiedActor={...owner,contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active') returning id",[root.id])).rows[0].id,kind:'admin'};
  await c.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){await c.query('savepoint negative');let error:any;try{await work();}catch(e){error=e;}await c.query('rollback to savepoint negative');check(typeof expected==='number'?error instanceof ApiError && error.status===expected:error?.code===expected,label);}
  async function scoped(a:VerifiedActor,work:()=>Promise<any>){await bind(a);await c.query('set local role pinevela_backend');try{return await work();}finally{await c.query('reset role');}}
  const payload={enrollmentId:own.id,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261009',storeName:child.raw_user_meta_data?.full_name || child.email,certified:true};
  await bind(owner);const submitted=await submitSellerApplication(c,owner,payload);
  await bind(admin);await decideSellerApplication(c,admin,{id:submitted.application.id},true);
  await bind(own.actor);const store=await sellerStore(c,own.actor);
  const draft={storeName:payload.storeName,username:child.email.split('@')[0],location:'Store setup verification campus',category:payload.categoryToSell,
    deliveryMode:'Campus Delivery',phone:'0241234567',phoneCountry:'GH',description:'',profilePicture:MARKET_DEFAULT_LOGO,coverPicture:MARKET_DEFAULT_COVERS[2].url};
  await denied(()=>saveStoreProfile(c,owner,draft,true),403,'Primary cannot edit child store');
  await denied(()=>saveStoreProfile(c,admin,draft,true),403,'Administrator cannot impersonate seller');
  await denied(()=>saveStoreProfile(c,foreign.actor,draft,true),403,'Foreign pending seller cannot edit owned store');
  await bind(foreignOwner);const foreignApplication=await submitSellerApplication(c,foreignOwner,{...payload,enrollmentId:foreign.id,storeName:foreignChild.raw_user_meta_data?.full_name || foreignChild.email,idNumber:'PV-OTHER-STORE'});
  await bind(admin);await decideSellerApplication(c,admin,{id:foreignApplication.application.id},true);
  await bind(foreign.actor);const otherStore=await sellerStore(c,foreign.actor);
  check(otherStore.id!==store.id,'Another approved seller resolves only their own saved store');
  await saveStoreProfile(c,foreign.actor,{...draft,storeName:foreignApplication.application.storeName,username:foreignChild.email.split('@')[0]},true);
  check(!(await sellerStore(c,own.actor)).setup_completed_at,'Another seller completing setup cannot alter this store');
  await bind(own.actor);
  await denied(()=>saveStoreProfile(c,own.actor,{description:'Update'},false),409,'Editing requires initial completed setup');
  for(const field of ['userId','storeId','sellerId','primaryOwnerId','studentEmail','subscriptionPlan','registrationFeePaid','setupCompleted'])
    await denied(()=>saveStoreProfile(c,own.actor,{...draft,[field]:foreignOwner.authUserId},true),400,'Client identity, payment and plan assertions rejected');
  for(const patch of [{storeName:''},{username:''},{location:''},{category:''},{deliveryMode:''},{deliveryMode:'Unlisted delivery'},{phone:'invalid'},{phoneCountry:'XX'},{description:'x'.repeat(4001)}])
    await denied(()=>saveStoreProfile(c,own.actor,{...draft,...patch},true),400,'Required actual store profile fields validated');
  await denied(()=>saveStoreProfile(c,own.actor,{...draft,profilePicture:'https://outside.invalid/logo.png'},true),403,'Default plan cannot assign arbitrary custom logo');
  await denied(()=>saveStoreProfile(c,own.actor,{...draft,coverPicture:'https://outside.invalid/cover.png'},true),403,'Default plan cannot assign custom cover');
  check(!(await saveStoreProfile(c,own.actor,draft,true)).idempotent,'Seller saves initial actual profile');
  let status=await sellerStatus(c,own.actor);
  check(status.store.setupCompleted && !status.store.registrationFeePaid,'Saved setup never claims payment verification');
  check(status.store.phone==='+233241234567' && status.store.phoneCountry==='GH','International primary contact persists canonically');
  check(status.store.location===draft.location && status.store.username===draft.username && status.store.university===payload.university,'Physical location and username remain separate from school identity');
  check(status.store.deliveryMode===draft.deliveryMode && status.store.coverPicture===draft.coverPicture && !status.store.customBranding,'Actual delivery choice and selected default cover persist');
  const original=(await sellerStore(c,own.actor)).setup_completed_at;
  const snapshot=await counts();check((await saveStoreProfile(c,own.actor,draft,true)).idempotent,'Exact setup retry is idempotent');assert.deepEqual(await counts(),snapshot);checks++;
  for(const deliveryMode of STORE_DELIVERY_METHODS){await saveStoreProfile(c,own.actor,{deliveryMode},false);check((await sellerStatus(c,own.actor)).store.deliveryMode===deliveryMode,'All supported handover choices round-trip');}
  await saveStoreProfile(c,own.actor,{description:'Updated store details'},false);
  check((await sellerStore(c,own.actor)).description==='Updated store details','Owned profile edit persists');
  check((await sellerStore(c,own.actor)).setup_completed_at.getTime()===original.getTime(),'Profile edit preserves original setup time');
  await denied(()=>c.query('update public.stores set primary_owner_id=$2 where id=$1',[store.id,foreignOwner.authUserId]),'23514','SQL prohibits ownership reassignment');
  await denied(()=>c.query('update public.stores set campus=$2 where id=$1',[store.id,'Other campus']),'23514','SQL prohibits verified campus changes');
  await denied(()=>c.query('update public.stores set setup_completed_at=null where id=$1',[store.id]),'23514','SQL prohibits setup evidence erasure');
  await denied(()=>c.query('update public.stores set delivery_mode=null where id=$1',[store.id]),'23514','SQL disallows NULL delivery on completed setup');
  await denied(()=>c.query("update public.stores set status='active',activated_at=now() where id=$1",[store.id]),'23514','SQL blocks activation without verified payment');
  check((await c.query('select id from private.store_catalog')).rowCount===0,'Unpaid completed store remains outside public catalog');
  await scoped(own.actor,async()=>check((await c.query('select id from public.stores')).rowCount===1,'Exact seller reads owned private store'));
  await scoped(foreignOwner,async()=>check((await c.query('select id from public.stores')).rowCount===0,'Foreign buyer cannot read private owner IDs'));
  await scoped(own.actor,()=>denied(()=>c.query("update public.stores set name='Direct write' where id=$1",[store.id]),'42501','Browser role cannot directly write store profile'));
  await bind(own.actor);
  await denied(()=>c.query("update public.stores set status='active',activated_at=now() where id=$1",[store.id]),'23514','Activation requires actual verified receipt and access periods');
  await freeStoreVerification(c,own.actor,'star');
  check((await sellerStatus(c,own.actor)).store.customBranding,'Active saved Star subscription enables custom branding');
  await denied(()=>saveStoreProfile(c,own.actor,{profilePicture:'https://outside.invalid/logo.png'},false),400,'Paid plan still requires a valid private asset reference');
  await denied(()=>saveStoreProfile(c,own.actor,{coverPicture:'/api/media/'+crypto.randomUUID()},false),403,'Paid plan cannot adopt an unknown asset');
  await scoped(foreignOwner,async()=>{check((await c.query('select id from public.stores')).rowCount===0,'Public store still hides raw ownership from buyer');check((await c.query('select id from private.store_catalog')).rowCount===1,'Buyer can read safe published store projection');});
  await bind(own.actor);await c.query("update public.store_subscriptions set status='expired' where store_id=$1 and status='active'",[store.id]);
  check(!(await sellerStatus(c,own.actor)).store.customBranding && (await c.query('select id from private.store_catalog')).rowCount===0,'Expired plan loses custom branding and public listing access');
  check((await c.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category='market'",[own.actor.contextId])).rows[0].count!=='0','Actual seller receives profile lifecycle notices');
  check((await c.query("select count(*) from private.audit_events where resource_id=$1 and event_type='store_setup_saved'",[store.id])).rows[0].count==='1','Setup retry does not duplicate initial audit');
  await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,authUsersCreated:0,authUsersModified:0,providerFlowTested:false,livePaymentTested:false,authenticatedHttpTested:false}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally{await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
