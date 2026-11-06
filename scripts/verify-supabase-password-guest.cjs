/** Recovery UI checks with an isolated guest browser and actual API replies. Never fulfill an intercepted
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

    await command('Page.navigate', {url:base+'/#/login'});
    await until("!!document.querySelector('input[aria-label=\"Email address\"]')",'Guest login');
    for(const width of [375,1440]) for(const dark of [false,true]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<600});
      await evaluate(`(()=>{const b=document.querySelector('button[role=switch][aria-label="Dark mode"]');if((b.getAttribute('aria-checked')==='true')!==${dark})b.click();return true;})()`);
      await until(`document.documentElement.dataset.theme===${JSON.stringify(dark?'dark':'light')}`,'Actual theme switch');
      const clicked=await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Forgot Password?');if(!b)return false;b.focus();b.click();return true;})()");
      check(clicked,'Recovery entry present');
      await until("!!document.querySelector('dialog[aria-label=\"Recover email password\"][open]')",'Recovery dialog');
      check(await evaluate("document.querySelector('dialog input[type=email]').required"),'Verified email input required');
      check(await evaluate("document.querySelector('dialog').querySelector('input[type=password]')===null"),'No credential proof before email stage');
      check(await evaluate("(()=>{const r=document.querySelector('dialog section').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;})()"),'Recovery fits viewport');
      check(await evaluate("document.querySelector('dialog').contains(document.activeElement)"),'Focus remains in modal');
      await evaluate("document.querySelector('button[aria-label=\"Close Recover email password\"]').click();true");
      await until("!document.querySelector('dialog[aria-label=\"Recover email password\"]')",'Close recovery');
      check(await evaluate("document.activeElement.textContent.trim()==='Forgot Password?'"),'Focus restored to recovery entry');
    }
    const rejected=await evaluate(`(async()=>{
      const r=await fetch('/api/auth/recover/complete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'andyheller2k@gmail.com',code:'not-a-recovery-proof',newPassword:'a'.repeat(32)})});
      return {status:r.status,data:await r.json()};
    })()`);
    check(rejected.status===400&&!!rejected.data.error,'Guest invalid recovery input rejected by actual server');
    const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me');return r.status;})()");
    check(me===401,'Guest recovery denial does not create authentication');
    check(exceptions.length===0,'Recovery UI raises no runtime exception');
    const result={passed:true,checks,isolatedGuest:true,actualReplies:true,injectedReplies:false,privateCredentialsExtracted:false,emailsSent:0,providerPasswordMutationVerified:false};
    const evidence=path.resolve('.security/migration-reset/browser-acceptance-20261012');
    await fs.mkdir(evidence,{recursive:true,mode:0o700});
    await fs.writeFile(path.join(evidence,'password-recovery-guest.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});
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
