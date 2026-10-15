/** Actual HTTP denials; never creates identities, invitations or delivery records. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='http://127.0.0.1:3001';let checks=0;
try {
  const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});
  assert.equal((await health.json()).persistence,'supabase');checks++;
  for(const [method,path] of [
    ['GET','/api/admin/digital-market/stores'],['GET','/api/admin/manager-restrictions'],
    ['GET','/api/verification-teams/invitations'],['POST','/api/verification-teams'],
    ['POST','/api/room-keys/send-digital'],['POST','/api/auth/officer-invitation/inspect'],
    ['POST','/api/auth/officer-invitation/accept'],
    ['PUT','/api/verification-teams/00000000-0000-4000-8000-000000000000/status']
  ]) {
    const reply=await fetch(base+path,{method,signal:AbortSignal.timeout(45000),
      ...(method!=='GET'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});
    assert.equal(reply.status,401);assert(!reply.headers.has('set-cookie'));checks++;
    assert.match(reply.headers.get('cache-control')||'',/no-store/);checks++;
  }
  for(const path of ['/api/verification-teams','/api/room-keys/send-digital','/api/auth/officer-invitation/accept']) {
    const reply=await fetch(base+path,{method:'POST',signal:AbortSignal.timeout(45000),
      headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:'{}'});
    assert.equal(reply.status,403);assert(!reply.headers.has('set-cookie'));checks++;
  }
  const result={passed:true,checks,actualHttp:true,credentialsExtracted:false,providerRequests:0,domainWrites:false};
  fs.writeFileSync('.security/migration-reset/officer-delivery-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(result));
}catch(error:any){console.error(JSON.stringify({passed:false,checks,error:error.message}));process.exitCode=1;}
