/** Actual bundled web UI + genuine owned local Auth. No provider/profile
 * responses or authentication cookies are fabricated. A local-only CONNECT
 * proxy maps the emulator's 10.0.2.2 address to host loopback; Chromium trusts
 * only this task's certificate SPKI. All external requests are blocked.
 * No credentials, cookies, handoff codes or provider errors enter output. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const origin = 'https://10.0.2.2:9443', marker = 'pinevela:mobile-handoff-active';
const tlsRoot = '/tmp/pinevela-android-step3/tls';

async function privateJson(file) {
  const stat = await fs.lstat(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && stat.size < 1024 * 1024, 'Private local fixture required');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function main() {
  assert(process.argv.length === 3 && path.isAbsolute(process.argv[2]), 'Pass the private Android server metadata path');
  const serverFile = process.argv[2], server = await privateJson(serverFile), meta = await privateJson(server.metadataPath);
  assert(meta.databaseOwned === true && meta.root.startsWith('/tmp/') && serverFile.startsWith(meta.root + path.sep)
    && server.publicOrigin === origin && server.actualGoTrue === true, 'Only the owned loopback Android server is permitted');
  const credentials = await privateJson(path.join(path.dirname(serverFile), server.credentialsFile));
  assert(credentials.email.endsWith(meta.runId.replaceAll('-', '') + '@pinevela.test') && credentials.role === 'user', 'Only this run dummy primary is permitted');
  const ca = await fs.readFile(tlsRoot + '/ca.crt');
  const publicKey = execFileSync('openssl', ['x509', '-in', tlsRoot + '/server.crt', '-pubkey', '-noout']);
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'DER'], { input: publicKey });
  const spki = crypto.createHash('sha256').update(der).digest('base64');
  function api(route, body, headers = {}) {
    assert(route.startsWith('/api/auth/mobile/'));
    const bytes = Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port: 9443, path: route, method: 'POST', ca,
        headers: { host: '10.0.2.2:9443', 'content-type': 'application/json', 'content-length': bytes.length, ...headers } }, res => {
        const chunks = []; let size = 0;
        res.on('data', data => { size += data.length; if (size > 8192) req.destroy(Error('Bounded local reply exceeded')); else chunks.push(data); });
        res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks).toString()) }); } catch { reject(Error('Local API reply invalid')); } });
      });
      req.setTimeout(10000, () => req.destroy(Error('Local API timeout'))); req.on('error', reject); req.end(bytes);
    });
  }
  const proxy = http.createServer((_req, res) => res.writeHead(403).end());
  const tunnels = new Set();
  proxy.on('connect', (req, socket, head) => {
    if (req.url !== '10.0.2.2:9443') { socket.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    const upstream = net.connect(9443, '127.0.0.1'); tunnels.add(socket); tunnels.add(upstream);
    const close = () => { tunnels.delete(socket); tunnels.delete(upstream); socket.destroy(); upstream.destroy(); };
    socket.on('error', close); upstream.on('error', close);
    socket.on('close', close); upstream.on('close', close);
    upstream.once('connect', () => { socket.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); socket.pipe(upstream); upstream.pipe(socket); });
  });
  proxy.listen(0, '127.0.0.1'); await once(proxy, 'listening');
  const profile = await fs.mkdtemp('/tmp/pinevela-browser-return-');
  const binary = '/snap/chromium/current/usr/lib/chromium-browser/chrome';
  const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-background-networking',
    '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
    `--ignore-certificate-errors-spki-list=${spki}`, `--proxy-server=http://127.0.0.1:${proxy.address().port}`, '--proxy-bypass-list=<-loopback>', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', sessionId, checks = 0, stage = 'browser startup', blockedExternal = 0;
  const pending = new Map(), requests = [], responses = [], exceptions = [];
  const check = (value, label) => { assert(value, label); checks++; };
  const send = (method, params = {}, id = sessionId) => new Promise((resolve, reject) => {
    const number = ++sequence, timer = setTimeout(() => { pending.delete(number); reject(Error(method + ' timeout')); }, 30000);
    pending.set(number, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id: number, method, params, ...(id ? { sessionId: id } : {}) }) + '\0');
  });
  chrome.stderr.on('data', () => {});
  chrome.stdio[4].on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!raw) continue;
      const message = JSON.parse(raw), data = message.params;
      if (message.method === 'Network.requestWillBeSent') {
        const url = new URL(data.request.url);
        requests.push({ path: url.pathname, method: data.request.method, local: url.origin === origin });
      }
      if (message.method === 'Network.responseReceived') {
        const url = new URL(data.response.url);
        responses.push({ path: url.pathname, status: data.response.status, requestId: data.requestId });
      }
      if (message.method === 'Runtime.exceptionThrown') exceptions.push(data.exceptionDetails.text);
      if (message.method === 'Fetch.requestPaused') {
        const url = new URL(data.request.url);
        if (url.origin === origin || !/^https?:$/.test(url.protocol)) void send('Fetch.continueRequest', { requestId: data.requestId }).catch(() => {});
        else { blockedExternal++; void send('Fetch.failRequest', { requestId: data.requestId, errorReason: 'BlockedByClient' }).catch(() => {}); }
      }
      const waiter = pending.get(message.id); if (!waiter) continue;
      pending.delete(message.id); clearTimeout(waiter.timer);
      message.error ? waiter.reject(Error('Browser command rejected')) : waiter.resolve(message.result);
    }
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw Error('Browser evaluation failed');
    return result.result.value;
  };
  async function until(expression, label, timeout = 45000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { try { if (await evaluate(`Boolean(${expression})`)) return; } catch {} await pause(100); }
    throw Error(label + ' did not settle');
  }
  async function navigate(url) {
    const parsed = new URL(url, origin); assert.equal(parsed.origin, origin);
    const result = await send('Page.navigate', { url: parsed.href }); assert(!result.errorText, 'Local TLS page navigation succeeds');
    await until('document.readyState==="complete"', 'Document');
  }
  async function click(text) {
    // Route transitions and native dialog entry can briefly leave a rendered
    // control behind an overlay. Wait for the real hit target rather than
    // bypassing hit testing with a DOM click or assuming a fixed delay suffices.
    let point;
    const end = Date.now() + 5000;
    while (Date.now() < end) {
      point = await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)});if(!button||button.disabled)return null;const r=button.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;return r.width>0&&r.height>0&&document.elementFromPoint(x,y)?.closest('button')===button?{x,y}:null})()`);
      if (point) break;
      await pause(100);
    }
    if (!point) {
      const diagnostic = await evaluate(`(()=>({viewport:{width:innerWidth,height:innerHeight},buttons:[...document.querySelectorAll('button')].filter(e=>e.textContent.trim()===${JSON.stringify(text)}).map(e=>{const r=e.getBoundingClientRect(),top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {disabled:e.disabled,rect:{x:r.x,y:r.y,width:r.width,height:r.height},dialog:e.closest('dialog')?.getAttribute('aria-labelledby')||null,topTag:top?.tagName||null,topDialog:top?.closest('dialog')?.getAttribute('aria-labelledby')||null}}),dialogs:[...document.querySelectorAll('dialog[open]')].map(e=>({labelledby:e.getAttribute('aria-labelledby'),ariaLabel:e.getAttribute('aria-label')}))}))()`);
      await fs.writeFile('/tmp/pinevela-android-step3/browser-return-click-diagnostic.json', JSON.stringify({ stage, ...diagnostic }, null, 2) + '\n', { mode: 0o600 });
      const image = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile('/tmp/pinevela-android-step3/browser-return-click-failure.png', Buffer.from(image.data, 'base64'), { mode: 0o600 });
    }
    assert(point, 'The required button must be visible, enabled and reachable above other overlays');
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
  const fill = (selector, value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Required local form missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  async function login() {
    await until('document.querySelector(\'input[aria-label="Username or Email Address"]\')', 'Login form');
    await fill('input[aria-label="Username or Email Address"]', credentials.email);
    await fill('input[aria-label="Password"]', credentials.password);
    await evaluate('document.querySelector(\'input[aria-label="Password"]\').closest("form").requestSubmit()');
    await until('location.hash.includes("/user/dashboard")||document.querySelector("#mobile-return-title")', 'Verified login');
  }
  const dialog = 'dialog[aria-labelledby="mobile-return-title"][open]';
  try {
    const target = await send('Target.createTarget', { url: 'about:blank' }, undefined);
    sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true }, undefined)).sessionId;
    await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    stage = 'unchanged CSRF boundary';
    for (const route of ['start', 'finish', 'exchange']) {
      const denied = await api('/api/auth/mobile/' + route, {}, { origin: 'https://foreign.invalid', 'sec-fetch-site': 'cross-site' });
      check(denied.status === 403, 'Cross-site ' + route + ' remains rejected before authentication or proof processing');
    }
    stage = 'ordinary website isolation';
    await navigate('/#/login'); await until('document.querySelector(\'input[aria-label="Password"]\')', 'Normal web login');
    await pause(500);
    check(!requests.some(item => item.path.startsWith('/api/auth/mobile/')), 'Ordinary web entry starts no mobile handoff traffic');
    check(!await evaluate(`document.querySelector(${JSON.stringify(dialog)})`), 'Ordinary web login shows no mobile prompt');
    await login();
    check(!requests.some(item => item.path === '/api/auth/mobile/finish'), 'Ordinary verified login never transfers a session');

    stage = 'existing browser session requires fresh sign-in';
    const verifier = crypto.randomBytes(48).toString('base64url'), state = crypto.randomBytes(32).toString('base64url');
    const started = await api('/api/auth/mobile/start', { challenge: crypto.createHash('sha256').update(verifier).digest('base64url'), state, mode: 'login', client: 'android-debug' });
    assert.equal(started.status, 200); await navigate(started.data.browserUrl);
    await until(`document.querySelector(${JSON.stringify(dialog)})&&document.body.textContent.includes('Sign out and sign in again')`, 'Fresh proof gate');
    check(await evaluate(`sessionStorage.getItem(${JSON.stringify(marker)})==='1'`), 'The browser remembers only a boolean pending marker');
    check(!requests.some(item => item.path === '/api/auth/mobile/finish'), 'An existing browser identity is never transferred automatically');
    check(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(dialog)})`), 'The named modal receives initial keyboard focus');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    check(await evaluate(`document.activeElement.closest(${JSON.stringify(dialog)})!==null`), 'Keyboard focus stays within the consent modal');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'The mobile approval fits the viewport');

    stage = 'light and dark modal appearance';
    for (const theme of ['light', 'dark']) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'System theme ' + theme);
      const colors = await evaluate(`(()=>{const section=document.querySelector(${JSON.stringify(dialog + ' section')}),p=section.querySelector('p');return {bg:getComputedStyle(section).backgroundColor,fg:getComputedStyle(p).color};})()`);
      const luminance = raw => { const rgb = raw.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => { n /= 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4; }); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; };
      const a = luminance(colors.bg), b = luminance(colors.fg);
      check((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, theme + ' body text has readable contrast');
      const image = await send('Page.captureScreenshot', { format: 'png' });
      await fs.writeFile(`/tmp/pinevela-android-step3/browser-return-${theme}.png`, Buffer.from(image.data, 'base64'), { mode: 0o600 });
    }
    stage = 'fresh local form login and explicit consent';
    await click('Sign out and sign in again'); await until('!document.querySelector("#mobile-return-title")&&document.querySelector(\'input[aria-label="Password"]\')', 'Fresh login page');
    await login();
    await until(`document.querySelector(${JSON.stringify(dialog)})&&document.body.textContent.includes('Continue in the app')`, 'Fresh approval');
    await pause(1200);
    check(!requests.some(item => item.path === '/api/auth/mobile/finish'), 'Fresh login still requires an explicit approval click');
    check(await evaluate(`document.cookie.split(';').every(item=>!/^\s*pv_(?:sb_|mobile_)/.test(item))`), 'HttpOnly Auth and flow cookies remain unavailable to JavaScript');
    check(await evaluate(`!Object.keys(sessionStorage).some(key=>/verifier|refresh_token|access_token|challenge/i.test(key))&&sessionStorage.getItem(${JSON.stringify(marker)})==='1'`), 'No native proof or credential is persisted in browser session storage');

    stage = 'stay-in-browser action';
    await click('Stay in browser'); await until(`!document.querySelector(${JSON.stringify(dialog)})`, 'Dismissed approval');
    check(await evaluate(`sessionStorage.getItem(${JSON.stringify(marker)})===null`), 'Staying in browser clears the pending marker');
    check((await evaluate('fetch("/api/auth/me").then(r=>r.status)')) === 200, 'Staying in browser retains the existing verified session');
    await evaluate('location.hash="/user/dashboard?mobile=1"');
    await until(`document.querySelector(${JSON.stringify(dialog)})&&document.body.textContent.includes('Continue in the app')`, 'Resumed explicit approval');
    await navigate('/#/user/dashboard');
    await until(`document.querySelector(${JSON.stringify(dialog)})&&document.body.textContent.includes('Continue in the app')`, 'Marker survives full provider-style navigation');
    check(!requests.some(item => item.path === '/api/auth/mobile/finish'), 'Reload and route changes never approve transfer');

    stage = 'explicit browser transfer';
    await click('Continue in the app');
    const end = Date.now() + 15000;
    while (!responses.some(item => item.path === '/api/auth/mobile/finish' && item.status === 200) && Date.now() < end) await pause(100);
    check(responses.some(item => item.path === '/api/auth/mobile/finish' && item.status === 200), 'An actual reachable consent button performs the server transfer');
    check(requests.filter(item => item.path === '/api/auth/mobile/finish').length === 1, 'Exactly one transfer request is sent');
    const response = responses.find(item => item.path === '/api/auth/mobile/finish' && item.status === 200);
    const result = await send('Network.getResponseBody', { requestId: response.requestId });
    const reply = JSON.parse(result.base64Encoded ? Buffer.from(result.body, 'base64').toString() : result.body);
    const returned = new URL(reply.returnUrl);
    check(returned.protocol === 'pinevela-debug:' && returned.host === 'auth' && returned.pathname === '/callback'
      && returned.searchParams.get('state') === state && /^[A-Za-z0-9_-]{43}$/.test(returned.searchParams.get('code') || ''), 'The real web return uses the fixed native code/state contract');
    await until(`sessionStorage.getItem(${JSON.stringify(marker)})===null`, 'Cleared pending marker');
    check((await evaluate('fetch("/api/auth/me").then(r=>r.status)')) === 401, 'Explicit transfer clears the actual browser Auth session');
    check(exceptions.length === 0, 'The actual bundled browser flow throws no runtime exceptions');
    const report = { passed: true, checks, actualBundledFrontend: true, actualGoTrue: true, actualPasswordForms: true,
      syntheticAuthResponses: false, nativePluginTested: false, externalRequestsBlocked: blockedExternal, cloudWrites: 0 };
    await fs.writeFile('/tmp/pinevela-android-step3/browser-return-result.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(report));
  } catch (error) {
    const report = { passed: false, stage, error: error.message, checks, cloudWrites: 0 };
    await fs.writeFile('/tmp/pinevela-android-step3/browser-return-result.json', JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.error(JSON.stringify(report)); process.exitCode = 1;
  } finally {
    for (const item of pending.values()) clearTimeout(item.timer);
    if (chrome.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([once(chrome, 'exit'), pause(2000)]); }
    for (const socket of tunnels) socket.destroy();
    proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve));
    if (chrome.exitCode !== null) await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch(() => { console.error(JSON.stringify({ passed: false, error: 'Owned browser harness could not initialize.' })); process.exitCode = 1; });
