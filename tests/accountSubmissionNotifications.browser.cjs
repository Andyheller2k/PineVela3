// Actual Chromium against disposable operational storage; never touches real accounts/payments.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { sessionFixtureJson } = require('./sessionFixtures.cjs');
const project = path.resolve(__dirname, '..');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function port() { const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening'); const result = server.address().port; await new Promise(resolve => server.close(resolve)); return result; }
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-account-inbox-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/assets/' + (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^login-market-.*\.png$/.test(name));
  const actor = role => ({ id: crypto.randomUUID(), role, name: `Isolated ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const first = { ...actor('user'), password: crypto.createHash('sha256').update('Isolated-first-login!123').digest('hex'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() };
  const second = { ...actor('user'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() };
  const admin = actor('admin'), manager = { ...actor('manager'), parentUserId: second.id };
  const privateKey = crypto.randomBytes(32).toString('base64url');
  const dossier = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, managerName: manager.name, parentUserId: second.id, status: 'pending' };
  const db = path.join(dataDir, 'pinevela_store.json');
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [first, second, admin, manager], hostels: [],
    managerVerifications: [dossier], managerRegistrationRequests: [dossier],
    adminGovernance: { version: 1, mainId: admin.id, revision: 1, members: [{ id: admin.id, slot: 1, active: true, keyHash: crypto.createHash('sha256').update(`${admin.id}:${privateKey}`).digest('hex') }], proposals: [], invitations: [], changes: [], attempts: {} }
  }));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket; let logs = ''; const errors = []; let sequence = 0; const pending = new Map(); 
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: admin.id }, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
    for (let i=0;i<600;i++) { try { if ((await fetch(base+'/api/health')).ok) break; } catch {} assert(server.exitCode === null, logs); await pause(100); }
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-features=BackForwardCache','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
    let target; for(let i=0;i<600;i++) { try {target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target)break;}catch{} await pause(100); } assert(target,'Chromium did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command = (method,params={})=>new Promise((resolve,reject)=>{const id=++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage = event=>{const message=JSON.parse(event.data);
      if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(a=>a.value||a.description).join(' '));};
    await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
    const evaluate = async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const until = async (expression,label)=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error(label+': '+await evaluate('location.hash+" "+document.body.innerText.slice(-1200)')+' '+JSON.stringify(errors));};
    const viewport = width=>command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    const screenshot = async name=>{const result=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/pinevela-theme-${name}.png`,Buffer.from(result.data,'base64'));};
    const switchAccount = async who => {
      await command('Page.navigate', { url: 'about:blank' });
      await command('Network.setCookie', { name: 'pv_auth_token', value: who.token, url: base, httpOnly: true, sameSite: 'Strict', secure: true });
      await command('Page.navigate', { url: base + '/#/user/dashboard?tab=options' });
      await until("document.body.textContent.includes('Select a system avatar')", 'Avatar selector loaded');
      await evaluate(`localStorage.setItem('pinevela_welcome_shown_${who.id}', 'true')`);
      await command('Page.reload');
      await until("document.body.textContent.includes('Select a system avatar')", 'Options ready');
    };
    const avatarSrc = () => evaluate("[...document.querySelectorAll('img[alt=\"Profile Avatar\"]')].map(e=>e.getAttribute('src'))");
    await viewport(1440);
    await switchAccount(first);
    // Save an actual bundled photograph through the profile API, then render it on reload.
    assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/auth/profile',{method:'PUT',headers:{'Content-Type':'application/json','X-PineVela-Session':'cookie'},body:JSON.stringify({avatar:location.origin+${JSON.stringify(imageUrl)}})});return r.status;})()`), 200);
    await command('Page.reload');
    await until("!!document.querySelector('img[alt=\"Profile Avatar\"]')", 'First Google account photograph');
    assert((await avatarSrc()).some(src => src.endsWith(imageUrl)));
    await evaluate(`localStorage.setItem('pinevela_user_avatar',location.origin+${JSON.stringify(imageUrl)});localStorage.setItem('pinevela_avatar_${second.email}',location.origin+${JSON.stringify(imageUrl)})`);
    // Sign out using the real HttpOnly-session endpoint, then restore the second Google session.
    assert.equal(await evaluate("(async()=>{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'X-PineVela-Session':'cookie'}});return r.status})()"), 200);
    await switchAccount(second);
    console.log('Passed: real logout and second Google-linked session');
    assert.deepEqual(await avatarSrc(), [], 'Second account ignores shared and email-only picture caches');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Deep Forest Pine')).click()");
    await until("document.body.textContent.includes('Profile Avatar Saved!')", 'Selector server save');
    assert.equal(await evaluate("(async()=>{const r=await fetch('/api/auth/me',{headers:{'X-PineVela-Session':'cookie'}});return(await r.json()).avatar})()"), 'preset:pine-forest');
    await command('Page.reload');
    await until("document.body.textContent.includes('Select a system avatar')", 'Saved second account reload');
    assert.deepEqual(await avatarSrc(), []);
    // Listen to real SSE delivery. The manager approval must arrive in the primary inbox.
    await command('Page.navigate', { url: base + '/#/user/dashboard?tab=notifications' });
    await until("document.body.textContent.includes('Notifications') && !document.querySelector('[data-route-skeleton]')", 'Primary inbox');
    await pause(1200);
    await evaluate("window.__inboxChangedAt=0;window.addEventListener('pinevela-data-change',()=>{window.__inboxChangedAt=Date.now()})");
    const approval = await fetch(base + `/api/manager-requests/${dossier.id}/approve`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: JSON.stringify({ privateKey }) });
    assert.equal(approval.status, 200, await approval.text());
    await until("window.__inboxChangedAt > 0", 'Live SSE event delivered');
    await until("document.body.textContent.includes('Manager Account Approved!')", 'Primary inbox displays live approval');
    assert(await evaluate("(async()=>{const r=await fetch('/api/notifications',{headers:{'X-PineVela-Session':'cookie'}});return(await r.json()).some(n=>n.title==='Manager Account Approved!'&&n.targetRole==='user')})()"));
    const managerInbox = await (await fetch(base + '/api/notifications', { headers: { Authorization: `Bearer ${manager.token}` } })).json();
    assert(!managerInbox.some(n => n.title === 'Manager Account Approved!'));
    console.log('Passed: live SSE approval reaches primary inbox, excluded from manager inbox');
    await viewport(375);
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile inbox fits');
    await screenshot('account-inbox-mobile');
    assert.equal(await evaluate(`(async()=>{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-PineVela-Session':'cookie'},body:JSON.stringify({usernameOrEmail:${JSON.stringify(first.email)},password:'Isolated-first-login!123'})});return r.status})()`), 200);
    await command('Page.navigate', { url: base + '/#/user/dashboard?tab=options' });
    await command('Page.reload');
    await until("!!document.querySelector('img[alt=\"Profile Avatar\"]')", 'First account fresh session');
    assert((await avatarSrc()).some(src => src.endsWith(imageUrl)), 'First account retains its own photo');
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('Passed: two Google-linked sessions, real logout, avatar save/reload, legacy cache isolation, SSE primary approval, manager exclusion, mobile inbox');
  } finally {
    for(const item of pending.values())clearTimeout(item.timer);
    if(socket?.readyState===WebSocket.OPEN){ socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await pause(150); }
    socket?.close();try { chrome?.kill('SIGTERM'); } catch {} chrome?.unref();
    if(server?.exitCode===null){try{process.kill(-server.pid,'SIGTERM');}catch{} await pause(300);}
    server?.stdout?.destroy(); server?.stderr?.destroy(); server?.unref();
    await fs.rm(temp,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
