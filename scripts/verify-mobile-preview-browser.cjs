/** Actual bundled frontend in Chromium. No backend, database or provider. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const root = path.resolve('dist-mobile');
  const received = [], network = [], errors = [], completed = [];
  const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };
  const server = http.createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    received.push(pathname);
    try {
      const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
      if (!file.startsWith(root + path.sep)) throw Error('Invalid local path');
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.statusCode = 404; response.end('No API exists in the native preview.'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await fs.mkdtemp('/tmp/pinevela-mobile-preview-');
  const candidates = [process.env.CHROME_BIN, '/snap/chromium/current/usr/lib/chromium-browser/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let binary; for (const file of candidates) { try { await fs.access(file); binary = file; break; } catch {} }
  assert(binary, 'An installed Chromium binary is required');
  const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', stderr = '';
  const pending = new Map();
  chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
  chrome.stdio[4].on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!raw) continue;
      const item = JSON.parse(raw);
      if (item.method === 'Network.requestWillBeSent') network.push(item.params.request.url);
      if (item.method === 'Runtime.exceptionThrown') errors.push(item.params.exceptionDetails.exception?.description || item.params.exceptionDetails.text);
      const waiter = pending.get(item.id); if (!waiter) continue;
      pending.delete(item.id); clearTimeout(waiter.timer);
      item.error ? waiter.reject(Error(item.error.message)) : waiter.resolve(item.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(`${method} timed out: ${stderr}`)); }, 20000);
    pending.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || 'Evaluation must succeed');
      return result.result.value;
    };
    const until = async (expression, label) => {
      for (let attempt = 0; attempt < 150; attempt++) { if (await evaluate(`Boolean(${expression})`)) return; await pause(30); }
      throw Error(label + ' did not settle');
    };
    const test = async (label, action) => { await action(); completed.push(label); console.log('PASS ' + label); };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
    await test('Local bundled launch redirects to login without session restoration or PWA install UI', async () => {
      await command('Page.navigate', { url: origin + '/' });
      await until(`document.querySelector('[aria-label="Login form"]') && location.hash==='#/login'`, 'Login');
      assert.equal(await evaluate(`document.documentElement.dataset.appMode`), 'installed');
      assert.equal(await evaluate(`document.querySelectorAll('.pv-install-button').length`), 0);
      assert.equal(await evaluate(`document.querySelectorAll('link[rel="manifest"],script[src*="analytics"],iframe').length`), 0);
      assert.ok(await evaluate(`document.querySelector('.native-preview-notice').textContent.includes('preview')`));
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('img')).some(image=>image.complete&&image.naturalWidth>0)`));
      assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
    });
    await test('Account actions remain unavailable while signup fields and password requirements are usable', async () => {
      assert.ok(await evaluate(`document.querySelector('button[type="submit"]').disabled`));
      assert.ok(await evaluate(`document.querySelector('.login-google-button').disabled`));
      assert.ok(await evaluate(`Array.from(document.querySelectorAll('button')).find(button=>button.textContent.includes('Forgot Password')).disabled`));
      await evaluate(`document.querySelectorAll('.login-mode-toggle button')[1].click()`);
      await until(`document.querySelector('[aria-label="Signup form"]')`, 'Signup');
      assert.ok(await evaluate(`document.querySelector('[aria-label="Choose Password"]').minLength===8 && document.querySelector('#signup-password-requirements').textContent.includes('uppercase')`));
      assert.ok(await evaluate(`!document.querySelector('[aria-label="Email Address"]').disabled && !document.querySelector('[aria-label="Choose Password"]').disabled`));
      await evaluate(`document.querySelector('input[type="checkbox"]').click()`);
      assert.ok(await evaluate(`document.querySelector('button[type="submit"]').disabled && document.querySelector('.login-google-button').disabled`));
      await evaluate(`document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))`);
      await pause(50);
      assert.ok(await evaluate(`document.body.textContent.includes('Android preview: account access')`));
    });
    await test('FAQ, manual theme and system theme work locally with the existing provider', async () => {
      await evaluate(`location.hash='/faq'`);
      await until(`document.querySelector('[aria-label="FAQ topics"]')`, 'FAQ');
      assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'light');
      await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
      await until(`document.documentElement.dataset.theme==='dark'`, 'System dark');
      await evaluate(`document.querySelector('[role="switch"][aria-label="Dark mode"]').click()`);
      await until(`document.documentElement.dataset.theme==='light'`, 'Manual light');
      await evaluate(`location.hash='/login'`);
      await until(`document.querySelector('[aria-label="Login form"]')`, 'Login after FAQ');
      assert.equal(await evaluate(`document.documentElement.dataset.theme`), 'light');
    });
    await test('Packaged policies open locally and suppress external navigation', async () => {
      await evaluate(`document.querySelector('.login-footer a[href="/terms.html"]').click()`);
      await until(`location.pathname==='/terms.html'&&!!document.querySelector('article')`, 'Local terms');
      assert.equal(await evaluate(`document.querySelector('script[src="/analytics.js"]')`), null);
      await evaluate(`document.querySelector('article a[href="https://pinevela.app/"]').click()`);
      await pause(80);
      assert.equal(await evaluate(`location.origin+location.pathname`), origin + '/terms.html');
      assert.ok(await evaluate(`document.querySelector('[data-native-link-notice]').textContent.includes('next step')`));
    });
    await test('Idle preview makes no API/provider/analytics/font requests and registers no service worker', async () => {
      await command('Page.navigate', { url: origin + '/#/login?mode=onboard' });
      await until(`document.querySelector('[aria-label="Login form"]')`, 'Fresh login');
      await pause(1200);
      assert.equal(await evaluate(`document.querySelectorAll('iframe,script[src*="cloudflare"],[aria-label="Install PineVela"]').length`), 0);
      assert.equal(await evaluate(`navigator.serviceWorker.getRegistrations().then(items=>items.length)`), 0);
      assert.equal(received.filter(url => url.startsWith('/api/')).length, 0);
      assert.equal(network.filter(url => /^https?:/.test(url) && !url.startsWith(origin + '/')).length, 0);
      assert.deepEqual(errors, []);
    });
    console.log(JSON.stringify({ passed: true, scenarios: completed.length, actualBundledFrontend: true, authenticationTested: false, apiRequests: 0, externalRequests: 0 }));
  } finally {
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    if (chrome.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([once(chrome, 'exit'), pause(3000)]); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (chrome.exitCode !== null) await fs.rm(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 });
  }
})().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; });
