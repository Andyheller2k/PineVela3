import {termsAcceptance} from '../legalPolicy.js';
import {freeStoreVerification} from './lib/free-store-verification.js';
/** Committed orders tested ONLY in an isolated restore of genuine Auth records.
 * No provider mocks, cloud fixture commits or production account restoration. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {saveListing,sellerInventory} from '../supabase/inventory.js';
import {createOrder,changeOrder,renewOrderPin,orderRows} from '../supabase/orders.js';
import {loadOrderPins} from '../supabase/orderPins.js';
import {reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {saveStoreProfile,sellerStore} from '../supabase/storeSetup.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
import {withIsolatedBackup} from './lib/isolated-postgres.js';

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
  const payload={enrollmentId:own.id,university:'Kwame Nkrumah University of Science and Technology (KNUST)',categoryToSell:'General Campus Essentials',idNumber:'PV-20261009',storeName:child.raw_user_meta_data?.full_name || child.email,certified:true,termsAcceptance:termsAcceptance(true)};
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
  await freeStoreVerification(c,own.actor);

      const item=(await saveListing(c,own.actor,{...draft,stockQuantity:1})).product;
      for(const a of [owner,foreignOwner,own.actor,foreign.actor])await bind(a);
      return {buyer:foreignOwner,seller:own.actor,other:owner,foreignSeller:foreign.actor,item,draft};
    });
    const pins=loadOrderPins();
    const makeRequest=()=>({requestId:crypto.randomUUID(),productId:f.item.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Order verification campus'});
    const create=(body:any)=>db.authorizedSystem(f.buyer,['primary'],c=>createOrder(c,f.buyer,body,pins));
    const act=(a:VerifiedActor,orderId:string,body:any)=>db.authorizedSystem(a,['primary','seller'],c=>changeOrder(c,a,orderId,body,pins));
    const rows=(a:VerifiedActor)=>db.authorizedSystem(a,['primary','seller'],c=>orderRows(c,a,pins));
    let rangeError:any;try{await create({...makeRequest(),quantity:Number.MAX_SAFE_INTEGER});}catch(e){rangeError=e;}check(rangeError instanceof ApiError && rangeError.status===400,'PostgreSQL integer overflow is rejected before order insertion');
    const race=await Promise.allSettled([create(makeRequest()),create(makeRequest())]);
    const winners=race.filter(r=>r.status==='fulfilled'),losers=race.filter(r=>r.status==='rejected');
    check(winners.length===1 && losers.length===1,'Concurrent requests cannot oversell one available item');
    check((losers[0] as PromiseRejectedResult).reason instanceof ApiError && (losers[0] as PromiseRejectedResult).reason.status===409,'Unavailable stock returns a controlled conflict');
    const order=(winners[0] as PromiseFulfilledResult<any>).value.order;
    check((await db.pool.query('select count(*) from public.market_orders')).rows[0].count==='1','One committed reservation exists');
    check((await db.pool.query('select stock_quantity from public.listings where id=$1',[f.item.id])).rows[0].stock_quantity===1,'Reservation preserves physical stock');
    await act(f.seller,order.id,{action:'agree-location'});
    let denied:any;try{await act(f.foreignSeller,order.id,{action:'agree-location'});}catch(e){denied=e;}check(denied instanceof ApiError && denied.status===404,'Committed foreign seller cannot act on order');
    for(let i=1;i<=5;i++){const result=await act(f.seller,order.id,{newStatus:'Completed & Paid',inputPin:'000000'});check('errorStatus' in result && result.errorStatus===(i===5?429:400),'Wrong PIN is rejected with a committed bounded attempt counter');}
    await db.close();db=new SupabaseDatabase(config);
    check((await db.pool.query('select attempts from private.market_order_pins where order_id=$1',[order.id])).rows[0].attempts===5,'Failure counter survives backend pool restart');
    check((await rows(f.buyer))[0].deliveryPinState==='locked','Lock survives a new backend instance');
    await db.system(c=>c.query("update private.market_order_pins set issued_at=clock_timestamp()-interval '2 minutes' where order_id=$1",[order.id]));
    const renewed=await db.authorizedSystem(f.buyer,['primary'],c=>renewOrderPin(c,f.buyer,order.id,{},pins));
    check(renewed.order.otpPin!==order.otpPin,'Committed renewal replaces the old challenge');
    await db.close();db=new SupabaseDatabase(config);
    const saved=(await rows(f.buyer))[0];check(saved.otpPin===renewed.order.otpPin && saved.deliveryPinState==='active','Encrypted PIN survives backend pool restart');
    const completed=await Promise.all([act(f.seller,order.id,{newStatus:'Completed & Paid',inputPin:saved.otpPin}),act(f.seller,order.id,{newStatus:'Completed & Paid',inputPin:saved.otpPin})]);
    check(completed.every(r=>'order' in r && r.order.status==='Completed & Paid') && completed.some(r=>'idempotent' in r && r.idempotent),'Concurrent completion retries are safe');
    check((await db.pool.query('select stock_quantity,is_published from public.listings where id=$1',[f.item.id])).rows[0].stock_quantity===0,'Concurrent handover consumes exactly one unit');
    check(!(await db.pool.query('select is_published from public.listings where id=$1',[f.item.id])).rows[0].is_published,'Exhausted physical inventory is unpublished');
    check((await db.pool.query("select count(*) from private.market_order_events where order_id=$1 and action='completed'",[order.id])).rows[0].count==='1','Completion history is written once');
    check((await db.pool.query("select count(*) from public.notifications where title='Purchase Completed'")).rows[0].count==='1','Completion notification is written once');
    check((await db.pool.query('select count(*) from private.market_order_pins where order_id=$1',[order.id])).rows[0].count==='0','Terminal challenge is removed at commit');
    const second=await db.authorizedSystem(f.seller,['seller'],c=>saveListing(c,f.seller,{...f.draft,stockQuantity:2}));
    const request={...makeRequest(),productId:second.product.id};const duplicate=await Promise.all([create(request),create(request)]);
    check(duplicate[0].order.id===duplicate[1].order.id,'Concurrent identical nonces create one order');
    check((await db.pool.query('select count(*) from public.market_orders where request_id=$1',[request.requestId])).rows[0].count==='1','Request uniqueness persists at commit');
    await db.close();db=new SupabaseDatabase(config);check((await create(request)).order.id===duplicate[0].order.id,'Retry after restart returns the original order');
    check((await rows(f.seller)).every(o=>!('otpPin' in o) && !('deliveryPinState' in o)),'Seller projection after restart excludes delivery secrets');
    await db.pool.query('delete from auth.sessions where id=$1',[f.buyer.sessionId]);
    denied=undefined;try{await create(makeRequest());}catch(e){denied=e;}check(denied instanceof ApiError && denied.status===401,'Revoked real session cannot create orders after restart');
    check((await db.pool.query("select rolbypassrls from pg_roles where rolname='pinevela_backend'")).rows[0].rolbypassrls===false,'Runtime browser role still cannot bypass RLS');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedCommittedConcurrencyAndRestart:true,cloudRecordsModified:0,providerFlowsVerified:false,temporaryRestoreRemoved:true}));}
catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || 'error',message:error instanceof assert.AssertionError?error.message:'Isolated order verification failed; no private records were printed.'}));process.exitCode=1;}
