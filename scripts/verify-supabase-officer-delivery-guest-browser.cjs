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
    async function until(expression,label){const end=Date.now()+45000;while(Date.now()<end){if(await evaluate(expression))return;await pause(150);}const flags=await evaluate(`(()=>{const t=document.body.innerText;return {route:location.hash.split('?')[0],tokenLength:new URLSearchParams(location.hash.split('?')[1]).get('token')?.length,states:['Private verification officer invitation','Checking your sign-in','Use the separate official Google/email address','Open the private officer invitation shared by your PineVela administrator.','PineVela is undergoing maintenance'].filter(x=>t.includes(x))};})()`);console.log(JSON.stringify({stage,flags}));throw new Error(label+' did not complete before the deadline');}
    await command('Page.enable');await command('Runtime.enable');
    const backgrounds={};
    for(const width of[1440,768,390]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<768});
      for(const theme of['light','dark']){
        stage=width+' '+theme;await command('Page.navigate',{url:base+'/#/officer-invitation?token='+'a'.repeat(43)});
        await until("document.body.innerText.includes('Use the separate official Google/email address')",'Guest verified sign-in choices');
        await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
        const ui=await evaluate(`(()=>{const section=document.querySelector('main section'),links=[...section.querySelectorAll('a')],style=getComputedStyle(section);return {links:links.map(a=>({label:a.textContent,url:a.getAttribute('href'),height:a.getBoundingClientRect().height})),overflow:document.documentElement.scrollWidth>innerWidth+1,background:style.backgroundColor,color:style.color,prompt:section.innerText.includes('Use the separate official Google/email address')};})()`);
        if(!ui.prompt)console.log(JSON.stringify({stage,guestUi:ui}));
        check(ui.prompt&&ui.links.some(a=>a.label==='Sign in')&&ui.links.some(a=>a.label==='Sign up'),'Guest has clear verified sign-in choices');
        check(ui.links.every(a=>a.url.startsWith('#/login?next=%2Fofficer-invitation%3Ftoken%3D')&&a.height>=44)&&!ui.overflow,'Reachable responsive actions preserve strict invitation continuation');
        backgrounds[theme]=ui.background;
        const rgb=value=>value.match(/[0-9.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});
        const lum=value=>{const c=rgb(value);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
        const l=[lum(ui.background),lum(ui.color)].sort((a,b)=>b-a);check((l[0]+.05)/(l[1]+.05)>=4.5,'Readable invitation theme contrast');
      }
    }
    check(backgrounds.light!==backgrounds.dark,'Invitation responds to actual PineVela theme');
    await command('Page.navigate',{url:base+'/#/officer-invitation?token=invalid'});
    await until("document.body.innerText.includes('Open the private officer invitation shared by your PineVela administrator.')",'Invalid invitation explanation');check(true,'Malformed invitation shows recovery explanation');
    check(exceptions.length===0,'No browser runtime exception');
    const report={passed:true,checks,actualBrowser:true,responsiveWidths:[1440,768,390],themes:['light','dark'],credentialsExtracted:false,providerMocks:0,cloudRecordsModified:0,positiveOfficerProviderBrowserPending:true};
    await fs.writeFile(path.resolve('.security/migration-reset/officer-delivery-guest-browser.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
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
