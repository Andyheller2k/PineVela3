/** Actual application and native browser requests. Never fulfill an intercepted
 * response, fabricate an identity, extract cookies or submit private keys.
 * --authenticated attaches only to the user-approved PineVela Chromium tab. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  assert(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--authenticated'));
  const authenticated = process.argv[2] === '--authenticated', base = 'http://127.0.0.1:3001';
  assert.equal((await (await fetch(base + '/api/health')).json()).persistence, 'supabase');
  let chrome, root, socket, session, command, seq = 0, checks = 0, loads = 0;
  let mode = 'allow', attempts = 0, held = [], intercepted = false, pausedStatus;
  const pending = new Map(), replies = [], exceptions = [];
  const check = (value, label) => { assert(value, label); checks++; };
  try {
    let endpoint;
    if (authenticated) {
      const [port, ws] = (await fs.readFile(path.join(os.homedir(), 'snap/chromium/common/chromium/DevToolsActivePort'), 'utf8')).trim().split('\n');
      assert(port === '9222' && /^\/devtools\/browser\/[a-f0-9-]{36}$/i.test(ws));
      endpoint = 'ws://127.0.0.1:' + port + ws;
    } else {
      root = await fs.mkdtemp('/tmp/pv-session-browser-');
      const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
      const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
      chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
        `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(root, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        try { endpoint = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(t => t.type === 'page')?.webSocketDebuggerUrl; } catch {}
        if (endpoint || chrome.exitCode !== null) break;
        await pause(150);
      }
      assert(endpoint, 'An isolated guest browser starts');
    }
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser connection approval timed out')), 45000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); };
    });
    command = (method, params = {}, target = session) => new Promise((resolve, reject) => {
      const id = ++seq, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, 60000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params, ...(target ? { sessionId: target } : {}) }));
    });
    socket.onmessage = event => {
      const m = JSON.parse(event.data);
      if (m.id) {
        const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer);
        m.error ? p.reject(new Error('Browser command rejected')) : p.resolve(m.result);
      } else if (!session || m.sessionId === session) {
        if (m.method === 'Page.loadEventFired') loads++;
        if (m.method === 'Runtime.exceptionThrown') exceptions.push(m.params.exceptionDetails.text);
        if (m.method === 'Network.responseReceived' && m.params.response.url === base + '/api/auth/me') replies.push(m.params.response.status);
        if (m.method === 'Fetch.requestPaused') {
          attempts++;
          pausedStatus = m.params.responseStatusCode;
          const requestId = m.params.requestId;
          if (mode === 'hold') held.push(requestId);
          else command(mode === 'fail-all' || mode === 'fail-two' && attempts <= 2 ? 'Fetch.failRequest' : 'Fetch.continueRequest',
            { requestId, ...(mode === 'fail-all' || mode === 'fail-two' && attempts <= 2 ? { errorReason: 'ConnectionFailed' } : {}) })
            .catch(() => exceptions.push('Interception command failed'));
        }
      }
    };
    if (authenticated) {
      const target = (await command('Target.getTargets')).targetInfos.find(t => t.type === 'page' && t.url.startsWith(base + '/'));
      assert(target, 'The signed-in PineVela tab exists');
      session = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    }
    const evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert(!result.exceptionDetails, 'Browser evaluation completes'); return result.result.value;
    };
    const until = async (expression, label, timeout = 60000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) { if (await evaluate(expression)) return; await pause(150); }
      throw new Error(label + ' did not complete');
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    // Real Chromium may throttle timers in a tab hidden for several minutes.
    // Exercise the foreground journey without replacing clocks or API replies.
    if (authenticated) {
      console.log(JSON.stringify({ foregroundBeforeCheck: await evaluate("document.visibilityState==='visible'") }));
      await command('Page.bringToFront');
      await until("document.visibilityState==='visible'", 'The PineVela tab is foreground');
    }
    if (!authenticated) {
      await command('Page.navigate', { url: base + '/#/login' });
      await until("!!document.querySelector('input[aria-label=\"Username or Email Address\"]')", 'Guest app loads');
    }
    const initial = await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return {status:r.status,role:u.role,verified:!!u.isVerified,route:location.hash};})()");
    check(authenticated ? initial.status === 200 && initial.verified && initial.role === 'admin' : initial.status === 401, 'The starting identity is genuinely verified or genuinely absent');
    const route = authenticated ? initial.route : '#/admin/dashboard';
    assert(route.startsWith('#/admin/'), 'Use the actual administrator route');
    const retry = "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Retry connection')";
    const login = "!!document.querySelector('input[aria-label=\"Username or Email Address\"]')";
    const resolved = authenticated ? "location.hash===" + JSON.stringify(route) + "&&!!document.querySelector('img[alt=\"Administrator profile\"]')" : login;
    async function start(nextMode) {
      if (authenticated) await command('Page.bringToFront');
      mode = nextMode; attempts = 0; held = []; replies.length = 0;
      await command('Fetch.enable', { patterns: [{ urlPattern: base + '/api/auth/me', requestStage: 'Request' }] }); intercepted = true;
      const before = loads;
      await command('Page.navigate', { url: base + '/?sessionCheck=' + Date.now() + route });
      const deadline = Date.now() + 45000;
      while (loads === before && Date.now() < deadline) await pause(150);
      assert(loads > before, 'The actual new document loads');
      console.log(JSON.stringify({ stage: nextMode, authenticatedBrowser: authenticated }));
    }
    async function finish() {
      await until(resolved, 'Real session resolution');
      check(replies.includes(authenticated ? 200 : 401), 'Resolution uses an actual server reply');
      await command('Fetch.disable'); intercepted = false;
    }

    await start('hold');
    const heldDeadline = Date.now() + 30000;
    while (!held.length && Date.now() < heldDeadline) await pause(100);
    check(held.length === 1, 'Exactly one initial check starts'); await pause(1500);
    check(attempts === 1, 'StrictMode does not duplicate the cookie check');
    check(await evaluate('location.hash===' + JSON.stringify(route)), 'The protected route stays in place while checking');
    check(!await evaluate(login), 'No login form flashes during restoration');
    mode = 'allow'; for (const requestId of held.splice(0)) await command('Fetch.continueRequest', { requestId });
    await finish(); check(true, 'The delayed actual reply resolves');

    await start('fail-two'); await finish();
    check(attempts === 3, 'Two interrupted requests produce one real third check');
    check(authenticated ? await evaluate('location.hash===' + JSON.stringify(route)) : await evaluate("location.hash.startsWith('#/login')"), 'Verified accounts retain their route; guests go to login');

    await start('fail-all');
    await until('!!(' + retry + ')', 'Honest connection retry');
    check(attempts === 3, 'Automatic retries are bounded');
    check(await evaluate('location.hash===' + JSON.stringify(route)), 'Connection exhaustion does not redirect to login');
    check(!await evaluate(login), 'Unavailable session is not guessed to be signed out');
    if (!authenticated) {
      await evaluate("location.hash='#/'");
      await until("document.body.innerText.includes('PineMarket')", 'Public landing remains available');
      check(!await evaluate('!!(' + retry + ')'), 'Auth unavailability does not replace public browsing');
      await evaluate("location.hash='#/admin-invitation'");
      await until('!!(' + retry + ')', 'Invitation offers restoration retry');
      check(!await evaluate("Array.from(document.querySelectorAll('main a')).some(a=>a.textContent.trim()==='Sign in')"), 'Invitation does not flash sign-in choices during an unavailable check');
      await evaluate('location.hash=' + JSON.stringify(route));
      await until('!!(' + retry + ')', 'Return to the protected retry screen');
    }
    for (const width of [375, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Retry view fits ' + width + 'px');
      check(await evaluate('(' + retry + ').getBoundingClientRect().height>=44'), 'Retry target is reachable');
    }
    await command('Emulation.clearDeviceMetricsOverride'); mode = 'allow'; attempts = 0;
    await evaluate('(' + retry + ').click()'); await finish(); check(attempts === 1, 'Manual retry starts one new check');

    await start('hold');
    await until('!!(' + retry + ')', 'Bounded slow-check notice');
    check(attempts === 1 && held.length === 1, 'The slow cookie check remains intact');
    await evaluate('(' + retry + ').click()'); await pause(1500);
    check(attempts === 1 && held.length === 1, 'Retry reuses a still-pending cookie refresh');
    mode = 'allow'; for (const requestId of held.splice(0)) await command('Fetch.continueRequest', { requestId });
    await finish(); check(!await evaluate('!!(' + retry + ')'), 'A late genuine reply clears the notice');

    if (!authenticated) {
      // Hold an actual denied reply, then advance the transport generation. This
      // checks stale-401 handling without signing anyone out or inventing users.
      mode = 'hold'; held = []; pausedStatus = undefined;
      await command('Fetch.enable', { patterns: [{ urlPattern: base + '/api/auth/contexts', requestStage: 'Response' }] }); intercepted = true;
      await evaluate(`(async()=>{
        const transport=await import('/src/lib/session.ts');
        const check={events:0,done:false,status:0,transport};
        check.listener=()=>{check.events++;};
        window.addEventListener('pinevela-session-expired',check.listener);
        window.__pvTransportCheck=check;
        transport.sessionFetch('/api/auth/contexts').then(r=>{check.status=r.status;check.done=true;});
        return true;
      })()`);
      const deadline = Date.now() + 30000;
      while (!held.length && Date.now() < deadline) await pause(100);
      check(held.length === 1 && pausedStatus === 401, 'A real guest 401 is held before delivery');
      await evaluate('window.__pvTransportCheck.transport.advanceSessionGeneration()');
      mode = 'allow'; await command('Fetch.continueRequest', { requestId: held.shift() });
      await until('window.__pvTransportCheck.done', 'Old transport reply finishes');
      check(await evaluate('window.__pvTransportCheck.status===401&&window.__pvTransportCheck.events===0'), 'A stale 401 cannot clear the new generation');
      await command('Fetch.disable'); intercepted = false;
      check(await evaluate(`(async()=>{const c=window.__pvTransportCheck;const r=await c.transport.sessionFetch('/api/auth/contexts');return r.status===401&&c.events===1;})()`), 'A current genuine 401 still announces expiry');
      await evaluate("window.removeEventListener('pinevela-session-expired',window.__pvTransportCheck.listener);delete window.__pvTransportCheck;true");
    }

    check(exceptions.length === 0, 'No browser runtime exception');
    const result = { passed: true, checks, authenticatedBrowser: authenticated, genuineProviderSession: authenticated,
      isolatedGuest: !authenticated, actualReplies: true, injectedReplies: false, networkInterruptionsOnly: true,
      privateCredentialsExtracted: false, accountsCreated: 0, databaseWritesRequested: false };
    const evidence = path.resolve('.security/migration-reset/browser-acceptance-20261012');
    await fs.mkdir(evidence, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(evidence, authenticated ? 'session-restoration-authenticated.json' : 'session-restoration-guest.json'), JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify(result));
  } finally {
    if (command && socket?.readyState === WebSocket.OPEN) {
      mode = 'allow';
      for (const requestId of held.splice(0)) await command('Fetch.continueRequest', { requestId }).catch(() => {});
      if (intercepted) await command('Fetch.disable').catch(() => {});
      await command('Emulation.clearDeviceMetricsOverride').catch(() => {});
      if (chrome) await command('Browser.close').catch(() => {});
    }
    for (const p of pending.values()) clearTimeout(p.timer);
    socket?.close();
    if (chrome) { if (chrome.exitCode === null) await Promise.race([once(chrome, 'exit'), pause(5000)]); if (chrome.exitCode !== null) await fs.rm(root, { recursive: true, force: true }); }
  }
})().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message, privateCredentialsExtracted: false })); process.exitCode = 1; });
