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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-hostel-contact-browser-'));
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

    const uploaded=await api('/api/storage/upload-hostel-image',admins[0].token,{fileType:'image/jpeg',fileData:(await fs.readFile(path.join(project,'src/assets/images/hostels_bg_1789053809472.jpg'))).toString('base64')});
    assert(uploaded.imageUrl,'Real photograph uploaded through actual API');
    const oldDraft={name:'Isolated saved residence',contactEmail:'property@example.test',contactPhone:'+44 20 7946 0018',facilities:['Historical facility'],customRules:['Historical policy'],curfew:'Historical curfew',imageUrl:uploaded.imageUrl,gallery:[uploaded.imageUrl]};
    for(const width of [320,375,768,1440]) {
      await viewport(width);await switchAccount(admins[0].token,'/#/admin/dashboard');await until("document.body.innerText.includes('Register New Residence')",'Registration navigation');
      await evaluate(`localStorage.setItem('pinevela_hostel_registration_draft_v1',${JSON.stringify(JSON.stringify(oldDraft))})`);
      await click(matchingButton('Register New Residence'));await until("document.querySelector('[role=progressbar][aria-label=\"Residence registration completion\"]')",'Four-phase residence onboarding');
      assert.equal(await evaluate("document.querySelector('ol[aria-label=\"Residence registration steps\"]').children.length"),4);
      assert(await evaluate("document.querySelector('[aria-label^=\"Phone country:\"]').textContent.includes('GB +44')"),'Old international number restores matching country');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Primary contact phone number\"]').value"),'2079460018');
      await click("document.querySelector('[aria-label^=\"Phone country:\"]')");
      const names=await evaluate("[...document.querySelectorAll('ul[aria-label=\"Phone countries in alphabetical order\"] li button > span:first-child')].map(e=>e.textContent)");
      assert(names.length>200);assert.deepEqual(names,names.slice().sort((a,b)=>a.localeCompare(b,'en')));
      await input('[aria-label="Search phone countries"]','+233');await until("document.querySelectorAll('ul[aria-label=\"Phone countries in alphabetical order\"] li').length===1",'Calling-code search');
      await click(matchingButton('Ghana (GH)'));await input('[aria-label="Primary contact phone number"]','letters');
      assert.equal(await evaluate("document.querySelector('[aria-label=\"Primary contact phone number\"]').value"),'2079460018','Letters cannot enter the phone field');
      await input('[aria-label="Primary contact phone number"]','123');await click(button('Continue to Map Pin'));
      assert(await evaluate("document.body.textContent.includes('Step 1: Basic Information')"),'Invalid number blocks progression');
      await input('[aria-label="Primary contact phone number"]','0302123456');await click(button('Continue to Map Pin'));
      await until("document.body.textContent.includes('Step 2:')",'Valid landline proceeds');
      await click(button('Continue to Image Upload'));await until("document.body.textContent.includes('Step 3:')",'Map to photographs');
      await click(button('Continue to Capacity'));await until("document.body.textContent.includes('Step 4:')",'Photographs to final capacity phase');
      assert(!await evaluate("document.body.textContent.includes('Facilities & Amenities')||document.body.textContent.includes('Rules & Policies')||document.body.textContent.includes('Historical facility')||document.body.textContent.includes('Historical policy')"),'Retired sections absent across onboarding');
      assert.equal(await evaluate("[...document.querySelectorAll('button')].filter(b=>b.getClientRects().length&&b.textContent.includes('Continue to')).length"),0,'Fourth phase is final');
      const draft=JSON.parse(await evaluate("localStorage.getItem('pinevela_hostel_registration_draft_v1')"));
      for(const key of ['facilities','customRules','curfew','rules'])assert(!(key in draft),'Retired saved-draft fields are dropped: '+key);
      await noOverflow(width+'px phone and four-step registration');
      const image=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile('/tmp/pinevela-hostel-registration-'+width+'.png',Buffer.from(image.data,'base64'));
      console.log('Passed sorted/searchable country codes, number validation, restored drafts, and four steps:',width);
    }
    await click(matchingButton('Register Hostel'));await until("!document.querySelector('[role=progressbar][aria-label=\"Residence registration completion\"]')",'Four-phase form submits successfully');
    const persisted=JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8'));
    const property=persisted.hostels.find(h=>h.name===oldDraft.name);assert(property,'Actual submitted property persists');
    assert.equal(property.contact_phone,'+233302123456');assert.equal(property.contact_phone_country,'GH');
    for(const key of ['facilities','amenities','rules','curfew','customRules'])assert(!(key in property),'No retired field is persisted: '+key);
    assert.deepEqual(exceptions,[]);assert.deepEqual(apiErrors,[]);console.log('Passed actual final submission and canonical contact persistence.');
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} } socket?.close();
    if (server && server.exitCode === null) { const stopped = once(server, 'exit').catch(() => {}); try { process.kill(-server.pid, 'SIGTERM'); } catch {} await Promise.race([stopped, pause(3000)]); }
    if (chrome && chrome.exitCode === null) { const stopped = once(chrome, 'exit').catch(() => {}); try { chrome.kill('SIGTERM'); } catch {} await Promise.race([stopped, pause(1500)]); }
    await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
