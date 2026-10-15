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
    createdTarget=(await command('Target.createTarget',{url:'about:blank',background:true,...(existing.browserContextId?{browserContextId:existing.browserContextId}:{})})).targetId;
    session = (await command('Target.attachToTarget', { targetId: createdTarget, flatten: true })).sessionId;

    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression});
      if(result.exceptionDetails){await fs.writeFile(path.resolve('.security/migration-reset/officer-delivery-browser-evaluation-failure.json'),JSON.stringify({stage,details:result.exceptionDetails},null,2),{mode:0o600});throw new Error('Browser evaluation failed at '+stage);}return result.result.value;
    };
    await command('Page.enable');await command('Page.navigate',{url:'http://127.0.0.1:3001/api/health'});
    for(let i=0;i<45;i++){try{if(await evaluate("document.readyState==='complete'&&location.pathname==='/api/health'"))break;}catch(e){if(!e.documentLoading)throw e;}await new Promise(r=>setTimeout(r,1000));}
    let checks=0;
    stage='verified session';const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    const request=async(method,path,body,headers={})=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),headers:${JSON.stringify({'Content-Type':'application/json',...headers})},${method==='GET'?'':`body:JSON.stringify(${JSON.stringify(body)}),`} });const j=await r.json();return {status:r.status,array:Array.isArray(j),keys:Array.isArray(j)?[]:Object.keys(j),cache:r.headers.get('cache-control')};})()`);
    for(const route of ['/api/admin/digital-market/stores','/api/admin/manager-restrictions','/api/verification-teams/invitations']){
      const r=await request('GET',route);assert.equal(r.status,200);assert(r.array);assert.match(r.cache,/no-store/);checks++;
    }
    for(const route of ['/api/admin/digital-market/stores','/api/admin/manager-restrictions']){
      assert.equal((await request('GET',route+'?userId=00000000-0000-4000-8000-000000000000')).status,400);checks++;
      assert.equal((await request('GET',route,undefined,{'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'})).status,409);checks++;
    }
    for(const path of ['/api/room-keys/send-digital','/api/auth/officer-invitation/inspect','/api/auth/officer-invitation/accept']){
      assert.equal((await request('POST',path,{})).status,403);checks++;
    }
    // Keep the task tab visible so real route exit animations receive browser frames.
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    await command('Page.bringToFront');
    stage='administrator officer UI';await command('Page.navigate',{url:'http://127.0.0.1:3001/#/admin/dashboard'});
    async function until(expression,label){const end=Date.now()+60000;while(Date.now()<end){try{if(await evaluate(expression))return;}catch(e){if(!e.documentLoading)throw e;}await new Promise(r=>setTimeout(r,200));}const flags=await evaluate(`(()=>{const t=document.body.innerText;return {route:location.hash.split('?')[0],viewport:{width:innerWidth,height:innerHeight},ready:document.readyState,buttons:[...document.querySelectorAll('button')].slice(0,18).map(b=>b.textContent.trim()),tokenLength:new URLSearchParams(location.hash.split('?')[1]).get('token')?.length,states:['Private verification officer invitation','Checking your sign-in','Use the separate official Google/email address','Administrator and other portal identities cannot become verification officers.','Open the private officer invitation shared by your PineVela administrator.','PineVela is undergoing maintenance','This page could not load','Access Denied'].filter(x=>t.includes(x))};})()`);await fs.writeFile(path.resolve('.security/migration-reset/officer-delivery-browser-ui-state.json'),JSON.stringify({stage,flags},null,2),{mode:0o600});throw new Error(label+' did not load');}
    const managers="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&(/^Managers(?: & Staffs)?$/.test(b.innerText.trim())||b.innerText.includes('Managers & Staffs')))";
    await until('!!('+managers+')','Administrator navigation');await evaluate('('+managers+').click()');
    const officers="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&b.textContent.includes('Field Officers ('))";
    await until('!!('+officers+')','Field Officers tab');await evaluate('('+officers+').click()');
    await until("!!document.querySelector('section[aria-label=\"Verified officer invitations\"]')",'Verified officer invitation controls');
    const fields=await evaluate(`(()=>{const s=document.querySelector('section[aria-label="Verified officer invitations"]');return {labels:[...s.querySelectorAll('label')].map(l=>l.textContent),passwordInputs:s.querySelectorAll('input[type="password"]').length,submit:[...s.querySelectorAll('button')].some(b=>b.textContent==='Create private invitation'),legacy:document.body.innerText.includes('Register New Verification Officer')||document.body.innerText.includes('Credentials Card')};})()`);
    assert(fields.labels.includes('Official verified email')&&fields.labels.includes('Your administrator approval key')&&fields.passwordInputs===1&&fields.submit&&!fields.legacy);checks++;
    stage='administrator cannot adopt officer identity';await command('Page.navigate',{url:'http://127.0.0.1:3001/?officerBoundary=1#/officer-invitation?token='+'a'.repeat(43)});
    await until("document.body.innerText.includes('Administrator and other portal identities cannot become verification officers.')",'Officer identity boundary explanation');checks++;
    const still=await request('GET','/api/auth/me');assert.equal(still.status,200);checks++;
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,guestUiCheckedSeparately:true,credentialsExtracted:false,providerSignupsRequested:false,domainWrites:false,positiveOfficerProviderBrowserPending:true,positiveManagerDeliveryBrowserPending:true};
    await fs.writeFile(path.resolve('.security/migration-reset/officer-delivery-browser.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(guestContext&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Target.disposeBrowserContext',params:{browserContextId:guestContext}}));} if(createdTarget&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Target.closeTarget',params:{targetId:createdTarget}}));} if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
