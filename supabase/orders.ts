import crypto from 'node:crypto';
import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {OrderPins,loadOrderPins} from './orderPins.js';
import {notify} from './notifications.js';
import {servicePoint} from '../serviceLocation.js';
import {internationalPhone,phoneDraft} from '../internationalPhone.js';
import {publicPlatformSettings} from '../platformSettings.js';
import {reservationExpired} from '../orderReservationPolicy.js';
import {historyPage,historyTimestamp,encodeHistoryCursor,type HistoryPage} from './historyPagination.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const active=['awaiting_seller','pending_meetup'];
const labels:Record<string,string>={awaiting_seller:'Awaiting Seller Confirmation',pending_meetup:'Pending Meetup',completed:'Completed & Paid',cancelled:'Cancelled',rejected:'Location Rejected',expired:'Expired'};
function fields(body:any,keys:string[]){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!keys.includes(k)))throw new ApiError(400,'Unsupported order fields.');}
function text(value:unknown,max:number,required=false){if(typeof value!=='string' || value.length>max || required && !value.trim())throw new ApiError(400,'Enter valid order details.');return value.trim();}
export async function buyer(c:PoolClient,a:VerifiedActor){if(a.kind!=='primary')throw new ApiError(403,'Sign in with your primary buyer account.');const p=(await c.query(`select p.* from public.profiles p join public.account_contexts x on x.auth_user_id=p.id
  where x.id=$1 and x.auth_user_id=$2 and x.kind='primary' and x.status='active' and p.primary_owner_id is null`,[a.contextId,a.authUserId])).rows[0];if(!p)throw new ApiError(403,'A verified primary buyer account is required.');return p;}
async function participants(c:PoolClient,a:VerifiedActor,o:any){if(a.kind==='primary' && o.buyer_context_id===a.contextId)return 'buyer';if(a.kind==='seller' && (await c.query(`select s.id from public.stores s join public.account_contexts x on x.id=s.seller_context_id
  where s.id=$1 and x.id=$2 and x.auth_user_id=$3 and x.status='active' and x.kind='seller' and s.status='active'
  and exists(select 1 from public.seller_applications app where app.seller_context_id=x.id and app.id=s.application_id and app.registration_generation=x.seller_generation and app.status='approved')`,[o.store_id,a.contextId,a.authUserId])).rowCount)return 'seller';throw new ApiError(404,'Order not found in this account.');}
export async function lockOrder(c:PoolClient,a:VerifiedActor,id:string){const initial=(await c.query('select * from public.market_orders where id=$1',[uuid(id)])).rows[0];if(!initial)throw new ApiError(404,'Order not found in this account.');await participants(c,a,initial);
  await c.query('select id from public.stores where id=$1 for update',[initial.store_id]);await c.query('select id from public.listings where id=$1 for update',[initial.listing_id]);const o=(await c.query('select * from public.market_orders where id=$1 for update',[id])).rows[0];return {o,side:await participants(c,a,o)};}
