import {termsAcceptance} from '../legalPolicy.js';
import {freeStoreVerification} from './lib/free-store-verification.js';
/** Committed conversations and purchase reviews tested ONLY in an isolated restore of genuine Auth records.
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
import {createChatIdentity,recoveryPhrase} from '../src/lib/marketEncryption.js';
import {registerEncryptionIdentity} from '../supabase/marketEncryption.js';
import {encryptedMarketTestRequests} from './lib/encrypted-market-test.js';

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

      await freeStoreVerification(c,foreign.actor);
      const item=(await saveListing(c,own.actor,{...draft,stockQuantity:5})).product;
      for(const a of [owner,foreignOwner,own.actor,foreign.actor])await bind(a);
      return {buyer:foreignOwner,seller:own.actor,other:owner,foreignSeller:foreign.actor,item,draft,store:stores[0].id,foreignStore:stores[1].id,admin,cover};
    });
    const pins=loadOrderPins();
    const identities=new Map();
    for(const a of [f.buyer,f.seller,f.other,f.foreignSeller]){const keys=await createChatIdentity(a.contextId,recoveryPhrase());await db.authorizedSystem(a,['primary','seller'],c=>registerEncryptionIdentity(c,a,{publicIdentity:keys.publicIdentity,backup:keys.backup,proof:keys.proof}));identities.set(a.contextId,keys.identity);}
    const encryptRequest=encryptedMarketTestRequests(identities);
    const send=(a:VerifiedActor,body:any)=>db.authorizedSystem(a,['primary','seller'],async c=>sendMarketMessage(c,a,await encryptRequest(c,a,body)));
    const rows=(a:VerifiedActor)=>db.authorizedSystem(a,['primary','seller'],c=>conversationRows(c,a));
    const review=(a:VerifiedActor,body:any,service?:string)=>db.authorizedSystem(a,['primary'],c=>purchaseReview(c,a,body,service));
    async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}check(typeof status==='number'?error instanceof ApiError && error.status===status:error?.code===status,`${label} (expected ${status}, actual ${error instanceof ApiError?error.status:error?.code || 'no error'})`);}
    const request={requestId:crypto.randomUUID(),sellerStoreId:f.store,productId:f.item.id,content:'Is this item available?'};
    for(const a of [f.other,f.buyer,f.seller,f.foreignSeller])check((await rows(a)).length===0,'Separate portals start with no conversations');
    await denied(()=>send(f.other,request),403,'Store owner cannot initiate a self inquiry');
    await denied(()=>send(f.seller,{requestId:crypto.randomUUID(),buyerId:f.buyer.contextId,content:'Cold message'}),403,'Seller cannot cold-message arbitrary primary users');
    for(const patch of [{content:''},{content:'x'.repeat(5001)},{senderEmail:'spoof'},{recipientEmail:'spoof'},{senderId:f.other.contextId},{productTitle:'spoof'},{buyerId:f.other.contextId},{requestId:'invalid'}])await denied(()=>send(f.buyer,{...request,...patch}),400,'Client identity and invalid contents are rejected');
    await denied(()=>send(f.buyer,{...request,sellerStoreId:f.foreignStore}),404,'Store selector must match the saved item');
    const duplicates=await Promise.all([send(f.buyer,request),send(f.buyer,request)]);const m=duplicates[0].message;
    check(m.id===duplicates[1].message.id,'Concurrent retries create one message');
    check((await db.pool.query('select count(*) from public.market_messages')).rows[0].count==='1','One committed message exists');
    check(m.buyerId===f.buyer.contextId && m.senderId===f.buyer.contextId && m.sellerStoreId===f.store && m.productTitle===f.item.title,'Message ownership and listing title come from saved records');
    await denied(()=>send(f.buyer,{...request,content:'Different content'}),409,'Nonce cannot be reused with changed content');
    check((await rows(f.seller)).length===1 && (await rows(f.other)).length===0 && (await rows(f.foreignSeller)).length===0,'Only exact buyer and seller read the conversation');
    const notice=(await db.pool.query('select n.id,r.context_id from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.market_message_id=$1',[m.id])).rows;
    check(notice.length===1 && notice[0].context_id===f.seller.contextId,'Message retry notifies the exact seller once');
    await denied(()=>send(f.foreignSeller,{requestId:crypto.randomUUID(),sellerStoreId:f.store,buyerId:f.buyer.contextId,content:'Foreign reply'}),404,'Another seller cannot reply');
    const reply=await send(f.seller,{requestId:crypto.randomUUID(),buyerId:f.buyer.contextId,content:'Yes, it is available.'});
    check(reply.message.senderRole==='merchant' && (await rows(f.buyer)).length===2,'Seller replies to its actual buyer inquiry');
    await db.actor(f.buyer,async c=>check((await c.query('select n.market_message_id from public.notifications n join public.notification_recipients r on r.notification_id=n.id where n.market_message_id=$1',[reply.message.id])).rowCount===1,'Buyer sees only its incoming reply notice through RLS'));
    await db.actor(f.other,async c=>check((await c.query('select n.market_message_id from public.notifications n where n.market_message_id is not null')).rowCount===0,'Seller parent cannot read private message notifications'));
    await db.actor(f.buyer,async c=>check((await c.query('update public.notification_recipients set read_at=now() where notification_id=$1',[notice[0].id])).rowCount===0,'Buyer cannot acknowledge the seller notification'));
    await db.actor(f.seller,async c=>check((await c.query('update public.notification_recipients set read_at=now() where notification_id=$1',[notice[0].id])).rowCount===1,'Actual seller can persist the incoming message read receipt'));
    await db.actor(f.buyer,async c=>check((await c.query('select id from public.market_messages')).rowCount===2,'RLS permits the exact buyer'));
    await db.actor(f.other,async c=>check((await c.query('select id from public.market_messages')).rowCount===0,'RLS excludes the primary owner of the seller portal'));
    await db.actor(f.foreignSeller,async c=>check((await c.query('select id from public.market_messages')).rowCount===0,'RLS excludes foreign sellers'));
    await denied(()=>db.actor(f.buyer,c=>c.query("update public.market_messages set body='Rewritten' where id=$1",[m.id])),'42501','Browser cannot modify messages');
    for(const sql of ["update public.market_messages set body='Rewritten' where id=$1","update public.market_messages set buyer_context_id=$2 where id=$1","delete from public.market_messages where id=$1"])
      await denied(()=>db.system(c=>c.query(sql,sql.includes('$2')?[m.id,f.other.contextId]:[m.id])),'23514','SQL preserves message history and ownership');
    await denied(()=>db.system(c=>c.query("insert into public.market_messages(buyer_context_id,store_id,sender_context_id,body,request_id,request_fingerprint) values($1,$2,$3,'Cold SQL message',$4,$5)",[f.other.contextId,f.foreignStore,f.foreignSeller.contextId,crypto.randomUUID(),'a'.repeat(64)])),'23514','SQL independently blocks cold seller messages');
    const order=(await db.authorizedSystem(f.buyer,['primary'],c=>createOrder(c,f.buyer,{requestId:crypto.randomUUID(),productId:f.item.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Order verification campus'},pins))).order;
    await denied(()=>review(f.buyer,{orderId:order.id,rating:5}),409,'Uncompleted purchase cannot be reviewed');
    await denied(()=>review(f.other,{orderId:order.id,rating:5}),404,'Foreign buyer cannot review another order');
    await denied(()=>review(f.seller,{orderId:order.id,rating:5}),403,'Seller portal cannot review buyer purchases');
    await denied(()=>send(f.other,{...request,requestId:crypto.randomUUID(),orderId:order.id}),404,'Another buyer cannot message through a foreign order');
    await db.authorizedSystem(f.seller,['seller'],c=>changeOrder(c,f.seller,order.id,{action:'agree-location'},pins));
    await db.authorizedSystem(f.seller,['seller'],c=>changeOrder(c,f.seller,order.id,{newStatus:'Completed & Paid',inputPin:order.otpPin},pins));
    for(const patch of [{rating:0},{rating:6},{rating:1.5},{rating:'5'},{review:'x'.repeat(4001)},{buyerId:f.buyer.contextId},{storeId:f.store},{sellerEmail:'spoof'}])await denied(()=>review(f.buyer,{orderId:order.id,rating:5,...patch}),400,'Review cannot assert receipt identity or invalid feedback');
    const r=await review(f.buyer,{orderId:order.id,rating:4,review:'  Purchase completed.  '});
    const same=await review(f.buyer,{orderId:order.id,rating:4,review:'Purchase completed.'});
    check(r.ratingRecord.id===same.ratingRecord.id && same.ratingCount===1 && same.averageRating===4,'One idempotent review per completed purchase');
    check((await db.pool.query('select count(*) from public.notifications where market_review_id=$1',[r.ratingRecord.id])).rows[0].count==='1','Unchanged review retries do not repeat notices');
    const updated=await review(f.buyer,{orderId:order.id,rating:5,review:'Updated feedback.'});
    check(updated.ratingRecord.id===r.ratingRecord.id && updated.ratingCount===1 && updated.averageRating===5 && updated.ratingRecord.createdAt.getTime()===r.ratingRecord.createdAt.getTime(),'Review edits preserve receipt and initial creation time');
    const catalog=await publicProducts(db,f.store);check(catalog[0].rating===5 && catalog[0].reviewCount===1 && catalog[0].storeRating===5,'Actual public listing and store reputation derive from completed reviews');
    const publicRows=await db.publicRows('select * from private.market_reviews_public');
    check(publicRows.length===1 && !('buyer_context_id' in publicRows[0]) && !('buyerEmail' in publicRows[0]) && !('order_id' in publicRows[0]),'Public projection excludes private receipt/account fields');
    await denied(()=>db.publicRows('select * from public.market_reviews'),'42501','Guests cannot bypass safe review projection');
    await denied(()=>db.actor(f.buyer,c=>c.query('update public.market_reviews set rating=1 where id=$1',[r.ratingRecord.id])),'42501','Browser cannot write raw reviews');
    await denied(()=>db.system(c=>c.query('update public.market_reviews set id=$2 where id=$1',[r.ratingRecord.id,crypto.randomUUID()])),'23514','Review receipt identity is immutable in SQL');
    await denied(()=>review(f.buyer,{orderId:order.id,rating:5},f.item.id),409,'Service alias rejects product receipts');
    const service=(await db.authorizedSystem(f.seller,['seller'],c=>saveListing(c,f.seller,{title:'Purchase review workflow service',description:'Isolated verification of completed service feedback',price:10,category:f.draft.category,isService:true,serviceCategory:'Other Campus Services',serviceLocationMode:'flexible',location:'',callLine:'+233241234567',workingDays:'Mon - Sat',openingTime:'08:00 AM',closingTime:'06:00 PM',isOpen247:false,imageUrl:f.cover,additionalImages:[],priceCategories:[]}))).product;
    const serviceOrder=(await db.authorizedSystem(f.buyer,['primary'],c=>createOrder(c,f.buyer,{requestId:crypto.randomUUID(),productId:service.id,quantity:1,buyerPhone:'+233241234567',meetingLocation:'Service verification campus'},pins))).order;
    await db.authorizedSystem(f.seller,['seller'],c=>changeOrder(c,f.seller,serviceOrder.id,{action:'agree-location'},pins));
    await db.authorizedSystem(f.seller,['seller'],c=>changeOrder(c,f.seller,serviceOrder.id,{newStatus:'Completed & Paid',inputPin:serviceOrder.otpPin},pins));
    const serviceReview=await review(f.buyer,{orderId:serviceOrder.id,rating:4,review:'Completed service feedback.'},service.id);
    check(serviceReview.review.serviceId===service.id && serviceReview.reviewCount===1 && serviceReview.averageRating===4,'Completed actual service accepts feedback through its service alias');
    check((await publicProducts(db,f.store)).find((p:any)=>p.id===service.id)?.reviewCount===1,'Public service reputation comes from the completed service receipt');
    await denied(()=>review(f.buyer,{orderId:serviceOrder.id,rating:5},f.item.id),409,'Service feedback rejects mismatched listing aliases');
    for(const column of ['buyer_context_id','store_id','order_id'])await denied(()=>db.system(c=>c.query(`update public.market_reviews set ${column}=$2 where id=$1`,[r.ratingRecord.id,crypto.randomUUID()])),'P0001','Review ownership and purchase receipt cannot be reassigned');
    await db.authorizedSystem(f.seller,['seller'],c=>saveListing(c,f.seller,{isAvailable:false},f.item.id));
    check((await review(f.buyer,{orderId:order.id,rating:3,review:'Historical purchase.'})).ratingCount===2,'Historical completed purchase can still be reviewed after unpublishing');
    const historical=await send(f.buyer,{requestId:crypto.randomUUID(),orderId:order.id,content:'Question about the completed purchase.'});
    check(historical.message.productTitle===order.productTitle,'Order conversation retains its actual immutable purchase context');
    await db.pool.query("update public.store_subscriptions set status='expired' where store_id=$1 and status='active'",[f.store]);
    check((await db.publicRows('select * from private.market_reviews_public')).length===0,'Unavailable store reputation is not exposed publicly');
    check((await send(f.seller,{requestId:crypto.randomUUID(),buyerId:f.buyer.contextId,content:'Support for the earlier purchase.'})).success,'Existing conversations remain usable after subscription expiry');
    await db.close();db=new SupabaseDatabase(config);
    check((await rows(f.buyer)).length===4 && (await db.authorizedSystem(f.buyer,['primary'],c=>orderRows(c,f.buyer,pins))).find((o:any)=>o.id===order.id)?.userRating.rating===3,'Committed conversation and review survive backend pool restart');
    await db.system(async c=>{await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[f.admin.sessionId,f.admin.contextId]);});
    await db.actor(f.admin,async c=>check((await c.query('select id from public.market_messages')).rowCount===0,'Administrator cannot read buyer-seller chat via RLS'));
    await denied(()=>db.authorizedSystem(f.admin,['admin'],c=>conversationRows(c,f.admin)),403,'Administrator has no chat API projection');
    await db.pool.query('delete from auth.sessions where id=$1',[f.buyer.sessionId]);
    await denied(()=>rows(f.buyer),401,'Revoked real session cannot read messages');
    await denied(()=>review(f.buyer,{orderId:order.id,rating:5}),401,'Revoked session cannot modify feedback');
  }finally{await db.close();}
});console.log(JSON.stringify({checks,passed:true,isolatedCommittedMessagesAndReviews:true,cloudRecordsModified:0,providerFlowsVerified:false,temporaryRestoreRemoved:true}));}
catch(error){fs.writeFileSync('/tmp/pinevela-conversation-failure.json',JSON.stringify({code:(error as any)?.code,message:(error as any)?.message,constraint:(error as any)?.constraint}),{mode:0o600});console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || 'error',message:error instanceof assert.AssertionError?error.message:'Isolated order verification failed; no private records were printed.'}));process.exitCode=1;}
