/** Real local GoTrue recovery email, submitted numeric OTP and password re-entry.
 * Starts no service and refuses remote metadata through the shared harness. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createLocalPrimary,runLocalSupabaseVerification,type LocalSupabaseHarness} from './lib/local-supabase-harness.js';

let checks=0,stage='owned local stack';
const check=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;};
async function capturedRecovery(h:LocalSupabaseHarness,email:string,after:number){
 const deadline=Date.now()+30000;
 while(Date.now()<deadline){
  const response=await fetch(h.meta.mailUrl+'/api/v1/messages',{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200);const listing=await response.json();
  for(const message of Array.isArray(listing?.messages)?listing.messages:[]){
   if(!Array.isArray(message.To)||!message.To.some((to:any)=>String(to.Address||'').toLowerCase()===email)
    ||Date.parse(message.Created)<after-1000||!/^[-a-zA-Z0-9]+$/.test(message.ID||''))continue;
   const detail=await fetch(h.meta.mailUrl+'/api/v1/message/'+encodeURIComponent(message.ID),{signal:AbortSignal.timeout(5000)});
   assert.equal(detail.status,200);const full=await detail.json(),html=String(full?.HTML||'');
   if(!/Reset your PineVela password/i.test(html))continue;
   const codes=[...html.matchAll(/>\s*(\d{6,10})\s*</g)].map(match=>match[1]);
   assert.equal(new Set(codes).size,1,'The actual rendered email contains exactly one numeric OTP');
   return{html,code:codes[0]};
  }
  await new Promise(resolve=>setTimeout(resolve,200));
 }
 throw Error('The real local recovery email did not arrive.');
}
async function verify(h:LocalSupabaseHarness){
 await h.assertOwned();stage='actual signup and confirmed local identities';
 const owner=await createLocalPrimary(h,'recovery-owner'),other=await createLocalPrimary(h,'recovery-other');
 check(owner.user.id!==other.user.id,'Two actual captured-email-confirmed identities have separate primary profiles');
 const email=owner.credentials.email,newPassword=crypto.randomBytes(30).toString('base64url')+'bB2!';
 const stranger=h.session(),oldSession=owner.session.copy(),otherSession=other.session.copy();
 const before=(await h.db.pool.query('select id,email,encrypted_password from auth.users where email=$1',[email])).rows[0];
 check(!!before?.encrypted_password,'The real owner has a native password hash before recovery');

 stage='recovery request boundaries';
 check((await stranger.json('/api/auth/recover',{email:'invalid'})).status===400,'Malformed mailbox is rejected');
 check((await stranger.json('/api/auth/recover',{email,userId:before.id})).status===400,'Client identity selectors cannot choose recovery ownership');
 const started=Date.now(),request=await stranger.json('/api/auth/recover',{email});
 check(request.status===202&&request.data?.success===true,'The real provider accepts the local recovery request');
 check(!request.headers.has('set-cookie'),'Requesting a recovery email grants no application session');
 const delivered=await capturedRecovery(h,email,started);
 check(/^\d{8}$/.test(delivered.code),'Actual GoTrue substitutes its configured eight-digit OTP into the template');
 check(!/<a\b|\bhref\s*=|\/auth\/v1\/verify|ConfirmationURL|TokenHash|\{\{\s*\.Token\s*\}\}/i.test(delivered.html),
  'The actual delivered HTML contains the rendered code and no recovery link or unresolved template secret');
 check(/pinevela-logo\.png/.test(delivered.html),'The actual recovery email retains the PineVela logo');
 const proof=(await h.db.pool.query('select recovery_token,recovery_sent_at from auth.users where id=$1',[before.id])).rows[0];
 check(!!proof.recovery_sent_at&&proof.recovery_token!==delivered.code&&!!proof.recovery_token,
  'The provider records its own recovery request and stores a hash rather than the emailed OTP');

 stage='wrong mailbox, wrong proof type and invalid fields';
 const unchanged=async()=> (await h.db.pool.query('select encrypted_password from auth.users where id=$1',[before.id])).rows[0].encrypted_password===before.encrypted_password;
 const wrongMailbox=await stranger.json('/api/auth/recover/complete',{email:other.credentials.email,code:delivered.code,newPassword});
 check(wrongMailbox.status>=400&&wrongMailbox.status<500&&!wrongMailbox.headers.has('set-cookie'),
  'One mailbox recovery code cannot change another identity or create a cookie');
 check(await unchanged(),'Wrong-mailbox recovery leaves the owner password unchanged');
 check((await otherSession.request('/api/auth/me')).data?.id===other.user.id,'Rejected cross-account recovery preserves the other session');
 const wrongCode=delivered.code==='00000000'?'11111111':'00000000';
 check((await stranger.json('/api/auth/recover/complete',{email,code:wrongCode,newPassword})).status===400,
  'An incorrect numeric recovery code is rejected');
 check((await stranger.json('/api/auth/recover/complete',{email,code:'1234',newPassword})).status===400,
  'A truncated recovery code is rejected');
 check((await stranger.json('/api/auth/recover/complete',{email,code:delivered.code,newPassword:'short'})).status===400,
  'A weak new password is rejected before the valid proof is consumed');
 check((await stranger.json('/api/auth/recover/complete',{email,code:delivered.code,newPassword,userId:before.id})).status===400,
  'Extra account selectors are rejected before the valid proof is consumed');
 const wrongTypeReply=await fetch(h.providerOrigin+'/auth/v1/verify',{method:'POST',headers:{apikey:h.meta.anonKey,'content-type':'application/json'},
  body:JSON.stringify({email,token:delivered.code,type:'signup'}),signal:AbortSignal.timeout(10000)});
 const wrongType=await wrongTypeReply.json();
 check(wrongTypeReply.status>=400&&wrongTypeReply.status<500&&!wrongType.access_token,
  'A recovery OTP cannot be exchanged as signup proof in the actual native provider');
 check(await unchanged(),'Rejected fields and proof types leave the password unchanged');

 stage='code-only password replacement and single-use proof';
 const completed=await stranger.json('/api/auth/recover/complete',{email:'  '+email.toUpperCase()+'  ',code:delivered.code,newPassword});
 check(completed.status===200&&completed.data?.success===true&&completed.data?.signInRequired===true,
  'The real emailed numeric code changes the password and requires a separate sign-in');
 check(!completed.headers.has('set-cookie'),'Recovery grants no application session or portal access');
 const after=(await h.db.pool.query('select id,email,encrypted_password from auth.users where id=$1',[before.id])).rows[0];
 check(after.id===before.id&&after.email===email&&after.encrypted_password!==before.encrypted_password,
  'The provider changes only the password of the verified original identity');
 check((await h.db.pool.query('select count(*)::int as count from private.account_sessions where auth_user_id=$1',[before.id])).rows[0].count===0,
  'Successful recovery revokes all application bindings for that identity');
 const replay=await stranger.json('/api/auth/recover/complete',{email,code:delivered.code,newPassword:newPassword+'another'});
 check(replay.status===400&&!replay.headers.has('set-cookie'),'Reusing the actual recovery OTP is rejected');
 check((await h.db.pool.query('select encrypted_password from auth.users where id=$1',[before.id])).rows[0].encrypted_password===after.encrypted_password,
  'OTP replay cannot replace the saved password again');
 check((await oldSession.request('/api/auth/me')).status===401,'The original owner application session cannot be replayed after recovery');
 check((await otherSession.request('/api/auth/me')).data?.id===other.user.id,'Another identity remains signed in after owner recovery');
 check((await h.db.pool.query("select count(*)::int as count from private.audit_events where event_type='email_password_changed' and resource_id=$1",[before.id])).rows[0].count===1,
  'Exactly one successful password-change audit event is recorded');

 stage='old password rejection and new password sign-out and re-entry';
 const oldPasswordReply=await h.session().json('/api/auth/login',{email,password:owner.credentials.password});
 check(oldPasswordReply.status===401&&!oldPasswordReply.headers.has('set-cookie'),'The old password cannot sign in after recovery');
 const fresh=h.session(),login=await fresh.json('/api/auth/login',{email,password:newPassword});
 check(login.status===200&&login.data?.id===owner.user.id,'The new password signs into the same primary account');
 check((await fresh.request('/api/auth/me')).data?.id===owner.user.id,'The new password receives its own working app session');
 const revoked=fresh.copy();
 check((await fresh.json('/api/auth/logout',{})).status===200,'The recovered identity can sign out normally');
 check((await revoked.request('/api/auth/me')).status===401,'The new session cannot be replayed after sign-out');
 const reentry=h.session();
 check((await reentry.json('/api/auth/login',{email,password:newPassword})).data?.id===owner.user.id,
  'The recovered password signs in again after sign-out');
 check((await h.session().json('/api/auth/login',{email:other.credentials.email,password:other.credentials.password})).data?.id===other.user.id,
  'The unrelated identity retains its original password');
 await h.assertOwned();
 check((await h.db.pool.query('select count(*)::int as count from auth.users')).rows[0].count===2,
  'Only the two explicitly owned real local test identities exist');
 const result={passed:true,checks,actualGoTrue:true,actualCapturedEmail:true,actualTemplate:'emails/reset-password.html',
  actualOtpLength:delivered.code.length,tokenOnlyEmail:true,wrongMailboxRejected:true,wrongProofTypeRejected:true,
  otpReplayRejected:true,oldPasswordRejected:true,newPasswordLoginAfterLogout:true,crossAccountIsolation:true,
  recoveryCreatesAppSession:false,cloudRecordsModified:0,externalEmailsSent:0,fabricatedProviderReplies:0};
 fs.writeFileSync(path.join(h.meta.root,'pinevela-harness','recovery-code-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(result));
}
try{await runLocalSupabaseVerification(verify);}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Owned real recovery verification failed; private worker diagnostics retained.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;
 process.exitCode=1;
}
