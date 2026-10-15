/** Read-only/wrong-role checks in a separate approved PineVela profile tab.
 * No cookies, PINs, provider passwords or admin keys are retrieved. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const uiOnly = process.argv.slice(2).join(' ') === '--ui-only';
if (process.argv.length > 2 && !uiOnly) throw new Error('Only --ui-only is accepted.');
(async () => {
  const [port, endpoint] = (await fs.readFile(path.join(os.homedir(), 'snap/chromium/common/chromium/DevToolsActivePort'), 'utf8')).trim().split('\n');
  assert(port === '9222' && /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(endpoint));
  const socket = new WebSocket('ws://127.0.0.1:' + port + endpoint), pending = new Map();
  let seq = 0, session, createdTarget, stage='initial navigation';
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
    if (!uiOnly) {
    const cases=[
      ['/api/admin/governance/preview','POST',400,{scopes:['total','users']}],
      ['/api/admin/governance/preview?userId=00000000-0000-4000-8000-000000000000','POST',400,{scopes:['users']}],
      ['/api/admin/governance/preview','POST',409,{scopes:['users']},{'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'}],
      ['/api/admin/governance/proposals','POST',403,{scopes:['users'],reason:'Review only',fingerprint:'0'.repeat(64)}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/vote','POST',403,{decision:'approved'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/founder-review','POST',403,{decision:'approve-backup',reason:'Review only',confirmation:'APPROVE WIPE BACKUP'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/execute','POST',403,{}],
      ['/api/admin/clear-all-registered-accounts','POST',410,{}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/pause','POST',403,{confirmation:'PAUSE REVIEWED WIPE'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/authorize-execution','POST',403,{confirmation:'AUTHORIZE REVIEWED WIPE'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/pause','POST',400,{confirmation:'PAUSE REVIEWED WIPE',userId:'00000000-0000-4000-8000-000000000000'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/authorize-execution','POST',400,{verified:true}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/pause?userId=00000000-0000-4000-8000-000000000000','POST',400,{}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/authorize-execution','POST',409,{}, {'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/prepare','POST',403,{confirmation:'START WIPE BACKUP'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/cancel-preparation','POST',403,{reason:'Review only'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/prepare','POST',400,{confirmation:'START WIPE BACKUP',checkpointId:'00000000-0000-4000-8000-000000000000'}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/cancel-preparation','POST',400,{reason:'Review only',verified:true}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/prepare?userId=00000000-0000-4000-8000-000000000000','POST',400,{}],
      ['/api/admin/governance/proposals/00000000-0000-4000-8000-000000000000/prepare','POST',409,{}, {'X-PineVela-Account-Context':'00000000-0000-4000-8000-000000000000'}],
    ];
    for(const [route,method,status,body={},extra={}]of cases){
      stage='API denial '+route;const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json',...${JSON.stringify(extra)}},body:${JSON.stringify(JSON.stringify(body))}});return {status:r.status};})()`);
      console.log(JSON.stringify({stage:'API denial',route,expected:status,actual:result.status}));
      assert(result.status===status,'Wipe review authorization/selector boundary failed at '+route+' (expected '+status+', actual '+result.status+')');checks++;
    }
    console.log(JSON.stringify({stage:'API denials complete',checks,passed:true}));
    stage='native preview';const preview=await evaluate(`(async()=>{const r=await fetch('/api/admin/governance/preview',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({scopes:['users']}),signal:AbortSignal.timeout(45000)});const x=await r.json();return{status:r.status,ready:x.ready,execution:x.executionAvailable,protectedAdmins:x.preview?.accounts.every(a=>a.kind!=='admin'),retained:x.preview?Object.values(x.preview.retention).every(Boolean):false,roster:x.preview?.roster.length};})()`);
    assert(preview.status===200&&!preview.execution&&preview.protectedAdmins&&preview.retained,'Actual native preview preserves administrators and verified login/history');checks++;
    stage='preparation capabilities';const capabilities=await evaluate(`(async()=>{const r=await fetch('/api/admin/governance',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const x=await r.json();return{status:r.status,preparation:x.capabilities.wipePreparation,pause:x.capabilities.wipePause,consent:x.capabilities.wipeFinalConsent,execution:x.capabilities.wipes,noPrivateBindings:!JSON.stringify(x).includes('checkpoint_id')};})()`);assert(capabilities.status===200&&capabilities.preparation&&capabilities.pause&&capabilities.consent&&!capabilities.execution&&capabilities.noPrivateBindings,'Actual preparation capability is available while execution stays disabled');checks++;
    console.log(JSON.stringify({stage:'Native preview and capabilities complete',checks,passed:true}));
    }
    stage='administrator navigation';await command('Page.navigate',{url:'http://127.0.0.1:3001/#/admin/dashboard'});let ready=false;for(let i=0;i<45;i++){try{ready=await evaluate(`document.readyState==='complete'&&!![...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Admin Approvals'))`);}catch(e){if(!e.documentLoading)throw e;}if(ready)break;await new Promise(r=>setTimeout(r,1000));}if(!ready){const state=await evaluate(`(()=>({readyState:document.readyState,adminRoute:location.hash.startsWith('#/admin/dashboard'),loginRoute:location.hash.startsWith('#/login'),retryNotice:!!document.getElementById('session-retry-title'),rootHasContent:!!document.getElementById('root')?.childElementCount,buttonCount:document.querySelectorAll('button').length,moduleRequests:performance.getEntriesByType('resource').filter(r=>r.name.includes('/src/')).length}))()`);console.log(JSON.stringify({stage:'Dashboard readiness diagnostics',...state}));await fs.writeFile(path.resolve('.security/migration-reset/system-wipe-dashboard-readiness.json'),JSON.stringify(state,null,2),{mode:0o600});}assert(ready,'Dedicated administrator app loads');
    stage='greeting style';const greeting=await evaluate(`(()=>{const h=[...document.querySelectorAll('h2')].find(h=>h.textContent.startsWith('Welcome back,'));if(!h)return null;const c=getComputedStyle(h);return{color:c.color,theme:document.documentElement.dataset.theme,blackClass:h.classList.contains('text-black'),size:parseFloat(c.fontSize),shadow:c.textShadow,stroke:c.webkitTextStrokeWidth};})()`);assert(greeting?.blackClass&&(greeting.theme==='dark'?greeting.color!=='rgb(0, 0, 0)':greeting.color==='rgb(0, 0, 0)')&&greeting.size>=30&&greeting.shadow==='none'&&parseFloat(greeting.stroke)===0,'Greeting is large flat black text');checks++;
    stage='open approvals';const opened=await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Admin Approvals'));if(button)button.click();return !!button;})()`);
    assert(opened,'Actual administrator approvals navigation is available');checks++;
    let visible=false;for(let i=0;i<45;i++){visible=await evaluate(`!!document.querySelector('section[aria-label="System wipe reviews"]')`);if(visible)break;await new Promise(r=>setTimeout(r,1000));}assert(visible,'Actual wipe review controls load');checks++;
    stage='choose primary scope';await evaluate(`(()=>{const original=window.fetch;window.__pvPreview={started:false};window.fetch=function(...args){const input=args[0];const selected=new URL(input instanceof Request?input.url:String(input),location.origin).pathname==='/api/admin/governance/preview';const at=performance.now();if(selected)window.__pvPreview={started:true};return original.apply(this,args).then(r=>{if(selected)window.__pvPreview={started:true,status:r.status,ms:Math.round(performance.now()-at)};return r;},e=>{if(selected)window.__pvPreview={started:true,timeout:e?.name==='TimeoutError'||e?.name==='AbortError',ms:Math.round(performance.now()-at)};throw e;});};const s=document.querySelector('section[aria-label="System wipe reviews"]');s.scrollIntoView({block:'center'});const chosen=[...s.querySelectorAll('label')].find(l=>l.textContent.startsWith('Primary users')).querySelector('input');if(!chosen.checked)chosen.click();})()`);
    await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');[...s.querySelectorAll('button')].find(b=>b.textContent==='Preview selected scope').click();})()`);
    stage='render preview';let reviewed=false;for(let i=0;i<45;i++){reviewed=await evaluate(`!!document.querySelector('section[aria-label="Exact system wipe scope"]')`);if(reviewed)break;await new Promise(r=>setTimeout(r,1000));}if(!reviewed){const state=await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]'),alert=s?.querySelector('[role="alert"]')?.textContent||'';return{panelPresent:!!s,checked:s?.querySelectorAll('input[type="checkbox"]:checked').length,timeout:/timeout|timed out|aborted/i.test(alert),connection:/database|connection|unavailable/i.test(alert),session:/sign in|account changed/i.test(alert),busy:[...s?.querySelectorAll('button')||[]].some(b=>b.textContent==='Please wait…'),request:window.__pvPreview};})()`);await fs.writeFile(path.resolve('.security/migration-reset/system-wipe-preview-ui-diagnostics.json'),JSON.stringify(state,null,2),{mode:0o600});console.log(JSON.stringify({stage:'Actual preview UI diagnostics',...state}));}assert(reviewed,'Actual UI displays read-only native preview');checks++;
    for(const [width,height]of[[1440,900],[375,812]]){
      await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
      stage='responsive controls';const state=await evaluate(`(()=>{const s=document.querySelector('section[aria-label="System wipe reviews"]');return {six:s.querySelectorAll('input[type="checkbox"]').length===6,bounded:s.scrollWidth<=s.clientWidth+1,gate:s.textContent.includes('Execution remains disabled'),saveDisabled:[...s.querySelectorAll('button')].find(b=>b.textContent==='Save review and my single approval')?.disabled};})()`);
      assert(state.six&&state.bounded&&state.gate&&state.saveDisabled,'Responsive actual preview stays bounded and cannot be proposed without own key');checks++;
    }
    const result={passed:true,checks,uiOnly,genuineAdministrator:true,actualReplies:true,providerRepliesMocked:false,privateCredentialsExtracted:false,successfulConsentWritesRequested:false,executionAvailable:false,genuineFiveAdminBrowserConsentPending:true};
    const directory=path.resolve('.security/migration-reset/browser-acceptance-20261013');await fs.mkdir(directory,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(directory,uiOnly?'system-wipe-pause-administrator-ui.json':'system-wipe-pause-administrator.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
  } finally { if(createdTarget&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Target.closeTarget',params:{targetId:createdTarget}}));} if(session&&socket.readyState===WebSocket.OPEN){const id=++seq;socket.send(JSON.stringify({id,method:'Emulation.clearDeviceMetricsOverride',sessionId:session}));}for (const p of pending.values()) clearTimeout(p.timer); socket.close(); }
})().catch(e => { console.error(JSON.stringify({ passed: false, error: e.message, credentialsExtracted: false })); process.exitCode = 1; });
