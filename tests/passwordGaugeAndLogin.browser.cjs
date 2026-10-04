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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-governance-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const admins = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Browser founder ${i + 1}`, email: `founder${i + 1}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' }));
  const keys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((a, i) => ({ id: a.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${a.id}:${keys[i]}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: admins, hostels: [], adminGovernance: governance }));
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
    const input = async (selector, value) => { await until(`document.querySelector(${JSON.stringify(selector)})`, 'Input mounted'); await evaluate(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}); const setter=Object.getOwnPropertyDescriptor(${selector.includes('textarea') ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set; setter.call(element,${JSON.stringify(value)});element.dispatchEvent(new Event('input',{bubbles:true}));})()`); };
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

    await viewport(1440); await command('Page.navigate',{url:base+'/#/login'});
    await until("document.querySelector('[aria-label=\"Show next feature\"] img')", 'Login picture renders');
    assert(!(await evaluate("Boolean(document.querySelector('[data-route-skeleton]'))")), 'Login has no skeleton');
    const image = await evaluate("(()=>{const img=document.querySelector('[aria-label=\"Show next feature\"] img');return {opacity:getComputedStyle(img).opacity,loading:img.loading,priority:img.fetchPriority}})()");
    assert.equal(image.opacity,'1'); assert.equal(image.loading,'eager'); assert.equal(image.priority,'high');
    await click(button('Sign Up'));
    assert.equal(await evaluate("document.querySelectorAll('[data-password-gauge]').length"),0, 'Empty passwords have no decorative gauge');
    for(const [password,label,width] of [['a','Weak',25],['abcdefgh','Okay',50],['abcdef12','Good',75],['Abcdef12!','Strong',100]]) {
      await input('input[placeholder="Min. 6 characters"]',password);
      await until(`document.querySelector('[data-password-gauge]')?.innerText.trim() === ${JSON.stringify(label)}`, 'Gauge status');
      assert.equal(await evaluate("document.querySelector('[data-password-gauge] [role=progressbar] > div').style.width"),width+'%');
      assert(!(await evaluate("document.body.innerText.includes('Uppercase letter') || document.body.innerText.includes('Special symbol') || document.body.innerText.includes('Password Strength:')")), 'No checklist');
    }
    await viewport(375); await noOverflow('Mobile signup gauge');
    await input('input[placeholder="Repeat password"]','Abcdef12!');
    assert.equal(await evaluate("document.querySelectorAll('[data-password-gauge]').length"),2,'Matching confirmation gauge');
    await viewport(1440); await switchAccount(admins[0].token, '/#/admin/dashboard');
    await until("document.body.innerText.includes('Quick Admin Actions')", 'Admin dashboard');
    await click(button('Sign Out')); await until("document.body.innerText.includes('Confirm Sign Out')",'Confirmation');
    await click(`[...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='Sign Out').at(-1)`);
    await until("location.hash.includes('/login') && document.querySelector('[aria-label=\"Show next feature\"] img')", 'Logout restores login picture directly');
    assert(!(await evaluate("Boolean(document.querySelector('[data-route-skeleton]'))"))); 
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-label=\"Show next feature\"] img')).opacity"),'1');
    assert.deepEqual(exceptions,[],'No browser errors');
    console.log('Four gauge levels, clean line/status, confirmation gauge, mobile layout, and immediate login picture after logout passed. Login has no skeleton.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
