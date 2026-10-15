/** Real guest requests only: no sign-in, product fixtures or provider replies. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const base='http://127.0.0.1:3001';let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try {
  const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});
  check(health.ok&&(await health.json()).persistence==='supabase','Only use the Supabase preview');
  const callback=await fetch(base+'/api/auth/google/callback',{redirect:'manual',signal:AbortSignal.timeout(15000)});
  check(callback.status===303&&callback.headers.get('location')==='/#/login?google_error=expired','Real installed callback rejects absent flow without a provider exchange');
  check(!callback.headers.has('set-cookie'),'Absent callback cannot issue a login');
  const store=await fetch(base+'/api/digital-market/stores/'+crypto.randomUUID(),{signal:AbortSignal.timeout(30000)});
  check(store.status===404&&typeof(await store.json()).error==='string','Canonical storefront URL reaches the public unavailable-store handler');
  for(const route of ['/api/auth/admin-invitation/inspect','/api/auth/admin-invitation/accept',
    '/api/auth/officer-invitation/inspect','/api/auth/officer-invitation/accept',
    '/api/digital-market/store-setup','/api/digital-market/create-store',
    '/api/admin/governance/proposals','/api/admin/governance/changes/'+crypto.randomUUID()+'/vote']) {
    const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
    check(response.status===401&&typeof(await response.json()).error==='string','Mounted mutation requires real authentication');
    check(!response.headers.has('set-cookie'),'Guest cannot acquire a session');
  }
  for(const route of ['/api/auth/admin-invitation/accept','/api/digital-market/store-setup']) {
    const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:'{}',signal:AbortSignal.timeout(15000)});
    check(response.status===403,'Hostile origins are denied before mutation');
  }
  const report={passed:true,checks,realHttp:true,privateCredentialsExtracted:false,authenticatedMutationRequested:false,cloudRecordsModified:0,
    providerExchangeRequested:false,genuinePositiveBrowserAcceptance:false};
  fs.writeFileSync('.security/migration-reset/cutover-route-http.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
} catch(error) {
  console.error(JSON.stringify({passed:false,checks,error:error instanceof assert.AssertionError?error.message:'Read-only route verification failed.'}));process.exitCode=1;
}