async function event(c:PoolClient,a:VerifiedActor,o:any,action:string,notes=''){await c.query('insert into private.market_order_events(order_id,actor_context_id,action,status,notes) values($1,$2,$3,$4,$5)',[o.id,a.contextId,action,o.status,notes.replace(/\b\d{6}\b/g,'[redacted]')]);
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'market_order',$3)",[a.contextId,`market_order_${action}`,o.id]);}
async function issuePin(c:PoolClient,o:any,pins:OrderPins){const old=(await c.query('select * from private.market_order_pins where order_id=$1 for update',[o.id])).rows[0],version=(old?.version || 0)+1;const previous=old?pins.open(o.id,old):undefined;let value:string;do{value=String(crypto.randomInt(100000,1000000));}while(value===previous);const encrypted=pins.seal(o.id,value,version);
  if(old){await c.query(`update private.market_order_pins set encrypted_pin=$2,nonce=$3,key_id=$4,version=$5,attempts=0,issued_at=clock_timestamp(),expires_at=clock_timestamp()+interval '24 hours' where order_id=$1`,[o.id,encrypted.encrypted,encrypted.nonce,encrypted.keyId,version]);await c.query('update public.market_orders set reserved_until=(select expires_at from private.market_order_pins where order_id=$1) where id=$1',[o.id]);}
  else await c.query(`insert into private.market_order_pins(order_id,encrypted_pin,nonce,key_id,issued_at,expires_at,version) select id,$2,$3,$4,clock_timestamp(),reserved_until,$5 from public.market_orders where id=$1`,[o.id,encrypted.encrypted,encrypted.nonce,encrypted.keyId,version]);
}
const timelineSize=20;
function eventDto(e:any){return {id:e.id,status:labels[e.status],title:({created:'Campus meetup requested',confirmed:'Seller agreed to meetup',rejected:'Meetup declined by seller',cancelled:'Order cancelled',completed:'PIN verified; handover recorded',pin_renewed:'Buyer renewed delivery PIN',expired:'Reservation expired'} as Record<string,string>)[e.action],timestamp:e.cursor_time||e.created_at,notes:e.notes};}
export async function orderEventRows(c:PoolClient,ids:string[]){return (await c.query(`select e.* from unnest($1::uuid[]) scope(order_id)
  cross join lateral(select e.*,${historyTimestamp('e')} from private.market_order_events e where e.order_id=scope.order_id order by e.created_at desc,e.id desc limit 21) e
  order by e.created_at desc,e.id desc`,[ids])).rows;}
export async function orderTimelinePage(c:PoolClient,a:VerifiedActor,id:string,page:HistoryPage=historyPage({limit:'20'})){
  const order=(await c.query('select o.*,s.seller_context_id from public.market_orders o join public.stores s on s.id=o.store_id where o.id=$1',[uuid(id)])).rows[0];
  if(a.kind==='admin'){
    if(!(await c.query("select 1 from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.context_id=$1 and x.auth_user_id=$2 and x.status='active' and m.status='active'",[a.contextId,a.authUserId])).rowCount)throw new ApiError(403,'Active administrator required.');
  }else if(!order||!(a.kind==='primary'&&order.buyer_context_id===a.contextId||a.kind==='seller'&&order.seller_context_id===a.contextId))throw new ApiError(404,'Order not found in this account.');
  if(!order)throw new ApiError(404,'Order not found in this account.');
  const rows=(await c.query(`select e.*,${historyTimestamp('e')} from private.market_order_events e where e.order_id=$1
    and ($2::timestamptz is null or (e.created_at,e.id)<($2::timestamptz,$3::uuid)) order by e.created_at desc,e.id desc limit $4`,[id,page.before?.time||null,page.before?.id||null,page.limit+1])).rows;
  const more=rows.length>page.limit,events=rows.slice(0,page.limit);events.reverse();
  return {timeline:events.map(eventDto),hasMore:more,nextCursor:more?encodeHistoryCursor(events[0]):null};
}
type OrderRelations={events:any[];pin?:any;rating?:any};
async function dto(c:PoolClient,a:VerifiedActor,o:any,pins?:OrderPins,related?:OrderRelations){const timeline=related?related.events:await orderEventRows(c,[o.id]),shown=timeline.slice(0,timelineSize).reverse();
  const snapshot=Object.fromEntries(['productTitle','productImage','isService','priceCategory','priceCategoryId','buyerName','buyerEmail','buyerPhone','sellerId','sellerEmail','storeName','university','platformCommissionRate','platformCommissionAmount'].filter(key=>Object.hasOwn(o.snapshot,key)).map(key=>[key,o.snapshot[key]]));
  const result:any={...snapshot,id:o.id,productId:o.listing_id,storeId:o.store_id,buyerId:o.buyer_context_id,productPrice:Number(o.unit_price),quantity:o.quantity,totalAmount:Number(o.total_amount),currency:o.currency,
    status:reservationExpired(o.status,o.reserved_until)?'Expired':labels[o.status],reservationExpiresAt:o.reserved_until,meetingLocation:o.meeting_location,meetingLatitude:o.meeting_latitude===null?null:Number(o.meeting_latitude),meetingLongitude:o.meeting_longitude===null?null:Number(o.meeting_longitude),serviceLocationOption:o.service_location_option,
    sellerConfirmed:!!o.seller_confirmed_at,sellerAgreedLocation:!!o.seller_confirmed_at,sellerAgreedAt:o.seller_confirmed_at,createdAt:o.cursor_time||o.created_at,updatedAt:o.updated_at,paymentMethod:'Pay on Campus Delivery',
    timeline:shown.map(eventDto),timelineHasMore:timeline.length>timelineSize,timelineCursor:timeline.length>timelineSize?encodeHistoryCursor(shown[0]):null,userRating:null};
  if(a.kind==='primary' && o.buyer_context_id===a.contextId){const p=related?related.pin:(await c.query('select *,expires_at>clock_timestamp() as current from private.market_order_pins where order_id=$1',[o.id])).rows[0];result.deliveryPinState=!p || !active.includes(o.status)?'unavailable':reservationExpired(o.status,o.reserved_until)?'expired':p.attempts>=5?'locked':!p.current?'expired':'active';if(p)result.deliveryPinExpiresAt=p.expires_at;if(result.deliveryPinState==='active')result.otpPin=(pins || loadOrderPins()).open(o.id,p);}
  const rating=related?related.rating:(await c.query('select id,rating,review,created_at,updated_at from public.market_reviews where order_id=$1 and buyer_context_id=$2 and $3::text=\'completed\'',[o.id,o.buyer_context_id,o.status])).rows[0];if(rating)result.userRating={id:rating.id,rating:rating.rating,review:rating.review,createdAt:rating.created_at,updatedAt:rating.updated_at};return result;}
