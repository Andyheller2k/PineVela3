/** Real product navigation and public-route loading checks on owned native Auth.
 * Loading is observed by pausing real JavaScript requests, never replacing APIs. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function privateJson(file) { assert(path.isAbsolute(file)); const stat = await fs.lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  assert(process.argv.length === 3, 'Supply owned support runtime path');
  const runtime = await privateJson(process.argv[2]), meta = await privateJson(runtime.metadataPath);
  assert(runtime.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/'));
  assert(process.argv[2].startsWith(meta.root + '/'));
  const base = new URL(runtime.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const actors = { reporter: runtime.actors.owner }; assert(actors.reporter?.contextId);
  const artifacts = path.join(meta.root, 'navigation-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
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
      const destination = kind === 'agent' ? '#/customer-service' : kind === 'admin' ? '#/admin/dashboard' : '#/user/dashboard';
      await until(`location.hash.split('?')[0]===${JSON.stringify(destination)}&&!!document.querySelector('[data-portal-navigation]')`, 'Genuine account destination'); await dismissWelcome();
      check(await evaluate(`(async()=>{const r=await fetch('/api/auth/me');return r.ok&&(await r.json()).id===${JSON.stringify(actors[kind].contextId)}})()`), 'Native session belongs to selected account');
    }
    async function signOut(kind) {
      if (kind !== 'agent') { await go('/#/' + (kind === 'admin' ? 'admin/dashboard' : 'user/dashboard')); await until('!!document.querySelector("[data-portal-navigation]")', 'Dashboard'); await dismissWelcome(); }
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)));if(!b)throw Error('Missing sign out');b.click()})()`);
      if (kind !== 'agent') { await until('!!document.querySelector("dialog[open]")', 'Logout confirmation'); await evaluate(`(()=>{const d=document.querySelector('dialog[open]');const b=[...d.querySelectorAll('button')].find(b=>/Sign Out|Sign out|Confirm|Yes,/.test(b.textContent));if(!b)throw Error('Missing logout confirmation');b.click()})()`); }
      await until('location.hash.startsWith("#/login")', 'Logout completes');
    }
    const captured = [], held = new Map();
    ws.addEventListener('message', event => { const m = JSON.parse(event.data); if (m.method === 'Fetch.requestPaused') held.set(m.params.requestId, m.params.request.url); });
    await command('Network.enable'); await command('Network.setCacheDisabled', { cacheDisabled: true });
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pinevelaSkeletonSeen=false;new MutationObserver(()=>{if(document.querySelector('[data-route-skeleton]'))window.__pinevelaSkeletonSeen=true}).observe(document,{subtree:true,childList:true});` });
    await command('Fetch.enable', { patterns: [{ urlPattern: '*PageFAQ-*.js*', requestStage: 'Request' }, { urlPattern: '*PageHelp-*.js*', requestStage: 'Request' }] });
    for (const [route, chunk, text, content] of [
      ['/#/faq?from=/', 'PageFAQ-', 'Loading frequently asked questions…', 'document.querySelectorAll("details").length>15'],
      ['/#/help?from=/', 'PageHelp-', 'Loading Help…', '!!document.querySelector("textarea")'],
    ]) {
      stage = 'public plain loading ' + chunk; await size(375, 812); await go(route);
      const end = Date.now() + 45000; while (![...held.values()].some(url => url.includes(chunk)) && Date.now() < end) await pause(100);
      check([...held.values()].some(url => url.includes(chunk)), 'Real route JavaScript request is held');
      await until(`document.body.innerText.includes(${JSON.stringify(text)})`, 'Readable route loading fallback');
      await pause(400); check(await evaluate('!window.__pinevelaSkeletonSeen&&!document.querySelector("[data-route-skeleton]")'), 'FAQ/Help loading never renders dashboard skeleton');
      await screenshot('plain-loading-' + chunk.replace('-', '').toLowerCase());
      for (const [id, url] of held) if (url.includes(chunk)) { held.delete(id); await command('Fetch.continueRequest', { requestId: id }); }
      await until(content, 'Actual public page loads after chunk release'); check(await evaluate('!document.querySelector("[data-route-skeleton]")'), 'Loaded public route has no skeleton');
    }
    await command('Fetch.disable');
    await signIn('reporter');
    async function styles(kind) {
      return evaluate(`(()=>{const e=document.querySelector('[data-portal-navigation="${kind}"]'),s=getComputedStyle(e),a=e.querySelector('[aria-current="page"]'),as=a&&getComputedStyle(a),r=e.getBoundingClientRect();return {kind:'${kind}',theme:document.documentElement.dataset.theme,appearance:document.documentElement.dataset.appearance,background:s.backgroundImage,color:s.color,border:s.borderBottomColor,filter:s.backdropFilter,radius:s.borderRadius,shadow:s.boxShadow,width:r.width,left:r.left,active:as&&{background:as.backgroundImage,color:as.color},overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
    }
    function glass(value, label) {
      captured.push(value); check(value.appearance === 'product' && value.background.includes('0.7') && value.background.includes('0.74'), label + ' has the login translucent navy surface');
      check(value.filter.includes('blur(18px)') && value.border === 'rgba(255, 195, 0, 0.45)', label + ' shares the blur and yellow lining');
      check(!value.overflow, label + ' fits viewport');
      if (value.active) check(value.active.background.includes('255, 195, 0') && value.active.color === 'rgb(0, 29, 61)', label + ' active destination is readable yellow/navy');
    }
    for (const theme of ['light', 'dark']) {
      stage = 'product navigation ' + theme; await size(1440, 1000); await go('/#/user/dashboard?tab=options'); await until('!!document.querySelector(".theme-toggle")', 'Saved product theme control');
      await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click()`); await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'Theme applies from real settings');
      await go('/#/user/dashboard?tab=home'); await until('!!document.querySelector("[data-portal-navigation=sidebar],[data-portal-navigation=top]")', 'Dashboard navigation'); await dismissWelcome();
      if (await evaluate('!!document.querySelector("[data-portal-navigation=top]")')) await evaluate(`document.querySelector('[title="Show sidebar"]').click()`);
      await until('!!document.querySelector("[data-portal-navigation=sidebar]")', 'Sidebar visible'); glass(await styles('sidebar'), theme + ' sidebar'); await screenshot('sidebar-' + theme);
      await evaluate(`document.querySelector('[title="Hide sidebar"]').click()`); await until('!!document.querySelector("[data-portal-navigation=top]")', 'Top navigation visible'); glass(await styles('top'), theme + ' top bar'); await screenshot('top-' + theme);
      await size(375, 812); await until('document.querySelector("[data-portal-navigation=header]").getClientRects().length>0', 'Mobile header'); glass(await styles('mobile'), theme + ' mobile bottom navigation');
      const header = await styles('header'); captured.push(header);
      if (theme === 'light') {
        check(header.background.includes('255, 255, 255') && header.background.includes('0.72') && header.background.includes('0.82'), 'Light mobile header keeps translucent white');
        check(header.color === 'rgb(0, 29, 61)' && header.radius === '0px' && header.shadow === 'none' && Math.abs(header.left) < 1 && header.width >= 374, 'Light mobile header stays flat edge to edge with blue text');
        check(header.border === 'rgba(255, 195, 0, 0.45)' && header.filter.includes('blur(18px)'), 'Flat white header shares yellow edge and glass filter');
      } else glass(header, 'dark mobile header');
      await screenshot('mobile-' + theme);
      // Use the real app links: product FAQ inherits the selected setting.
      await go('/#/faq?from=/user/dashboard'); await until('document.querySelectorAll("details").length>15', 'Product FAQ'); check(await evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.documentElement.dataset.appearance==='product'`), 'Product FAQ follows ' + theme + ' preference');
      await go('/#/help?from=/user/dashboard'); await until('document.body.innerText.includes("Your requests")', 'Product Help'); check(await evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.documentElement.dataset.appearance==='product'`), 'Product Help follows ' + theme + ' preference');
    }
    check(errors.length === 0, 'No uncaught browser exceptions');
    const result = { passed: true, checks, actualNativeLogins: 1, themes: ['light', 'dark'], surfaces: ['sidebar', 'top', 'mobile', 'header'], publicLoadingObservedByHoldingRealChunks: true, mockedApis: 0, productionRecordsModified: 0, artifacts };
    await fs.writeFile(path.join(artifacts, 'computed-styles.json'), JSON.stringify(captured, null, 2), { mode: 0o600 });
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
  } catch (failure) {
    if (command) { try { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); } catch {} }
    await fs.writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ stage, checks, error: failure.message, errors }), { mode: 0o600 }); console.error(JSON.stringify({ passed: false, stage, checks, artifacts })); process.exitCode = 1;
  } finally { if (command && ws?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } ws?.close(); for (const pending of waiting.values()) clearTimeout(pending.timer); }
})().catch(() => { console.error('Owned navigation browser verification could not start.'); process.exitCode = 1; });
