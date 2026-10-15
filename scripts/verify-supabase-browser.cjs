/** Actual replacement app and isolated Chromium profile. Guest checks only.
 * Wait for real browser/server completion, not a guessed connection duration.
 * Delays hold outgoing requests; replies, Auth identities and data are never mocked. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const s=net.createServer();s.listen(0,'127.0.0.1');await once(s,'listening');const port=s.address().port;await new Promise(resolve=>s.close(resolve));return port;}
(async()=>{
  const url=new URL(process.argv[2]||'http://127.0.0.1:3001');
  assert(process.argv.length<=3&&url.protocol==='http:'&&url.hostname==='127.0.0.1'&&url.port
    &&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password,'Pass only the running loopback replacement origin');
  const base=url.origin,health=await(await fetch(base+'/api/health',{signal:AbortSignal.timeout(30000)})).json();
  assert.equal(health.persistence,'supabase','Never run against the JSON backend');
  const root=await fs.mkdtemp('/tmp/pv-supabase-browser-'),port=await freePort();
  let chrome,socket,command,seq=0,checks=0,stage='browser startup',held,loads=0;
  const pending=new Map(),exceptions=[],network=[];
  const check=(value,label)=>{assert.ok(value,label);checks++;};
  try{
    chrome=spawn('/snap/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
      '--no-first-run',`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(root,'chrome')}`,'about:blank'],{stdio:'ignore'});
    let target;const deadline=Date.now()+30000;
    while(Date.now()<deadline){
      try{target=(await(await fetch(`http://127.0.0.1:${port}/json/list`,{signal:AbortSignal.timeout(1000)})).json()).find(t=>t.type==='page');}catch{}
      if(target||chrome.exitCode!==null)break;await pause(150);
    }
    check(target,'An isolated browser starts');
    socket=new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Browser connection timeout')),10000);socket.onopen=()=>{clearTimeout(timer);resolve();};socket.onerror=()=>{clearTimeout(timer);reject(new Error('Browser connection failed'));};});
    command=(method,params={})=>new Promise((resolve,reject)=>{
      const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},45000);
      pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
    });
    socket.onmessage=event=>{
      const m=JSON.parse(event.data);
      if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error('Browser command failed')):p.resolve(m.result);}
      else if(m.method==='Page.loadEventFired')loads++;
      else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.text);
      else if(m.method==='Fetch.requestPaused')held=m.params.requestId;
      else if(m.method==='Network.responseReceived'&&m.params.response.url.startsWith(base+'/api/')){
        const response=m.params.response;network.push({path:new URL(response.url).pathname,status:response.status});
      }
    };
    const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Browser evaluation completes');return r.result.value;};
    async function until(expression,label){const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(expression))return;await pause(150);}throw new Error(label+' did not complete before the deadline');}
    const toggle='document.querySelector(\'[role="switch"][aria-label="Dark mode"]\')';
    const login='!!document.querySelector(\'input[aria-label="Username or Email Address"]\')';
    const choices="Array.from(document.querySelectorAll('main a')).some(a=>a.textContent.trim()==='Sign in')";
    await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
    for(const width of [375,768,1440]){
      stage='login '+width;
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
      const initialLoads=loads;await command('Page.navigate',{url:base+'/#/login'});const loadDeadline=Date.now()+45000;while(loads===initialLoads&&Date.now()<loadDeadline)await pause(100);assert(loads>initialLoads,'Navigation actually loads');await until(login,'Actual login page');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Login fits '+width+'px');
      check(await evaluate(`!!${toggle}`),'The real theme switch exists');
      for(const theme of ['light','dark']){
        await until(`!!${toggle}`,'Theme switch after rendering');
        if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate(`${toggle}.click()`);
        await until(`document.documentElement.dataset.theme==='${theme}'`,'Theme switch');
        check(await evaluate(`${toggle}.getAttribute('aria-checked')==='${theme==='dark'}'`),'Switch state matches the rendered mode');
        const beforeLoad=loads;await command('Page.reload');const reloadDeadline=Date.now()+45000;while(loads===beforeLoad&&Date.now()<reloadDeadline)await pause(100);assert(loads>beforeLoad,'Reload actually loads');await until(login,'Login reload');
        check(await evaluate(`document.documentElement.dataset.theme==='${theme}'`),'Guest device preference survives reload');
        check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Theme layout fits the viewport');
      }
      await until("!!document.querySelector('input[aria-label=\"Password\"][type=password]')",'Masked password input after reload');check(true,'Password is masked');
      await evaluate("document.querySelector('button[aria-label=\"Show password\"]').click()");
      check(await evaluate("!!document.querySelector('input[aria-label=\"Password\"][type=text]')"),'The visible password control operates');
      await evaluate("document.querySelector('button[aria-label=\"Hide password\"]').click()");
      check(await evaluate("!!document.querySelector('input[aria-label=\"Password\"][type=password]')"),'The password can be masked again');
      check(await evaluate("(()=>{const input=document.querySelector('input[aria-label=\"Username or Email Address\"]');const form=input.closest('form');form.requestSubmit();return !form.checkValidity();})()"),'Empty credentials are rejected without a login request');

      stage='delayed sign-in restoration '+width;held=undefined;const start=network.length;
      await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/auth/me',requestStage:'Request'}]});
      // Missing-token invitation is actual guest input; it creates no proposal or account.
      await command('Page.navigate',{url:base+`/?browserWidth=${width}#/admin-invitation`});
      await until("document.body.innerText.includes('Checking your sign-in…')",'Honest restoring state');
      const heldDeadline=Date.now()+10000;while(!held&&Date.now()<heldDeadline)await pause(100);
      check(held,'Only the outgoing real session-check request is delayed');
      check(await evaluate('!('+choices+')'),'Sign-in choices do not flash while restoration is pending');
      await pause(1500);
      check(await evaluate("document.body.innerText.includes('Checking your sign-in…') && !document.querySelector('main a')"),'Slow restoration retains its honest pending state');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Restoring state fits the viewport');
      await command('Fetch.continueRequest',{requestId:held});await command('Fetch.disable');
      await until("document.body.innerText.includes('Open the private invitation shared by administrator #1.')",'Actual guest/missing-token resolution');
      check(network.slice(start).some(r=>r.path==='/api/auth/me'&&r.status===401),'The backend genuinely denies the unsigned session');
      check(await evaluate("!document.body.innerText.includes('Checking your sign-in…') && !document.querySelector('main form')"),'Missing invitation resolves without granting access or a credential form');
    }
    stage='guest HTTP boundaries';
    const statuses=await evaluate(`(async()=>{
      const out=[];
      for(const method of ['GET','PUT']){
        const r=await fetch('/api/auth/appearance',{method,headers:{'Content-Type':'application/json','X-PineVela-Session':'cookie'},...(method==='PUT'?{body:JSON.stringify({theme:'dark'})}:{})});out.push(r.status);
      }
      return out;
    })()`);
    check(statuses[0]===401&&statuses[1]===401,'The real browser cannot read or save account appearance without authentication');
    check(!network.some(r=>r.path==='/api/auth/login'),'No credential, login, signup or account mutation was submitted');
    check(exceptions.length===0,'No browser runtime exception occurred');
    console.log(JSON.stringify({passed:true,checks,responsiveWidths:[375,768,1440],themes:['light','dark'],
      actualBrowser:true,actualAuthReplies:true,delayedOutgoingRequests:true,completionBasedWaits:true,
      authenticatedBrowserTested:false,providerMocks:0,cloudRecordsModified:0}));
  }catch(error){console.error(JSON.stringify({passed:false,checks,stage,error:error.message}));process.exitCode=1;}
  finally{
    if(socket?.readyState===WebSocket.OPEN){try{await command('Browser.close');}catch{}socket.close();}
    for(const p of pending.values())clearTimeout(p.timer);
    if(chrome?.exitCode===null)await Promise.race([once(chrome,'exit'),pause(3000)]);
    // Remove only the disposable profile, never the user's signed-in browser.
    if(chrome?.exitCode!==null)await fs.rm(root,{recursive:true,force:true});
  }
})().catch(error=>{console.error(JSON.stringify({passed:false,stage:'startup',
  code:error.cause?.code||error.code||error.name,error:'Replacement browser verification could not start.'}));process.exitCode=1;});
