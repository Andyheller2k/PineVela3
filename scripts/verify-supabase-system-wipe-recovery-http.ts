/** Denial checks on the actual local Supabase API; no product writes. */
import assert from 'node:assert/strict';import fs from 'node:fs';
const base='http://127.0.0.1:3001';let checks=0;
(async()=>{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});assert((await health.json()).persistence==='supabase');checks++;
 for(const route of['/api/admin/governance/preview','/api/admin/governance/proposals','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/vote','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/founder-review','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/execute','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/pause','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/authorize-execution','/api/admin/clear-all-registered-accounts','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/prepare','/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/cancel-preparation']){
  const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(45000)});assert.equal(r.status,401);assert(!r.headers.has('set-cookie'));checks++;
  const blocked=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:'{}',signal:AbortSignal.timeout(45000)});assert.equal(blocked.status,403);checks++;
 }
 const result={passed:true,checks,realHttp:true,domainWrites:false,privateCredentialsExtracted:false};fs.writeFileSync('.security/migration-reset/system-wipe-recovery-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
})().catch(e=>{console.error(JSON.stringify({passed:false,checks,error:e.message}));process.exitCode=1;});
