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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-settings-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const admins = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Browser founder ${i + 1}`, email: `founder${i + 1}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved', password: crypto.createHash('sha256').update(`Browser-settings-login-${i}!`).digest('hex') }));
  const settingsKeys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const primary = { id: crypto.randomUUID(), role: 'user', name: 'Browser primary user', email: 'browser-primary@example.test', token: crypto.randomUUID(), isVerified: true };
  const merchant = { id: crypto.randomUUID(), role: 'merchant', name: 'Browser seller', email: 'browser-seller@example.test', token: crypto.randomUUID(), isDigitalMarketOnly: true, isVerified: true, merchantStoreId: 'browser-paid-store', merchantSetupCompleted: true, merchantRegistrationFeePaid: true };
  const paidStore = { id: merchant.merchantStoreId, studentEmail: merchant.email, userId: merchant.id, storeName: 'Browser seller store', status: 'active', setupCompleted: true, registrationFeePaid: true, subscriptionPlan: 'default', subscriptionStatus: 'free', subscriptionExpiresAt: '2099-01-01T00:00:00.000Z', semesterExpiresAt: '2099-01-01T00:00:00.000Z', paymentMode: 'free' };
  const keys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((a, i) => ({ id: a.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${a.id}:${keys[i]}`).digest('hex'), ...(i ? { settingsKeyHash: crypto.createHash('sha256').update(`settings:${a.id}:${settingsKeys[i]}`).digest('hex') } : {}) })), proposals: [], invitations: [], changes: [], attempts: {} };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, merchant], digitalMarketStores: [paidStore], digitalMarketApplications: [{ id: 'browser-paid-app', studentEmail: merchant.email, userId: merchant.id, status: 'approved' }], paymentTransactions: [{ id: 'browser-paid-transaction', storeId: paidStore.id, purpose: 'activation', status: 'fulfilled', mode: 'free' }], hostels: [], adminGovernance: governance, platformSettings: { registrationFee: 50, commission: 5, announcement: '', maintenanceMode: false } }));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_PUBLIC_ORIGIN: base, PAYSTACK_SECRET_KEY: '', PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PINEVELA_MAIN_ADMIN_ID: admins[0].id, PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', data => serverLogs += data); server.stderr.on('data', data => serverLogs += data);
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} if (server.exitCode !== null) throw new Error(serverLogs); await pause(100); }
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
    const until = async (expression, label) => { for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(`(async()=>Boolean(await (${expression})))()`)) return; await pause(100); } throw new Error(`${label}: ${await evaluate('JSON.stringify({hash:location.hash,text:document.body.innerText.slice(-3000)})')}`); };
    const click = async expression => { await until(`${expression}?.getClientRects().length > 0 && !${expression}.disabled`, 'Enabled visible control'); await evaluate(`${expression}.click()`); };
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
    await viewport(1440); await switchAccount(admins[0].token, '/#/admin/dashboard');
    await until("document.body.innerText.includes('Shared approvals')", 'Admin dashboard');
    await click(matchingButton('Settings'));
    await until("document.body.innerText.includes('Enroll your separate settings key')", 'Settings key enrollment');
    await input('input[autocomplete="current-password"]', 'Browser-settings-login-0!');
    await click(button('Generate my settings key'));
    await until("document.querySelector('[aria-label=\"Administrator settings\"] code')?.textContent.length === 43", 'Owner receives a settings key once');
    settingsKeys[0] = await evaluate("document.querySelector('[aria-label=\"Administrator settings\"] code').textContent");
    assert.notEqual(settingsKeys[0], keys[0]); await click(button('I saved my settings key'));
    await until("!document.querySelector('[aria-label=\"Administrator settings\"] code')", 'Key dismissed');
    for (const width of [375, 768, 1440]) {
      await viewport(width); await noOverflow(`Admin settings at ${width}`);
      assert(await evaluate("document.body.innerText.includes('Temporary restrict non admin accounts during database updates')"));
      assert(await evaluate("document.querySelector('[aria-label=\"Administrator settings\"] input[type=file]') !== null"));
      assert(await evaluate("document.querySelector('[aria-label=\"Payment receiving account\"]') !== null"));
      assert(await evaluate("document.querySelector('[aria-label=\"Payment receiving account\"] a').href === 'https://dashboard.paystack.com/'"));
    }
    await input('input[type=number][max="1000000"]', '62.50'); await input('input[type=number][max="100"]', '7.5');
    for (const [label, amount] of [['Semester fee', '210.25'], ['Pine Default', '0'], ['Pine Star', '45.5'], ['Pine Pro', '99.75']]) {
      const selector = await evaluate(`(()=>{const labels=[...document.querySelectorAll('[aria-label="Administrator settings"] label')]; const found=labels.find(l=>l.textContent.startsWith(${JSON.stringify(label)})); const field=found?.querySelector('input'); if(!field)throw new Error('Price field missing');field.id='price-field';return '#price-field';})()`); await input(selector, amount); await evaluate("document.querySelector('#price-field').removeAttribute('id')");
    }
    await input('[aria-label="Propose marketplace pricing"] input[type=text]', 'Reviewed registration and subscription pricing');
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[0]);
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', 'invalid-key'); await click(button('Submit pricing proposal'));
    await until("document.querySelector('[aria-label=\"Propose marketplace pricing\"] [data-form-feedback] [role=alert]')", 'Invalid key explains failure under change');
    assert(await evaluate("[...document.querySelectorAll('body > [role=alert]')].some(e=>e.getBoundingClientRect().top>=0 && e.getBoundingClientRect().top<100 && e.textContent.includes('Change failed:'))"), 'Invalid key notification is at top of screen');
    assert.equal((await api('/api/settings', admins[0].token)).registrationFee, 50, 'Rejected change leaves saved settings untouched');
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[0]);
    await click(button('Submit pricing proposal'));
    await until("document.body.innerText.includes('1 approvals')", 'Initial proposal approval');
    assert.equal((await api('/api/settings', admins[0].token)).registrationFee, 50, 'Proposal alone does not change prices');
    assert(await evaluate(`${button('Final push — apply approved pricing')}.disabled`), 'Final push disabled without quorum');
    for (const [index, width] of [[1, 375], [2, 768]]) {
      await viewport(width); await switchAccount(admins[index].token, '/#/admin/dashboard');
      await until("document.body.innerText.includes('Shared approvals')", 'Reviewer dashboard'); await click(matchingButton('Settings'));
      await until("document.querySelector('[data-pricing-proposal]') !== null", 'Shared proposal visible');
      assert(!(await evaluate(`Boolean(${button('Final push — apply approved pricing')})`)), 'Non-main cannot see final push');
      await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[index]); await click(button('Approve pricing'));
      await until(`document.body.innerText.includes('${index + 1} approvals')`, 'Independent reviewer approval');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Administrator settings\"] input[autocomplete=off]').value"), '', 'Reviewer key cleared');
      await noOverflow('Pricing proposal reviewer ' + width);
    }
    assert.equal((await api('/api/settings', admins[0].token)).registrationFee, 50, 'Three approvals still require main final push');
    await viewport(1440); await switchAccount(admins[0].token, '/#/admin/dashboard');
    await until("document.body.innerText.includes('Shared approvals')", 'Main dashboard'); await click(matchingButton('Settings'));
    await until("document.body.innerText.toLowerCase().includes('ready for main admin’s final push')", 'Main sees approved proposal');
    for (const width of [375, 768, 1440]) { await viewport(width); await noOverflow('Approved pricing at ' + width); }
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[0]); await click(button('Final push — apply approved pricing'));
    await until("document.body.innerText.includes('Approved pricing applied by administrator #1')", 'Main final push saved');
    await until("document.body.innerText.includes('Applied by administrator #1')", 'Applied audit visible');
    await until("document.querySelector('[aria-label=\"Administrator settings\"] input[autocomplete=off]').value === ''", 'Final push finishes and clears its key');
    await input('textarea', 'Browser configured announcement <script>window.__announcementXss = true</script>');
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[0]);
    await click(button('Save Admin Settings'));
    await until("document.body.innerText.includes('Platform settings saved.')", 'Settings saved');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Administrator settings\"] input[autocomplete=off]').value"), '', 'Settings key cleared');
    assert.equal((await api('/api/settings', admins[0].token)).registrationFee, 62.5); const livePrices = await api('/api/settings', admins[0].token); assert.equal(livePrices.semesterFee, 210.25); assert.deepEqual(livePrices.subscriptionPrices, { default: 0, star: 45.5, pro: 99.75 });
    const sharp = require('sharp');
    const photo = await sharp({ create: { width: 1000, height: 900, channels: 3, background: '#1677cf' } }).png().toBuffer();
    // Snap Chromium has a separate /tmp. Put the same real raster bytes into a File
    // within the browser so FileReader exercises the actual upload flow.
    await evaluate(`(()=>{const element=document.querySelector('[aria-label="Administrator settings"] input[type=file]');const bytes=Uint8Array.from(atob(${JSON.stringify(photo.toString('base64'))}),c=>c.charCodeAt(0));const transfer=new DataTransfer();transfer.items.add(new File([bytes],'real-raster.png',{type:'image/png'}));element.files=transfer.files;element.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[0]);
    await click(button('Save profile photograph'));
    await until("document.body.innerText.includes('Your profile photograph has been saved.')", 'Profile saved');
    const avatar = await evaluate("document.querySelector('img[alt=\"Your administrator profile\"]').getAttribute('src')"); assert.match(avatar, /\/uploads\/hostels\/.*\.png$/);
    await command('Page.reload'); await until("document.body.innerText.includes('Shared approvals')", 'Admin reload'); await click(matchingButton('Settings'));
    await until("document.querySelector('img[alt=\"Your administrator profile\"]')?.getAttribute('src') === " + JSON.stringify(avatar), 'Photograph survives reload');
    await viewport(1440); await switchAccount(merchant.token, '/#/digital-market');
    await until("document.querySelector('[aria-label=\"Upgrade your seller plan\"]') !== null", 'Seller dashboard');
    await click("document.querySelector('[aria-label=\"Upgrade your seller plan\"]')");
    await until("document.body.innerText.includes('GH₵45.50 / month') && document.body.innerText.includes('GH₵99.75 / month')", 'Desktop seller uses configured prices');
    assert(await evaluate("document.body.innerText.includes('Semester fee: GHS 210.25')"));
    for (const plan of ['Default', 'Star', 'Pro']) assert(await evaluate(`document.body.innerText.includes(${JSON.stringify('Pine ' + plan)})`));
    await noOverflow('Desktop seller subscriptions');
    await viewport(375);
    for (const [plan, price] of [['Default', '0.00'], ['Star', '45.50'], ['Pro', '99.75']]) {
      await click(button('Pine ' + plan)); await until(`document.body.innerText.includes(${JSON.stringify('GH₵' + price + ' / month')})`, 'Mobile selected plan price');
      await noOverflow('Mobile seller ' + plan);
    }
    await viewport(375); await switchAccount(primary.token, '/#/student/dashboard');
    await until("fetch('/api/notifications').then(r=>r.json()).then(list=>list.some(n=>n.category==='system_announcement'))", 'Buyer announcement notification');
    assert(!(await evaluate("Boolean(document.querySelector('[aria-label=\"PineVela system announcement\"]'))")), 'No floating announcement banner');
    assert.equal(await evaluate('window.__announcementXss'), undefined, 'Announcement is plain text'); await noOverflow('Buyer notification inbox on mobile');
    await api('/api/settings', admins[1].token, { registrationFee: 62.5, commission: 7.5, announcement: '', maintenanceMode: true, settingsKey: settingsKeys[1] });
    await until("document.body.innerText.includes('PineVela is undergoing maintenance')", 'Live maintenance boundary');
    // Any in-flight non-admin polling is intentionally denied with a 503. No successful
    // protected operation or raw-record response is expected during maintenance.
    await switchAccount(admins[1].token, '/#/admin/dashboard');
    await until("document.body.innerText.includes('Shared approvals')", 'Maintenance administrator dashboard');
    await click(matchingButton('Settings'));
    await until("document.querySelector('[aria-label=\"Platform Maintenance Mode\"]')?.checked", 'Lockdown is enabled');
    await click("document.querySelector('[aria-label=\"Platform Maintenance Mode\"]')");
    await until("document.querySelector('form[aria-label=\"Portal settings\"] textarea[required]') !== null", 'Returning-user message is required');
    assert(!(await evaluate("document.querySelector('form[aria-label=\"Portal settings\"]').checkValidity()")), 'Blank message prevents unlocking');
    await input('form[aria-label="Portal settings"] textarea[required]', 'Thank you for your patience. Welcome back to PineVela.');
    await input('[aria-label="Administrator settings"] input[autocomplete="off"]', settingsKeys[1]);
    await click(button('Save Admin Settings'));
    await until("fetch('/api/settings').then(r=>r.json()).then(settings=>!settings.maintenanceMode)", 'Administrator restores service');
    assert(!(await evaluate("Boolean(document.querySelector('.maintenance-return-dialog'))")), 'Administrator never receives a return popup');
    assert.equal(await evaluate("fetch('/api/auth/maintenance-notice').then(r=>r.json()).then(result=>result.notice)"), null);
    await switchAccount(primary.token, '/#/student/dashboard');
    await until("!document.body.innerText.includes('PineVela is undergoing maintenance') && !document.querySelector('[aria-label=\"PineVela system announcement\"]')", 'Service automatically resumes and cleared banner disappears');
    await until("document.querySelector('.maintenance-return-dialog')?.open", 'Return popup appears');
    assert(await evaluate("document.querySelector('.maintenance-return-dialog').matches(':modal')"), 'Notice traps focus above the page');
    assert(await evaluate("document.querySelector('.maintenance-return-dialog').innerText.includes('Thank you for your patience. Welcome back to PineVela.')"));
    await noOverflow('Mobile maintenance popup');
    await command('Page.captureScreenshot', {format:'png'}).then(result=>fs.writeFile('/tmp/pinevela-maintenance-return.png',Buffer.from(result.data,'base64')));
    await click("document.querySelector('[aria-label=\"Close administrator message\"]')");
    await until("!document.querySelector('.maintenance-return-dialog')", 'X dismisses notice');
    await command('Page.reload'); await until("document.querySelector('.theme-toggle')", 'Reload after dismissal');
    assert(!(await evaluate("Boolean(document.querySelector('.maintenance-return-dialog'))")), 'Dismissal survives reload');
    await switchAccount(merchant.token, '/#/digital-market');
    await until("document.querySelector('.maintenance-return-dialog')?.open", 'Seller independently receives notice');
    await command('Page.bringToFront');
    await command('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await until("!document.querySelector('.maintenance-return-dialog')", 'Escape dismisses notice');
    assert.deepEqual(exceptions, [], 'Browser console and runtime errors');
    assert(apiErrors.every(error => error.status === 503 || error.status === 403 && error.url.endsWith('/api/admin/governance/pricing')), 'Only deliberate maintenance and invalid-key denials are allowed');
    console.log('Shared pricing proposal, three separate keyed approvals, main-only final push and applied audit passed at desktop/tablet/mobile widths. Applied registration/three-plan/two-month prices reflected on seller plans; photograph upload/reload, announcement inbox delivery and maintenance/resumption passed. No console/runtime errors; no operational data touched.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
