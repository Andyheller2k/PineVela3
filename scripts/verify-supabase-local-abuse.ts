/** Bounded, isolated abuse checks against actual PineVela + PostgreSQL + GoTrue.
 * This is not a distributed/volumetric DDoS test. The shared harness refuses
 * non-loopback endpoints and cloud configuration; email stays in local capture.
 * Run: node --import tsx scripts/verify-supabase-local-abuse.ts /tmp/<owned>/metadata.json
 */
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {performance} from 'node:perf_hooks';
import {createLocalPrimary,runLocalSupabaseVerification,saveLocalFixture} from './lib/local-supabase-harness.js';

await runLocalSupabaseVerification(async h=>{
 const checks:string[]=[],started=performance.now();
 const check=(value:unknown,label:string)=>{assert.ok(value,label);checks.push(label);};
 await h.assertOwned();
 check(!process.env.PINEVELA_TRUST_PROXY,'Isolation uses the product default of no trusted proxy');
 const account=await createLocalPrimary(h,'abuse-verification');
 const profileId=(await h.db.pool.query('select auth_user_id from public.account_contexts where id=$1',[account.user.id])).rows[0]?.auth_user_id;
 assert.ok(profileId);
 const identityBefore=(await h.db.pool.query('select count(*)::int as profiles,(select count(*)::int from public.account_contexts) as contexts from public.profiles')).rows[0];
 const raw=async(route:string,options:RequestInit={})=>{
  const url=new URL(route,h.origin);assert.equal(url.origin,h.origin);assert.ok(url.pathname.startsWith('/api/'));
  const response=await fetch(url,{...options,redirect:'manual',signal:AbortSignal.timeout(15000)});
  const text=await response.text();
  let data:any;try{data=JSON.parse(text);}catch{data=null;}
  return{status:response.status,headers:response.headers,data,text};
 };
 const post=(route:string,body:unknown,headers:Record<string,string>={})=>raw(route,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
 const safeError=(response:{text:string},label:string)=>check(!/\b(?:SQLSTATE|syntax error at|pg_catalog|password_hash|encrypted_password|postgresql:\/\/|select .* from auth\.users)\b/i.test(response.text),label);
 const healthBefore=await raw('/api/health');check(healthBefore.status===200,'Application starts healthy with the actual migrated database');

 // Probe externally supplied identifiers, never interpolate SQL into a test
 // query. An expression and a stacked statement must both remain plain input.
 for(const payload of ["' OR '1'='1", "00000000-0000-4000-8000-000000000000'; SELECT pg_sleep(2); --"]){
  for(const route of ['/api/hostels/','/api/digital-market/stores/']){
   const response=await raw(route+encodeURIComponent(payload));
   check(response.status===400,'Catalog resource-ID injection is rejected: '+route);
   safeError(response,'Invalid catalog identifier does not disclose database diagnostics');
  }
  const response=await raw('/api/digital-market/products?storeId='+encodeURIComponent(payload));
  check(response.status===400,'Catalog store-filter injection cannot change SQL scope');
 }
 for(const suffix of ['storeId[$ne]=anything','storeId[]=anything','storeId=a&storeId=b']){
  const response=await raw('/api/digital-market/products?'+suffix);
  check(response.status===400,'Structured/duplicate catalog identifiers are rejected: '+suffix.split('=')[0]);
 }
 const catalog=await raw('/api/digital-market/products');
 const widened=await raw('/api/digital-market/products?includeAll=true&sellerEmail='+encodeURIComponent(account.credentials.email));
 check(catalog.status===200&&Array.isArray(catalog.data),'Normal public catalog read succeeds');
 check(widened.status===200&&JSON.stringify(widened.data)===JSON.stringify(catalog.data),'Client includeAll/sellerEmail cannot widen the public catalog');

 // Actual GoTrue processes the password attempt. SQL text is not a password
 // or email escape hatch and the caller does not receive an application session.
 const badEmail=await h.session().json('/api/auth/login',{email:"' OR '1'='1",password:'not-a-valid-password'});
 check(badEmail.status===400,'SQL-shaped email cannot bypass login validation');
 const injectedPassword=await h.session().json('/api/auth/login',{email:account.credentials.email,password:"' OR '1'='1' --"});
 check(injectedPassword.status===401,'SQL-shaped password cannot authenticate an actual verified identity');
 check(!injectedPassword.headers.getSetCookie().some(v=>/^pv_sb_(access|refresh)=[^;]/.test(v)),'Injection attempt creates no session cookie');
 const guestAdmin=await h.session().request('/api/database/status');
 check(guestAdmin.status===401,'Unauthenticated requests cannot reach administrator database diagnostics');
 const forgedRole=await account.session.request('/api/database/status?role=admin&userId='+profileId);
 check(forgedRole.status===403,'Verified primary identity cannot spoof administrator ownership');
 const massAssignment=await account.session.json('/api/auth/profile',{name:'Unapplied probe',role:'admin',userId:profileId},'PUT');
 check(massAssignment.status===400,'Profile write refuses client ownership/role fields');

 // A legitimate text field exercises an actual parameterized UPDATE; its
 // original value is restored even if a later assertion fails.
 const literal="Pine ' OR '1'='1'; SELECT pg_sleep(2); --";
 try{
  const saved=await account.session.json('/api/auth/profile',{name:literal},'PUT');
  check(saved.status===200,'Valid display-name field accepts SQL punctuation as text');
  const actual=(await h.db.pool.query('select display_name from public.profiles where id=$1',[profileId])).rows[0];
  check(actual?.display_name===literal,'Parameterized profile write stores the exact literal rather than executing it');
  const me=await account.session.request('/api/auth/me');
  check(me.status===200&&me.data?.id===account.user.id&&me.data?.role==='user','Literal SQL text leaves the verified session and role unchanged');
 }finally{
  const restored=await account.session.json('/api/auth/profile',{name:account.credentials.name},'PUT');
  assert.equal(restored.status,200,'Restore this run-owned profile through the normal application API');
 }
 for(const [sql,label] of [
  ['select * from private.account_sessions limit 1','Catalog database role cannot read private application sessions'],
  ['select encrypted_password from auth.users limit 1','Catalog database role cannot read native password hashes'],
 ] as const){
  let code='';try{await h.db.publicRows(sql);}catch(error){code=String((error as any)?.code||'');}
  check(code==='42501',label);
 }
 const profileRls=(await h.db.pool.query("select relrowsecurity from pg_class where oid='public.profiles'::regclass")).rows[0];
 check(profileRls?.relrowsecurity===true,'Registered profile table retains row-level security');
 let anonymous:number|undefined,anonymousDenied=false;
 try{anonymous=await h.db.system(async c=>{await c.query('set local role anon');return(await c.query('select count(*)::int as n from public.profiles')).rows[0].n;});}
 catch(error){if((error as any)?.code!=='42501')throw error;anonymousDenied=true;}
 check(anonymousDenied||anonymous===0,'PostgreSQL anonymous role cannot enumerate the real local registered profiles');
 const identityAfter=(await h.db.pool.query('select count(*)::int as profiles,(select count(*)::int from public.account_contexts) as contexts from public.profiles')).rows[0];
 check(JSON.stringify(identityAfter)===JSON.stringify(identityBefore),'Injection probes did not create, delete or duplicate account identities');

 // Bound request bodies independently of whether credentials are meaningful.
 const invalidJson=await raw('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:'{"email":'});
 check(invalidJson.status===400,'Malformed JSON receives a safe 400');safeError(invalidJson,'Malformed JSON does not disclose parser internals');
 const oversized=await raw('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({padding:'x'.repeat(1024*1024+1)})});
 check(oversized.status===413,'Bodies above the real 1 MiB product limit are rejected');
 const compressed=await raw('/api/auth/login',{method:'POST',headers:{'content-type':'application/json','content-encoding':'gzip'},body:gzipSync(Buffer.from('{}'))});
 check(compressed.status===415,'Compressed JSON is rejected before decompression');

 // Exactly 52 short abuse requests, concurrency at most four. All remain on
 // the harness origin. Varying untrusted forwarding headers and route spelling
 // must not create fresh budgets. Malformed fields avoid provider/email work.
 const burst=async(routes:string[],count:number)=>{
  let index=0;const results:Awaited<ReturnType<typeof post>>[]=[];
  await Promise.all(Array.from({length:4},async()=>{while(index<count){const current=index++;
   results[current]=await post(routes[current%routes.length],{}, {'x-forwarded-for':'198.51.100.'+(current+1),'forwarded':'for=203.0.113.'+(current+1)});
  }}));return results;
 };
 const authBurst=await burst(['/api/auth/login','/api/AUTH/LOGIN/','/api/auth/login/'],36);
 check(authBurst.every(r=>r.status===400||r.status===429),'Bounded malformed-login burst produces only validation/throttle responses');
 check(authBurst.some(r=>r.status===429),'Actual authentication IP budget returns 429 during a bounded burst');
 check(authBurst.filter(r=>r.status===400).length<=20,'Rotating X-Forwarded-For and route case cannot exceed the auth IP limit');
 check(authBurst.filter(r=>r.status===429).every(r=>Number(r.headers.get('retry-after'))>=1&&Number(r.headers.get('retry-after'))<=60),'Throttled auth responses provide a bounded Retry-After');
 const keyBurst=await burst(['/api/room-keys/claim','/api/ROOM-KEYS/CLAIM/'],16);
 check(keyBurst.every(r=>r.status===401||r.status===429),'Bounded room-key burst has no unauthenticated allocation or server failure');
 check(keyBurst.filter(r=>r.status===401).length===10&&keyBurst.filter(r=>r.status===429).length===6,'Actual room-key rate limit shares one budget across spelling and spoofed forwarding headers');
 const recovery=await Promise.all(Array.from({length:8},()=>raw('/api/health')));
 check(recovery.every(r=>r.status===200&&r.data?.status==='ok'),'Application remains responsive after both bounded abuse bursts');
 const meAfter=await account.session.request('/api/auth/me');
 check(meAfter.status===200&&meAfter.data?.id===account.user.id,'Existing authorized session remains usable after malformed-login throttling');
 const result={passed:checks.length,checks,elapsedMs:Math.round(performance.now()-started),
  boundedRequests:{login:authBurst.length,roomKey:keyBurst.length,maximumConcurrency:4},
  authStatuses:authBurst.reduce((counts:Record<string,number>,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{}),
  roomKeyStatuses:keyBurst.reduce((counts:Record<string,number>,r)=>(counts[r.status]=(counts[r.status]||0)+1,counts),{}),
  scope:'Owned loopback PostgreSQL, real GoTrue, local SMTP capture; no remote targets or volumetric DDoS claim.'};
 saveLocalFixture(h,'abuse-verification-results.json',result);
 console.log(JSON.stringify(result,null,2));
});