export async function orderPage(c:PoolClient,a:VerifiedActor,pins?:OrderPins,page:HistoryPage=historyPage({})){
  let condition:string;const values:unknown[]=[a.contextId,a.authUserId];
  if(a.kind==='primary'){await buyer(c,a);condition='o.buyer_context_id=$1';}
  else if(a.kind==='seller')condition="exists(select 1 from public.stores s join public.account_contexts x on x.id=s.seller_context_id where s.id=o.store_id and x.id=$1 and x.auth_user_id=$2 and x.kind='seller' and x.status='active')";
  else if(a.kind==='admin'){
    if(!(await c.query("select 1 from public.admin_memberships m join public.account_contexts x on x.id=m.context_id where m.context_id=$1 and x.auth_user_id=$2 and x.status='active' and m.status='active'",values)).rowCount)throw new ApiError(403,'Active administrator required.');
    condition='true';
  }else throw new ApiError(403,'Buyer or seller access is required.');
  // Explicit parameter types remain required even when a branch does not use
  // both identities. A cursor filters this already-authorized relation only.
  const scope=`from public.market_orders o where $1::uuid is not null and $2::uuid is not null and ${condition}`;
  const rows=(await c.query(`select o.*,${historyTimestamp('o')} ${scope}
    and ($3::timestamptz is null or (o.created_at,o.id)<($3::timestamptz,$4::uuid)) order by o.created_at desc,o.id desc limit $5`,[...values,page.before?.time||null,page.before?.id||null,page.limit+1])).rows;
  const hasMore=rows.length>page.limit,items=rows.slice(0,page.limit),ids=items.map(o=>o.id),related=new Map<string,OrderRelations>(ids.map(id=>[id,{events:[]}])) ;
  if(ids.length){
    const events=await orderEventRows(c,ids);
    for(const e of events)related.get(e.order_id)!.events.push(e);
    // Only buyers may ever read or decrypt delivery challenges. Sellers and
    // administrators do not even select the PIN rows in this batched read.
    if(a.kind==='primary')for(const pin of (await c.query('select *,expires_at>clock_timestamp() as current from private.market_order_pins where order_id=any($1::uuid[])',[ids])).rows)related.get(pin.order_id)!.pin=pin;
    for(const rating of (await c.query("select r.* from public.market_reviews r join public.market_orders o on o.id=r.order_id where r.order_id=any($1::uuid[]) and o.status='completed' and r.buyer_context_id=o.buyer_context_id",[ids])).rows)related.get(rating.order_id)!.rating=rating;
  }
  const summary=(await c.query(`select count(*)::int as total,count(*) filter(where o.status in ('awaiting_seller','pending_meetup') and o.reserved_until>clock_timestamp())::int as pending,
    count(*) filter(where o.status='completed')::int as completed,coalesce(sum(o.total_amount) filter(where o.status='completed'),0)::float8 as revenue ${scope}`,values)).rows[0];
  const customers=a.kind==='seller'?(await c.query(`select o.snapshot->>'buyerEmail' as email,max(o.snapshot->>'buyerName') as name,max(o.snapshot->>'buyerPhone') as phone,
    count(*)::int as "orderCount",coalesce(sum(o.total_amount) filter(where o.status='completed'),0)::float8 as "totalSpent" ${scope}
    group by o.buyer_context_id,o.snapshot->>'buyerEmail' order by max(o.created_at) desc,o.buyer_context_id limit 5`,values)).rows:[];
  return {orders:await Promise.all(items.map(o=>dto(c,a,o,pins,related.get(o.id)))),hasMore,nextCursor:hasMore?encodeHistoryCursor(items.at(-1)!):null,summary,customers};
}
export async function orderRows(c:PoolClient,a:VerifiedActor,pins?:OrderPins){return (await orderPage(c,a,pins)).orders;}
export async function createOrder(c:PoolClient,a:VerifiedActor,body:any,pins:OrderPins){fields(body,['requestId','productId','quantity','priceCategoryId','priceCategoryName','buyerPhone','meetingLocation','meetingLatitude','meetingLongitude','serviceLocationOption']);const p=await buyer(c,a),requestId=uuid(body.requestId),productId=uuid(body.productId);
  if(!Number.isSafeInteger(body.quantity) || body.quantity<1 || body.quantity>2147483647)throw new ApiError(400,'Quantity must be a positive whole number within the supported range.');
  let phone:string;try{phone=internationalPhone(body.buyerPhone,phoneDraft(body.buyerPhone).contactPhoneCountry).number;}catch{throw new ApiError(400,'Enter a valid contact phone number.');}
  const location=text(body.meetingLocation ?? '',600),optionId=body.priceCategoryId===undefined?null:uuid(body.priceCategoryId),optionName=body.priceCategoryName===undefined?null:text(body.priceCategoryName,120,true);
  const submittedPoint=body.meetingLatitude==null && body.meetingLongitude==null?null:servicePoint(body.meetingLatitude,body.meetingLongitude);if(!submittedPoint && (body.meetingLatitude!=null || body.meetingLongitude!=null))throw new ApiError(400,'Choose valid meetup coordinates.');
  if(body.serviceLocationOption!==undefined && !['seller-location','buyer-location'].includes(body.serviceLocationOption))throw new ApiError(400,'Choose a supported service location.');
  const fingerprint=crypto.createHash('sha256').update(JSON.stringify([productId,body.quantity,optionId,optionName,phone,location,submittedPoint,body.serviceLocationOption ?? null])).digest('hex');
  const existing=async()=>{const o=(await c.query('select * from public.market_orders where buyer_context_id=$1 and request_id=$2',[a.contextId,requestId])).rows[0];if(!o)return null;if(o.request_fingerprint!==fingerprint)throw new ApiError(409,'This order request was already used with different details.');return {success:true,idempotent:true,order:await dto(c,a,o,pins)};};
  const prior=await existing();if(prior)return prior;
  const storeId=(await c.query('select store_id from public.listings where id=$1',[productId])).rows[0]?.store_id;if(!storeId)throw new ApiError(404,'Listing is no longer available.');
  const s=(await c.query(`select s.*,p.email from public.stores s join public.account_contexts x on x.id=s.seller_context_id join public.profiles p on p.id=x.auth_user_id where s.id=$1 for update of s`,[storeId])).rows[0];
  const retry=await existing();if(retry)return retry;const l=(await c.query('select * from public.listings where id=$1 for update',[productId])).rows[0];
  if(s.primary_owner_id===a.authUserId)throw new ApiError(403,'You cannot order from your own store.');
  if(l.retired_at || !l.is_published || !(await c.query('select private.store_is_public($1) as eligible',[s.id])).rows[0].eligible)throw new ApiError(409,'This store or listing is not currently available.');
  const options=(await c.query('select id,label,price,image_path from public.listing_price_options where listing_id=$1',[l.id])).rows;let priceOption:any;
  if(optionId || optionName){const matches=options.filter(o=>optionId?o.id===optionId:o.label===optionName);if(l.kind!=='service' || matches.length!==1 || optionName && matches[0].label!==optionName)throw new ApiError(400,'The selected price option is unavailable.');priceOption=matches[0];}
  const cents=Math.round(Number(priceOption?.price ?? l.price)*100),totalCents=cents*body.quantity;if(!Number.isSafeInteger(totalCents) || totalCents>=1e12)throw new ApiError(400,'Order total is too large.');
  const reserved=Number((await c.query("select coalesce(sum(quantity),0) as reserved from public.market_orders where listing_id=$1 and status in ('awaiting_seller','pending_meetup') and reserved_until>clock_timestamp()",[l.id])).rows[0].reserved);if(l.kind==='product' && l.stock_quantity-reserved<body.quantity)throw new ApiError(409,'Requested quantity exceeds available stock.');
  const fixed=l.kind==='service' && (l.service_location_mode==='fixed' || l.service_location_mode==='hybrid' && body.serviceLocationOption==='seller-location');
  if(l.kind==='service' && l.service_location_mode==='fixed' && body.serviceLocationOption!=='seller-location' || l.kind==='service' && l.service_location_mode==='flexible' && body.serviceLocationOption==='seller-location')throw new ApiError(400,'This service does not support the selected location.');
  const point=fixed?servicePoint(l.latitude,l.longitude):submittedPoint,meeting=fixed?l.meeting_location:location;if(!meeting || fixed && !point)throw new ApiError(400,'Choose an actual meetup location.');
  const image=priceOption?.image_path || (await c.query('select storage_path from public.listing_media where listing_id=$1 and sort_order=0',[l.id])).rows[0]?.storage_path;if(!image)throw new ApiError(409,'Listing photograph is unavailable.');
  const settings=publicPlatformSettings({platformSettings:(await c.query("select value from private.platform_settings where key='platform'")).rows[0]?.value});
  const snapshot={productTitle:priceOption?`${l.title} (${priceOption.label})`:l.title,productImage:image,isService:l.kind==='service',priceCategory:priceOption?.label,priceCategoryId:priceOption?.id,
    buyerName:p.display_name,buyerEmail:p.email,buyerPhone:phone,sellerId:s.seller_context_id,sellerEmail:s.email,storeName:s.name,university:s.campus,platformCommissionRate:settings.commission,platformCommissionAmount:Math.round(totalCents*settings.commission/100)/100};
  const o=(await c.query(`insert into public.market_orders(buyer_context_id,store_id,listing_id,quantity,unit_price,total_amount,currency,meeting_location,meeting_latitude,meeting_longitude,service_location_option,reserved_until,request_id,request_fingerprint,snapshot)
    values($1,$2,$3,$4,$5,$6,'GHS',$7,$8,$9,$10,clock_timestamp()+interval '24 hours',$11,$12,$13) returning *`,[a.contextId,s.id,l.id,body.quantity,cents/100,totalCents/100,meeting,point?.lat ?? null,point?.lng ?? null,l.kind==='service'?(fixed?'seller-location':'buyer-location'):null,requestId,fingerprint,JSON.stringify(snapshot)])).rows[0];
  await issuePin(c,o,pins);await event(c,a,o,'created','Buyer proposed the saved meetup location.');await notify(c,[s.seller_context_id],{category:'market',title:'New Buy Request',orderId:o.id,message:`${p.display_name} requested ${snapshot.productTitle} at ${meeting}.`,sender:a.contextId,link:'/digital-market'});return {success:true,idempotent:false,order:await dto(c,a,o,pins)};}
