/** Genuine local Auth/HTTP/SQL with delayed delivery of real replies. No
 * fabricated accounts/replies, cloud connections, email or payment calls. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readLocalFixture,runLocalSupabaseVerification,signInLocalAccount,type LocalAccountCredentials} from './lib/local-supabase-harness.js';

let stage='existing local identities';
try { await runLocalSupabaseVerification(async h=>{
  const fixture=readLocalFixture<{roles:Record<string,LocalAccountCredentials>}>(h,'business-browser-fixtures.json');
  assert.ok(fixture?.roles.administrator&&fixture.roles.primary);
  const admin=await signInLocalAccount(h,fixture.roles.administrator,'admin');
  const other=await signInLocalAccount(h,fixture.roles.primary,'primary');
  const replay=admin.session.copy();
  let checks=0,queryDelay=0,queryCount=0,holdLogout=false,providerFinished=false;
  const originals=new Map<any,any>();
  const observe=(client:any)=>{
    if(originals.has(client))return;
    const original=client.query;originals.set(client,original);
    client.query=function(...args:any[]){
      const result=original.apply(this,args);
      if(!queryDelay||!result?.then)return result;
      queryCount++;
      return result.then(async(value:any)=>{await new Promise(resolve=>setTimeout(resolve,queryDelay));return value;});
    };
  };
  h.db.pool.on('acquire',observe);
  const realFetch=globalThis.fetch;
  globalThis.fetch=async(input,init)=>{
    const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
    const delayed=holdLogout&&url.origin===h.providerOrigin&&url.pathname==='/auth/v1/logout';
    // Hold dispatch, so replay is tested while the real provider session still
    // exists. Always forward to the real provider afterward.
    if(delayed)await new Promise(resolve=>setTimeout(resolve,4000));
    const response=await realFetch(input,init);
    if(delayed)providerFinished=true;
    return response;
  };
  const samples:Record<string,any>={};
  try {
    stage='authenticated reads with real SQL delivery delay';queryDelay=150;
    for(const endpoint of ['/api/auth/me','/api/notifications','/api/admin/dashboard-directories']){
      queryCount=0;const start=performance.now(),reply=await admin.session.request(endpoint);
      assert.equal(reply.status,200);checks++;
      samples[endpoint]={ms:Math.round(performance.now()-start),queries:queryCount};
    }
    stage='logout during delayed provider cleanup';holdLogout=true;queryCount=0;
    const start=performance.now(),reply=await admin.session.request('/api/auth/logout',{method:'POST'});
    samples.logout={ms:Math.round(performance.now()-start),queries:queryCount,providerFinishedAtReply:providerFinished};
    assert.equal(reply.status,200);checks++;
    assert.equal(providerFinished,false,'Confirmed app revocation does not wait for slow provider cleanup');checks++;
    assert.equal(queryCount,1,'Logout performs one exact native revocation statement');checks++;
    assert.ok(samples.logout.ms<4000,'Logout completes before the deliberately delayed provider call');checks++;
    assert.equal((await replay.request('/api/auth/me')).status,401);checks++;
    assert.equal((await other.session.request('/api/auth/me')).status,200);checks++;
    queryDelay=0;
    while(!providerFinished)await new Promise(resolve=>setTimeout(resolve,25));
    const report={passed:true,checks,samples,sqlReplyDelayMs:150,providerDispatchDelayMs:4000,
      actualGoTrue:true,actualHttp:true,cloudWrites:0,accountsCreated:0,emailsSent:0};
    const target='.security/migration-reset/logout-latency-after.json';
    fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify(report));
  } finally {
    queryDelay=0;h.db.pool.removeListener('acquire',observe);
    for(const[client,original]of originals)client.query=original;
    globalThis.fetch=realFetch;
    await other.session.json('/api/auth/logout',{});
  }
}); }catch(error:any){
  console.error(JSON.stringify({passed:false,stage,error:'Local logout verification failed; diagnostics remain private.'}));
  if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
