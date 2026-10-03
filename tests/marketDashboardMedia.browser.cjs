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
  const service = { ...product, id: crypto.randomUUID(), title: 'Isolated service', category: 'Services', isService: true, serviceLocationMode: 'flexible', additionalImages: [], priceCategories: [{ id: 'basic', name: 'Basic', price: 12, imageUrl: photos[1] }, { id: 'extended', name: 'Extended', price: 25, imageUrl: photos[2] }, { id: 'plain', name: 'Price only', price: 8 }] };
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
    await switchAccount(manager.token, '/#/manager/dashboard');
    await until("document.body.innerText.includes('Isolated dashboard retry check') && document.body.innerText.includes('Retry dashboard')", 'Manager failed request is visible');
    await command('Fetch.disable');
    for (const failed of apiErrors) assert(failed.url.includes('/api/room-keys') && failed.status === 503, 'Only deliberately rejected requests may fail');
    apiErrors.length = 0;
    // Chromium reports intentional HTTP failures through console.error too.
    for (const error of exceptions) assert(error.includes('503') || error.includes('Isolated dashboard retry check'), error);
    exceptions.length = 0;
    await click(button('Retry dashboard'));
    await until("document.body.innerText.includes('Live Operations Audit') && document.body.innerText.includes('Isolated approved residence')", 'Manager data hydrated');
    assert(!await evaluate("document.body.innerText.includes('Syncing Operational State')"));
    for (const width of [375, 768, 1440]) { await viewport(width); await noOverflow('Manager'); }
    console.log('Manager operational data renders after successful requests at 375/768/1440px.');

    await viewport(1440); await switchAccount(buyer.token, '/#/student/dashboard');
    const blueMarketBadge = `[...document.querySelectorAll('[data-notification-count="3"]')].some(n => n.getClientRects().length && n.classList.contains('bg-blue-600') && n.closest('button')?.textContent.includes('Market'))`;
    await until(blueMarketBadge, 'Buyer sidebar market count');
    await pause(300);
    if (await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]') !== null")) await click(button("Got It, Let's Go!"));
    await evaluate("localStorage.setItem('pinevela_navigation_layout','top')");
    await command('Page.reload'); await until(blueMarketBadge, 'Buyer top-navbar market count');
    await viewport(375); await until(blueMarketBadge, 'Buyer mobile market count'); await noOverflow('Buyer mobile');
    await viewport(1440);
    await click(`document.querySelector('button[aria-label="Inspect Isolated gallery item"]')`);
    await until("document.querySelector('[aria-label=\"Item photographs\"]')?.querySelectorAll('button').length === 4", 'Item mini photographs');
    await click(`document.querySelector('button[aria-label="Enlarge photograph 2 of Isolated gallery item"]')`);
    await until("document.querySelector('[role=dialog][aria-label=\"Isolated gallery item photographs\"]') !== null", 'Fullscreen image viewer');
    await click(`document.querySelector('button[aria-label="Next photograph"]')`);
    assert(await evaluate("document.querySelector('[aria-label=\"Isolated gallery item photographs\"] img').src.endsWith('partner-with-us.jpg')"));
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft' });
    await until("document.querySelector('[aria-label=\"Isolated gallery item photographs\"] img').src.endsWith('our-vision.jpg')", 'Keyboard gallery navigation');
    await viewport(375); await noOverflow('Fullscreen viewer');
    await evaluate(`(()=>{ const area=document.querySelector('[aria-label=\"Isolated gallery item photographs\"] img').parentElement; const start=new Touch({identifier:1,target:area,clientX:280,clientY:350}); const end=new Touch({identifier:1,target:area,clientX:80,clientY:350}); area.dispatchEvent(new TouchEvent('touchstart',{touches:[start],changedTouches:[start],bubbles:true})); area.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[end],bubbles:true})); })()`);
    await until("document.querySelector('[aria-label=\"Isolated gallery item photographs\"] img').src.endsWith('partner-with-us.jpg')", 'Mobile gallery swipe');
    await click(`document.querySelector('button[aria-label="Close photographs"]')`);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Isolated gallery item photographs\"]')"), null);
    await switchAccount(buyer.token, '/#/student/dashboard');
    await click(`document.querySelector('button[aria-label="Book Isolated service"]')`);
    await until("document.querySelector('button[aria-label=\"Enlarge Isolated service\"]') !== null", 'Service inspection');
    await click(matchingButton('Extended'));
    assert(await evaluate("document.querySelector('button[aria-label=\"Enlarge Isolated service\"] img').src.endsWith('partner-with-us.jpg')"));
    await click(matchingButton('Price only'));
    assert(await evaluate("document.querySelector('button[aria-label=\"Enlarge Isolated service\"] img').src.endsWith('about-us.jpg')"));
    console.log('Item gallery, fullscreen X/arrows/keyboard/mobile swipe and service price/photo pairing passed.');

    await switchAccount(buyer.token, '/#/student/dashboard?tab=digital-market&mode=chats');
    await click(matchingButton('Chat & Logistics'));
    await until(`${matchingButton('Chat & Logistics')}?.querySelector('[data-notification-count="1"]') != null`, 'Buyer blue chat count');
    assert(await evaluate(`${matchingButton('Chat & Logistics')}.querySelector('[data-notification-count]').classList.contains('bg-blue-600')`));
    await click(`[...document.querySelectorAll('[aria-label="Conversations"] button')].find(b=>b.getClientRects().length)`);
    await until(`${matchingButton('Chat & Logistics')}?.querySelector('[data-notification-count]') === null`, 'Opening conversation clears unread count');
    await click(matchingButton('Purchases & Tracking'));
    await until(`${matchingButton('Purchases & Tracking')}?.querySelector('[data-notification-count]') === null`, 'Tracking alerts acknowledged');
    await api('/api/digital-market/ratings', buyer.token, { orderId: receipt.id, rating: 4, review: 'Helpful service' });
    await switchAccount(seller.token, '/#/digital-market');
    await until(`${matchingButton('Messages')}?.querySelector('[data-notification-count="1"]') != null`, 'Seller red message badge');
    assert(await evaluate(`${matchingButton('Messages')}.querySelector('[data-notification-count]').classList.contains('bg-rose-600')`));
    for (const width of [1440, 768, 375]) { await viewport(width); await until(`${matchingButton('Messages')}?.querySelector('[data-notification-count="1"]') != null`, 'Responsive seller badge'); await noOverflow('Seller'); }
    await click(matchingButton('Notifs'));
    await until("document.body.innerText.includes('New verified purchase review') && document.body.innerText.includes('Helpful service')", 'Seller detailed rating notification');
    assert(await evaluate("document.body.innerText.includes('Isolated user rated Isolated gallery item 4/5')"));
    await click(button('View Order'));
    await until("document.getElementById('active-handover-orders') !== null", 'Seller specific order view');
    assert(!await evaluate("document.querySelector('#pin-group-input') !== null"), 'View Order must not open the PIN form');
    await click(matchingButton('Messages'));
    await click(`[...document.querySelectorAll('[aria-label="Conversations"] button')].find(b=>b.getClientRects().length)`);
    await until(`${matchingButton('Messages')}?.querySelector('[data-notification-count]') === null`, 'Seller message acknowledged');
    console.log('Buyer blue and seller red badges, scoped read clearing, rating notification and View Order without PIN passed.');

    await viewport(1440); await click(button('Publish Item'));
    await input('#add-group-title input', 'Published gallery item');
    await input('#add-group-price input', '35');
    await input('#add-group-desc textarea', 'Further views of this item');
    await setFile('#file-upload', path.join(project, 'public/images/company/about-us.jpg'));
    await until("document.querySelector('.reactEasyCrop_Image')?.complete && document.querySelector('.reactEasyCrop_Image')?.naturalWidth > 0 && document.querySelector('.reactEasyCrop_CropArea')?.getBoundingClientRect().width > 0", 'Crop image and geometry ready');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await click(button('Apply & Save Photo'));
    await until("document.querySelector('#file-upload-replace') !== null", 'Main photo crop saved');
    for (let i = 0; i < 3; i++) {
      await setFile('input[aria-label="Add extra item photo"]', path.join(project, `public${photos[i]}`));
      await until(`document.body.innerText.includes('Extra item photographs · ${i + 1}/3')`, 'Extra photo uploaded');
    }
    assert.equal(await evaluate("document.querySelector('input[aria-label=\"Add extra item photo\"]')"), null);
    await click(button('Publish to Campus Market'));
    await until("!document.body.innerText.includes('Publish Item to Global Market')", 'Item published');
    const listed = (await api('/api/digital-market/products', buyer.token)).find(p => p.title === 'Published gallery item');
    assert.equal(listed.additionalImages.length, 3); assert(listed.additionalImages.every(url => url.startsWith('/uploads/hostels/')));
    await click(matchingButton('Services ('));
    await click(button('Add Service'));
    for (let i = 0; i < 4; i++) await click(button('Add Price'));
    assert(await evaluate("[...document.querySelectorAll('button')].some(b=>b.innerText.includes('4 price options maximum') && b.disabled)"));
    await setFile('input[aria-label="Photo for price option 1 (optional)"]', path.join(project, 'public/images/company/our-vision.jpg'));
    await until("document.querySelector('input[aria-label=\"Photo for price option 1 (optional)\"]').closest('div').querySelector('img') !== null", 'Service option photo uploaded');
    for (const width of [375, 768, 1440]) { await viewport(width); await noOverflow('Service option publishing'); }
    assert.deepEqual(exceptions, [], 'Unexpected browser console/runtime errors'); assert.deepEqual(apiErrors, [], 'Failed API requests');
    console.log('Actual item publication with three secured extra photos and service four-option limit/upload passed. No console/API errors or page overflow.');

  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
