import type {Express,RequestHandler} from 'express';import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';import {verifiedClaims,type AuthRequest,type SupabaseAuth} from './auth.js';
import {sendSellerReactivationCode} from './sellerReactivation.js';
import {ownedEnrollment} from './enrollment.js';import {bodyFields} from './adminSettings.js';
import {managerRegistrationRestricted,primaryManagerRegistrationRestricted} from './registrationRestrictions.js';
import {requireAccountAccess} from './accountAccess.js';import {notify} from './notifications.js';import {signupProviderConfig} from '../supabaseSignup.js';
export function managerEmailChallenge(value:unknown,providerUrl:string){
 if(typeof value!=='string'||value.length>4096)throw new ApiError(400,'Enter your work-email code or unopened sign-in link.');
 const code=value.trim();if(/^\d{6,10}$/.test(code))return{token:code,type:'email' as const};
 let url:URL;try{url=new URL(code);}catch{throw new ApiError(400,'Enter a valid work-email code or sign-in link.');}
 const token=url.searchParams.get('token')||url.searchParams.get('token_hash'),type=url.searchParams.get('type');
 if(url.origin!==providerUrl||url.pathname!=='/auth/v1/verify'||url.username||url.password||url.hash||!['email','magiclink'].includes(type||'')
  ||!/^[a-f0-9]{56,64}$/.test(token||'')||url.searchParams.getAll('type').length!==1||url.searchParams.getAll('token').length+url.searchParams.getAll('token_hash').length!==1)
  throw new ApiError(400,'Use the work-email sign-in link from PineVela’s configured provider.');
 return{token_hash:token!,type:type as 'email'|'magiclink'};
}
export async function managerReactivationTarget(c:PoolClient,a:VerifiedActor,id:string){
 if(a.kind!=='primary')throw new ApiError(403,'Use the original primary user account.');
 const e=await ownedEnrollment(c,a,id);
 if(e.kind!=='manager'||!e.auth_user_id||!e.linked_context_id||!e.verified_at||!(
  ['completed','cancelled','expired'].includes(e.status)&&e.context_status==='closed'||e.status==='pending_review'&&e.context_status==='pending'&&e.residence_id===null))
  throw new ApiError(409,'Only your closed verified manager identity can restart registration.');
 await requireAccountAccess(c,e.linked_context_id,['subaccounts']);
 if(await primaryManagerRegistrationRestricted(c,a.authUserId)||await managerRegistrationRestricted(c,e.linked_context_id))throw new ApiError(403,'Manager registration remains restricted until its existing cooldown expires.');
 const valid=(await c.query(`select c.id from public.account_contexts c join public.profiles p on p.id=c.auth_user_id join auth.users u on u.id=c.auth_user_id
  where c.id=$1 and c.kind='manager' and c.status=$5 and c.auth_user_id=$2 and c.primary_owner_id=$3 and p.primary_owner_id=$3
  and not u.is_anonymous and u.email_confirmed_at is not null and lower(u.email)=$4
  and not exists(select 1 from public.manager_assignments m where m.manager_context_id=c.id and m.ended_at is null)
  and not exists(select 1 from public.staff_assignments s where s.created_by_manager_id=c.id and s.status='active' and s.ended_at is null)
  and not exists(select 1 from public.verification_cases v join public.residences h on h.id=v.residence_id where v.applicant_context_id=c.id and h.status<>'closed') for update of c`,
  [e.linked_context_id,e.auth_user_id,a.authUserId,e.invited_email,e.context_status])).rowCount;
 if(!valid)throw new ApiError(409,'The retained manager identity or property dependencies need review.');return e;
}
/** Proof identifiers come only from Supabase /user and its verified JWT. */
export async function reactivateManager(c:PoolClient,a:VerifiedActor,id:string,proof:{authUserId:string;sessionId:string;email:string}){
 const e=await managerReactivationTarget(c,a,id);
 if(proof.authUserId!==e.auth_user_id||proof.email!==e.invited_email)throw new ApiError(403,'Confirm this manager’s own verified work identity.');
 if(!(await c.query('select id from auth.sessions where id=$1 and user_id=$2 and (not_after is null or not_after>clock_timestamp()) for share',[proof.sessionId,proof.authUserId])).rowCount)throw new ApiError(403,'Your verified work-email session has ended.');
 if(e.status==='pending_review')return{enrollmentId:e.id,status:'pending_review',alreadyReactivated:true};
 if(!(await c.query('select private.manager_reactivation_allowed($1,$2,$3) as allowed',[e.linked_context_id,e.id,proof.sessionId])).rows[0].allowed)throw new ApiError(409,'Resolve existing registration or closure reviews before re-enrollment.');
 await c.query("select set_config('pinevela.manager_reactivation_enrollment_id',$1,true),set_config('pinevela.manager_reactivation_proof_session',$2,true)",[e.id,proof.sessionId]);
 await c.query("update private.manager_closure_requests set state='withdrawn',decided_at=clock_timestamp() where manager_context_id=$1 and state='pending'",[e.linked_context_id]);
 await c.query("update private.manager_closure_requests set state='resolved' where manager_context_id=$1 and state='reviewing'",[e.linked_context_id]);
 await c.query("update public.account_contexts set status='pending',updated_at=clock_timestamp() where id=$1",[e.linked_context_id]);
 await c.query('delete from private.account_sessions where active_context_id=$1',[e.linked_context_id]);
 await c.query('update private.manager_operation_keys set key_hash=null,issued_at=null,failed_attempts=0,locked_until=null where manager_context_id=$1',[e.linked_context_id]);
 await c.query("update private.account_enrollments set status='pending_review',verified_at=clock_timestamp(),expires_at=clock_timestamp()+interval'24 hours',residence_id=null,room_id=null,manager_generation=manager_generation+1 where id=$1",[e.id]);
 await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)values($1,'manager_reenrollment_verified','account_context',$2,$3)",[a.contextId,e.linked_context_id,JSON.stringify({enrollmentId:e.id,generation:e.manager_generation+1})]);
 await notify(c,[a.contextId],{category:'verification',title:'Manager work identity confirmed for re-registration',message:'Your retained manager work identity is verified. Submit a new residence for physical inspection. Previous approvals and manager keys do not activate the new registration.',sender:a.contextId});
 return{enrollmentId:e.id,status:'pending_review',alreadyReactivated:false};
}
function checked(req:AuthRequest){if(Object.keys(req.query).length)throw new ApiError(400,'Identity selectors are not accepted.');const context=req.headers['x-pinevela-profile-context'];if(context!==undefined&&context!==req.actor.contextId)throw new ApiError(409,'Your active account changed. Refresh registration.');}
export async function confirmManagerReactivation(auth:SupabaseAuth,req:AuthRequest,res:any){
 checked(req);bodyFields(req.body,['password','code']);const record=await auth.db.authorizedSystem(req.actor,['primary'],c=>managerReactivationTarget(c,req.actor,req.params.id));
 if((req.body.code!==undefined&&typeof req.body.code!=='string')||(req.body.password!==undefined&&typeof req.body.password!=='string'))throw new ApiError(400,'Enter a text code or password.');
 if(req.body.code&&req.body.password)throw new ApiError(400,'Use your email code or your work-account password.');
 let session:any;
 if(typeof req.body.code==='string'&&req.body.code.trim()){const challenge=managerEmailChallenge(req.body.code,signupProviderConfig().url);session=await auth.provider('/verify','token' in challenge?{...challenge,email:record.invited_email}:challenge);}
 else{if(typeof req.body.password!=='string'||req.body.password.length<8||req.body.password.length>256)throw new ApiError(400,'Enter the work-email code or this account’s existing email password.');session=await auth.provider('/token?grant_type=password',{email:record.invited_email,password:req.body.password});}
 try{const person=await auth.provider('/user',undefined,session.access_token),proof=verifiedClaims(session.access_token,person);
  const result=await auth.db.authorizedSystem(req.actor,['primary'],c=>reactivateManager(c,req.actor,record.id,{...proof,email:String(person.email).toLowerCase()}),false,false,true);
  res.json({...result,verified:true,requiresSeparateLogin:true});
 }finally{if(session?.access_token)await auth.provider('/logout?scope=local',{},session.access_token).catch(()=>undefined);}
}
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
export function installManagerReactivation(app:Express,auth:SupabaseAuth){
 app.post('/api/auth/enrollments/:id/reactivate/send-code',auth.require(['primary']),route(async(req,res)=>{
  checked(req);bodyFields(req.body||{},[]);const owned=await auth.db.authorizedSystem(req.actor,['primary'],c=>ownedEnrollment(c,req.actor,req.params.id));
  if(owned.kind==='seller')return sendSellerReactivationCode(auth,req,res);
  const record=await auth.db.authorizedSystem(req.actor,['primary'],c=>managerReactivationTarget(c,req.actor,req.params.id));
  // Supabase creates no new identity; recipient comes only from the owned record.
  await auth.provider('/otp',{email:record.invited_email,create_user:false});res.status(202).json({success:true,message:'A sign-in code or link was requested for your retained manager work email. Copy the code or unopened link here.'});
 }));
}
