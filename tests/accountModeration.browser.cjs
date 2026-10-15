// Real Chromium + disposable server/data. No operational accounts or external services.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { sessionFixtureJson } = require('./sessionFixtures.cjs');
const project = path.resolve(__dirname, '..'), pause = ms => new Promise(r => setTimeout(r, ms));
async function port() { const s = net.createServer(); s.listen(0, '127.0.0.1'); await once(s, 'listening'); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function main() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-moderation-browser-')), dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (id, role = 'user') => ({ id, role, name: `Moderation ${id}`, email: `${id}@example.test`, token: crypto.randomUUID(), isVerified: true, password: crypto.createHash('sha256').update(`Browser-${id}-password!83`).digest('hex') });
  const admins = Array.from({ length: 5 }, (_, i) => actor(`founder${i}`, 'admin')), primary = actor('primary'), banned = actor('banned');
  const manager = { ...actor('linked-manager', 'manager'), parentUserId: primary.id }, resident = { ...actor('linked-room', 'student'), parentUserId: primary.id };
  const keys = admins.map((a, i) => `browser-approval-key-${i}`), now = new Date().toISOString();
  const store = { credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, banned, manager, resident], hostels: [{ id: 'browser-residence', name: 'Isolated editor residence', managerId: manager.id, managerEmail: manager.email, isApproved: true, approvalStatus: 'Approved', status: 'Open', location: '14 Oxford street, Osu, Accra', totalCapacity: 4, bedsLeft: 4, blocks: [], facilities: [], imageUrl: '/images/company/about-us.jpg' }], digitalMarketApplications: [{ id: 'browser-market-app', userId: primary.id, parentUserId: primary.id, studentEmail: primary.email, fullName: primary.name, storeName: 'Isolated approval market', status: 'pending', submittedAt: now }], adminGovernance: {
    version: 1, mainId: admins[0].id, revision: 1, members: admins.map((a, i) => ({ id: a.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${a.id}:${keys[i]}`).digest('hex') })),
    proposals: [], invitations: [], changes: [], attempts: {}, accountPolicies: { [`user:${banned.id}`]: { revision: 1, proposalId: crypto.randomUUID(), reason: 'Browser policy reason', appliedBy: admins[0].id, appliedAt: now, features: [], banUntil: new Date(Date.now() + 86400000).toISOString() } }
  } };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson(store));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket, logs = '', sequence = 0; const pending = new Map(), errors = [];
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'private'), PAYSTACK_SECRET_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: admins[0].id }, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', b => logs += b); server.stderr.on('data', b => logs += b);
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) break; } catch {} assert(server.exitCode === null, logs); await pause(100); }
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--disable-features=BackForwardCache', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--no-first-run', `--remote-debugging-port=${debugPort}`, `--user-data-dir=${path.join(temp, 'chrome')}`, 'about:blank'], { stdio: 'ignore' });
    let target; for (let i = 0; i < 150; i++) { try { target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t => t.type === 'page'); if (target) break; } catch {} await pause(100); } assert(target, 'Chromium did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r, j) => { socket.onopen = r; socket.onerror = j; });
    const command = (method, params = {}) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 30000); pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params })); });
    socket.onmessage = event => { const m = JSON.parse(event.data); if (m.id) { const p = pending.get(m.id); if (!p) return; pending.delete(m.id); clearTimeout(p.timer); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
    await command('Page.enable'); await command('Page.bringToFront'); await command('Runtime.enable'); await command('Network.enable');
    const evaluate = async expression => { const r = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
    const until = async (expression, label) => { for (let i = 0; i < 200; i++) { if (await evaluate(`Boolean(document.body && (${expression}))`)) return; await pause(100); } throw new Error(label + ': ' + await evaluate('document.body?.innerText.slice(-1800)') + JSON.stringify(errors)); };
    const viewport = width => command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 768 });
    const open = async (who, route) => { await command('Page.navigate', { url: 'about:blank' }); await command('Network.clearBrowserCookies'); await command('Network.setCookie', { name: 'pv_auth_token', value: who.token, url: base, httpOnly: true, sameSite: 'Strict' }); await command('Page.navigate', { url: base + '/#/' + route }); };
    const fill = (selector, value, kind = 'input') => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${kind === 'textarea' ? 'HTMLTextAreaElement' : 'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const api = async (route, who, body) => { const r = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${who.token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); const value = await r.json(); assert.equal(r.status, 200, value.error); return value; };
    await viewport(1440); await open(admins[0], 'admin/dashboard'); await until("document.body.textContent.includes('Shared approvals')", 'Admin loaded');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('All Registered Accounts')).click()"); await until("document.body.textContent.includes('Primary user accounts')", 'Account directory loaded');
    await until("document.querySelector('[data-primary-account=primary] button')", 'Actual account row loaded');
    await evaluate("document.querySelector('[data-primary-account=primary] button').click();"); await until("document.querySelector('dialog[aria-label=\"Registered account tree\"]')?.open", 'Account tree');
    assert.equal(await evaluate("document.querySelectorAll('[data-primary-account]').length"), 2, 'Only primary accounts listed');
    assert(await evaluate("document.querySelector('dialog').textContent.includes('Moderation linked-manager') && document.querySelector('dialog').textContent.includes('Moderation linked-room')"), 'Related accounts grouped under primary');
    await evaluate("[...document.querySelectorAll('dialog li > div')].find(e=>e.textContent.includes('Moderation linked-manager')).querySelector('button').click()");
    await until("document.querySelector('dialog[aria-label^=Propose]')?.textContent.includes('Account action · Moderation linked-manager')", 'Individual linked account action');
    await evaluate("[...document.querySelectorAll('dialog[aria-label^=Propose] button')].find(b=>b.textContent==='Cancel').click()");
    await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Manage primary account').click()");await until("document.querySelector('dialog[aria-label=\"Propose account action\"]')?.open", 'Moderation form');
    assert(await evaluate("document.querySelector('dialog').matches(':modal')"), 'Native modal/focus containment');
    await evaluate("(()=>{const e=document.querySelector('dialog[aria-label^=Propose] select');e.value='restrict';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await until("document.querySelectorAll('dialog[aria-label^=Propose] input[type=checkbox]').length===6", 'All six feature controls');
    await evaluate("[...document.querySelectorAll('dialog[aria-label^=Propose] label')].find(l=>l.textContent.includes('Placing orders')).querySelector('input').click()");
    await fill('dialog[aria-label^=Propose] textarea', 'Browser restriction reason', 'textarea'); await fill('dialog[aria-label^=Propose] input[type=password]', keys[0]);
    await evaluate("document.querySelector('dialog[aria-label^=Propose] form').requestSubmit()"); await until("!document.querySelector('dialog[aria-label=\"Propose account action\"]')", 'Proposal submitted'); await evaluate("document.querySelector('[aria-label=\"Close account tree\"]')?.click()");
    const proposal = (await api('/api/admin/governance', admins[0])).accountProposals[0]; assert.equal(proposal.votes.length, 1);
    for (let i = 1; i < 5; i++) await api(`/api/admin/governance/accounts/${proposal.id}/vote`, admins[i], { privateKey: keys[i], decision: 'approved' });
    await until("document.body.textContent.includes('Review final decision')", 'Five approvals reflected');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Review final decision').click()"); await until("document.querySelector('dialog[aria-label=\"Final account decision\"]')?.open", 'Main final confirmation');
    await fill('dialog input:not([type=password])', 'APPLY APPROVED ACTION'); await fill('dialog input[type=password]', keys[0]);
    await evaluate("document.querySelector('dialog form').requestSubmit()"); await until("!document.querySelector('dialog')", 'Applied');
    assert.equal((await api('/api/auth/account-access', primary)).restrictions[0].features[0], 'orders');
    await viewport(375); await evaluate("document.querySelector('[data-primary-account=primary] button').click();"); await until("document.querySelector('dialog')?.open", 'Mobile account tree'); await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Manage primary account').click()"); await until("document.querySelector('dialog[aria-label=\"Propose account action\"]')?.open", 'Mobile moderation form');
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile directory overflow');
    await command('Page.captureScreenshot', { format: 'png' }).then(r => fs.writeFile('/tmp/pinevela-moderation-admin-mobile.png', Buffer.from(r.data, 'base64')));
    await until("[...document.querySelectorAll('dialog button')].some(b=>b.textContent==='Cancel' && !b.disabled)", 'Pending write finishes');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await until("!document.querySelector('dialog[aria-label=\"Propose account action\"]')", 'Escape closes form'); await evaluate("document.querySelector('[aria-label=\"Close account tree\"]')?.click()");
    await evaluate("[...document.querySelectorAll('.mobile-bottom-nav button')].find(b=>b.textContent.includes('Market')).click()");
    await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Approve Application')", 'Market approval action');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Approve Application').click()");
    await until("document.querySelector('dialog[aria-label=\"Authorize approval\"]')?.open", 'Approval key prompt');
    await fill('dialog input[type=password]', 'wrong-approval-key'); await evaluate("document.querySelector('dialog form').requestSubmit()");
    await until("document.querySelector('dialog [role=alert]')?.textContent.includes('Approval failed:')", 'Approval failure on key popup');
    assert.equal(JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8')).digitalMarketApplications[0].status, 'pending');
    await fill('dialog input[type=password]', keys[0]); await evaluate("document.querySelector('dialog form').requestSubmit()");
    await until("!document.querySelector('dialog')", 'Correct approval key accepted');
    assert.equal(JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8')).digitalMarketApplications[0].status, 'approved');
    await evaluate("[...document.querySelectorAll('.mobile-bottom-nav button')].find(b=>b.textContent.includes('Residences')).click()");
    await until("document.querySelector('button[title^=\"Edit residence\"]')", 'Residence edit action');
    await evaluate("document.querySelector('button[title^=\"Edit residence\"]').click()");
    await until("document.querySelector('[data-popup-card] form')", 'Residence editor');
    await fill('[data-popup-card] input[placeholder="e.g. Oxford street, Osu, Accra"]', 'x');
    await evaluate("document.querySelector('[data-popup-card] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await until("document.querySelector('[data-popup-card] [role=alert]')?.textContent.includes('Street address')", 'Residence validation on card');
    await fill('[data-popup-card] input[placeholder="e.g. Oxford street, Osu, Accra"]', '14 Oxford street, Osu, Accra');
    const deletion = await fetch(base+'/api/hostels/browser-residence',{method:'DELETE',headers:{Authorization:`Bearer ${admins[0].token}`}}); assert(deletion.ok, 'Remove only isolated test residence');
    await evaluate("document.querySelector('[data-popup-card] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
    await until("document.querySelector('dialog[aria-label=\"Authorize approval\"]')?.open", 'Residence approved-state save needs key');
    await fill('dialog input[type=password]', keys[0]); await evaluate("document.querySelector('dialog form').requestSubmit()");
    await until("document.querySelector('dialog [role=alert]')?.textContent.includes('Hostel not found')", 'Server save error stays on active key card');
    await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent==='Cancel').click()");
    await until("document.querySelector('[data-popup-card] [role=alert]')?.textContent.includes('Approval cancelled')", 'Editor remains open after failed save');
    await open(primary, 'user/dashboard'); await until("document.querySelector('[aria-label=\"Account restrictions\"]')", 'User restriction notice');
    assert(await evaluate("document.querySelector('[aria-label=\"Account restrictions\"]').textContent.includes('Browser restriction reason')"));
    await command('Page.captureScreenshot', { format: 'png' }).then(r => fs.writeFile('/tmp/pinevela-moderation-user-mobile.png', Buffer.from(r.data, 'base64')));
    // A banned cookie during auth restoration exercises the actual shared response hook.
    await open(banned, 'login'); await until("document.querySelector('dialog[aria-label=\"Account banned\"]')?.open", 'Ban popup');
    assert(await evaluate("document.querySelector('dialog').textContent.includes('Browser policy reason') && document.querySelector('dialog').textContent.includes('Ban ends:') && document.querySelector('dialog').textContent.includes('Remaining:')"));
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Ban modal mobile overflow');
    await command('Page.captureScreenshot', { format: 'png' }).then(r => fs.writeFile('/tmp/pinevela-moderation-ban-mobile.png', Buffer.from(r.data, 'base64')));
    assert.deepEqual(errors, [], 'No browser JavaScript errors');
    console.log('Passed: real admin proposal, five approvals, main final apply; desktop/mobile dialog, six controls, Escape, restriction banner and ban reason/end-time popup.');
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' })); await pause(150); }
    socket?.close(); try { chrome?.kill('SIGTERM'); } catch {} chrome?.unref();
    if (server?.exitCode === null) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} await pause(300); }
    server?.stdout?.destroy(); server?.stderr?.destroy(); server?.unref(); await fs.rm(temp, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
