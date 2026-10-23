import {AsyncLocalStorage} from 'node:async_hooks';
import type {RequestHandler} from 'express';
import {ApiError,type SupabaseDatabase} from './db.js';
import {captchaProof,claimCaptchaProof,captchaReplayError} from './captchaProofs.js';

export const authRequestContext=new AsyncLocalStorage<{ip:string;captchaToken?:string;captchaClaimed?:boolean;captchaForwarded?:boolean}>();
export function publicCaptchaConfig(){
 const siteKey=process.env.AUTH_CAPTCHA_SITE_KEY?.trim();
 if(!siteKey)return {enabled:false as const};
 if(!/^[a-zA-Z0-9_-]{3,256}$/.test(siteKey))throw new ApiError(503,'Security verification is temporarily unavailable.');
 return {enabled:true as const,provider:'turnstile' as const,siteKey};
}
/** Isolate transport-only security proof before strict workflow field checks.
 * Supabase, using a public Auth key, verifies the proof with the secret it holds. */
export const authProtectionContext=(db:SupabaseDatabase):RequestHandler=>(req,_res,next)=>{
 let captchaToken:string|undefined;
 if(req.body&&typeof req.body==='object'&&!Array.isArray(req.body)&&Object.hasOwn(req.body,'captchaToken')){
  try{captchaToken=captchaProof(req.body.captchaToken);}catch(error){next(error);return;}
  delete req.body.captchaToken;
 }
 const ip=req.ip||req.socket.remoteAddress||'unknown';
 if(!captchaToken){authRequestContext.run({ip},next);return;}
 // Every protected workflow lives in Auth or one of these login aliases.
 // Optional metadata on unrelated API traffic must not fill the proof ledger.
 const path=req.path.toLowerCase();
 if(req.method!=='POST'||!(/^\/auth\//.test(path)||['/digital-market/login','/verification-teams/login'].includes(path))){
  next(new ApiError(400,'Security verification is not accepted for this request.','captcha_required'));return;
 }
 // Admission is committed before next() enters workflows which may already
 // hold database transactions (signup/resend cooldowns in particular).
 claimCaptchaProof(db,captchaToken).then(()=>authRequestContext.run({ip,captchaToken,captchaClaimed:true},next),next);
};
export function captchaProviderBody(route:string,body:unknown){
 const protectedRoute=['/signup','/resend','/recover','/otp','/token?grant_type=password'].includes(route);
 if(!protectedRoute)return body;
 const context=authRequestContext.getStore(),token=context?.captchaToken;
 if(publicCaptchaConfig().enabled&&!token)throw new ApiError(400,'Complete the security verification before continuing.','captcha_required');
 if(token){
  if(!context?.captchaClaimed||context.captchaForwarded)throw captchaReplayError();
  context.captchaForwarded=true;
 }
 return token?{...(body as object),gotrue_meta_security:{captcha_token:token}}:body;
}
