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
import {createOrder,changeOrder} from '../supabase/orders.js';
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
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'inventory_checks',checks}));};
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
  for(const stockQuantity of [-1,0,1.5,'5',null])await denied(()=>saveListing(c,own.actor,{...draft,stockQuantity}),400,'Manual stock must be a positive whole number');
  for(const value of [{title:''},{description:''},{price:0},{price:-1},{price:1.001},{condition:'Invented condition'},{imageUrl:''},{additionalImages:{}},{additionalImages:[cover]},{additionalImages:[extra,extra,extra,extra]}])
    await denied(()=>saveListing(c,own.actor,{...draft,...value}),400,'Actual listing fields and bounded galleries required');
  for(const key of ['userId','userEmail','storeId','sellerId','subscriptionPlan','isPineStar','hasGoldFrame','rating'])await denied(()=>saveListing(c,own.actor,{...draft,[key]:foreignOwner.authUserId}),400,'Client ownership, reputation and plan assertions rejected');
  await denied(()=>saveListing(c,own.actor,{...draft,imageUrl:foreignPhoto}),403,'Another seller photo cannot become this listing cover');
  const saved=await saveListing(c,own.actor,draft),id=saved.product.id;await c.query('set constraints all immediate');await c.query('set constraints all deferred');
  check(saved.product.imageUrl===cover && saved.product.additionalImages[0]===extra,'Actual owned gallery preserves ordering');
  check(saved.product.stockQuantity===5 && saved.product.rating===0 && saved.product.reviewCount===0,'Inventory stores actual quantity and does not invent reputation');
  check((await sellerInventory(c,own.actor)).length===1,'Seller reads their own saved inventory');
  check((await sellerInventory(c,foreign.actor)).length===0,'Foreign seller cannot enumerate another store private inventory');
  await denied(()=>saveListing(c,foreign.actor,{stockQuantity:2},id),402,'Foreign unpaid store cannot edit another listing');
  await c.query('savepoint foreign_paid');
  await freeStoreVerification(c,foreign.actor);
  await denied(()=>saveListing(c,foreign.actor,{stockQuantity:2},id),404,'An active paid foreign seller cannot edit another store listing');
  await denied(()=>saveListing(c,foreign.actor,draft),403,'An active paid foreign seller cannot adopt another store photographs');
  await c.query('rollback to savepoint foreign_paid');
  await denied(()=>removeListing(c,foreign.actor,id),404,'Foreign seller cannot remove another store listing');
  await denied(()=>c.query('update public.listings set store_id=$2 where id=$1',[id,stores[1].id]),'23514','SQL blocks listing ownership transfer');
  await denied(async()=>{await c.query('delete from public.listing_media where listing_id=$1 and sort_order=0',[id]);await c.query('set constraints all immediate');},'23514','Deferred constraint prevents removing a published cover');
  check((await saveListing(c,own.actor,{stockQuantity:7},id)).product.stockQuantity===7,'Positive stock adjustment persists');
  await denied(()=>saveListing(c,own.actor,{stockQuantity:0},id),400,'Manual stock edits cannot set zero');
  await denied(()=>saveListing(c,own.actor,{stockQuantity:201},id),403,'Total inventory limit is enforced on edits');
  await denied(()=>saveListing(c,own.actor,{...draft,stockQuantity:195}),403,'Total inventory limit includes existing stock');
  const orderPins=new OrderPins(crypto.randomBytes(32));await bind(foreignOwner);
  const reservedOrder=(await createOrder(c,foreignOwner,{requestId:crypto.randomUUID(),productId:id,quantity:3,buyerPhone:'+233241234567',meetingLocation:'Inventory verification campus'},orderPins)).order;
  const order=reservedOrder.id;await bind(own.actor);
  await denied(()=>saveListing(c,own.actor,{stockQuantity:2},id),409,'Stock reduction cannot invalidate active reservations');
  await denied(()=>c.query('update public.listings set stock_quantity=2 where id=$1',[id]),'23514','SQL independently protects reserved stock');
  await denied(()=>removeListing(c,own.actor,id),409,'Removal must resolve active orders first');
  await denied(()=>c.query('update public.listings set retired_at=now(),is_published=false where id=$1',[id]),'23514','SQL protects active order evidence');
  const svc={title:child.email,description:'Service inventory verification',category:'Services',serviceCategory:'Phone & Device Repairs',isService:true,price:20,imageUrl:cover,additionalImages:[],serviceLocationMode:'flexible',meetingLocation:'',location:'',callLine:'+233241234567',workingDays:'Mon - Sat',openingTime:'08:00 AM',closingTime:'06:00 PM',isOpen247:false,priceCategories:[{name:'Assessment',price:0},{name:'Repair',price:20,imageUrl:extra}]};
  for(const patch of [{stockQuantity:999},{serviceLocationMode:'fixed'},{serviceLocationMode:'hybrid',lat:0,lng:0},{lat:6,lng:-1},{callLine:'invalid'},{workingDays:'Invalid days'},{openingTime:'13:00 AM'},{isOpen247:'true'},{priceCategories:Array(5).fill({name:'Rate',price:1})}])await denied(()=>saveListing(c,own.actor,{...svc,...patch}),400,'Service type, contact, schedule and actual fixed pin validated');
  const service=(await saveListing(c,own.actor,svc)).product;
  await denied(()=>c.query('update public.listing_media set listing_id=$2 where listing_id=$1 and sort_order=0',[id,service.id]),'23514','An existing photograph attachment cannot move between listings');
  check(service.stockQuantity===null && service.isService && service.isAvailable,'Services have availability without fictitious stock');
  check(service.lat===null && service.lng===null && service.workingDays==='Mon - Sat','Flexible services have no fake map pin and preserve chosen working days');
  check(service.priceCategories.length===2 && service.priceCategories[0].price===0 && service.priceCategories[1].imageUrl===extra,'Actual named rates and optional photos persist');
  await denied(()=>saveListing(c,own.actor,svc),403,'Default plan permits only one current service');
  await denied(()=>saveListing(c,own.actor,{isService:true},id),400,'Existing product cannot become a service');
  await saveListing(c,own.actor,{isAvailable:false},service.id);
  check((await sellerInventory(c,own.actor)).some((p:any)=>p.id===service.id && !p.isAvailable),'Closed service remains in private inventory');
  await denied(()=>saveListing(c,own.actor,svc),403,'Inactive service still counts against plan capacity');
  check((await c.query('select id from private.listing_catalog where id=$1',[service.id])).rowCount===0,'Closed service is hidden from public catalog');
  await saveListing(c,own.actor,{serviceLocationMode:'fixed',location:'Inventory verification campus',meetingLocation:'Inventory verification campus',lat:0,lng:0,isAvailable:true},service.id);
  check((await sellerInventory(c,own.actor)).find((p:any)=>p.id===service.id)?.lat===0,'Actual fixed pin preserves equator and prime meridian');
  await c.query('savepoint quota');await c.query(`insert into public.listings(store_id,kind,title,description,price,stock_quantity) select $1,'product','Quota verification '||n,$2,10,1 from generate_series(1,19) n`,[stores[0].id,draft.description]);
  await denied(()=>saveListing(c,own.actor,{...draft,stockQuantity:1}),403,'Unpublished items still count toward twenty-item limit');await c.query('rollback to savepoint quota');
  await c.query('savepoint star');await freeStoreVerification(c,own.actor,'star','subscription');
  const upgraded=(await saveListing(c,own.actor,{...svc,title:foreignChild.email})).product;check(upgraded.isPineStar && !upgraded.hasGoldFrame,'Actual active Star plan raises service capacity and supplies benefits');await c.query('rollback to savepoint star');
  await c.query('savepoint pro');await freeStoreVerification(c,own.actor,'pro','subscription');check((await sellerInventory(c,own.actor)).every((p:any)=>p.hasGoldFrame),'Actual current Pro subscription derives gold-frame benefits');await c.query('rollback to savepoint pro');
  await saveListing(c,own.actor,{isAvailable:false},service.id);
  await scoped(foreignOwner,async()=>check((await c.query('select id from public.listings where id=$1',[service.id])).rowCount===0,'Buyer cannot bypass API to read unpublished listing'));
  await scoped(own.actor,()=>denied(()=>c.query('update public.listings set price=1 where id=$1',[id]),'42501','Browser role cannot directly change listing price'));
  await bind(own.actor);await changeOrder(c,own.actor,order,{action:'agree-location'},orderPins);await changeOrder(c,own.actor,order,{newStatus:'Completed & Paid',inputPin:reservedOrder.otpPin},orderPins);
  check(!(await removeListing(c,own.actor,id)).idempotent && (await removeListing(c,own.actor,id)).idempotent,'Listing removal is recorded once and repeat is safe');
  check((await c.query('select id from public.market_orders where id=$1',[order])).rowCount===1,'Removed item preserves actual purchase history');
  check(!(await sellerInventory(c,own.actor)).some((p:any)=>p.id===id) && (await c.query('select id from private.listing_catalog where id=$1',[id])).rowCount===0,'Removed item disappears from both inventories');
  await denied(()=>c.query('update public.listings set retired_at=null,is_published=true where id=$1',[id]),'23514','Removed listing evidence cannot reopen');
  await denied(()=>saveListing(c,own.actor,{title:'Reopen'},id),404,'API cannot overwrite removed evidence');
  await c.query("update public.store_subscriptions set status='expired' where store_id=$1 and status='active'",[stores[0].id]);
  check((await sellerInventory(c,own.actor)).length===1,'Owner can still read inventory after subscription expiry');
  await denied(()=>saveListing(c,own.actor,{...draft,title:foreignChild.email}),402,'Expired subscription cannot publish');
  await denied(()=>saveListing(c,own.actor,{price:30},service.id),402,'Expired subscription cannot edit listing');
  check((await removeListing(c,own.actor,service.id)).success,'Owner can remove listing after subscription expiry');
  await c.query('set constraints all immediate');await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,authUsersCreated:0,authUsersModified:0,providerFlowTested:false,livePaymentTested:false,authenticatedHttpTested:false}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,status:error instanceof ApiError?error.status:undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally{await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
