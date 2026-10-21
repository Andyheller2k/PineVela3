/** Actual guest browser navigation and provider replies. No account records,
 * fake location fixes, session injection, or mocked map/routing responses. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const base = new URL(process.argv[2] || 'http://127.0.0.1:3001');
  assert(base.protocol === 'http:' && base.hostname === '127.0.0.1' && base.pathname === '/');
  const response = await fetch(new URL('/api/health', base), { signal: AbortSignal.timeout(30000) });
  assert(response.ok && (await response.json()).persistence === 'supabase', 'Use the actual Supabase application');
  const artifacts = path.resolve(__dirname, '../.security/waypoint-browser', new Date().toISOString().replace(/[:.]/g, '-'));
  await fs.mkdir(artifacts, { recursive: true, mode: 0o700 });
  const profile = await fs.mkdtemp(path.join(artifacts, 'isolated-chromium-'));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let ws, command, evaluate, id = 0, stage = 'browser startup', checks = 0, held;
  const pending = new Map(), requests = new Map(), errors = [], scenes = [];
  const check = (condition, label) => { assert(condition, label); checks++; };
  try {
    let target; const expires = Date.now() + 30000;
    while (Date.now() < expires) {
      try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(item => item.type === 'page'); } catch {}
      if (target || chrome.exitCode !== null) break; await pause(150);
    }
    check(target, 'A new real Chromium guest profile starts');
    ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const current = ++id, timer = setTimeout(() => { pending.delete(current); reject(Error(method + ' deadline')); }, 40000);
      pending.set(current, { resolve, reject, timer }); ws.send(JSON.stringify({ id: current, method, params }));
    });
    ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) { const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(Error(message.error.message)) : item.resolve(message.result); return; }
      const value = message.params;
      if (message.method === 'Runtime.exceptionThrown') errors.push({ stage, text: value.exceptionDetails.text, description: value.exceptionDetails.exception?.description, stack: value.exceptionDetails.stackTrace });
      else if (message.method === 'Network.requestWillBeSent') {
        const url = new URL(value.request.url);
        requests.set(value.requestId, { url: url.href, origin: url.origin, path: url.pathname, method: value.request.method, scene: stage });
      } else if (message.method === 'Network.responseReceived') { const request = requests.get(value.requestId); if (request) request.status = value.response.status; }
      else if (message.method === 'Network.loadingFinished') { const request = requests.get(value.requestId); if (request) request.complete = true; }
      else if (message.method === 'Network.loadingFailed') { const request = requests.get(value.requestId); if (request) { request.failed = value.errorText; request.canceled = !!value.canceled; } }
      else if (message.method === 'Fetch.requestPaused') {
        if (value.request.method === 'GET') held = value;
        else void command('Fetch.continueRequest', { requestId: value.requestId }).catch(() => {});
      }
    };
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
    // This affects only the disposable browser: actual permission denial is the
    // fallback scenario, rather than substituting a made-up physical GPS fix.
    await command('Browser.setPermission', { origin: base.origin, permission: { name: 'geolocation' }, setting: 'denied' });
    evaluate = async expression => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    async function until(expression, label, timeout = 45000) {
      const end = Date.now() + timeout;
      while (Date.now() < end) { try { if (await evaluate(expression)) return; } catch {} await pause(150); }
      throw Error(label + ' at ' + stage);
    }
    async function click(text) { await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Missing button: '+${JSON.stringify(text)});button.click()})()`); }
    async function screenshot(name) { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, name + '.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); }
    async function size(width, height) { await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 }); }
    async function open(route, width, height) {
      await size(width, height); await command('Page.navigate', { url: base.origin + '/#' + route });
      await until(route === '/' ? "!!document.querySelector('.landing-peak-page #pinemarket-section [data-public-market=preview]')" : "!!document.querySelector('.public-market-content [data-public-market=catalog]')", 'Incoming route mounts after its real exit transition');
      await until("[...document.querySelectorAll('button')].some(e=>e.textContent.trim()==='Services near you')", 'Actual market entry');
      await click('Services near you'); await until("!!document.querySelector('dialog[aria-label=\"Services near you\"] .leaflet-container')", 'Actual map opens');
      await until("document.body.innerText.includes('Location access is off.')", 'Actual device permission denial');
      check(await evaluate("(async()=> (await navigator.permissions.query({name:'geolocation'})).state==='denied')()"), 'The browser enforces real location permission denial');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Map has no page horizontal overflow');
    }
    async function mapView() {
      return evaluate(`(()=>{const e=document.querySelector('[data-map-zoom]'),r=document.querySelector('.nearby-map').getBoundingClientRect();return {lat:Number(e.dataset.mapCenterLat),lng:Number(e.dataset.mapCenterLng),zoom:Number(e.dataset.mapZoom),box:{x:r.x,y:r.y,width:r.width,height:r.height}}})()`);
    }
    function projected(point, zoom) {
      const size = 256 * 2 ** zoom, radians = point.lat * Math.PI / 180;
      return { x: (point.lng + 180) / 360 * size, y: (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * size };
    }
    function pixel(point, view) {
      const destination = projected(point, view.zoom), center = projected(view, view.zoom);
      const world = 256 * 2 ** view.zoom, dx = ((destination.x - center.x + world / 2) % world + world) % world - world / 2;
      return { x: view.box.x + view.box.width / 2 + dx, y: view.box.y + view.box.height / 2 + destination.y - center.y };
    }
    async function zoomAt(point, zoom = 14) {
      for (let step = 0; step < 30; step++) {
        const view = await mapView();
        const at = pixel(point, view);
        if (!(at.x > view.box.x + 20 && at.x < view.box.x + view.box.width - 20 && at.y > view.box.y + 20 && at.y < view.box.y + view.box.height - 20)) {
          await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: view.box.x + view.box.width / 2, y: view.box.y + view.box.height / 2, deltaX: 0, deltaY: 120 });
          await until(`Number(document.querySelector('[data-map-zoom]').dataset.mapZoom)<${view.zoom}`, 'Real map overview for chosen geographical point'); await pause(300); continue;
        }
        if (view.zoom >= zoom) return;
        await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: -240 });
        await until(`Number(document.querySelector('[data-map-zoom]').dataset.mapZoom)>${view.zoom}`, 'Real Leaflet wheel zoom');
        await pause(300);
      }
      throw Error('Map zoom did not reach a usable street level');
    }
    async function tap(point) {
      let view = await mapView(), at = pixel(point, view);
      for (let step = 0; step < 5 && (at.x <= view.box.x + 20 || at.x >= view.box.x + view.box.width - 20 || at.y <= view.box.y + 20 || at.y >= view.box.y + view.box.height - 20); step++) {
        await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: view.box.x + view.box.width / 2, y: view.box.y + view.box.height / 2, deltaX: 0, deltaY: 120 });
        await until(`Number(document.querySelector('[data-map-zoom]').dataset.mapZoom)<${view.zoom}`, 'Real zoom-out to show selected point');
        await pause(300); view = await mapView(); at = pixel(point, view);
      }
      assert(at.x > view.box.x && at.x < view.box.x + view.box.width && at.y > view.box.y && at.y < view.box.y + view.box.height, 'The selected genuine geographical point is visible');
      await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, x: at.x, y: at.y });
      await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: at.x, y: at.y });
    }
    // The scenario below selects genuine geographical points through the map UI.
    // The product controls are intentionally used rather than private React state.
    if (process.env.PINEVELA_WAYPOINT_CLOSE_ZOOM_ONLY) {
      stage = 'close while native wheel zoom is pending'; await open('/', 1440, 1000);
      const view = await mapView();
      await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: view.box.x + view.box.width / 2, y: view.box.y + view.box.height / 2, deltaX: 0, deltaY: -240 });
      await evaluate("document.querySelector('button[aria-label=\"Close services map\"]').click()");
      await pause(400); scenes.push({ name: stage });
      check(errors.length === 0, 'Pending native wheel zoom cannot access a removed map');
      return;
    }
    const start = { lat: 5.5510, lng: -.1961 }, destination = { lat: 5.5513, lng: -.1910 };
    const state = "document.querySelector('[data-route-state]')?.dataset.routeState";
    const trail = "[...document.querySelectorAll('.leaflet-overlay-pane path')].filter(e=>(e.getAttribute('d')?.match(/L/g)||[]).length>2)";
    async function routeSnapshot() {
      return evaluate(`(()=>{const e=document.querySelector('[data-route-state]');return {theme:document.documentElement.dataset.theme,routeState:e.dataset.routeState,data:{...e.dataset},roadPathCount:${trail}.length,visibleMapHeight:document.querySelector('.nearby-map').getBoundingClientRect().height,text:e.innerText}})()`);
    }
    async function chooseRoute() {
      await zoomAt(start); await click('Set starting point'); await tap(start);
      await click('Set a waypoint'); await tap(destination);
      await until(`${state}==='ready'||${state}==='error'`, 'Actual routing reply settles');
      if (await evaluate(`${state}==='error'`)) throw Error('Routing provider error: ' + (await evaluate("document.querySelector('[data-route-state]').innerText")));
      await until("!document.querySelector('.leaflet-zoom-anim')", 'Map overview animation settles'); await pause(650);
      check(await evaluate(`${trail}.length>0`), 'A multi-segment road trail is rendered on the map');
      check(await evaluate("(()=>{const m=document.querySelector('.nearby-map').getBoundingClientRect(),p=document.querySelector('[data-route-path]').getBoundingClientRect();return p.left>=m.left-2&&p.right<=m.right+2&&p.top>=m.top-2&&p.bottom<=m.bottom+2})()"), 'The complete initial road trail fits the visible map');
      const snapshot = await routeSnapshot();
      check(snapshot.data.originSource === 'manual' && Number(snapshot.data.routePoints) > 2, 'Only the selected manual origin and real decoded road geometry drive this preview');
      check(/min|hour|arrival/i.test(snapshot.text) && /\bkm\b|\bm\b/.test(snapshot.text), 'The route exposes actual travel time and distance');
      check(await evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Start following')&&e.disabled)"), 'A manual start cannot masquerade as live device tracking');
      const directions = new URL(await evaluate("document.querySelector('section[aria-label=\"Waypoint directions\"] a').href"));
      check(directions.origin === 'https://www.google.com' && directions.searchParams.get('destination') === `${snapshot.data.waypointLat},${snapshot.data.waypointLng}` && directions.searchParams.get('origin') === `${snapshot.data.originLat},${snapshot.data.originLng}` && directions.searchParams.get('travelmode') === 'walking', 'External directions use exactly the selected points and travel mode');
      check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Ready map fits the viewport');
      return snapshot;
    }
    if (process.env.PINEVELA_WAYPOINT_VISUAL_ONLY) {
      stage = 'settled dark desktop map tiles'; await open('/pinemarket', 1440, 1000);
      scenes.push({ name: stage, ...(await chooseRoute()) });
      const tilesReady = "(()=>{const tiles=[...document.querySelectorAll('.nearby-map img.leaflet-tile')];return tiles.length>0&&tiles.every(image=>image.complete&&image.naturalWidth>=128)})()";
      await until(tilesReady, 'Actual desktop map tile images finish loading', 25000);
      await pause(350); // Leaflet fades actual decoded tiles in after image load.
      check(true, 'Actual desktop tiles loaded at their native dimensions');
      await screenshot('dark-desktop-settled');
      stage = 'settled dark mobile map tiles after resize'; await size(375, 812); await pause(500); await click('Route overview');
      await until(tilesReady, 'Actual resized mobile map tile images finish loading', 25000);
      await pause(350);
      scenes.push({ name: stage, ...(await routeSnapshot()) }); check(true, 'Actual mobile tiles loaded after resize');
      await screenshot('dark-mobile-settled');
      await evaluate("document.querySelector('button[aria-label=\"Close services map\"]').click()");
      check(errors.length === 0, 'Targeted visual check has no browser exceptions');
      check(![...requests.values()].some(request => request.origin === base.origin && !['GET', 'HEAD'].includes(request.method)), 'Targeted visual check makes no application mutations');
      return;
    }
    if (!process.env.PINEVELA_WAYPOINT_LIGHT_ONLY) {
    stage = 'dark mobile genuine walking trail'; console.log(JSON.stringify({ stage })); await open('/pinemarket', 375, 812);
    check(await evaluate('document.documentElement.dataset.theme==="dark"'), 'Public market retains its real dark theme');
    scenes.push({ name: stage, ...(await chooseRoute()) }); await screenshot('dark-mobile-trail');
    await size(1440, 1000); await pause(500); check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Desktop route resize fits');
    await screenshot('dark-desktop-trail');
    stage = 'clear waypoint during actual response'; console.log(JSON.stringify({ stage, checks })); held = undefined;
    await command('Fetch.enable', { patterns: [{ urlPattern: 'https://valhalla1.openstreetmap.de/route*', requestStage: 'Response' }] });
    await click('Set a waypoint'); await tap({ lat: 5.5514, lng: -.1920 });
    const responseDeadline = Date.now() + 30000;
    while (!held && Date.now() < responseDeadline) await pause(100);
    check(held?.responseStatusCode === 200, 'Only an actual successful routing response is paused');
    check(await evaluate(`${state}==='loading'`), 'Replacement waypoint waits for its own road route');
    await click('Clear waypoint'); await until(`${state}==='idle'`, 'Clearing waypoint removes loading route');
    check(await evaluate(`${trail}.length===0`), 'Clearing removes the complete road trail');
    try { await command('Fetch.continueRequest', { requestId: held.requestId }); } catch {} held = undefined;
    await command('Fetch.disable'); await pause(700);
    check(await evaluate(`${state}==='idle'&&${trail}.length===0`), 'An old response cannot revive the cleared trail');
    await evaluate("document.querySelector('button[aria-label=\"Close services map\"]').click()");
    await until("!document.querySelector('dialog[aria-label=\"Services near you\"]')", 'Map closes');
    }
    stage = 'light desktop genuine walking trail'; console.log(JSON.stringify({ stage, checks })); await open('/', 1440, 1000);
    check(await evaluate('document.documentElement.dataset.theme==="light"'), 'Landing map retains its real light theme');
    check(await evaluate(`${state}==='idle'&&${trail}.length===0`), 'Reopening never restores an earlier private start or trail');
    scenes.push({ name: stage, ...(await chooseRoute()) }); await screenshot('light-desktop-trail');
    await size(375, 812); await pause(500);
    await click('Route overview'); await pause(500);
    check(await evaluate("(()=>{const m=document.querySelector('.nearby-map').getBoundingClientRect(),p=document.querySelector('[data-route-path]').getBoundingClientRect();return p.left>=m.left-2&&p.right<=m.right+2&&p.top>=m.top-2&&p.bottom<=m.bottom+2})()"), 'Route overview refits the complete trail after mobile resize');
    const compact = await routeSnapshot(); scenes.push({ name: 'light mobile resize', ...compact });
    check(compact.visibleMapHeight >= 140, 'Mobile route leaves a usable map area');
    check(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Light mobile route has no horizontal clipping');
    await screenshot('light-mobile-trail');
    stage = 'close while native wheel zoom is pending';
    const closingView = await mapView();
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', x: closingView.box.x + closingView.box.width / 2, y: closingView.box.y + closingView.box.height / 2, deltaX: 0, deltaY: -240 });
    await evaluate("document.querySelector('button[aria-label=\"Close services map\"]').click()");
    await until("!document.querySelector('dialog[aria-label=\"Services near you\"]')", 'Final map closes');
    await pause(400);
    check(errors.length === 0, 'Closing during pending zoom cancels every native map operation');
    check([...requests.values()].some(request => request.path === '/route' && request.status === 200 && request.complete), 'The browser used an actual successful routing provider reply');
    check([...requests.values()].some(request => request.path === '/api/auth/me' && request.status === 401), 'The real backend confirms an unsigned guest');
    check(scenes.length > 0, 'Actual waypoint browser scenarios ran');
    check(errors.length === 0, 'No uncaught browser exceptions');
    check(![...requests.values()].some(request => request.origin === base.origin && !['GET', 'HEAD'].includes(request.method)), 'Guest verification performs no application mutations');
  } catch (error) {
    process.exitCode = 1; console.error(JSON.stringify({ passed: false, stage, checks, error: error.message }));
    if (command) try { const result = await command('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(artifacts, 'failure.png'), Buffer.from(result.data, 'base64'), { mode: 0o600 }); } catch {}
  } finally {
    if (held && command) try { await command('Fetch.continueRequest', { requestId: held.requestId }); } catch {}
    const report = { passed: !process.exitCode, checks, stage, scenes, actualBrowser: !!ws, actualProviderReplies: [...requests.values()].some(request => request.origin !== base.origin && request.path === '/route' && request.status === 200 && request.complete), fakeLocationFixes: 0, accountRecordsCreated: 0, authenticatedCoverage: false, errors, requests: [...requests.values()] };
    await fs.writeFile(path.join(artifacts, 'result.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (ws?.readyState === WebSocket.OPEN) { try { await command('Browser.close'); } catch {} ws.close(); }
    for (const item of pending.values()) { clearTimeout(item.timer); item.reject(Error('Owned verification closed')); } pending.clear();
    if (chrome.exitCode === null) await Promise.race([once(chrome, 'exit'), pause(3000)]);
    if (chrome.exitCode !== null) await fs.rm(profile, { recursive: true, force: true });
    console.log(JSON.stringify({ passed: report.passed, checks, evidence: path.relative(path.resolve(__dirname, '..'), artifacts) }));
  }
}
main().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; });
