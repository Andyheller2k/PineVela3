import type { SupabaseAuth } from './auth.js';
import { requireConfirmationSettings } from '../supabaseSignup.js';
import { signupVerificationId, withSignupEmailCooldown } from './signupEmails.js';

/** An unfinished registration is resumed, never overwritten before email proof. */
export async function requestPrimarySignup(auth:Pick<SupabaseAuth,'db'|'provider'>,name:string,email:string,password:string){
  const delivery=await withSignupEmailCooldown(auth.db,email,async({pendingSignupId})=>{
    requireConfirmationSettings(await auth.provider('/settings'));
    if(pendingSignupId){
      await auth.provider('/resend',{type:'signup',email});
      return {signupId:pendingSignupId,resumed:true};
    }
    const data=await auth.provider('/signup',{email,password,data:{name}});
    return {signupId:signupVerificationId(data,email),resumed:false};
  },{registration:true});
  return {...delivery.value,verificationRequired:true,retryAfter:delivery.retryAfter};
}
