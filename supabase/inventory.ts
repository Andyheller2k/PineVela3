import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,uuid,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {sellerStore,storePlan} from './storeSetup.js';
import {ownedMedia} from './media.js';
import {notify} from './notifications.js';
import {PLAN_LIMITS,marketPlanBenefits} from '../marketPlans.js';
import {internationalPhone} from '../internationalPhone.js';
import {servicePoint} from '../serviceLocation.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const allowed=['title','description','price','category','stockQuantity','imageUrl','additionalImages','condition','meetingLocation','location','callLine','isService','serviceCategory','serviceLocationMode','workingDays','openingTime','closingTime','isOpen247','lat','lng','isAvailable','priceCategories'];
function fields(body:any){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported listing fields.');}
function text(v:unknown,max:number,min=1){if(typeof v!=='string' || v.length>max || v.trim().length<min)throw new ApiError(400,'Enter valid listing details.');return v.trim();}
function money(v:unknown,min=0){if(typeof v!=='number' || !Number.isFinite(v) || v<min || v>=1e10 || Number(v.toFixed(2))!==v)throw new ApiError(400,'Use a valid GHS price with at most two decimal places.');return v;}
const days=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
function workingDays(v:unknown){const groups:Record<string,string[]>={'Mon - Sat':days.slice(0,6),'Mon - Fri':days.slice(0,5),'Everyday (7 Days)':days,'Weekends Only':days.slice(5),'By Appointment':['By Appointment']};if(typeof v==='string' && groups[v])return groups[v];const selected=Array.isArray(v)?v:typeof v==='string'?v.split(',').map(s=>s.trim()):[];
  if(!selected.length || selected.length>7 || selected.some(d=>!days.includes(d)) || new Set(selected).size!==selected.length)throw new ApiError(400,'Choose valid service working days.');return selected;}
function time(v:unknown){if(typeof v!=='string')throw new ApiError(400,'Enter valid service hours.');let m=/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i.exec(v.trim());let hour:number,minute:string;
  if(m){hour=Number(m[1]);if(hour<1 || hour>12)throw new ApiError(400,'Enter valid service hours.');hour=hour%12+(m[3].toUpperCase()==='PM'?12:0);minute=m[2];}
  else {m=/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/.exec(v.trim());if(!m)throw new ApiError(400,'Enter valid service hours.');hour=Number(m[1]);minute=m[2];}return `${String(hour).padStart(2,'0')}:${minute}:00`;}
function displayDays(value:string[]){const groups:Record<string,string[]>={'Mon - Sat':days.slice(0,6),'Mon - Fri':days.slice(0,5),'Everyday (7 Days)':days,'Weekends Only':days.slice(5),'By Appointment':['By Appointment']};return Object.keys(groups).find(k=>JSON.stringify(groups[k])===JSON.stringify(value)) || value.join(', ');}
async function detail(c:PoolClient,s:any,id?:string){const plan=await storePlan(c,s.id);const rows=(await c.query(`select l.*,
  coalesce((select sum(quantity)::integer from public.market_orders o where o.listing_id=l.id and o.status in ('awaiting_seller','pending_meetup') and o.reserved_until>now()),0) as reserved,
  coalesce((select jsonb_agg(storage_path order by sort_order) from public.listing_media where listing_id=l.id),'[]'::jsonb) as images,
  coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',label,'price',price,'imageUrl',image_path) order by sort_order) from public.listing_price_options where listing_id=l.id),'[]'::jsonb) as price_options,
  (select coalesce(round(avg(rating),1),0) from private.market_reviews_public where listing_id=l.id) as rating,
  (select count(*) from private.market_reviews_public where listing_id=l.id) as review_count
  from public.listings l where store_id=$1 and retired_at is null and ($2::uuid is null or l.id=$2) order by created_at desc`,[s.id,id || null])).rows;
  return rows.map(r=>({...marketPlanBenefits(plan),id:r.id,storeId:s.id,storeName:s.name,sellerName:s.username || s.name,sellerEmail:s.email,sellerPhone:s.primary_phone,sellerUniversity:s.campus,
    title:r.title,description:r.description,price:Number(r.price),currency:r.currency,category:r.category,isService:r.kind==='service',serviceCategory:r.service_category,
    stockQuantity:r.stock_quantity,availableQuantity:r.kind==='service'?null:Math.max(0,r.stock_quantity-r.reserved),isAvailable:r.is_published && (r.kind==='service' || r.stock_quantity>r.reserved),
    imageUrl:r.images[0] || '',additionalImages:r.images.slice(1),priceCategories:r.price_options,condition:r.condition,meetingLocation:r.meeting_location,location:r.meeting_location,
    callLine:r.call_line,serviceLocationMode:r.service_location_mode,lat:r.latitude===null?null:Number(r.latitude),lng:r.longitude===null?null:Number(r.longitude),
    workingDays:displayDays(r.working_days),openingTime:r.opening_time,closingTime:r.closing_time,isOpen247:r.is_open_247,
    rating:Number(r.rating),reviewCount:Number(r.review_count),createdAt:r.created_at,updatedAt:r.updated_at}));}
export async function sellerInventory(c:PoolClient,a:VerifiedActor){return detail(c,await sellerStore(c,a));}
async function paid(c:PoolClient,s:any){if(!(await c.query('select private.store_is_public($1) as paid',[s.id])).rows[0].paid)throw new ApiError(402,'Complete verified store activation and renew your subscription before publishing or editing listings.');}
async function audit(c:PoolClient,a:VerifiedActor,id:string,event:string){await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,$2,'listing',$3)",[a.contextId,event,id]);}
export async function saveListing(c:PoolClient,a:VerifiedActor,body:any,id?:string){fields(body);const s=await sellerStore(c,a,true);await paid(c,s);
  const old=id?(await c.query('select * from public.listings where id=$1 and store_id=$2 and retired_at is null for update',[uuid(id),s.id])).rows[0]:null;
  if(id && !old)throw new ApiError(404,'Listing not found in your store.');
  const source:any=old?(await detail(c,s,old.id))[0]:{};const input={...source,...body};
  if(body.isService!==undefined && typeof body.isService!=='boolean')throw new ApiError(400,'Choose a valid listing type.');
  const service=old?old.kind==='service':body.isService===true;if(old && body.isService!==undefined && body.isService!==service)throw new ApiError(400,'Listing type cannot change.');
  const row:any={title:text(input.title,200),description:text(input.description,4000),category:text(input.category,200),price:money(input.price,0.01),stock_quantity:null,
    condition:null,meeting_location:text(body.location ?? body.meetingLocation ?? source.location ?? '',600,0),call_line:null,service_location_mode:null,service_category:null,
    latitude:null,longitude:null,working_days:[],opening_time:null,closing_time:null,is_open_247:false};
  if(body.location!==undefined && body.meetingLocation!==undefined && text(body.location,600,0)!==text(body.meetingLocation,600,0))throw new ApiError(400,'Choose one actual meeting location.');
  if(!service){if(!Number.isSafeInteger(input.stockQuantity) || input.stockQuantity< (body.stockQuantity!==undefined || !old?1:0))throw new ApiError(400,'Stock quantity must be a whole number of at least 1.');row.stock_quantity=input.stockQuantity;
    if(!['Brand New','Like New','Fairly Used','Refurbished'].includes(input.condition))throw new ApiError(400,'Choose the actual item condition.');row.condition=input.condition;
    if(body.priceCategories?.length || body.serviceLocationMode!==undefined || body.serviceCategory!==undefined)throw new ApiError(400,'Product listings cannot contain service options.');
  }else{
    if(body.stockQuantity!==undefined && body.stockQuantity!==null)throw new ApiError(400,'Services do not have an inventory quantity.');
    if(!['flexible','fixed','hybrid'].includes(input.serviceLocationMode))throw new ApiError(400,'Choose a valid service location mode.');row.service_location_mode=input.serviceLocationMode;
    row.service_category=text(input.serviceCategory,200);row.is_open_247=input.isOpen247===true;
    if(body.isOpen247!==undefined && typeof body.isOpen247!=='boolean')throw new ApiError(400,'Choose valid service availability.');
    if(input.serviceLocationMode!=='flexible'){const point=servicePoint(input.lat,input.lng);if(!point || !row.meeting_location)throw new ApiError(400,'Fixed and Hybrid services require an actual location and map pin.');row.latitude=point.lat;row.longitude=point.lng;}
    else if(body.lat!=null || body.lng!=null)throw new ApiError(400,'Flexible services do not publish a fixed map pin.');
    try{row.call_line=internationalPhone(input.callLine,s.phone_country).number;}catch{throw new ApiError(400,'Enter a valid service contact number matching your store phone country.');}
    row.working_days=row.is_open_247?days:workingDays(input.workingDays);if(!row.is_open_247){row.opening_time=time(input.openingTime);row.closing_time=time(input.closingTime);}
  }
  if(body.isAvailable!==undefined && typeof body.isAvailable!=='boolean')throw new ApiError(400,'Choose valid listing availability.');
  const publish=body.isAvailable ?? old?.is_published ?? true;
  if(!Array.isArray(input.additionalImages ?? []))throw new ApiError(400,'Choose valid listing photographs.');
  const images=[input.imageUrl,...(input.additionalImages ?? [])];
  if(images.length>4 || new Set(images).size!==images.length)throw new ApiError(400,'Use a cover and at most three distinct additional photographs.');
  for(const image of images)await ownedMedia(c,a,image,'market');
  const options=input.priceCategories ?? [];if(!Array.isArray(options) || options.length>4 || !service && options.length)throw new ApiError(400,'Services support at most four price options.');
  const validated:any[]=[];for(const option of options){if(!option || typeof option!=='object' || Array.isArray(option) || Object.keys(option).some(k=>!['id','name','price','imageUrl'].includes(k)))throw new ApiError(400,'Enter valid service price options.');
    const optionId=option.id===undefined?undefined:uuid(option.id);if(optionId && (!old || !source.priceCategories.some((p:any)=>p.id===optionId)))throw new ApiError(400,'Price option does not belong to this service.');
    const label=text(option.name,120),price=money(option.price),image=option.imageUrl || null;if(image)await ownedMedia(c,a,image,'market');validated.push({id:optionId,label,price,image});}
  if(new Set(validated.map(o=>o.label.toLowerCase())).size!==validated.length || new Set(validated.filter(o=>o.id).map(o=>o.id)).size!==validated.filter(o=>o.id).length)throw new ApiError(400,'Use distinct service price options.');
  const plan=await storePlan(c,s.id),limits=PLAN_LIMITS[plan];
  const capacity=(await c.query(`select count(*) filter(where kind='product')::integer as items,count(*) filter(where kind='service')::integer as services,
    coalesce(sum(stock_quantity) filter(where kind='product'),0)::integer as units from public.listings where store_id=$1 and retired_at is null and ($2::uuid is null or id<>$2)`,[s.id,id || null])).rows[0];
  if(capacity.items+Number(!service)>limits.items || capacity.services+Number(service)>limits.services || capacity.units+(row.stock_quantity ?? 0)>limits.inventory)throw new ApiError(403,'Your active subscription inventory limit has been reached.');
  const reserved=old?(await c.query("select coalesce(sum(quantity),0)::integer as reserved from public.market_orders where listing_id=$1 and status in ('awaiting_seller','pending_meetup') and reserved_until>now()",[old.id])).rows[0].reserved:0;
  if(!service && row.stock_quantity<reserved)throw new ApiError(409,'Stock cannot be reduced below existing reservations.');
  const keys=Object.keys(row),values=Object.values(row);
  let listingId=id;
  if(old)await c.query(`update public.listings set ${keys.map((key,i)=>`${key}=$${i+2}`).join(',')},is_published=false where id=$1`,[old.id,...values]);
  else listingId=(await c.query(`insert into public.listings(store_id,kind,${keys.join(',')}) values($1,$2,${keys.map((_,i)=>`$${i+3}`).join(',')}) returning id`,[s.id,service?'service':'product',...values])).rows[0].id;
  await c.query('delete from public.listing_media where listing_id=$1',[listingId]);for(let i=0;i<images.length;i++)await c.query('insert into public.listing_media(listing_id,sort_order,storage_path) values($1,$2,$3)',[listingId,i,images[i]]);
  await c.query('delete from public.listing_price_options where listing_id=$1',[listingId]);for(let i=0;i<validated.length;i++){const o=validated[i];await c.query('insert into public.listing_price_options(id,listing_id,sort_order,label,price,image_path) values(coalesce($1::uuid,gen_random_uuid()),$2,$3,$4,$5,$6)',[o.id || null,listingId,i,o.label,o.price,o.image]);}
  await c.query('update public.listings set is_published=$2 where id=$1',[listingId,publish]);await audit(c,a,listingId!,old?'listing_updated':'listing_created');
  await notify(c,[a.contextId],{category:'market',title:old?'Listing Updated':'Listing Created',message:`${row.title} was ${old?'updated':'added to your inventory'}.`,sender:a.contextId});
  return {success:true,product:(await detail(c,s,listingId))[0]};
}
export async function removeListing(c:PoolClient,a:VerifiedActor,id:string){const s=await sellerStore(c,a,true),listing=(await c.query('select * from public.listings where id=$1 and store_id=$2 for update',[uuid(id),s.id])).rows[0];if(!listing)throw new ApiError(404,'Listing not found in your store.');if(listing.retired_at)return {success:true,idempotent:true};
  if((await c.query("select id from public.market_orders where listing_id=$1 and status in ('awaiting_seller','pending_meetup') and reserved_until>now() limit 1",[id])).rowCount)throw new ApiError(409,'Resolve active orders before removing this listing.');
  await c.query('update public.listings set retired_at=now(),is_published=false where id=$1',[id]);await audit(c,a,id,'listing_removed');await notify(c,[a.contextId],{category:'market',title:'Listing Removed',message:`${listing.title} was removed from your inventory.`,sender:a.contextId});return {success:true,idempotent:false};}
export function installInventory(app:Express,auth:SupabaseAuth){app.get('/api/digital-market/inventory',auth.require(['seller']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['seller'],c=>sellerInventory(c,req.actor)))));
  app.post('/api/digital-market/products',auth.require(['seller']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['seller'],c=>saveListing(c,req.actor,req.body)))));
  app.put('/api/digital-market/products/:id',auth.require(['seller']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['seller'],c=>saveListing(c,req.actor,req.body,uuid(req.params.id))))));
  app.delete('/api/digital-market/products/:id',auth.require(['seller']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['seller'],c=>removeListing(c,req.actor,uuid(req.params.id))))));}
