import crypto from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {buyer,lockOrder} from './orders.js';
import {sellerStore} from './storeSetup.js';
import {notify} from './notifications.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
function fields(body:any,keys:string[]){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k)))throw new ApiError(400,'Unsupported marketplace fields.');}
async function audit(c:PoolClient,a:VerifiedActor,type:string,id:string){await c.query('insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,$3,$4)',[a.contextId,type,type.startsWith('market_message')?'market_message':'market_review',id]);}
const messageQuery=`select m.*,bp.email as buyer_email,bp.display_name as buyer_name,s.seller_context_id,s.name as store_name,sp.email as seller_email,
  sender.display_name as sender_name from public.market_messages m join public.stores s on s.id=m.store_id
  join public.account_contexts b on b.id=m.buyer_context_id join public.profiles bp on bp.id=b.auth_user_id
  join public.account_contexts x on x.id=s.seller_context_id join public.profiles sp on sp.id=x.auth_user_id
  join public.account_contexts actor on actor.id=m.sender_context_id join public.profiles sender on sender.id=actor.auth_user_id`;
function messageDto(m:any){const seller=m.sender_context_id===m.seller_context_id;return {id:m.id,buyerId:m.buyer_context_id,sellerStoreId:m.store_id,storeId:m.store_id,
  senderRole:seller?'merchant':'user',senderId:m.sender_context_id,senderEmail:seller?m.seller_email:m.buyer_email,recipientEmail:seller?m.buyer_email:m.seller_email,
  senderName:m.sender_name,recipientName:seller?m.buyer_name:m.store_name,orderId:m.order_id,productId:m.listing_id,productTitle:m.product_title,content:m.body,createdAt:m.created_at};}
export async function conversationRows(c:PoolClient,a:VerifiedActor){let condition:string,id:string;if(a.kind==='primary'){await buyer(c,a);condition='m.buyer_context_id=$1';id=a.contextId;}
  else {const s=await sellerStore(c,a);condition='m.store_id=$1';id=s.id;}return (await c.query(messageQuery+' where '+condition+' order by m.created_at,m.id',[id])).rows.map(messageDto);}
