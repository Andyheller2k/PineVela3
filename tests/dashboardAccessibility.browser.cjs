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
  const managerSettingsCheck = process.argv.includes('--manager-settings');
  const housingCheck = process.argv.includes('--housing') || managerSettingsCheck;
  const admin = actor('admin', `${crypto.randomUUID()}@example.test`);
  const newManager = { ...actor('manager', `${crypto.randomUUID()}@example.test`), isVerified: true, verificationStatus: 'approved' };
  const store = { id: crypto.randomUUID(), userId: owner.id, studentEmail: seller.email, storeName: 'Isolated seller', status: 'active', setupCompleted: true, registrationFeePaid: true, subscriptionPlan: 'pro', subscriptionStatus: 'active', subscriptionExpiresAt: new Date(Date.now()+86400000).toISOString(), semesterExpiresAt: new Date(Date.now()+86400000).toISOString() };
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
  if (housingCheck) Object.assign(hostel, { location: 'Kumasi KNUST Ayeduase', blocksList: [{ id: 'housing-block', name: 'Female Block', gender: 'Female', totalRooms: 3, bedsPerRoom: 2, roomTypes: [{ id: 'housing-room', typeName: '2 in 1 Room', bedsPerRoom: 2, totalRooms: 3, pricePerBed: 7777 }] }] });
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, owner, seller, manager, ...(housingCheck ? [admin, newManager] : [])], digitalMarketApplications: [application], digitalMarketStores: [store], paymentTransactions: [{id:crypto.randomUUID(),storeId:store.id,purpose:'activation',status:'fulfilled',mode:'free'}], digitalMarketProducts: [product, service], digitalMarketOrders: [order, receipt], digitalMarketMessages: [inquiry, reply], notifications: notices, hostels: [hostel, ...(housingCheck ? [{ ...hostel, id: crypto.randomUUID(), name: 'Isolated pending residence', isApproved: false, approvalStatus: 'Pending Approval' }] : [])], managerVerifications: [{ id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' }, ...(housingCheck ? [{ id: crypto.randomUUID(), managerId: newManager.id, managerEmail: newManager.email, status: 'approved' }] : [])] }));
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
    const heldChunks = new Set();
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`Browser command timed out: ${method}`)); }, 20000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.onclose = () => { for (const request of pending.values()) { clearTimeout(request.timer); request.reject(new Error('Browser connection closed')); } pending.clear(); };
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Fetch.requestPaused') {
        if (process.argv.includes('--skeleton')) { heldChunks.add(message.params.requestId); return; }
        void command('Fetch.fulfillRequest', { requestId: message.params.requestId, responseCode: 503, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify({ error: 'Isolated dashboard retry check' })).toString('base64') }); return;
      }
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
    if (housingCheck) {
      let managerKey;
      for (const [width, layout] of [[375, 'top'], [768, 'top'], [1440, 'top'], [1440, 'sidebar']]) {
        await viewport(width); await switchAccount(manager.token, '/#/manager/dashboard');
        await until("document.body.innerText.includes('Live Operations Audit')", 'Manager loaded');
        if (!managerKey) {
          await until("document.querySelector('textarea[aria-label=\"Your manager secret key\"]')", 'Manager key issued');
          managerKey = await evaluate("document.querySelector('textarea[aria-label=\"Your manager secret key\"]').value");
          await click("document.querySelector('dialog[aria-label=\"Save your manager secret key\"] input[type=checkbox]')");
          await click("[...document.querySelector('dialog[aria-label=\"Save your manager secret key\"]').querySelectorAll('button')].find(b=>b.textContent==='Continue')");
        }

        await evaluate(`localStorage.setItem('pinevela_navigation_layout', ${JSON.stringify(layout)})`);
        await command('Page.reload');
        const profile = "[...document.querySelectorAll('button[title=\"Manager Profile Settings\"]')].find(b=>b.getClientRects().length)";
        if (width < 1024) {
          await click("document.querySelector('.mobile-bottom-nav [data-navigation-id=more]')");
          await click("document.querySelector('dialog [data-navigation-id=settings]')");
        } else await click(profile);
        await until("document.querySelector('section[aria-label=\"Manager Profile Settings\"]') !== null", 'Settings page');
        assert(await evaluate("!document.querySelector('dialog[aria-label=\"Manager Profile Settings\"]') && document.querySelector('input[aria-label=\"Full Name\"]') !== null"), 'Profile is a page, not a popup');
        await noOverflow(`${width}px manager settings ${layout}`);
        if (managerSettingsCheck) {
          for (const theme of ['dark', 'light']) {
            if (await evaluate('document.documentElement.dataset.theme') !== theme) {
              await click("[...document.querySelectorAll('[role=switch][aria-label=\"Dark mode\"]')].find(b=>b.getClientRects().length)");
            }
            await until(`document.documentElement.dataset.theme === ${JSON.stringify(theme)}`, 'Settings theme');
            await noOverflow(`${width}px manager settings ${theme} ${layout}`);
            const capture = await command('Page.captureScreenshot', {format:'png'});
            await fs.writeFile(`/tmp/pinevela-manager-settings-${width}-${layout}-${theme}.png`, Buffer.from(capture.data,'base64'));
          }
        }

        if (width === 375) {
          await input('input[aria-label="Full Name"]', 'Updated isolated manager');
          await input('input[aria-label="Official Phone Number"]', '0241234567');
          await click(button('Save Profile Changes'));
          await until("document.querySelector('dialog[aria-label=\"Authorize manager action\"]')?.open", 'Profile change requires manager key');
          await input('dialog[aria-label="Authorize manager action"] input[type=password]', managerKey);
          await click(button('Confirm change'));

          await until("document.querySelector('section[aria-label=\"Manager Profile Settings\"] [role=status]') !== null", 'Profile save completed on settings page');
          const saved = await api('/api/auth/me', manager.token);
          assert.equal((saved.user || saved).name, 'Updated isolated manager');
        }
        await click(matchingButton(width < 1024 || layout === 'top' ? 'Properties' : 'My Properties'));
        await until("document.body.innerText.includes('Registered Property Dossier')", 'Property details');
        assert(await evaluate("!document.body.innerText.includes('Annual Fee') && !document.body.innerText.includes('GHS')"), 'Manager property has no room price');
        await noOverflow(`${width}px manager ${layout}`);
        console.log(`${width}px manager ${layout}: settings renders as a page and property prices absent.`);
      }
      if (managerSettingsCheck) {
        assert.deepEqual(exceptions, [], 'No browser JavaScript errors');
        console.log('Passed: mobile More Settings, responsive profile page, both desktop navigation layouts, dark/light themes, and key-authorized profile saving.');
        return;
      }
      await viewport(1440); await switchAccount(admin.token, '/#/admin/dashboard');
      await click(matchingButton('Residences'));
      await click(button('Details'));
      await until("document.body.innerText.includes('2 in 1 Room')", 'Admin sees actual room types');
      assert(await evaluate("!document.body.innerText.includes('/bed') && !document.body.innerText.includes('7777')"), 'Admin inspection hides legacy prices');
      await switchAccount(admin.token, '/#/admin/dashboard');
      await click(matchingButton('Residences')); await click(button('Edit')); await click(button('Stay Cycle'));
      assert(await evaluate("!document.body.innerText.includes('Standard Room Fee') && !document.body.innerText.includes('Refundable Security Deposit') && !document.body.innerText.includes('Pricing & Deposit')"), 'Residence editor has no room pricing inputs');
      await switchAccount(buyer.token, '/#/'); await click(button('View Details'));
      await until("document.body.innerText.includes('Room Configuration Options')", 'Public residence details');
      assert(await evaluate("document.body.innerText.includes('2 in 1 Room') && !document.body.innerText.includes('GHS') && !document.body.innerText.includes('7777')"), 'Public details use actual unpriced configuration');
      await switchAccount(newManager.token, '/#/manager/dashboard');
      await until("document.body.innerText.includes('Register a Hostel to Start Onboarding')", 'New manager registration action');
      const draft = { name: 'Isolated registration', contactEmail: newManager.email, contactPhone: '0241234567', imageUrl: photos[0], gallery: [photos[1]], blocksList: [{ id: 'capacity-block', name: 'Capacity block', gender: 'Female', floors: 1, totalRooms: 3, roomPrefix: 'C', startNum: 1, bedsPerRoom: 1, roomTypes: [{ id: 'capacity-room', typeName: '1 in 1 Room', bedsPerRoom: 1, totalRooms: 3 }] }] };
      await evaluate(`localStorage.setItem('pinevela_hostel_registration_draft_v1', ${JSON.stringify(JSON.stringify(draft))})`);
      await click(button('Register a Hostel to Start Onboarding'));
      await click(button('Continue to Map Pin')); await click(button('Continue to Image Upload')); await click(button('Continue to Capacity'));
      await until("document.body.textContent.includes('Room Type / Bedspace #1')", 'Capacity form');
      assert(await evaluate("!document.body.innerText.includes('Beds / Room') && document.querySelector('input[placeholder=\"Beds/Rm\"]') === null"), 'Redundant bed input removed');
      await evaluate("(()=>{const select=[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.value==='4 in 1 Room'));select.value='4 in 1 Room';select.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await until("JSON.parse(localStorage.getItem('pinevela_hostel_registration_draft_v1')).maximumCapacity === 12", 'Selector recalculates capacity');
      assert(await evaluate("JSON.parse(localStorage.getItem('pinevela_hostel_registration_draft_v1')).blocksList[0].roomTypes[0].bedsPerRoom === 4"), 'Bed count follows room type');
      for (const width of [375, 768, 1440]) { await viewport(width); await noOverflow(`${width}px registration`); }
      assert.deepEqual(exceptions, [], 'No browser errors'); assert.deepEqual(apiErrors, [], 'No API errors');
      console.log('Admin inspection/editor and public details hide prices; registration selector calculates 4 beds x 3 rooms = 12.');
      return;
    }
    if (process.argv.includes('--skeleton')) {
      await command('Network.setCacheDisabled', { cacheDisabled: true });
      await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      for (const width of [375, 768, 1440]) {
        await viewport(width);
        for (const [token, route, layout, ready] of [
          [buyer.token, '/#/login', 'form', "document.querySelector('input[type=password]') !== null"],
          [buyer.token, '/#/register-manager', 'form', "document.querySelector('input') !== null"],
          [buyer.token, '/#/user/dashboard', 'dashboard', "document.body.innerText.includes('Inspect')"],
          [seller.token, '/#/digital-market', 'dashboard', `${matchingButton('Messages')} !== undefined`],
        ]) {
          heldChunks.clear();
          await command('Fetch.enable', { patterns: [{ urlPattern: '*/assets/Page*.js' }] });
          await switchAccount(token, route);
          await until(`document.querySelector('[data-route-skeleton="${layout}"]') !== null`, 'Route skeleton visible');
          assert(await evaluate(`(()=>{const root=document.querySelector('[data-route-skeleton]');return root.getAttribute('role')==='status' && root.getAttribute('aria-busy')==='true' && root.querySelector('[aria-hidden="true"]')!==null && !document.body.innerText.includes('Loading PineVela') && [...root.querySelectorAll('[class*="motion-safe:animate-pulse"]')].every(el=>getComputedStyle(el).animationName==='none');})()`), 'Accessible skeleton respects reduced motion');
          await noOverflow(`${width}px ${route} skeleton`);
          await command('Fetch.disable');
          await until(ready, 'Real page replaces skeleton');
          assert(await evaluate("document.querySelector('[data-route-skeleton]') === null"), 'Skeleton removed after load');
          await noOverflow(`${width}px ${route} loaded`);
          console.log(`${width}px ${route}: skeleton, reduced motion and real page verified.`);
        }
      }
      assert.deepEqual(exceptions, [], 'No browser errors');
      assert.deepEqual(apiErrors, [], 'No API errors');
      return;
    }
    if (process.argv.includes('--measure')) {
    await command('Network.setCacheDisabled', { cacheDisabled: true });
    await command('Network.setBlockedURLs', { urls: ['*://fonts.googleapis.com/*', '*://fonts.gstatic.com/*'] });
    await viewport(375);
    await command('Emulation.setCPUThrottlingRate', { rate: 4 });
    await command('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750, connectionType: 'cellular4g' });
    const samples = [];
    for (let run = 0; run < 3; run++) {
      await command('Page.navigate', { url: 'about:blank' });
      await command('Network.clearBrowserCache');
      await command('Page.navigate', { url: base + '/#/' });
      await until("document.querySelector('main') !== null && document.body.innerText.includes('PineVela')", 'Mobile landing rendered');
      await pause(700);
      samples.push(await evaluate(`JSON.stringify({
        firstContentfulPaintMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime,
        js: performance.getEntriesByType('resource').filter(r=>r.name.includes('/assets/') && r.name.endsWith('.js')).map(r=>({file:r.name.split('/').pop(),bytes:r.decodedBodySize,encodedBytes:r.encodedBodySize})),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
      })`).then(JSON.parse));
    }
    for (const sample of samples) { assert(!sample.horizontalOverflow); assert(!sample.js.some(r=>/Page.*Dashboard|charts|leaflet/.test(r.file)), 'Optional portal/chart/map bundles must not load on the landing route'); }
    const measurement = { conditions: '375x900 viewport; 4x CPU slowdown; 1.6 Mbps download, 150 ms latency; cold browser cache; external fonts blocked consistently; three runs', samples };
    const reportPath = process.argv.find(arg=>arg.startsWith('--measurement='))?.slice('--measurement='.length);
    if (reportPath) await fs.writeFile(reportPath, JSON.stringify(measurement, null, 2));
    console.log(JSON.stringify(measurement, null, 2));
    return;
    }
    const key = async (key, shift = false) => {
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: ({Tab:9,Escape:27,ArrowRight:39,ArrowLeft:37})[key], modifiers: shift ? 8 : 0 });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: ({Tab:9,Escape:27,ArrowRight:39,ArrowLeft:37})[key], modifiers: shift ? 8 : 0 });
    };
    const modal = `document.querySelector('dialog[data-dashboard-overlay]:last-of-type')`;
    const inspect = `document.querySelector('button[aria-label="Inspect Isolated gallery item"]')`;
    const checkKeyboard = async label => {
      assert(await evaluate(`${modal}.open && ${modal}.matches(':modal') && ${modal}.getAttribute('aria-label').length > 0`), label + ': native named modal');
      assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
      assert(await evaluate(`${modal}.contains(document.activeElement)`), label + ': initial focus');
      const ax = await command('Accessibility.getFullAXTree');
      assert(ax.nodes.some(n=>!n.ignored && n.role?.value === 'dialog' && n.name?.value?.length > 0), label + ': named accessibility-tree dialog');
      assert.equal(ax.nodes.filter(n=>!n.ignored && n.role?.value === 'button' && n.name?.value === 'Sign Out').length, label === 'Sign out' ? 1 : 0, label + ': background navigation is absent from the accessible controls');
      await evaluate(`(()=>{const outside=[...document.querySelectorAll('#root button')].find(b=>b.getClientRects().length); outside.focus();})()`);
      assert(await evaluate(`${modal}.contains(document.activeElement)`), label + ': background focus denied');
      const controls = `${modal}.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]')`;
      await evaluate(`(()=>{window.modalControls=[...${controls}].filter(e=>!e.disabled && e.tabIndex>=0 && e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');modalControls.at(-1).focus();})()`);
      await key('Tab'); assert(await evaluate('document.activeElement === modalControls[0]'), label + ': Tab wraps');
      await key('Tab', true); assert(await evaluate('document.activeElement === modalControls.at(-1)'), label + ': Shift+Tab wraps');
      await noOverflow(label);
    };
    if (process.argv.includes('--map')) {
      await viewport(375); await switchAccount(buyer.token, '/#/student/dashboard');
      await until(`${inspect} !== null`, 'Buyer route ready');
      await pause(300);
      if (await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]') !== null")) await click(button("Got It, Let's Go!"));
      await evaluate(`${inspect}.focus()`); await click(inspect); await click(button('Request to Buy'));
      const mapButton = `[...document.querySelectorAll('dialog[aria-label="Request to Buy or Book"] button')].find(b=>b.getClientRects().length && b.textContent.includes('Map'))`;
      await until(`${mapButton} !== undefined`, 'Order map button');
      await evaluate(`${mapButton}.focus()`); await click(mapButton);
      await until("document.querySelector('.leaflet-container .leaflet-pane') !== null && document.querySelector('.leaflet-control-zoom') !== null", 'Local Leaflet map initializes');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.leaflet-pane')).position"), 'absolute', 'Bundled Leaflet styles apply');
      await checkKeyboard('Nested meetup map');
      await key('Escape'); await until(`${modal}?.getAttribute('aria-label') === 'Request to Buy or Book'`, 'Map Escape preserves the order form');
      assert(await evaluate(`document.activeElement === ${mapButton}`), 'Map opener focus restored');
      await key('Escape'); await until(`${modal} === null`, 'Order cancellation');
      assert.equal((await api('/api/digital-market/my-orders', buyer.token)).length, 2);
      assert.deepEqual(exceptions, [], 'No map application errors');
      assert.deepEqual(apiErrors, [], 'No map API errors');
      console.log('Mobile nested meetup map initializes with bundled Leaflet CSS; keyboard containment, Escape and focus restoration work without submitting an order.');
      return;
    }
    for (const [width, layout] of [[1440, 'sidebar'], [1440, 'top'], [768, 'top'], [375, 'top']]) {
      await viewport(width); await switchAccount(buyer.token, '/#/student/dashboard');
      await until(`${inspect} !== null`, 'Buyer initial route');
      await pause(300);
      if (await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]') !== null")) { await click(button("Got It, Let's Go!")); await until("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]') === null", 'Welcome acknowledged'); }
      await evaluate(`localStorage.setItem('pinevela_navigation_layout', ${JSON.stringify(layout)})`);
      await command('Page.reload'); await until(`${inspect} !== null`, 'Buyer route loaded');
      await evaluate(`${inspect}.focus()`); await click(inspect);
      await until(`${modal}?.getAttribute('aria-label') === 'Inspect Isolated gallery item'`, 'Inspection dialog');
      await checkKeyboard(`${width}px ${layout} inspection`);
      await key('Escape'); await until(`${modal} === null`, 'Escape dismisses inspection');
      assert(await evaluate(`document.activeElement === ${inspect}`), 'Inspection restores opener');
      assert.equal(await evaluate('document.body.style.overflow'), '');
      await evaluate(`${inspect}.focus()`); await click(inspect);
      const thumbnail = `document.querySelector('button[aria-label="Enlarge photograph 2 of Isolated gallery item"]')`;
      await evaluate(`${thumbnail}.focus()`); await click(thumbnail);
      await until("document.querySelectorAll('dialog[data-dashboard-overlay]').length === 2", 'Nested photo viewer');
      await checkKeyboard(`${width}px nested viewer`);
      await key('ArrowRight');
      assert(await evaluate(`${modal}.querySelector('img').src.endsWith('partner-with-us.jpg')`), 'Gallery arrow action preserved');
      await evaluate(`document.querySelector('dialog[aria-label="Inspect Isolated gallery item"] button').focus()`);
      assert(await evaluate(`${modal}.contains(document.activeElement)`), 'Underlying dialog remains inert');
      await key('Escape'); await until("document.querySelectorAll('dialog[data-dashboard-overlay]').length === 1", 'Escape closes only nested gallery');
      assert(await evaluate(`document.activeElement === ${thumbnail}`), 'Nested modal restores thumbnail focus');
      assert.equal(await evaluate('document.body.style.overflow'), 'hidden');
      await key('Escape'); await until(`${modal} === null`, 'Inspection closes');
      assert.equal(await evaluate('document.body.style.overflow'), '');
      console.log(`${width}px ${layout}: modal semantics, focus containment, background inertness, Tab/Shift+Tab, nested Escape and focus/scroll restoration passed.`);
    }
    await viewport(1440); await switchAccount(buyer.token, '/#/student/dashboard');
    await until(`${inspect} !== null`, 'User route');
    const signout = `[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && b.title === 'Sign Out')`;
    await evaluate(`${signout}.focus()`); await click(signout);
    await until(`${modal}?.getAttribute('aria-label') === 'Sign Out Confirmation'`, 'Sign-out modal');
    await checkKeyboard('Sign out'); await key('Escape'); await until(`${modal} === null`, 'Sign-out cancellation');
    assert(await evaluate(`document.activeElement === ${signout}`), 'Sign-out focus restored without logging out');
    // Existing action opens the order form; cancellation must never submit an order.
    await click(inspect); await click(button('Request to Buy'));
    await until(`${modal}?.getAttribute('aria-label') === 'Request to Buy or Book'`, 'Order form');
    await checkKeyboard('Order form'); await key('Escape'); await until(`${modal} === null`, 'Cancel order form');
    assert.equal((await api('/api/digital-market/my-orders', buyer.token)).length, 2, 'Keyboard cancellation did not create an order');
    // Auth gates remain in place while routes load on demand.
    await switchAccount(buyer.token, '/#/admin/dashboard');
    await until("document.body.innerText.includes('Access Denied')", 'Unauthorized dashboard remains denied');
    await switchAccount(manager.token, '/#/manager/dashboard');
    await until("document.body.innerText.includes('Live Operations Audit')", 'Lazy manager route');
    await switchAccount(seller.token, '/#/digital-market');
    await until(`${matchingButton('Messages')} !== undefined`, 'Lazy seller route');
    await switchAccount(buyer.token, '/#/market');
    await until(`document.body.innerText.includes('Digital Student Market') && ${inspect} !== null`, 'Lazy market alias');
    assert.deepEqual(exceptions, [], 'Unexpected browser console/runtime errors');
    assert.deepEqual(apiErrors, [], 'Unexpected API errors');
    console.log('Lazy buyer/market, manager and seller routes load; admin role restriction preserved; no console/API errors.');
    // Simulate an unavailable lazy chunk, then recover by reloading the same route.
    await command('Fetch.enable', { patterns: [{ urlPattern: '*/assets/PagePublicStore-*.js' }] });
    await switchAccount(buyer.token, `/#/pinemarket/stores/${store.id}`);
    await until("document.body.innerText.includes('This page could not load') && document.body.innerText.includes('Reload page')", 'Chunk failure has a recovery action');
    await command('Fetch.disable');
    exceptions.length = 0; apiErrors.length = 0;
    await click(button('Reload page'));
    await until("document.querySelector('[data-market-storefront]') !== null", 'Reload recovers lazy store route');
    assert.deepEqual(exceptions, [], 'No errors after recovering the chunk');
    console.log('Unavailable route chunk shows an explicit reload action and successfully recovers.');

  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
