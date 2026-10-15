/** Actual replacement router: guests and cross-site clients cannot reach setup
 * corrections. No provider replies, Auth credentials or product fixtures. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import {SupabaseDatabase} from '../supabase/db.js';
import {createSupabaseApp} from '../supabase/app.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),{app}=createSupabaseApp(db),server=app.listen(0,'127.0.0.1');
await new Promise<void>(resolve=>server.once('listening',resolve));
const address=server.address();if(!address||typeof address==='string')throw Error('Local verifier listener required.');
const base=`http://127.0.0.1:${address.port}`;let checks=0;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
try{
 const snapshot=async()=>(await db.pool.query(`select (select count(*) from public.residences) as residences,
  (select count(*) from public.verification_cases) as cases,(select count(*) from public.rooms) as rooms,
  (select count(*) from public.allocations) as allocations,(select count(*) from auth.users)as auth_users,
  (select count(*) from public.profiles)as profiles,(select count(*) from private.account_enrollments)as enrollments`)).rows[0];
 const before=await snapshot();
 const request=async(route:string,status:number,options:RequestInit={})=>{
  const response=await fetch(base+route,{...options,signal:AbortSignal.timeout(30000)});
  check(response.status===status,route+' returns '+status);
  check(response.headers.get('x-content-type-options')==='nosniff'&&!response.headers.has('set-cookie'),'Denial cannot issue authentication');
  check(typeof(await response.json()).error==='string','Denial returns a usable error');
 };
 for(const route of ['/api/manager/residence-registration','/api/manager/my-hostel','/api/admin/hostels','/api/auth/enrollments/policy']){
  await request(route,401);
  await request(route,401,{headers:{authorization:'Bearer invalid'}});
 }
 await request('/api/hostels/register',401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
 await request('/api/hostels/register',403,{method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.invalid'},body:'{}'});
 for(const decision of ['approve','reject','request-info']){
  const route='/api/hostel-verifications/'+crypto.randomUUID()+'/'+decision;
  await request(route,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
  await request(route,403,{method:'PUT',headers:{'content-type':'application/json',origin:'https://untrusted.invalid'},body:'{}'});
 }
 for(const route of ['/api/auth/register-manager','/api/auth/register-manager-account','/api/manager-verifications/submit','/api/auth/enrollments/google/start']){
  await request(route,401,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  await request(route,403,{method:'POST',headers:{'content-type':'application/json',origin:'https://untrusted.invalid'},body:'{}'});
 }
 const corrections='/api/manager-verifications/'+crypto.randomUUID()+'/request-info';
 await request(corrections,401,{method:'PUT',headers:{'content-type':'application/json'},body:'{}'});
 await request(corrections,403,{method:'PUT',headers:{'content-type':'application/json',origin:'https://untrusted.invalid'},body:'{}'});
 const callback=await fetch(base+'/api/auth/google/callback?state=manager_'+'x'.repeat(43)+'&code=untrusted',{redirect:'manual',signal:AbortSignal.timeout(30000)});
 check(callback.status===303,'Unmatched Google enrollment state is rejected before any provider request');
 check(callback.headers.get('location')==='/#/manager-google-result?result=failed','Unmatched state redirects only to the local result page');
 check(!callback.headers.has('set-cookie'),'Unmatched enrollment state cannot issue or replace authentication');
 check(JSON.stringify(await snapshot())===JSON.stringify(before),'Denied requests preserve residence and allocation records');
 const result={passed:true,checks,realHttp:true,cloudProductRecordsModified:0,credentialsExtracted:false,providerRepliesMocked:false};
 fs.writeFileSync('.security/migration-reset/residence-corrections-http.json',JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
}catch(error){console.error(JSON.stringify({passed:false,checks,error:error instanceof assert.AssertionError?error.message:'Residence correction HTTP check failed.'}));process.exitCode=1;}
finally{await app.locals.closeRealtime();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();}
