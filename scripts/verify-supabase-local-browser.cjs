/** Test-only browser coverage against the private owned local GoTrue stack.
 * Sign-in uses the actual application form. No cookies, JWTs or provider replies
 * are created, copied, read or replaced. All credentials come from one private
 * run-owned fixture and are never written to output or diagnostics. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

async function privateJson(file) {
  const stat = await fs.lstat(file);
  assert(stat.isFile() && !stat.isSymbolicLink() && !(stat.mode & 0o077) && stat.size < 1024 * 1024, 'A private local-test file is required');
  const handle = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { return JSON.parse(await handle.readFile('utf8')); } finally { await handle.close(); }
}
function localOrigin(raw, protocol = 'http:') {
  const url = new URL(raw);
  assert(url.protocol === protocol && url.hostname === '127.0.0.1' && url.port && Number(url.port) >= 1024
    && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash,
    'Only an explicit local-test origin is accepted');
  return url.origin;
}
async function fixtureFrom(file) {
  assert(path.isAbsolute(file), 'Pass the absolute private local browser fixture path');
  const fixture = await privateJson(file);
  assert(fixture.version === 1 && UUID.test(fixture.runId) && fixture.databaseOwned === true
    && path.isAbsolute(fixture.metadataPath), 'Only a real owned disposable run is accepted');
  const meta = await privateJson(fixture.metadataPath);
  assert(meta.version === 1 && meta.runId === fixture.runId && meta.databaseOwned === true
    && path.isAbsolute(meta.root) && meta.root.startsWith('/tmp/') && path.resolve(meta.root) === meta.root
    && fixture.metadataPath.startsWith(meta.root + path.sep) && file.startsWith(meta.root + path.sep),
    'Browser fixtures and stack metadata must belong to the same private temporary run');
  const root = await fs.lstat(meta.root);
  assert(root.isDirectory() && !root.isSymbolicLink() && !(root.mode & 0o077) && await fs.realpath(meta.root) === meta.root,
    'A private disposable run directory is required');
  const base = localOrigin(fixture.origin);
  assert(!['3000', '3001', '9222'].includes(new URL(base).port), 'Never connect this dummy-account verifier to an existing product preview');
  localOrigin(meta.apiUrl); localOrigin(meta.mailUrl);
  const database = new URL(meta.databaseUrl);
  assert(database.protocol === 'postgresql:' && database.hostname === '127.0.0.1' && database.port, 'The fixture database must be local');
  const marker = fixture.runId.replaceAll('-', '');
  const expectedRoles = { primary: 'user', resident: 'student', seller: 'merchant', manager: 'manager',
    staffA: 'staff', staffB: 'staff', administrator: 'admin', officer: 'verification_team' };
  for (const [key, role] of Object.entries(expectedRoles)) {
    const actor = fixture.roles?.[key];
    assert(actor && actor.role === role && UUID.test(actor.contextId) && typeof actor.email === 'string'
      && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(actor.email)
      && actor.email.split('@')[0].toLowerCase().includes(marker)
      && typeof actor.password === 'string' && actor.password.length >= 8
      && typeof actor.name === 'string' && actor.name.length >= 3
      && typeof actor.readyText === 'string' && actor.readyText.length >= 3, 'Each role requires an actual run-owned verified identity and visible marker');
    if (actor.portalPin !== undefined) assert(/^[0-9]{6,12}$/.test(actor.portalPin) && ['resident', 'seller'].includes(actor.accountKind), 'Only actual resident/seller portal PINs are supported');
  }
  assert(fixture.roles.staffA.contextId !== fixture.roles.staffB.contextId, 'Staff account isolation needs two actual contexts');
  if (fixture.publicStoreId !== undefined) assert(UUID.test(fixture.publicStoreId), 'Use an actual saved local public store UUID');
  return { fixture, meta, base };
}
async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}

async function main() {
  assert(process.argv.length === 3, 'Pass one private browser fixture file');
  const { fixture, meta, base } = await fixtureFrom(process.argv[2]);
  const health = await (await fetch(base + '/api/health', { signal: AbortSignal.timeout(10000) })).json();
  assert(health.persistence === 'supabase', 'Only the running native local application is supported');
  const artifactRoot = path.resolve(__dirname, '../.security/migration-reset');
  await fs.mkdir(artifactRoot, { recursive: true, mode: 0o700 });
  const profile = await fs.mkdtemp(path.join(artifactRoot, 'local-role-browser-profile-'));
  const debugPort = await freePort();
  let chrome, socket, sequence = 0, mainFrame, stage = 'browser startup', checks = 0, currentScene, currentRole, verifiedNativeLogins = 0;
  let command, blockPath, blockMode, blockedCount = 0, blockMethod = 'GET';
  const heldResponseStatuses = [];
  const contexts = new Map(), pending = new Map(), requests = [], exceptions = [], scenes = [], held = new Set();
  const check = (value, label) => { assert(value, label); checks++; };
  const rejectPending = () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error('Isolated browser connection ended')); } pending.clear(); };
  try {
    chrome = spawn('/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--no-first-run',
      '--disable-features=BackForwardCache', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(profile, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
    let target; const end = Date.now() + 30000;
    while (Date.now() < end) {
      try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(1000) })).json()).find(item => item.type === 'page'); } catch {}
      if (target || chrome.exitCode !== null) break; await pause(150);
    }
    check(target, 'An isolated actual Chromium profile starts');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('Browser connection timeout')), 10000);
      socket.onopen = () => { clearTimeout(timer); resolve(); }; socket.onerror = () => { clearTimeout(timer); reject(new Error('Browser connection failed')); }; });
    command = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(method + ' timeout')); }, 45000);
      pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
    });
    socket.onclose = rejectPending;
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = pending.get(message.id); if (!item) return; pending.delete(message.id); clearTimeout(item.timer);
        if (message.error) { const error = new Error('Browser command rejected'); error.contextLost = /context|navigat|destroy/i.test(message.error.message || ''); item.reject(error); }
        else item.resolve(message.result); return;
      }
      const data = message.params;
      if (message.method === 'Runtime.executionContextCreated') contexts.set(data.context.id, data.context);
      else if (message.method === 'Runtime.executionContextDestroyed') contexts.delete(data.executionContextId);
      else if (message.method === 'Runtime.executionContextsCleared') contexts.clear();
      else if (message.method === 'Page.frameNavigated' && !data.frame.parentId) mainFrame = data.frame.id;
      else if (message.method === 'Runtime.exceptionThrown') exceptions.push({ scene: currentScene, text: data.exceptionDetails.text });
      else if (message.method === 'Network.requestWillBeSent') {
        const url = new URL(data.request.url); if (url.origin !== base || !url.pathname.startsWith('/api/')) return;
        requests.push({ scene: currentScene, id: data.requestId, path: url.pathname, method: data.request.method, started: data.timestamp });
      } else if (message.method === 'Network.responseReceived') {
        const request = requests.findLast(item => item.id === data.requestId);
        if (request) { request.status = data.response.status; request.durationMs = Math.round((data.timestamp - request.started) * 1000); }
      } else if (message.method === 'Fetch.requestPaused') {
        if (blockPath && new URL(data.request.url).pathname === blockPath && data.request.method === blockMethod) {
          blockedCount++;
          if (blockMode === 'hold') { held.add(data.requestId); heldResponseStatuses.push(data.responseStatusCode); }
          else void command('Fetch.failRequest', { requestId: data.requestId, errorReason: 'ConnectionFailed' }).catch(() => {});
        } else void command('Fetch.continueRequest', { requestId: data.requestId }).catch(() => {});
      }
    };
    async function evaluate(expression) {
      const context = [...contexts.values()].find(item => item.origin === base && item.auxData?.isDefault && item.auxData.frameId === mainFrame);
      if (!context?.uniqueId) { const error = new Error('Local document context is not ready'); error.contextLost = true; throw error; }
      const result = await command('Runtime.evaluate', { expression, uniqueContextId: context.uniqueId, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) {
        const description = result.exceptionDetails.exception?.description || result.exceptionDetails.text || '';
        const controlled = ['Actual sign-out control missing', 'Actual sign-out confirmation button missing', 'Required native form field missing'].find(item => description.includes(item));
        const error = new Error(controlled || 'Local browser evaluation failed'); error.contextLost = /context.*(?:lost|destroy|ready)|navigat/i.test(description); throw error;
      }
      return result.result.value;
    }
    async function until(expression, label, timeout = 45000) {
      const expires = Date.now() + timeout;
      while (Date.now() < expires) { try { if (await evaluate(expression)) return; } catch (error) { if (!error.contextLost) throw error; } await pause(100); }
      throw new Error(label + ' did not become ready');
    }
    async function networkUntil(predicate, label, timeout = 45000) {
      const expires = Date.now() + timeout;
      while (Date.now() < expires) { if (predicate()) return; await pause(100); }
      throw new Error(label + ' did not complete');
    }
    async function navigate(route) {
      const target = new URL(route, base); assert(target.origin === base, 'Only the owned local app may be navigated');
      // Runtime clears contexts on real document replacement. A navigation to
      // the existing login URL may be same-document and keep that valid context.
      const result = await command('Page.navigate', { url: target.href }); assert(!result.errorText, 'Local application navigation succeeds'); mainFrame = result.frameId;
      await until(`location.href===${JSON.stringify(target.href)}&&document.readyState==='complete'`, 'Actual local document');
    }
    const fill = (selector, value) => evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw Error('Required native form field missing');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const routeFor = { primary: '/user/dashboard', resident: '/resident/dashboard', seller: '/digital-market', manager: '/manager/dashboard',
      staffA: '/staff/dashboard', staffB: '/staff/dashboard', administrator: '/admin/dashboard', officer: '/field-officer' };
    const roleRoutes = { user: '/user/dashboard', student: '/resident/dashboard', merchant: '/digital-market', manager: '/manager/dashboard',
      staff: '/staff/dashboard', admin: '/admin/dashboard', verification_team: '/field-officer' };
    const foreignApi = { primary: '/api/manager/my-hostel', resident: '/api/admin/governance', seller: '/api/manager/my-hostel',
      manager: '/api/admin/governance', staffA: '/api/manager/my-hostel', staffB: '/api/manager/my-hostel', administrator: '/api/auth/portal-security', officer: '/api/manager/my-hostel' };
    const requiredReads = { primary: ['/api/student/my-profile', '/api/users/my-registered-accounts', '/api/digital-market/my-orders'],
      resident: ['/api/student/my-rooms', '/api/issue-reports'], seller: ['/api/digital-market/status', '/api/digital-market/inventory', '/api/digital-market/my-orders'],
      manager: ['/api/manager/my-hostel', '/api/staff', '/api/issue-reports'], staffA: ['/api/staff', '/api/staff-bargains', '/api/issue-reports'],
      staffB: ['/api/staff', '/api/staff-bargains', '/api/issue-reports'], administrator: ['/api/admin/dashboard-directories'],
      officer: ['/api/verification-team/my-inspections'] };
    const hasText = value => `document.body.innerText.includes(${JSON.stringify(value)})`;
    const fits = 'document.documentElement.scrollWidth<=innerWidth+1';
    const ready = actor => `${hasText(actor.readyText)}&&!document.body.innerText.includes('Syncing Operational State')&&!document.querySelector('[data-route-skeleton],[data-route-loading-retry]')`;
    async function dismissWelcome() {
      await evaluate(`(()=>{for(const dialog of document.querySelectorAll('dialog[open]')){if(!/Welcome to PineVela|Welcome to your/.test(dialog.getAttribute('aria-label')||''))continue;const close=dialog.querySelector('button[aria-label="Close dialog"]');close?.click();}})()`);
    }
    async function signIn(key, { failRead = false } = {}) {
      stage = 'native login ' + key; currentScene = stage; currentRole = key;
      const actor = fixture.roles[key];
      await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
      const guestStart = requests.length;
      await navigate('/?localBrowserRun=' + fixture.runId + '#/login');
      await until("!!document.querySelector('input[aria-label=\"Username or Email Address\"]')", 'Actual login form');
      check(!requests.slice(guestStart).some(item => item.path === '/api/sync/events'), 'The actual guest login page opens no authenticated event stream');
      const started = await evaluate('performance.now()'), requestStart = requests.length;
      await fill('input[aria-label="Username or Email Address"]', actor.email);
      await fill('input[aria-label="Password"]', actor.password);
      await evaluate("document.querySelector('input[aria-label=\"Username or Email Address\"]').closest('form').requestSubmit()");
      if (actor.portalPin) {
        await until("!!document.querySelector('#login-portal-pin')", 'Actual shared-email portal choice');
        await evaluate(`(()=>{const select=document.querySelector('#login-portal');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(select,${JSON.stringify(actor.accountKind)});select.dispatchEvent(new Event('change',{bubbles:true}));})()`);
        await fill('#login-portal-pin', actor.portalPin);
        await evaluate("document.querySelector('#login-portal-pin').closest('form').requestSubmit()");
      }
      await until(`location.hash.split('?')[0]===${JSON.stringify('#' + routeFor[key])}`, 'Actual role-specific login destination');
      await dismissWelcome();
      const identity = await evaluate(`(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(30000)});const me=await r.json();return {status:r.status,role:me.role,id:me.id,email:me.email,isVerified:me.isVerified};})()`);
      check(identity.status === 200 && identity.role === actor.role && identity.id === actor.contextId && identity.email === actor.email && identity.isVerified, 'The actual native login matches this local verified role/context');
      verifiedNativeLogins++;
      check(requests.slice(requestStart).some(item => item.path === '/api/auth/login' && item.method === 'POST' && item.status === 200), 'Actual login form receives a genuine native success');
      if (!failRead) await until(ready(actor), 'Actual saved portal content');
      const loginToDestinationMs = Math.round(await evaluate('performance.now()') - started);
      if (!failRead) {
        await networkUntil(() => requiredReads[key].filter(endpoint => endpoint !== blockPath).every(endpoint =>
          requests.slice(requestStart).some(item => item.path === endpoint && item.method === 'GET' && item.status === 200)), 'Actual required native portal reads');
        check(true, 'The portal receives genuine successful owned API projections');
      }
      const registrationRequests = requests.slice(requestStart).filter(item => item.path === '/api/users/my-registered-accounts');
      if (key === 'primary' && !failRead) {
        check(registrationRequests.length === 1, 'Primary dashboard and notifications share one initial registration read');
      }
      if (key === 'administrator' && !failRead) {
        const reads = requests.slice(requestStart);
        check(reads.filter(item => item.path === '/api/admin/dashboard-directories' && item.method === 'GET').length === 1,
          'Administrator dashboard uses one bulk directory read');
        check(!reads.some(item => ['/api/admin/hostels', '/api/admin/manager-restrictions', '/api/board-requests', '/api/activities',
          '/api/admin/digital-market/applications', '/api/admin/digital-market/stores', '/api/admin/payments', '/api/admin/all-users'].includes(item.path)),
          'Administrator dashboard does not fan out eight individual directory requests');
      }
      return { key, loginToDestinationMs, nativeReadsReadyMs: failRead ? null : Math.round(await evaluate('performance.now()') - started), actualRole: actor.role,
        ...(key === 'primary' ? { initialRegistrationRequests: registrationRequests.length } : {}) };
    }
    async function signOut() {
      stage = 'native logout ' + currentRole; currentScene = stage;
      const started = requests.length;
      // Hold only delivery of a genuine successful logout, proving the UI
      // responds while confirmation is pending without inventing an API reply.
      const heldLogout = currentRole === 'administrator' && !blockPath;
      if(heldLogout){
        blockPath='/api/auth/logout';blockMode='hold';blockMethod='POST';
        await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/auth/logout',requestStage:'Response'}]});
      }
      await evaluate(`(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.getClientRects().length&&(/^(?:sign|log) out$/i.test(item.textContent.trim())||/(?:sign|log) out/i.test(item.getAttribute('title')||'')));if(!button)throw Error('Actual sign-out control missing');button.click();})()`);
      await until("[...document.querySelectorAll('dialog[open]')].some(dialog=>/sign out/i.test(dialog.innerText))", 'Actual sign-out confirmation');
      await evaluate(`(()=>{const dialog=[...document.querySelectorAll('dialog[open]')].find(item=>/sign out/i.test(item.innerText));const button=[...dialog.querySelectorAll('button')].find(item=>/^sign out$/i.test(item.textContent.trim()));if(!button)throw Error('Actual sign-out confirmation button missing');button.click();})()`);
      if(heldLogout){
        await until("!!document.querySelector('dialog[open][aria-label=\"Signing out\"] [role=status]')",'Logout gives immediate pending feedback',2000);
        check(true,'Sign-out feedback appears before the HTTP confirmation is delivered');
        await networkUntil(()=>held.size>0,'Actual logout response is held');
        check(heldResponseStatuses.at(-1)===200,'Held logout is a genuine confirmed native revocation');
        await evaluate("document.querySelector('dialog[aria-label=\"Signing out\"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))");
        check(await evaluate("!!document.querySelector('dialog[open][aria-label=\"Signing out\"]')"),'Pending logout cannot be dismissed into the private workspace');
        check(requests.slice(started).filter(item=>item.path==='/api/auth/logout').length===1,'Pending sign-out sends only one request');
        for(const id of held){await command('Fetch.continueRequest',{requestId:id});held.delete(id);}
        blockPath=undefined;blockMethod='GET';await command('Fetch.disable');
      }
      await networkUntil(() => requests.slice(started).some(item => item.path === '/api/auth/logout' && item.method === 'POST' && item.status === 200), 'Actual native logout response');
      // Resident logout intentionally returns to the public landing page;
      // other portals return to login. Both must clear the native session.
      await until("['/','/login'].includes(location.hash.slice(1).split('?')[0]||'/')&&!document.querySelector('[data-route-skeleton]')", 'Native logout returns to a guest page');
      const status = await evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(30000)});return r.status;})()");
      check(status === 401, 'Native logout revokes the actual cookie session');
      check(true, 'The actual local UI signs out its native session');
    }
    async function setTheme(theme) {
      await until("!!document.querySelector('[role=switch][aria-label=\"Dark mode\"]')", 'Actual theme control');
      if (await evaluate('document.documentElement.dataset.theme') !== theme)
        await evaluate("document.querySelector('[role=switch][aria-label=\"Dark mode\"]').click()");
      await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)}`, 'Actual theme change');
      check(await evaluate(`document.querySelector('[role=switch][aria-label="Dark mode"]').getAttribute('aria-checked')===${JSON.stringify(String(theme === 'dark'))}`), 'Rendered mode and theme switch agree');
    }
    async function startFailure(endpoint, mode = 'fail') {
      blockPath = endpoint; blockMode = mode; blockedCount = 0; heldResponseStatuses.length = 0;
      await command('Fetch.enable', { patterns: [{ urlPattern: base + endpoint, requestStage: mode === 'hold' ? 'Response' : 'Request' }] });
    }
    async function releaseFailures() {
      blockPath = undefined; blockMode = undefined;
      for (const requestId of held) { try { await command('Fetch.continueRequest', { requestId }); } catch {} }
      held.clear(); await command('Fetch.disable');
    }
    await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable'); await command('Page.bringToFront');
    for (const key of ['primary', 'resident', 'seller', 'manager', 'staffA', 'staffB', 'administrator', 'officer']) {
      const actor = fixture.roles[key], scene = await signIn(key); scenes.push(scene);
      for (const width of [375, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
        for (const theme of ['light', 'dark']) {
          stage = key + ' ' + width + ' ' + theme; currentScene = stage;
          await setTheme(theme); await dismissWelcome();
          check(await evaluate(fits), 'Actual role portal fits this viewport/mode');
          check(!await evaluate(hasText('This page could not load')), 'The portal route has no runtime load fallback');
          // Some compact headers intentionally hide the full account name.
          // Its current mounted workspace must still contain the same marker.
          check(await evaluate(`document.body.textContent.includes(${JSON.stringify(actor.readyText)})`), 'The mounted workspace retains the current account marker');
        }
        if (width === 1440 && ['primary', 'manager', 'staffA', 'resident', 'administrator'].includes(key)) {
          const topControl = await evaluate("[...document.querySelectorAll('button[title=\"Use top navigation\"],button[title=\"Hide sidebar\"]')].some(item=>item.getClientRects().length>0)");
          if (topControl) {
            await evaluate("[...document.querySelectorAll('button[title=\"Use top navigation\"],button[title=\"Hide sidebar\"]')].find(item=>item.getClientRects().length>0).click()");
            await until("[...document.querySelectorAll('button[title=\"Show sidebar\"]')].some(item=>item.getClientRects().length>0)", 'Actual top navigation');
            check(await evaluate(fits), 'Top navigation fits the desktop portal');
            await evaluate("[...document.querySelectorAll('button[title=\"Show sidebar\"]')].find(item=>item.getClientRects().length>0).click()");
            check(await evaluate(fits), 'Sidebar navigation returns without overflow');
            scene.desktopNavigationVariants = ['sidebar', 'top'];
          } else scene.desktopNavigationVariants = ['current visible layout; no switch exposed'];
        }
      }
      if (key === 'administrator') {
        const directory = await evaluate("(async()=>{const r=await fetch('/api/admin/all-users',{signal:AbortSignal.timeout(30000)});const data=await r.json();return {status:r.status,totalUsers:data.totalUsers,managers:data.breakdown?.managers};})()");
        check(directory.status === 200 && Number.isInteger(directory.totalUsers) && Number.isInteger(directory.managers), 'Actual administrator directory supplies authoritative counts');
        const metric = label => `(()=>{const label=[...document.querySelectorAll('main span')].find(item=>item.textContent.trim()===${JSON.stringify(label)});return label?.parentElement.parentElement.querySelector('.text-3xl')?.textContent.trim();})()`;
        await until(`${metric('Registered Managers')}===${JSON.stringify(String(directory.managers))}&&${metric('All Registered User Accounts')}===${JSON.stringify(String(directory.totalUsers))}`, 'Administrator metrics match actual native directory counts');
        check(true, 'Displayed administrator totals use actual saved contexts without synthetic additions');
        scene.nativeDirectoryCountsVerified = true;
      }
      if (key === 'manager') {
        const location = await evaluate("(async()=>{const r=await fetch('/api/manager/my-hostel',{signal:AbortSignal.timeout(30000)});const data=await r.json();return {status:r.status,latitude:data.hostel?.latitude,longitude:data.hostel?.longitude};})()");
        check(location.status === 200 && location.latitude != null && location.longitude != null
          && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude)), 'The actual saved property supplies map coordinates');
        await evaluate("[...document.querySelectorAll('button[title=\"My Properties\"]')].find(item=>item.getClientRects().length).click()");
        const coordinates = `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`;
        await until(hasText('Registered Property Dossier') + '&&' + hasText(coordinates), 'Property dossier shows its actual saved coordinates');
        check(!await evaluate(hasText('GA-183-9022')), 'The property dossier has no invented digital address');
        for (const width of [375, 1440]) {
          await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
          for (const theme of ['light', 'dark']) { await setTheme(theme); check(await evaluate(fits), 'The actual property dossier fits viewport and theme'); }
        }
        scene.nativePropertyCoordinatesVerified = true;
      }
      // Copying a foreign portal URL must not mount its dashboard or run its
      // private business reads. Direct API denial independently proves authority.
      for (const [role, route] of Object.entries(roleRoutes)) {
        if (role === actor.role) continue;
        stage = key + ' denied ' + role; currentScene = stage;
        await evaluate(`location.hash=${JSON.stringify('#' + route)}`);
        await until("document.body.innerText.includes('Access Denied')", 'Actual wrong-role portal denial');
        check(await evaluate(fits), 'Wrong-role notice fits the viewport');
        check(!await evaluate(hasText(actor.readyText) + '&&!!document.querySelector("[data-page-tabs]")'), 'A wrong-role portal does not retain the previous workspace');
      }
      const forbidden = await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(foreignApi[key])},{signal:AbortSignal.timeout(30000)});return {status:r.status};})()`);
      check(forbidden.status === 403, 'The native API independently rejects the wrong role');
      if (key === 'primary' && fixture.publicStoreId) {
        await evaluate(`location.hash=${JSON.stringify('#/pinemarket/stores/' + fixture.publicStoreId)}`);
        await until(`!!document.querySelector('[data-market-storefront="${fixture.publicStoreId}"]')`, 'Actual local public storefront');
        await evaluate("document.querySelector('button[aria-label=\"Message store\"]').click()");
        await until("!!document.querySelector('dialog[aria-label^=\"Message \"] section[aria-label=\"Seller messages\"]')", 'Actual buyer-to-seller inbox');
        check(await evaluate(fits), 'Actual storefront message dialog fits the current viewport');
        await evaluate("document.querySelector('button[aria-label=\"Close store messages\"]').click()");
        await until("!document.querySelector('dialog[aria-label^=\"Message \"]')", 'Actual storefront message dialog closes');
        check(true, 'The native store ID can open and close buyer-to-seller messages without a public owner email');
        scene.publicStoreMessagingTested = true;
      }
      await evaluate(`location.hash=${JSON.stringify('#' + routeFor[key])}`);
      await until(ready(actor), 'Own role portal after denied routes'); await dismissWelcome();
      scene.reloadDocumentStartedAt = await evaluate('performance.timeOrigin');
      await command('Page.reload', { ignoreCache: true });
      await until(`performance.timeOrigin!==${scene.reloadDocumentStartedAt}&&(${ready(actor)})`, 'Actual reload retains the signed-in role and saved portal');
      check(true, 'Reload restores the actual native role portal');
      console.log(JSON.stringify({ stage: key + ' portal complete', checks, loginToDestinationMs: scene.loginToDestinationMs }));
      await signOut();
    }
    for (const scenario of [
      { key: 'seller', endpoint: '/api/digital-market/status', retry: 'Retry seller account', falseEmpty: 'Mandatory First-Time Store Activation' },
      { key: 'officer', endpoint: '/api/verification-team/my-inspections', retry: 'Retry inspection assignments', falseEmpty: 'No Dispatches in Queue' },
      { key: 'administrator', endpoint: '/api/admin/dashboard-directories', retry: 'Retry administrator directories', falseEmpty: 'No Residences Registered Yet' },
    ]) {
      stage = scenario.key + ' native read recovery'; currentScene = stage;
      await startFailure(scenario.endpoint);
      await signIn(scenario.key, { failRead: true });
      await until(hasText(scenario.retry), 'Visible native read failure with retry');
      check(blockedCount >= 1, 'An actual outgoing request failed at the network boundary');
      check(await evaluate(`location.hash.split('?')[0]===${JSON.stringify('#' + routeFor[scenario.key])}`), 'Read failure preserves the current portal route');
      check(!await evaluate(hasText(scenario.falseEmpty)), 'Read failure is not shown as onboarding or an empty queue');
      for (const width of [375, 1440]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
        for (const theme of ['light', 'dark']) { await setTheme(theme); check(await evaluate(fits), 'Failure/retry layout fits viewport and mode'); }
      }
      await releaseFailures(); const retryStart = requests.length;
      await evaluate(`[...document.querySelectorAll('button')].find(item=>item.textContent.trim()===${JSON.stringify(scenario.retry)}).click()`);
      await networkUntil(() => requests.slice(retryStart).some(item => item.path === scenario.endpoint && item.status === 200), 'Genuine native response after retry');
      await until(ready(fixture.roles[scenario.key]) + '&&!(' + hasText(scenario.retry) + ')', 'Saved portal content recovers');
      check(true, 'Retry consumes an actual successful native response'); await signOut();
    }
    // Withhold a genuine successful bulk reply past the unchanged thirty-second
    // request deadline. Cancellation must yield clear feedback and one fresh retry.
    stage = 'administrator directory deadline'; currentScene = stage;
    await startFailure('/api/admin/dashboard-directories', 'hold'); await signIn('administrator', { failRead: true });
    await networkUntil(() => held.size > 0, 'Actual bulk directories are awaiting browser delivery');
    check(heldResponseStatuses.includes(200), 'The withheld directory read is a genuine native success');
    await until(hasText('Administrator directories took too long to load. Please retry.'), 'Readable administrator deadline feedback');
    check(blockedCount === 1, 'The directory deadline retains one pending read instead of overlapping polls');
    check(!await evaluate(hasText('No Residences Registered Yet')), 'A timed-out directory is not an empty residence list');
    check(!await evaluate(hasText('signal timed out')), 'Raw browser timeout text is replaced by actionable feedback');
    await releaseFailures(); const directoryRetryStart = requests.length;
    await evaluate("[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Retry administrator directories').click()");
    await networkUntil(() => requests.slice(directoryRetryStart).some(item => item.path === '/api/admin/dashboard-directories' && item.status === 200), 'Fresh native directory request after the deadline');
    await until(ready(fixture.roles.administrator) + '&&!(' + hasText('Retry administrator directories') + ')', 'Saved administrator directories recover after deadline');
    check(true, 'A timed-out read recovers with a new genuine bulk response'); await signOut();
    // Withhold an actual successful response past the seller's ten-second poll.
    // The next poll must join the existing read, then consume the genuine reply.
    stage = 'seller slow read coalescing'; currentScene = stage;
    await startFailure('/api/digital-market/status', 'hold'); await signIn('seller', { failRead: true });
    await networkUntil(() => held.size > 0, 'Actual seller status is awaiting browser delivery');
    check(heldResponseStatuses.includes(200), 'The slow seller read has a genuine native success');
    await pause(11000);
    check(blockedCount === 1, 'A seller poll joins the existing slow status read');
    await releaseFailures();
    await until(ready(fixture.roles.seller), 'Actual seller data loads after the held response resumes');
    check(true, 'The original slow seller response remains usable'); await signOut();
    // Keep an old staff read pending while performing actual logout/login, then
    // return to the same staff route. No in-place account switch UI is invented.
    stage = 'staff identity switch and stale read'; currentScene = stage;
    await startFailure('/api/issue-reports', 'hold'); await signIn('staffA');
    await networkUntil(() => held.size > 0, 'Actual old staff work read is pending');
    check(heldResponseStatuses.includes(200), 'The old staff read has a genuine native success withheld before browser delivery');
    check(await evaluate(hasText(fixture.roles.staffA.readyText)), 'First actual staff context is rendered');
    await pause(8500);
    check(blockedCount === 1, 'A staff poll joins the existing slow work read');
    await signOut();
    await signIn('staffB');
    await releaseFailures();
    await networkUntil(() => requests.some(item => item.scene === 'native login staffB' && item.path === '/api/issue-reports' && item.status === 200), 'Actual second staff work read resumes');
    check(await evaluate(hasText(fixture.roles.staffB.readyText)), 'Returning to the same staff URL renders the second native context');
    check(!await evaluate(hasText(fixture.roles.staffA.readyText)), 'The previous staff workspace does not survive the actual identity change');
    await signOut();
    check(exceptions.length === 0, 'No actual browser runtime exception occurred');
    check(!requests.some(item => item.path === '/api/sync/events' && item.status === 401), 'No unsigned event-stream retry waste occurred');
    console.log(JSON.stringify({ passed: true, checks, actualLocalAuth: true, fixtureRecordsInCloud: 0 }));
  } catch (error) {
    process.exitCode = 1; console.error(JSON.stringify({ passed: false, stage, checks, error: error.message }));
  } finally {
    const report = { passed: !process.exitCode, runId: fixture.runId, checks, stage, actualBrowser: Boolean(socket),
      actualNativeAuth: verifiedNativeLogins > 0, verifiedNativeLogins, providerRepliesFabricated: false, cookiesOrJwtRead: false, credentialsPrinted: false,
      cloudRecordsModified: 0, responsiveWidths: [375, 1440], themes: ['light', 'dark'], scenes, exceptions,
      accountSwitchScope: 'Actual logout/login followed by the same staff route; no unexposed in-place account switch is fabricated.',
      requests: requests.map(({ id, started, ...request }) => request) };
    await fs.writeFile(path.join(meta.root, 'pinevela-harness', 'browser-workflow-results.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    if (socket?.readyState === WebSocket.OPEN) {
      for (const requestId of held) { try { await command('Fetch.continueRequest', { requestId }); } catch {} }
      try { await command('Browser.close'); } catch {} socket.close();
    }
    rejectPending();
    if (chrome?.exitCode === null) await Promise.race([once(chrome, 'exit'), pause(3000)]);
    if (chrome?.exitCode !== null) await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
    console.log(JSON.stringify({ passed: report.passed, checks, stage, evidence: 'private local run browser-workflow-results.json' }));
  }
}
main().catch(error => { console.error(JSON.stringify({ passed: false, stage: 'local browser admission',
  code: error.code || error.name, error: 'The owned local authenticated browser verifier could not start.' })); process.exitCode = 1; });
