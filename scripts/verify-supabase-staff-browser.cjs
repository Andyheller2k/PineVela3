/** Actual built replacement backend and Chromium, guest denial only. No fixture
 * records, intercepted responses, credentials, signup or email delivery. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const value=server.address().port;await new Promise(resolve=>server.close(resolve));return value;}
(async()=>{
  const appPort=await port(),chromePort=await port(),base=`http://127.0.0.1:${appPort}`;
  const tmp=await fs.mkdtemp('/tmp/pinevela-staff-browser-');
  let server,chrome,socket,seq=0,checks=0;const pending=new Map(),errors=[];
  try{
    server=spawn(process.execPath,['dist-supabase-backend/supabase-server.mjs'],{env:{...process.env,NODE_ENV:'production',PINEVELA_MIGRATION_PORT:String(appPort)},stdio:'ignore'});
    let ready=false;for(let i=0;i<200;i++){try{ready=(await fetch(base+'/api/health',{signal:AbortSignal.timeout(500)})).ok;}catch{}if(ready)break;if(server.exitCode!==null)break;await pause(100);}
    assert(ready,'Replacement server starts');
    chrome=spawn('/snap/bin/chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run',`--remote-debugging-port=${chromePort}`,`--user-data-dir=${path.join(tmp,'chrome')}`,'about:blank'],{stdio:'ignore'});
    let target;for(let i=0;i<200;i++){try{target=(await(await fetch(`http://127.0.0.1:${chromePort}/json/list`,{signal:AbortSignal.timeout(500)})).json()).find(t=>t.type==='page');}catch{}if(target)break;await pause(100);}assert(target,'Chromium starts');
    socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage=event=>{const m=JSON.parse(event.data);if(m.id){const p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);};
    const evaluate=async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!result.exceptionDetails,'Browser evaluation succeeds');return result.result.value;};
    await command('Page.enable');await command('Runtime.enable');
    await command('Page.navigate',{url:base+'/#/staff-invitation?token=invalid'});
    let loaded=false;for(let i=0;i<200;i++){loaded=await evaluate("document.body.innerText.includes('This staff invitation is unavailable.')");if(loaded)break;await pause(100);}assert(loaded,'Invalid invitation shows actual server denial');checks++;
    for(const width of [375,768,1440]){
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
      for(const dark of [false,true]){
        // Exercise the real theme toggle where present, rather than replacing responses.
        const theme=await evaluate("document.documentElement.dataset.theme==='dark'");
        if(theme!==dark){assert(await evaluate("(()=>{const button=document.querySelector('[role=switch][aria-label=\"Dark mode\"]');if(!button)return false;button.click();return true;})()"),'Theme control available');await pause(100);}
        assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Invitation page fits viewport');checks++;
        assert(await evaluate("!!document.querySelector('main [role=alert]') && !document.querySelector('main form')"),'Invalid invitation never displays credential form');checks++;
        const screenshot=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/pinevela-staff-invitation-${width}-${dark?'dark':'light'}.png`,Buffer.from(screenshot.data,'base64'));
      }
    }
    assert.deepEqual(errors,[],'No browser runtime exceptions');checks++;
    console.log(JSON.stringify({checks,responsiveThemes:[375,768,1440],guestDenialPassed:true,positiveProviderFlowTested:false,cloudRecordsModified:0}));
  }finally{
    if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++seq,method:'Browser.close'}));await pause(250);socket.close();}
    for(const p of pending.values())clearTimeout(p.timer);
    if(server && server.exitCode===null){server.kill('SIGTERM');await Promise.race([once(server,'exit'),pause(3000)]);if(server.exitCode===null)server.kill('SIGKILL');}
    // Browser.close handles Snap/AppArmor; remove only this test's profile.
    await fs.rm(tmp,{recursive:true,force:true});
  }
})().catch(()=>{console.error('Guest staff invitation browser verification failed.');process.exitCode=1;});
