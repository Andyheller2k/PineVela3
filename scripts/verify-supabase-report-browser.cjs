/** Real browser report workflow on the owned native Supabase stack. No HTTP,
 * identity, session, or provider stubs; no sanctions are applied by this test. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function privateJson(file) { assert(path.isAbsolute(file)); const stat = await fs.lstat(file); assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077)); return JSON.parse(await fs.readFile(file, 'utf8')); }
(async () => {
  assert(process.argv.length === 4, 'Supply real runtime and report fixture paths');
  const runtime = await privateJson(process.argv[2]), fixture = await privateJson(process.argv[3]), meta = await privateJson(runtime.metadataPath);
  assert(runtime.runId === meta.runId && fixture.runId === meta.runId && meta.databaseOwned && meta.root.startsWith('/tmp/'));
  assert(process.argv[2].startsWith(meta.root + '/') && process.argv[3].startsWith(meta.root + '/'));
  const base = new URL(runtime.origin); assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && !['3000', '3001'].includes(base.port));
  const actors = fixture.actors || fixture;
  assert(actors.reporter?.contextId && actors.agent?.contextId && actors.admin?.contextId && actors.storeId && actors.listingId);
  const artifacts = path.join(meta.root, 'report-browser-artifacts'); await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const server = net.createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve));
  const profile = await fs.mkdtemp('/tmp/pinevela-report-chrome-');
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
    async function go(route) { const url = new URL(route, base.origin); assert(url.origin === base.origin); await command('Page.navigate', { url: url.href }); await until(`location.href===${JSON.stringify(url.href)}&&document.readyState==='complete'`, 'Document loads'); }
    async function size(width, height) { await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
    async function click(text, scope = 'document') { await evaluate(`(()=>{const controls=[...${scope}.querySelectorAll('button,a')].filter(b=>b.getClientRects().length),text=${JSON.stringify(text)},b=controls.find(b=>b.textContent.trim()===text)||controls.find(b=>b.textContent.trim().startsWith(text));if(!b)throw Error('Missing control');b.click()})()`); }
    async function fillLabel(label, value) { await evaluate(`(()=>{const l=[...document.querySelectorAll('label')].find(l=>l.getClientRects().length&&l.textContent.trim().startsWith(${JSON.stringify(label)}));const e=l?.querySelector('input,textarea,select');if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`); }
    async function screenshot(name) { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); }
    async function dismissWelcome() { await evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))if(/Welcome/.test(d.getAttribute('aria-label')||''))d.querySelector('button[aria-label="Close dialog"]')?.click()})()`); }
    async function signIn(kind) {
      stage = 'real native login ' + kind; await size(1440, 1000); await go('/#/login'); await until('!!document.querySelector(\'input[aria-label="Username or Email Address"]\')', 'Login form');
      await evaluate(`(()=>{for(const [label,value] of ${JSON.stringify([['Username or Email Address', actors[kind].email], ['Password', actors[kind].password]])}){const e=document.querySelector('input[aria-label="'+label+'"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}));}})()`);
      await evaluate('document.querySelector(\'input[aria-label="Password"]\').closest("form").requestSubmit()');
      const destination = kind === 'agent' ? '#/customer-service' : kind === 'admin' ? '#/admin/dashboard' : '#/user/dashboard';
      await until(`location.hash.split('?')[0]===${JSON.stringify(destination)}&&!!document.querySelector('[data-portal-navigation]')`, 'Genuine account destination'); await dismissWelcome();
      check(await evaluate(`(async()=>{const r=await fetch('/api/auth/me');return r.ok&&(await r.json()).id===${JSON.stringify(actors[kind].contextId)}})()`), 'Native session belongs to selected account');
    }
    async function signOut(kind) {
      if (kind !== 'agent') { await go('/#/' + (kind === 'admin' ? 'admin/dashboard' : 'user/dashboard')); await until(`[...document.querySelectorAll('button')].some(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)))`, 'Dashboard sign-out control'); await dismissWelcome(); }
      await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&(/^(?:sign|log) out$/i.test(b.textContent.trim())||/(?:sign|log) out/i.test(b.title)));if(!b)throw Error('Missing sign out');b.click()})()`);
      if (kind !== 'agent') { await until('!!document.querySelector("dialog[open]")', 'Logout confirmation'); await evaluate(`(()=>{const d=document.querySelector('dialog[open]');const b=[...d.querySelectorAll('button')].find(b=>/Sign Out|Sign out|Confirm|Yes,/.test(b.textContent));if(!b)throw Error('Missing logout confirmation');b.click()})()`); }
      await until('location.hash.startsWith("#/login")', 'Logout completes');
    }
    stage = 'guest report authorization'; await size(375, 812); await go('/#/pinemarket/stores/' + actors.storeId); await until('!!document.querySelector("[data-market-storefront]")', 'Genuine storefront'); await click('Report store');
    await until('!!document.querySelector(\'dialog[aria-label="Report store"]\')', 'Guest report dialog'); check(await evaluate('document.querySelector(\'dialog[aria-label="Report store"]\').innerText.includes("Sign in")&&!document.querySelector(\'dialog[aria-label="Report store"] textarea\')'), 'Guest must sign in before reporting an account'); await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await until('!document.querySelector("dialog[open]")', 'Escape closes report');
    await signIn('reporter');
    check(await evaluate(`(()=>{const p=document.querySelector('[data-portal-navigation="sidebar"] [class~="text-blue-600/70"]');return !!p&&getComputedStyle(p).color==='rgb(179, 201, 223)'})()`), 'Small navigation account label uses readable muted text on glass');
    stage = 'store report mobile form'; await size(375, 812); await go('/#/pinemarket/stores/' + actors.storeId); await until('!!document.querySelector("[data-market-storefront]")', 'Storefront'); await click('Report store'); await until('!!document.querySelector(\'dialog[aria-label="Report store"] textarea\')', 'Report form');
    await fillLabel('Reason', 'false_location'); await fillLabel('What happened?', 'The store location shown here needs a customer-service review. Browser report ' + Date.now());
    check(await evaluate('document.querySelectorAll(\'dialog[aria-label="Report store"] input\').length===0'), 'No client identity or target ID field is accepted');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Report dialog fits mobile'); await screenshot('report-store-mobile'); await click('Submit report'); await until('document.body.innerText.includes("Report received")', 'Persisted report receipt');
    const reportTicketId = await evaluate(`new URL(document.querySelector('dialog a[href^="#/help?ticket="]').href).hash.split('ticket=')[1]`); check(/^[a-f0-9-]{36}$/.test(reportTicketId), 'Server returns real report case'); await click('Track your report'); await until('!!document.querySelector(\'[aria-label="Case conversation"]\')', 'Owned report history');
    check(await evaluate('document.body.innerText.includes("Your safety reports")'), 'Requester can track report progress'); await screenshot('report-requester-history');
    await signOut('reporter'); await signIn('agent'); stage = 'customer service evidence review'; await click('Safety reports'); await until(`!!document.querySelector('[aria-label="Customer-service safety reports"] [data-report-ticket-id="${reportTicketId}"]')`, 'Safety report list');
    await evaluate(`document.querySelector('[aria-label="Customer-service safety reports"] [data-report-ticket-id="${reportTicketId}"]').click()`); await until('!!document.querySelector(\'[aria-label="Reported content review"]\')', 'Report evidence panel');
    await fillLabel('Recommended action', 'warning'); await fillLabel('Review findings', 'The reported location needs verification. Recommend a warning after administrator review.'); await click('Send recommendation to administrators'); await until('document.querySelector(\'[aria-label="Reported content review"]\').innerText.includes("Awaiting administrator review")', 'Recommendation persists');
    check(await evaluate('document.body.innerText.includes("Recommendations do not ban, delete or change an account")'), 'Customer service cannot apply sanctions'); await screenshot('report-customer-service-review');
    await signOut('agent'); await signIn('admin'); stage = 'administrator review handoff'; await click('Admin Settings'); await until('!!document.querySelector(\'[aria-label="Administrator safety report review"]\')', 'Admin report queue');
    await until(`!!document.querySelector('[aria-label="Administrator safety report review"] [data-report-ticket-id="${reportTicketId}"]')`, 'Recommended report is in admin queue'); await evaluate(`document.querySelector('[aria-label="Administrator safety report review"] [data-report-ticket-id="${reportTicketId}"]').click()`); await until('document.body.innerText.includes("Customer-service recommendation: Warning")', 'Administrator sees recommendation');
    check(await evaluate('document.body.innerText.includes("Review reported account")&&document.body.innerText.includes("Open account approvals")'), 'Admin has actual governed account-review navigation');
    if (actors.admin.approvalKey) {
      await fillLabel('Your assessment', 'dismiss'); await fillLabel('Assessment reason', 'Reviewed browser report without applying an account sanction in this isolated verification.'); await click('Save assessment with approval key'); await until('!!document.querySelector(\'dialog[aria-label="Authorize approval"]\')', 'Private-key authorization'); await fillLabel('Private approval key', actors.admin.approvalKey); await click('Approve with key');
      await until('!document.querySelector(\'dialog[aria-label="Authorize approval"]\')', 'Successful assessment closes key prompt'); check(await evaluate('document.body.innerText.includes("Administrator assessment: Review closed")'), 'Administrator decision is recorded without claiming an applied sanction');
    }
    await screenshot('report-administrator-review'); check(errors.length === 0, 'No uncaught browser exceptions');
    const result = { passed: true, checks, actualNativeLogins: 3, realReportSubmitted: true, realRecommendation: true, adminAssessment: !!actors.admin.approvalKey, sanctionsApplied: 0, productionRecordsModified: 0, artifacts };
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
  } catch (failure) {
    if (command) { try { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); } catch {} }
    await fs.writeFile(path.join(artifacts, 'failure.json'), JSON.stringify({ stage, checks, error: failure.message, errors }), { mode: 0o600 }); console.error(JSON.stringify({ passed: false, stage, checks, artifacts })); process.exitCode = 1;
  } finally { if (command && ws?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } ws?.close(); for (const pending of waiting.values()) clearTimeout(pending.timer); }
})().catch(() => { console.error('Owned report browser verification could not start.'); process.exitCode = 1; });