export async function renewOrderPin(c:PoolClient,a:VerifiedActor,id:string,body:any,pins:OrderPins){fields(body,[]);await buyer(c,a);const {o,side}=await lockOrder(c,a,id);if(side!=='buyer')throw new ApiError(403,'Only the buyer can renew this PIN.');if(!active.includes(o.status)||reservationExpired(o.status,o.reserved_until))throw new ApiError(409,'This reservation has ended. Open the current listing to place a new request.');
  const p=(await c.query('select issued_at>clock_timestamp()-interval \'1 minute\' as recent from private.market_order_pins where order_id=$1',[id])).rows[0];if(p?.recent)throw new ApiError(429,'Wait one minute before requesting another delivery PIN.');
  const l=(await c.query('select * from public.listings where id=$1',[o.listing_id])).rows[0],reserved=Number((await c.query("select coalesce(sum(quantity),0) as reserved from public.market_orders where listing_id=$1 and id<>$2 and status in ('awaiting_seller','pending_meetup') and reserved_until>clock_timestamp()",[o.listing_id,o.id])).rows[0].reserved);
  if(l.retired_at || !l.is_published || !(await c.query('select private.store_is_public($1) as eligible',[o.store_id])).rows[0].eligible || l.kind==='product' && l.stock_quantity-reserved<o.quantity)throw new ApiError(409,'Current stock or store availability cannot renew this reservation.');
  await issuePin(c,o,pins);const next=(await c.query('select * from public.market_orders where id=$1',[id])).rows[0];await event(c,a,next,'pin_renewed','Buyer replaced the delivery challenge and renewed the reservation.');const seller=(await c.query('select seller_context_id from public.stores where id=$1',[o.store_id])).rows[0].seller_context_id;await notify(c,[seller],{category:'market',title:'Delivery PIN Renewed',orderId:o.id,message:`The buyer renewed the reservation for ${o.snapshot.productTitle}.`,sender:a.contextId});return {success:true,order:await dto(c,a,next,pins)};}
