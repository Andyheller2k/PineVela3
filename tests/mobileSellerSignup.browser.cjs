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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-mobile-signup-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role, email) => ({ id: crypto.randomUUID(), role, email, name: `Isolated ${role}`, token: crypto.randomUUID() });
  const buyer = actor('user', `${crypto.randomUUID()}@example.test`);
  const seller = actor('merchant', `${crypto.randomUUID()}@example.test`);
  const store = { id: crypto.randomUUID(), studentEmail: seller.email, storeName: 'Isolated seller', status: 'active', setupCompleted: true, registrationFeePaid: true };
  Object.assign(seller, { merchantStoreId: store.id, merchantSetupCompleted: true, merchantRegistrationFeePaid: true });
  const application = { id: crypto.randomUUID(), studentEmail: seller.email, status: 'approved' };
  const product = { id: crypto.randomUUID(), storeId: store.id, sellerEmail: seller.email, title: 'Isolated item', price: 10, isAvailable: true, stockQuantity: 2, imageUrl: '/images/company/partner-with-us.jpg' };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, seller], digitalMarketApplications: [application], digitalMarketStores: [store], digitalMarketProducts: [product] }));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    // Deliberately inherit production: npm run dev must explicitly choose development.
    server = spawn(production ? process.execPath : 'npm', production ? [path.join(project, 'dist/server.cjs')] : ['run', 'dev'], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_DEV_SIGNUP_CODES: 'true', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => serverLogs += data); server.stderr.on('data', data => serverLogs += data);
    let healthy = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error(serverLogs); await pause(100);
    }
    assert(healthy, serverLogs); console.log(`${production ? 'Production bundle' : 'Development server'} ready with isolated data.`);
    const inquiry = await fetch(`${base}/api/digital-market/messages`, { method: 'POST', headers: { Authorization: `Bearer ${buyer.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: product.id, recipientEmail: seller.email, content: 'Isolated buyer inquiry' }) });
    assert.equal(inquiry.status, 201);
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
    // Set the session before app initialization, rather than racing a mounted AuthProvider.
    await command('Network.setCookie', { name: 'pv_auth_token', value: seller.token, url: base, httpOnly: true, sameSite: 'Strict' });
    await viewport(375); await command('Page.navigate', { url: `${base}/#/digital-market` });
    await until(`location.hash === '#/digital-market' && ${button('Messages')} !== undefined`, 'Mobile seller route');
    const checkInbox = async width => {
      await viewport(width); await click(button('Messages'));
      await click(`document.querySelector('aside[aria-label="Conversations"] button')`);
      await until(`document.querySelector('[role="log"]')?.innerText.includes('Isolated buyer inquiry')`, 'Buyer inquiry visible');
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `Horizontal overflow at ${width}px`);
      if (width < 768) { await click(`document.querySelector('button[aria-label="Back to conversations"]')`); await click(`document.querySelector('aside[aria-label="Conversations"] button')`); }
    };
    await checkInbox(375); await input('textarea#market-message', 'Isolated mobile seller reply');
    await until(`!document.querySelector('button[aria-label="Send message"]').disabled`, 'Reply enabled');
    await click(`document.querySelector('button[aria-label="Send message"]')`);
    await until(`document.querySelector('[role="log"]')?.innerText.includes('Isolated mobile seller reply')`, 'Mobile reply displayed');
    await command('Page.reload'); await until(`location.hash === '#/digital-market' && ${button('Messages')} !== undefined`, 'Seller survives reload');
    await checkInbox(390); await checkInbox(768); await checkInbox(1440);
    const persisted = await fetch(`${base}/api/digital-market/messages`, { headers: { Authorization: `Bearer ${seller.token}` } });
    assert.equal((await persisted.json()).length, 2); console.log('Seller inbox passed at 375, 390, 768 and 1440 pixels, including reply, back navigation and reload.');
    if (production) { assert.deepEqual(exceptions, [], 'Browser console/runtime errors'); assert.deepEqual(apiErrors, [], 'Failed API requests'); console.log('Production mobile seller verification passed. No console errors or failed API requests.'); return; }
    // Test the actual signup form and visible generated code, then activate and log in.
    await command('Page.navigate', { url: 'about:blank' });
    await command('Network.clearBrowserCookies');
    const signupInit = await command('Page.addScriptToEvaluateOnNewDocument', { source: 'localStorage.clear();' });
    await viewport(375);
    await command('Page.navigate', { url: `${base}/#/login?mode=register` });
    await until(`document.querySelector('input[placeholder="e.g. Alexander Cole"]') !== null`, 'Signup form');
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: signupInit.identifier });
    const email = `${crypto.randomUUID()}@example.test`, password = `Isolated-signup-${crypto.randomUUID()}!`;
    await input('input[placeholder="e.g. Alexander Cole"]', 'Isolated Signup Browser Test');
    await input('input[placeholder="e.g. alex@example.com"]', email);
    await input('input[placeholder="Min. 6 characters"]', password); await input('input[placeholder="Repeat password"]', password);
    await click(button('Sign Up Now')); await until(`document.body.innerText.includes('Development signup code')`, 'Development code panel');
    assert(await evaluate(`[...document.querySelectorAll('p')].some(p => /^[0-9]{6}$/.test(p.innerText.trim()) && p.getClientRects().length > 0)`), 'Visible six-digit code');
    await click(button('Use this code')); assert.match(await evaluate(`document.querySelector('input[autocomplete="one-time-code"]').value`), /^\d{6}$/);
    await click(button('Continue in development')); await until(`location.hash.startsWith('#/student/dashboard')`, 'Signup activation and login');
    const session = await evaluate(`fetch('/api/auth/me',{headers:{Authorization:'Bearer '+localStorage.getItem('pinevela_session_token')}}).then(r=>r.json()).then(u=>({role:u.role,developmentOnly:u.developmentOnly,isVerified:u.isVerified}))`);
    assert.equal(session.role, 'user'); assert.equal(session.developmentOnly, true); assert.equal(session.isVerified, false);
    assert.deepEqual(exceptions, [], 'Browser console/runtime errors'); assert.deepEqual(apiErrors, [], 'Failed API requests');
    console.log('Visible six-digit signup code, Use this code, activation and login passed. No console errors or failed API requests.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
