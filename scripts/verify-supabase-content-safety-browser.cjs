/** Browser checks against the owned real Auth/support stack. No mocked HTTP,
 * injected sessions, or production data. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const pause = ms => new Promise(r => setTimeout(r, ms));
async function privateJson(file) { const s = await fs.lstat(file); assert(s.isFile() && !s.isSymbolicLink() && !(s.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  const file = process.argv[2]; assert(process.argv.length === 3 && path.isAbsolute(file));
  const fixture = await privateJson(file), meta = await privateJson(fixture.metadataPath);
  assert(fixture.version === 1 && fixture.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/') && file.startsWith(meta.root + '/'));
  const base = new URL(fixture.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const artifacts = path.join(meta.root, 'content-safety-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const probe = net.createServer(); await new Promise(r => probe.listen(0, '127.0.0.1', r)); const port = probe.address().port; await new Promise(r => probe.close(r));
  const profile = await fs.mkdtemp('/tmp/pinevela-support-chrome-');
  const chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws, seq = 0, stage = 'browser startup', checks = 0, evaluate, command;
  const pending = new Map(), errors = [], check = (v, label) => { assert(v, label); checks++; };
  try {
    let target; for (let i = 0; i < 150; i++) { try { target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page'); } catch {} if (target || chrome.exitCode !== null) break; await pause(200); }
    check(target, 'Chromium starts with an isolated profile'); ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timeout')); }, 40000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params })); });
    ws.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (!p) return; clearTimeout(p.timer); pending.delete(m.id); if (m.error) p.reject(Error('Browser command failed')); else p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text); };
    await command('Page.enable'); await command('Runtime.enable');
    evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw Error('Browser evaluation failed at ' + stage); return r.result.value; };
    const exists = selector => `!!document.querySelector(${JSON.stringify(selector)})`;
    async function until(expression, label, ms = 45000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await evaluate(expression)) return; } catch {} await pause(120); } throw Error(label + ' at ' + stage); }
    async function go(route) { const url = new URL(route, base.origin); assert(url.origin === base.origin); await command('Page.navigate', { url: url.href }); await until('document.readyState==="complete"', 'Document loads'); }
    async function click(text) { await evaluate(`(()=>{const t=${JSON.stringify(text)},b=[...document.querySelectorAll('button,a,summary')].find(b=>b.getClientRects().length&&b.textContent.trim().startsWith(t));if(!b)throw Error('Missing control');b.click()})()`); }
    async function fill(selector, value) { await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`); }
    async function field(label, value) { await evaluate(`(()=>{const label=[...document.querySelectorAll('label')].find(l=>l.textContent.trim().startsWith(${JSON.stringify(label)}));const e=label?.querySelector('input,textarea');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`); }
    async function screen(name) { const r = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(r.data, 'base64'), { mode: 0o600 }); }
    async function size(width, height) { await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
    async function dismissWelcome() { await evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))if(/Welcome/.test(d.getAttribute('aria-label')||''))d.querySelector('button[aria-label="Close dialog"]')?.click()})()`); }
    async function signIn(kind) {
      stage = 'real login ' + kind; const actor = fixture.actors[kind]; await size(1440, 1000); await go('/#/login');
      await until('!!document.querySelector(\'input[aria-label="Email address"]\')', 'Sign-in form');
      await fill('input[aria-label="Email address"]', actor.email); await fill('input[aria-label="Password"]', actor.password);
      await evaluate('document.querySelector(\'input[aria-label="Password"]\').closest("form").requestSubmit()');
      const route = kind === 'agent' ? '/customer-service' : kind === 'admin' ? '/admin/dashboard' : '/user/dashboard';
      await until(`location.hash.split('?')[0]===${JSON.stringify('#' + route)}`, 'Correct native destination');
      await until(exists('[data-portal-navigation]'), 'Portal renders after sign-in'); await dismissWelcome();
      const me = await evaluate('(async()=>{const r=await fetch("/api/auth/me");const u=await r.json();return {status:r.status,id:u.id,customerService:u.customerService}})()');
      check(me.status === 200 && me.id === actor.contextId, 'Actual login returns this account'); if (kind === 'agent') check(me.customerService, 'Invited account receives customer-service discovery');
    }
    async function signOut(kind) {
      if (kind !== 'agent') { await go('/#' + (kind === 'admin' ? '/admin/dashboard' : '/user/dashboard')); await until('!!document.querySelector(\'a[aria-label="Help: ask a question or report a problem"]\')', 'Dashboard help'); await dismissWelcome(); }
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)));if(!b)throw Error('Missing sign out');b.click()})()`);
      if (kind !== 'agent') { await until('!!document.querySelector("dialog[open],[role=dialog]")', 'Logout confirmation'); await evaluate(`(()=>{const d=document.querySelector('dialog[open],[role=dialog]');const b=[...d.querySelectorAll('button')].find(b=>/Sign Out|Sign out|Confirm|Yes,/.test(b.textContent));if(!b)throw Error('Missing confirm');b.click()})()`); }
      await until('location.hash.startsWith("#/login")', 'Real logout finishes');
    }
    await signIn('agent'); stage = 'actual support safety queue'; await click('Safety reports');
    await until(exists(`[data-content-check-id="${fixture.actors.photoCheckId}"]`),'Actual held-photo row');
    for(const [width,height] of [[1440,1000],[375,812]]){
      await size(width,height);
      await evaluate(`document.querySelector('[data-content-check-id="${fixture.actors.photoCheckId}"]').click()`);
      await until('document.body.innerText.includes("Review flagged photo")','Explicit private photo review control');
      check(!await evaluate('document.body.innerText.includes("Approve this content")'),'Support agent has no administrator approval controls');
      await click('Review flagged photo');
      await until('!!document.querySelector(\'img[alt="Private submitted photo for content review"]\')?.naturalWidth','Real quarantined brand pixels render');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Actual queue fits viewport');
      check(await evaluate('!!document.querySelector(\'a[href^="#/customer-service?ticket="]\')'),'Linked support case is discoverable');
      await screen('support-safety-'+width);
      await evaluate(`document.querySelector('[data-content-check-id="${fixture.actors.photoCheckId}"]').click()`);
    }
    stage='workspace appearance and private review';
    for(const theme of ['dark','light']){
      await click('Settings');await until(exists('.theme-toggle'),'Settings theme control');
      await evaluate(`if(document.documentElement.dataset.theme!==${JSON.stringify(theme)})document.querySelector('.theme-toggle').click()`);
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`,'Selected workspace theme');
      await click('Safety reports');await until(exists(`[data-content-check-id="${fixture.actors.photoCheckId}"]`),'Queue returns in selected theme');
      await evaluate(`document.querySelector('[data-content-check-id="${fixture.actors.photoCheckId}"]').click()`);
      await click('Review flagged photo');await until('!!document.querySelector(\'img[alt="Private submitted photo for content review"]\')?.naturalWidth','Private review photo renders in selected theme');
      check(await evaluate(`document.documentElement.dataset.theme===${JSON.stringify(theme)}&&document.documentElement.scrollWidth<=innerWidth+1`),'Safety review inherits product theme and fits mobile');
      await screen('support-safety-'+theme);
    }
    await signOut('agent'); await signIn('admin'); await click('Admin Settings');
    await until(exists(`[data-content-check-id="${fixture.actors.photoCheckId}"]`),'Administrator sees the actual content review');
    await evaluate(`document.querySelector('[data-content-check-id="${fixture.actors.photoCheckId}"]').click()`);
    await until('document.body.innerText.includes("Review explanation")','Administrator content-decision form');
    check(await evaluate('[...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Approve this content"&&b.disabled)'),'Administrator cannot submit an unexplained decision');
    await field('Review explanation','Keep this dedicated child-safety hold unpublished during the owned local verification.');
    await click('Keep blocked');
    await until('!!document.querySelector("dialog[open]")','Actual approval-key dialog');
    check(await evaluate('!!document.querySelector("dialog[open] input[type=password]")'),'Content decisions use the existing private-key approval dialog');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    await until('!document.querySelector("dialog[open]")','Approval can be cancelled');
    await size(375,812);check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Administrator review fits mobile');
    await screen('admin-safety-mobile');
    check(errors.length===0,'No uncaught browser exceptions, including approval cancellation');
    const result={passed:true,checks,realNativeLogins:2,themes:['light','dark'],widths:[1440,375],privateImageRendered:true,approvalDialogVerified:true,mockedApis:0,existingHostedImagesExported:0,productionRecordsModified:0,artifacts};
    await fs.writeFile(path.join(artifacts,'result.json'),JSON.stringify(result,null,2),{mode:0o600});console.log(JSON.stringify(result));
  } catch (e) {
    let page;
    if (evaluate) { try { page = await evaluate('({route:location.hash.split("?")[0],ready:document.readyState,title:document.title,headings:[...document.querySelectorAll("h1,h2")].map(h=>h.textContent),publicHeader:document.querySelector("#public-header")?.outerHTML,body:location.hash==="#/"?document.body.innerText.slice(0,1500):undefined})'); await screenFailure(); } catch {} }
    async function screenFailure() { const r = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(r.data, 'base64'), { mode: 0o600 }); }
    await fs.writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ stage, checks, error: e.message, page, errors }), { mode: 0o600 }); console.error(JSON.stringify({ passed: false, stage, checks, diagnostics: artifacts })); process.exitCode = 1;
  }
  finally { if (command && ws?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } ws?.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Browser closed')); } }
})().catch(() => { console.error('Owned support browser verification could not start.'); process.exitCode = 1; });
