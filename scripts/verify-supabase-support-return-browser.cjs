/** Real FAQ/Help return and theme checks with owned native Auth accounts.
 * Delays real profile requests; never supplies fabricated data or sessions. */
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
  const artifacts = path.join(meta.root, 'support-return-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
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

    const held = new Set(); let holdingProfile = false, profileReads = 0;
    ws.addEventListener('message', event => {
      const m = JSON.parse(event.data);
      if(m.method==='Fetch.requestPaused') {
        profileReads++;
        if(holdingProfile) held.add(m.params.requestId);
        else command('Fetch.continueRequest',{requestId:m.params.requestId}).catch(()=>{});
      }
    });
    await command('Fetch.enable',{patterns:[{urlPattern:'*/api/student/my-profile',requestStage:'Request'},{urlPattern:'*/api/digital-market/status',requestStage:'Request'}]});
    await command('Page.addScriptToEvaluateOnNewDocument',{source:`window.__skeletonSeen=false;new MutationObserver(()=>{if(document.querySelector('[data-route-skeleton]'))window.__skeletonSeen=true}).observe(document,{subtree:true,childList:true});`});
    const release = async()=>{holdingProfile=false;for(const id of held){held.delete(id);await command('Fetch.continueRequest',{requestId:id});}};
    const waitForRead = async previous => {
      if(profileReads>previous&&held.size>0)return;
      await new Promise((resolve,reject)=>{
        const listener=()=>{if(profileReads>previous&&held.size>0){clearTimeout(timer);ws.removeEventListener('message',listener);resolve();}};
        const timer=setTimeout(()=>{ws.removeEventListener('message',listener);reject(Error('Warm return did not start a live account read'));},5000);
        ws.addEventListener('message',listener);
      });
    };
    const resetObservation = ()=>evaluate('window.__skeletonSeen=false');
    const noSkeleton = async label=>{await pause(500);check(await evaluate('!window.__skeletonSeen&&!document.querySelector("[data-route-skeleton]")'),label);};
    async function supportActive(page,theme) {
      await until(`document.querySelector('nav[aria-label="Help navigation"]')&&`+(page==='FAQ'?'document.querySelectorAll("main details").length>15':'!!document.querySelector("main textarea")'),page+' loads');
      const state=await evaluate(`(()=>{const n=document.querySelector('nav[aria-label="Help navigation"]');return {theme:document.documentElement.dataset.theme,appearance:document.documentElement.dataset.appearance,active:[...n.querySelectorAll('[aria-current="page"]')].map(e=>({text:e.textContent.trim(),background:getComputedStyle(e).backgroundImage,color:getComputedStyle(e).color})),sun:!!document.querySelector('.theme-sun,.theme-celestial'),overflow:document.documentElement.scrollWidth>innerWidth+1};})()`);
      check(state.active.length===1&&state.active[0].text===page,'Only '+page+' is active');
      check(state.active[0].background.includes('255, 195, 0')&&state.active[0].color==='rgb(0, 29, 61)','Active support destination has readable yellow/navy highlight');
      check(state.theme===theme&&state.appearance==='product','Support preserves '+theme+' product preference');
      check(!state.sun&&!state.overflow,'No decorative sun or viewport overflow');
    }
    if(process.argv[3] !== '--seller-only') {
    await signIn('reporter'); await pause(1800);
    for(const theme of ['light','dark']) {
      stage='warm support return '+theme;
      await evaluate('location.hash="/user/dashboard?tab=options"');await until('!!document.querySelector(".theme-toggle")','Appearance settings');
      await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click()`);
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`,'Saved actual theme');
      await until(`(()=>{const e=document.querySelector('.theme-toggle')?.closest('section');return e?.innerText.includes(${JSON.stringify((theme==='dark'?'Dark':'Light')+' mode is on.')})})()`,'Theme status saves');
      const label=await evaluate("document.querySelector('.theme-toggle').previousElementSibling.querySelector('p').textContent");
      check(label===(theme==='dark'?'Dark mode':'Light mode'),'Appearance label matches '+theme+' mode');
      for(const width of [1440,375]) {
        await size(width,900);await dismissWelcome();
        await click('Help');await supportActive('Help',theme);await resetObservation();
        await click('FAQ',`document.querySelector('nav[aria-label="Help navigation"]')`);await supportActive('FAQ',theme);await noSkeleton('Help to FAQ has no dashboard skeleton');
        const before=profileReads;holdingProfile=true;await resetObservation();await click('Dashboard',`document.querySelector('nav[aria-label="Help navigation"]')`);
        await until('location.hash.startsWith("#/user/dashboard")&&!!document.querySelector("[data-portal-navigation]")','Warm primary dashboard renders while profile request is paused');
        await waitForRead(before);
        await noSkeleton('Warm primary return never shows a skeleton at '+width+'px in '+theme);
        check(profileReads>before&&held.size>0,'Warm primary return still requests real updated server data');
        check(await evaluate(width===1440 ? `document.body.innerText.includes(${JSON.stringify(actors.reporter.name)})` : 'document.body.innerText.includes("Digital Student Market")'),'Previously loaded dashboard content stays visible');
        check(!await evaluate("document.querySelector('.theme-sun,.theme-celestial')"),'Product dashboard has no decorative sun');
        await screenshot('warm-primary-'+theme+'-'+width);await release();await pause(1000);
        await evaluate('location.hash="/user/dashboard?tab=options"');await until('!!document.querySelector(".theme-toggle")','Settings return');await pause(500);
      }
    }
    // A genuine new login must start cold, even though this browser saw a different account.
    await signOut('reporter');stage='real account isolation';holdingProfile=true;await resetObservation();
    // Sign in cannot await dashboard content while its genuine profile read is held.
    const otherLogin=signIn('other');await until('!!document.querySelector("[data-route-skeleton]")&&location.hash.startsWith("#/user/dashboard")','New account waits for its own actual profile');
    check(!await evaluate(`document.body.innerText.includes(${JSON.stringify(actors.reporter.name)})`),'New account cannot render prior account cached profile');
    check(held.size>0,'Cold new account waits on a real server request');await release();await otherLogin;await pause(1200);await signOut('other');
    stage='same account new session';holdingProfile=true;await resetObservation();const returningLogin=signIn('reporter');
    await until('!!document.querySelector("[data-route-skeleton]")&&location.hash.startsWith("#/user/dashboard")','New login of original account does not reuse the previous session');
    check(!await evaluate(`document.body.innerText.includes(${JSON.stringify(actors.reporter.name)})`),'Original account new session remains cold until revalidated');await release();await returningLogin;await pause(1200);await signOut('reporter');
    }
    // The seller is a genuinely approved separate portal account, with real inventory/orders.
    await signIn('seller');stage='real seller warm return';await pause(1800);const sellerTheme=await evaluate('document.documentElement.dataset.theme');await size(375,900);
    await evaluate('document.querySelector(\'[data-navigation-id="more"]\').click()');await until('!!document.querySelector(\'dialog [data-navigation-id="profile"]\')','Seller More menu');
    await evaluate('document.querySelector(\'dialog [data-navigation-id="profile"]\').click()');await until('!!document.querySelector(".theme-toggle")','Seller profile settings');
    const actualStoreName=await evaluate('document.querySelector(\'input[aria-label="Store / Market Name"]\')?.value');
    await click('Help');await supportActive('Help',sellerTheme);
    holdingProfile=true;const before=profileReads;await resetObservation();await click('Dashboard',`document.querySelector('nav[aria-label="Help navigation"]')`);
    await until('location.hash.startsWith("#/digital-market")&&!!document.querySelector("[data-portal-navigation]")','Warm seller dashboard renders during real status read');
    await waitForRead(before);
    await noSkeleton('Warm seller return has no dashboard skeleton');check(profileReads>before&&held.size>0,'Warm seller still revalidates real store status');
    await screenshot('warm-seller-mobile');await release();
    await evaluate('document.querySelector(\'[data-navigation-id="more"]\').click()');await until('!!document.querySelector(\'dialog [data-navigation-id="profile"]\')','Seller profile menu after warm return');
    await evaluate('document.querySelector(\'dialog [data-navigation-id="profile"]\').click()');await until('!!document.querySelector(".theme-toggle")','Warm seller profile settings');
    check(actualStoreName&&await evaluate('document.querySelector(\'input[aria-label="Store / Market Name"]\')?.value')===actualStoreName,'Warm seller profile draft initializes from the actual saved store');
    check(errors.length===0,'No uncaught browser exceptions');
    const sellerOnly=process.argv[3] === '--seller-only';
    const result={passed:true,checks,actualNativeLogins:sellerOnly ? 1 : 4,themes:sellerOnly ? [sellerTheme] : ['light','dark'],widths:[1440,375],warmReturns:sellerOnly ? ['seller'] : ['primary','seller'],realProfileRequestsPaused:true,crossAccountAndNewSessionIsolation:!sellerOnly,mockedApis:0,productionRecordsModified:0,artifacts};
    await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
  } catch (failure) {
    if(command)try{const r=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(path.join(artifacts,'failure.png'),Buffer.from(r.data,'base64'),{mode:0o600});}catch{}
    await fs.writeFile(path.join(artifacts,'failure.json'),JSON.stringify({stage,checks,error:failure.message,errors}),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,error:failure.message,artifacts}));process.exitCode=1;
  } finally {if(command&&ws?.readyState===WebSocket.OPEN)try{await command('Browser.close');}catch{}ws?.close();for(const p of waiting.values())clearTimeout(p.timer);}
})().catch(e=>{console.error('Owned support return verification could not start: '+e.message);process.exitCode=1;});
