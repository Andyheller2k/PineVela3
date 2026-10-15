/** Actual local HTTP checks. Invalid requests never contact Auth or send mail. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import dotenv from 'dotenv';
dotenv.config({quiet:true});
const base='http://127.0.0.1:3001';let checks=0;
async function post(route:string,body:unknown,status:number,headers:Record<string,string>={}){
 const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
 assert.equal(r.status,status);assert(!r.headers.has('set-cookie'));checks++;
}
try{
 const health=await fetch(base+'/api/health',{signal:AbortSignal.timeout(15000)});assert.equal((await health.json()).persistence,'supabase');checks++;
 for(const route of ['/api/auth/primary-reentry','/api/auth/primary-reentry/verify']){
  await post(route,{},400);
  await post(route,{email:'andyheller2k@gmail.com',authUserId:'00000000-0000-4000-8000-000000000000'},400);
  await post(route,{email:'andyheller2k@gmail.com',role:'admin'},400);
  await post(route,{email:'andyheller2k@gmail.com'},403,{Origin:'https://untrusted.invalid'});
 }
 const provider=new URL(process.env.SUPABASE_URL!).origin;
 for(const code of['garbage',provider+'/auth/v1/verify?type=recovery&token='+'a'.repeat(64),provider+'/auth/v1/verify?type=signup&token='+'a'.repeat(64),'https://untrusted.invalid/auth/v1/verify?type=email&token='+'a'.repeat(64)])
  await post('/api/auth/primary-reentry/verify',{email:'andyheller2k@gmail.com',code},400);
 const result={passed:true,checks,actualHttp:true,providerRequestsMade:false,emailsSent:0,cookiesChanged:false,domainWrites:false};
 fs.writeFileSync('.security/migration-reset/primary-email-reentry-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}catch(e:any){console.error(JSON.stringify({passed:false,checks,error:e.message}));process.exitCode=1;}
