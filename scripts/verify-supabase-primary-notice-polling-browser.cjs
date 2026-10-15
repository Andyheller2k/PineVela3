/** Hold actual notice reads in the prepared tab. No identities or replies are
 * fabricated, and no account, property or acknowledgement is submitted. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let stage='approved prepared tab';
async function verifyNoticePolling({base,command,evaluate,onEvent,waitFor}){
  let checks=0;
  stage='prepared real primary page';console.log(JSON.stringify({stage,connected:true,credentialsExtracted:false}));
  await waitFor("!!document.querySelector('main.user-dashboard-content')||document.body.innerText.includes('Create your manager login')",'Prepared primary page',20000);
  // The existing page has already restored authentication. Ask the real server
  // for role/verification only; never inspect cookies, storage or credentials.
  const primary=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(30000)});const d=await r.json();return {status:r.status,role:d.role,verified:d.isVerified};})()");
  assert(primary.status===200&&primary.role==='user'&&primary.verified);checks++;
  const paths=['/api/admin-messages/pending','/api/auth/account-access'];
  const held=new Map(),peaks=new Map(),released=new Map(),responses=new Map(),trace=[];
  let firstHeldAt;
  await command('Network.enable');
  const unsubscribe=onEvent(event=>{
   if(event.method==='Fetch.requestPaused'){
    const p=event.params,path=new URL(p.request.url).pathname;
    if(!paths.includes(path))return;
    firstHeldAt??=Date.now();held.set(p.requestId,{path,networkId:p.networkId});
    const count=[...held.values()].filter(v=>v.path===path).length;
    peaks.set(path,Math.max(peaks.get(path)||0,count));trace.push({path,event:'held',elapsedMs:Date.now()-firstHeldAt});
   }
   if(event.method==='Network.loadingFailed'||event.method==='Network.loadingFinished'){
    for(const [id,p] of held)if(p.networkId===event.params.requestId){held.delete(id);trace.push({path:p.path,event:'ended',elapsedMs:Date.now()-firstHeldAt});}
   }
   if(event.method==='Network.responseReceived'&&released.has(event.params.requestId))responses.set(released.get(event.params.requestId),event.params.response.status);
  });
  const release=async()=>{
   for(const [id,p] of held){released.set(p.networkId,p.path);await command('Fetch.continueRequest',{requestId:id});held.delete(id);}
   await command('Fetch.disable');
  };
  try{
   stage='holding actual pending reads';
   await command('Fetch.enable',{patterns:paths.map(path=>({urlPattern:base+path,requestStage:'Request'}))});
   await evaluate("window.dispatchEvent(new Event('pinevela-data-change'));document.dispatchEvent(new Event('visibilitychange'))");
   const until=Date.now()+22000;
   while(paths.some(path=>![...held.values()].some(p=>p.path===path))&&Date.now()<until)await pause(100);
   assert(paths.every(path=>[...held.values()].some(p=>p.path===path)),'Both real notice requests must be held');checks++;
   assert(Date.now()-firstHeldAt<18000,'The sample must leave time for the actual native replies');
   stage='coalescing repeated refresh triggers';
   await evaluate("for(let i=0;i<10;i++){window.dispatchEvent(new Event('pinevela-data-change'));document.dispatchEvent(new Event('visibilitychange'));}");
   // Keep the earliest request below its real 30-second deadline. Timer/focus/
   // event attempts exercise the same production refresh gate while it waits.
   const sampleMs=Math.min(16000,19000-(Date.now()-firstHeldAt));
   await pause(sampleMs);
   for(const path of paths){assert.equal(peaks.get(path),1,'Only one pending production read: '+path);checks++;}
   assert.equal(held.size,2,'Repeated triggers must share the two pending operations');checks++;
   console.log(JSON.stringify({stage,checks,actualHeldRequestPeaks:Object.fromEntries(peaks),sampleMs}));
   stage='actual native replies';await release();
   const deadline=Date.now()+20000;
   while(responses.size<2&&Date.now()<deadline)await pause(100);
   for(const path of paths){assert.equal(responses.get(path),200,'The real authorized response must succeed: '+path);checks++;}
   const report={passed:true,checks,genuinePrimary:true,existingPreparedTab:true,heldActualRequests:true,repliesFabricated:false,credentialsExtracted:false,actualHeldRequestPeaks:Object.fromEntries(peaks),actualResponseStatuses:Object.fromEntries(responses),cloudProductMutations:0,trace};
   await fs.writeFile('.security/migration-reset/primary-notice-polling-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({...report,trace:undefined}));
   await evaluate("location.hash='/user/dashboard'");
   return report;
  }catch(error){
   console.error(JSON.stringify({stage,checks,actualHeldRequestPeaks:Object.fromEntries(peaks),actualResponseStatuses:Object.fromEntries(responses),trace}));throw error;
  }finally{await release().catch(()=>{});unsubscribe();}
}
module.exports={verifyNoticePolling};
if(require.main===module){
 const interactive=process.argv[2]==='--interactive';
 assert(process.argv.length<=3&&(!process.argv[2]||interactive),'Optional --interactive only');
 (async()=>{
  await withApprovedPineVelaBrowser(async context=>{
   let passed=false;
   const run=async()=>{try{await verifyNoticePolling(context);passed=true;}catch(error){passed=false;console.error(JSON.stringify({passed:false,stage,error:error.message,connectionRetained:interactive,credentialsExtracted:false}));if(!interactive)throw error;}};
   await run();
   if(interactive){
    const lines=require('node:readline').createInterface({input:process.stdin,terminal:false});
    console.log(JSON.stringify({connectionRetained:true,commands:['status','retry','close']}));
    for await(const input of lines){
     const command=input.trim();
     if(command==='close')break;
     if(command==='retry'){await run();continue;}
     if(command==='status'){
      try{console.log(JSON.stringify({status:await context.evaluate("({route:location.hash.split('?')[0],dashboard:!!document.querySelector('main.user-dashboard-content'),managerReady:document.body.innerText.includes('Create your manager login'),recovery:!!document.querySelector('[data-route-loading-retry]')})")}));}
      catch(error){console.error(JSON.stringify({error:error.message}));}
     }else console.log(JSON.stringify({error:'Use status, retry or close'}));
    }
    lines.close();
   }
   if(!passed)process.exitCode=1;
  },{existingPrimary:true,approvalTimeoutMs:interactive?120000:45000});
 })().catch(error=>{console.error(JSON.stringify({passed:false,stage,error:error.message,credentialsExtracted:false}));process.exitCode=1;});
}
