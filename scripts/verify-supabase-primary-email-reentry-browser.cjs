/** Authenticated role boundary checks in a separate approved PineVela tab. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
(async () => {
  const [port, endpoint] = (await fs.readFile(path.join(os.homedir(), 'snap/chromium/common/chromium/DevToolsActivePort'), 'utf8')).trim().split('\n');
  assert(port === '9222' && /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(endpoint));
  const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint), pending = new Map();
  let seq = 0, session, createdTarget, guestContext, guestTarget, stage='initial navigation';
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser connection approval timed out')), 45000);
      socket.onopen = () => { clearTimeout(timer); resolve(); }; socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }; });
    const command = (method, params = {}, target = session) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 60000);
      pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
    });
    socket.onmessage = event => { const message = JSON.parse(event.data); if (!message.id) return;
      const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
      if(message.error){const error=new Error('Browser command rejected: '+p.method+' ('+message.error.code+')');error.documentLoading=message.error.code===-32000&&/context|navigat/i.test(message.error.message||'');p.reject(error);}else p.resolve(message.result); };
    const existing = (await command('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3001/'));
    assert(existing, 'Use only the approved PineVela browser profile');
    createdTarget=(await command('Target.createTarget',{url:'about:blank',background:true})).targetId;
    session = (await command('Target.attachToTarget', { targetId: createdTarget, flatten: true })).sessionId;

    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression});
      if(result.exceptionDetails){await fs.writeFile(path.resolve('.security/migration-reset/system-wipe-browser-evaluation-failure.json'),JSON.stringify({stage,details:result.exceptionDetails},null,2),{mode:0o600});throw new Error('Browser evaluation failed at '+stage);}return result.result.value;
    };
    await command('Page.enable');await command('Page.navigate',{url:'http://127.0.0.1:3001/api/health'});
    for(let i=0;i<45;i++){try{if(await evaluate("document.readyState==='complete'&&location.pathname==='/api/health'"))break;}catch(e){if(!e.documentLoading)throw e;}await new Promise(r=>setTimeout(r,1000));}
    let checks=0;
    stage='verified session';const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    for(const route of ['/api/auth/primary-reentry','/api/auth/primary-reentry/verify']){
      const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{credentials:'same-origin',signal:AbortSignal.timeout(45000),method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'andyheller2k@gmail.com',authUserId:'00000000-0000-4000-8000-000000000000'})});return{status:r.status};})()`);
      assert.equal(result.status,400,'Authenticated request cannot supply a re-entry identity selector');checks++;
    }
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,guestUiCheckedSeparately:true,credentialsExtracted:false,verificationEmailsSent:false,domainWrites:false,genuineEmailOtpProviderBrowserPending:true};
    await fs.writeFile(path.resolve('.security/migration-reset/primary-email-reentry-browser.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(guestContext&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Target.disposeBrowserContext',params:{browserContextId:guestContext}}));} if(createdTarget&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Target.closeTarget',params:{targetId:createdTarget}}));} if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
