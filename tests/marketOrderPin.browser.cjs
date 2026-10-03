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
const production = true;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve)); return port;
}
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-order-pin-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role, email) => ({ id: crypto.randomUUID(), role, email, name: `Isolated ${role}`, token: crypto.randomUUID() });
  const buyer = actor('user', `${crypto.randomUUID()}@example.test`);
  const seller = actor('merchant', `${crypto.randomUUID()}@example.test`);
  const store = { id: crypto.randomUUID(), studentEmail: seller.email, storeName: 'Isolated seller', status: 'active', setupCompleted: true, registrationFeePaid: true };
  Object.assign(seller, { merchantStoreId: store.id, merchantSetupCompleted: true, merchantRegistrationFeePaid: true });
  const application = { id: crypto.randomUUID(), studentEmail: seller.email, status: 'approved' };
  const product = { id: crypto.randomUUID(), storeId: store.id, sellerEmail: seller.email, title: 'Isolated item', price: 10, isAvailable: true, stockQuantity: 2, imageUrl: '/images/company/partner-with-us.jpg' };
  const order = { id: crypto.randomUUID(), productId: product.id, productTitle: product.title, productPrice: 10, quantity: 1, totalAmount: 10, buyerId: buyer.id, buyerEmail: buyer.email, buyerName: buyer.name, sellerEmail: seller.email, storeId: store.id, storeName: store.storeName, meetingLocation: 'Isolated handover location', otpPin: '1234', status: 'Awaiting Seller Confirmation', createdAt: new Date().toISOString(), timeline: [] };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, seller], digitalMarketApplications: [application], digitalMarketStores: [store], digitalMarketProducts: [product], digitalMarketOrders: [order] }));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    // Test the actual production bundle with isolated persistence.
    server = spawn(production ? process.execPath : 'npm', production ? [path.join(project, 'dist/server.cjs')] : ['run', 'dev'], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_DEV_SIGNUP_CODES: 'false', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => serverLogs += data); server.stderr.on('data', data => serverLogs += data);
    let healthy = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error(serverLogs); await pause(100);
    }
    assert(healthy, serverLogs); console.log(`${production ? 'Production bundle' : 'Development server'} ready with isolated data.`);
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
    const switchAccount = async (token, url) => {
      await command('Page.navigate', { url: 'about:blank' });
      await command('Network.setCookie', { name: 'pv_auth_token', value: token, url: base, httpOnly: true, sameSite: 'Strict', secure: production });
      await command('Page.navigate', { url: base + url });
      await until("document.readyState === 'complete' && document.querySelector('#root')?.childElementCount > 0", 'App initialized');
    };
    const purchases = `[...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.textContent.includes('Purchases & Tracking'))`;
    await viewport(1440); await switchAccount(buyer.token, '/#/student/dashboard?tab=digital-market');
    await click(purchases); await until(`${button('Get a new PIN')} !== undefined`, 'Buyer PIN renewal control');
    await viewport(375);
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Buyer mobile overflow');
    await click(button('Get a new PIN'));
    await until(`[...document.querySelectorAll('div')].some(d => d.getClientRects().length && /^\\d{6}$/.test(d.innerText.trim()) && d.className.includes('tracking-widest'))`, 'Buyer six-digit PIN visible');
    const orders = await (await fetch(base + '/api/digital-market/my-orders', { headers: { Authorization: 'Bearer ' + buyer.token } })).json();
    const pin = orders.find(o => o.id === order.id).otpPin;
    assert.match(pin, /^\d{6}$/);
    for (const width of [375, 768, 1440]) {
      await viewport(width);
      assert(await evaluate(`[...document.querySelectorAll('div')].some(d => d.getClientRects().length && d.innerText.trim() === ${JSON.stringify(pin)})`), 'Buyer PIN remains visible');
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Buyer overflow');
    }
    await switchAccount(seller.token, '/#/digital-market');
    await click(button('Agree & Confirm')); await until(`${button('Verify PIN')} !== undefined`, 'Seller location confirmation');
    const sellerOrders = await (await fetch(base + '/api/digital-market/my-orders', { headers: { Authorization: 'Bearer ' + seller.token } })).json();
    assert(sellerOrders.every(o => !('otpPin' in o) && !('deliveryPinAttempts' in o) && !('deliveryPinExpiresAt' in o)));
    assert(!(await evaluate('document.body.innerText')).includes(pin), 'Seller cannot see buyer PIN');
    await click(button('Verify PIN'));
    for (const width of [375, 768, 1440]) {
      await viewport(width);
      assert(await evaluate(`document.querySelector('input[maxlength="6"]')?.getClientRects().length > 0`), 'Six-digit seller entry');
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Seller modal overflow');
    }
    await input('input[maxlength="6"]', pin);
    await click(button('Verify & Complete')); await until(`!document.querySelector('input[maxlength="6"]')`, 'Seller handover completed');
    const completed = await (await fetch(base + '/api/digital-market/my-orders', { headers: { Authorization: 'Bearer ' + buyer.token } })).json();
    assert.equal(completed.find(o => o.id === order.id).status, 'Completed & Paid');
    assert(!('otpPin' in completed.find(o => o.id === order.id)));
    assert.deepEqual(exceptions, [], 'Browser console/runtime errors'); assert.deepEqual(apiErrors, [], 'Failed API requests');
    console.log('Production buyer PIN renewal/display and seller confirmation/six-digit handover passed at 375, 768 and 1440 pixels, with no overflow or console/API errors.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
