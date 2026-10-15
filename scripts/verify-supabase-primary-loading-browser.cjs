/** Genuine primary session and real delayed requests in one owned browser tab.
 * Never fabricates replies/accounts or submits signup/property/key operations. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const {verifyNoticePolling}=require('./verify-supabase-primary-notice-polling-browser.cjs');
let checks=0,stage='approved browser';
const recovery=process.argv[2]==='--recovery';
const existingPrimary=process.argv[2]==='--existing-primary';
assert(process.argv.length<=3&&(!process.argv[2]||recovery||existingPrimary),'Optional --recovery or --existing-primary only');
(async()=>{
 await withApprovedPineVelaBrowser(async({evaluate,waitFor,command,base,onEvent})=>{
  if(recovery){
   const held=new Set(),responses=[];
   await command('Network.enable');
   onEvent(event=>{
    if(event.method==='Fetch.requestPaused')held.add(event.params.requestId);
    if(event.method==='Network.responseReceived'&&event.params.response.url===base+'/api/auth/me')responses.push(event.params.response.status);
   });
   try{
    for(const route of ['/user/dashboard','/register-manager']){
     stage='bounded route skeleton '+route;
     await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/auth/me',requestStage:'Request'}]});
     await command('Page.navigate',{url:base+'/?loadingRecovery='+Date.now()+'#'+route});
     await waitFor("!!document.querySelector('[data-route-loading-retry]')",'Bounded skeleton recovery '+route,50000);checks++;
     assert.equal(held.size,1,'Exactly one actual session request must be held');checks++;
     assert(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Reload page')&&!document.querySelector('main.user-dashboard-content')&&!document.body.innerText.includes('Create your manager login')"),'Unverified pages offer reload without exposing private data or bypassing registration');checks++;
     console.log(JSON.stringify({stage,passed:true,checks,providerRepliesFabricated:false}));
     const count=responses.length;
     for(const id of held){await command('Fetch.continueRequest',{requestId:id});held.delete(id);}
     await command('Fetch.disable');
     // Let the real response (including any rotated HttpOnly cookies) arrive
     // before navigating again. No authentication response is fabricated.
     const until=Date.now()+45000;
     while(responses.length===count&&Date.now()<until)await new Promise(r=>setTimeout(r,200));
     assert(responses.length>count,'Actual authentication response must drain before the next document');checks++;
    }
   }finally{
    for(const id of held)await command('Fetch.continueRequest',{requestId:id}).catch(()=>{});
    await command('Fetch.disable').catch(()=>{});
   }
   const report={passed:true,checks,realBrowser:true,heldRealAuthRequests:true,routeDeadlineMs:30000,routes:['/user/dashboard','/register-manager'],actualAuthenticationStatuses:responses,providerRepliesFabricated:false,credentialsExtracted:false,privatePagesExposedBeforeVerification:false,cloudProductMutations:0};
   await fs.writeFile('.security/migration-reset/primary-loading-recovery-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));return;
  }
  let sessionResponse;
  const pendingNotices=new Map(),maximumNoticeReads=new Map();
  const noticePaths=['/api/admin-messages/pending','/api/auth/account-access'];
  await command('Network.enable');
  onEvent(event=>{
   if(event.method==='Network.responseReceived'&&event.params.response.url===base+'/api/auth/me'&&event.params.response.status===200)sessionResponse=event.params.requestId;
   if(event.method==='Network.requestWillBeSent'){
    const url=new URL(event.params.request.url);
    if(url.origin===base&&noticePaths.includes(url.pathname)){
     pendingNotices.set(event.params.requestId,url.pathname);
     const count=[...pendingNotices.values()].filter(path=>path===url.pathname).length;
     maximumNoticeReads.set(url.pathname,Math.max(maximumNoticeReads.get(url.pathname)||0,count));
    }
   }
   if(['Network.loadingFinished','Network.loadingFailed'].includes(event.method))pendingNotices.delete(event.params.requestId);
  });
  const dashboard="!!document.querySelector('main.user-dashboard-content')";
  const manager="document.body.innerText.includes('Create your manager login')||document.body.innerText.includes('Recorded Registered Residence')||document.body.innerText.includes('Manager registration could not load')||document.body.innerText.includes('Could not check registration access')";
  stage='primary dashboard document';
  const dashboardStarted=Date.now();
  console.log(JSON.stringify({stage,existingPreparedTab:existingPrimary,credentialsExtracted:false}));
  // Force one real document restoration, including when the prepared dashboard
  // already has this hash. The helper rejects open forms before this navigation.
  await command('Page.navigate',{url:base+'/?primaryLoadingAcceptance='+Date.now()+'#/user/dashboard'});
  await waitFor("location.hash==='#/user/dashboard'&&document.readyState!=='loading'",'Primary dashboard document',45000);
  stage='primary dashboard reads';
  await waitFor(dashboard,'Real primary dashboard',90000);checks++;
  const dashboardReadyMs=Date.now()-dashboardStarted;
  assert(sessionResponse,'The application must restore its actual server-verified session');
  const me=JSON.parse((await command('Network.getResponseBody',{requestId:sessionResponse})).body);
  assert(me.role==='user'&&me.isVerified,'A genuine signed-in primary account is required');checks++;
  console.log(JSON.stringify({stage,passed:true,dashboardReadyMs,credentialsExtracted:false}));
  await evaluate("location.hash='/register-manager'");
  await waitFor(manager,'Real manager registration',65000);checks++;
  // Both route modules are loaded. Hold actual network traffic through browser
  // latency so the page's own deadline runs, while native replies stay untouched.
  await command('Network.enable');
  try{
   stage='delayed dashboard reads';
   await command('Network.emulateNetworkConditions',{offline:false,latency:35000,downloadThroughput:1000000,uploadThroughput:1000000});
   await evaluate("location.hash='/user/dashboard'");
   await waitFor(dashboard+"&&document.body.innerText.includes('Could not refresh your dashboard')",'Dashboard deadline and retry',45000);checks++;
   const dashboardState=await evaluate("(()=>({bounded:document.documentElement.scrollWidth<=innerWidth+1,retry:[...document.querySelectorAll('button')].some(b=>/Retry dashboard|Refreshing/.test(b.textContent))}))()");
   assert(dashboardState.bounded&&dashboardState.retry,'Dashboard stays usable with a visible read/retry state');checks++;
   console.log(JSON.stringify({stage,passed:true,checks}));
   stage='delayed manager registration';
   await evaluate("location.hash='/register-manager'");
   await waitFor("document.body.innerText.includes('Manager registration could not load')||document.body.innerText.includes('Could not check registration access')",'Manager deadline and retry',45000);checks++;
   assert(await evaluate("[...document.querySelectorAll('button')].some(b=>/Retry registration|Retry access check/.test(b.textContent))"),'Manager shows a retry action without bypassing the failed access check');checks++;
   console.log(JSON.stringify({stage,passed:true,checks}));
  }finally{
   await command('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  }
  stage='recovered manager registration';
  await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Retry registration'))?.click()");
  await waitFor("document.body.innerText.includes('Create your manager login')||document.body.innerText.includes('Recorded Registered Residence')",'Real saved manager registration after retry',65000);checks++;
  const workflow={passed:true,checks,genuinePrimary:true,existingPreparedTab:existingPrimary,dashboardReadyMs,actualNetworkLatencyMs:35000,managerRetryRecovered:true,observedRawNetworkNoticePeaks:Object.fromEntries(maximumNoticeReads),noticePollingVerified:false,repliesFabricated:false,credentialsExtracted:false,cloudProductMutations:0,managerSignupSubmitted:false};
  await fs.writeFile('.security/migration-reset/primary-loading-workflow-browser.json',JSON.stringify(workflow,null,2)+'\n',{mode:0o600});
  // Raw network counts span canceled requests and document replacement. Check
  // the mounted pollers with actual held requests in a stable document instead.
  stage='notice polling in a stable document';
  const notices=await verifyNoticePolling({base,command,evaluate,onEvent,waitFor});
  checks+=notices.checks;
  const report={...workflow,checks,noticePollingVerified:true,maximumHeldNoticeReads:notices.actualHeldRequestPeaks,actualNoticeResponseStatuses:notices.actualResponseStatuses};
  await fs.writeFile('.security/migration-reset/primary-loading-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
  if(existingPrimary)await evaluate("location.hash='/user/dashboard'");
 },{existingPrimary});
})().catch(error=>{console.error(JSON.stringify({passed:false,stage,checks,error:error.message,credentialsExtracted:false}));process.exitCode=1;});
