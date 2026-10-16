/** Live loopback Supabase preview, actual guest replies, isolated Chromium.
 * No fixture records, sessions, credentials, storage/cookie access or fake replies.
 * The optional map loading check holds one outgoing JS request and releases it. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1');
  await once(server, 'listening'); const port = server.address().port;
  await new Promise(resolve => server.close(resolve)); return port;
}

async function main() {
  const base = 'http://127.0.0.1:3001';
  assert.equal(process.argv.length, 2, 'Use only the existing loopback Supabase preview');
  const healthResponse = await fetch(base + '/api/health', { signal: AbortSignal.timeout(30000) });
  const health = await healthResponse.json();
  assert(healthResponse.ok && health.persistence === 'supabase', 'The real preview must use Supabase');
  const evidence = path.resolve(__dirname, '../.security/migration-reset');
  await fs.mkdir(evidence, { recursive: true, mode: 0o700 });
  // A visible home path is accessible to Snap Chromium; this is a disposable
  // profile belonging only to this verifier, never the user's browser profile.
  const profileRoot = await fs.mkdtemp(path.join(evidence, 'latency-browser-profile-'));
  const debugPort = await freePort();
  const output = path.join(evidence, 'latency-browser-guest.json');
  let chrome, socket, command, sequence = 0, mainFrame, checks = 0, stage = 'browser startup', activeScene, browserStarted = false;
  let heldMapRequest;
  const pending = new Map(), contexts = new Map(), requests = new Map();
  const scenes = [], exceptions = [], failedResources = [];
  const check = (value, label) => { assert(value, label); checks++; };
  const closePending = () => {
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Isolated browser connection ended')); }
    pending.clear();
  };
  try {
    chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
      '--no-first-run', '--disable-features=BackForwardCache', `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${path.join(profileRoot, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
    let target; const startupDeadline = Date.now() + 30000;
    while (Date.now() < startupDeadline) {
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(item => item.type === 'page'); } catch {}
      if (target || chrome.exitCode !== null) break; await pause(150);
    }
    check(target, 'An isolated actual Chromium profile starts');
    browserStarted = true;
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Browser connection timeout')), 10000);
      socket.onopen = () => { clearTimeout(timer); resolve(); };
      socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); };
    });
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, 45000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.onclose = closePending;
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = pending.get(message.id); if (!item) return;
        pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) {
          const error = new Error('Browser command rejected');
          error.contextLost = /context|navigat|destroy/i.test(message.error.message || ''); item.reject(error);
        } else item.resolve(message.result);
        return;
      }
      const data = message.params;
      if (message.method === 'Runtime.executionContextCreated') contexts.set(data.context.id, data.context);
      else if (message.method === 'Runtime.executionContextDestroyed') contexts.delete(data.executionContextId);
      else if (message.method === 'Runtime.executionContextsCleared') contexts.clear();
      else if (message.method === 'Page.frameNavigated' && !data.frame.parentId) mainFrame = data.frame.id;
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push({ scene: activeScene?.name, text: data.exceptionDetails.text });
      else if (message.method === 'Fetch.requestPaused') heldMapRequest = data.requestId;
      else if (message.method === 'Network.requestWillBeSent') {
        const url = new URL(data.request.url);
        const request = { scene: activeScene, local: url.origin === base, path: url.pathname,
          origin: url.origin, method: data.request.method, type: data.type, startedAt: data.timestamp };
        requests.set(data.requestId, request);
      } else if (message.method === 'Network.responseReceived') {
        const request = requests.get(data.requestId);
        if (request) { request.status = data.response.status; request.responseAt = data.timestamp; }
      } else if (message.method === 'Network.loadingFinished') {
        const request = requests.get(data.requestId);
        if (request) { request.encodedBytes = data.encodedDataLength; request.finishedAt = data.timestamp; }
      } else if (message.method === 'Network.loadingFailed') {
        const request = requests.get(data.requestId);
        if (request && !data.canceled) failedResources.push({ scene: request.scene?.name, local: request.local,
          origin: request.origin, path: request.local ? request.path : undefined, error: data.errorText });
      }
    };
    async function evaluate(expression) {
      const context = [...contexts.values()].find(item => item.origin === base && item.auxData?.isDefault && item.auxData.frameId === mainFrame);
      if (!context?.uniqueId) { const error = new Error('The new local document context is not ready'); error.contextLost = true; throw error; }
      const result = await command('Runtime.evaluate', { expression, uniqueContextId: context.uniqueId, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) { const error = new Error('Browser evaluation failed'); error.contextLost = /context|navigat|destroy/i.test(result.exceptionDetails.text || ''); throw error; }
      return result.result.value;
    }
    async function until(expression, label, timeout = 45000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) {
        try { if (await evaluate(expression)) return; } catch (error) { if (!error.contextLost) throw error; }
        await pause(100);
      }
      throw new Error(label + ' did not complete before the deadline');
    }
    async function waitForNetwork(predicate, label, timeout = 45000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { if (predicate()) return; await pause(100); }
      throw new Error(label + ' did not complete before the deadline');
    }
    const sceneRequests = scene => [...requests.values()].filter(item => item.scene === scene);
    const fits = 'document.documentElement.scrollWidth <= innerWidth + 1';
    const mapChunk = request => request.local && /\/NearbyServicesMap-[^/]+\.js$/.test(request.path);
    const resources = `(()=>{const resources=performance.getEntriesByType('resource');return {
      count:resources.length,transferredBytes:resources.reduce((sum,item)=>sum+item.transferSize,0),
      encodedBodyBytes:resources.reduce((sum,item)=>sum+item.encodedBodySize,0),
      localJavaScript:resources.filter(item=>new URL(item.name).origin===location.origin&&/\\.js(?:$|\\?)/.test(item.name)).map(item=>({asset:new URL(item.name).pathname,transferSize:item.transferSize,encodedBodySize:item.encodedBodySize,durationMs:Math.round(item.duration)}))};})()`;
    const routes = [
      { name: 'landing', route: '/', ready: "!!document.querySelector('#btn-login') && !!document.querySelector('[data-public-market=preview]')", data: ['/api/hostels', '/api/digital-market/products'], settled: "!document.querySelector('[data-public-market] [role=status], [data-public-residence] [role=status]')" },
      { name: 'login', route: '/login', ready: "!!document.querySelector('input[aria-label=\"Username or Email Address\"]') && !!document.querySelector('input[aria-label=Password][type=password]')", data: [], settled: 'true' },
      { name: 'residences', route: '/pineresidence', ready: "!!document.querySelector('[data-public-residence=catalog]')", data: ['/api/hostels'], settled: "!document.querySelector('[data-public-residence=catalog] [role=status]')" },
      { name: 'market', route: '/pinemarket', ready: "!!document.querySelector('[data-public-market=catalog]')", data: ['/api/digital-market/products'], settled: "!document.querySelector('[data-public-market=catalog] [role=status]')" },
    ];
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    await command('Page.bringToFront'); await command('Network.setCacheDisabled', { cacheDisabled: true });
    for (const width of [375, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
      for (const route of routes) {
        stage = route.name + ' ' + width;
        const scene = { name: stage, route: route.route, width }; scenes.push(scene); activeScene = scene;
        contexts.clear();
        const navigation = await command('Page.navigate', { url: base + `/?latencyWidth=${width}&latencyRoute=${route.name}#` + route.route });
        assert(!navigation.errorText, 'The actual local document navigates'); mainFrame = navigation.frameId;
        await until(route.ready, route.name + ' actual UI');
        scene.documentToUiReadyMs = Math.round(await evaluate('performance.now()'));
        scene.resourcesAtUiReady = await evaluate(resources);
        check(await evaluate(fits), route.name + ' fits ' + width + 'px');
        check(!await evaluate("document.body.innerText.includes('This page could not load')"), 'The lazy route has no load failure');
        await waitForNetwork(() => sceneRequests(scene).some(item => item.path === '/api/auth/me' && item.status === 401), 'Actual unsigned session denial');
        check(true, 'The real backend confirms this is a guest');
        for (const endpoint of route.data) {
          await waitForNetwork(() => sceneRequests(scene).some(item => item.path === endpoint && item.status === 200 && item.finishedAt), endpoint + ' actual successful read');
        }
        await until(route.settled, 'Actual catalog read settles');
        scene.documentToRequiredReadsReadyMs = Math.round(await evaluate('performance.now()'));
        scene.resourcesAtRequiredReadsReady = await evaluate(resources);
        check(!sceneRequests(scene).some(mapChunk), 'Optional services map JavaScript is absent before opening it');
        check(!await evaluate("!!document.querySelector('[data-public-market] [role=alert], [data-public-residence] [role=alert]')"), 'Native public data reads show no error');
        if (route.name === 'login') {
          check(await evaluate("(()=>{const form=document.querySelector('input[aria-label=\"Username or Email Address\"]').closest('form');form.requestSubmit();return !form.checkValidity();})()"), 'Blank credentials remain native-invalid');
        }
        if (route.name === 'market') {
          const openMap = "[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Services near you').click()";
          if (width === 375) {
            heldMapRequest = undefined;
            await command('Fetch.enable', { patterns: [{ urlPattern: base + '/assets/NearbyServicesMap-*.js', requestStage: 'Request' }] });
            await evaluate(openMap);
            await waitForNetwork(() => Boolean(heldMapRequest), 'Only the outgoing real lazy map request is held', 10000);
            await until("document.querySelector('dialog[aria-label=\"Services near you\"] [role=status]')?.innerText==='Loading services map…'", 'Honest lazy map loading state');
            check(await evaluate(fits), 'The lazy map loading dialog fits the small viewport');
            await evaluate("[...document.querySelectorAll('dialog[aria-label=\"Services near you\"] button')].find(item=>item.textContent==='Close services map').click()");
            await until("!document.querySelector('dialog[aria-label=\"Services near you\"]')", 'Loading map can be closed');
            check(true, 'The user can close the actual map while its JavaScript is still loading');
            await command('Fetch.continueRequest', { requestId: heldMapRequest }); heldMapRequest = undefined;
            await command('Fetch.disable');
            await waitForNetwork(() => sceneRequests(scene).some(item => mapChunk(item) && item.status === 200 && item.finishedAt), 'Actual map module downloads after releasing its request');
          }
          const mapStart = await evaluate('performance.now()');
          await evaluate(openMap);
          await until("!!document.querySelector('dialog[aria-label=\"Services near you\"] .leaflet-container')", 'The actual map renders');
          scene.mapOpenToReadyMs = Math.round(await evaluate('performance.now()') - mapStart);
          scene.mapModulePreloadedForLoadingCloseCheck = width === 375;
          check(await evaluate(fits), 'The actual map fits ' + width + 'px');
          check(await evaluate("(()=>{const box=document.querySelector('dialog[aria-label=\"Services near you\"] .leaflet-container').getBoundingClientRect();return box.width>0&&box.height>0;})()"), 'The actual map has a visible usable area');
          await evaluate("document.querySelector('button[aria-label=\"Close services map\"]').click()");
          await until("!document.querySelector('dialog[aria-label=\"Services near you\"]')", 'Actual map closes');
          check(true, 'The actual optional map opens and closes');
        }
        console.log(JSON.stringify({ stage, documentToUiReadyMs: scene.documentToUiReadyMs,
          documentToRequiredReadsReadyMs: scene.documentToRequiredReadsReadyMs, checks }));
      }
    }
    check(![...requests.values()].some(item => item.local && !['GET', 'HEAD'].includes(item.method)), 'No application mutation was requested');
    check(![...requests.values()].some(item => item.local && item.path === '/api/sync/events'), 'Unsigned guests never start or retry an authenticated-only event stream');
    check(exceptions.length === 0, 'No browser runtime exception occurred');
    check(!failedResources.some(item => item.local && /\.js$/.test(item.path || '')), 'All requested application JavaScript loaded successfully');
  } catch (error) {
    process.exitCode = 1; console.error(JSON.stringify({ passed: false, stage, checks, error: error.message }));
  } finally {
    const result = { passed: !process.exitCode, checks, stage, actualBrowser: browserStarted,
      actualNativeReplies: [...requests.values()].some(item => item.path === '/api/auth/me' && item.status === 401),
      isolatedGuestProfile: true, cacheDisabled: true, providerMocks: 0, cloudRecordMutations: 0,
      authenticatedBrowserTested: false, note: 'Observed current-run timings, not a pre/post browser benchmark. Resource bytes are browser-reported; cross-origin timing restrictions may omit sizes.',
      scenes: scenes.map(scene => ({ ...scene, localRequests: sceneRequestsForResult(scene) })), exceptions, failedResources };
    function sceneRequestsForResult(scene) { return [...requests.values()].filter(item => item.scene === scene && item.local).map(({ scene: ignored, origin: ignoredOrigin, local: ignoredLocal, ...request }) => request); }
    await fs.writeFile(output, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
    if (socket?.readyState === WebSocket.OPEN) {
      if (heldMapRequest) { try { await command('Fetch.continueRequest', { requestId: heldMapRequest }); } catch {} }
      try { await command('Browser.close'); } catch {} socket.close();
    }
    closePending();
    if (chrome?.exitCode === null) await Promise.race([once(chrome, 'exit'), pause(3000)]);
    if (chrome?.exitCode !== null) await fs.rm(profileRoot, { recursive: true, force: true }).catch(() => {
      console.log(JSON.stringify({ disposableProfileCleanup: false, path: path.relative(path.resolve(__dirname, '..'), profileRoot) }));
    });
    console.log(JSON.stringify({ passed: result.passed, checks, evidence: path.relative(path.resolve(__dirname, '..'), output), authenticatedBrowserTested: false }));
  }
}
main().catch(error => { console.error(JSON.stringify({ passed: false, stage: 'startup', code: error.cause?.code || error.code || error.name, error: 'Live guest latency verification could not start.' })); process.exitCode = 1; });
