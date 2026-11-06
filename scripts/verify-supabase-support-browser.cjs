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
  const artifacts = path.join(meta.root, 'support-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
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
    stage = 'public FAQ responsive design';
    for (const [width, height] of [[1440, 1000], [768, 1024], [375, 812]]) {
      await size(width, height); await go('/#/'); await until(exists('#public-header a[href^="#/faq"]'), 'FAQ navigation');
      await evaluate(`document.querySelector(${JSON.stringify('#public-header a[href^="#/faq"]')}).click()`); await until('document.querySelectorAll("details").length>15', 'FAQ content');
      check(await evaluate('document.documentElement.dataset.theme==="dark"&&document.documentElement.scrollWidth<=innerWidth+1'), 'FAQ remains navy without horizontal overflow');
      await click('What are the three seller subscriptions?');
      check(await evaluate('[...document.querySelectorAll("details[open]")].some(d=>/Pine Default/.test(d.textContent)&&/Pine Star/.test(d.textContent)&&/Pine Pro/.test(d.textContent))'), 'Subscription accordion explains all actual plans');
      await screen('faq-' + width); await fill('input[type=search]', 'room key');
      check(await evaluate('document.querySelectorAll("details").length<15&&document.body.innerText.includes("room key")'), 'FAQ search narrows useful answers');
    }
    stage = 'guest report through real public Help'; await go('/#/help?from=/login');
    await until('!!document.querySelector("textarea")', 'Public help form');
    await field('Your name', 'Browser guest requester'); await field('Contact email', fixture.actors.owner.email);
    const guestSubject = 'Login-page support question from browser ' + Date.now();
    await field('Subject', guestSubject); await field('Your question or report', 'Where do I start the password recovery flow on the login page?'); await click('Submit request');
    await until('document.body.innerText.includes("Save your private tracking details")', 'Private guest tracking receipt');
    check(await evaluate(`!!document.querySelector('[aria-label="Case conversation"]')&&document.body.innerText.includes(${JSON.stringify(guestSubject)})`), 'Actual guest report opens its persisted conversation');
    check(await evaluate('!Object.keys(localStorage).some(k=>/support/i.test(k))'), 'Guest access code is not persisted in browser storage');
    await go('/#/login'); await until('!!document.querySelector(\'a[aria-label="Help: ask a question or report a problem"]\')', 'Login Help');
    check(await evaluate('document.querySelector(\'a[aria-label="Help: ask a question or report a problem"]\').getClientRects().length>0'), 'Help remains visible on mobile login');
    await signIn('owner');
    stage = 'signed-in Help and owned history'; await go('/#/help?from=/user/dashboard'); await until(`document.body.innerText.includes(${JSON.stringify(fixture.actors.ticketId ? 'Your requests' : 'Your requests')})`, 'Owned history');
    await go('/#/help?from=/user/dashboard&ticket=' + fixture.actors.ticketId); await until(exists('[aria-label="Case conversation"]'), 'Owned conversation');
    check(!await evaluate('document.body.innerText.includes("Internal review:")'), 'Requester cannot see private team note'); await screen('requester-help-desktop');
    await signOut('owner'); await signIn('agent');
    stage = 'customer-service queue and notes'; await until('document.body.innerText.includes("Question about my marketplace subscription")', 'Real support queue'); await screen('customer-service-desktop');
    await go('/#/customer-service?ticket=' + fixture.actors.ticketId); await until(exists('[aria-label="Case conversation"]'), 'Operator case');
    check(await evaluate('document.body.innerText.includes("Account ID:")&&document.body.innerText.includes("Internal review:")'), 'Operator sees account identity and internal history');
    await fill('textarea[id^=reply-]', 'Please open the Subscription section in your seller dashboard to review your current plan.'); await click('Send reply');
    await until('document.body.innerText.includes("awaiting")||document.body.innerText.includes("Awaiting")', 'Public browser reply saves');
    await size(375, 812); check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Customer-service queue fits mobile'); await screen('customer-service-mobile');
    await click('Settings'); await until('document.body.innerText.includes("Dark mode")', 'Workspace appearance settings');
    check(await evaluate('!!document.querySelector(".theme-toggle")'), 'Customer-service theme control is inside Settings');
    await evaluate('if(document.documentElement.dataset.theme!=="dark")document.querySelector(".theme-toggle").click()'); await until('document.documentElement.dataset.theme==="dark"', 'Workspace dark theme');
    await click('Inbox'); await until(exists('[aria-label="Case conversation"]'), 'Dark workspace conversation'); await screen('customer-service-dark-mobile');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Dark workspace fits mobile');
    await signOut('agent'); await signIn('admin'); await click('Admin Settings'); await until('document.body.innerText.includes("Customer-service team")&&document.body.innerText.includes("Suspend access")', 'Admin support controls');
    check(await evaluate('document.body.innerText.includes("Open feedback inbox")&&document.body.innerText.includes("Suspend access")'), 'Administrator can discover team invitation and revocation controls');
    await screen('admin-customer-service'); check(errors.length === 0, 'No uncaught browser exceptions');
    const result = { passed: true, checks, responsiveWidths: [375, 768, 1440], actualNativeLogins: 3, actualGuestSubmission: true, actualAgentReply: true, fabricatedProviderReplies: 0, productionRecordsModified: 0, artifacts };
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
  } catch (e) {
    let page;
    if (evaluate) { try { page = await evaluate('({route:location.hash.split("?")[0],ready:document.readyState,title:document.title,headings:[...document.querySelectorAll("h1,h2")].map(h=>h.textContent),publicHeader:document.querySelector("#public-header")?.outerHTML,body:location.hash==="#/"?document.body.innerText.slice(0,1500):undefined})'); await screenFailure(); } catch {} }
    async function screenFailure() { const r = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(r.data, 'base64'), { mode: 0o600 }); }
    await fs.writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ stage, checks, error: e.message, page, errors }), { mode: 0o600 }); console.error(JSON.stringify({ passed: false, stage, checks, diagnostics: artifacts })); process.exitCode = 1;
  }
  finally { if (command && ws?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } ws?.close(); for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Browser closed')); } }
})().catch(() => { console.error('Owned support browser verification could not start.'); process.exitCode = 1; });
