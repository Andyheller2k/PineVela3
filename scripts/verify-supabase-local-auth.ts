/** Actual local GoTrue + captured confirmation mail + unchanged PineVela HTTP
 * auth. Dummy identities exist only in the separately owned disposable stack. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {runLocalSupabaseVerification,type LocalSupabaseHarness} from './lib/local-supabase-harness.js';

let checks=0,stage='isolated startup';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function verify(h:LocalSupabaseHarness){
 const suffix=h.meta.runId.replaceAll('-','');
 const email='founder-'+suffix+'@pinevela.test',password=crypto.randomBytes(30).toString('base64url')+'aA1!';
 const credentialsFile=path.join(h.meta.root,'pinevela-harness','auth-smoke-credentials.json');
 const fd=fs.openSync(credentialsFile,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,JSON.stringify({runId:h.meta.runId,email,password}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 const guest=h.session(),user=h.session();
 stage='guest and request boundaries';
 check((await guest.request('/api/auth/me')).status===401,'No cookie cannot authenticate');
 check((await guest.request('/api/auth/me',{headers:{authorization:'Bearer invalid'}})).status===401,'Bearer-only input cannot replace the cookie session');
 check((await guest.request('/api/auth/me',{headers:{cookie:'pv_sb_access=invalid; pv_sb_access=another'}})).status===401,'Duplicate access cookies are rejected');
 check((await guest.json('/api/auth/login',{})).status===400,'Empty native login fields are rejected');
 check((await guest.request('/api/auth/login',{method:'POST',headers:{origin:'https://untrusted.invalid','content-type':'application/json'},body:'{}'})).status===403,'Cross-origin login is rejected');

 stage='real signup and local mail';const started=Date.now();
 const signup=await user.json('/api/auth/register-unified',{name:'Local Auth Founder',email,password,role:'admin',userId:crypto.randomUUID()});
 check(signup.status===202&&signup.data?.verificationRequired===true,'Real GoTrue signup requires email confirmation');
 check(typeof signup.data?.signupId==='string','Actual provider returns the new Auth UUID');
 check(!signup.headers.has('set-cookie'),'Unconfirmed signup creates no app session cookie');
 check((await user.json('/api/auth/login',{email,password})).status===401,'Actual unconfirmed GoTrue identity cannot sign in');
 const confirmation=await h.mail.confirmation(email,started);
 const verified=await user.json('/api/auth/verify-unified',{email,signupId:signup.data.signupId,code:h.providerOrigin+confirmation});
 check(verified.status===200&&verified.data?.verified===true,'The actual locally delivered confirmation proves email ownership');
 check(verified.data?.user?.role==='user','Client-supplied signup role does not grant administrator authority');
 check(verified.headers.getSetCookie().filter(c=>c.startsWith('pv_sb_')).length===2,'Native app issues both HTTP-only session cookies');
 check(verified.headers.getSetCookie().filter(c=>c.startsWith('pv_sb_')).every(c=>/httponly/i.test(c)&&/samesite=strict/i.test(c)),'Actual cookies retain HttpOnly and SameSite Strict');
 const me=await user.request('/api/auth/me');
 check(me.status===200&&me.data?.email===email&&me.data?.role==='user','Verified local session reaches its real primary profile');
 check((await user.request('/api/admin/governance')).status===403,'A verified primary cannot enter administrator governance');
 check((await user.json('/api/auth/context',{contextId:crypto.randomUUID(),role:'admin'})).status===403,'Client context selectors cannot manufacture administrator ownership');
 const native=(await h.db.pool.query(`select u.id,u.email_confirmed_at,s.id as session_id
  from auth.users u join auth.sessions s on s.user_id=u.id join private.account_sessions b on b.session_id=s.id
  where u.id=$1 and b.active_context_id=$2`,[signup.data.signupId,me.data.id])).rows;
 check(native.length===1&&native[0].email_confirmed_at,'Actual GoTrue Auth/session rows match the live app binding');

 stage='primary password sign-in after sign-out';
 const firstLogin=h.session();
 const passwordLogin=await firstLogin.json('/api/auth/login',{usernameOrEmail:email,password});
 check(passwordLogin.status===200&&passwordLogin.data?.id===me.data.id&&passwordLogin.data?.role==='user',
  'A freshly confirmed primary can sign in with its saved email and password');
 check((await firstLogin.request('/api/auth/me')).data?.id===me.data.id,'The password sign-in has its own working cookie session');
 const firstReplay=firstLogin.copy();
 const beforeLogout=(await h.db.pool.query('select id,email_confirmed_at,encrypted_password from auth.users where id=$1',[signup.data.signupId])).rows[0];
 const logout=await firstLogin.json('/api/auth/logout',{});
 check(logout.status===200&&logout.data?.success===true,'The password session signs out successfully');
 check(logout.headers.getSetCookie().filter(cookie=>cookie.startsWith('pv_sb_')&&cookie.split(';',1)[0].endsWith('=')
  &&(/max-age=0/i.test(cookie)||Date.parse(cookie.match(/(?:^|;)\s*expires=([^;]+)/i)?.[1]||'')<Date.now())).length===2,
  'Sign-out expires both actual application cookies');
 check((await firstLogin.request('/api/auth/me')).status===401,'The signed-out browser cookie jar cannot authenticate');
 check((await firstReplay.request('/api/auth/me')).status===401,'Replaying the old password-session cookies cannot authenticate');
 const afterLogout=(await h.db.pool.query('select id,email_confirmed_at,encrypted_password from auth.users where id=$1',[signup.data.signupId])).rows[0];
 check(afterLogout?.id===beforeLogout.id&&String(afterLogout.email_confirmed_at)===String(beforeLogout.email_confirmed_at)
  &&afterLogout.encrypted_password===beforeLogout.encrypted_password,'Sign-out preserves the verified identity and saved password hash');
 const wrongPassword=await guest.json('/api/auth/login',{usernameOrEmail:email,password:password+'wrong'});
 check(wrongPassword.status===401&&!wrongPassword.headers.has('set-cookie'),'An incorrect password cannot reopen the signed-out account');
 const reentry=h.session();
 const repeatedLogin=await reentry.json('/api/auth/login',{usernameOrEmail:'  '+email.toUpperCase()+'  ',password});
 check(repeatedLogin.status===200&&repeatedLogin.data?.id===me.data.id&&repeatedLogin.data?.email===email
  &&repeatedLogin.data?.role==='user','The same email and password sign in again after logout, including email case/whitespace normalization');
 check(repeatedLogin.headers.getSetCookie().filter(cookie=>cookie.startsWith('pv_sb_')&&/httponly/i.test(cookie)).length===2,
  'Signing back in issues a new pair of HTTP-only session cookies');
 check((await reentry.request('/api/auth/me')).data?.id===me.data.id,'The new password session reaches the original primary profile');
 check((await firstReplay.request('/api/auth/me')).status===401,'The new login does not restore the revoked old cookie session');
 check((await user.request('/api/auth/me')).status===200,'Signing out one session preserves the independently verified session');
 const duplicate=await guest.json('/api/auth/register-unified',{name:'Repeated registration',email,password});
 check(duplicate.status===409&&duplicate.data?.code==='email_already_registered'&&!duplicate.headers.has('set-cookie'),
  'The duplicate-registration guard remains separate from successful password re-entry');
 check((await reentry.request('/api/auth/me')).status===200,'Rejected duplicate registration does not disturb the signed-in account');
 const reentryReplay=reentry.copy();
 check((await reentry.json('/api/auth/logout',{})).status===200,'The reopened primary account can sign out again');
 check((await reentryReplay.request('/api/auth/me')).status===401,'Replaying the reopened session after its logout is also denied');

 stage='local founder fixture and native role admission';
 const founderId=await h.bootstrapFounder(user),admin=h.session();
 check((await user.request('/api/auth/me')).data?.role==='user','Fixture creation does not mutate the already bound primary session');
 const adminLogin=await admin.json('/api/auth/login',{email,password,accountKind:'admin'});
 check(adminLogin.status===200&&adminLogin.data?.id===founderId&&adminLogin.data?.role==='admin','Actual GoTrue password login binds the owned native founder context');
 const governance=await admin.request('/api/admin/governance');
 check(governance.status===200&&governance.data?.currentId===founderId,'The real administrator role guard admits its native owner');
 check((await guest.request('/api/admin/governance')).status===401,'Administrator fixture grants no guest access');

 stage='actual logout and revoked replay';const replay=admin.copy();
 check((await admin.json('/api/auth/logout',{})).status===200,'Native logout succeeds');
 check((await admin.request('/api/auth/me')).status===401,'Logged-out cookie jar cannot authenticate');
 check((await replay.request('/api/auth/me')).status===401,'Replaying actual pre-logout cookies fails immediately');
 const userReplay=user.copy();
 check((await user.json('/api/auth/logout',{})).status===200,'Independent primary session can log out');
 check((await userReplay.request('/api/auth/me')).status===401,'Primary session revocation also rejects replay');
 await h.assertOwned();
 const count=(await h.db.pool.query('select count(*)::int as count from auth.users')).rows[0].count;
 check(count===1,'Exactly one dummy Auth identity was created in this isolated stack');
 const result={passed:true,checks,actualGoTrue:true,actualCapturedEmail:true,actualHttpCookies:true,
  fabricatedProviderReplies:0,signedTokensInvented:0,productionAuthOverrides:0,cloudRecordsModified:0,
  localDummyAuthUsers:count,positiveAndNegativeRoleGuards:true,immediateLogoutRevocation:true,
  passwordLoginAfterLogout:true,incorrectPasswordRejected:true,duplicateSignupStillRejected:true,
  googleOAuthTested:false};
 fs.writeFileSync(path.join(h.meta.root,'pinevela-harness','auth-smoke-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(result));
}
try{await runLocalSupabaseVerification(verify);}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Isolated real Auth verification did not complete; inspect private run diagnostics.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;
 process.exitCode=1;
}
