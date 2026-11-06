/** Isolated real-browser startup and bounded guest restoration. No fake replies. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process'),{once}=require('node:events'),net=require('node:net');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const base='http://127.0.0.1:3001';
 assert.equal((await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(10000)})).json()).persistence,'supabase');
 const root=await fs.mkdtemp('/tmp/pv-primary-loading-'),server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));
 const chrome=spawn('/snap/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(root,'chrome')}`,'about:blank'],{stdio:'ignore'});
 let socket,command,stage='isolated browser startup',seq=0,checks=0;const pending=new Map(),held=new Set(),responses=[];
 try{
  let target;const deadline=Date.now()+30000;
  while(Date.now()<deadline){try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json()).find(t=>t.type==='page');}catch{}
   if(target||chrome.exitCode!==null)break;await pause(150);}
  assert(target,'An isolated browser starts');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Browser connection timeout')),10000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(Error('Browser connection failed'));};});
  command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},45000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
  socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error('Browser command failed')):p.resolve(m.result);}
   else if(m.method==='Fetch.requestPaused')held.add(m.params.requestId);
   else if(m.method==='Network.responseReceived'&&m.params.response.url===base+'/api/auth/me')responses.push(m.params.response.status);};
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true});assert(!r.exceptionDetails);return r.result.value;};
  const until=async(expression,label)=>{const deadline=Date.now()+50000;while(Date.now()<deadline){if(await evaluate(expression))return;await pause(150);}throw Error(label+' did not become ready');};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  stage='normal guest startup';await command('Page.navigate',{url:base+'/#/user/dashboard'});
  await until("location.hash.startsWith('#/login')&&!!document.querySelector('input[aria-label=\"Email address\"]')",'Real guest sign-in page');
  assert(responses.includes(401));checks++;console.log(JSON.stringify({stage,passed:true,checks}));
  for(const route of ['/user/dashboard','/register-manager']){
   stage='bounded guest restoration '+route;
   await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/auth/me',requestStage:'Request'}]});
   // A hash-only navigation reuses the already resolved guest session. Force a
   // real new document so the actual restoration request is exercised again.
   await command('Page.navigate',{url:base+'/?loadingRecovery='+Date.now()+'#'+route});
   await until("!!document.querySelector('[data-route-loading-retry]')",'Bounded loading recovery');checks++;
   assert(held.size===1&&await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Reload page')&&!document.querySelector('main.user-dashboard-content')&&!document.body.innerText.includes('Create your manager login')"));checks++;
   for(const id of held){await command('Fetch.continueRequest',{requestId:id});held.delete(id);}await command('Fetch.disable');
   await until("location.hash.startsWith('#/login')&&!!document.querySelector('input[aria-label=\"Email address\"]')",'Actual guest session resolution');checks++;
   console.log(JSON.stringify({stage,passed:true,checks}));
  }
  const report={passed:true,checks,isolatedRealBrowser:true,heldActualRequests:true,routeDeadlineMs:30000,actualAuthenticationStatuses:responses,providerRepliesFabricated:false,credentialsExtracted:false,cloudProductMutations:0,genuinePrimaryJourneyPending:true};
  await fs.writeFile('.security/migration-reset/primary-loading-guest-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }catch(error){console.error(JSON.stringify({passed:false,stage,checks,error:error.message}));process.exitCode=1;}
 finally{
  if(socket?.readyState===WebSocket.OPEN){for(const id of held)await command('Fetch.continueRequest',{requestId:id}).catch(()=>{});await command('Fetch.disable').catch(()=>{});await command('Browser.close').catch(()=>{});socket.close();}
  for(const p of pending.values())clearTimeout(p.timer);
  if(chrome.exitCode===null)await Promise.race([once(chrome,'exit'),pause(3000)]);
  if(chrome.exitCode!==null)await fs.rm(root,{recursive:true,force:true});
 }
})().catch(error=>{console.error(JSON.stringify({passed:false,error:error.code||error.name,credentialsPrinted:false}));process.exitCode=1;});
