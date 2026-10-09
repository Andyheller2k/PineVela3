import {prepareCheckout,fulfillCheckout,SupabasePayments,pendingCheckouts,paymentLedger} from '../supabase/payments.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {publicPlatformSettings} from '../platformSettings.js';
import {addMonths} from '../paystackProvider.js';
import {freeStoreVerification} from './lib/free-store-verification.js';
/** Payment quotes and actual fee waivers tested ONLY in an isolated restore of genuine Auth records.
 * No provider mocks, cloud fixture commits or production account restoration. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {saveListing,sellerInventory} from '../supabase/inventory.js';
import {createOrder,changeOrder,orderRows} from '../supabase/orders.js';
import {loadOrderPins} from '../supabase/orderPins.js';
import {reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {saveStoreProfile,sellerStore} from '../supabase/storeSetup.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {sendMarketMessage,conversationRows,purchaseReview} from '../supabase/marketConversation.js';
import {publicProducts} from '../supabase/catalog.js';

dotenv.config({quiet:true});
const id=process.argv[2];if(!id)throw new Error('Pass an encrypted checkpoint UUID.');
let checks=0;const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try{await withIsolatedBackup(id,async config=>{
  let db=new SupabaseDatabase(config);
  try{
    await db.system(async c=>{
      const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
      for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()){
        const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');if(ledger.has(file.slice(0,14)))assert.equal(ledger.get(file.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
      }
      check((await c.query('select count(*) from public.profiles')).rows[0].count==='0','Checkpoint has no operational profiles');
    });
    const f=await db.system(async c=>{
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
  const actors=[own.actor,foreign.actor];const stores:any[]=[];
  for(const [i,parent,e,subject] of [[0,owner,own,child],[1,foreignOwner,foreign,foreignChild]] as const){
    await bind(parent);const submitted=await submitSellerApplication(c,parent,{...payload,enrollmentId:e.id,storeName:subject.raw_user_meta_data?.full_name || subject.email,idNumber:`PV-INVENTORY-${i}`});
    await bind(admin);await decideSellerApplication(c,admin,{id:submitted.application.id},true);
    await bind(e.actor);await saveStoreProfile(c,e.actor,{storeName:submitted.application.storeName,username:subject.email.split('@')[0],location:'Inventory verification campus',category:payload.categoryToSell,deliveryMode:'Campus Meetup',phone:'+233241234567',phoneCountry:'GH',description:''},true);
    stores.push(await sellerStore(c,e.actor));
  }
  await bind(own.actor);const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),512);
  async function photo(a:VerifiedActor){const asset=await reserveMedia(c,a,'market',image);await finishMedia(c,a,asset.id);return mediaUrl(asset.id);}
  const cover=await photo(own.actor),extra=await photo(own.actor),foreignPhoto=await photo(foreign.actor);
  const draft={title:child.raw_user_meta_data?.full_name || child.email,description:'Inventory workflow verification',price:10,category:payload.categoryToSell,stockQuantity:5,isService:false,condition:'Like New',meetingLocation:'Inventory verification campus',imageUrl:cover,additionalImages:[extra]};
  await denied(()=>saveListing(c,own.actor,draft),402,'Unpaid approved store cannot publish');
  await denied(()=>saveListing(c,owner,draft),403,'Primary cannot publish through child portal');
  await denied(()=>saveListing(c,admin,draft),403,'Administrator cannot impersonate seller');
  await denied(()=>sellerInventory(c,owner),403,'Primary owner cannot read separate seller inventory');
  await denied(()=>c.query("insert into public.listings(store_id,kind,title,description,price,stock_quantity,is_published) values($1,'product',$2,$3,10,5,true)",[stores[1].id,draft.title,draft.description]),'23514','SQL independently blocks unpaid publication');
  // Exercise the actual server zero-fee policy; no provider payment is faked.


      await freeStoreVerification(c,foreign.actor);

      for(const a of [owner,foreignOwner,own.actor,foreign.actor])await bind(a);
      return {buyer:foreignOwner,seller:own.actor,other:owner,foreignSeller:foreign.actor,draft,store:stores[0].id,foreignStore:stores[1].id,admin,cover};
    });
    let payments=new SupabasePayments(new SupabaseAuth(db));
    const prepare=(a:VerifiedActor,body:any)=>db.authorizedSystem(a,['seller','manager'],c=>prepareCheckout(c,a,body,'http://127.0.0.1:3001'));
    const fulfill=(a:VerifiedActor,id:string)=>db.authorizedSystem(a,['seller'],c=>fulfillCheckout(c,id));
    async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}check(typeof expected==='number'?error instanceof ApiError && error.status===expected:error?.code===expected,`${label} (expected ${expected}, actual ${error instanceof ApiError?error.status:error?.code || 'no error'})`);}
    const request={requestId:crypto.randomUUID(),purpose:'activation',plan:'default'};
    await denied(()=>prepare(f.buyer,request),403,'Primary cannot pay through a seller portal');
    for(const patch of [{amount:0},{paid:true},{email:'spoof'},{storeId:f.store},{actorId:f.seller.contextId},{plan:'pro'},{plan:'unknown'},{requestId:'invalid'}, {mobileMoney:{phone:'0500000000',provider:'vod',pin:'private'}}])await denied(()=>prepare(f.seller,{...request,...patch}),400,'Checkout rejects client prices, identity, upgrades and wallet PINs');
    const quoted=(await prepare(f.seller,request)).record;
    const configured=await db.system(async c=>publicPlatformSettings({platformSettings:(await c.query("select value from private.platform_settings where key='platform'")).rows[0]?.value}));
    check(Number(quoted.amount_minor)===Math.round(configured.registrationFee*100) && quoted.lines.length===1 && quoted.lines[0].kind==='registration' && quoted.plan==='default','Activation quotes only the saved registration fee');
    check(quoted.actor_context_id===f.seller.contextId && quoted.store_id===f.store && quoted.payer_email===(await db.pool.query('select email from public.profiles where id=$1',[f.seller.authUserId])).rows[0].email,'Quote ownership and payer email come from the actual verified seller');
    check((await prepare(f.seller,request)).record.id===quoted.id,'Checkout retry retains its original quote and reference');
    await denied(()=>prepare(f.seller,{...request,purpose:'semester'}),409,'Request UUID cannot change payment purpose');
    if(Number(quoted.amount_minor)>0){
      await denied(()=>fulfill(f.seller,quoted.id),409,'A positive quote cannot be fulfilled without actual verified Paystack evidence');
      await denied(()=>db.system(c=>c.query("update public.payments set status='fulfilled',fulfilled_at=now() where id=$1",[quoted.id])),'23514','SQL rejects invented paid status');
    }
    await db.system(c=>c.query("insert into private.platform_settings(key,value) values('platform',$1) on conflict(key) do update set value=excluded.value",[JSON.stringify({...configured,registrationFee:0})]));
    check(Number((await prepare(f.seller,request)).record.amount_minor)===Number(quoted.amount_minor),'Administrator price changes do not rewrite a previous quote');
    const free=(await prepare(f.seller,{...request,requestId:crypto.randomUUID()})).record;
    check(free.mode==='free' && free.provider==='platform' && Number(free.amount_minor)===0,'Actual zero registration policy creates an explicit free quote');
    const simultaneous=await Promise.all([fulfill(f.seller,free.id),fulfill(f.seller,free.id)]);
    check(simultaneous.every(r=>r.paid && r.accessGranted),'Eligible actual zero-fee registration grants access with concurrent retries');
    const registered=(await db.pool.query('select fulfilled_at,provider_receipt from public.payments where id=$1',[free.id])).rows[0];
    const periods=(await db.pool.query('select ends_at from public.store_fee_periods where store_id=$1',[f.store])).rows;
    const subscription=(await db.pool.query("select * from public.store_subscriptions where store_id=$1 and status='active'",[f.store])).rows;
    const expected=addMonths(registered.fulfilled_at.getTime(),2);
    check(periods.length===1 && periods[0].ends_at.toISOString()===expected && subscription.length===1 && subscription[0].plan==='default' && subscription[0].ends_at.toISOString()===expected,'Registration grants exactly two calendar months of default and fee access');
    check(registered.provider_receipt.source==='platform_zero_fee','A fee waiver is explicitly distinguished from a provider charge');
    check((await db.pool.query("select count(*) from private.audit_events where resource_id=$1 and event_type='payment_fulfilled'",[free.id])).rows[0].count==='1','Concurrent fulfillment audits once');
    check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category='market_payment'",[f.seller.contextId])).rows[0].count==='1','Registration retries notify the seller once');
    check((await db.publicRows('select id from public.store_catalog where id=$1',[f.store])).length===1,'Verified initial registration exposes the actual store');
    await denied(()=>prepare(f.seller,{...request,requestId:crypto.randomUUID()}),409,'One-time registration cannot be paid again');
    await denied(()=>payments.verify(f.foreignSeller,free.provider_reference),404,'Foreign seller cannot verify or discover this receipt');
    await denied(()=>payments.verify(f.buyer,free.provider_reference),403,'Linked primary cannot use seller payment verification');
    await denied(()=>db.actor(f.seller,c=>c.query('select provider_receipt from public.payments')),'42501','Browser cannot read provider receipt data');
    await denied(()=>db.actor(f.seller,c=>c.query('select * from private.payment_checkouts')),'42501','Browser cannot read checkout email, settlement or wallet details');
    await denied(()=>db.actor(f.foreignSeller,c=>c.query("update public.payments set status='fulfilled' where id=$1",[free.id])),'42501','Browser cannot mutate payment status');
    await db.actor(f.foreignSeller,async c=>check((await c.query('select id from public.payments where id=$1',[free.id])).rowCount===0,'Payment RLS excludes another seller'));
    for(const column of ['actor_context_id','store_id'])await denied(()=>db.system(c=>c.query(`update public.payments set ${column}=$2 where id=$1`,[free.id,crypto.randomUUID()])),'23514','Payment ownership and target are immutable');
    await denied(()=>db.system(c=>c.query('update public.payments set amount=999 where id=$1',[free.id])),'23514','Payment amount cannot be rewritten');
    await denied(()=>db.system(c=>c.query("update private.payment_checkouts set plan='pine_pro' where payment_id=$1",[free.id])),'23514','Checkout cannot be upgraded without a separate quote');
    await denied(()=>db.system(c=>c.query('update public.store_fee_periods set ends_at=ends_at+interval \'1 year\' where store_id=$1',[f.store])),'23514','SQL preserves the saved access interval');
    await denied(()=>db.system(c=>c.query("insert into public.store_fee_periods(store_id,payment_id,starts_at,ends_at) select store_id,id,fulfilled_at,fulfilled_at+interval '1 year' from public.payments where id=$1",[free.id])),'23514','SQL rejects an invented initial access duration');
    const renewal=(await prepare(f.seller,{requestId:crypto.randomUUID(),purpose:'semester'})).record;
    check(renewal.lines[0].kind==='semester' && Number(renewal.amount_minor)===Math.round(configured.semesterFee*100),'Two-month renewal is a separate fee quote');
    await db.authorizedSystem(f.seller,['seller'],c=>freeStoreVerification(c,f.seller,'default','semester'));
    check((await db.pool.query('select max(ends_at) as expiry from public.store_fee_periods where store_id=$1',[f.store])).rows[0].expiry.getTime()<Date.parse(expected)+5000,'Repeated zero-fee renewals cannot stack free two-month extensions');
    const pro=(await prepare(f.seller,{requestId:crypto.randomUUID(),purpose:'subscription',plan:'pro'})).record;
    check(pro.lines.length===1 && pro.lines[0].kind==='subscription' && Number(pro.amount_minor)===Math.round(configured.subscriptionPrices.pro*100),'Paid monthly upgrades are separate from registration');
    await db.authorizedSystem(f.seller,['seller'],c=>freeStoreVerification(c,f.seller,'star','subscription'));
    const star=(await db.pool.query("select * from public.store_subscriptions where store_id=$1 and status='active'",[f.store])).rows;
    check(star.length===1 && star[0].plan==='pine_star','Actual zero-fee Star policy replaces the old active plan once');
    await db.authorizedSystem(f.seller,['seller'],async c=>{
      await c.query(`insert into public.listings(store_id,kind,title,description,price,stock_quantity) select $1,'product','Payment capacity verification '||n,'Isolated policy verification',10,1 from generate_series(1,21) n`,[f.store]);
    });
    await denied(()=>prepare(f.seller,{requestId:crypto.randomUUID(),purpose:'subscription',plan:'default'}),409,'A downgrade cannot exceed the selected plan capacity');
    const pending=await db.authorizedSystem(f.seller,['seller'],c=>pendingCheckouts(c,f.seller));
    check(pending.some(p=>p.reference===pro.provider_reference) && !pending.some(p=>p.reference===free.provider_reference) && pending.every(p=>!('payer_email' in p) && !('mobile_money' in p)),'Unfinished checkout recovery lists actual own references without private provider fields');
    check((await db.authorizedSystem(f.foreignSeller,['seller'],c=>pendingCheckouts(c,f.foreignSeller))).length===0,'Other sellers cannot recover this account’s unfinished checkouts');
    const before=(await db.pool.query('select count(*) from public.notifications')).rows[0].count;
    await db.close();db=new SupabaseDatabase(config);payments=new SupabasePayments(new SupabaseAuth(db));
    check((await payments.verify(f.seller,free.provider_reference)).accessGranted,'Committed receipt survives backend pool restart');
    check((await db.pool.query('select count(*) from public.notifications')).rows[0].count===before,'Verification after restart does not repeat access notices');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[f.admin.sessionId,f.admin.contextId]));
    const ledger=await db.authorizedSystem(f.admin,['admin'],c=>paymentLedger(c,f.admin));
    check(ledger.some(p=>p.id===free.id && p.purpose==='activation') && ledger.every(p=>!('provider_receipt' in p) && !('payer_email' in p)),'Administrator ledger preserves client billing categories and excludes private payment evidence');
    await denied(()=>db.authorizedSystem(f.seller,['seller'],c=>paymentLedger(c,f.seller)),403,'Seller cannot read the administrator payment ledger');
    await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[f.other.sessionId,f.other.contextId]));
    const housing=await db.system(async c=>{
      const rows=[];
      for(const seller of [f.seller,f.foreignSeller]){
        const manager={...seller,kind:'manager',contextId:(await c.query(`insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)
          select id,primary_owner_id,'manager','active' from public.profiles where id=$1 returning id`,[seller.authUserId])).rows[0].id};
        const residence=(await c.query(`insert into public.residences(primary_owner_id,name)
          select primary_owner_id,display_name from public.profiles where id=$1 returning id`,[seller.authUserId])).rows[0].id;
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,residence]);
        await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[manager.sessionId,manager.contextId]);
        rows.push({manager,residence});
      }
      return rows;
    });
    const houseRequest={requestId:crypto.randomUUID(),purpose:'housing',hostelId:housing[0].residence};
    const house=(await prepare(housing[0].manager,houseRequest)).record;
    check(Number(house.amount_minor)===5000 && house.store_id===null && house.residence_id===housing[0].residence && house.plan===null,'Residence quote preserves the assigned manager and fixed onboarding fee');
    check((await prepare(housing[0].manager,houseRequest)).record.id===house.id,'Residence quote retries retain the original payment reference');
    check((await db.authorizedSystem(housing[0].manager,['manager'],c=>pendingCheckouts(c,housing[0].manager))).some(p=>p.reference===house.provider_reference && p.purpose==='housing'),'Actual residence quotes use the housing billing category shared with the administrator ledger');
    await denied(()=>prepare(housing[1].manager,{...houseRequest,requestId:crypto.randomUUID()}),404,'Manager cannot quote onboarding for another residence');
    await denied(()=>prepare(housing[0].manager,{...houseRequest,requestId:crypto.randomUUID(),plan:'pro'}),400,'Housing checkout cannot use store plan selectors');
    await denied(()=>db.authorizedSystem(housing[0].manager,['manager'],c=>fulfillCheckout(c,house.id)),409,'Residence access requires actual verified provider payment');
    await db.actor(housing[1].manager,async c=>check((await c.query('select id from public.payments where id=$1',[house.id])).rowCount===0,'Residence receipt RLS excludes another manager'));
    await db.system(async c=>{for(const seller of [f.seller,f.foreignSeller])await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[seller.sessionId,seller.contextId]);});
    await db.pool.query('delete from auth.sessions where id=$1',[f.seller.sessionId]);
    await denied(()=>payments.verify(f.seller,free.provider_reference),401,'Revoked real session cannot retrieve receipt or grant access');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedCommittedPayments:true,cloudRecordsModified:0,providerChargesCreated:0,paidProviderFulfillmentVerified:false,temporaryRestoreRemoved:true}));}
catch(error){fs.writeFileSync('/tmp/pinevela-payment-failure.json',JSON.stringify({code:(error as any)?.code,message:(error as any)?.message}),{mode:0o600});console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
