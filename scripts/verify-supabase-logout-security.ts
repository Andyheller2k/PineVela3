/** Real retained local identities, provider tokens, PostgreSQL locks and HTTP.
 * Network failure/latency changes transport only; no response is fabricated. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readLocalFixture,runLocalSupabaseVerification,type LocalAccountCredentials} from './lib/local-supabase-harness.js';
import type {VerifiedActor} from '../supabase/db.js';

let checks=0,stage='retained isolated accounts';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return{promise,resolve};};
try{await runLocalSupabaseVerification(async h=>{
  const fixtures=readLocalFixture<{roles:Record<string,LocalAccountCredentials>}>(h,'business-browser-fixtures.json');
  assert.ok(fixtures);
  const login=async(key:string)=>{
    const credentials=fixtures.roles[key],session=h.session();
    const reply=await session.json('/api/auth/login',{email:credentials.email,password:credentials.password,accountKind:credentials.accountKind});
    assert.equal(reply.status,200);
    const line=reply.headers.getSetCookie().find(value=>value.startsWith('pv_sb_access='));assert.ok(line);
    const token=decodeURIComponent(line.split(';',1)[0].slice('pv_sb_access='.length));
    const claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    return{session,token,actor:{authUserId:claims.sub,sessionId:claims.session_id,contextId:reply.data.id,kind:credentials.accountKind!} as VerifiedActor};
  };
  const a=await login('administrator'),b=await login('primary');
  const realFetch=globalThis.fetch,cleanupStarted=deferred(),allowCleanup=deferred(),cleanupDone=deferred();
  let failVerification=false,holdCleanup=true;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
    const provider=url.origin===h.providerOrigin;
    if(failVerification&&provider&&url.pathname==='/auth/v1/user')
      return realFetch(input,{...init,signal:AbortSignal.abort()});
    const hold=holdCleanup&&provider&&url.pathname==='/auth/v1/logout';
    if(hold){cleanupStarted.resolve();await allowCleanup.promise;}
    try{return await realFetch(input,init);}finally{if(hold)cleanupDone.resolve();}
  };
  try{
    stage='cross-site logout denial';
    check((await a.session.request('/api/auth/logout',{method:'POST',headers:{origin:'https://unrelated.invalid','sec-fetch-site':'cross-site'}})).status===403,'Cross-site logout is denied');
    check((await a.session.request('/api/auth/me')).status===200,'Cross-site denial preserves the actual session');
    stage='authentication network failure';failVerification=true;
    const unavailable=await a.session.request('/api/auth/logout',{method:'POST'});
    check(unavailable.status===503,'An actual provider transport failure never claims successful sign-out');
    check(!unavailable.headers.getSetCookie().some(value=>/max-age=0|expires=Thu, 01 Jan 1970/i.test(value)),'Failed verification preserves cookies for retry');
    failVerification=false;
    check((await a.session.request('/api/auth/me')).status===200,'The same session can retry after transport recovery');
    stage='native revocation before delayed provider cleanup';
    const replay=a.session.copy();
    const reply=await a.session.json('/api/auth/logout',{sessionId:b.actor.sessionId,userId:b.actor.authUserId,contextId:b.actor.contextId});
    check(reply.status===200,'Verified logout succeeds despite untrusted selectors');
    await cleanupStarted.promise;
    check((await h.db.statement('select 1 from auth.sessions where id=$1',[a.actor.sessionId])).rowCount===1,'Real provider session still exists while cleanup dispatch is held');
    check((await h.db.statement('select 1 from private.account_sessions where session_id=$1',[a.actor.sessionId])).rowCount===0,'Own app binding is already durably revoked');
    check((await replay.request('/api/auth/me')).status===401,'Copied original cookies cannot read the old account');
    check((await replay.json('/api/auth/context',{contextId:a.actor.contextId})).status===401,'Context switching cannot recreate a revoked binding');
    const direct=await realFetch(h.providerOrigin+'/rest/v1/profiles?select=id',{headers:{apikey:h.meta.anonKey,authorization:'Bearer '+a.token}});
    const rows=await direct.json();check(direct.status===200&&Array.isArray(rows)&&rows.length===0,'Direct Data API RLS denies the still-valid JWT after app revocation');
    check((await b.session.request('/api/auth/me')).status===200,'Body selectors cannot revoke another actual user');
    allowCleanup.resolve();await cleanupDone.promise;holdCleanup=false;
    check((await h.db.statement('select 1 from auth.sessions where id=$1',[a.actor.sessionId])).rowCount===0,'Background local-scope cleanup deletes the native provider session');
    check((await replay.request('/api/auth/me')).status===401,'Replay remains denied after provider cleanup');
    stage='concurrent operation retains its transaction lock';
    const c=await login('administrator'),old=c.session.copy(),entered=deferred(),release=deferred();
    const read=h.db.readActor(c.actor,async client=>{await client.query('select current_user');entered.resolve();await release.promise;});
    await entered.promise;
    let finished=false;
    const logout=c.session.request('/api/auth/logout',{method:'POST'}).then(result=>{finished=true;return result;});
    try{await new Promise(resolve=>setTimeout(resolve,300));check(!finished,'Logout never confirms before an existing authorized read releases its binding lock');}
    finally{release.resolve();await read;}
    check((await logout).status===200,'Logout commits after the preceding authorized transaction finishes');
    check((await old.request('/api/auth/me')).status===401,'Original concurrent session cannot be reused after confirmation');
    check((await b.session.request('/api/auth/me')).status===200,'Unrelated user remains signed in after concurrent logout');
    check((await c.session.json('/api/auth/logout',{})).status===200,'Repeated signed-out logout is idempotent');
    stage='native keyed maintenance transition';
    const d=await login('administrator');
    const administrator=readLocalFixture<{administrators:LocalAccountCredentials[]}>(h,'administrator-fixtures.json')!
      .administrators.find(account=>account.contextId===d.actor.contextId);
    assert.ok(administrator?.settingsKey,'Use the existing genuinely issued local settings key');
    check((await d.session.request('/api/settings')).data?.maintenanceMode===false,'Isolated test begins with maintenance disabled');
    const toggle=(enabled:boolean)=>d.session.json('/api/settings',{settingsKey:administrator.settingsKey,maintenanceMode:enabled,
      ...(!enabled?{maintenanceRecoveryMessage:'Local verification finished.'}:{})});
    try{
      check((await toggle(true)).status===200,'Actual settings-key workflow enables local maintenance');
      check((await b.session.request('/api/notifications')).status===503,'Non-admin HTTP requests are denied during maintenance');
      check((await d.session.request('/api/notifications')).status===200,'Verified administrator recovery reads remain available');
      let ran=false;
      for(const read of [()=>h.db.readActor(b.actor,async()=>{ran=true;}),()=>h.db.authorizedRead(b.actor,['primary'],async()=>{ran=true;})]){
        await assert.rejects(read,(error:any)=>error.status===503&&error.code==='platform_maintenance');checks++;
      }
      check(!ran,'Both batched transaction types deny protected work during maintenance');
      check((await b.session.json('/api/auth/logout',{})).status===200,'A non-admin can still revoke its session during maintenance');
    }finally{
      check((await toggle(false)).status===200,'Native keyed workflow restores availability after the local test');
      await d.session.json('/api/auth/logout',{});
    }
    const report={passed:true,checks,actualGoTrue:true,actualHttp:true,actualDatabaseLocks:true,
      copiedCookieReplayDenied:true,directRlsReplayDenied:true,unrelatedSessionsPreserved:true,
      outageDoesNotClaimSuccess:true,cloudWrites:0,accountsCreated:0,emailsSent:0,paystackRequests:0};
    fs.writeFileSync('.security/migration-reset/logout-security.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(report));
  }finally{failVerification=false;holdCleanup=false;allowCleanup.resolve();globalThis.fetch=realFetch;await b.session.json('/api/auth/logout',{});}
});}catch(error:any){
  console.error(JSON.stringify({passed:false,stage,checks,error:'Native logout security verification failed; private diagnostics retained.'}));
  if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