function actionBody(body:any){fields(body,['action','newStatus','status','inputPin','otpPin','notes']);const choices:Record<string,string>={'agree-location':'confirm','confirm-location':'confirm','reject-location':'reject','location rejected':'reject','rejected by seller':'reject',cancelled:'cancel','completed & paid':'complete',completed:'complete'};
  const actions=[body.action,body.newStatus,body.status].filter(v=>v!==undefined).map(v=>typeof v==='string'?choices[v.trim().toLowerCase()]:undefined);if(!actions.length || actions.some(v=>!v) || new Set(actions).size!==1)throw new ApiError(400,'Missing or conflicting order actions.');const action=actions[0]!;
  const notes=body.notes===undefined?'':text(body.notes,2000);if(body.inputPin!==undefined && body.otpPin!==undefined && body.inputPin!==body.otpPin || action!=='complete' && (body.inputPin!==undefined || body.otpPin!==undefined))throw new ApiError(400,'Conflicting or unsupported delivery PIN fields.');return {action,notes,pin:body.inputPin ?? body.otpPin};}
export async function changeOrder(c:PoolClient,a:VerifiedActor,id:string,body:any,pins:OrderPins){const {action,notes,pin}=actionBody(body),{o,side}=await lockOrder(c,a,id);if(side!=='seller' && !(side==='buyer' && action==='cancel'))throw new ApiError(403,'Only the seller can manage handover. Buyers may cancel their own order.');
  const desired:Record<string,string>={confirm:'pending_meetup',reject:'rejected',cancel:'cancelled',complete:'completed'};
  if(o.status===desired[action])return {success:true,idempotent:true,order:await dto(c,a,o,pins)};
  if(!active.includes(o.status) || action==='complete' && o.status!=='pending_meetup' || ['confirm','reject'].includes(action) && o.status!=='awaiting_seller')throw new ApiError(409,'This action is not allowed in the current order state.');
  if(action==='confirm' || action==='complete'){const p=(await c.query('select *,expires_at>clock_timestamp() as current from private.market_order_pins where order_id=$1 for update',[o.id])).rows[0];if(!p || !p.current)throw new ApiError(409,'Reservation expired. Ask the buyer to renew their delivery PIN.');if(p.attempts>=5)throw new ApiError(429,'Delivery PIN is locked. Ask the buyer to renew it.');
    if(action==='complete'){if(pin===undefined || pin==='')throw new ApiError(400,'Enter the buyer’s six-digit delivery PIN.');const actual=pins.open(o.id,p),supplied=typeof pin==='string'?pin.trim():'';
      if(!/^\d{6}$/.test(supplied) || !crypto.timingSafeEqual(crypto.createHash('sha256').update(actual).digest(),crypto.createHash('sha256').update(supplied).digest())){const attempts=(await c.query('update private.market_order_pins set attempts=attempts+1 where order_id=$1 returning attempts',[o.id])).rows[0].attempts;await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data) values($1,'market_order_pin_failed','market_order',$2,$3)",[a.contextId,o.id,JSON.stringify({attempts})]);return {errorStatus:attempts>=5?429:400,error:attempts>=5?'Delivery PIN is locked. Ask the buyer to renew it.':'Incorrect delivery PIN.'};}
    }
  }
  const next=(await c.query(`update public.market_orders set status=$2,seller_confirmed_at=case when $2='pending_meetup' then clock_timestamp() else seller_confirmed_at end,
    handover_verified_at=case when $2='completed' then clock_timestamp() else handover_verified_at end where id=$1 returning *`,[o.id,desired[action]])).rows[0];if(!active.includes(next.status))await c.query('delete from private.market_order_pins where order_id=$1',[o.id]);
  await event(c,a,next,({confirm:'confirmed',reject:'rejected',cancel:'cancelled',complete:'completed'} as any)[action],action==='complete'?'Buyer delivery PIN verified; physical handover recorded.':notes);
  const seller=(await c.query('select seller_context_id from public.stores where id=$1',[o.store_id])).rows[0].seller_context_id;await notify(c,[side==='buyer'?seller:o.buyer_context_id],{category:'market',orderId:o.id,title:({confirm:'Meetup Confirmed',reject:'Meetup Declined',cancel:'Order Cancelled',complete:'Purchase Completed'} as any)[action],message:`${o.snapshot.productTitle}: ${labels[next.status]}.`,sender:a.contextId});return {success:true,idempotent:false,order:await dto(c,a,next,pins)};}
