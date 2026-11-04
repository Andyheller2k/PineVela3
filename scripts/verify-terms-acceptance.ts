/** Real restored PostgreSQL/RLS + actual Express/Auth/merchant handlers.
 * Provider replies and local Auth subjects are explicit test fixtures; this is
 * not a live Google/email delivery test. Nothing contacts or writes cloud data. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import {once} from 'node:events';
import type {AddressInfo} from 'node:net';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {SupabaseDatabase,ApiError,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth,installSupabaseAuth,csrfBoundary} from '../supabase/auth.js';
import {installLegal,currentTermsStatus,recordTermsAcceptance} from '../supabase/legal.js';
import {installSellerRegistration} from '../supabase/sellerRegistration.js';
import {finishEnrollment} from '../supabase/enrollment.js';
import {termsAcceptance,PLATFORM_TERMS} from '../legalPolicy.js';

const [checkpoint]=process.argv.slice(2);
if(process.argv.length!==3||!/^[a-f0-9-]{36}$/.test(checkpoint||''))throw Error('Pass a locally restore-verified backup UUID.');
let checks=0,stage='restore';const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const nativeFetch=globalThis.fetch;
try{await withIsolatedBackup(checkpoint,async config=>{
  const db=new SupabaseDatabase(config);let server:ReturnType<express.Express['listen']>|undefined;
  try{
    stage='local additive migrations';
    const ledger=new Map((await db.pool.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
    for(const file of fs.readdirSync('supabase/migrations').filter(n=>/^\d{14}_[a-z0-9_]+\.sql$/.test(n)).sort()){
      const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
      if(ledger.has(version))assert.equal(ledger.get(version),digest);
      else await db.system(async c=>{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[version,digest]);});
    }
    check((await db.pool.query('select count(*)::int as n from private.legal_acceptances')).rows[0].n===0,'Migration never auto-consents restored users');
    const provider='https://terms-fixture.supabase.co';
    Object.assign(process.env,{SUPABASE_URL:provider,SUPABASE_ANON_KEY:'sb_publishable_local_terms_fixture',NODE_ENV:'development'});
    delete process.env.AUTH_CAPTCHA_SITE_KEY;
    const fixtures=new Map<string,any>();let providerCalls=0,callbackFixture:any;
    async function identity(enrollmentToken?:string,invitedEmail?:string){
      const id=crypto.randomUUID(),sessionId=crypto.randomUUID(),email=invitedEmail||'terms-'+id+'@test.edu.gh';
      await db.system(async c=>{
        await c.query(`insert into auth.users(id,email,role,aud,email_confirmed_at,is_anonymous,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
          values($1,$2,'authenticated','authenticated',now(),false,$3,'{"provider":"google","providers":["google"]}',now(),now())`,
          [id,email,JSON.stringify({name:'Isolated Terms Fixture',...(enrollmentToken?{pinevela_enrollment_token:enrollmentToken}:{})})]);
        await c.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[sessionId,id]);
        await c.query("insert into auth.identities(user_id,provider_id,provider,identity_data) values($1::uuid,$1::text,'google',$2)",[id,JSON.stringify({sub:id,email,email_verified:true})]);
      });
      const claims=Buffer.from(JSON.stringify({sub:id,session_id:sessionId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');
      const token='test.'+claims+'.local-fixture';
      const user={id,email,is_anonymous:false,email_confirmed_at:new Date().toISOString(),identities:[{provider:'google',identity_data:{email_verified:true,email}}]};
      const session={access_token:token,refresh_token:'local-fixture-'+id,user};
      const fixture={id,sessionId,email,user,session,cookie:'pv_sb_access='+token};fixtures.set(token,fixture);return fixture;
    }
    globalThis.fetch=(async(input:any,options:any={})=>{
      const url=new URL(String(input));if(url.origin!==provider)return nativeFetch(input,options);
      providerCalls++;
      const json=(data:any,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
      if(url.pathname==='/auth/v1/settings')return json({mailer_autoconfirm:false,external:{email:true,google:true},disable_signup:false});
      if(url.pathname==='/auth/v1/user'){
        const bearer=new Headers(options.headers).get('Authorization')?.replace(/^Bearer /,'');
        return fixtures.has(bearer||'')?json(fixtures.get(bearer!).user):json({},401);
      }
      if(url.pathname==='/auth/v1/verify'||url.pathname==='/auth/v1/token'&&url.searchParams.get('grant_type')==='pkce')return json(callbackFixture.session);
      if(url.pathname==='/auth/v1/logout')return json({});
      throw Error('Unexpected fixture provider operation');
    }) as typeof fetch;
    const auth=new SupabaseAuth(db),app=express();app.use(express.json());app.use(csrfBoundary);
    installSupabaseAuth(app,auth);installLegal(app,auth);installSellerRegistration(app,auth);
    app.get('/api/private-probe',auth.require(['primary']),(_req,res)=>res.json({allowed:true}));
    app.get('/api/support/probe',auth.require(),(_req,res)=>res.json({available:true}));
    app.post('/api/manager/terms-regression-probe',auth.require(['manager']),(_req,res)=>res.json({allowed:true}));
    app.use((error:any,_req:any,res:any,_next:any)=>res.status(error.status||500).json({error:error instanceof ApiError?error.message:'Test operation failed',code:error.code}));
    server=app.listen(0,'127.0.0.1');await once(server,'listening');
    const origin='http://127.0.0.1:'+(server.address() as AddressInfo).port;
    async function call(path:string,fixture?:any,body?:any,headers:Record<string,string>={}){
      const response=await nativeFetch(origin+path,{method:body===undefined?'GET':'POST',headers:{...(fixture?{cookie:fixture.cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',origin}),...headers},
        ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual'});
      return {status:response.status,data:await response.clone().json().catch(()=>null),response};
    }
    stage='missing signup acceptance';
    const callsBefore=providerCalls;
    for(const path of ['/api/auth/register-unified','/api/auth/verify-unified','/api/auth/google/start']){
      for(const acceptance of [undefined,termsAcceptance(false),{accepted:true,version:'obsolete'}]){
        const r=await call(path,undefined,{mode:'signup',termsAcceptance:acceptance});
        check(r.status===(acceptance?.accepted===true?409:400),'Native/Google registration rejects missing or stale acceptance before provider work');
      }
    }
    check(providerCalls===callsBefore,'Invalid signup proof never contacts the provider');
    stage='native verified account gate';
    const owner=await identity(),foreign=await identity();
    const ownerActor=await auth.bind(owner.session),foreignActor=await auth.bind(foreign.session);
    check((await call('/api/auth/me',owner)).data.legal.accepted===false,'An existing verified identity is not auto-consented');
    check((await call('/api/private-probe',owner)).status===403,'Direct authenticated product HTTP cannot bypass agreement');
    check((await call('/api/support/probe',owner)).status===200,'Support remains accessible before acceptance');
    check((await call('/api/legal/accept',undefined,{termsAcceptance:termsAcceptance(true)})).status===401,'Anonymous request cannot write a receipt');
    const unverified=await identity();unverified.user.email_confirmed_at=null;
    check((await call('/api/legal/accept',unverified,{termsAcceptance:termsAcceptance(true)})).status===401,'Provider-unverified identity cannot create acceptance evidence');
    const declined=await identity();await auth.bind(declined.session);
    check((await call('/api/auth/logout',declined,{})).status===200,'An account may decline and sign out without accepting');
    for(const body of [{},{termsAcceptance:termsAcceptance(false)},{termsAcceptance:{accepted:true,version:'old'}},
      {termsAcceptance:termsAcceptance(true),userId:foreign.id},{termsAcceptance:{...termsAcceptance(true),acceptedAt:'2000-01-01'}}]){
      check([400,409].includes((await call('/api/legal/accept',owner,body)).status),'False, stale and spoofed acceptance requests are rejected');
    }
    check((await call('/api/legal/accept',owner,{termsAcceptance:termsAcceptance(true)},{origin:'https://foreign.invalid'})).status===403,'Cross-origin acceptance is rejected');
    const accepted=await call('/api/legal/accept',owner,{termsAcceptance:termsAcceptance(true)});
    check(accepted.status===200&&accepted.data.legal.accepted,'Explicit verified acceptance unlocks this account');
    check((await call('/api/private-probe',owner)).status===200,'Current accepted account can use protected HTTP');
    check((await call('/api/legal/status',foreign)).data.accepted===false,'Another account does not inherit acceptance');
    stage='manager first acceptance without operation key';
    const managerNonce=crypto.randomBytes(32).toString('hex'),managerEmail='manager-'+crypto.randomUUID()+'@test.edu.gh';
    const managerEnrollment=(await db.pool.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
      values($1,$2,'manager',$3,$4,'{"displayName":"Isolated Manager","phone":""}',now()+interval '24 hours') returning id`,
      [ownerActor.contextId,owner.id,managerEmail,crypto.createHash('sha256').update(managerNonce).digest('hex')])).rows[0].id;
    const manager=await identity(managerNonce,managerEmail);
    await db.authorizedSystem(ownerActor,['primary'],c=>finishEnrollment(c,ownerActor,managerEnrollment,{authUserId:manager.id,email:managerEmail,sessionId:manager.sessionId}));
    const managerContext=await db.system(async c=>{
      const id=(await c.query('select linked_context_id as id from private.account_enrollments where id=$1',[managerEnrollment])).rows[0].id;
      // Fixture approval is local only; all relationship, feature and RLS guards remain enabled.
      await c.query("update public.account_contexts set status='active' where id=$1",[id]);
      await c.query("update private.account_enrollments set status='completed' where id=$1",[managerEnrollment]);
      return id;
    });
    await auth.bind(manager.session,'manager');
    check((await call('/api/legal/status',manager)).data.accepted===false,'Manager can read own first agreement before obtaining an operation key');
    check((await call('/api/manager/terms-regression-probe',manager,{})).status===403,'Unaccepted manager cannot enter product writes');
    const managerAccepted=await call('/api/legal/accept',manager,{termsAcceptance:termsAcceptance(true)});
    if(managerAccepted.status!==200)console.log(JSON.stringify({regression:'manager Terms save',status:managerAccepted.status,code:managerAccepted.data?.code}));
    check(managerAccepted.status===200&&managerAccepted.data.id===managerContext&&managerAccepted.data.legal.accepted,'Manager can save own Terms without an operation key');
    check((await call('/api/legal/accept',manager,{termsAcceptance:termsAcceptance(true),contextId:ownerActor.contextId})).status===400,'Manager cannot inject another acceptance context');
    const managerReceipt=(await db.pool.query('select auth_user_id,context_id,session_id from private.legal_acceptances where auth_user_id=$1',[manager.id])).rows;
    check(managerReceipt.length===1&&managerReceipt[0].context_id===managerContext&&managerReceipt[0].session_id===manager.sessionId,'Manager acceptance binds the authenticated manager context and session');
    check((await call('/api/legal/status',foreign)).data.accepted===false,'Manager acceptance does not unlock another account');
    check((await call('/api/manager/terms-regression-probe',manager,{})).data.code==='manager_key_required','Manager product writes still require the operation key after accepting Terms');
    check((await call('/api/legal/accept',undefined,{termsAcceptance:termsAcceptance(true)})).status===401,'Anonymous caller cannot save acceptance');
    stage='primary acceptance receipt';
    const receipt=(await db.pool.query('select * from private.legal_acceptances where auth_user_id=$1',[owner.id])).rows[0];
    check(receipt.context_id===ownerActor.contextId&&receipt.session_id===owner.sessionId&&receipt.document_sha256===PLATFORM_TERMS.sha256,'Receipt binds verified context/session and server document hash');
    await call('/api/legal/accept',owner,{termsAcceptance:termsAcceptance(true)});
    const repeat=(await db.pool.query('select * from private.legal_acceptances where auth_user_id=$1',[owner.id])).rows;
    check(repeat.length===1&&String(repeat[0].accepted_at)===String(receipt.accepted_at),'Repeat acceptance preserves the first evidence timestamp');
    stage='email verification receipt';
    callbackFixture=foreign;
    check((await call('/api/auth/verify-unified',undefined,{email:foreign.email,signupId:owner.id,code:'01234567',termsAcceptance:termsAcceptance(true)})).status===400,'Email proof cannot assign acceptance to another signup subject');
    const emailVerified=await call('/api/auth/verify-unified',undefined,{email:foreign.email,signupId:foreign.id,code:'01234567',termsAcceptance:termsAcceptance(true)});
    check(emailVerified.status===200&&emailVerified.data.user.legal.accepted,'Email verification records acceptance after verified binding');
    check((await db.pool.query("select source from private.legal_acceptances where auth_user_id=$1",[foreign.id])).rows[0].source==='email_signup','Email receipt records the server-selected source');
    stage='Google one-time flow';
    const google=await identity();callbackFixture=google;
    const start=await call('/api/auth/google/start',undefined,{mode:'signup',termsAcceptance:termsAcceptance(true)});
    check(start.status===200,'Accepted Google signup can begin');
    const callback=new URL(new URL(start.data.url).searchParams.get('redirect_to')!);
    const stateCookie=start.response.headers.getSetCookie()[0].split(';')[0];
    const callbackPath=callback.pathname+callback.search+'&code=local-fixture-code&accepted=false&terms_version=old';
    const completed=await call(callbackPath,undefined,undefined,{cookie:stateCookie});
    check(completed.status===303&&!completed.response.headers.get('location')?.includes('google_error='),'Valid one-time Google flow completes through the native callback');
    const googleReceipts=(await db.pool.query('select * from private.legal_acceptances where auth_user_id=$1',[google.id])).rows;
    check(googleReceipts.length===1&&googleReceipts[0].source==='google_signup','Google callback binds accepted version only to verified callback subject');
    check((await call(callbackPath,undefined,undefined,{cookie:stateCookie})).response.headers.get('location')?.includes('expired'),'Replayed Google state is rejected');
    check((await db.pool.query('select count(*)::int as n from private.legal_acceptances where auth_user_id=$1',[google.id])).rows[0].n===1,'Replay adds no receipt');
    const cancelled=await call('/api/auth/google/start',undefined,{mode:'signup',termsAcceptance:termsAcceptance(true)});
    const cancelUrl=new URL(new URL(cancelled.data.url).searchParams.get('redirect_to')!);
    const beforeCancel=(await db.pool.query('select count(*)::int as n from private.legal_acceptances')).rows[0].n;
    await call(cancelUrl.pathname+cancelUrl.search+'&error=access_denied',undefined,undefined,{cookie:cancelled.response.headers.getSetCookie()[0].split(';')[0]});
    check((await db.pool.query('select count(*)::int as n from private.legal_acceptances')).rows[0].n===beforeCancel,'Cancelled Google flow records no agreement');
    const returning=await identity();callbackFixture=returning;
    const loginStart=await call('/api/auth/google/start',undefined,{mode:'login'});
    const loginCallback=new URL(new URL(loginStart.data.url).searchParams.get('redirect_to')!);
    const loginCompleted=await call(loginCallback.pathname+loginCallback.search+'&code=local-login-fixture',undefined,undefined,{cookie:loginStart.response.headers.getSetCookie()[0].split(';')[0]});
    check(loginCompleted.status===303&&!loginCompleted.response.headers.get('location')?.includes('google_error='),'Returning Google users can sign in before agreement');
    check((await call('/api/auth/me',returning)).data.legal.accepted===false&&(await call('/api/private-probe',returning)).status===403,'Google Login cannot bypass acceptance or auto-consent an existing user');
    stage='verified merchant enrollment and receipt';
    const nonce=crypto.randomBytes(32).toString('hex'),sellerEmail='seller-'+crypto.randomUUID()+'@test.edu.gh';
    // Reserve a server-owned pending enrollment before creating the local child.
    const enrollmentId=(await db.pool.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
      values($1,$2,'seller',$3,$4,'{"displayName":"Isolated Seller","phone":""}',now()+interval '24 hours') returning id`,
      [ownerActor.contextId,owner.id,sellerEmail,crypto.createHash('sha256').update(nonce).digest('hex')])).rows[0].id;
    const childId=crypto.randomUUID(),childSession=crypto.randomUUID();
    await db.system(async c=>{
      await c.query(`insert into auth.users(id,email,role,aud,email_confirmed_at,is_anonymous,raw_user_meta_data,raw_app_meta_data,created_at,updated_at)
        values($1,$2,'authenticated','authenticated',now(),false,$3,'{}',now(),now())`,[childId,sellerEmail,JSON.stringify({name:'Isolated Seller',pinevela_enrollment_token:nonce})]);
      await c.query('insert into auth.sessions(id,user_id,created_at,updated_at) values($1,$2,now(),now())',[childSession,childId]);
    });
    const application={enrollmentId,university:'Local isolated university',categoryToSell:'Textbooks',idNumber:'LOCAL-20261028',storeName:'Isolated merchant',certified:true};
    check((await call('/api/digital-market/register',owner,{...application,termsAcceptance:termsAcceptance(true)})).status===409,'Agreement cannot bypass the verified seller-enrollment step');
    await db.authorizedSystem(ownerActor,['primary'],c=>finishEnrollment(c,ownerActor,enrollmentId,{authUserId:childId,email:sellerEmail,sessionId:childSession}));
    for(const acceptance of [undefined,termsAcceptance(false),{accepted:true,version:'old'}])
      check([400,409].includes((await call('/api/digital-market/register',owner,{...application,termsAcceptance:acceptance})).status),'Merchant API independently requires explicit current acceptance');
    check([403,404].includes((await call('/api/digital-market/register',foreign,{...application,termsAcceptance:termsAcceptance(true)})).status),'Accepted foreign primary cannot apply with another owner enrollment');
    check((await call('/api/digital-market/register',owner,{...application,certified:false,termsAcceptance:termsAcceptance(true)})).status===400,'Agreement does not replace the genuine student declaration');
    check((await call('/api/digital-market/register',owner,{...application,userId:foreign.id,termsAcceptance:termsAcceptance(true)})).status===400,'Merchant ownership fields cannot be injected into a receipt');
    const submitted=await call('/api/digital-market/register',owner,{...application,termsAcceptance:termsAcceptance(true)});
    check(submitted.status===200&&submitted.data.application.status==='pending','Verified owner can submit an accepted merchant application');
    const merchantReceipts=(await db.pool.query("select * from private.legal_acceptances where auth_user_id=$1 and purpose='merchant_application'",[owner.id])).rows;
    check(merchantReceipts.length===1&&merchantReceipts[0].resource_key===submitted.data.application.id+':'+submitted.data.application.submissionVersion,'Merchant receipt binds server-selected application and submission version');
    check((await call('/api/digital-market/register',owner,{...application,termsAcceptance:termsAcceptance(true)})).status===200,'Idempotent merchant retry succeeds');
    check((await db.pool.query("select count(*)::int as n from private.legal_acceptances where auth_user_id=$1 and purpose='merchant_application'",[owner.id])).rows[0].n===1,'Merchant retry adds no duplicate receipt');
    stage='database isolation and revoked sessions';
    for(const role of ['anon','authenticated','pinevela_backend'])for(const table of ['legal_documents','legal_acceptances']){
      const grant=(await db.pool.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE\') as allowed',[role,'private.'+table])).rows[0].allowed;
      check(grant===false,'Browser/scoped role has no legal table grant');
    }
    check((await db.pool.query("select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname in ('legal_documents','legal_acceptances') and c.relrowsecurity")).rows[0].n===2,'Both private tables enable RLS');
    const c=await db.pool.connect();try{
      await c.query('begin');const before=(await c.query('select count(*)::int as n from private.legal_acceptances')).rows[0].n;
      await recordTermsAcceptance(c,ownerActor,termsAcceptance(true),'merchant_application','rollback-test');await c.query('rollback');
      check((await c.query('select count(*)::int as n from private.legal_acceptances')).rows[0].n===before,'Transaction failure/rollback retains no partial receipt');
    }finally{c.release();}
    check((await call('/api/auth/logout',owner,{})).status===200,'Sign-out remains available');
    check((await call('/api/private-probe',owner)).status===401,'Revoked native session cannot reuse a receipt');
    await assert.rejects(()=>db.authorizedSystem({...foreignActor,contextId:ownerActor.contextId},['primary'],c=>currentTermsStatus(c,ownerActor)),(e:any)=>e.status===401);
    checks++;
    console.log(JSON.stringify({passed:true,checks,realRestoredPostgres:true,actualHttpHandlers:true,providerReplies:'local fixtures',liveGoogleOrEmailVerified:false,cloudWrites:0}));
  }finally{
    globalThis.fetch=nativeFetch;
    if(server){server.closeAllConnections();await new Promise<void>(resolve=>server!.close(()=>resolve()));}
    await db.close();
  }
});}catch(e:any){
  fs.writeFileSync('.security/migration-reset/terms-acceptance-test-failure.log',String(e.stack||e),{mode:0o600});
  console.error(JSON.stringify({passed:false,stage,checks,code:e.code||null,message:e instanceof assert.AssertionError?e.message:'Private local diagnostics saved.'}));process.exitCode=1;
}
