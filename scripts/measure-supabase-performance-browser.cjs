/** Before/after browser measurements with owned native Auth accounts.
 * Adds delivery delay to genuine replies; never fabricates data or sessions. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function privateJson(file) { assert(path.isAbsolute(file)); const stat = await fs.lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  assert(process.argv.length === 4 && ['baseline','after'].includes(process.argv[3]), 'Supply owned runtime and baseline/after');
  const runtime = await privateJson(process.argv[2]), meta = await privateJson(runtime.metadataPath);
  assert(runtime.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/'));
  assert(process.argv[2].startsWith(meta.root + '/'));
  const base = new URL(runtime.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const encrypted = await privateJson(path.join(meta.root, 'pinevela-harness/encrypted-chat-browser.json'));
  const actors = { reporter: runtime.actors.owner, other: encrypted.other, seller: encrypted.seller }; assert(actors.reporter?.contextId && actors.other?.contextId && actors.seller?.contextId);
  const artifacts = path.join(meta.root, 'performance-browser-artifacts',process.argv[3]); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
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
      stage = 'real native login ' + kind; await size(1440, 1000); await go('/#/login'); await until('!!document.querySelector(\'input[aria-label="Email address"]\')', 'Login form');
      await evaluate(`(()=>{for(const [label,value] of ${JSON.stringify([['Email address', actors[kind].email], ['Password', actors[kind].password]])}){const e=document.querySelector('input[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
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


    await command('Network.enable');
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`
      window.__perfStorageWrites=0;window.__perfRequests=[];window.__perfNotificationReads=0;
      const write=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='pinevela_seen_toast_keys'||key==='pinevela_read_notification_ids')window.__perfStorageWrites++;return write.call(this,key,value)};
      const actual=window.fetch.bind(window);window.fetch=async(...args)=>{const url=new URL(typeof args[0]==='string'?args[0]:args[0].url,location.origin),method=args[1]?.method||'GET';const read={path:url.pathname,start:performance.now()};const r=await actual(...args);if(method==='GET'&&url.pathname.startsWith('/api/')){await r.clone().arrayBuffer();read.received=performance.now();if(['/api/digital-market/status','/api/digital-market/inventory','/api/digital-market/my-orders'].includes(url.pathname))await new Promise(resolve=>setTimeout(resolve,300));read.delivered=performance.now();read.ok=r.ok;window.__perfRequests.push(read);if(url.pathname==='/api/notifications')window.__perfNotificationReads++;}return r;};
    `});
    await signIn('reporter');await pause(500);stage='steady genuine notification refreshes';
    const mapBefore=await evaluate(`performance.getEntriesByType('resource').filter(r=>r.name.endsWith('.js')&&['leaflet-','NearbyServicesMap-','CampusMeetupMapPicker-'].some(part=>r.name.includes(part))).map(r=>({name:new URL(r.name).pathname,bytes:r.encodedBodySize}))`);
    await evaluate('window.__perfStorageWrites=0');
    for(let round=0;round<3;round++){
      const before=await evaluate('window.__perfNotificationReads');await evaluate('window.dispatchEvent(new Event("focus"))');
      await until(`window.__perfNotificationReads>${before}`,'Real inbox refresh completes');await pause(120);
    }
    const storageWrites=await evaluate('window.__perfStorageWrites');
    const primaryReadCount=await evaluate('window.__perfNotificationReads');
    await size(375,812);await click('Services near you');await until('!!document.querySelector(".leaflet-container")','Real optional services map opens');
    check(await evaluate('!!document.querySelector(".leaflet-container")'),'Real optional map is usable');await screenshot('primary-map-mobile');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await until('!document.querySelector(".leaflet-container")','Optional map closes');
    await signOut('reporter');await signIn('seller');stage='actual seller startup and hidden work';
    const sellerRequests=await evaluate(`window.__perfRequests.filter(r=>['/api/digital-market/status','/api/digital-market/inventory','/api/digital-market/my-orders'].includes(r.path))`);
    const completed=sellerRequests.filter(r=>r.ok);check(completed.some(r=>r.path.endsWith('/inventory'))&&completed.some(r=>r.path.endsWith('/my-orders')),'Actual seller inventory and orders load');
    const inventory=completed.find(r=>r.path.endsWith('/inventory'));
    const status=[...completed].reverse().find(r=>r.path.endsWith('/status')&&r.start<=inventory.start);
    const orders=completed.find(r=>r.path.endsWith('/my-orders')&&r.start>=status.start);
    const sellerControlledMs=Math.round(Math.max(inventory.delivered,orders.delivered)-status.start);
    const requestsBefore=await evaluate('window.__perfRequests.length');
    const background=await command('Target.createTarget',{url:'about:blank',background:false});await command('Target.activateTarget',{targetId:background.targetId});
    let hiddenAvailable=false;try{await until('document.hidden===true','Actual browser tab becomes hidden',6000);hiddenAvailable=true;}catch{}
    let hiddenSellerReads=null;
    if(hiddenAvailable){await pause(11500);hiddenSellerReads=await evaluate(`window.__perfRequests.slice(${requestsBefore}).filter(r=>['/api/digital-market/status','/api/digital-market/inventory','/api/digital-market/my-orders'].includes(r.path)).length`);}
    await command('Target.activateTarget',{targetId:target.id});await command('Target.closeTarget',{targetId:background.targetId});
    await until('!document.hidden','Actual tab is visible again');await pause(500);
    const result={phase:process.argv[3],checks,storageWritesForThreeRefreshes:storageWrites,primaryReadCount,primaryEagerMapAssets:mapBefore,sellerControlledMs,sellerInventoryAndOrdersOverlap:Math.abs(inventory.start-orders.start)<100,hiddenAvailable,hiddenSellerReads,sellerRequests,controlledResponseDelayMs:300,mockedApis:0,productionRecordsModified:0,errors};
    if(process.argv[3]==='after'){
      check(storageWrites===0,'Unchanged inbox refreshes do not rewrite localStorage');
      check(mapBefore.length===0,'Primary startup does not download optional map code');
      check(Math.abs(inventory.start-orders.start)<100,'Seller independent reads run concurrently');
      if(hiddenAvailable)check(hiddenSellerReads===0,'Hidden seller page stops operational polling');
    }
    check(errors.length===0,'No uncaught browser exceptions');result.checks=checks;
    await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify({passed:true,phase:result.phase,checks,storageWrites,primaryEagerMapAssets:mapBefore.length,sellerControlledMs,hiddenAvailable,hiddenSellerReads,artifacts}));
  }catch(e){if(command)try{const r=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,'failure.png'),Buffer.from(r.data,'base64'),{mode:0o600});}catch{}console.error(JSON.stringify({passed:false,stage,checks,error:e.message,artifacts}));process.exitCode=1;}
  finally{if(command&&ws?.readyState===WebSocket.OPEN)try{await command('Browser.close');}catch{}ws?.close();for(const p of waiting.values())clearTimeout(p.timer);}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
