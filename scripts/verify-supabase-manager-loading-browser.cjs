/** Actual primary session, manager form, read deadlines and ownership denials.
 * No credentials, fake replies, signups or property submissions. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const interactive=process.argv[2]==='--interactive';
assert(process.argv.length<=3&&(!process.argv[2]||interactive),'Optional --interactive only');
const formReady="document.body.innerText.includes('Create your manager login')&&[...document.querySelectorAll('button')].some(b=>['Verify manager account with Google','Check saved verification','Continue with verified manager account'].includes(b.textContent.trim()))";
const statusExpression="({route:location.hash.split('?')[0],formReady:("+formReady+"),failed:document.body.innerText.includes('Manager registration could not load'),recovery:!!document.querySelector('[data-route-loading-retry]')})";
let stage='approved prepared primary tab';
async function verify({base,evaluate,waitFor,command,onEvent}){
 let checks=0,phase='normal',meResponse;
 const reads=new Map(),held=new Set(),snapshot='/api/users/manager-onboarding';
 const oldPaths=['/api/auth/enrollments','/api/auth/enrollments/policy','/api/users/manager-restriction'];
 const unsubscribe=onEvent(event=>{
  const p=event.params;
  if(event.method==='Network.requestWillBeSent'){
   const u=new URL(p.request.url);
   if(u.origin===base&&[snapshot,...oldPaths].includes(u.pathname))reads.set(p.requestId,{path:u.pathname,phase,started:Date.now()});
  }
  if(event.method==='Network.responseReceived'){
   if(p.response.url===base+'/api/auth/me'&&p.response.status===200)meResponse=p.requestId;
   const r=reads.get(p.requestId);
   if(r){r.status=p.response.status;r.headerMs=Date.now()-r.started;
    if(p.response.timing){r.beforeSendMs=Math.round(p.response.timing.sendStart);r.serverWaitMs=Math.round(p.response.timing.receiveHeadersStart-p.response.timing.sendEnd);}}
  }
  if(event.method==='Network.loadingFailed'){const r=reads.get(p.requestId);if(r)r.failed=true;}
  if(event.method==='Fetch.requestPaused'&&p.request.url===base+snapshot)held.add(p.requestId);
 });
 const release=async()=>{for(const id of held){await command('Fetch.continueRequest',{requestId:id}).catch(()=>{});held.delete(id);}await command('Fetch.disable');};
 try{
  stage='actual manager form';console.log(JSON.stringify({stage,connected:true}));
  await command('Network.enable');
  await command('Page.navigate',{url:base+'/?managerLoadingAcceptance='+Date.now()+'#/register-manager'});
  await waitFor(formReady,'Actual ready manager verification form',90000);checks++;
  assert(meResponse,'Actual restored session response is required');
  const me=JSON.parse((await command('Network.getResponseBody',{requestId:meResponse})).body);
  assert(me.role==='user'&&me.isVerified);checks++;
  const normal=[...reads.values()].filter(r=>r.phase==='normal');
  assert.equal(normal.filter(r=>r.path===snapshot).length,1,'One snapshot loads the parent and actual enrollment form');checks++;
  assert(!normal.some(r=>oldPaths.includes(r.path)),'The form must not repeat legacy onboarding reads');checks++;
  assert.equal(normal.find(r=>r.path===snapshot).status,200);checks++;
  console.log(JSON.stringify({stage,checks,normalReads:normal.map(({started,...r})=>r)}));
  stage='actual stale-account and selector denials';phase='denials';
  const denials=await evaluate("Promise.all([['?userId=other-account',{}],['',{'X-PineVela-Profile-Context':'other-account'}],['',{'X-PineVela-Account-Context':'other-account'}]].map(async([query,headers])=>{const r=await fetch('/api/users/manager-onboarding'+query,{headers,signal:AbortSignal.timeout(30000)});const d=await r.json();return {status:r.status,privateRowsReturned:'enrollments'in d||'registrations'in d};}))");
  assert.deepEqual(denials.map(d=>d.status),[400,409,409]);checks++;
  assert(denials.every(d=>!d.privateRowsReturned));checks++;
  stage='actual held onboarding read';phase='held';
  await command('Fetch.enable',{patterns:[{urlPattern:base+snapshot,requestStage:'Request'}]});
  await evaluate("location.hash='/user/dashboard'");
  await waitFor("!document.body.innerText.includes('Create your manager login')",'Manager route unmounted',20000);
  await evaluate("location.hash='/register-manager'");
  await waitFor("document.body.innerText.includes('Manager registration could not load')&&[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry registration')",'Bounded onboarding failure and retry',45000);checks++;
  assert.equal(held.size,1,'One actual snapshot request is held');checks++;
  assert(!(await evaluate(formReady)),'Failed access read cannot expose the registration form');checks++;
  await release();
  stage='one retry restores the complete form';phase='retry';
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry registration').click()");
  await waitFor(formReady,'Recovered actual manager verification form',45000);checks++;
  const retries=[...reads.values()].filter(r=>r.phase==='retry');
  assert.equal(retries.filter(r=>r.path===snapshot).length,1,'Retry makes one complete authorized read');checks++;
  assert(!retries.some(r=>oldPaths.includes(r.path)));checks++;
  assert.equal(retries.find(r=>r.path===snapshot).status,200);checks++;
  const report={passed:true,checks,genuinePrimary:true,actualManagerFormReady:true,normalSnapshotRequests:1,retrySnapshotRequests:1,duplicateLegacyOnboardingReads:0,heldActualRead:true,repliesFabricated:false,credentialsExtracted:false,cloudProductMutations:0,readTimings:[...reads.values()].map(({started,...r})=>r)};
  await fs.writeFile('.security/migration-reset/manager-loading-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));return report;
 }catch(error){console.error(JSON.stringify({stage,checks,readTimings:[...reads.values()].map(({started,...r})=>r)}));throw error;}
 finally{await release().catch(()=>{});unsubscribe();}
}
(async()=>{
 await withApprovedPineVelaBrowser(async context=>{
  let passed=false;
  const run=async()=>{try{await verify(context);passed=true;}catch(error){passed=false;console.error(JSON.stringify({passed:false,stage,error:error.message,connectionRetained:interactive}));if(!interactive)throw error;}};
  await run();
  if(interactive){
   const lines=require('node:readline').createInterface({input:process.stdin,terminal:false});
   console.log(JSON.stringify({connectionRetained:true,commands:['status','verify','close']}));
   for await(const line of lines){
    if(line.trim()==='close')break;
    if(line.trim()==='verify'){await run();continue;}
    if(line.trim()==='status')console.log(JSON.stringify({status:await context.evaluate(statusExpression)}));
    else console.log(JSON.stringify({error:'Use status, verify or close'}));
   }
   lines.close();
  }
  if(!passed)process.exitCode=1;
 },{existingPrimary:true,approvalTimeoutMs:interactive?120000:45000});
})().catch(error=>{console.error(JSON.stringify({passed:false,stage,error:error.message,credentialsExtracted:false}));process.exitCode=1;});
