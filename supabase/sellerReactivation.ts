import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import {verifiedClaims,type AuthRequest,type SupabaseAuth} from './auth.js';
import {ownedEnrollment} from './enrollment.js';
import {bodyFields} from './adminSettings.js';
import {managerEmailChallenge} from './managerReactivation.js';
import {signupProviderConfig} from '../supabaseSignup.js';
import {checkPortalPin} from './portalAccess.js';
import {requireAccountAccess} from './accountAccess.js';
import {notify} from './notifications.js';
export async function sellerReactivationTarget(c:PoolClient,a:VerifiedActor,id:string){
 if(a.kind!=='primary')throw new ApiError(403,'Use the original primary account.');
 const e=await ownedEnrollment(c,a,id);
 if(e.kind!=='seller'||!e.auth_user_id||!e.linked_context_id||!e.verified_at||!(
  ['completed','cancelled','expired'].includes(e.status)&&e.context_status==='closed'||e.status==='pending_review'&&e.context_status==='pending'))
  throw new ApiError(409,'Only your closed verified seller account can restart registration.');
 await requireAccountAccess(c,e.linked_context_id,['subaccounts']);
 if((await c.query(`select 1 from public.registration_bans b join public.account_contexts x on x.id=b.account_context_id
  where b.kind='seller_account' and b.until_at>clock_timestamp() and (x.id=$1 or x.auth_user_id=$2 or x.primary_owner_id=$2)`,[e.linked_context_id,a.authUserId])).rowCount)
  throw new ApiError(403,'Seller registration is still restricted.');
 const row=(await c.query(`select x.seller_generation from public.account_contexts x join public.profiles p on p.id=x.auth_user_id join auth.users u on u.id=x.auth_user_id
  where x.id=$1 and x.auth_user_id=$2 and x.primary_owner_id=$3 and p.primary_owner_id=$3 and x.kind='seller'
   and not u.is_anonymous and u.deleted_at is null and (u.banned_until is null or u.banned_until<=clock_timestamp())
   and u.email_confirmed_at is not null and lower(u.email)=$4
   and not exists(select 1 from public.stores s where s.seller_context_id=x.id and s.status<>'closed')
   and not exists(select 1 from public.market_orders o join public.stores s on s.id=o.store_id where s.seller_context_id=x.id and o.status in('awaiting_seller','pending_meetup'))
   and not exists(select 1 from public.payments pay where pay.actor_context_id=x.id and pay.status in('initialized','pending'))
   and not exists(select 1 from public.account_contexts other where other.primary_owner_id=x.primary_owner_id and other.kind='seller' and other.id<>x.id and other.status<>'closed')
   for update of x`,
  [e.linked_context_id,e.auth_user_id,a.authUserId,e.invited_email])).rows[0];
 if(!row)throw new ApiError(409,'The retained seller identity or store closure needs review.');
 return {...e,generation:row.seller_generation};
}
/** Provider proof and PIN version come from the server, never client identity fields. */
export async function reactivateSeller(c:PoolClient,a:VerifiedActor,id:string,proof:{authUserId:string;sessionId:string;email:string},pinVersion:string|null){
 const e=await sellerReactivationTarget(c,a,id);
 if(proof.authUserId!==e.auth_user_id||proof.email!==e.invited_email)throw new ApiError(403,'Verify this seller’s own student identity.');
 if(!(await c.query(`select s.id from auth.sessions s where s.id=$1 and s.user_id=$2 and (s.not_after is null or s.not_after>clock_timestamp())
  and not exists(select 1 from private.account_access_epochs epoch where epoch.context_id=any(private.account_lineage($3)) and s.created_at<=epoch.valid_after)`,[proof.sessionId,proof.authUserId,e.linked_context_id])).rowCount)
  throw new ApiError(403,'The verified seller session is no longer eligible.');
 const key=(await c.query('select version,locked_until from private.portal_access_keys where context_id=$1 for update',[e.linked_context_id])).rows[0];
 if(key&&(String(key.version)!==pinVersion||key.locked_until&&new Date(key.locked_until).getTime()>Date.now()))throw new ApiError(403,'Verify the current seller portal PIN.');
 if(e.status==='pending_review')return{enrollmentId:e.id,status:'pending_review',alreadyReactivated:true};
 await c.query("select set_config('pinevela.seller_reactivation_session',$1,true),set_config('pinevela.seller_reactivation_enrollment',$2,true),set_config('pinevela.seller_reactivation_pin_version',$3,true)",[proof.sessionId,e.id,pinVersion||'']);
 await c.query("update public.account_contexts set status='pending',seller_generation=seller_generation+1,updated_at=clock_timestamp() where id=$1",[e.linked_context_id]);
 await c.query('delete from private.account_sessions where active_context_id=$1',[e.linked_context_id]);
 await c.query("update private.account_enrollments set status='pending_review',expires_at=clock_timestamp()+interval'24 hours' where id=$1",[e.id]);
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)values($1,'seller_reenrollment_verified','account_context',$2,$3)",[a.contextId,e.linked_context_id,JSON.stringify({enrollmentId:e.id,generation:e.generation+1})]);
 await notify(c,[a.contextId],{category:'verification',title:'Seller identity confirmed for re-registration',message:'Submit a new seller application. Previous approvals, stores and payments stay in your account history and do not activate this registration.',sender:a.contextId});
 return{enrollmentId:e.id,status:'pending_review',alreadyReactivated:false};
}
function checked(req:AuthRequest){if(Object.keys(req.query).length)throw new ApiError(400,'Identity selectors are not accepted.');const context=req.headers['x-pinevela-profile-context'];if(context!==undefined&&context!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Refresh registration.');}
export async function sendSellerReactivationCode(auth:SupabaseAuth,req:AuthRequest,res:any){
 checked(req);bodyFields(req.body||{},[]);const e=await auth.db.authorizedSystem(req.actor,['primary'],c=>sellerReactivationTarget(c,req.actor,req.params.id));
 await auth.provider('/otp',{email:e.invited_email,create_user:false});res.status(202).json({success:true,message:'A verification code or link was requested for your retained student email.'});
}
export async function confirmSellerReactivation(auth:SupabaseAuth,req:AuthRequest,res:any){
 checked(req);bodyFields(req.body,['password','code','portalPin']);
 const e=await auth.db.authorizedSystem(req.actor,['primary'],c=>sellerReactivationTarget(c,req.actor,req.params.id));
 if((req.body.code!==undefined&&typeof req.body.code!=='string')||(req.body.password!==undefined&&typeof req.body.password!=='string')||req.body.code&&req.body.password)throw new ApiError(400,'Use your student-email code or account password.');
 let session:any;
 if(req.body.code?.trim()){const challenge=managerEmailChallenge(req.body.code,signupProviderConfig().url);session=await auth.provider('/verify','token' in challenge?{...challenge,email:e.invited_email}:challenge);}
 else{if(typeof req.body.password!=='string'||req.body.password.length<8||req.body.password.length>256)throw new ApiError(400,'Enter your student-email code or existing account password.');session=await auth.provider('/token?grant_type=password',{email:e.invited_email,password:req.body.password});}
 try{const person=await auth.provider('/user',undefined,session.access_token),proof=verifiedClaims(session.access_token,person);
  if(proof.authUserId!==e.auth_user_id||String(person.email).toLowerCase()!==e.invited_email)throw new ApiError(403,'Verify this seller’s own student identity.');
  const pin=await auth.db.authorizedSystem(req.actor,['primary'],c=>checkPortalPin(c,e.linked_context_id,req.body.portalPin));
  if(!pin.allowed)throw new ApiError(403,'Enter the current seller portal PIN. After five failed attempts, wait 15 minutes.','portal_pin_required');
  const result=await auth.db.authorizedSystem(req.actor,['primary'],c=>reactivateSeller(c,req.actor,e.id,{...proof,email:String(person.email).toLowerCase()},pin.version),false,false,true);
  res.json({...result,verified:true,requiresSeparateLogin:true});
 }finally{if(session?.access_token)await auth.provider('/logout?scope=local',{},session.access_token).catch(()=>undefined);}
}
