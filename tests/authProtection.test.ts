import assert from 'node:assert/strict';
import test from 'node:test';
import {authRequestContext,captchaProviderBody,publicCaptchaConfig} from '../supabase/authProtection.js';
import {emailResendDelay} from '../emailOtp.js';

test('resend delivery schedule increases and stays capped',()=>{
 assert.deepEqual([1,2,3,4,5,6,20].map(emailResendDelay),[300,600,1200,3600,7200,7200,7200]);
});
test('configured CAPTCHA fails closed and only forwards to protected provider operations',()=>{
 const prior=process.env.AUTH_CAPTCHA_SITE_KEY;
 try{
  delete process.env.AUTH_CAPTCHA_SITE_KEY;assert.deepEqual(publicCaptchaConfig(),{enabled:false});
  process.env.AUTH_CAPTCHA_SITE_KEY='0x4AAAAAAFhbgeiaDBCNBvdK';
  assert.deepEqual(Object.keys(publicCaptchaConfig()).sort(),['enabled','provider','siteKey']);
  for(const route of ['/signup','/resend','/recover','/otp','/token?grant_type=password'])
   assert.throws(()=>captchaProviderBody(route,{email:'validation@example.test'}),(error:any)=>error.status===400&&error.code==='captcha_required');
  const body={type:'email'};
  assert.equal(captchaProviderBody('/verify',body),body,'OTP confirmation is a separate native proof');
  authRequestContext.run({ip:'127.0.0.1',captchaToken:'transport-shape-only',captchaClaimed:true},()=>{
   const forwarded=captchaProviderBody('/signup',body) as any;
   assert.deepEqual(forwarded.gotrue_meta_security,{captcha_token:'transport-shape-only'});
   assert.equal(captchaProviderBody('/user',body),body);
   assert.throws(()=>captchaProviderBody('/recover',body),(error:any)=>error.code==='captcha_failed','One HTTP request cannot forward the same proof twice');
  });
  authRequestContext.run({ip:'127.0.0.1',captchaToken:'unclaimed-transport-shape'},()=>
   assert.throws(()=>captchaProviderBody('/signup',body),(error:any)=>error.code==='captcha_failed','An unclaimed proof cannot bypass durable admission'));
  assert.throws(()=>captchaProviderBody('/signup',body),(error:any)=>error.code==='captcha_required','Proofs cannot leak into another request');
  process.env.AUTH_CAPTCHA_SITE_KEY='invalid key';assert.throws(publicCaptchaConfig,(error:any)=>error.status===503);
 }finally{if(prior===undefined)delete process.env.AUTH_CAPTCHA_SITE_KEY;else process.env.AUTH_CAPTCHA_SITE_KEY=prior;}
});
