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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-residence-requests-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const admins = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Browser founder ${i + 1}`, email: `founder${i + 1}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' }));
  const keys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((a, i) => ({ id: a.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${a.id}:${keys[i]}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} };
  const manager = { id: crypto.randomUUID(), role: 'manager', name: 'Isolated workflow manager', email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved', appearanceTheme: 'light' };
  const primary = { id: crypto.randomUUID(), role: 'user', name: 'Isolated resident', email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' };
  const photograph = '/uploads/hostels/workflow-validation.jpg';
  await fs.mkdir(path.join(temp, 'uploads/hostels'), {recursive:true});
  await fs.copyFile(path.join(project,'src/assets/images/hostels_bg_1789053809472.jpg'),path.join(temp,'uploads/hostels/workflow-validation.jpg'));
  const hostel = { id: crypto.randomUUID(), name: 'Isolated residence for workflow validation', image: photograph, imageUrl: photograph, gallery: [photograph], managerId: manager.id, assignedManagerId: manager.id, managerEmail: manager.email, managerName: manager.name, managerPhone: '+233241234567', contact_phone: '+233241234567', contact_phone_country: 'GH', blocksList: [{ id: crypto.randomUUID(), name: 'Existing occupied block', floors: 1, totalRooms: 1 }], totalCapacity: 3, availableSpaces: 3, bedsLeft: 3, isApproved: true, approvalStatus: 'Approved', status: 'Open', isLive: true, location: 'Isolated location', registrationDate: new Date().toISOString() };
  governance.members[0].settingsKeyHash = crypto.createHash('sha256').update(`settings:${admins[0].id}:workflow-settings`).digest('hex');
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, manager, primary], hostels: [hostel], managerVerifications: [{ id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, status: 'approved' }], adminGovernance: governance }));
  const port = await freePort(), debugPort = await freePort(), base = `http://127.0.0.1:${port}`;
  let server, chrome, socket, command; let serverLogs = '', chromeLogs = '';
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PINEVELA_MAIN_ADMIN_ID: admins[0].id, PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
    const evaluate = async expression => { const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true }); if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text); return result.result.value; };
    const until = async (expression, label) => { for (let attempt = 0; attempt < 300; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(100); } throw new Error(`${label}: ${await evaluate('JSON.stringify({hash:location.hash,text:document.body.innerText.slice(-3000)})')}`); };
    const click = async expression => { await until(`${expression}?.getClientRects().length > 0 && !${expression}?.disabled`, 'Visible control'); await evaluate(`${expression}.click()`); };
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


    const visibleButton = text => `[...document.querySelectorAll('button')].find(b => b.getClientRects().length && b.textContent.includes(${JSON.stringify(text)}))`;
    const navigateNotifications = async () => { await click(`(${visibleButton('Notifications & Board')} || ${visibleButton('Alerts')})`); await until("document.body.innerText.includes('Direct Line to Admin')", 'Manager requests panel'); };
    await viewport(375); await switchAccount(manager.token, '/#/manager/dashboard');
    await until("document.querySelector('dialog[aria-label=\"Save your manager secret key\"]')", 'Manager receives one-time key');
    const managerKey = await evaluate("document.querySelector('textarea[aria-label=\"Your manager secret key\"]').value");
    assert(managerKey.length >= 40);
    assert(!await evaluate(`JSON.stringify({...localStorage,...sessionStorage}).includes(${JSON.stringify(managerKey)})`), 'Key never enters browser storage');
    await click("document.querySelector('dialog[aria-label=\"Save your manager secret key\"] input[type=checkbox]')"); await click(button('Continue'));
    await navigateNotifications();
    for (const width of [320,375,768,1440]) {
      await viewport(width); await click(button('Edit residence'));
      await until("document.querySelector('dialog[aria-label=\"Request residence changes\"]')", 'Limited residence editor');
      assert(!await evaluate("document.querySelector('dialog[aria-label=\"Request residence changes\"]').innerText.match(/Amenities|Facilities|Rules & Policies|Room Capacity|Price/)"), 'No unsupported fields');
      await input('dialog[aria-label="Request residence changes"] input[maxlength="160"]', 'Requested residence name');
      await noOverflow('Manager editor at '+width);
      const image = await command('Page.captureScreenshot', {format:'png'}); await fs.writeFile('/tmp/pinevela-residence-editor-'+width+'.png',Buffer.from(image.data,'base64'));
      if(width !== 1440) await click("document.querySelector('button[aria-label=\"Close residence editor\"]')");
    }
    await input('dialog[aria-label="Request residence changes"] input[type="password"]',managerKey);
    await click(button('Send changes to Admin Board')); await until("!document.querySelector('dialog[aria-label=\"Request residence changes\"]')",'Manager request submitted');
    await until("document.body.innerText.includes('Your changes were submitted')",'Submission confirmation');
    assert(await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Edit residence')).disabled`),'30-day UI cooldown');
    await switchAccount(manager.token,'/#/manager/dashboard');await pause(1500);
    assert(!await evaluate("Boolean(document.querySelector('dialog[aria-label=\"Save your manager secret key\"]'))"),'Key is not shown again after reload');
    await switchAccount(admins[0].token,'/#/admin/dashboard');
    await click(visibleButton('Notifications')); await until("document.body.innerText.includes('Manager Requests to Admin Board')",'Admin queue');
    await click(button('View changes'));await until("document.querySelector('dialog[aria-label=\"Review residence changes\"]')",'Admin diff');
    assert(await evaluate("document.querySelector('dialog[aria-label=\"Review residence changes\"]').innerText.toLowerCase().includes('before') && document.querySelector('dialog[aria-label=\"Review residence changes\"]').innerText.includes('Requested residence name')"),'Before/after values visible');
    await input('dialog[aria-label="Review residence changes"] input[type="password"]',keys[0]);await click(button('Confirm approval'));
    await until("!document.querySelector('dialog[aria-label=\"Review residence changes\"]')",'Approval succeeds');
    await switchAccount(manager.token,'/#/manager/dashboard');await until("document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]')",'Approved popup delivered');
    assert(await evaluate("document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]').innerText.includes('approved')"));
    await click("document.querySelector('button[aria-label=\"Close admin message\"]')");
    await switchAccount(manager.token,'/#/manager/dashboard');await pause(1500);assert(!await evaluate("Boolean(document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]'))"),'Popup acknowledged across reload');
    await navigateNotifications();assert(await evaluate("document.body.innerText.includes('Residence update approved')"),'Notification persists after popup');
    await click(button('Lost your secret key? Petition for a reset'));
    await input('dialog[aria-label="Petition for a manager key reset"] textarea','Saved key was lost');await click(button('Send petition'));await until("!document.querySelector('dialog[aria-label=\"Petition for a manager key reset\"]')",'Petition sent');
    await switchAccount(admins[0].token,'/#/admin/dashboard');await click(visibleButton('Notifications'));await until("document.body.innerText.includes('Saved key was lost')",'Petition appears to admin');
    await click(button('Review key reset'));await input('dialog[aria-label="Reset manager secret key"] input[type="password"]','workflow-settings');await click(button('Confirm key reset'));await until("!document.querySelector('dialog[aria-label=\"Reset manager secret key\"]')",'Reset approved with settings key');
    await switchAccount(manager.token,'/#/manager/dashboard');await until("document.querySelector('dialog[aria-label=\"Save your manager secret key\"]')",'Replacement key shown');
    const replacement=await evaluate("document.querySelector('textarea[aria-label=\"Your manager secret key\"]').value");assert.notEqual(replacement,managerKey);
    await click("document.querySelector('dialog[aria-label=\"Save your manager secret key\"] input[type=checkbox]')");await click(button('Continue'));
    if(await evaluate("Boolean(document.querySelector('button[aria-label=\"Close admin message\"]'))"))await click("document.querySelector('button[aria-label=\"Close admin message\"]')");
    await click("document.querySelector('button[aria-label=\"Dark mode\"]')");
    await until("document.querySelector('dialog[aria-label=\"Authorize manager action\"]')",'Theme persistence requires manager key');
    await input('dialog[aria-label="Authorize manager action"] input[type="password"]',replacement); await click(button('Confirm change'));
    await until("!document.querySelector('dialog[aria-label=\"Authorize manager action\"]')",'Manager key challenge retries action');
    assert.equal((await api('/api/auth/appearance',manager.token)).theme,'dark');
    const darkImage=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/pinevela-manager-request-dark.png',Buffer.from(darkImage.data,'base64'));
    const failed=await fetch(base+`/api/hostels/${hostel.id}/generate-room-keys`,{method:'POST',headers:{Authorization:`Bearer ${manager.token}`,'Content-Type':'application/json','X-PineVela-Manager-Key':managerKey},body:'{}'});assert.equal(failed.status,403,'Reset invalidates old key');
    await switchAccount(primary.token,'/#/user/dashboard');
    await until(`${button("Got It, Let's Go!")} || ${button('Residences')}`, 'User home initialized');
    if (await evaluate(`Boolean(${button("Got It, Let's Go!")})`)) await click(button("Got It, Let's Go!"));
    await click(button('Residences'));await until("document.body.innerText.includes('Requested residence name')",'User residence listing');
    assert(!await evaluate("document.body.innerText.match(/3 Spaces|3 BEDS LEFT/)"),'Public card hides capacity');
    await click(visibleButton('View Details'));await until("document.body.innerText.toLowerCase().includes('property residence manager')",'Public residence details');
    assert(!await evaluate(`document.body.innerText.includes(${JSON.stringify(hostel.id)})||document.body.innerText.match(/Open Bedspaces|Total Capacity|Bedspaces Open/)`),'Public modal hides ID and capacity');
    const persisted=JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8'));assert.equal(persisted.hostels[0].name,'Requested residence name');assert(persisted.notifications.some(n=>n.title==='Residence update approved'));assert(!JSON.stringify(persisted).includes(replacement));
    assert.deepEqual(exceptions,[]);console.log('Passed responsive manager editor, one-time keys, admin diff/approval, persistent notification and popup, key petition/reset, and public residence privacy.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