export async function sendMarketMessage(c:PoolClient,a:VerifiedActor,body:any){fields(body,['requestId','sellerStoreId','buyerId','productId','orderId','content']);
  if(typeof body.content!=='string' || !body.content.trim() || body.content.length>5000)throw new ApiError(400,'Enter a message of 1–5000 characters.');
  const requestId=uuid(body.requestId),orderId=body.orderId===undefined?null:uuid(body.orderId),productId=body.productId===undefined?null:uuid(body.productId),selector=body.sellerStoreId===undefined?null:uuid(body.sellerStoreId),buyerSelector=body.buyerId===undefined?null:uuid(body.buyerId);
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([selector,buyerSelector,orderId,productId,body.content.trim()])).digest('hex');
  const retry=async()=>{const m=(await c.query(messageQuery+' where m.sender_context_id=$1 and m.request_id=$2',[a.contextId,requestId])).rows[0];if(!m)return null;if(m.request_fingerprint!==fingerprint)throw new ApiError(409,'This message request already has different contents.');return {success:true,idempotent:true,message:messageDto(m)};};
  if(a.kind==='primary'){await buyer(c,a);if(buyerSelector)throw new ApiError(400,'Buyer identity is derived from your session.');}else if(a.kind!=='seller')throw new ApiError(403,'Buyer or seller account required.');
  const previous=await retry();if(previous)return previous;
  const o=orderId?(await c.query('select * from public.market_orders where id=$1',[orderId])).rows[0]:null;
  const l=productId?(await c.query('select * from public.listings where id=$1',[productId])).rows[0]:null;
  if(orderId && !o || productId && !l)throw new ApiError(404,'Item or order not found.');
  let s:any,buyerId:string;
  if(a.kind==='primary'){const id=o?.store_id || l?.store_id || selector;if(!id)throw new ApiError(400,'Choose a store, item or order.');s=(await c.query('select * from public.stores where id=$1 for update',[id])).rows[0];buyerId=a.contextId;}
  else {s=await sellerStore(c,a,true);buyerId=o?.buyer_context_id || buyerSelector;if(!buyerId)throw new ApiError(400,'Select an existing buyer inquiry or order.');}
  if(!s || selector && selector!==s.id || o && (o.store_id!==s.id || o.buyer_context_id!==buyerId) || l && l.store_id!==s.id || o && l && o.listing_id!==l.id)throw new ApiError(404,'Conversation not found in this account.');
  if(buyerSelector && buyerSelector!==buyerId)throw new ApiError(400,'Conflicting buyer selector.');
  const again=await retry();if(again)return again;
  const b=(await c.query(`select p.* from public.account_contexts x join public.profiles p on p.id=x.auth_user_id where x.id=$1 and x.kind='primary' and x.status='active' and p.primary_owner_id is null`,[buyerId])).rows[0];
  if(!b || b.id===s.primary_owner_id)throw new ApiError(403,'You cannot message your own store.');
  if(s.status!=='active' || !(await c.query("select 1 from public.account_contexts x join public.seller_applications app on app.seller_context_id=x.id where x.id=$1 and x.status='active' and app.status='approved'",[s.seller_context_id])).rowCount)throw new ApiError(403,'This seller is unavailable.');
  const exists=(await c.query('select 1 from public.market_messages where store_id=$1 and buyer_context_id=$2 limit 1',[s.id,buyerId])).rowCount;
  if(!exists && !o){if(a.kind!=='primary')throw new ApiError(403,'Reply to an existing buyer inquiry or order.');if(!(await c.query('select private.store_is_public($1) as eligible',[s.id])).rows[0].eligible || l && (l.retired_at || !l.is_published))throw new ApiError(409,'This store or listing is unavailable for new inquiries.');}
  const m=(await c.query(`insert into public.market_messages(buyer_context_id,store_id,order_id,listing_id,product_title,sender_context_id,body,request_id,request_fingerprint)
    values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,[buyerId,s.id,o?.id || null,o?.listing_id || l?.id || null,o?.snapshot.productTitle || l?.title || '',a.contextId,body.content.trim(),requestId,fingerprint])).rows[0];
  await audit(c,a,'market_message_sent',m.id);const notice=await notify(c,[a.kind==='primary'?s.seller_context_id:buyerId],{category:'market_message',title:'New marketplace message',message:body.content.trim().slice(0,100),sender:a.contextId});
  await c.query('update public.notifications set market_message_id=$2 where id=$1',[notice,m.id]);return {success:true,idempotent:false,message:messageDto((await c.query(messageQuery+' where m.id=$1',[m.id])).rows[0])};}
function ratingDto(r:any){return {id:r.id,storeId:r.store_id,productId:r.listing_id,serviceId:r.listing_id,buyerName:r.buyer_name,rating:r.rating,review:r.review,createdAt:r.created_at,updatedAt:r.updated_at,verifiedPurchase:true};}
export async function purchaseReview(c:PoolClient,a:VerifiedActor,body:any,serviceId?:string){fields(body,['orderId','rating','review']);await buyer(c,a);const {o}=await lockOrder(c,a,uuid(body.orderId));
  if(o.status!=='completed' || !o.handover_verified_at)throw new ApiError(409,'Complete the purchase before submitting a review.');
  if(serviceId && (o.listing_id!==uuid(serviceId) || !(await c.query("select 1 from public.listings where id=$1 and kind='service'",[o.listing_id])).rowCount))throw new ApiError(409,'This purchase does not belong to the selected service.');
  if(!Number.isInteger(body.rating) || body.rating<1 || body.rating>5 || body.review!==undefined && (typeof body.review!=='string' || body.review.length>4000))throw new ApiError(400,'Use a score from 1 to 5 and at most 4000 characters.');
  const review=(body.review || '').trim(),old=(await c.query('select * from public.market_reviews where order_id=$1 for update',[o.id])).rows[0];
  const unchanged=old && old.rating===body.rating && old.review===review;
  const r=unchanged?old:(await c.query(`insert into public.market_reviews(order_id,buyer_context_id,store_id,rating,review) values($1,$2,$3,$4,$5)
    on conflict(order_id) do update set rating=excluded.rating,review=excluded.review returning *`,[o.id,a.contextId,o.store_id,body.rating,review])).rows[0];
  if(!unchanged){await audit(c,a,old?'market_review_updated':'market_review_created',r.id);const seller=(await c.query('select seller_context_id from public.stores where id=$1',[o.store_id])).rows[0].seller_context_id;
    const notice=await notify(c,[seller],{category:'market_review',title:old?'Purchase review updated':'New verified purchase review',message:`${o.snapshot.buyerName} rated ${o.snapshot.productTitle} ${r.rating}/5.${review?' Review: '+review:''}`,sender:a.contextId});await c.query('update public.notifications set market_review_id=$2 where id=$1',[notice,r.id]);}
  const summary=async(listing:boolean)=>(await c.query(`select coalesce(round(avg(r.rating),1),0)::float8 as "averageRating",count(*)::integer as "ratingCount" from public.market_reviews r join public.market_orders o on o.id=r.order_id where r.store_id=$1 and ($2::uuid is null or o.listing_id=$2)`,[o.store_id,listing?o.listing_id:null])).rows[0];
  const projection={...ratingDto({...r,listing_id:o.listing_id,buyer_name:o.snapshot.buyerName}),orderId:o.id};const result=await summary(!!serviceId);return {success:true,ratingRecord:projection,...result,...(serviceId?{review:projection,reviewCount:result.ratingCount}:{}),message:'Your verified purchase review has been saved.'};}
export function installMarketConversation(app:Express,auth:SupabaseAuth){
  app.get('/api/digital-market/messages',auth.require(['primary','seller']),route(async(req,res)=>{if(Object.keys(req.query).length)throw new ApiError(400,'Message identity and scope come from your account.');res.json(await auth.db.authorizedSystem(req.actor,['primary','seller'],c=>conversationRows(c,req.actor)));}));
  app.post('/api/digital-market/messages',auth.require(['primary','seller']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['primary','seller'],c=>sendMarketMessage(c,req.actor,req.body)))));
  const submit=(service:boolean)=>route(async(req,res)=>res.status(service?201:200).json(await auth.db.authorizedSystem(req.actor,['primary'],c=>purchaseReview(c,req.actor,req.body,service?uuid(req.params.id):undefined))));
  app.post('/api/digital-market/ratings',auth.require(['primary']),submit(false));app.post('/api/digital-market/services/:id/reviews',auth.require(['primary']),submit(true));
  const list=(service:boolean)=>route(async(req,res)=>{if(Object.keys(req.query).some(k=>!['storeId','serviceId','productId'].includes(k)) || req.query.serviceId && req.query.productId && req.query.serviceId!==req.query.productId)throw new ApiError(400,'Invalid review filter.');
    const item=service?uuid(req.params.id):req.query.serviceId || req.query.productId?uuid(req.query.serviceId || req.query.productId):null,store=req.query.storeId?uuid(req.query.storeId):null;
    const rows=item || store?await auth.db.publicRows('select * from public.market_reviews_public where ($1::uuid is null or listing_id=$1) and ($2::uuid is null or store_id=$2) order by created_at desc,id',[item,store]):[];
    const count=rows.length,average=count?Math.round(rows.reduce((sum,r:any)=>sum+r.rating,0)/count*10)/10:0;res.json({averageRating:average,ratingCount:count,...(service?{serviceId:item,reviewCount:count,reviews:rows.map(ratingDto)}:{ratings:rows.map(ratingDto)})});});
  app.get('/api/digital-market/ratings',list(false));app.get('/api/digital-market/services/:id/reviews',list(true));
}
