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
import {sendMarketMessage,conversationRows,purchaseReview} from '../supabase/marketConversation.js';
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
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'conversation_checks',checks}));};
try{
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from auth.users) as users,(select count(*) from auth.sessions) as sessions,
    (select count(*) from public.profiles) as profiles,(select count(*) from private.account_enrollments) as enrollments,
    (select count(*) from public.seller_applications) as applications,(select count(*) from public.stores) as stores,
    (select count(*) from public.notifications) as notices,(select count(*) from private.audit_events) as audit,
    (select count(*) from public.market_orders) as orders,(select count(*) from private.market_order_pins) as pins,
    (select count(*) from public.market_messages) as messages,(select count(*) from public.market_reviews) as reviews,
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
  await freeStoreVerification(c,own.actor);
  const pins=new OrderPins(crypto.randomBytes(32)),item=(await saveListing(c,own.actor,draft)).product;
  const request={requestId:crypto.randomUUID(),sellerStoreId:stores[0].id,productId:item.id,content:'Is this item available?'};
  await bind(foreignOwner);const first=await sendMarketMessage(c,foreignOwner,request);
  check(first.message.buyerId===foreignOwner.contextId && first.message.senderId===foreignOwner.contextId,'Message identities come from saved subjects');
  check((await sendMarketMessage(c,foreignOwner,request)).message.id===first.message.id,'Message retry keeps one receipt');
  await denied(()=>sendMarketMessage(c,foreignOwner,{...request,content:'Changed'}),409,'Nonce cannot change message content');
  for(const extra of ['senderId','senderEmail','senderName','recipientEmail','recipientName','productTitle'])await denied(()=>sendMarketMessage(c,foreignOwner,{...request,[extra]:'spoof'}),400,'Client cannot assert message identity');
  for(const content of ['',null,'x'.repeat(5001)])await denied(()=>sendMarketMessage(c,foreignOwner,{...request,content}),400,'Message text is bounded');
  await denied(()=>sendMarketMessage(c,owner,{...request,requestId:crypto.randomUUID()}),403,'Primary owner cannot message its own store');
  check((await conversationRows(c,owner)).length===0,'Parent cannot read child seller messages');
  await bind(own.actor);check((await conversationRows(c,own.actor)).length===1,'Exact seller receives inquiry');
  const reply=await sendMarketMessage(c,own.actor,{requestId:crypto.randomUUID(),buyerId:foreignOwner.contextId,content:'Yes, it is available.'});
  check(reply.message.senderRole==='merchant' && reply.message.recipientEmail===other.email,'Seller reply targets the actual buyer');
  await denied(()=>sendMarketMessage(c,own.actor,{requestId:crypto.randomUUID(),buyerId:owner.contextId,content:'Cold message'}),403,'Cold seller message is blocked');
  await denied(()=>conversationRows(c,admin),403,'Admins have no marketplace chat projection');
  await scoped(admin,async()=>check((await c.query('select id from public.market_messages')).rowCount===0,'Admin RLS excludes private conversations'));
  await scoped(owner,async()=>check((await c.query('select id from public.market_messages')).rowCount===0,'Parent RLS excludes child seller conversations'));
  await scoped(foreignOwner,async()=>{
    check((await c.query('select id from public.market_messages')).rowCount===2,'Exact buyer RLS permits its conversation');
    await denied(()=>c.query("update public.market_messages set body='changed' where id=$1",[first.message.id]),'42501','Browser cannot write raw messages');
  });
  await bind(foreignOwner);
  for(const sql of ["update public.market_messages set body='changed' where id=$1","delete from public.market_messages where id=$1"])
    await denied(()=>c.query(sql,[first.message.id]),'23514','SQL preserves append-only history');
  const order=(await createOrder(c,foreignOwner,{requestId:crypto.randomUUID(),productId:item.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Order verification campus'},pins)).order;
  await denied(()=>purchaseReview(c,foreignOwner,{orderId:order.id,rating:5}),409,'Uncompleted purchase cannot be reviewed');
  await denied(()=>purchaseReview(c,owner,{orderId:order.id,rating:5}),404,'Foreign primary cannot review purchase');
  await bind(own.actor);await changeOrder(c,own.actor,order.id,{action:'agree-location'},pins);await changeOrder(c,own.actor,order.id,{newStatus:'Completed & Paid',inputPin:order.otpPin},pins);
  await bind(foreignOwner);
  const rating=await purchaseReview(c,foreignOwner,{orderId:order.id,rating:4,review:'Actual completed purchase.'});
  check(rating.ratingCount===1 && rating.averageRating===4,'Completed receipt contributes exactly one review');
  const unchanged=await purchaseReview(c,foreignOwner,{orderId:order.id,rating:4,review:'Actual completed purchase.'});
  check(unchanged.ratingRecord.id===rating.ratingRecord.id && (await c.query('select count(*) from public.notifications where market_review_id=$1',[rating.ratingRecord.id])).rows[0].count==='1','Unchanged retries do not duplicate review notices');
  const updated=await purchaseReview(c,foreignOwner,{orderId:order.id,rating:5,review:'Updated feedback.'});
  check(updated.averageRating===5 && updated.ratingCount===1 && updated.ratingRecord.id===rating.ratingRecord.id,'Edit keeps the same purchase receipt');
  for(const ratingValue of [0,6,1.5,'5'])await denied(()=>purchaseReview(c,foreignOwner,{orderId:order.id,rating:ratingValue}),400,'Rating uses integer 1–5');
  await denied(()=>purchaseReview(c,foreignOwner,{orderId:order.id,rating:5,buyerId:owner.contextId}),400,'Review cannot assert ownership');
  await denied(()=>purchaseReview(c,foreignOwner,{orderId:order.id,rating:5},item.id),409,'Service alias rejects product receipts');
  await denied(()=>c.query('update public.market_reviews set id=$2 where id=$1',[rating.ratingRecord.id,crypto.randomUUID()]),'23514','SQL review identity is immutable');
  await scoped(foreignOwner,async()=>await denied(()=>c.query('update public.market_reviews set rating=1 where id=$1',[rating.ratingRecord.id]),'42501','Browser cannot write raw review tables'));
  await c.query('set local role pinevela_catalog');const publicRating=(await c.query('select * from private.market_reviews_public')).rows[0];check(publicRating.rating===5 && !('order_id' in publicRating) && !('buyer_context_id' in publicRating),'Guest gets only safe purchase reputation');await c.query('reset role');
  check((await c.query('select r.context_id from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.market_message_id=$1',[first.message.id])).rows[0].context_id===own.actor.contextId,'New inquiry notice belongs to seller portal');
  await c.query('set constraints all immediate');await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,authUsersCreated:0,providerFlowTested:false,livePaymentTested:false}));
}catch(error){console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || 'error',message:error instanceof assert.AssertionError?error.message:'Conversation verification failed; no private records were printed.'}));process.exitCode=1;}
finally{await c.query('rollback').catch(()=>{});c.release();await db.close();}
