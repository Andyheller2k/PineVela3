/** Denial checks on the actual local Supabase API; no product writes. */
import assert from 'node:assert/strict';import fs from 'node:fs';
const base='http://127.0.0.1:3001';let checks=0;
(async()=>{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});assert((await health.json()).persistence==='supabase');checks++;
 for(const [route,method]of [['/api/manager/closure-request','GET'],['/api/admin/manager-closure-requests','GET'],['/api/manager/secret-key','GET'],['/api/admin/manager-closure-requests/00000000-0000-4000-8000-000000000000/review','POST'],['/api/users/delete-registered-account','POST']]){
  for(const body of [undefined,{}]){const r=await fetch(base+route,{method,headers:body&&method==='POST'?{'Content-Type':'application/json'}:undefined,body:method==='POST'&&body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});assert.equal(r.status,401);assert(!r.headers.has('set-cookie'));checks++;}
  if(method==='POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:'{}',signal:AbortSignal.timeout(45000)});assert.equal(r.status,403);checks++;}
 }
 const result={passed:true,checks,realHttp:true,domainWrites:false,privateCredentialsExtracted:false};fs.writeFileSync('.security/migration-reset/unassigned-manager-closure-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
})().catch(e=>{console.error(JSON.stringify({passed:false,checks,error:e.message}));process.exitCode=1;});
