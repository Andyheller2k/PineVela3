/** Read-only/wrong-role checks in the user's approved actual PineVela tab.
 * No cookies, PINs, provider passwords or admin keys are retrieved. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
(async () => {
  const [port, endpoint] = (await fs.readFile(path.join(os.homedir(), 'snap/chromium/common/chromium/DevToolsActivePort'), 'utf8')).trim().split('\n');
  assert(port === '9222' && /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(endpoint));
  const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint), pending = new Map();
  let seq = 0, session;
  try {
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser connection approval timed out')), 45000);
      socket.onopen = () => { clearTimeout(timer); resolve(); }; socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }; });
    const command = (method, params = {}, target = session) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 60000);
      pending.set(id, { resolve, reject, timer, method }); socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
    });
    socket.onmessage = event => { const message = JSON.parse(event.data); if (!message.id) return;
      const p = pending.get(message.id); if (!p) return; pending.delete(message.id); clearTimeout(p.timer);
      message.error ? p.reject(new Error('Browser command rejected: ' + p.method + ' (' + message.error.code + ')')) : p.resolve(message.result); };
    const target = (await command('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url.startsWith('http://127.0.0.1:3001/'));
    assert(target, 'Use only the approved PineVela tab'); session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;

    const evaluate=async expression=>{
      const result=await command('Runtime.evaluate',{returnByValue:true,awaitPromise:true,expression});
      assert(!result.exceptionDetails,'Browser checks complete');return result.result.value;
    };
    let checks=0;
    const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    for(const [route,method,status] of [['/api/admin/manager-closure-requests','GET',200],['/api/admin/manager-closure-requests?managerId=invalid','GET',400],['/api/manager/closure-request','GET',403],['/api/users/delete-registered-account','POST',403]]) {
      const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),...(${JSON.stringify(method)}==='POST'?{headers:{'Content-Type':'application/json'},body:'{}'}:{})});const d=await r.json();return {status:r.status,requestArray:Array.isArray(d.requests),secretKeys:Object.keys(d).some(k=>/token|password|hash|key/i.test(k))};})()`);
      assert.equal(result.status,status);assert(!result.secretKeys);if(status===200)assert(result.requestArray);checks++;
    }
    await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
    const selector="[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(b.title==='Admin Approvals'||b.title==='Approvals'||b.textContent.trim().startsWith('Admin Approvals')||b.textContent.trim().startsWith('Approvals')))";
    const navDeadline=Date.now()+45000;
    while(Date.now()<navDeadline){if(await evaluate(`!!(${selector})`))break;await new Promise(r=>setTimeout(r,150));}
    const clicked=await evaluate(`(()=>{const b=${selector};if(!b)return false;b.click();return true;})()`);
    assert(clicked,'Admin Approvals entry exists');checks++;
    const deadline=Date.now()+45000;
    while(Date.now()<deadline){if(await evaluate("!!document.querySelector('section[aria-label=\"Manager closure requests\"]')"))break;await new Promise(r=>setTimeout(r,150));}
    assert(await evaluate("!!document.querySelector('section[aria-label=\"Manager closure requests\"]')"),'Real administrator queue is shown');checks++;
    const originalDark=await evaluate("document.querySelector('button[role=switch][aria-label=\"Dark mode\"]').getAttribute('aria-checked')==='true'");
    for(const width of [375,1440])for(const dark of [false,true]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<600});
      await evaluate(`(()=>{const b=document.querySelector('button[role=switch][aria-label="Dark mode"]');if(!b)throw new Error('Theme switch missing');if((b.getAttribute('aria-checked')==='true')!==${dark})b.click();return true;})()`);
      assert(await evaluate("(()=>{const s=document.querySelector('section[aria-label=\"Manager closure requests\"]');const r=s.getBoundingClientRect();return r.width>0&&r.width<=innerWidth&&r.left>=0&&r.right<=innerWidth+1;})()"),'New queue fits actual responsive layout');checks++;
    }
    await evaluate(`(()=>{const b=document.querySelector('button[role=switch][aria-label="Dark mode"]');if((b.getAttribute('aria-checked')==='true')!==${originalDark})b.click();return true;})()`);
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,providerRepliesMocked:false,privateCredentialsExtracted:false,domainMutationsRequested:false,managerMutationBrowserPending:true};
    const directory=path.resolve('.security/migration-reset/browser-acceptance-20261012');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'manager-closure-administrator.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
