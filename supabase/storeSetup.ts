import type {Express,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import type {SupabaseAuth,AuthRequest} from './auth.js';
import {ownedMedia} from './media.js';
import {MARKET_DEFAULT_LOGO,MARKET_DEFAULT_COVERS,isDefaultMarketCover} from '../marketBranding.js';
import {STORE_DELIVERY_METHODS} from '../storeDelivery.js';
import {internationalPhone,supportedPhoneCountry} from '../internationalPhone.js';
import {notify} from './notifications.js';
import {sellerStatus} from './sellerRegistration.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export async function sellerStore(c:PoolClient,a:VerifiedActor,lock=false){
  if(a.kind!=='seller')throw new ApiError(403,'Sign in with your verified seller account.');
  const s=(await c.query(`select s.*,p.email from public.stores s join public.account_contexts x on x.id=s.seller_context_id
    join public.profiles p on p.id=x.auth_user_id join public.seller_applications app on app.seller_context_id=x.id and app.id=s.application_id and app.registration_generation=x.seller_generation
    where x.id=$1 and x.auth_user_id=$2 and x.kind='seller' and x.status='active' and app.status='approved'
      and s.status in ('pending','active') ${lock?'for update of s':''}`,[a.contextId,a.authUserId])).rows[0];
  if(!s)throw new ApiError(403,'An approved seller store is required.');return s;
}
export async function storePlan(c:PoolClient,id:string){const plan=(await c.query("select plan from public.store_subscriptions where store_id=$1 and status='active' and starts_at<=now() and ends_at>now() order by starts_at desc limit 1",[id])).rows[0]?.plan;return plan==='pine_pro'?'pro':plan==='pine_star'?'star':'default';}
export async function saveStoreProfile(c:PoolClient,a:VerifiedActor,body:any,setup=false){
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['storeName','username','location','category','deliveryMode','phone','phoneCountry','description','profilePicture','coverPicture'].includes(k)))throw new ApiError(400,'Unsupported store profile fields.');
  const s=await sellerStore(c,a,true);
  if(!setup && !s.setup_completed_at)throw new ApiError(409,'Complete initial store setup before editing its profile.');
  const patch:any={};
  for(const [field,column,max,min] of [['storeName','name',200,1],['username','username',120,1],['location','location',600,1],['category','primary_category',200,1],['description','description',4000,0]] as const){
    if(body[field]===undefined && !setup)continue;
    if(typeof body[field]!=='string' || body[field].length>max || body[field].trim().length<min)throw new ApiError(400,`Enter valid ${field}.`);patch[column]=body[field].trim();
  }
  if(body.deliveryMode!==undefined || setup){if(!(STORE_DELIVERY_METHODS as readonly unknown[]).includes(body.deliveryMode))throw new ApiError(400,'Choose a supported delivery / handover method.');patch.delivery_mode=body.deliveryMode;}
  if(body.phone!==undefined || body.phoneCountry!==undefined || setup){
    const country=body.phoneCountry ?? s.phone_country;
    if(!supportedPhoneCountry(country))throw new ApiError(400,'Choose a valid phone country.');
    try{patch.primary_phone=internationalPhone(body.phone ?? s.primary_phone,country).number;patch.phone_country=country;}catch{throw new ApiError(400,'Enter a valid primary store contact number.');}
  }
  const plan=await storePlan(c,s.id);
  for(const [field,column] of [['profilePicture','logo_path'],['coverPicture','cover_path']] as const){
    if(body[field]===undefined && !setup)continue;
    const value=body[field] ?? (field==='profilePicture'?MARKET_DEFAULT_LOGO:MARKET_DEFAULT_COVERS[0].url);
    if(typeof value!=='string')throw new ApiError(400,'Choose valid store branding.');
    const standard=field==='profilePicture'?value===MARKET_DEFAULT_LOGO:isDefaultMarketCover(value);
    if(!standard){if(!['star','pro'].includes(plan))throw new ApiError(403,'Custom store logos and covers require an active Pine Star or Pine Pro subscription.');await ownedMedia(c,a,value,'market');}
    patch[column]=value;
  }
  const unchanged=Object.entries(patch).every(([key,value])=>s[key]===value);
  if(unchanged && s.setup_completed_at)return {success:true,idempotent:true};
  const columns=Object.keys(patch),parameters=[s.id,...Object.values(patch)];
  // Column names are exclusively the server whitelist above, never body keys.
  await c.query(`update public.stores set ${columns.map((key,i)=>`${key}=$${i+2}`).join(',')}${setup?',setup_completed_at=coalesce(setup_completed_at,now())':''} where id=$1`,parameters);
  const firstSetup=setup && !s.setup_completed_at;
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data) values($1,$2,'store',$3,$4)",[a.contextId,firstSetup?'store_setup_saved':'store_profile_updated',s.id,JSON.stringify({fields:columns})]);
  await notify(c,[a.contextId],{category:'market',title:firstSetup?'Store Details Saved':'Store Profile Updated',message:firstSetup?'Your store details were saved. Verified payment is still required for activation.':'Your store profile was updated.',sender:a.contextId});
  return {success:true,idempotent:false};
}
export function installStoreSetup(app:Express,auth:SupabaseAuth){
  const save=(setup:boolean)=>route(async(req,res)=>{const result=await auth.db.authorizedSystem(req.actor,['seller'],async c=>{
    const saved=await saveStoreProfile(c,req.actor,req.body,setup);return {...saved,store:(await sellerStatus(c,req.actor)).store};
  });res.json(result);});
  app.post(['/api/digital-market/store-setup','/api/digital-market/create-store'],auth.require(['seller']),save(true));
  app.put('/api/digital-market/store',auth.require(['seller']),save(false));
}
