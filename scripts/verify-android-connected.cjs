/** Installed transportTest APK + genuine owned local Auth verification.
 * Native email forms, optional captured-SMTP OTP, PKCE and session handling are
 * real. The browser stage uses Node HTTPS with the task CA, not Android Chrome
 * forms, Google, or production CAPTCHA.
 * No cookies, credentials, handoff URI or provider errors enter output. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const origin = 'https://10.0.2.2:9443', app = 'app.pinevela.mobile.transporttest';
const tls = '/tmp/pinevela-android-step3/tls';

async function privateJson(file) {
  const stat = await fs.lstat(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && stat.size < 1024 * 1024, 'Private owned fixture required');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function main() {
  assert(process.argv.length === 3 && path.isAbsolute(process.argv[2]), 'Pass the private Android server descriptor');
  const serverFile = process.argv[2], server = await privateJson(serverFile), meta = await privateJson(server.metadataPath);
  assert(meta.databaseOwned === true && meta.root.startsWith('/tmp/') && serverFile.startsWith(meta.root + path.sep)
    && server.publicOrigin === origin && server.actualGoTrue === true, 'Only the owned loopback Android stack is permitted');
  for (const file of [server.credentialsFile, server.otherCredentialsFile]) assert(/^primary-android-[a-z-]+\.json$/.test(file), 'Owned fixture filename required');
  const fixture = await privateJson(path.join(path.dirname(serverFile), server.credentialsFile));
  const other = await privateJson(path.join(path.dirname(serverFile), server.otherCredentialsFile));
  assert(fixture.email.endsWith(meta.runId.replaceAll('-', '') + '@pinevela.test') && fixture.role === 'user'
    && other.email.endsWith(meta.runId.replaceAll('-', '') + '@pinevela.test') && other.contextId !== fixture.contextId, 'Only run-scoped dummy identities are permitted');
  for (const identity of [fixture, other]) assert(typeof identity.contextId === 'string'
    && /^[A-Fa-f0-9-]{36}$/.test(identity.contextId), 'Owned fixture has a verified account identifier');
  const ca = await fs.readFile(tls + '/ca.crt'), usedTickets = new Set();
  const mail = new URL(meta.mailUrl);
  assert(mail.protocol === 'http:' && mail.hostname === '127.0.0.1' && /^\d+$/.test(mail.port)
    && !mail.username && !mail.password && mail.pathname === '/' && !mail.search && !mail.hash, 'Captured SMTP stays on the owned loopback stack');
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const port = Number(process.env.PINEVELA_CONNECTED_PORT || 9232);
  assert(/^emulator-\d+$/.test(serial) && port >= 1024 && port <= 65535, 'Use the owned Android emulator');
  const adbPath = path.join(process.env.ANDROID_HOME || '/home/wyse/Android/Sdk', 'platform-tools/adb');
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 30000, maxBuffer: 12 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = path.resolve(process.env.PINEVELA_ANDROID_EVIDENCE || 'docs/verification/android-step3-2026-10-29/connected');
  assert(output.startsWith(path.resolve('docs/verification') + path.sep) || output.startsWith('/tmp/'), 'Evidence stays in the project verification directory or /tmp');
  await fs.mkdir(output, { recursive: true });
  let cdp, stage = 'installed local test build', checks = 0, callbacks = 0, actualBrowserLaunches = 0, installedApkSha256;
  const passed = [], exceptions = [];
  const resumeSignup = process.env.PINEVELA_RESUME_NATIVE_SIGNUP === '1';
  let interruptedRun;
  assert(!resumeSignup || process.env.PINEVELA_TEST_NATIVE_SIGNUP === '1', 'An explicit native signup continuation requires the real OTP scenario');
  const loginReady = `document.querySelector('.login-credentials-form input[aria-label="Email address"]')&&document.querySelector('.login-credentials-form button[type="submit"]:not([disabled])')`;
  const check = (value, label) => { assert(value, label); checks++; };
  const scenario = async (label, work) => { stage = label; await work(); passed.push(label); console.log('PASS ' + label); };
  function browser() {
    const cookies = new Map();
    return async (route, body) => {
      assert(route.startsWith('/api/auth/') && !/[\\\r\n]/.test(route), 'Only local authentication requests are permitted');
      const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
      return new Promise((resolve, reject) => {
        const req = https.request({ hostname: '127.0.0.1', port: 9443, path: route, method: bytes ? 'POST' : 'GET', ca,
          headers: { host: '10.0.2.2:9443', origin, 'X-PineVela-Session': 'cookie',
            ...(cookies.size ? { Cookie: [...cookies].map(([key, value]) => key + '=' + value).join('; ') } : {}),
            ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}) } }, response => {
          for (const line of response.headers['set-cookie'] || []) {
            const match = /^(pv_(?:sb_access|sb_refresh|mobile_flow))=([^;]*)/.exec(line); if (!match) continue;
            assert(/;\s*Secure(?:;|$)/i.test(line) && /;\s*HttpOnly(?:;|$)/i.test(line), 'Local browser cookies retain production security flags');
            if (!match[2] || /;\s*Max-Age=0(?:;|$)/i.test(line)) cookies.delete(match[1]); else cookies.set(match[1], match[2]);
          }
          const chunks = []; let size = 0;
          response.on('data', chunk => { size += chunk.length; if (size > 1024 * 1024) req.destroy(Error('Bounded local reply exceeded')); else chunks.push(chunk); });
          response.on('end', () => {
            let data; try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
            resolve({ status: response.statusCode, data });
          });
          response.on('error', () => reject(Error('Local browser response interrupted')));
        });
        req.setTimeout(30000, () => req.destroy(Error('Local browser request timeout'))); req.on('error', () => reject(Error('Local TLS browser request failed'))); req.end(bytes);
      });
    };
  }
  async function attach() {
    if (cdp) cdp.close();
    const end = Date.now() + 45000; let targets;
    while (Date.now() < end) {
      try {
        const pid = adb(['shell', 'pidof', app]).toString().trim().split(/\s+/)[0]; assert(/^\d+$/.test(pid));
        adb(['forward', 'tcp:' + port, 'localabstract:webview_devtools_remote_' + pid]);
        targets = await fetch('http://127.0.0.1:' + port + '/json/list').then(reply => reply.json());
        if (targets.some(item => item.type === 'page' && item.url.startsWith('https://localhost'))) break;
      } catch {} await pause(250);
    }
    const target = targets?.find(item => item.type === 'page' && item.url.startsWith('https://localhost'));
    assert(target, 'The installed test WebView starts locally');
    const ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1'));
    await Promise.race([once(ws, 'open'), pause(10000).then(() => { throw Error('WebView debugger did not open'); })]);
    const pending = new Map(); let sequence = 0;
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push('Uncaught WebView exception');
      const waiter = pending.get(message.id); if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timer);
      message.error ? waiter.reject(Error('WebView command rejected')) : waiter.resolve(message.result);
    });
    cdp = { send: (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('WebView command timeout')); }, 45000);
      pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
    }), close: () => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('WebView closed')); } pending.clear(); ws.close(); } };
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await until(`typeof Capacitor!=='undefined'&&Capacitor.Plugins?.PineVelaTransport&&document.documentElement.dataset.theme`, 'Native runtime');
  }
  async function evaluate(expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'WebView evaluation succeeds'); return result.result.value;
  }
  async function until(expression, label, timeout = 45000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { try { if (await evaluate(`Promise.resolve(${expression}).then(Boolean)`)) return; } catch {} await pause(150); }
    throw Error(label + ' did not settle');
  }
  async function screenshot(name) { await pause(1000); await fs.writeFile(path.join(output, name + '.png'), adb(['exec-out', 'screencap', '-p'])); }
  async function meMatches() {
    return evaluate(`fetch('/api/auth/me').then(async r=>{if(r.status!==200)return false;const u=await r.json();return u.id===${JSON.stringify(fixture.contextId)}&&u.email===${JSON.stringify(fixture.email)}&&u.role==='user'})`);
  }
  async function openLoginCard() {
    await until(`document.querySelector('[data-native-welcome-login]')||document.querySelector('.login-credentials-form')||document.querySelector('[data-dashboard-view]')`, 'Native entry route', 90000);
    if (await evaluate(`!!document.querySelector('[data-native-welcome-login]')`)) await evaluate(`document.querySelector('[data-native-welcome-login]').click()`);
  }
  async function restore() { adb(['shell', 'am', 'force-stop', app]); adb(['shell', 'am', 'start', '-n', app + '/app.pinevela.mobile.MainActivity']); await attach(); await openLoginCard(); }
  async function logoutUI() {
    await until(`document.querySelector('[title="Sign Out"]')`, 'Dashboard sign-out control');
    await evaluate(`document.querySelector('[aria-label="Welcome to PineVela"] button[aria-label="Close dialog"]')?.click();document.querySelector('[title="Sign Out"]').click()`);
    await until(`document.querySelector('[data-signout-action="confirm"]')`, 'Sign-out confirmation');
    await evaluate(`document.querySelector('[data-signout-action="confirm"]').click()`);
    await openLoginCard();
    await until(loginReady, 'Native signed-out login form');
    check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'Actual backend denies the logged-out native session');
  }
  async function fill(selector, value) {
    await evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});if(!field)throw Error('Required local form missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,${JSON.stringify(value)});field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  }
  async function capturedOtp(identity) {
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      const listing = await fetch(new URL('/api/v1/messages', mail), { redirect: 'error', signal: AbortSignal.timeout(5000) }).then(reply => reply.json());
      for (const message of Array.isArray(listing?.messages) ? listing.messages : []) {
        if (!Array.isArray(message.To) || !message.To.some(to => String(to.Address || '').toLowerCase() === identity.email)
          || !/^[A-Za-z0-9-]+$/.test(message.ID || '') || !Number.isFinite(Date.parse(message.Created)) || Date.parse(message.Created) < identity.startedAt - 1000) continue;
        const full = await fetch(new URL('/api/v1/message/' + encodeURIComponent(message.ID), mail), { redirect: 'error', signal: AbortSignal.timeout(5000) }).then(reply => reply.json());
        const body = String(full?.Text || '') + '\n' + String(full?.HTML || '');
        assert(body.length < 1024 * 1024, 'Captured local email stays bounded');
        // This exact literal belongs only to the genuine local GoTrue test
        // template. Never infer a code from unrelated numbers or a DB hash.
        const token = /Your PineVela local test verification code is ([0-9]{6,10})(?![0-9])/.exec(body)?.[1];
        if (token) return token;
      }
      await pause(250);
    }
    throw Error('Actual captured SMTP verification code did not arrive');
  }
  async function bootstrapUrl(since) {
    for (let count = 0; count < 50; count++) {
      const activity = adb(['shell', 'dumpsys', 'activity', 'activities']).toString();
      const candidates = activity.match(/https:\/\/10\.0\.2\.2:9443\/api\/auth\/mobile\/browser\?ticket=[A-Za-z0-9_-]{43}/g) || [];
      for (const value of candidates) if (!usedTickets.has(value)) { usedTickets.add(value); actualBrowserLaunches++; return new URL(value); }
      // Optional private capture supplied by the owned local TLS test proxy.
      const capture = path.join(path.dirname(serverFile), 'android-native-browser.json');
      try {
        const stat = await fs.lstat(capture), value = await privateJson(capture);
        const url = new URL(value.browserUrl);
        if (stat.mtimeMs >= since - 1000 && url.origin === origin && url.pathname === '/api/auth/mobile/browser'
          && /^\?ticket=[A-Za-z0-9_-]{43}$/.test(url.search) && !usedTickets.has(url.href)) {
          usedTickets.add(url.href); actualBrowserLaunches++; return url;
        }
      } catch {} await pause(150);
    }
    throw Error('Native browser bootstrap was not observable in the owned fixture');
  }
  async function prepareReturn(identity = fixture) {
    // Ignore old browser tasks when re-running a failed check on the same AVD.
    const prior = adb(['shell', 'dumpsys', 'activity', 'activities']).toString();
    for (const value of prior.match(/https:\/\/10\.0\.2\.2:9443\/api\/auth\/mobile\/browser\?ticket=[A-Za-z0-9_-]{43}/g) || []) usedTickets.add(value);
    const since = Date.now();
    const nativeStarted = await evaluate(`Capacitor.Plugins.PineVelaTransport.beginAuth({mode:'login'}).then(r=>({ok:r.pending===true}),error=>({ok:false,code:['AUTH_HANDOFF_FAILED','TRANSPORT_ERROR','BROWSER_UNAVAILABLE','INVALID_REQUEST','BUSY'].includes(error?.code)?error.code:'UNCLASSIFIED'}))`);
    check(nativeStarted.ok, 'Native start opens a browser' + (nativeStarted.code ? ' (' + nativeStarted.code + ')' : ''));
    const url = await bootstrapUrl(since), request = browser();
    check((await request(url.pathname + url.search)).status === 303, 'Real native PKCE bootstrap binds a fresh browser');
    const login = await request('/api/auth/login', { email: identity.email, password: identity.password });
    check(login.status === 200 && login.data?.id === identity.contextId, 'Actual local provider verifies the intended dummy account');
    const status = await request('/api/auth/mobile/status');
    check(status.status === 200 && status.data?.fresh === true, 'Server records fresh authentication within this native flow');
    const finished = await request('/api/auth/mobile/finish', {});
    check(finished.status === 200 && typeof finished.data?.returnUrl === 'string', 'Explicit browser approval produces a real one-use return');
    const returned = new URL(finished.data.returnUrl);
    check(returned.protocol === 'pinevela-debug:' && returned.hostname === 'auth' && returned.pathname === '/callback'
      && /^[A-Za-z0-9_-]{43}$/.test(returned.searchParams.get('code') || '')
      && /^[A-Za-z0-9_-]{43}$/.test(returned.searchParams.get('state') || '') && [...returned.searchParams.keys()].length === 2, 'Return has only the fixed opaque code and state');
    check((await request('/api/auth/me')).status === 401, 'Browser session is cleared after approved transfer');
    return returned.href;
  }
  function deliver(uri) {
    // adb shell joins its arguments for the device shell. The validated URI has
    // only fixed punctuation and base64url data; quote its & separator remotely.
    assert(/^pinevela-debug:\/\/auth\/callback\?code=[A-Za-z0-9_-]{43}&state=[A-Za-z0-9_-]{43}$/.test(uri), 'Only the fixed dummy callback can launch the app');
    adb(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-c', 'android.intent.category.BROWSABLE', '-p', app, '-d', "'" + uri + "'"]); callbacks++;
  }
  try {
    const packageInfo = adb(['shell', 'dumpsys', 'package', app]).toString();
    check(packageInfo.includes('versionName=1.0-transport-test'), 'The isolated transportTest build is installed');
    const apkPath = adb(['shell', 'pm', 'path', app]).toString().trim();
    check(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(apkPath), 'Installed package has a single owned base APK');
    installedApkSha256 = adb(['shell', 'sha256sum', apkPath.slice('package:'.length)]).toString().match(/^[a-f0-9]{64}/)?.[0];
    check(Boolean(installedApkSha256), 'Installed APK checksum is available');
    const expectedApk = await fs.readFile('android/app/build/outputs/apk/transportTest/app-transportTest.apk');
    check(crypto.createHash('sha256').update(expectedApk).digest('hex') === installedApkSha256, 'Installed package matches the current local test APK exactly');
    if (resumeSignup) {
      const file = path.join(output, 'connected-result.json');
      interruptedRun = JSON.parse(await fs.readFile(file, 'utf8'));
      const requiredScenarios = [
        'Bundled native login uses a real private API transport',
        'Installed native PKCE handoff restores the exact real account',
        'Encrypted native session survives a stopped application',
        'Native boundaries reject forged requests and private storage exposure',
        'Cold browser return redeems the encrypted pending native flow',
        'Native logout revokes access and remains signed out after restart',
        'Existing native email form signs in without opening a browser',
        'A stale browser return cannot replace a newer native email identity',
      ];
      assert(interruptedRun.passed === false && interruptedRun.stage === 'Native signup verifies the genuine emailed OTP in themed square boxes'
        && interruptedRun.reason === 'Genuine native email verification screen did not settle'
        && interruptedRun.installedApkSha256 === installedApkSha256 && interruptedRun.cloudWrites === 0
        && Number.isInteger(interruptedRun.checks) && interruptedRun.checks >= 60
        && JSON.stringify(interruptedRun.scenarios) === JSON.stringify(requiredScenarios), 'Only the same APK and explicitly reviewed pre-OTP local database interruption can resume');
      await fs.copyFile(file, path.join(output, 'local-db-interruption.json'));
      checks += interruptedRun.checks;
      passed.push(...interruptedRun.scenarios);
      console.log('RESUME same owned OTP fixture after local database interruption; prior eight scenarios retained explicitly');
    }
    await restore();
    if (!resumeSignup) {
    await scenario('Bundled native login uses a real private API transport', async () => {
      check(await evaluate(`Capacitor.getPlatform()==='android'&&Capacitor.isNativePlatform()`), 'Real Android bridge is active');
      // A just-booted software-emulated device can still be compiling its first
      // WebView. Bound that initial readiness wait separately from app actions;
      // this harness allowance is not a cold-start performance measurement.
      await until(`document.querySelector('.login-credentials-form')||document.querySelector('[data-dashboard-view]')`, 'Initial bundled application route', 90000);
      const initial = await evaluate(`fetch('/api/auth/me').then(async r=>({status:r.status,owned:r.status===200?(await r.json()).id===${JSON.stringify(fixture.contextId)}:false}),error=>({status:0,code:['TRANSPORT_ERROR','CANCELLED','INVALID_REQUEST','BUSY'].includes(error?.code)?error.code:'UNCLASSIFIED'}))`);
      check(initial.status !== 0, 'Initial native authentication request completes' + (initial.code ? ' (' + initial.code + ')' : ''));
      check(initial.status === 401 || initial.status === 200 && initial.owned, 'Existing test credentials belong only to this owned fixture');
      if (initial.status === 200) { check(await evaluate(`fetch('/api/auth/logout',{method:'POST'}).then(r=>r.ok)`), 'Existing dummy test session signs out'); await restore(); }
      await until(loginReady, 'Unsigned native login form');
      check(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Phone layout has no horizontal overflow');
      check(await evaluate(`!!document.querySelector('.login-google-button')&&!document.querySelector('#native-signin-title')`), 'Existing in-app login card contains its Google action');
      await screenshot('native-login-card');
      await evaluate(`document.querySelectorAll('.login-mode-toggle button')[1].click()`);
      await until(`document.querySelector('.login-signup-form input[aria-label="Email Address"]')`, 'Native signup form');
      check(await evaluate(`!!document.querySelector('.login-signup-form input[type="checkbox"]')`), 'In-app signup retains mandatory Terms acceptance');
      const density = await evaluate(`(()=>{const form=document.querySelector('.login-signup-form'),card=form.closest('.login-auth-card'),inputs=[...form.querySelectorAll('input:not([type="checkbox"])')];return {inputHeights:inputs.map(input=>input.getBoundingClientRect().height),inputFontSizes:inputs.map(input=>parseFloat(getComputedStyle(input).fontSize)),formHeight:form.getBoundingClientRect().height,cardHeight:card.getBoundingClientRect().height,viewport:innerHeight,createActionBottom:form.querySelector('button[type="submit"]').getBoundingClientRect().bottom,googleActionBottom:document.querySelector('.native-google-icon-action')?.getBoundingClientRect().bottom,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
      check(density.inputHeights.length === 4 && density.inputHeights.every(height => height >= 43 && height <= 48), 'Mobile signup uses four compact accessible text fields');
      check(density.inputFontSizes.every(size => size >= 16), 'Compact signup fields retain readable sixteen pixel text');
      check(!density.overflow && density.formHeight < density.viewport * .8, 'Compact signup leaves room for surrounding card content without horizontal overflow');
      check(await evaluate(`(()=>{const button=document.querySelector('.native-google-icon-action');if(!button)return false;const box=button.getBoundingClientRect(),style=getComputedStyle(button);return box.width>=44&&box.width<=48&&box.height>=44&&box.height<=48&&style.backgroundColor==='rgb(255, 255, 255)'&&button.textContent.trim()==='Sign up with Google'&&button.disabled})()`), 'Native signup has a small white Google icon button labelled accessibly and gated by Terms');
      await fs.writeFile(path.join(output, 'signup-density.json'), JSON.stringify(density, null, 2) + '\n');
      await screenshot('native-signup-card');
      check(await evaluate(`document.querySelectorAll('.login-mode-toggle button').length===2&&document.querySelectorAll('.login-mode-toggle button')[1].getAttribute('aria-pressed')==='true'`), 'Native signup retains the sliding Login and Sign Up selector');
      await evaluate(`document.querySelectorAll('.login-mode-toggle button')[0].click()`);
      await until(loginReady, 'Native login tab');
    });
    console.log('WAIT existing authentication rate window before browser scenarios');
    await pause(65000);
    await scenario('Installed native PKCE handoff restores the exact real account', async () => {
      const returned = await prepareReturn(); deliver(returned);
      await until(`fetch('/api/auth/me').then(async r=>r.status===200&&(await r.json()).id===${JSON.stringify(fixture.contextId)})`, 'Native warm session');
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Authenticated native dashboard');
      check(await meMatches(), 'Native jar restores only the verified actual account'); await screenshot('authenticated-dashboard');
      deliver(returned); await pause(800); check(await meMatches(), 'A repeated callback preserves the current identity');
    });
    await scenario('Encrypted native session survives a stopped application', async () => {
      await restore(); check(await meMatches(), 'Keystore session restores after force-stop');
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Restored native account dashboard');
      check(await evaluate(`!document.querySelector('.login-credentials-form')`), 'A restored native account opens its dashboard instead of staying on login');
    });
    await scenario('Native boundaries reject forged requests and private storage exposure', async () => {
      const denied = await evaluate(`Promise.all([
        {path:'https://example.invalid/api/auth/me'}, {path:'/api/../auth/me'}, {path:'/api/auth/mobile/exchange'},
        {path:'/api/auth/me',headers:{Cookie:'spoofed'}}, {path:'/api/auth/me',headers:{Authorization:'Bearer spoofed'}}
      ].map((test,index)=>Capacitor.Plugins.PineVelaTransport.request({method:'GET',requestId:'boundary-'+index,...test}).then(()=>false,e=>e.code==='INVALID_REQUEST')))`);
      check(denied.every(Boolean), 'Direct bridge rejects external/traversed/reserved paths and credential headers');
      const contextStatus = await evaluate(`fetch('/api/auth/context',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contextId:${JSON.stringify(other.contextId)}})}).then(r=>r.status)`);
      check(contextStatus === 403, 'Actual authenticated API rejects another account context');
      check(await evaluate(`fetch('/api/auth/me').then(r=>!r.headers.has('set-cookie')&&!r.headers.has('cookie'))`), 'JavaScript cannot read native response cookies');
      check(await evaluate(String.raw`!/(?:^|;\s*)pv_(?:sb_|mobile_)/.test(document.cookie)&&![localStorage,sessionStorage].some(s=>Object.keys(s).some(k=>/access_token|refresh_token|verifier/i.test(k)||/eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/.test(s.getItem(k)||'')))`), 'WebView cookies and storage contain no native credential or PKCE verifier');
      check(await evaluate(`fetch('/_capacitor_http_interceptor_?u=https%3A%2F%2Fexample.invalid').then(r=>r.status)` ) === 403, 'Built-in proxy route is blocked in the actual WebView');
      check(await meMatches(), 'Denied probes do not change the native identity');
    });
    await scenario('Cold browser return redeems the encrypted pending native flow', async () => {
      const returned = await prepareReturn(); adb(['shell', 'am', 'force-stop', app]); deliver(returned); await attach();
      await until(`fetch('/api/auth/me').then(async r=>r.status===200&&(await r.json()).id===${JSON.stringify(fixture.contextId)})`, 'Native cold callback');
      check(await meMatches(), 'Cold-launch callback restores the actual verified account');
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===false)`), 'Cold pending flow is consumed');
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Cold-return native dashboard');
    });
    await scenario('Native logout revokes access and remains signed out after restart', async () => {
      await logoutUI();
      await restore(); check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'Restart cannot restore revoked credentials');
    });
    console.log('WAIT existing authentication rate window before direct native credentials');
    await pause(65000);
    await scenario('Existing native email form signs in without opening a browser', async () => {
      await until(loginReady, 'Native email login form');
      const capture = path.join(path.dirname(serverFile), 'android-native-browser.json');
      const browserCaptureBefore = await fs.stat(capture).then(stat => stat.mtimeMs).catch(() => null);
      await fill('input[aria-label="Email address"]', fixture.email);
      await fill('input[aria-label="Password"]', 'Incorrect-fixture-password-only1!');
      await evaluate(`document.querySelector('.login-credentials-form').requestSubmit()`);
      await until(`document.querySelector('.login-credentials-form [role="alert"]')&&document.querySelector('.login-credentials-form button[type="submit"]:not([disabled])')`, 'Native incorrect-password feedback');
      check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'An incorrect native form password creates no session');
      await fill('input[aria-label="Password"]', fixture.password);
      await evaluate(`document.querySelector('.login-credentials-form').requestSubmit()`);
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Direct email native dashboard');
      check(await meMatches(), 'React form restores the exact actual provider account through native HTTPS');
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===false)`), 'Email login creates no browser PKCE handoff');
      check((await fs.stat(capture).then(stat => stat.mtimeMs).catch(() => null)) === browserCaptureBefore, 'Email form never starts browser handoff transport');
      const activity = adb(['shell', 'dumpsys', 'activity', 'activities']).toString();
      check(activity.split('\n').some(line => /topResumedActivity|mResumedActivity/.test(line) && line.includes(app)), 'Email sign-in keeps the Android application in front');
      await screenshot('native-email-authenticated');
      await restore(); check(await meMatches(), 'Direct email session survives native force-stop and relaunch');
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Restored direct email dashboard');
      await logoutUI(); await restore();
      check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'Direct email logout remains revoked after relaunch');
    });
    await scenario('A stale browser return cannot replace a newer native email identity', async () => {
      const oldReturn = await prepareReturn(other);
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===true)`), 'The older browser return belongs to a real pending native flow');
      adb(['shell', 'am', 'start', '-n', app + '/app.pinevela.mobile.MainActivity']);
      await until(loginReady, 'Native form after leaving a pending browser flow');
      await fill('input[aria-label="Email address"]', fixture.email);
      await fill('input[aria-label="Password"]', fixture.password);
      await evaluate(`document.querySelector('.login-credentials-form').requestSubmit()`);
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Newer native email identity');
      check(await meMatches(), 'Direct native email login establishes the intended primary identity');
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===false)`), 'Native credential login invalidates the older pending browser handoff');
      deliver(oldReturn); await pause(1000);
      check(await meMatches(), 'The valid older callback for a different verified account cannot substitute the current identity');
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===false)`), 'Rejected stale return cannot restore its pending flow');
      await restore(); check(await meMatches(), 'The newer encrypted native identity remains after relaunch');
      await until(`location.hash.startsWith('#/user/dashboard')&&document.querySelector('[data-dashboard-view]')`, 'Restored newer identity dashboard');
      await logoutUI(); await restore();
    });
    }
    if (process.env.PINEVELA_TEST_NATIVE_SIGNUP === '1') await scenario('Native signup verifies the genuine emailed OTP in themed square boxes', async () => {
      const fixtureFile = path.join(path.dirname(serverFile), 'primary-android-otp-ui.json');
      const expectedEmail = 'android-otp-ui-' + meta.runId.replaceAll('-', '') + '@pinevela.test';
      const identity = resumeSignup ? await privateJson(fixtureFile) : { email: expectedEmail,
        password: crypto.randomBytes(30).toString('base64url') + 'aA1!', name: 'Local Android OTP UI', startedAt: Date.now() };
      if (resumeSignup) {
        assert(identity.email === expectedEmail && identity.name === 'Local Android OTP UI' && typeof identity.password === 'string'
          && /^[A-Za-z0-9_-]{40}aA1!$/.test(identity.password) && !identity.contextId && identity.confirmed !== true,
          'Resume only the same unconfirmed private run-owned signup fixture');
        identity.startedAt = Date.now();
      }
      // One explicit new run-owned account, not a retry that silently creates
      // additional identities. A partial run needs fixture-state review.
      await fs.writeFile(fixtureFile, JSON.stringify(identity, null, 2) + '\n', { flag: resumeSignup ? 'w' : 'wx', mode: 0o600 });
      await until(loginReady, 'Signed-out form before native signup');
      if (resumeSignup) check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'Explicit signup continuation begins without native credentials');
      await evaluate(`document.querySelectorAll('.login-mode-toggle button')[1].click()`);
      await until(`document.querySelector('.login-signup-form')`, 'Native registration');
      for (const [label, value] of [['Your Full Name', identity.name], ['Email Address', identity.email], ['Choose Password', identity.password], ['Confirm Password', identity.password]]) await fill('input[aria-label="' + label + '"]', value);
      await evaluate(`document.querySelector('.login-signup-form input[type="checkbox"]').click()`);
      await until(`document.querySelector('.login-signup-form button[type="submit"]:not([disabled])')`, 'Accepted native registration');
      await evaluate(`document.querySelector('.login-signup-form').requestSubmit()`);
      await until(`document.querySelector('[data-native-email-verification]')`, 'Genuine native email verification screen');
      check(await evaluate(`document.querySelectorAll('[data-native-otp-box]').length===6&&document.querySelector('[data-native-otp-input]').autocomplete==='one-time-code'&&document.querySelector('[data-native-otp-input]').inputMode==='numeric'`), 'Native OTP has six initial square slots and one accessible numeric autofill input');
      await fill('[data-native-otp-input]', '0012345678');
      check(await evaluate(`document.querySelector('[data-native-otp-input]').value==='0012345678'&&document.querySelectorAll('[data-native-otp-box]').length===10`), 'Native OTP preserves leading zeroes and accommodates ten digits');
      await fill('[data-native-otp-input]', '12 34 56');
      check(await evaluate(`document.querySelector('[data-native-otp-input]').value==='123456'&&document.querySelectorAll('[data-native-otp-box]').length===6`), 'Pasted numeric codes normalize spaces without losing digits');
      await fill('[data-native-otp-input]', '');
      const previousTheme = await evaluate(`document.documentElement.dataset.theme`), colors = [];
      for (const theme of ['light', 'dark']) {
        if (await evaluate(`document.documentElement.dataset.theme!==${JSON.stringify(theme)}`)) await evaluate(`document.querySelector('[role="switch"][aria-label="Dark mode"]').click()`);
        await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'OTP theme switch');
        await fill('[data-native-otp-input]', '123456');
        const appearance = await evaluate(`(()=>{const verify=getComputedStyle(document.querySelector('[data-native-otp-verify]')),resend=getComputedStyle(document.querySelector('[data-native-otp-resend]'));return {verifyBackground:verify.backgroundColor,verifyImage:verify.backgroundImage,resendBackground:resend.backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
        const rgb = appearance.verifyBackground.match(/[\d.]+/g)?.slice(0, 3).map(Number);
        check(rgb && (theme === 'light' ? rgb[0] < 30 && rgb[1] < 100 && rgb[2] >= 50 : rgb[0] > 200 && rgb[1] > 150 && rgb[2] < 70), 'OTP Verify uses the requested ' + theme + ' action color');
        check(appearance.resendBackground === 'rgb(255, 255, 255)' && !appearance.overflow, 'OTP Send again stays white without phone overflow in ' + theme);
        colors.push({ theme, ...appearance }); await screenshot('native-otp-' + theme);
      }
      if (await evaluate(`document.documentElement.dataset.theme!==${JSON.stringify(previousTheme)}`)) await evaluate(`document.querySelector('[role="switch"][aria-label="Dark mode"]').click()`);
      const code = await capturedOtp(identity);
      // Observe only response status while retaining the exact real native
      // transport. No request body, credential or OTP is captured or replaced.
      await evaluate(`(()=>{const real=window.fetch;window.__nativeOtpStatuses=[];window.__restoreNativeOtpFetch=()=>{window.fetch=real;delete window.__restoreNativeOtpFetch};window.fetch=(...args)=>real(...args).then(response=>{const value=args[0] instanceof Request?args[0].url:String(args[0]);if(new URL(value,location.href).pathname==='/api/auth/verify-unified')window.__nativeOtpStatuses.push(response.status);return response})})()`);
      const incorrectCode = code.slice(0, -1) + (code.endsWith('0') ? '1' : '0');
      await fill('[data-native-otp-input]', incorrectCode);
      await evaluate(`document.querySelector('[data-native-otp-verify]').click()`);
      await until(`window.__nativeOtpStatuses.length===1&&document.querySelector('[data-native-otp-verify]:not([disabled])')`, 'Incorrect native OTP feedback');
      check(await evaluate(`window.__nativeOtpStatuses[0]===400&&!!document.querySelector('[data-native-email-verification]')`), 'Actual provider rejects a wrong OTP and retains the verification screen');
      check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'A wrong emailed OTP creates no native session');
      await fill('[data-native-otp-input]', code);
      await evaluate(`document.querySelector('[data-native-otp-verify]').click()`);
      await until(`/^#\\/(?:user|student)\\/dashboard(?:[?]|$)/.test(location.hash)&&document.querySelector('[data-dashboard-view]')`, 'Genuine OTP verified dashboard');
      check(await evaluate(`window.__nativeOtpStatuses.join(',')==='400,200'`), 'Only the genuine emailed OTP verifies this native signup');
      await evaluate(`window.__restoreNativeOtpFetch();delete window.__nativeOtpStatuses`);
      const actual = await evaluate(`fetch('/api/auth/me').then(async r=>{if(r.status!==200)return null;const user=await r.json();return {emailMatches:user.email===${JSON.stringify(identity.email)},role:user.role,legalAccepted:user.legal?.accepted===true,id:user.id}})`);
      check(actual?.emailMatches && actual.role === 'user' && actual.legalAccepted && /^[A-Fa-f0-9-]{36}$/.test(actual.id), 'Actual provider OTP creates only the intended primary account with its Terms receipt');
      await fs.writeFile(fixtureFile, JSON.stringify({ ...identity, contextId: actual.id, role: 'user', confirmed: true }, null, 2) + '\n', { mode: 0o600 });
      await fs.writeFile(path.join(output, 'native-otp-theme.json'), JSON.stringify({ actualMailedOtp: true, codePublished: false, colors }, null, 2) + '\n');
      check(await evaluate(`Capacitor.Plugins.PineVelaTransport.getStatus().then(r=>r.pending===false)`), 'Native email signup does not require browser handoff');
      await screenshot('native-otp-verified-dashboard');
      await logoutUI(); await restore();
      check(await evaluate(`fetch('/api/auth/me').then(r=>r.status===401)`), 'Newly verified account can sign out without residual native credentials');
    });
    await scenario('Local policies retain the native theme without credentials', async () => {
      await cdp.send('Page.navigate', { url: 'https://localhost/terms.html' }); await until(`location.pathname==='/terms.html'&&document.querySelector('article')`, 'Bundled terms');
      check(await evaluate(`location.origin==='https://localhost'&&document.documentElement.dataset.theme!==undefined`), 'Policy is bundled and themed');
      check(await evaluate(`!document.querySelector('script[src*="analytics"],script[src*="googletagmanager"]')`), 'Native policy contains no web analytics');
      await screenshot('bundled-terms');
      await cdp.send('Page.navigate', { url: 'https://localhost/#/login?mode=login' }); await until(loginReady, 'Return to bundled login');
    });
    check(exceptions.length === 0, 'Connected native scenarios have no uncaught WebView exceptions');
    const report = { passed: true, date: new Date().toISOString(), checks, scenarios: passed, installedApk: true, installedApkSha256, actualAndroidPlugin: true,
      actualLocalGoTrue: true, actualBrowserLaunches: resumeSignup ? undefined : actualBrowserLaunches, nativeCallbacksDelivered: resumeSignup ? undefined : callbacks, nativeWarmCallback: true, nativeColdCallback: true,
      encryptedSessionRestoration: true, actualSessionRevocation: true, cloudWrites: 0, androidBrowserFormsTested: false,
      actualNativeEmailForm: true, nativeSignupFormRendered: true, actualNativeSignupSubmitted: process.env.PINEVELA_TEST_NATIVE_SIGNUP === '1', actualNativeEmailOtp: process.env.PINEVELA_TEST_NATIVE_SIGNUP === '1',
      otpScreenshotDigits: process.env.PINEVELA_TEST_NATIVE_SIGNUP === '1' ? 'Synthetic UI-only digits; the genuine mailed code was not published.' : undefined,
      staleDifferentIdentityCallbackRejected: true, googleOAuthTested: false, productionCaptchaTested: false, authorizedMediaBytesVerified: false, physicalDeviceTested: false, iosBuildTested: false,
      resumedAfterLocalDatabaseInterruption: resumeSignup, priorCompletedScenarios: interruptedRun?.scenarios, priorCompletedChecks: interruptedRun?.checks,
      priorPartialRunArtifact: resumeSignup ? 'local-db-interruption.json' : undefined,
      freshResumeChecks: resumeSignup ? checks - interruptedRun.checks : undefined };
    await fs.writeFile(path.join(output, 'connected-result.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  } catch (error) {
    // Only our bounded static assertion/timeout label is publishable. Native,
    // TLS and provider error values are never included in test artifacts.
    const message = typeof error?.message === 'string' ? error.message.split('\n')[0] : '';
    const reason = /^[A-Za-z0-9_ ,():;.’'-]{1,180}$/.test(message) ? message : 'Connected check did not complete';
    const report = { passed: false, stage, reason, checks, scenarios: passed, installedApkSha256, cloudWrites: 0 };
    await fs.writeFile(path.join(output, 'connected-result.json'), JSON.stringify(report, null, 2) + '\n'); console.error(JSON.stringify(report)); process.exitCode = 1;
  } finally { if (cdp) cdp.close(); try { adb(['forward', '--remove', 'tcp:' + port]); } catch {} }
}
main().catch(() => { console.error(JSON.stringify({ passed: false, error: 'Owned Android connected harness could not initialize.', cloudWrites: 0 })); process.exitCode = 1; });
