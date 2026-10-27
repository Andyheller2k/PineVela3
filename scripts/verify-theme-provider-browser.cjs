/** Real React/Chromium provider integration with explicitly synthetic frontend
 * Auth/session inputs. No authentication, app API or live database is exercised. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { build } = require('esbuild');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const deviceKey = 'pinevela:appearance';
const accountKey = id => `${deviceKey}:user:${id}`;

(async () => {
  const workspace = process.cwd();
  const auth = path.join(workspace, 'tests/fixtures/themeProviderAuth.ts');
  const session = path.join(workspace, 'tests/fixtures/themeProviderSession.ts');
  const provider = path.join(workspace, 'src/context/ThemeContext.tsx');
  const bundle = await build({ entryPoints: ['tests/fixtures/themeProviderHarness.tsx'],
    bundle: true, write: false, format: 'iife', platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'synthetic-theme-edges', setup(plugin) {
      plugin.onResolve({ filter: /AuthContext(?:\.tsx)?$/ }, args => args.importer === provider ? { path: auth } : undefined);
      plugin.onResolve({ filter: /\/session(?:\.ts)?$/ }, args => args.importer === provider ? { path: session } : undefined);
    } }] });
  const source = await fs.readFile('index.html', 'utf8');
  const bootstrap = source.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert(bootstrap, 'The app prepaint bootstrap is included in the provider integration test');
  const controlCss = await fs.readFile('src/theme.css', 'utf8');
  const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#001d3d"><style>' + controlCss + 'body{margin:0;padding:12px;box-sizing:border-box}*,*::before,*::after{box-sizing:border-box}</style>'
    + '<script>' + bootstrap + '</script><script>window.__themePrepaint={...document.documentElement.dataset};</script>'
    + '</head><body><div id="root"></div><script src="/provider-harness.js"></script></body></html>';
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
    if (pathname === '/provider-harness.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(bundle.outputFiles[0].contents); }
    else if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end(html); }
    else { response.statusCode = 404; response.end('The synthetic provider harness has no app API.'); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  const profile = await fs.mkdtemp('/tmp/pinevela-theme-provider-');
  const candidates = [process.env.CHROME_BIN, '/snap/chromium/current/usr/lib/chromium-browser/chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  let binary; for (const candidate of candidates) { try { await fs.access(candidate); binary = candidate; break; } catch {} }
  assert(binary, 'Set CHROME_BIN to an installed Chromium binary');
  const chrome = spawn(binary, ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu',
    '--disable-background-networking', '--no-first-run', '--no-default-browser-check', '--remote-debugging-pipe',
    `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
  let sequence = 0, buffer = '', stderr = '', seedScript, scenario = 'startup';
  const waiting = new Map(), completed = [];
  chrome.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-3000); });
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
    const until = async (expression, label) => {
      for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(expression)) return; await pause(20); }
      throw new Error(label + ' did not settle: ' + JSON.stringify(await evaluate('window.themeProviderHarness?.state()')));
    };
    const state = () => evaluate('window.themeProviderHarness.state()');
    const requests = () => evaluate('window.themeProviderHarness.requests()');
    const act = expression => evaluate(`(()=>{${expression};return true})()`);
    const choose = mode => act(`window.themeProviderHarness.choose(${JSON.stringify(mode)})`);
    const account = id => act(`window.themeProviderHarness.account(${JSON.stringify(id)})`);
    const complete = (id, theme, status = 200) => act(`window.themeProviderHarness.complete(${id},${status},${JSON.stringify({ theme })})`);
    const expectState = async (preference, theme, label) => {
      await until(`window.themeProviderHarness.state().preference===${JSON.stringify(preference)}&&window.themeProviderHarness.state().theme===${JSON.stringify(theme)}&&document.documentElement.dataset.theme===${JSON.stringify(theme)}`, label);
    };
    const os = async dark => { await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] }); await pause(30); };
    const load = async ({ storage = {}, dark = false, route = '/user/dashboard', user = null, loading = false } = {}) => {
      if (seedScript) await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScript });
      const seed = String(Date.now()) + Math.random();
      const result = await command('Page.addScriptToEvaluateOnNewDocument', { source: `if(sessionStorage.getItem('theme-provider-test-seed')!==${JSON.stringify(seed)}){localStorage.clear();for(const [key,value]of Object.entries(${JSON.stringify(storage)}))localStorage.setItem(key,value);sessionStorage.setItem('theme-provider-test-seed',${JSON.stringify(seed)});}window.__themeInitialAuth=${JSON.stringify({ user: user ? { id: user, role: 'user' } : null, loading })};` });
      seedScript = result.identifier; await os(dark);
      await command('Page.navigate', { url: `${origin}/?case=${seed}#${route}` });
      await until('window.themeProviderHarness?.ready===true', 'Actual provider mounts');
      await pause(30);
    };
    const requestUntil = async (method, context, count = 1) => {
      await until(`window.themeProviderHarness.requests().filter(r=>r.method===${JSON.stringify(method)}&&r.context===${JSON.stringify(context)}).length>=${count}`, `${method} for ${context}`);
      return (await requests()).filter(request => request.method === method && request.context === context).at(-1);
    };
    const test = async (label, callback) => { scenario = label; await callback(); completed.push(label); console.log('PASS ' + label); };
    await command('Page.enable'); await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await test('System is the default and only System follows live OS changes on product and auth routes', async () => {
      await load(); await expectState('system', 'light', 'Default System'); await os(true); await expectState('system', 'dark', 'System follows dark OS');
      await choose('light'); await expectState('light', 'light', 'Manual light'); await os(false); await os(true); await expectState('light', 'light', 'Manual light ignores OS');
      await choose('dark'); await expectState('dark', 'dark', 'Manual dark'); await os(false); await expectState('dark', 'dark', 'Manual dark ignores OS');
      await act("window.themeProviderHarness.navigate('/login?mode=register')"); await expectState('dark', 'dark', 'Auth inherits explicit choice');
      await act("window.themeProviderHarness.navigate('/user/dashboard')"); await choose('system'); await act("window.themeProviderHarness.navigate('/login')"); await expectState('system', 'light', 'Auth System resolves OS'); await os(true); await expectState('system', 'dark', 'Open auth follows System');
      assert.equal((await state()).storage[deviceKey], 'system', 'Persist the preference rather than the resolved OS color');
      await act("window.themeProviderHarness.navigate('/user/dashboard')"); await act('window.themeProviderHarness.toggle()'); await expectState('light', 'light', 'Compatibility toggle leaves System opposite effective color');
      assert.equal((await requests()).length, 0, 'Guest choices have no account writes');
    });
    await test('Actual AppearanceSettings radios work with keyboard at 320px and hide on auth routes', async () => {
      await command('Emulation.setDeviceMetricsOverride', { width: 320, height: 844, deviceScaleFactor: 1, mobile: true });
      await load(); await expectState('system', 'light', 'Default settings mode');
      assert.equal(await evaluate("document.querySelectorAll('[role=radiogroup] input[type=radio]').length"), 3);
      await act("document.querySelector('input[value=system]').focus()");
      for (const [key, expected] of [['ArrowLeft', 'dark'], ['ArrowLeft', 'light'], ['ArrowRight', 'dark']]) {
        await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode: key === 'ArrowLeft' ? 37 : 39 });
        await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: key === 'ArrowLeft' ? 37 : 39 });
        await expectState(expected, expected, 'Keyboard radio selection');
        assert.equal(await evaluate('document.querySelectorAll("input[type=radio]:checked").length'), 1);
        assert.equal(await evaluate('document.activeElement.value'), expected);
      }
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'), 'Appearance controls fit 320px');
      await act("window.themeProviderHarness.navigate('/login')"); await until("!document.querySelector('[role=radiogroup]')", 'Auth hides product appearance settings');
    });
    await test('Legacy explicit modes and prepaint agree with mounted provider and refresh on both viewport widths', async () => {
      for (const width of [390, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 640 });
        for (const saved of ['light', 'dark', 'system']) {
          await load({ storage: { [deviceKey]: saved }, dark: saved !== 'dark', route: '/login' });
          const expected = saved === 'system' ? 'dark' : saved; await expectState(saved, expected, 'Legacy/bootstrap preference');
          assert.equal((await state()).prepaint.theme, expected, 'Prepaint agrees before the provider mounts');
          await command('Page.reload'); await until('window.themeProviderHarness?.ready===true', 'Provider remount after refresh'); await expectState(saved, expected, 'Refresh preserves selection');
          assert.equal((await state()).prepaint.theme, expected);
        }
      }
    });
    await test('Storage events synchronize explicit and System choices while invalid values are ignored', async () => {
      await load({ dark: true });
      for (const value of ['light', 'dark', 'system']) {
        await act(`localStorage.setItem(${JSON.stringify(deviceKey)},${JSON.stringify(value)});window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(deviceKey)},newValue:${JSON.stringify(value)}}))`);
        await expectState(value, value === 'system' ? 'dark' : value, 'Cross-tab selection');
      }
      await act(`window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(deviceKey)},newValue:'invalid'}))`); await expectState('system', 'dark', 'Invalid event ignored');
      await os(false); await expectState('system', 'light', 'Cross-tab System still follows OS');
    });
    await test('A user choice made during account hydration wins over a late GET', async () => {
      await load({ user: 'scope-a', dark: true }); const read = await requestUntil('GET', 'scope-a');
      await choose('light'); const write = await requestUntil('PUT', 'scope-a'); await complete(read.id, 'dark'); await expectState('light', 'light', 'Late GET cannot overwrite a newer choice');
      await complete(write.id, 'light'); await until('!window.themeProviderHarness.state().savePending', 'Choice saved');
      assert.equal((await state()).storage[accountKey('scope-a')], 'light');
    });
    await test('Rapid writes are serialized and coalesce to the latest preference including System', async () => {
      await load({ user: 'scope-a' }); const read = await requestUntil('GET', 'scope-a'); await complete(read.id, 'light'); await expectState('light', 'light', 'Account hydration');
      await choose('dark'); const first = await requestUntil('PUT', 'scope-a'); await choose('light'); await choose('system'); await os(true); await expectState('system', 'dark', 'Latest desired System');
      assert.equal((await requests()).filter(request => request.method === 'PUT').length, 1, 'Only one request is in flight');
      await complete(first.id, 'dark'); const latest = await requestUntil('PUT', 'scope-a', 2); assert.deepEqual(latest.body, { theme: 'system' });
      await complete(latest.id, 'system'); await until('!window.themeProviderHarness.state().savePending', 'Latest preference saved');
      assert.equal((await state()).storage[accountKey('scope-a') + ':unsynced'], undefined);
    });
    await test('Failed saves remain pending and retry on reconnect without a retry loop', async () => {
      await load({ user: 'scope-a' }); const read = await requestUntil('GET', 'scope-a'); await complete(read.id, 'light'); await expectState('light', 'light', 'Hydration');
      await choose('system'); const first = await requestUntil('PUT', 'scope-a'); await act(`window.themeProviderHarness.fail(${first.id})`); await pause(80);
      assert.equal((await requests()).filter(request => request.method === 'PUT').length, 1); assert.equal((await state()).savePending, true);
      assert.equal((await state()).storage[accountKey('scope-a') + ':unsynced'], 'system');
      await act("window.dispatchEvent(new Event('online'))"); const retry = await requestUntil('PUT', 'scope-a', 2); assert.deepEqual(retry.body, { theme: 'system' });
      await complete(retry.id, 'system'); await until('!window.themeProviderHarness.state().savePending', 'Reconnect save succeeds');
    });
    await test('Account storage events override pending hydration and failed HTTP saves survive refresh', async () => {
      await load({ user: 'scope-a', storage: { [deviceKey]: 'light' } }); const read = await requestUntil('GET', 'scope-a');
      const key = accountKey('scope-a');
      await act(`localStorage.setItem(${JSON.stringify(key)},'system');window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(key)},newValue:'system'}))`);
      const write = await requestUntil('PUT', 'scope-a'); assert.deepEqual(write.body, { theme: 'system' });
      await complete(read.id, 'dark'); await expectState('system', 'light', 'Cross-tab selection wins over hydration');
      await complete(write.id, 'system', 503); await pause(50);
      assert.equal((await state()).savePending, true); assert.equal((await state()).storage[key + ':unsynced'], 'system');
      await command('Page.reload'); await until('window.themeProviderHarness?.ready===true', 'Reload pending selection');
      const retry = await requestUntil('PUT', 'scope-a'); assert.deepEqual(retry.body, { theme: 'system' });
      assert.equal((await requests()).filter(request => request.method === 'GET').length, 0, 'Pending local selection is not overwritten by hydration');
      await complete(retry.id, 'system'); await until('!window.themeProviderHarness.state().savePending', 'Reload retries pending save');
    });
    await test('Late hydration from a previous account cannot alter the active account or device choice', async () => {
      await load({ user: 'scope-a' }); const old = await requestUntil('GET', 'scope-a'); await account('scope-b'); const current = await requestUntil('GET', 'scope-b');
      assert.equal((await requests()).find(request => request.id === old.id).aborted, true);
      await complete(current.id, 'light'); await expectState('light', 'light', 'New account preference'); await complete(old.id, 'dark'); await pause(40); await expectState('light', 'light', 'Old response ignored');
      assert.equal((await state()).storage[deviceKey], 'light');
    });
    await test('Old PUT completion cannot clear or write a newer account queue', async () => {
      await load({ user: 'scope-a' }); const initial = await requestUntil('GET', 'scope-a'); await complete(initial.id, 'light'); await expectState('light', 'light', 'First account');
      await choose('dark'); const oldWrite = await requestUntil('PUT', 'scope-a'); await account('scope-b'); const read = await requestUntil('GET', 'scope-b'); await complete(read.id, 'light'); await expectState('light', 'light', 'Second account');
      await choose('system'); assert.equal((await state()).savePending, true); await complete(oldWrite.id, 'dark');
      const newWrite = await requestUntil('PUT', 'scope-b'); assert.deepEqual(newWrite.body, { theme: 'system' }); assert.equal((await state()).savePending, true);
      await complete(newWrite.id, 'system'); await until('!window.themeProviderHarness.state().savePending', 'Second account save succeeds');
      assert.equal((await state()).storage[accountKey('scope-b')], 'system');
    });
    await test('Logout preserves selected mode on login without an intermediate appearance reset', async () => {
      await load({ user: 'scope-a' }); const read = await requestUntil('GET', 'scope-a'); await complete(read.id, 'dark'); await expectState('dark', 'dark', 'Account is dark');
      await act("window.themeProviderHarness.startTrace();window.themeProviderHarness.account(null);window.themeProviderHarness.navigate('/login')"); await expectState('dark', 'dark', 'Logout auth keeps choice'); await pause(50);
      const trace = await evaluate('window.themeProviderHarness.trace()'); assert(trace.every(theme => theme === null || theme === 'dark'), 'No transient light attribute during logout');
      assert.equal((await state()).storage[deviceKey], 'dark');
    });
    await test('A new account inherits device preference once and unmount ignores late hydration', async () => {
      await load({ user: 'scope-a', storage: { [deviceKey]: 'system' }, dark: true }); const read = await requestUntil('GET', 'scope-a'); await complete(read.id, null);
      const write = await requestUntil('PUT', 'scope-a'); assert.deepEqual(write.body, { theme: 'system' }); await complete(write.id, 'system'); await expectState('system', 'dark', 'New account System');
      await load({ user: 'scope-b', storage: { [deviceKey]: 'light' } }); const late = await requestUntil('GET', 'scope-b');
      await act('window.themeProviderHarness.unmount()'); await complete(late.id, 'dark'); await pause(40);
      assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(deviceKey)})`), 'light', 'Unmounted hydration has no device side effects');
    });
    console.log(JSON.stringify({ passed: true, scenarios: completed.length, actualReactProvider: true,
      actualBrowser: true, syntheticFrontendAuthInputs: true, controlledSessionPromises: true,
      authenticationTested: false, liveApiRequests: 0, cloudRecordsModified: 0 }));
  } catch (error) {
    console.error(JSON.stringify({ passed: false, scenario, completed: completed.length, error: error.message })); process.exitCode = 1;
  } finally {
    for (const pending of waiting.values()) clearTimeout(pending.timer);
    if (chrome.exitCode === null) { chrome.kill('SIGTERM'); await Promise.race([once(chrome, 'exit'), pause(3000)]); }
    server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    if (chrome.exitCode !== null) await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(JSON.stringify({ passed: false, stage: 'setup', error: error.message })); process.exitCode = 1; });
