const { sessionFixtureJson } = require('./sessionFixtures.cjs');
// Real browser/API regression against a disposable database; never operational data.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const project = path.resolve(__dirname, '..');
const production = process.argv.includes('--production');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-admin-login-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const { hashCredential } = await import('../accountSecurity.ts');
  const { recoverAccountPassword } = await import('../credentialExposure.ts');
  const { KNOWN_LEGACY_PASSWORDS } = await import('../legacyCredentialPolicy.ts');
  const legacy = [...KNOWN_LEGACY_PASSWORDS][0];
  const password = `Isolated-admin-${crypto.randomUUID()}!`;
  const admin = { id: crypto.randomUUID(), role: 'admin', email: `${crypto.randomUUID()}@example.test`, password: hashCredential(legacy) };
  const managerPassword = `Isolated-manager-${crypto.randomUUID()}!`;
  const manager = { id: crypto.randomUUID(), role: 'manager', email: `${crypto.randomUUID()}@example.test`, password: hashCredential(managerPassword), verificationStatus: 'pending', isVerified: false };
  const primary = { id: crypto.randomUUID(), role: 'user', email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), password: hashCredential(crypto.randomUUID()) };
  const isolatedStore = { credentialExposureVersion: 1, accountSecurityVersion: 1, users: [admin, manager, primary], notifications: [{ id: crypto.randomUUID(), targetRole: 'admin', title: 'Approval queue update', message: 'A request is ready for review.', read: false }] };
  recoverAccountPassword(isolatedStore, admin.id, 'admin', password);
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson(isolatedStore));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    // Deliberately inherit production: npm run dev must explicitly choose development.
    server = spawn(production ? process.execPath : 'npm', production ? [path.join(project, 'dist/server.cjs')] : ['run', 'dev'], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_DEV_SIGNUP_CODES: 'true', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', DISABLE_HMR: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => serverLogs += data); server.stderr.on('data', data => serverLogs += data);
    let healthy = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error(serverLogs); await pause(100);
    }
    assert(healthy, serverLogs); console.log(`${production ? 'Production bundle' : 'Development server'} ready with isolated data.`);
    const submittedManager = { name: `Manager ${crypto.randomUUID()}`, email: `${crypto.randomUUID()}@housing.example.test`, password: `Manager-${crypto.randomUUID()}!`, address: 'Kumasi KNUST Ayeduase', knustAccreditedConfirmed: true };
    const submittedSeller = { fullName: `Seller ${crypto.randomUUID()}`, university: 'KNUST', studentEmail: `${crypto.randomUUID()}@st.knust.edu.gh`, password: `Seller-${crypto.randomUUID()}!`, idNumber: 'KNUST20260001', categoryToSell: 'Books' };
    const submit = async (route, body) => {
      const response = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${primary.token}` }, body: JSON.stringify(body) });
      const result = await response.json(); assert.equal(response.status, 201, `${route}: ${result.error || 'submission failed'}`);
    };
    await submit('/api/auth/register-manager-account', submittedManager);
    await submit('/api/digital-market/register', submittedSeller);
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'chrome')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
    chrome.stderr.on('data', data => chromeLogs += data); chrome.on('error', () => {});
    let target;
    for (let attempt = 0; attempt < 200; attempt++) {
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item => item.type === 'page'); if (target) break; } catch {}
      if (chrome.exitCode !== null) throw new Error(chromeLogs); await pause(100);
    }
    assert(target, chromeLogs); socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0; const pending = new Map(), exceptions = [], apiErrors = [];
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.onclose = () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser connection closed')); } pending.clear(); };
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') exceptions.push(message.params.args.map(item => item.value || item.description).join(' '));
      else if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/api/') && message.params.response.status >= 400) apiErrors.push({ url: message.params.response.url, status: message.params.response.status });
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const until = async (expression, label) => { for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(expression)) return; await pause(100); } throw new Error(`${label}: ${await evaluate('JSON.stringify({hash:location.hash,text:document.body.innerText.slice(-3000)})')}`); };
    const click = async expression => { await until(`${expression}?.getClientRects().length > 0`, 'Visible control'); await evaluate(`${expression}.click()`); };
    const button = label => `[...document.querySelectorAll('button')].find(button => button.getClientRects().length && button.innerText.trim() === ${JSON.stringify(label)})`;
    const input = async (selector, value) => { await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}); const setter=Object.getOwnPropertyDescriptor(${selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set; setter.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
    const viewport = async width => command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    const request = async (email, secret, status) => {
      const response = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usernameOrEmail: email, password: secret }) });
      assert.equal(response.status, status); return response.json();
    };
    const denied = await request(admin.email, legacy, 403);
    assert.equal(denied.requiresPasswordReset, true); assert(!denied.isPendingApproval);
    await request(admin.email, crypto.randomUUID(), 401);
    const approved = await request(admin.email, password, 200); assert.equal(approved.role, 'admin');
    const pendingManager = await request(manager.email, managerPassword, 403); assert.equal(pendingManager.isPendingApproval, true);
    await viewport(390); await command('Page.navigate', { url: `${base}/#/login` });
    await until(`document.querySelector('input[placeholder="e.g. student@pinevela.com"]') !== null`, 'Login form');
    await input('input[placeholder="e.g. student@pinevela.com"]', admin.email);
    await input('input[placeholder="••••••••"]', legacy); await click(`document.querySelector('form button[type="submit"]')`);
    await until(`document.body.innerText.includes('Legacy default credentials have been disabled')`, 'Inline password recovery error');
    assert(!await evaluate(`document.body.innerText.includes('Submission Under Review')`), 'No pending approval modal for admin');
    await input('input[placeholder="e.g. student@pinevela.com"]', manager.email);
    await input('input[placeholder="••••••••"]', managerPassword); await click(`document.querySelector('form button[type="submit"]')`);
    await until(`document.body.innerText.includes('Submission Under Review')`, 'Pending manager approval');
    assert(await evaluate(`document.body.innerText.includes('Submission Under Review')`), 'Pending manager modal preserved');
    await command('Page.navigate', { url: 'about:blank' }); await command('Page.navigate', { url: `${base}/#/login` });
    await until(`document.querySelector('input[placeholder="e.g. student@pinevela.com"]') !== null`, 'Fresh login form');
    await input('input[placeholder="e.g. student@pinevela.com"]', admin.email); await input('input[placeholder="••••••••"]', password);
    await click(`document.querySelector('form button[type="submit"]')`);
    await until(`location.hash.startsWith('#/admin/dashboard')`, 'Administrator dashboard');
    await viewport(1280);
    await click(`document.querySelector('button[title="Use top navigation"]')`);
    await until(`document.querySelector('nav button[aria-label="Managers (1)"]') !== null && document.querySelector('nav button[aria-label="Market (1)"]') !== null && document.querySelector('nav button[aria-label="Alerts (1)"]') !== null`, 'Top navigation badges');
    await click(`document.querySelector('nav button[aria-label="Managers (1)"]')`);
    await until(`document.body.innerText.includes(${JSON.stringify(submittedManager.name)})`, 'Submitted manager visible in admin queue');
    await click(`document.querySelector('nav button[aria-label="Market (1)"]')`);
    await until(`document.body.innerText.includes(${JSON.stringify(submittedSeller.studentEmail)})`, 'Submitted seller visible in admin queue');
    const appErrors = exceptions.filter(error => production || !error.includes('[vite] failed to connect to websocket') && !error.includes('WebSocket closed without opened'));
    assert.deepEqual(appErrors, [], 'Browser runtime errors');
    assert(apiErrors.every(error => [401, 403].includes(error.status) && ['/api/auth/login', '/api/auth/me'].some(route => error.url.endsWith(route))), `Only expected authentication checks: ${JSON.stringify(apiErrors)}`);
    console.log('Offline manager and seller submissions appeared in their admin approval queues with top-navigation counts; admin login and approval guards passed.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
