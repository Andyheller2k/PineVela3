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
    await command('Page.enable');await command('Page.bringToFront');
    let checks=0;
    const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified};})()");
    assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine verified administrator is required');checks++;
    const cases=[
      ['/api/admin/governance/preview','POST',400,{scopes:['total','users']}],
      ['/api/admin/governance/preview?userId=00000000-0000-4000-8000-000000000000','POST',400,{scopes:['users']}],
      ['/api/admin/governance/preview','POST',409,{scopes:['users']},{'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'}],
      ['/api/admin/governance/proposals','POST',403,{scopes:['users'],reason:'Review only',fingerprint:'0'.repeat(64)}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/vote','POST',403,{decision:'approved'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/founder-review','POST',403,{decision:'approve-backup',reason:'Review only',confirmation:'APPROVE WIPE BACKUP'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/execute','POST',403,{}],
      ['/api/admin/clear-all-registered-accounts','POST',410,{}],
    ];
    for(const [route,method,status,body={},extra={}]of cases){
      const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json',...${JSON.stringify(extra)}},body:${JSON.stringify(JSON.stringify(body))}});return {status:r.status};})()`);
      assert(result.status===status,'Wipe review authorization/selector boundaries must hold');checks++;
    }
    const preview=await evaluate(`(async()=>{const r=await fetch('/api/admin/governance/preview',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopes:['users']}),signal:AbortSignal.timeout(45000)});const x=await r.json();return{status:r.status,ready:x.ready,execution:x.executionAvailable,protectedAdmins:x.preview.accounts.every(a=>a.kind!=='admin'),retained:Object.values(x.preview.retention).every(Boolean),roster:x.preview.roster.length};})()`);
    assert(preview.status===200&&!preview.execution&&preview.protectedAdmins&&preview.retained,'Actual native preview preserves administrators and verified login/history');checks++;
    const opened=await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Admin Approvals'));if(button)button.click();return !!button;})()`);
    assert(opened,'Actual administrator approvals navigation is available');checks++;
    let visible=false;for(let i=0;i<45;i++){visible=await evaluate(`!!document.querySelector('section[aria-label="System wipe reviews"]')`);if(visible)break;await new Promise(r=>setTimeout(r,1000));}assert(visible,'Actual wipe review controls load');checks++;
    await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');s.scrollIntoView({block:'center'});[...s.querySelectorAll('label')].find(l=>l.textContent.startsWith('Primary users')).querySelector('input').click();})()`);
    await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');[...s.querySelectorAll('button')].find(b=>b.textContent==='Preview selected scope').click();})()`);
    let reviewed=false;for(let i=0;i<45;i++){reviewed=await evaluate(`!!document.querySelector('section[aria-label="Exact system wipe scope"]')`);if(reviewed)break;await new Promise(r=>setTimeout(r,1000));}assert(reviewed,'Actual UI displays read-only native preview');checks++;
    for(const [width,height]of[[1440,900],[375,812]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      const state=await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');return {six:s.querySelectorAll('input[type="checkbox"]').length===6,bounded:s.scrollWidth<=s.clientWidth+1,gate:s.textContent.includes('Execution remains disabled'),saveDisabled:[...s.querySelectorAll('button')].find(b=>b.textContent==='Save review and my single approval')?.disabled};})()`);
      assert(state.six&&state.bounded&&state.gate&&state.saveDisabled,'Responsive actual preview stays bounded and cannot be proposed without own key');checks++;
    }
    const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,providerRepliesMocked:false,privateCredentialsExtracted:false,successfulConsentWritesRequested:false,executionAvailable:false,genuineFiveAdminBrowserConsentPending:true};
    const directory=path.resolve('.security/migration-reset/browser-acceptance-20261012');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,'system-wipe-review-administrator.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
