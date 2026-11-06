/** Real guest browser, real loopback API replies. No credentials or account writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const {spawn} = require('node:child_process');
const {once} = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
(async () => {
  const origin = process.argv[2] || 'http://127.0.0.1:3001';
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(origin), 'Only an owned loopback preview is allowed');
  const health = await (await fetch(origin + '/api/health', {signal: AbortSignal.timeout(15000)})).json();
  assert.equal(health.persistence, 'supabase');
  const output = path.resolve('.security/pwa-2026-10-22'); await fs.mkdir(output, {recursive: true});
  const profile = await fs.mkdtemp('/tmp/pinevela-install-browser-'), port = await freePort();
  let browser, socket, command, seq = 0, checks = 0, loads = 0, stage = 'startup';
  const pending = new Map(), exceptions = [], mutations = [];
  const check = (condition, label) => { assert(condition, label); checks++; };
  try {
    browser = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
    let target; const startDeadline = Date.now() + 30000;
    while (Date.now() < startDeadline && browser.exitCode === null) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(item => item.type === 'page'); } catch {}
      if (target) break; await pause(150);
    }
    check(target, 'Owned isolated Chromium starts');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, 20000);
      pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
    });
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const promise = pending.get(message.id); if (!promise) return;
        pending.delete(message.id); clearTimeout(promise.timer);
        message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result);
      } else if (message.method === 'Page.loadEventFired') loads++;
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails.text);
      else if (message.method === 'Network.requestWillBeSent') {
        const request = message.params.request;
        if (request.url.startsWith(origin + '/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) mutations.push(new URL(request.url).pathname);
      }
    };
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true, userGesture: true});
      assert(!result.exceptionDetails, 'Browser expression completes'); return result.result.value;
    };
    const until = async (expression, label) => {
      const deadline = Date.now() + 35000;
      while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(150); }
      throw new Error(label + ' did not finish');
    };
    const navigate = async url => {
      const previousLoads = loads;
      const result = await command('Page.navigate', {url});
      if (result.loaderId) {
        const deadline = Date.now() + 35000;
        while (loads === previousLoads && Date.now() < deadline) await pause(100);
        assert(loads > previousLoads, 'The new document finishes loading before its UI is inspected');
      }
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    const version = await command('Browser.getVersion');
    const login = `!!document.querySelector('input[aria-label="Email address"]')`;
    for (const width of [375, 768, 1440]) {
      stage = 'browser website ' + width;
      await command('Emulation.setDeviceMetricsOverride', {width, height: 900, deviceScaleFactor: 1, mobile: width < 1024});
      await navigate(origin + '/#/');
      await until(`!!document.getElementById('public-header')`, 'Website landing page');
      check(await evaluate(`location.hash === '#/'`), 'Normal browser retains landing at ' + width);
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Website fits ' + width);
      check(await evaluate(`!!document.querySelector('.pv-install-button')`), 'Installation entry exists on website');
      if (width < 1024) check(await evaluate(`document.querySelector('.pv-install-button').getBoundingClientRect().width > 0`), 'Install entry visible on mobile/tablet');
      await navigate(origin + '/#/login'); await until(login, 'Login page');
      check(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Login fits ' + width);
      check(await evaluate(`!!document.querySelector('button[aria-label="PineVela home"]')`), 'Website keeps Home action');
    }
    stage = 'manifest and worker';
    const manifest = await command('Page.getAppManifest');
    check(manifest.errors.length === 0 && JSON.parse(manifest.data).start_url === '/#/login', 'Actual manifest parses and starts at login');
    const installability = await command('Page.getInstallabilityErrors');
    check(installability.installabilityErrors.length === 0, 'Chromium reports no installability errors');
    await until(`(async()=>Boolean((await navigator.serviceWorker.getRegistration())?.active))()`, 'Production worker registration');
    await until('Boolean(navigator.serviceWorker.controller)', 'Worker control');
    check(await evaluate(`(async()=> (await caches.keys()).length === 0)()`), 'Worker creates no private or public response cache');
    const headers = await evaluate(`(async()=>{const r=await fetch('/sw.js');return {type:r.headers.get('content-type'),cache:r.headers.get('cache-control'),scope:r.headers.get('service-worker-allowed')};})()`);
    check(headers.type.startsWith('application/javascript') && headers.cache === 'no-store' && headers.scope === '/', 'Live worker has exact MIME, scope and no-store');
    stage = 'iPhone installation guide';
    await command('Emulation.setDeviceMetricsOverride', {width: 375, height: 812, deviceScaleFactor: 1, mobile: true});
    await command('Network.setUserAgentOverride', {userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'});
    await navigate(origin + '/?iphone-install-check=1#/login'); await until(login, 'iPhone-layout login');
    check(await evaluate(`/iPhone/.test(navigator.userAgent)`), 'Installation guide is checked in the new iPhone document');
    const installButton = await evaluate(`(()=>{const r=document.querySelector('.pv-install-button').getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    await command('Input.dispatchMouseEvent', {type: 'mousePressed', ...installButton, button: 'left', clickCount: 1});
    await command('Input.dispatchMouseEvent', {type: 'mouseReleased', ...installButton, button: 'left', clickCount: 1});
    await until(`!!document.querySelector('dialog[aria-label="Install PineVela"]')`, 'Installation instructions');
    check(await evaluate(`document.querySelector('dialog').innerText.includes('Safari') && document.querySelector('dialog').innerText.includes('Add to Home Screen')`), 'iPhone gets accurate home-screen instructions');
    check(await evaluate(`(()=>{const r=document.querySelector('.pv-install-card').getBoundingClientRect();return r.left>=0 && r.right<=innerWidth+1 && r.top>=0 && r.bottom<=innerHeight+1;})()`), 'Installation guide fits phone viewport');
    await fs.writeFile(path.join(output, 'iphone-install-guide.png'), Buffer.from((await command('Page.captureScreenshot', {format: 'png'})).data, 'base64'));
    await command('Input.dispatchKeyEvent', {type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27});
    await until(`!document.querySelector('dialog[aria-label="Install PineVela"]')`, 'Escape dismisses instructions');
    check(await evaluate(`document.activeElement.classList.contains('pv-install-button')`), 'Dialog restores focus to install action');
    await command('Network.setUserAgentOverride', {userAgent: version.userAgent});
    stage = 'standalone routing';
    // Chromium's media override does not implement display-mode. Emulate iOS's
    // documented home-screen launch signal only; no identity/API/data is replaced.
    await command('Page.addScriptToEvaluateOnNewDocument', {source: `Object.defineProperty(navigator, 'standalone', {configurable: true, value: true});`});
    await navigate(origin + '/?standalone-check=1#/login'); await until(login, 'Installed environment entry');
    check(await evaluate(`navigator.standalone === true`), 'Browser environment emulates the iOS home-screen signal');
    for (const route of ['/', '/why-us', '/unknown-page']) {
      await navigate(origin + '/#' + route); await until(`(${login}) && location.hash === '#/login'`, 'Installed login redirect');
      check(await evaluate(`location.hash === '#/login'`), 'Installed marketing/fallback route redirects: ' + route);
      check(await evaluate(`!document.querySelector('button[aria-label="PineVela home"]') && !document.querySelector('.login-home-link') && !document.querySelector('.pv-install-button')`), 'Installed login hides landing and install actions');
    }
    await navigate(origin + '/#/faq?from=/login');
    await until(`!!document.querySelector('nav[aria-label="Help navigation"]')`, 'Installed FAQ');
    check(await evaluate(`location.hash.startsWith('#/faq') && document.querySelector('nav[aria-label="Help navigation"]').innerText.includes('Sign in')`), 'Installed FAQ stays accessible and returns to sign in');
    check(await evaluate(`![...document.querySelectorAll('header a')].some(a => a.getAttribute('href') === '#/')`), 'Installed FAQ has no landing link');
    await navigate(origin + '/#/help?from=/login');
    await until(`!!document.querySelector('nav[aria-label="Help navigation"]')`, 'Installed Help');
    check(await evaluate(`location.hash.startsWith('#/help')`), 'Installed Help stays accessible');
    stage = 'actual offline navigation';
    await until('Boolean(navigator.serviceWorker.controller)', 'Controlled page before offline');
    // Workers have a separate DevTools network target. Make both targets offline
    // so this checks a real failed worker fetch, rather than only navigator state.
    const worker = (await command('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url === origin + '/sw.js');
    assert(worker, 'The registered production worker has a live browser target');
    const workerSession = (await command('Target.attachToTarget', {targetId: worker.targetId, flatten: true})).sessionId;
    await command('Network.enable', {}, workerSession);
    await command('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0}, workerSession);
    await command('Network.emulateNetworkConditions', {offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0});
    await navigate(origin + '/?offline-check=1#/login');
    await until(`document.documentURI === 'chrome-error://chromewebdata/'`, 'Browser default network error page');
    check(await evaluate(`!document.querySelector('input') && !document.querySelector('#root') && !document.body.innerText.includes('PineVela needs an internet connection')`), 'Browser offline page contains no cached account page, form or custom PineVela notice');
    await command('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1}, workerSession);
    await command('Network.emulateNetworkConditions', {offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1});
    await navigate(origin + '/#/login'); await until(login, 'Online recovery');
    check(await evaluate(`(async()=> (await caches.keys()).length === 0)()`), 'Offline/online navigation retains empty Cache Storage');
    check(mutations.length === 0, 'No account or authentication mutation requested');
    check(exceptions.length === 0, 'No app runtime exceptions');
    const result = {passed: true, checks, responsiveWidths: [375, 768, 1440], browser: 'isolated Chromium', standaloneEmulated: true, standaloneSignal: 'iOS navigator.standalone environment override',
      actualPhoneInstallationTested: false, accountWrites: 0, createdCacheEntries: 0, time: new Date().toISOString()};
    await fs.writeFile(path.join(output, 'browser.json'), JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
  } catch (error) {
    const result = {passed: false, checks, stage, error: error.message};
    await fs.writeFile(path.join(output, 'browser-partial.json'), JSON.stringify(result, null, 2)); console.error(JSON.stringify(result)); process.exitCode = 1;
  } finally {
    if (socket?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} socket.close(); }
    for (const promise of pending.values()) clearTimeout(promise.timer);
    if (browser?.exitCode === null) await Promise.race([once(browser, 'exit'), pause(3000)]);
    if (browser?.exitCode !== null) await fs.rm(profile, {recursive: true, force: true});
  }
})().catch(error => { console.error(JSON.stringify({passed: false, stage: 'startup', error: error.message})); process.exitCode = 1; });
