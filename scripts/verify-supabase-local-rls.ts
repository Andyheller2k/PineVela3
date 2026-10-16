/** Real confirmed identities and real application-issued JWTs against PostgREST
 * and Storage. No claims, provider replies or business relationships are seeded. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {createLocalPrimary,runLocalSupabaseVerification,saveLocalFixture,type LocalSupabaseHarness} from './lib/local-supabase-harness.js';

let checks=0,stage='owned local stack';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
async function verify(h:LocalSupabaseHarness){
 await h.assertOwned();
 const accounts=[];
 for(const label of ['rls-owner-a','rls-owner-b']){
  stage='actual confirmed identity '+label;
  const account=await createLocalPrimary(h,label);
  const login=await account.session.json('/api/auth/login',{email:account.credentials.email,password:account.credentials.password,accountKind:'primary'});
  check(login.status===200,'Native primary login returns actual cookies');
  const cookie=login.headers.getSetCookie().find(c=>c.startsWith('pv_sb_access='));
  const token=cookie?.split(';',1)[0].slice('pv_sb_access='.length);
  check(typeof token==='string'&&token.split('.').length===3,'Native access cookie contains an actual provider JWT');
  const claims=JSON.parse(Buffer.from(token!.split('.')[1],'base64url').toString());
  const identity=(await h.db.pool.query('select id,display_name from public.profiles where lower(email)=$1',[account.credentials.email])).rows[0];
  check(claims.sub===identity.id&&typeof claims.session_id==='string','Actual JWT subject matches the verified identity');
  const bound=(await h.db.pool.query('select active_context_id from private.account_sessions where session_id=$1 and auth_user_id=$2',[claims.session_id,identity.id])).rows[0];
  check(bound?.active_context_id===login.data.id,'Actual provider session is natively bound to this primary');
  accounts.push({...account,token:token!,claims,identity});
 }
 const [a,b]=accounts;
 const provider=async(route:string,token:string|undefined,options:RequestInit={})=>{
  assert.ok(/^\/(?:rest|storage)\/v1\//.test(route));
  const response=await fetch(h.providerOrigin+route,{...options,headers:{apikey:h.meta.anonKey,
   ...(token?{authorization:'Bearer '+token}:{}),...options.headers},redirect:'error',signal:AbortSignal.timeout(15000)});
  return{status:response.status,data:await response.json().catch(()=>null)};
 };
 stage='positive direct Data API ownership';
 for(const account of accounts){
  const profiles=await provider('/rest/v1/profiles?select=id,email',account.token);
  check(profiles.status===200&&Array.isArray(profiles.data)&&profiles.data.length===1&&profiles.data[0].id===account.identity.id,'Bound primary reads only its own profile through actual RLS');
  const contexts=await provider('/rest/v1/account_contexts?select=id,auth_user_id',account.token);
  check(contexts.status===200&&Array.isArray(contexts.data)&&contexts.data.length===1&&contexts.data[0].id===account.credentials.contextId,'Bound primary reads only its own account context');
 }
 stage='negative cross-account Data API';
 for(const [viewer,target]of [[a,b],[b,a]]){
  const foreign=await provider('/rest/v1/profiles?select=id,email&id=eq.'+target.identity.id,viewer.token);
  check(foreign.status===200&&Array.isArray(foreign.data)&&foreign.data.length===0,'A real foreign JWT cannot read another profile');
  const context=await provider('/rest/v1/account_contexts?select=id&id=eq.'+target.credentials.contextId,viewer.token);
  check(context.status===200&&Array.isArray(context.data)&&context.data.length===0,'A real foreign JWT cannot select another context');
  const write=await provider('/rest/v1/profiles?id=eq.'+target.identity.id,viewer.token,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'Unauthorized direct change',id:viewer.identity.id})});
  check(write.status===403,'Foreign direct profile/ownership mutation is denied');
 }
 const directOwn=await provider('/rest/v1/profiles?id=eq.'+a.identity.id,a.token,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({display_name:'Unauthorized direct own change'})});
 check(directOwn.status===403,'A primary cannot bypass application commands with a direct own-profile write');
 const promote=await provider('/rest/v1/admin_memberships',a.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({context_id:a.credentials.contextId,slot:2})});
 check(promote.status===403,'Direct administrator privilege escalation is denied');
 const privateSchema=await provider('/rest/v1/schema_migrations?select=*',a.token,{headers:{'accept-profile':'private'}});
 check(privateSchema.status===406,'Private schema is not exposed through PostgREST');
 const rpc=await provider('/rest/v1/rpc/initialize_auth_profile',a.token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({user_id:a.identity.id})});
 check(rpc.status===404,'Private account initializer is not an exposed RPC');
 const guest=await provider('/rest/v1/profiles?select=id,email',undefined);
 check([401,403].includes(guest.status)||guest.status===200&&Array.isArray(guest.data)&&guest.data.length===0,'Anonymous Data API cannot read private profiles');
 stage='real Storage authorization';
 const object='contexts/'+a.credentials.contextId+'/'+crypto.randomUUID()+'.png';
 const storage=await fetch(h.providerOrigin+'/storage/v1/object/pinevela-media/'+object,{method:'POST',headers:{apikey:h.meta.anonKey,authorization:'Bearer '+a.token,'content-type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10]),redirect:'error',signal:AbortSignal.timeout(15000)});
 const storageError=await storage.json().catch(()=>null);
 check(storage.status===403||storage.status===400&&String(storageError?.message||'').toLowerCase().includes('row-level security'),'Authenticated browser cannot bypass validated application media uploads');
 check((await h.db.pool.query('select count(*)::int as count from storage.objects where bucket_id=$1 and name=$2',['pinevela-media',object])).rows[0].count===0,'Denied direct upload created no Storage object');
 stage='persisted boundary inventory';
 const unprotected=(await h.db.pool.query("select tablename from pg_tables where schemaname='public' and not rowsecurity")).rows;
 check(unprotected.length===0,'Every public application table has RLS enabled');
 const backend=(await h.db.pool.query("select rolbypassrls,rolcanlogin from pg_roles where rolname='pinevela_backend'")).rows[0];
 check(backend?.rolbypassrls===false&&backend.rolcanlogin===false,'Application actor role is non-login and cannot bypass RLS');
 const changed=(await h.db.pool.query('select id,display_name from public.profiles where id=any($1::uuid[]) order by id',[accounts.map(x=>x.identity.id)])).rows;
 check(changed.every(row=>accounts.some(x=>x.identity.id===row.id&&x.identity.display_name===row.display_name)),'Denied writes preserved both real profiles');
 for(const account of accounts){
  check((await account.session.json('/api/auth/logout',{})).status===200,'Native logout revokes this exact session');
  const revoked=await provider('/rest/v1/profiles?select=id,email',account.token);
  check([401,403].includes(revoked.status)||revoked.status===200&&Array.isArray(revoked.data)&&revoked.data.length===0,'Previously valid JWT loses direct RLS access immediately after logout');
 }
 const result={passed:true,checks,actualGoTrue:true,actualApplicationIssuedTokens:true,actualPostgREST:true,actualStorage:true,
  crossAccountReadAndWriteDenied:true,privilegeEscalationDenied:true,immediateDatabaseRevocation:true,allPublicTablesHaveRls:true,
  cloudWrites:0,inventedTokens:0,fabricatedProviderResponses:0};
 saveLocalFixture(h,'rls-result.json',result);console.log(JSON.stringify(result));
}
try{await runLocalSupabaseVerification(verify);}catch(error){
 console.error(JSON.stringify({passed:false,stage,checks,error:'Actual local RLS verification stopped; diagnostics are private.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
