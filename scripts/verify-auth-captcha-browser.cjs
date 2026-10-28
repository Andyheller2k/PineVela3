/** Real React components in isolated Chromium. All auth/config/provider edges
 * are synthetic; no app account, protected write or external service is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { build } = require('esbuild');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const workspace = process.cwd(), provider = path.join(workspace, 'src/context/ThemeContext.tsx');
  const bundle = await build({ entryPoints: ['tests/fixtures/authCaptchaHarness.tsx'], bundle: true,
    write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'synthetic-auth-edges', setup(plugin) {
      plugin.onResolve({ filter: /AuthContext(?:\.tsx)?$/ }, args => args.importer === provider ? { path: path.join(workspace, 'tests/fixtures/themeProviderAuth.ts') } : undefined);
      plugin.onResolve({ filter: /\/session(?:\.ts)?$/ }, args => args.importer === provider
        ? { path: path.join(workspace, 'tests/fixtures/themeProviderSession.ts') }
        : args.importer.endsWith('/AuthCaptcha.tsx') ? { path: 'captcha-session', namespace: 'synthetic' } : undefined);
      plugin.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ contents: 'export const sessionFetch=(...args)=>window.__captchaFetch(...args);', loader: 'js' }));
    } }] });
  const index = await fs.readFile('dist-supabase/index.html', 'utf8');
  const stylePaths = [...index.matchAll(/href="(\/assets\/[^\"]+\.css)"/g)].map(match => 'dist-supabase' + match[1]);
  assert(stylePaths.length, 'Build the app before testing its compiled CSS');
  const css = (await Promise.all([...stylePaths, 'src/userDashboard.css'].map(file => fs.readFile(file, 'utf8')))).join('\n');
  const html = '<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + css + 'body{margin:0}</style></head><body><div id="root" class="app-canvas"></div><script src="/harness.js"></script></body></html>';
  const server = http.createServer((request, response) => {
    if (request.url === '/harness.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].contents); }
    else if (request.url.startsWith('/?')) { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.statusCode = 404; response.end('No app API in this isolated harness'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`, profile = await fs.mkdtemp('/tmp/pinevela-captcha-browser-');
  const binary = process.env.CHROME_BIN || '/snap/chromium/current/usr/lib/chromium-browser/chrome';
  const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', stderr = '', scenario = 'startup';
  const waiting = new Map(), completed = [], screenshots = [];
  chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-2000); });
  chrome.stdio[4].on('data', chunk => {
    buffer += chunk.toString(); let end;
    while ((end = buffer.indexOf('\0')) >= 0) {
      const raw = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (!raw) continue;
      const message = JSON.parse(raw), pending = waiting.get(message.id); if (!pending) continue;
      waiting.delete(message.id); clearTimeout(pending.timer);
      message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { waiting.delete(id); reject(new Error(`${method} timed out: ${stderr}`)); }, 20000);
    waiting.set(id, { resolve, reject, timer });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
  try {
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => send(method, params, sessionId);
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, result.exceptionDetails?.exception?.description || 'Browser evaluation succeeds');
      return result.result.value;
    };
    const state = () => evaluate('window.captchaHarness.state()');
    const act = expression => evaluate(`(()=>{${expression};return true})()`);
    const until = async (expression, label) => {
      for (let i = 0; i < 120; i++) { if (await evaluate(expression)) return; await pause(20); }
      throw new Error(label + ' did not settle: ' + JSON.stringify(await state()));
    };
    const load = async () => {
      await command('Page.navigate', { url: `${origin}/?case=${Date.now()}${Math.random()}` });
      await until('window.captchaHarness?.ready()', 'Actual React hooks mount'); await pause(30);
    };
    const config = { enabled: true, provider: 'turnstile', siteKey: 'synthetic-public-site-key' };
    const begin = async () => {
      const previous = await state(); await act('window.captchaHarness.submit()');
      await until(`window.captchaHarness.state().requests===${previous.requests + 1}`, 'Submission fetches configuration');
      assert.equal((await state()).checkingTimers, 1, 'One bounded check deadline');
      await act(`window.captchaHarness.complete(${previous.requests},${JSON.stringify(config)})`);
      await until(`window.captchaHarness.state().renders===${previous.renders + 1}`, 'Single challenge mounts');
      return previous;
    };
    const test = async (label, work) => { scenario = label; await work(); completed.push(label); console.log('PASS ' + label); };
    await command('Page.enable'); await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await load();
    await test('Idle login, signup, registration and password forms create no check or timer', async () => {
      for (const scope of ['login', 'signup', 'resend', 'password-recovery', 'manager-password:account-a', 'enrollment:account-a:seller', 'staff-invitation:opaque']) {
        await act(`window.captchaHarness.configure(${JSON.stringify(scope)})`); await pause(30);
        const s = await state(); assert.equal(s.requests, 0); assert.equal(s.renders, 0); assert.equal(s.checkingTimers, 0); assert.equal(s.ready, true);
      }
      assert.equal(await evaluate("document.querySelectorAll('script[src*=\"challenges.cloudflare.com\"]').length"), 0);
    });
    await test('Submission waits for proof, removes its widget and never refreshes after success', async () => {
      const before = await begin();
      assert.equal((await state()).results.length, before.results.length, 'No protected submission can continue before verification');
      const options = (await state()).options;
      assert.equal(options.retry, 'never'); assert.equal(options['refresh-expired'], 'manual'); assert.equal(options['refresh-timeout'], 'manual');
      await act('window.captchaHarness.rerender()'); await pause(30); assert.equal((await state()).renders, 1, 'Ordinary parent renders do not restart checks');
      await act("window.captchaHarness.token('proof-for-submission')"); await until('window.captchaHarness.state().frames===0&&window.captchaHarness.state().results.length===1', 'Completed widget removed');
      const s = await state(); assert.equal(s.results[0].value, 'proof-for-submission'); assert.equal(s.removed, 1); assert.equal(s.checkingTimers, 0); assert.equal(s.ready, true);
      await act("window.captchaHarness.token('late-proof',0);window.captchaHarness.reset()"); await pause(40);
      assert.equal((await state()).renders, 1); assert.equal((await state()).requests, 1); assert.equal((await state()).results.length, 1);
    });
    await test('Concurrent callers share one check and the next submission obtains a fresh proof', async () => {
      const before = await begin(); await act('window.captchaHarness.submit()'); await pause(30);
      assert.equal((await state()).requests, before.requests + 1);
      await act("window.captchaHarness.token('next-proof')"); await until(`window.captchaHarness.state().results.length===${before.results.length + 2}`, 'Both awaiting callers settle');
      assert.deepEqual((await state()).results.slice(-2), [{ value: 'next-proof' }, { value: 'next-proof' }]);
    });
    await test('Disabled CAPTCHA resolves explicitly, while failed configuration blocks submission and can retry', async () => {
      let before = await state(); await act('window.captchaHarness.submit()'); await act(`window.captchaHarness.complete(${before.requests},{enabled:false})`);
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}`, 'Disabled configuration settles');
      assert.equal((await state()).results.at(-1).value, 'captcha-disabled'); assert.equal((await state()).renders, before.renders);
      before = await state(); await act('window.captchaHarness.submit()'); await act(`window.captchaHarness.fail(${before.requests})`);
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}`, 'Configuration failure rejects');
      assert((await state()).results.at(-1).error); assert.equal((await state()).ready, true); assert.equal((await state()).checkingTimers, 0);
      await begin(); await act("window.captchaHarness.token('retry-proof')"); await until('window.captchaHarness.state().frames===0', 'Manual retry succeeds');
    });
    await test('Provider errors, expiry and the deadline reject once and remove all check work', async () => {
      for (const action of ['error', 'expired', 'timeout']) {
        const before = await begin(); await act(`window.captchaHarness.${action}()`);
        await until(`window.captchaHarness.state().results.length===${before.results.length + 1}&&window.captchaHarness.state().frames===0`, action + ' cleans up');
        const s = await state(); assert(s.results.at(-1).error); assert.equal(s.checkingTimers, 0); assert.equal(s.ready, true);
        await pause(30); assert.equal((await state()).renders, before.renders + 1, 'No automatic retry');
      }
    });
    await test('Backgrounding cancels a pending check and return stays idle until another submission', async () => {
      const before = await begin(); await act('window.captchaHarness.visibility(true)');
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}&&window.captchaHarness.state().frames===0`, 'Hidden cancellation');
      assert((await state()).results.at(-1).error); assert.equal((await state()).checkingTimers, 0);
      await act('window.captchaHarness.visibility(false)'); await pause(40); assert.equal((await state()).requests, before.requests + 1);
    });
    await test('Account or scope changes abort old configuration and discard late proof', async () => {
      let before = await state(); await act('window.captchaHarness.submit()'); await act("window.captchaHarness.configure('enrollment:account-b:seller')");
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}`, 'Scope cancels pending promise');
      await act(`window.captchaHarness.complete(${before.requests},${JSON.stringify(config)})`); await pause(30); assert.equal((await state()).renders, before.renders);
      before = await begin(); const old = before.renders; await act("window.captchaHarness.configure('enrollment:account-c:seller')");
      await until('window.captchaHarness.state().frames===0', 'Scope removes old widget');
      await act(`window.captchaHarness.token('old-account-proof',${old})`); await pause(30);
      assert((await state()).results.at(-1).error); assert.equal((await state()).checkingTimers, 0);
      before = await state(); await act("window.captchaHarness.configure('enrollment:account-c:seller',false)"); await pause(20); await act('window.captchaHarness.submit()');
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}`, 'Inactive form rejects'); assert.equal((await state()).requests, before.requests);
      await act("window.captchaHarness.configure('enrollment:account-c:seller',true)");
    });
    await test('Unmount rejects pending work and removes the provider iframe', async () => {
      const before = await begin(); await act('window.captchaHarness.show(false)');
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}&&window.captchaHarness.state().frames===0`, 'Unmount cleans up');
      assert((await state()).results.at(-1).error); assert.equal((await state()).checkingTimers, 0);
    });
    await test('A late-loading SDK cannot create an orphan challenge after unmount', async () => {
      await act('window.captchaHarness.show(true)'); await pause(30); await act('window.captchaHarness.delaySdk()');
      const before = await state(); await act('window.captchaHarness.submit()');
      await act(`window.captchaHarness.complete(${before.requests},${JSON.stringify(config)})`);
      await until('window.captchaHarness.sdkWaiting()', 'SDK load starts only after submission');
      await act('window.captchaHarness.show(false)');
      await until(`window.captchaHarness.state().results.length===${before.results.length + 1}`, 'Pending SDK check rejects on unmount');
      await act('window.captchaHarness.releaseSdk()'); await pause(40);
      assert.equal((await state()).renders, before.renders); assert.equal((await state()).frames, 0); assert.equal((await state()).checkingTimers, 0);
    });
    const output = '/tmp/pinevela-mobile-theme-qa'; await fs.mkdir(output, { recursive: true });
    for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
      await test(`Full CSS: ${width}px ${theme} controls, gold CTA and phone atmosphere`, async () => {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 640 });
        await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
        await load(); await act("document.querySelector('.theme-system-choice').click()");
        await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'System resolves desired appearance'); await pause(420);
        const layout = await evaluate(`(()=>{const b=document.querySelector('.theme-toggle'),s=document.querySelector('.theme-system-choice'),t=document.querySelector('.theme-toggle-thumb'),m=document.querySelector('#merchant button'),r=e=>{const b=e.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height}};return{slider:r(b),system:r(s),thumb:r(t),thumbTransform:getComputedStyle(t).transform,thumbOffset:new DOMMatrixReadOnly(getComputedStyle(t).transform).m41,systemSelected:s.getAttribute('aria-pressed'),overflow:document.documentElement.scrollWidth>innerWidth,gold:getComputedStyle(m).backgroundImage,sheen:getComputedStyle(m,'::after').animationName,iterations:getComputedStyle(m,'::after').animationIterationCount,atmospheres:[...document.querySelectorAll('.theme-atmosphere')].map(e=>getComputedStyle(e).animationName),others:[...document.querySelectorAll('#pending button,#manager button')].map(e=>e.classList.contains('pv-merchant-join'))}})()`);
        assert(Math.abs(layout.slider.y - layout.system.y) < 1, 'Slider and System pill stay beside each other');
        assert(layout.slider.height >= 44 && layout.system.height >= 44); assert.equal(layout.overflow, false);
        assert.equal(layout.systemSelected, 'true'); assert(Math.abs(layout.thumbOffset-(theme==='dark'?44:0))<0.1, 'Circular thumb tracks the effective appearance');
        if (theme === 'dark') { assert(layout.gold.includes('gradient')); assert(layout.gold.includes('255, 195, 0') || layout.gold.includes('255, 214, 10'), layout.gold); }
        assert.deepEqual(layout.others, [false, false]);
        if (theme === 'dark') { assert.equal(layout.sheen, 'user-merchant-gold-sweep'); assert.equal(layout.iterations, 'infinite'); }
        if (width < 640 && theme === 'light') assert.deepEqual(layout.atmospheres, ['none', 'none']);
        const image = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = `${output}/${width}-${theme}.png`; await fs.writeFile(file, Buffer.from(image.data, 'base64')); screenshots.push(file);
      });
    }
    await test('Desktop hover retains gold; reduced motion stops the sheen and thumb travel', async () => {
      const rect = await evaluate("(()=>{const r=document.querySelector('#merchant button').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...rect });
      assert((await evaluate("getComputedStyle(document.querySelector('#merchant button')).backgroundImage")).includes('gradient'));
      await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#merchant button'),'::after').animationName"), 'none');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.theme-toggle-thumb')).transitionDuration"), '0s');
    });
    await test('Desktop decorative motion pauses while hidden', async () => {
      await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
      await act("document.querySelector('.theme-system-choice').click()"); await until('document.querySelectorAll(".theme-atmosphere").length===2', 'Light atmosphere mounts');
      await act('window.captchaHarness.visibility(true)');
      await until('document.querySelector(".theme-environment").dataset.active==="false"', 'Environment sees hidden app');
      assert.deepEqual(await evaluate("[...document.querySelectorAll('.theme-atmosphere')].map(e=>getComputedStyle(e).animationPlayState)"), ['paused', 'paused']);
    });
    const report = { completed, screenshots, externalServices: false, physicalPhoneThermalMeasurement: false };
    await fs.writeFile(output + '/report.json', JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: completed.length, report: output + '/report.json' }));
  } catch (error) { throw new Error(`${scenario}: ${error.message}`); }
  finally { chrome.kill(); for (const item of waiting.values()) { clearTimeout(item.timer); item.reject(new Error('Browser test ended')); } waiting.clear(); server.close(); await fs.rm(profile, { recursive: true, force: true }).catch(() => {}); }
})().catch(error => { console.error(error); process.exitCode = 1; });
