/** Real viewport read acknowledgements, stale fetches and fresh arrivals.
 * Uses actual native Auth and support replies on the owned isolated stack. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function privateJson(file) { assert(path.isAbsolute(file)); const stat = await fs.lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  assert(process.argv.length === 3 || process.argv.length === 4 && process.argv[3] === '--seller-only', 'Supply owned support runtime path and optional --seller-only');
  const runtime = await privateJson(process.argv[2]), meta = await privateJson(runtime.metadataPath);
  assert(runtime.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/'));
  assert(process.argv[2].startsWith(meta.root + '/'));
  const base = new URL(runtime.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const encrypted = await privateJson(path.join(meta.root, 'pinevela-harness/encrypted-chat-browser.json'));
  const actors = { reporter: runtime.actors.owner, other: encrypted.other, seller: encrypted.seller }; assert(actors.reporter?.contextId && actors.other?.contextId && actors.seller?.contextId);
  const artifacts = path.join(meta.root, 'notification-viewport-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const profile = await fs.mkdtemp('/tmp/pinevela-nav-chrome-');
  const chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws, sequence = 0, command, evaluate, stage = 'browser startup', checks = 0;
  const waiting = new Map(), errors = [], check = (value, label) => { assert(value, label); checks++; };
  try {
    let target; for (let attempt = 0; attempt < 150; attempt++) { try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json())).find(item => item.type === 'page'); } catch {} if (target || chrome.exitCode !== null) break; await pause(200); }
    check(target, 'Isolated browser starts'); ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(Error('Browser command timeout')); }, 40000); waiting.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = event => { const response = JSON.parse(event.data); if (response.id) { const pending = waiting.get(response.id); if (!pending) return; waiting.delete(response.id); clearTimeout(pending.timer); response.error ? pending.reject(Error('Browser command failed')) : pending.resolve(response.result); } else if (response.method === 'Runtime.exceptionThrown') errors.push(response.params.exceptionDetails.text); };
    await command('Page.enable'); await command('Runtime.enable');
    evaluate = async expression => { const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (value.exceptionDetails) throw Error('Browser evaluation failed at ' + stage); return value.result.value; };
    async function until(expression, label, timeout = 45000) { const expires = Date.now() + timeout; while (Date.now() < expires) { try { if (await evaluate(expression)) return; } catch {} await pause(150); } throw Error(label + ' at ' + stage); }
    async function go(route) { const url = new URL(route, base.origin); assert(url.origin === base.origin); await command('Page.navigate', { url: url.href }); await until('document.readyState==="complete"', 'Document loads'); }
    async function size(width, height) { await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
    async function click(text, scope = 'document') { await evaluate(`(()=>{const b=[...${scope}.querySelectorAll('button,a')].find(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Missing control');b.click()})()`); }
    async function fillLabel(label, value) { await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.getClientRects().length&&l.textContent.trim().startsWith(${JSON.stringify(label)}));const e=l?.querySelector('input,textarea,select');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); }
    async function screenshot(name) { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); }
    async function dismissWelcome() { await evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))if(/Welcome/.test(d.getAttribute('aria-label')||''))d.querySelector('button[aria-label="Close dialog"]')?.click()})()`); }
    async function signIn(kind) {
      stage = 'real native login ' + kind; await size(1440, 1000); await go('/#/login'); await until('!!document.querySelector(\'input[aria-label="Username or Email Address"]\')', 'Login form');
      await evaluate(`(()=>{for(const [label,value] of ${JSON.stringify([['Username or Email Address', actors[kind].email], ['Password', actors[kind].password]])}){const e=document.querySelector('input[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      await evaluate('document.querySelector(\'input[aria-label="Password"]\').closest("form").requestSubmit()');
      const destination = kind === 'seller' ? '#/digital-market' : '#/user/dashboard';
      await until(`location.hash.split('?')[0]===${JSON.stringify(destination)}&&!!document.querySelector('[data-portal-navigation]')`, 'Genuine account destination'); await dismissWelcome();
      check(await evaluate(`(async()=>{const r=await fetch('/api/auth/me');return r.ok&&(await r.json()).id===${JSON.stringify(actors[kind].contextId)}})()`), 'Native session belongs to selected account');
    }
    async function signOut(kind) {
      if (kind !== 'agent') { await evaluate('location.hash='+JSON.stringify(kind === 'seller' ? '/digital-market' : '/user/dashboard')); await until('!!document.querySelector("[data-portal-navigation]")', 'Dashboard'); await dismissWelcome(); }
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)));if(!b)throw Error('Missing sign out');b.click()})()`);
      if (kind !== 'agent') { await until('!!document.querySelector("dialog[open]")', 'Logout confirmation'); await evaluate(`(()=>{const d=document.querySelector('dialog[open]');const b=[...d.querySelectorAll('button')].find(b=>/Sign Out|Sign out|Confirm|Yes,/.test(b.textContent));if(!b)throw Error('Missing logout confirmation');b.click()})()`); }
      await until('location.hash.startsWith("#/login")', 'Logout completes');
    }


    let agentCookie='';
    const fixture=await privateJson(path.join(meta.root,'pinevela-harness/support-browser.json'));
    async function operatorRequest(route,body){
      const r=await fetch(new URL(route,base),{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:base.origin,...(agentCookie?{Cookie:agentCookie}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
      if(route==='/api/auth/login')agentCookie=r.headers.getSetCookie().map(c=>c.split(';',1)[0]).join('; ');
      const data=await r.json();assert.equal(r.status,200,'Actual local operator request succeeds');return data;
    }
    async function newReply(label){
      const ticket=await operatorRequest('/api/customer-service/tickets/'+fixture.ticketId);
      const body=label+' '+Date.now();await operatorRequest('/api/customer-service/tickets/'+fixture.ticketId+'/replies',{body,internal:false,requestKey:crypto.randomUUID(),version:ticket.version});return body;
    }
    stage='actual support replies prepare unread arrivals';
    const agent=await operatorRequest('/api/auth/login',{email:runtime.actors.agent.email,password:runtime.actors.agent.password});
    check(agent.id===runtime.actors.agent.contextId,'Genuine invited operator session');
    for(let i=0;i<3;i++)await newReply('Notification delivery check: this support response should become read only when its card is visible.');
    const writes=[];
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data);if(m.method==='Network.requestWillBeSent'){const r=m.params.request,p=new URL(r.url).pathname;if(r.method==='PUT'&&/^\/api\/notifications\/[a-f0-9-]{36}\/read$/.test(p))writes.push(p.split('/')[3]);}});
    await command('Network.enable');await signIn('reporter');await pause(700);await size(375,420);
    const ownNotices=()=>evaluate('(async()=>{const r=await (window.__notificationOriginalFetch||window.fetch)("/api/notifications");if(!r.ok)throw Error("Own inbox unavailable");return r.json()})()');
    const badge=()=>evaluate('Number(document.querySelector(\'[data-portal-navigation="mobile"] [data-navigation-id="notifications"] .ux-nav-badge\')?.textContent||0)');
    const initial=await ownNotices();check(initial.filter(n=>!n.read).length>=3,'Real delivered unread notifications exist');
    await until(`Number(document.querySelector('[data-portal-navigation="mobile"] [data-navigation-id="notifications"] .ux-nav-badge')?.textContent||0)===${initial.filter(n=>!n.read).length}`,'Initial badge matches real unread count');
    // Hold the actual old GET Response; no response body, identity or session is invented.
    await evaluate(`(()=>{const original=window.fetch.bind(window);window.__notificationOriginalFetch=original;window.__holdNotificationGet=true;window.fetch=async(...args)=>{const response=await original(...args),url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.origin);if(url.pathname==='/api/notifications'&&(!args[1]?.method||args[1].method==='GET')&&window.__holdNotificationGet){window.__holdNotificationGet=false;window.__oldNotificationSnapshot=await response.clone().json();return new Promise(resolve=>{window.__releaseNotificationGet=()=>resolve(response);});}return response;};window.dispatchEvent(new Event('focus'));})()`);
    await until('typeof window.__releaseNotificationGet==="function"','A genuine old unread response is held');
    stage='in viewport only and real modal occlusion';
    await evaluate('location.hash="/user/dashboard?tab=notifications"');await until('document.querySelectorAll("[data-notification-id]").length>=3','Real notification cards render');
    const noticeId=await evaluate(`(()=>{const unread=new Set(${JSON.stringify(initial.filter(n=>!n.read).map(n=>n.id))});return [...document.querySelectorAll('[data-notification-id]')].reverse().find(e=>unread.has(e.dataset.notificationId)&&e.getBoundingClientRect().top>innerHeight)?.dataset.notificationId})()`);
    check(noticeId,'A real unread notification is below the viewport');await pause(300);
    check((await ownNotices()).find(n=>n.id===noticeId)?.read===false,'Off-screen notification remains unread');
    await evaluate(`(()=>{const b=[...document.querySelectorAll('button[title="Sign Out"]')].find(e=>e.getClientRects().length);if(!b)throw Error('No sign out control');b.click()})()`);
    await until('!!document.querySelector(\'dialog[aria-label="Sign Out Confirmation"][open]\')','Actual modal covers the inbox');
    await evaluate(`document.querySelector('[data-notification-id="${noticeId}"]').scrollIntoView({block:'center'})`);await pause(450);
    check((await ownNotices()).find(n=>n.id===noticeId)?.read===false&&!writes.includes(noticeId),'Covered notification is not acknowledged');
    await click('Cancel','document.querySelector(\'dialog[aria-label="Sign Out Confirmation"]\')');
    await until(`(async()=>{const r=await window.__notificationOriginalFetch('/api/notifications');return (await r.json()).find(n=>n.id===${JSON.stringify(noticeId)})?.read===true})()`,'Visible card persists read state without a click');
    check(writes.filter(id=>id===noticeId).length===1,'Visible card has exactly one read acknowledgement');
    check((await ownNotices()).some(n=>!n.read),'Unseen notifications are still counted');
    await evaluate('window.__releaseNotificationGet();delete window.__releaseNotificationGet;');await pause(800);
    check(await evaluate(`document.querySelector('[data-notification-id="${noticeId}"]').className.includes('bg-slate-50')`),'A delayed old unread fetch cannot restore the read styling');
    const after=await ownNotices();check(await badge()===after.filter(n=>!n.read).length,'Badge drops to the real remaining unread count');
    stage='read persistence and genuinely new arrival';
    await evaluate('location.hash="/user/dashboard?tab=home"');await until('!!document.querySelector(".market-price-toggle")','Home opens');await pause(300);
    const beforeNew=await ownNotices(),beforeNewCount=beforeNew.filter(n=>!n.read).length;
    const freshBody=await newReply('Checking a new notification arrival after the previous cards were viewed.');
    const newNotice=(await ownNotices()).find(n=>n.message===freshBody);check(newNotice&&!newNotice.read,'New actual support response arrives unread');
    await evaluate('window.dispatchEvent(new Event("focus"))');
    await until(`Number(document.querySelector('[data-portal-navigation="mobile"] [data-navigation-id="notifications"] .ux-nav-badge')?.textContent||0)===${beforeNewCount+1}`,'Only the fresh notice adds one unread badge');
    check((await ownNotices()).find(n=>n.id===newNotice.id)?.read===false,'Home/toast visibility does not read an inbox notification');
    check((await ownNotices()).find(n=>n.id===noticeId)?.read===true,'Previously viewed notice remains read after refresh');
    await evaluate('location.hash="/user/dashboard?tab=notifications"');await until(`!!document.querySelector('[data-notification-id="${newNotice.id}"]')`,'Fresh card renders');
    await evaluate(`document.querySelector('[data-notification-id="${newNotice.id}"]').scrollIntoView({block:'center'})`);
    await until(`(async()=>{const r=await window.__notificationOriginalFetch('/api/notifications');return (await r.json()).find(n=>n.id===${JSON.stringify(newNotice.id)})?.read===true})()`,'Fresh card is read when it enters the viewport');
    await pause(400);check(writes.filter(id=>id===newNotice.id).length===1,'New notice is acknowledged once');
    await go('/#/user/dashboard?tab=home');await until('!!document.querySelector(".market-price-toggle")','Actual reload restores session');
    check((await ownNotices()).find(n=>n.id===newNotice.id)?.read===true,'Read state survives a document reload');
    stage='genuine account switch isolation';await signOut('reporter');await signIn('other');await size(375,900);
    const otherNotices=await ownNotices();check(!otherNotices.some(n=>initial.some(original=>original.id===n.id)||n.id===newNotice.id),'Different real account never inherits the first account inbox');
    const forbidden=await evaluate(`(async()=>{const r=await fetch('/api/notifications/${noticeId}/read',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({contextId:${JSON.stringify(actors.reporter.contextId)}})});return r.status})()`);
    check(forbidden===404,'Direct browser ownership spoof is rejected');
    check(errors.length===0,'No uncaught browser exceptions');
    const result={passed:true,checks,realNativeAccounts:3,realSupportReplies:4,offscreenAndModalProtected:true,actualStaleResponseDelayed:true,persistentReads:true,newArrivalBadge:true,accountIsolation:true,mockedApis:0,productionRecordsModified:0,artifacts};
    await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
  }catch(e){if(command)try{const r=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,'failure.png'),Buffer.from(r.data,'base64'),{mode:0o600});}catch{}await fs.writeFile(path.join(artifacts,'failure.json'),JSON.stringify({stage,checks,error:e.message,errors}),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,error:e.message,artifacts}));process.exitCode=1;}
  finally{if(command&&ws?.readyState===WebSocket.OPEN)try{await command('Browser.close');}catch{}ws?.close();for(const p of waiting.values())clearTimeout(p.timer);}
})().catch(e=>{console.error('Owned notification verification could not start: '+e.message);process.exitCode=1;});