export function installOrders(app:Express,auth:SupabaseAuth){
  app.get('/api/digital-market/orders/:id/events',auth.require(['primary','seller','admin']),route(async(req,res)=>{const page=historyPage(req.query);res.json(await auth.db.authorizedSystem(req.actor,['primary','seller','admin'],c=>orderTimelinePage(c,req.actor,uuid(req.params.id),page)));}));
  app.get('/api/digital-market/my-orders',auth.require(['primary','seller','admin']),route(async(req,res)=>{const page=historyPage(req.query),result=await auth.db.authorizedSystem(req.actor,['primary','seller','admin'],c=>orderPage(c,req.actor,undefined,page));res.json(page.paged?result:result.orders);}));
  app.post('/api/digital-market/orders',auth.require(['primary']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['primary'],c=>createOrder(c,req.actor,req.body,loadOrderPins())))));
  app.post('/api/digital-market/orders/:id/renew-pin',auth.require(['primary']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['primary'],c=>renewOrderPin(c,req.actor,uuid(req.params.id),req.body,loadOrderPins())))));
  app.post('/api/digital-market/orders/:id/update-status',auth.require(['primary','seller']),route(async(req,res)=>{const result=await auth.db.authorizedSystem(req.actor,['primary','seller'],c=>changeOrder(c,req.actor,uuid(req.params.id),req.body,loadOrderPins()));if('errorStatus' in result)return res.status(result.errorStatus).json({error:result.error});return res.json(result);}));}
