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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-market-dashboard-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role, email) => ({ id: crypto.randomUUID(), role, email, name: `Isolated ${role}`, token: crypto.randomUUID() });
  const buyer = actor('user', `${crypto.randomUUID()}@example.test`);
  const owner = actor('user', `${crypto.randomUUID()}@example.test`);
  const seller = actor('merchant', `${crypto.randomUUID()}@example.test`);
  const manager = { ...actor('manager', `${crypto.randomUUID()}@example.test`), isVerified: true, verificationStatus: 'approved' };
  const store = { id: crypto.randomUUID(), userId: owner.id, studentEmail: seller.email, storeName: 'Isolated seller', status: 'active', setupCompleted: true, registrationFeePaid: true, subscriptionPlan: 'pro' };
  Object.assign(seller, { merchantStoreId: store.id, parentUserId: owner.id, merchantSetupCompleted: true, merchantRegistrationFeePaid: true });
  const application = { id: crypto.randomUUID(), userId: owner.id, studentEmail: seller.email, status: 'approved' };
  const photos = ['/images/company/about-us.jpg', '/images/company/our-vision.jpg', '/images/company/partner-with-us.jpg', '/images/company/partner-with-us-enhanced.webp'];
  const product = { id: crypto.randomUUID(), storeId: store.id, sellerEmail: seller.email, sellerId: seller.id, storeName: store.storeName, title: 'Isolated gallery item', description: 'Item with several photographs', category: 'Electronics', price: 10, isAvailable: true, stockQuantity: 20, imageUrl: photos[0], additionalImages: photos.slice(1) };
  const service = { ...product, id: crypto.randomUUID(), title: 'Isolated service', category: 'Services', isService: true, serviceLocationMode: 'fixed', location: 'Isolated service location', lat: 6.67, lng: -1.57, additionalImages: [], priceCategories: [{ id: 'basic', name: 'Basic', price: 12, imageUrl: photos[1] }, { id: 'extended', name: 'Extended', price: 25, imageUrl: photos[2] }, { id: 'plain', name: 'Price only', price: 8 }] };
  const order = { id: crypto.randomUUID(), productId: product.id, productTitle: product.title, productPrice: 10, quantity: 1, totalAmount: 10, buyerId: buyer.id, buyerEmail: buyer.email, buyerName: buyer.name, sellerEmail: seller.email, storeId: store.id, storeName: store.storeName, meetingLocation: 'Isolated handover location', status: 'Awaiting Seller Confirmation', createdAt: new Date().toISOString(), timeline: [] };
  const receipt = { ...order, id: crypto.randomUUID(), status: 'Completed & Paid' };
  const message = (senderRole, content) => ({ id: crypto.randomUUID(), buyerId: buyer.id, buyerEmail: buyer.email, sellerStoreId: store.id, storeId: store.id, senderRole, senderEmail: senderRole === 'user' ? buyer.email : seller.email, recipientEmail: senderRole === 'user' ? seller.email : buyer.email, senderName: senderRole === 'user' ? buyer.name : seller.name, recipientName: senderRole === 'user' ? store.storeName : buyer.name, content, productId: product.id, createdAt: new Date().toISOString() });
  const inquiry = message('user', 'Buyer inquiry'), reply = message('merchant', 'Seller reply');
  const chatNotice = (role, msg, accountId) => ({ id: crypto.randomUUID(), marketChat: true, messageId: msg.id, buyerId: buyer.id, sellerStoreId: store.id, targetRole: role, targetAccountId: accountId, userId: accountId, title: 'New marketplace message', message: msg.content, read: false, date: msg.createdAt });
  const notices = [chatNotice('merchant', inquiry, seller.id), chatNotice('user', reply, buyer.id),
    { id: crypto.randomUUID(), sellerStoreId: store.id, targetRole: 'merchant', orderId: order.id, scope: 'market', title: 'New Buy Request', message: 'Inspect the order', read: false },
    { id: crypto.randomUUID(), userId: buyer.id, orderId: order.id, scope: 'market', title: 'Order tracking changed', message: 'Your order status changed', read: false },
    { id: crypto.randomUUID(), userId: buyer.id, scope: 'market', title: 'Merchant application update', message: 'Your merchant platform status changed', read: false }];
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, name: 'Isolated approved residence', isApproved: true, approvalStatus: 'Approved', totalCapacity: 10, price: 3000, subscriptionPaid: true, amenities: [], facilities: [], blocks: [], imageUrl: photos[0] };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, owner, seller, manager], digitalMarketApplications: [application], digitalMarketStores: [store], digitalMarketProducts: [product, service], digitalMarketOrders: [order, receipt], digitalMarketMessages: [inquiry, reply], notifications: notices, hostels: [hostel], managerVerifications: [{ id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' }] }));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    // Test the actual production bundle with isolated persistence.
    server = spawn(production ? process.execPath : 'npm', production ? [path.join(project, 'dist/server.cjs')] : ['run', 'dev'], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_DEV_SIGNUP_CODES: 'false', SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => serverLogs += data); server.stderr.on('data', data => serverLogs += data);
    let healthy = false;
    for (let attempt = 0; attempt < 300; attempt++) {
      try { if ((await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { healthy = true; break; } } catch {}
      if (server.exitCode !== null) throw new Error(serverLogs); await pause(100);
    }
    assert(healthy, serverLogs); console.log(`${production ? 'Production bundle' : 'Development server'} ready with isolated data.`);
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=BackForwardCache', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'chrome')}`, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
      if (message.method === 'Fetch.requestPaused') { void command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'Isolated dashboard retry check' })).toString('base64') }); return; }
      if (message.id) { const request = pending.get(message.id); if (!request) return; pending.delete(message.id); clearTimeout(request.timer); message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result); }
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') exceptions.push(message.params.args.map(item => item.value || item.description).join(' '));
      else if (message.method === 'Network.responseReceived' && message.params.response.url.includes('/api/') && message.params.response.status >= 400) apiErrors.push({ url: message.params.response.url, status: message.params.response.status });
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const until = async (expression, label) => { for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw new Error(`${label}: ${await evaluate('JSON.stringify({hash:location.hash,text:document.body.innerText.slice(-3000)})')}`); };
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
    const api = async (route, token, body) => {
      const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json(); assert(response.ok, data.error || route); return data;
    };
    const matchingButton = text => `[...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.textContent.includes(${JSON.stringify(text)}))`;
    const noOverflow = async label => assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${label}: page overflow`);
    const setFile = async (selector, file) => {
      await until(`document.querySelector(${JSON.stringify(selector)}) !== null`, 'File input');
      const doc = await command('DOM.getDocument');
      const found = await command('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
      await command('DOM.setFileInputFiles', { nodeId: found.nodeId, files: [file] });
    };
    await viewport(1440); await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/room-keys*' }] });

    for(const width of [1440,375]) {
      await viewport(width); await switchAccount(owner.token, '/#/student/dashboard');
      await until("document.querySelector('button[aria-label=\"Book Isolated service\"]')", 'Own service visible');
      if(await evaluate("Boolean(document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]'))")) await click(button("Got It, Let's Go!"));
      await click(`document.querySelector('button[aria-label="Book Isolated service"]')`);
      await until("document.querySelector('[role=dialog][aria-label=\"Inspect Isolated service\"]')", 'Inspect open');
      await click(`[...document.querySelector('[aria-label="Inspect Isolated service"]').querySelectorAll('button')].at(-1)`);
      await until("document.querySelector('[role=dialog][aria-label=\"Request to Buy or Book\"]')", 'Booking dialog');
      await input('input[placeholder="Enter your active mobile number"]','0241234567');
      await click(`document.querySelector('[aria-label="Request to Buy or Book"] button[type=submit]')`);
      await until("document.querySelector('[aria-label=\"Request to Buy or Book\"] [role=alert]')", 'Self-purchase error inside open dialog');
      const notice = await evaluate("(()=>{const n=document.querySelector('[data-market-action-error]');const r=n.getBoundingClientRect();return {text:n.textContent,top:r.top,bottom:r.bottom,height:innerHeight,inside:Boolean(n.closest('[role=dialog]'))}})()");
      assert(/own|self/i.test(notice.text)); assert(notice.inside);
      await pause(400);
      assert(await evaluate("(()=>{const r=document.querySelector('[data-market-action-error]').getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})()"),'Error scrolled into view');
      await noOverflow(`${width}px order error`);
      console.log(`${width}px: self-purchase remains blocked, and its error appears in the open booking dialog.`);
    }
    const disk=JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8'));
    assert.equal(disk.digitalMarketOrders.length,2,'Rejected self-purchases created no orders');
    assert.deepEqual(exceptions, [], 'No marketplace render errors');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
