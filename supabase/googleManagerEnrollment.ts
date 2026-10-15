import crypto from 'node:crypto';
import type {Express,Request,RequestHandler} from 'express';
import type {PoolClient} from 'pg';
import {ApiError,type VerifiedActor} from './db.js';
import {verifiedClaims,type SupabaseAuth,type AuthRequest} from './auth.js';
import {googleIdentity,googlePublicOrigin} from '../googleAuth.js';
import {signupProviderConfig} from '../supabaseSignup.js';
import {ownedEnrollment,reserveEnrollment,finishEnrollment,type EnrollmentInput} from './enrollment.js';
import {checkProfileContext} from './profiles.js';
import {primaryManagerRegistrationRestricted} from './registrationRestrictions.js';

/** A server-selected local development policy, never a body/query/VITE flag. */
export function googleManagerDevelopmentEnabled(req:Pick<Request,'get'|'socket'>,env:NodeJS.ProcessEnv=process.env) {
  if(env.NODE_ENV==='production'||env.PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT!=='true'||env.PINEVELA_PUBLIC_ORIGIN)return false;
  try{
    const host=req.get('host'),url=new URL(`http://${host}`);
    return !!host&&url.host===host.toLowerCase()&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)
      &&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress||'');
  }catch{return false;}
}
export function googleManagerInput(body:any):EnrollmentInput {
  const name=typeof body?.name==='string'?body.name.trim():'',phone=typeof body?.phone==='string'?body.phone.trim():'';
  const email=typeof body?.email==='string'?body.email.trim().toLowerCase():'';
  if(body?.kind!=='manager'||!name||name.length>120||!phone||phone.length>40||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new ApiError(400,'Enter your manager name, contact phone and separate Google account email.');
  // No password, owner, role or verification claims are accepted from the form.
  return {kind:'manager',name,phone,email,password:''};
}
/** Called after real server-side PKCE /user verification, inside a live primary
 * transaction. Native Google identity/session checks also protect this boundary. */
export async function completeGoogleManagerEnrollment(c:PoolClient,actor:VerifiedActor,id:string,nonce:string,proof:{authUserId:string;sessionId:string;email:string}) {
  const e=await ownedEnrollment(c,actor,id);
  if(e.kind!=='manager'||e.enrollment_fields?.authentication!=='google'||e.invited_email!==proof.email||
    typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce)||crypto.createHash('sha256').update(nonce).digest('hex')!==e.token_digest)
    throw new ApiError(403,'This Google sign-in does not match your manager enrollment.');
  if(await primaryManagerRegistrationRestricted(c,actor.authUserId))throw new ApiError(403,'Manager registration is currently restricted.');
  const verified=(await c.query(`select u.id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=$1 and lower(u.email)=$2 and not u.is_anonymous and u.email_confirmed_at is not null
      and s.id=$3 and(s.not_after is null or s.not_after>clock_timestamp())
      and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
        and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))`,
    [proof.authUserId,e.invited_email,proof.sessionId])).rowCount;
  if(!verified)throw new ApiError(403,'A live verified Google account is required.');
  if(e.auth_user_id){
    if(e.auth_user_id!==proof.authUserId||!['pending_review','completed'].includes(e.status))throw new ApiError(409,'This enrollment has already changed.');
    return finishEnrollment(c,actor,id,proof);
  }
  if(e.status!=='pending_email'||new Date(e.expires_at).getTime()<=Date.now())throw new ApiError(409,'This manager enrollment is no longer awaiting Google verification.');
  if((await c.query(`select 1 from public.profiles where id=$1 union all select 1 from public.account_contexts where auth_user_id=$1
    union all select 1 from private.account_enrollments where auth_user_id=$1`,[proof.authUserId])).rowCount)
    throw new ApiError(409,'Use a separate Google identity without an existing PineVela account. Existing users and administrators cannot be converted.');
  await c.query('select private.initialize_auth_profile($1,$2)',[proof.authUserId,nonce]);
  const result=await finishEnrollment(c,actor,id,proof);
  await c.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values($1,'google_manager_identity_verified','account_enrollment',$2,$3)`,[actor.contextId,id,JSON.stringify({authentication:'google',developmentEnrollment:true})]);
  return result;
}

type Flow={actor:VerifiedActor;enrollmentId:string;nonce:string;verifier:string;email:string;origin:string;expires:number};
const cookieName='pv_google_manager_flow';
const cookieOptions={httpOnly:true,secure:false,sameSite:'lax' as const,path:'/api/auth/google/callback'};
export function installGoogleManagerEnrollment(app:Express,auth:SupabaseAuth) {
  const flows=new Map<string,Flow>();
  const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
  app.get('/api/auth/enrollments/policy',auth.require(['primary']),route(async(req,res)=>{
    checkProfileContext(req.actor,req.headers['x-pinevela-profile-context']);
    res.json({googleManagerEnrollment:googleManagerDevelopmentEnabled(req)});
  }));
  app.post('/api/auth/enrollments/google/start',auth.require(['primary']),route(async(req,res)=>{
    checkProfileContext(req.actor,req.headers['x-pinevela-profile-context']);
    if(!googleManagerDevelopmentEnabled(req))throw new ApiError(403,'Google manager development enrollment is not enabled.');
    const input=googleManagerInput(req.body),origin=googlePublicOrigin(req),config=signupProviderConfig();
    const settings=await auth.provider('/settings');
    if(settings.external?.google!==true)throw new ApiError(503,'Google sign-in is not configured.');
    for(const [key,flow]of flows)if(flow.expires<=Date.now())flows.delete(key);
    if(flows.size>=250)throw new ApiError(429,'Please wait before starting another Google verification.');
    for(const [key,flow]of flows)if(flow.actor.contextId===req.actor.contextId){
      const previous=await auth.db.authorizedSystem(req.actor,['primary'],c=>ownedEnrollment(c,req.actor,flow.enrollmentId));
      if(previous.status==='pending_email')throw new ApiError(409,'Finish or cancel the current Google verification before retrying.');
      flows.delete(key);
    }
    const state='manager_'+crypto.randomBytes(32).toString('base64url'),nonce=crypto.randomBytes(32).toString('hex'),verifier=crypto.randomBytes(48).toString('base64url');
    const id=await auth.db.authorizedSystem(req.actor,['primary'],c=>reserveEnrollment(c,req.actor,input,nonce,undefined,true));
    flows.set(state,{actor:req.actor,enrollmentId:id,nonce,verifier,email:input.email,origin,expires:Date.now()+5*60000});
    const url=new URL(`${config.url}/auth/v1/authorize`);
    for(const [key,value]of Object.entries({provider:'google',scopes:'openid email profile',prompt:'select_account',login_hint:input.email,
      redirect_to:`${origin}/api/auth/google/callback?state=${state}`,code_challenge:crypto.createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'s256'}))url.searchParams.set(key,value);
    res.cookie(cookieName,state,{...cookieOptions,maxAge:5*60000});
    return res.status(202).json({enrollmentId:id,url:url.toString(),verificationRequired:true,authentication:'google'});
  }));
  // Installed before ordinary Google auth. Same configured callback URL, separate
  // state/cookie/PKCE namespace. Never replaces the primary authentication cookies.
  app.get('/api/auth/google/callback',(req,res,next)=>{
    const state=typeof req.query.state==='string'?req.query.state:'';
    if(!/^manager_[A-Za-z0-9_-]{43}$/.test(state))return next();
    res.set({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    const flow=flows.get(state),cookie=String(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    if(!flow||cookie!==state||flow.expires<=Date.now()||!googleManagerDevelopmentEnabled(req))
      return res.redirect(303,'/#/manager-google-result?result=failed');
    flows.delete(state);res.clearCookie(cookieName,cookieOptions);
    void(async()=>{
      let accessToken:string|undefined;
      try{
        if(req.query.error||typeof req.query.code!=='string'||!/^[a-zA-Z0-9_-]{1,256}$/.test(req.query.code))throw new ApiError(400,'Google sign-in did not complete.');
        const session=await auth.provider('/token?grant_type=pkce',{auth_code:req.query.code,code_verifier:flow.verifier});accessToken=session.access_token;
        if(!accessToken)throw new ApiError(401,'Google identity could not be verified.');
        const user=await auth.provider('/user',undefined,accessToken),google=googleIdentity(user),identity=verifiedClaims(accessToken,user);
        if(google.id!==identity.authUserId||google.email!==flow.email)throw new ApiError(403,'Choose the Google account entered in your manager registration.');
        await auth.db.authorizedSystem(flow.actor,['primary'],c=>completeGoogleManagerEnrollment(c,flow.actor,flow.enrollmentId,flow.nonce,{...identity,email:google.email}));
        return res.redirect(303,`${flow.origin}/#/manager-google-result?result=verified&enrollment=${encodeURIComponent(flow.enrollmentId)}`);
      }catch{
        // Never expose provider errors, codes, sessions, nonces or tokens.
        return res.redirect(303,`${flow.origin}/#/manager-google-result?result=failed&enrollment=${encodeURIComponent(flow.enrollmentId)}`);
      }finally{if(accessToken)await auth.provider('/logout?scope=local',{},accessToken).catch(()=>undefined);}
    })().catch(next);
  });
}
