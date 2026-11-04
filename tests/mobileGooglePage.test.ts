import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { mobileGooglePage } from '../supabase/mobileGooglePage';

async function launch(mode:'login'|'signup',reply: {status:number;json:unknown}) {
  const html=mobileGooglePage('fixture-nonce',mode,mode==='signup'?{accepted:true,version:'2026-10-27'}:undefined);
  const code=html.match(/<script[^>]*>([\s\S]*?)<\/script>/)![1];
  const calls:{url:string;options:any}[]=[],assigned:string[]=[],storage=new Map<string,string>();
  let retry:()=>unknown=()=>{};
  const status={textContent:''},button={hidden:true,disabled:false,addEventListener:(_event:string,handler:()=>unknown)=>{retry=handler;}};
  const context={document:{getElementById:(id:string)=>id==='status'?status:button},URL,AbortSignal,sessionStorage:{setItem:(key:string,value:string)=>storage.set(key,value)},location:{assign:(url:string)=>assigned.push(url)},fetch:async(url:string,options:any)=>{calls.push({url,options});return {ok:reply.status===200,json:async()=>reply.json};}};
  vm.runInNewContext(code,context);
  await new Promise(resolve=>setImmediate(resolve));
  return {calls,assigned,status,button,retry,html,storage};
}

test('browser-owned Google launcher starts only the existing protected OAuth endpoint with explicit consent',async()=>{
  for(const mode of ['login','signup'] as const){
    const result=await launch(mode,{status:200,json:{url:'https://example.supabase.co/auth/v1/authorize?provider=google&prompt=select_account'}});
    assert.equal(result.calls.length,1);const request=result.calls[0];assert.equal(request.url,'/api/auth/google/start');assert.equal(request.options.method,'POST');assert.equal(request.options.credentials,'same-origin');
    assert.deepEqual(JSON.parse(request.options.body),{mode,...(mode==='signup'?{termsAcceptance:{accepted:true,version:'2026-10-27'}}:{})});
    assert.equal(result.assigned.length,1);assert.match(result.assigned[0],/^https:\/\/example\.supabase\.co\/auth\/v1\/authorize/);
    assert.deepEqual([...result.storage],[['pinevela:mobile-handoff-active','1']],'Only the existing noncredential tab marker is retained for the browser return prompt');
    assert.doesNotMatch(result.html,/<form|type="password"|localStorage|access_token|refresh_token/);
  }
});
test('launcher errors stay readable and retryable without navigating to the app login form',async()=>{
  const result=await launch('login',{status:503,json:{error:'Google is temporarily unavailable.'}});
  assert.equal(result.status.textContent,'Google is temporarily unavailable.');assert.equal(result.button.hidden,false);assert.equal(result.button.disabled,false);assert.equal(result.assigned.length,0);
  await result.retry();assert.equal(result.calls.length,2);assert.equal(result.assigned.length,0);
});
test('launcher refuses script, plaintext and non-Google authorization URLs',async()=>{
  for(const url of ['javascript:alert(1)','http://example.supabase.co/auth/v1/authorize?provider=google','https://example.supabase.co/other','https://example.supabase.co/auth/v1/authorize?provider=other']){
    const result=await launch('login',{status:200,json:{url}});assert.equal(result.assigned.length,0);assert.equal(result.button.hidden,false);assert.match(result.status.textContent,/securely/);
  }
});
