/** Counts real provider requests; the observer always forwards to actual fetch.
 * Delaying delivery of actual replies models simultaneous dashboard reads. */
import assert from 'node:assert/strict';
import {SupabaseAuth} from '../supabase/auth.js';
import {createLocalPrimary,runLocalSupabaseVerification,saveLocalFixture,type LocalSupabaseHarness} from './lib/local-supabase-harness.js';

let stage='actual local identity';
async function verify(h:LocalSupabaseHarness){
 const accounts=[];
 for(const label of ['rls-owner-a','rls-owner-b']){
  const account=await createLocalPrimary(h,label);
  const reply=await account.session.json('/api/auth/login',{email:account.credentials.email,password:account.credentials.password,accountKind:'primary'});
  assert.equal(reply.status,200);
  const token=reply.headers.getSetCookie().find(c=>c.startsWith('pv_sb_access='))?.split(';',1)[0].slice('pv_sb_access='.length);
  assert.ok(token);accounts.push({...account,token});
 }
 const auth=new SupabaseAuth(h.db),realFetch=globalThis.fetch;
 let providerRequests=0,heldDeliveryMs=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
  const observed=url.origin===h.providerOrigin&&url.pathname==='/auth/v1/user'&&(!init?.method||init.method==='GET');
  if(observed)providerRequests++;
  const response=await realFetch(input,init);
  if(observed&&heldDeliveryMs)await new Promise(resolve=>setTimeout(resolve,heldDeliveryMs));
  return response;
 };
 const samples:Record<string,number>={};let checks=0;
 try{
  stage='same-token simultaneous provider requests';heldDeliveryMs=200;
  let before=providerRequests;
  const users=await Promise.all(Array.from({length:9},()=>auth.provider('/user',undefined,accounts[0].token)));
  assert.ok(users.every(user=>user.email===accounts[0].credentials.email));checks++;
  samples.sameTokenNineRequests=providerRequests-before;
  assert.equal(samples.sameTokenNineRequests,1,'Nine simultaneous same-token checks share exactly one pending real provider request');checks++;
  stage='no settled identity cache';before=providerRequests;
  await auth.provider('/user',undefined,accounts[0].token);
  samples.nextIndependentRequest=providerRequests-before;
  assert.equal(samples.nextIndependentRequest,1);checks++;
  stage='separate actual identities';before=providerRequests;
  const different=await Promise.all(accounts.map(account=>auth.provider('/user',undefined,account.token)));
  assert.ok(different.every((user,index)=>user.email===accounts[index].credentials.email));checks++;
  samples.twoDifferentTokens=providerRequests-before;assert.equal(samples.twoDifferentTokens,2);checks++;
  stage='actual invalid provider token failure and recovery';before=providerRequests;
  const denied=await Promise.allSettled(Array.from({length:4},()=>auth.provider('/user',undefined,'invalid-local-test-token')));
  assert.ok(denied.every(result=>result.status==='rejected'&&result.reason?.status===401));checks++;
  samples.sameInvalidTokenFourRequests=providerRequests-before;
  assert.equal(samples.sameInvalidTokenFourRequests,1,'Concurrent invalid-token failures share the pending request without retaining a result');checks++;
  before=providerRequests;await assert.rejects(()=>auth.provider('/user',undefined,'invalid-local-test-token'),(error:any)=>error.status===401);checks++;
  assert.equal(providerRequests-before,1);checks++;
  stage='actual parallel application session reads';before=providerRequests;
  const replies=await Promise.all(Array.from({length:9},()=>accounts[0].session.request('/api/auth/me')));
  assert.ok(replies.every(reply=>reply.status===200&&reply.data?.id===accounts[0].credentials.contextId));checks++;
  samples.nineApplicationReads=providerRequests-before;
  assert.equal(samples.nineApplicationReads,1,'Nine actual simultaneous API reads share one pending provider verification');checks++;
  stage='logout still revokes current actual binding';
  const replay=accounts[0].session.copy();
  assert.equal((await accounts[0].session.json('/api/auth/logout',{})).status,200);checks++;
  assert.equal((await replay.request('/api/auth/me')).status,401);checks++;
  assert.equal((await accounts[1].session.request('/api/auth/me')).status,200);checks++;
  const result={passed:true,checks,samples,actualGoTrue:true,actualApplicationSessions:true,
   actualProviderReplyDeliveryDelayMs:heldDeliveryMs,settledIdentityCache:false,fabricatedProviderReplies:0,cloudWrites:0};
  saveLocalFixture(h,'auth-concurrency-result.json',result);console.log(JSON.stringify(result));
 }finally{globalThis.fetch=realFetch;}
}
try{await runLocalSupabaseVerification(verify);}catch(error){
 console.error(JSON.stringify({passed:false,stage,error:'Actual local authentication concurrency check stopped; diagnostics are private.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
