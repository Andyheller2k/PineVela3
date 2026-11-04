/** Smoke-test the installed debug APK through an explicitly forwarded WebView. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const port = Number(process.env.PINEVELA_WEBVIEW_PORT || 9228);
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const adbPath = process.env.ANDROID_HOME ? path.join(process.env.ANDROID_HOME, 'platform-tools/adb') : 'adb';
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  const windowInfo = adb(['shell', 'dumpsys', 'window']).toString();
  const inset = windowInfo.match(/type=statusBars frame=\[0,0\]\[\d+,(\d+)\]/);
  assert(inset, 'This portrait-emulator check needs a visible top status bar.');
  const statusBarHeight = Number(inset[1]);
  const output = path.resolve(process.env.PINEVELA_ANDROID_EVIDENCE || 'docs/verification/android-step2-2026-10-29');
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then(response => response.json());
  const target = targets.find(item => item.type === 'page' && item.url.startsWith('https://localhost'));
  assert(target, 'Forward the running PineVela Preview WebView to the configured localhost port first.');
  const ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1'));
  await once(ws, 'open');
  let sequence = 0;
  const pending = new Map(), requests = [], errors = [], passed = [];
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Network.requestWillBeSent') requests.push(message.params.request.url);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    const waiter = pending.get(message.id);
    if (!waiter) return;
    clearTimeout(waiter.timer); pending.delete(message.id);
    message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 20000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || 'JavaScript evaluation failed');
    return result.result.value;
  };
  const until = async (expression, description) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await pause(150);
    }
    throw Error(description + ' did not settle');
  };
  const check = async (name, action) => { await action(); passed.push(name); console.log('PASS ' + name); };
  const tap = async expression => {
    await evaluate(`(${expression}).scrollIntoView({block:'nearest'})`);
    await pause(200);
    const point = await evaluate(`(() => {const r=(${expression}).getBoundingClientRect();return {x:(r.left+r.width/2)*devicePixelRatio,y:(r.top+r.height/2)*devicePixelRatio}})()`);
    adb(['shell', 'input', 'tap', String(Math.round(point.x)), String(Math.round(point.y + statusBarHeight))]);
  };
  const screenshot = async name => {
    // WebView's compositor can lag the DOM during a route/form transition.
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await pause(1000);
    // WebView 124's CDP capture can return stale compositor images. Capture the
    // actual Android display, including system bars, after real touch input.
    await fs.writeFile(path.join(output, name + '.png'), adb(['exec-out', 'screencap', '-p']));
  };
  try {
    await fs.mkdir(output, { recursive: true });
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    await send('Network.setCacheDisabled', { cacheDisabled: true });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await evaluate(`localStorage.removeItem('pinevela:appearance')`);
    await send('Page.navigate', { url: 'https://localhost/#/login' });
    await send('Page.reload', { ignoreCache: true });
    await check('Installed APK boots its bundled login with an active Android bridge', async () => {
      await until(`document.querySelector('[aria-label="Login form"]')`, 'Login');
      assert.equal(await evaluate(`Capacitor.getPlatform()`), 'android');
      assert.equal(await evaluate(`Capacitor.isNativePlatform()`), true);
      assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'light');
      assert.equal(await evaluate(`document.documentElement.dataset.appMode`), 'installed');
      assert.ok(await evaluate(`document.querySelector('.native-preview-notice').textContent.includes('preview')`));
      assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`));
      assert.ok(await evaluate(`Array.from(document.images).some(image => image.complete && image.naturalWidth > 0)`));
      await screenshot('login-light');
    });
    await check('Signup transition works and protected account actions stay disabled', async () => {
      assert.ok(await evaluate(`document.querySelector('button[type="submit"]').disabled && document.querySelector('.login-google-button').disabled`));
      await tap(`document.querySelectorAll('.login-mode-toggle button')[1]`);
      await until(`document.querySelector('[aria-label="Signup form"]')`, 'Signup');
      assert.equal(await evaluate(`document.querySelector('.login-mode-toggle').dataset.activeTab`), 'register');
      assert.equal(await evaluate(`document.querySelectorAll('.login-mode-toggle button')[1].getAttribute('aria-pressed')`), 'true');
      assert.equal(await evaluate(`document.querySelector('[aria-label="Choose Password"]').minLength`), 8);
      assert.ok(await evaluate(`!document.querySelector('[aria-label="Email Address"]').disabled`));
      await tap(`document.querySelector('input[type="checkbox"]')`);
      assert.ok(await evaluate(`document.querySelector('button[type="submit"]').disabled && document.querySelector('.login-google-button').disabled`));
      await screenshot('signup-light');
      await evaluate(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await until(`document.body.textContent.includes('Android preview: account access')`, 'Preview explanation');
    });
    await check('System and manual themes render in the Android WebView', async () => {
      await evaluate(`location.hash='/faq'`);
      await until(`document.querySelector('[aria-label="FAQ topics"]')`, 'FAQ');
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      await until(`document.documentElement.dataset.theme==='dark'`, 'System dark');
      await screenshot('faq-dark');
      await tap(`document.querySelector('[role="switch"][aria-label="Dark mode"]')`);
      await until(`document.documentElement.dataset.theme==='light'`, 'Manual light');
      await tap(`document.querySelector('[role="switch"][aria-label="Dark mode"]')`);
      await until(`document.documentElement.dataset.theme==='dark'`, 'Manual dark');
      await evaluate(`location.hash='/login'`);
      await until(`document.querySelector('[aria-label="Login form"]')`, 'Login again');
      await screenshot('login-dark');
    });
    await check('Bundled policies open locally and external links stay in the preview', async () => {
      await tap(`document.querySelector('.login-footer a[href="/terms.html"]')`);
      await until(`location.pathname==='/terms.html'&&document.querySelector('article')`, 'Terms');
      await tap(`document.querySelector('article a[href="https://pinevela.app/"]')`);
      await pause(200);
      assert.equal(await evaluate(`location.origin + location.pathname`), 'https://localhost/terms.html');
      assert.ok(await evaluate(`!!document.querySelector('[data-native-link-notice]')`));
    });
    await check('APK reloads offline and makes no API or external requests', async () => {
      await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      await send('Page.navigate', { url: 'https://localhost/#/login' });
      await until(`document.querySelector('[aria-label="Login form"]')`, 'Offline login');
      await pause(1500);
      assert.equal(await evaluate(`document.querySelectorAll('iframe,script[src*="cloudflare"],link[rel="manifest"],.pv-install-button').length`), 0);
      assert.equal(await evaluate(`navigator.serviceWorker.getRegistrations().then(items => items.length)`), 0);
      const transport = requests.filter(url => /^https?:/.test(url) && (!url.startsWith('https://localhost/') || new URL(url).pathname.startsWith('/api/')));
      assert.deepEqual(transport, []);
      assert.deepEqual(errors, []);
      await screenshot('login-offline');
    });
    const report = { passed: true, date: new Date().toISOString(), installedApk: true, platform: 'android',
      scenarios: passed, apiOrExternalRequests: 0, uncaughtExceptions: 0, serviceWorkers: 0,
      authenticationAvailable: false, physicalDeviceTested: false };
    await fs.writeFile(path.join(output, 'webview-smoke.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report));
  } finally {
    await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }).catch(() => {});
    await send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
    await evaluate(`localStorage.removeItem('pinevela:appearance')`).catch(() => {});
    await send('Page.navigate', { url: 'https://localhost/#/login' }).catch(() => {});
    await send('Page.reload', { ignoreCache: true }).catch(() => {});
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    ws.close();
  }
})().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; });
