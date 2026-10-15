/** Guest and cross-site denial checks against the actual local Supabase API. */
import assert from 'node:assert/strict';import fs from 'node:fs';
const base='http://127.0.0.1:3001';let checks=0;
(async()=>{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});assert((await health.json()).persistence==='supabase');checks++;
 for(const route of ['/api/resident/closure-preview','/api/student/delete-room','/api/users/delete-registered-account']){
  const method=route.endsWith('preview')?'GET':'POST';
  for(const body of [undefined,{}]){
   const r=await fetch(base+route,{method,headers:body&&method==='POST'?{'Content-Type':'application/json'}:undefined,body:method==='POST'&&body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
   assert.equal(r.status,401,'Guest cannot inspect or close a resident portal');assert(!r.headers.has('set-cookie'));checks++;
  }
  if(method==='POST'){const r=await fetch(base+route,{method,headers:{'Content-Type':'application/json',Origin:'https://untrusted.invalid'},body:'{}',signal:AbortSignal.timeout(45000)});assert.equal(r.status,403);checks++;}
 }
 const result={passed:true,checks,realHttp:true,domainWrites:false,privateCredentialsExtracted:false};fs.writeFileSync('.security/migration-reset/resident-closure-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
})().catch(e=>{console.error(JSON.stringify({passed:false,checks,error:e.message}));process.exitCode=1;});
