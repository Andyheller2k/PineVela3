import {termsAcceptance} from '../legalPolicy.js';
import {freeStoreVerification} from './lib/free-store-verification.js';
/** Real PostgreSQL/RLS checks using existing confirmed Auth subjects. Enrollment
 * and product fixtures roll back; no provider response, identity or email is mocked. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {saveListing,removeListing,sellerInventory} from '../supabase/inventory.js';
import {createOrder,changeOrder,renewOrderPin,orderRows} from '../supabase/orders.js';
import {OrderPins} from '../supabase/orderPins.js';
import {reserveMedia,finishMedia,mediaUrl} from '../supabase/media.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
import {saveStoreProfile,sellerStore} from '../supabase/storeSetup.js';
import {MARKET_DEFAULT_COVERS,MARKET_DEFAULT_LOGO} from '../marketBranding.js';
import {STORE_DELIVERY_METHODS} from '../storeDelivery.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {submitSellerApplication,decideSellerApplication,sellerStatus} from '../supabase/sellerRegistration.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'order_checks',checks}));};
try{
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from auth.users) as users,(select count(*) from auth.sessions) as sessions,
    (select count(*) from public.profiles) as profiles,(select count(*) from private.account_enrollments) as enrollments,
    (select count(*) from public.seller_applications) as applications,(select count(*) from public.stores) as stores,
    (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audit,
    (select count(*) from public.market_orders) as orders,(select count(*) from private.market_order_pins) as pins,
    (select count(*) from public.media_assets) as media`)).rows[0];
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
  const pins=new OrderPins(crypto.randomBytes(32)),item=(await saveListing(c,own.actor,draft)).product;
  const request={requestId:crypto.randomUUID(),productId:item.id,quantity:2,buyerPhone:'+233241234567',meetingLocation:'Order verification campus',meetingLatitude:0,meetingLongitude:0};
  await bind(foreignOwner);
  await denied(()=>createOrder(c,owner,request,pins),403,'A linked primary owner cannot buy their own store');
  await denied(()=>createOrder(c,own.actor,request,pins),403,'Seller context cannot impersonate primary buyer');
  await denied(()=>createOrder(c,admin,request,pins),403,'Admin context cannot place buyer orders');
  for(const quantity of [-1,0,1.5,'2',null,Number.MAX_SAFE_INTEGER])await denied(()=>createOrder(c,foreignOwner,{...request,quantity},pins),400,'Quantity must be a supported positive integer');
  for(const key of ['buyerId','buyerEmail','buyerName','sellerId','storeId','productPrice','totalAmount','platformCommissionRate','otpPin'])await denied(()=>createOrder(c,foreignOwner,{...request,[key]:owner.authUserId},pins),400,'Request cannot assert identity, prices, commission or PIN');
  for(const patch of [{requestId:'invalid'},{buyerPhone:'invalid'},{meetingLocation:''},{meetingLatitude:91},{meetingLongitude:null},{priceCategoryId:crypto.randomUUID()},{serviceLocationOption:'invented'}])await denied(()=>createOrder(c,foreignOwner,{...request,...patch},pins),400,'Request selectors, contact and actual location validated');
  await denied(()=>createOrder(c,foreignOwner,{...request,productId:crypto.randomUUID()},pins),404,'Missing listing cannot be ordered');
  const first=await createOrder(c,foreignOwner,request,pins),id=first.order.id,pin=first.order.otpPin;
  check(/^\d{6}$/.test(pin) && first.order.deliveryPinState==='active','Exact buyer receives a real six-digit challenge');
  check(first.order.buyerId===foreignOwner.contextId && first.order.buyerEmail===other.email && first.order.buyerName===other.raw_user_meta_data?.full_name,'Buyer snapshot comes from saved verified profile');
  check(first.order.productPrice===10 && first.order.totalAmount===20 && first.order.meetingLatitude===0 && first.order.meetingLongitude===0,'Actual catalog price and zero coordinates persist');
  const encrypted=(await c.query('select * from private.market_order_pins where order_id=$1',[id])).rows[0];
  check(encrypted.encrypted_pin.length===22 && encrypted.nonce.length===12 && pins.open(id,encrypted)===pin,'Challenge is authenticated ciphertext, recoverable with the server key');
  await denied(async()=>new OrderPins(crypto.randomBytes(32)).open(id,encrypted),503,'A different encryption key cannot recover the challenge');
  await denied(async()=>pins.open(crypto.randomUUID(),encrypted),503,'Ciphertext cannot move to another order');
  const altered=Buffer.from(encrypted.encrypted_pin);altered[0]^=1;await denied(async()=>pins.open(id,{...encrypted,encrypted_pin:altered}),503,'Ciphertext tampering fails closed');
  check((await createOrder(c,foreignOwner,request,pins)).order.id===id,'Exact create retry does not duplicate reservation');
  await denied(()=>createOrder(c,foreignOwner,{...request,quantity:1},pins),409,'Request nonce cannot be reused for different order details');
  check((await orderRows(c,foreignOwner,pins))[0].otpPin===pin && (await orderRows(c,owner,pins)).length===0,'Order reads are bound to the actual buyer context');
  for(const a of [own.actor,admin]){await bind(a);const rows=await orderRows(c,a,pins);check(rows.length===1 && !('otpPin' in rows[0]) && !('deliveryPinState' in rows[0]) && !('encrypted_pin' in rows[0]),'Seller/admin projections never include delivery secrets');}
  await bind(foreignOwner);
  check((await c.query('select stock_quantity from public.listings where id=$1',[item.id])).rows[0].stock_quantity===5,'Reservation does not deduct physical stock');
  check((await c.query('select stock_quantity from private.listing_catalog where id=$1',[item.id])).rows[0].stock_quantity===3,'Public availability subtracts active reservations');
  await denied(()=>createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID(),quantity:4},pins),409,'API cannot oversell reserved stock');
  await denied(()=>c.query(`insert into public.market_orders(buyer_context_id,store_id,listing_id,quantity,unit_price,total_amount,currency,meeting_location,reserved_until,request_id,request_fingerprint,snapshot)
    select buyer_context_id,store_id,listing_id,4,unit_price,4*unit_price,currency,meeting_location,clock_timestamp()+interval '24 hours',$2,request_fingerprint,snapshot from public.market_orders where id=$1`,[id,crypto.randomUUID()]),'23514','SQL independently prevents overselling');
  for(const sql of ["update public.market_orders set unit_price=1,total_amount=2 where id=$1","update public.market_orders set snapshot=jsonb_set(snapshot,'{productTitle}','\"Changed\"') where id=$1","update public.market_orders set buyer_context_id=$2 where id=$1"])
    await denied(()=>c.query(sql,sql.includes('$2')?[id,owner.contextId]:[id]),'23514','Purchase snapshot and ownership cannot change');
  await scoped(owner,async()=>check((await c.query('select id from public.market_orders where id=$1',[id])).rowCount===0,'Seller primary owner cannot read child orders through RLS'));
  await scoped(foreignOwner,async()=>{
    check((await c.query('select id from public.market_orders where id=$1',[id])).rowCount===1,'Exact primary buyer can read their order through RLS');
    await denied(()=>c.query("update public.market_orders set status='completed' where id=$1",[id]),'42501','Browser cannot directly complete orders');
    await denied(()=>c.query('select encrypted_pin from private.market_order_pins where order_id=$1',[id]),'42501','Browser cannot read private PIN ciphertext');
    await denied(()=>c.query('select id from private.market_order_events where order_id=$1',[id]),'42501','Browser cannot bypass private history projection');
  });
  await bind(own.actor);
  await denied(()=>changeOrder(c,owner,id,{action:'agree-location'},pins),404,'Foreign primary cannot confirm another buyer order');
  await denied(()=>changeOrder(c,foreign.actor,id,{action:'agree-location'},pins),404,'Another seller cannot confirm this order');
  await denied(()=>changeOrder(c,foreignOwner,id,{action:'agree-location'},pins),403,'Buyer cannot act as seller');
  await denied(()=>renewOrderPin(c,own.actor,id,{},pins),403,'Seller cannot renew buyer challenge');
  await denied(()=>changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:pin},pins),409,'Seller cannot skip location agreement');
  for(const body of [{action:'agree-location',status:'Cancelled'},{action:'agree-location',inputPin:pin},{newStatus:'Completed & Paid',inputPin:pin,otpPin:'000000'},{action:'agree-location',buyerId:owner.contextId}])await denied(()=>changeOrder(c,own.actor,id,body,pins),400,'Conflicting actions and forged fields are rejected');
  const confirmed=await changeOrder(c,own.actor,id,{action:'agree-location'},pins);check('order' in confirmed && confirmed.order.status==='Pending Meetup' && !('otpPin' in confirmed.order),'Seller confirmation persists without exposing the PIN');
  check('idempotent' in await changeOrder(c,own.actor,id,{action:'agree-location'},pins),'Confirmation retry is safe');
  check((await c.query("select count(*) from private.market_order_events where order_id=$1 and action='confirmed'",[id])).rows[0].count==='1','Confirmation retry does not repeat history');
  check((await c.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.title='Meetup Confirmed'",[foreignOwner.contextId])).rows[0].count==='1','Confirmation notification belongs to the exact primary buyer');
  for(let i=1;i<=5;i++){const failure=await changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:'000000'},pins);check('errorStatus' in failure && failure.errorStatus===(i===5?429:400),'Wrong-PIN result permits committing the bounded failure counter');check((await c.query('select attempts from private.market_order_pins where order_id=$1',[id])).rows[0].attempts===i,'Failure count persists in PostgreSQL');}
  await denied(()=>changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:pin},pins),429,'Correct PIN cannot bypass a locked challenge');
  await bind(foreignOwner);check((await orderRows(c,foreignOwner,pins))[0].deliveryPinState==='locked' && !(await orderRows(c,foreignOwner,pins))[0].otpPin,'Locked PIN is not disclosed to the buyer');
  // The preceding real cloud checks can take longer than the one-minute cooldown.
  await c.query('update private.market_order_pins set issued_at=clock_timestamp() where order_id=$1',[id]);
  await denied(()=>renewOrderPin(c,foreignOwner,id,{},pins),429,'Immediate renewals are rate limited');
  await c.query("update private.market_order_pins set issued_at=clock_timestamp()-interval '2 minutes' where order_id=$1",[id]);
  const renewed=await renewOrderPin(c,foreignOwner,id,{},pins),newPin=renewed.order.otpPin;
  check(newPin!==pin && renewed.order.deliveryPinState==='active' && (await c.query('select version,attempts from private.market_order_pins where order_id=$1',[id])).rows[0].version===2,'Buyer renewal rotates challenge/version and clears attempts');
  await bind(own.actor);check('errorStatus' in await changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:pin},pins),'Previous PIN is invalid after renewal');
  await saveListing(c,own.actor,{price:15},item.id);
  const done=await changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:newPin,notes:newPin},pins);
  check('order' in done && done.order.status==='Completed & Paid' && done.order.productPrice===10 && done.order.totalAmount===20,'Handover preserves original price despite later catalog edits');
  check((await c.query('select stock_quantity from public.listings where id=$1',[item.id])).rows[0].stock_quantity===3,'Successful handover deducts stock exactly once');
  await changeOrder(c,own.actor,id,{newStatus:'Completed & Paid',inputPin:newPin},pins);
  check((await c.query('select stock_quantity from public.listings where id=$1',[item.id])).rows[0].stock_quantity===3 && (await c.query('select order_id from private.market_order_pins where order_id=$1',[id])).rowCount===0,'Completion retry cannot consume stock twice; terminal challenge is removed');
  check(!JSON.stringify((await orderRows(c,own.actor,pins))[0]).includes(newPin),'PIN never enters seller history, notes or snapshots');
  await denied(()=>c.query("update public.market_orders set status='awaiting_seller' where id=$1",[id]),'23514','Terminal order cannot reopen');
  await denied(()=>c.query("update private.market_order_events set notes='Changed' where order_id=$1",[id]),'23514','Handover history cannot be rewritten');
  await bind(foreignOwner);
  const decline=(await createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID(),quantity:1},pins)).order;
  await bind(own.actor);const rejected=await changeOrder(c,own.actor,decline.id,{action:'reject-location'},pins);
  check('order' in rejected && rejected.order.status==='Location Rejected','Seller decline persists the declined order state');
  await changeOrder(c,own.actor,decline.id,{action:'reject-location'},pins);check((await c.query('select order_id from private.market_order_pins where order_id=$1',[decline.id])).rowCount===0,'Rejected reservation releases challenge/capacity');
  await denied(()=>changeOrder(c,own.actor,decline.id,{action:'agree-location'},pins),409,'Rejected order cannot be reconfirmed');
  await bind(foreignOwner);await denied(()=>renewOrderPin(c,foreignOwner,decline.id,{},pins),409,'Rejected order cannot renew PIN');
  const cancel=(await createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID(),quantity:1},pins)).order;
  const cancelled=await changeOrder(c,foreignOwner,cancel.id,{newStatus:'Cancelled'},pins);check('order' in cancelled && cancelled.order.status==='Cancelled' && !cancelled.order.otpPin,'Buyer cancellation releases PIN and capacity');
  await changeOrder(c,foreignOwner,cancel.id,{newStatus:'Cancelled'},pins);check((await c.query('select stock_quantity from public.listings where id=$1',[item.id])).rows[0].stock_quantity===3,'Cancellation and retry never consume physical stock');
  const expiring=(await createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID()},pins)).order;
  await c.query("update private.market_order_pins set issued_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()+interval '1 second' where order_id=$1",[expiring.id]);
  await c.query('update public.market_orders set reserved_until=(select expires_at from private.market_order_pins where order_id=$1) where id=$1',[expiring.id]);
  await c.query('select pg_sleep(1.2)');
  check((await orderRows(c,foreignOwner,pins)).find(o=>o.id===expiring.id).deliveryPinState==='expired','Expiry uses the real PostgreSQL clock');
  await bind(own.actor);await denied(()=>changeOrder(c,own.actor,expiring.id,{action:'agree-location'},pins),409,'Expired reservation cannot be confirmed');
  await bind(foreignOwner);const blocker=(await createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID()},pins)).order;
  await denied(()=>renewOrderPin(c,foreignOwner,expiring.id,{},pins),409,'Expired reservation cannot displace another active reservation');
  await changeOrder(c,foreignOwner,blocker.id,{newStatus:'Cancelled'},pins);check((await renewOrderPin(c,foreignOwner,expiring.id,{},pins)).order.deliveryPinState==='active','Buyer can renew after capacity becomes available');
  await changeOrder(c,foreignOwner,expiring.id,{newStatus:'Cancelled'},pins);
  await bind(own.actor);
  const svc=(await saveListing(c,own.actor,{title:child.email,description:'Order service verification',price:20,category:'Services',serviceCategory:'Phone & Device Repairs',isService:true,serviceLocationMode:'fixed',location:'Order verification campus',meetingLocation:'Order verification campus',lat:0,lng:0,imageUrl:cover,additionalImages:[],callLine:'+233241234567',workingDays:'Mon - Sat',openingTime:'08:00 AM',closingTime:'06:00 PM',priceCategories:[{name:'Assessment',price:0,imageUrl:extra}] })).product;
  await bind(foreignOwner);await denied(()=>createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID(),productId:svc.id,serviceLocationOption:'buyer-location'},pins),400,'Fixed services cannot substitute buyer location');
  const booking=(await createOrder(c,foreignOwner,{...request,requestId:crypto.randomUUID(),productId:svc.id,quantity:1,serviceLocationOption:'seller-location',priceCategoryId:svc.priceCategories[0].id,priceCategoryName:'Assessment'},pins)).order;
  check(booking.totalAmount===0 && booking.productImage===extra && booking.meetingLatitude===0 && booking.meetingLocation==='Order verification campus','Actual service option price/photo and provider location are snapshotted');
  await bind(own.actor);await changeOrder(c,own.actor,booking.id,{action:'agree-location'},pins);await changeOrder(c,own.actor,booking.id,{newStatus:'Completed & Paid',inputPin:booking.otpPin},pins);
  check((await c.query('select stock_quantity from public.listings where id=$1',[svc.id])).rows[0].stock_quantity===null,'Service handover never invents or deducts product stock');
  await saveListing(c,own.actor,{isAvailable:false},item.id);await scoped(foreignOwner,async()=>check((await c.query('select id from public.media_assets where id=$1',[cover.slice('/api/media/'.length)])).rowCount===1,'Original buyer retains private order-photo access after catalog removal'));
  await scoped(owner,async()=>check((await c.query('select id from public.media_assets where id=$1',[cover.slice('/api/media/'.length)])).rowCount===0,'Another primary account cannot use historical order-photo access'));
  await c.query('set constraints all immediate');await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,authUsersCreated:0,authUsersModified:0,providerFlowTested:false,livePaymentTested:false,authenticatedHttpTested:false}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,status:error instanceof ApiError?error.status:undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally{await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
