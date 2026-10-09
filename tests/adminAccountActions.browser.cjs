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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-admin-actions-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageName = (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^login-market-.*\.png$/.test(name));
  const imageUrl = '/assets/' + imageName;
  const actor = role => ({ id: crypto.randomUUID(), role, name: `Isolated ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const admins = Array.from({ length: 3 }, () => actor('admin')), admin = admins[0], keys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const primary = { ...actor('user'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() };
  const manager = { ...actor('manager'), parentUserId: primary.id };
  const hostel = { id: crypto.randomUUID(), name: 'Camera workflow residence', managerId: manager.id, assignedManagerId: manager.id, managerEmail: manager.email, managerName: manager.name, imageUrl, image: imageUrl, gallery: [imageUrl], isApproved: true, approvalStatus: 'Approved', status: 'Open', isLive: true, totalCapacity: 1, availableSpaces: 0, blocksList: [{ id: crypto.randomUUID(), name: 'C', floors: 1, totalRooms: 1 }] };
  const resident = { ...actor('student'), roomKey: crypto.randomUUID(), hostelId: hostel.id, hostelName: hostel.name, parentUserId: primary.id };
  const room = { id: crypto.randomUUID(), roomKey: resident.roomKey, hostelId: hostel.id, hostelName: hostel.name, isAssigned: true, assignedStudentId: resident.id, assignedStudentEmail: resident.email, studentEmail: resident.email, studentId: resident.id, roomNumber: '4', blockName: 'C', capacity: 1, price: 400, roomImage: imageUrl };
  const db = path.join(dataDir, 'pinevela_store.json');
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, manager, resident], hostels: [hostel], roomKeys: [room],
    adminGovernance: { version: 1, mainId: admin.id, revision: 1, members: admins.map((a, i) => ({ id: a.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${a.id}:${keys[i]}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} }
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
    const switchAccount = async (who, route) => {
      await command('Page.navigate', { url: 'about:blank' });
      await command('Network.setCookie', { name: 'pv_auth_token', value: who.token, url: base, httpOnly: true, sameSite: 'Strict', secure: true });
      await command('Page.navigate', { url: base + '/#/' + route });
    };
    const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim().startsWith(${JSON.stringify(text)}));if(!b)throw Error('Missing button '+${JSON.stringify(text)});b.click();})()`);
    const fill = (selector,value) => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const api = async (route, who, body) => { const r=await fetch(base+route,{method:'POST',headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json'},body:JSON.stringify(body)}); const result=await r.json();assert.equal(r.status,200,result.error);return result; };
    await viewport(375); await switchAccount(resident,'resident/dashboard');
    await until("!!document.querySelector('[aria-label=\"Log maintenance with camera\"]')", 'Resident portal');
    for (const width of [375, 768]) {
      await viewport(width);
      for (const tab of ['My Room', 'Complaints', 'Bulletins', 'Settings']) {
        await evaluate(`(()=>{const nav=document.querySelector('.mobile-bottom-nav');[...nav.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(tab)}).click();})()`);
        await pause(200);
        const geometry = await evaluate(`(()=>{const b=document.querySelector('[aria-label="Log maintenance with camera"]'), n=document.querySelector('.mobile-bottom-nav'), m=document.querySelector('main.dashboard-centered-content');const r=e=>{const v=e.getBoundingClientRect();return {top:v.top,bottom:v.bottom,left:v.left,right:v.right,height:v.height};};return {button:r(b),nav:r(n),main:r(m),overflow:document.documentElement.scrollWidth>innerWidth,visible:b.getClientRects().length>0};})()`);
        assert(geometry.visible);assert(!geometry.overflow,tab+' horizontal overflow');assert(geometry.button.bottom<geometry.nav.top,tab+' overlaps navigation');assert(geometry.main.bottom<geometry.button.top,tab+' overlaps content: '+JSON.stringify(geometry));
      }
    }
    await screenshot('camera-mobile');
    await viewport(1440);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Log maintenance with camera\"]').getClientRects().length"),0,'Camera shortcut is mobile only');
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim().startsWith('Maintenance')).click()");
    await until("document.body.innerText.includes('Report')",'Desktop maintenance tab');
    // Desktop retains its full report action and form.
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.includes('Report New Issue')).click()");
    await until("!!document.querySelector('textarea')",'Full desktop form');
    assert(await evaluate("document.body.innerText.includes('Urgency')&&document.body.innerText.includes('Category')"));
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()==='Cancel').click()");
    await viewport(375);
    assert.equal(await evaluate("document.querySelector('[data-maintenance-camera]').getAttribute('capture')"),'environment');
    await command('Page.setInterceptFileChooserDialog',{enabled:true});
    await evaluate("document.querySelector('[aria-label=\"Log maintenance with camera\"]').click()");
    const documentNode=await command('DOM.getDocument'); const input=await command('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:'[data-maintenance-camera]'});
    await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(project,'dist/assets',imageName)]});
    await until("!!document.querySelector('dialog[aria-label=\"Quick maintenance complaint\"]')",'Captured photo mini form');
    assert(await evaluate("document.querySelector('img[alt=\"Complaint photograph preview\"]').naturalWidth>0"));
    await fill('dialog input','Camera captured issue'); await click('File complaint');
    await until("!document.querySelector('dialog[aria-label=\"Quick maintenance complaint\"]')",'Complaint submitted');
    let stored=JSON.parse(await fs.readFile(db,'utf8')); const complaint=stored.issueReports.find(i=>i.title==='Camera captured issue');assert(complaint);assert.equal(complaint.description,'');assert.equal(complaint.hostelId,hostel.id);assert(complaint.photos[0].startsWith('data:image/jpeg'));
    assert(stored.notifications.some(n=>n.targetAccountId===manager.id&&n.title.includes('Camera captured issue')));
    await evaluate("document.querySelector('[aria-label=\"Log maintenance with camera\"]').click()");
    await until("!!document.querySelector('dialog[aria-label=\"Maintenance reporting notice\"]')",'One-active-complaint notice');
    assert(await evaluate("document.querySelector('dialog[aria-label=\"Maintenance reporting notice\"]').innerText.includes('still active')"));await click('Close');
    assert.equal(JSON.parse(await fs.readFile(db,'utf8')).issueReports.length,1);
    // New gateway renders actual account groups, reviews recipients and submits.
    await viewport(1440);await switchAccount(admin,'admin/dashboard');
    await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Message Gateway')",'Admin gateway tab');await click('Message Gateway');
    await until("!!document.querySelector('section[aria-label=\"Admin Message Gateway\"]')",'Gateway screen');
    await evaluate("[...document.querySelectorAll('fieldset label')].find(e=>e.textContent.includes('Residents')).querySelector('input').click()");
    await fill('section[aria-label="Admin Message Gateway"] input[maxlength="120"]','Resident announcement'); await fill('section[aria-label="Admin Message Gateway"] textarea','Actual role-scoped announcement.');
    await click('Review recipients');await until("document.body.innerText.includes('Delivery preview: 1 distinct accounts')",'Actual gateway recipients');await click('Send announcement');
    await until("document.body.innerText.includes('Announcement delivered to 1 accounts.')",'Gateway receipt');
    await switchAccount(resident,'resident/dashboard'); await until("!!document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]')",'Resident announcement popup');assert(await evaluate("document.querySelector('dialog').innerText.includes('Resident announcement')"));await click('Got it');
    await command('Page.reload');await until("!!document.querySelector('[data-maintenance-camera]')",'Resident reloaded');assert.equal(await evaluate("!!document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]')"),false,'Dismissed popup does not return');
    await switchAccount(admin,'admin/dashboard');await until("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Available Residences'))",'Admin residences');await click('Available Residences');
    await until("!!document.querySelector('[aria-label=\"Propose deletion of Camera workflow residence\"]')",'Reviewed deletion action');await evaluate("document.querySelector('[aria-label=\"Propose deletion of Camera workflow residence\"]').click()");
    await until("!!document.querySelector('dialog[aria-label=\"Review hostel deletion\"]')",'Deletion options');assert(await evaluate("document.querySelector('dialog').innerText.includes('Also delete its manager account')"));
    await fill('dialog textarea','Reviewed browser deletion');await click('Review deletion');await until("document.querySelector('dialog').innerText.includes('Deletion preview')",'Affected records preview');
    await fill('dialog input[type="password"]',keys[0]);await until("[...document.querySelectorAll('dialog button')].some(b=>b.textContent.trim()==='Submit deletion for approval'&&!b.disabled)",'Deletion review ready to submit');await click('Submit deletion for approval');await until("!document.querySelector('dialog[aria-label=\"Review hostel deletion\"]')",'Keyed proposal saved');
    stored=JSON.parse(await fs.readFile(db,'utf8'));const proposal=stored.adminGovernance.residenceProposals[0];assert(proposal&&stored.hostels.length===1,'Proposal does not delete');
    await api('/api/admin/governance/residences/'+proposal.id+'/vote',admins[1],{privateKey:keys[1],decision:'approved'});
    await until("document.body.innerText.includes('Founder: execute approved deletion')",'Founder final action');
    await fill('section[aria-label="Hostel deletion approvals"] input[type="password"]',keys[0]);
    await fill('section[aria-label="Hostel deletion approvals"] input:not([type="password"])','DELETE APPROVED HOSTEL');await click('Founder: execute approved deletion');
    await until("document.body.innerText.includes('Approved hostel deletion completed')",'Founder execution receipt');
    stored=JSON.parse(await fs.readFile(db,'utf8'));assert.equal(stored.hostels.length,0);assert(stored.users.some(u=>u.id===manager.id),'Hostel-only retains manager');
    await switchAccount(primary,'user/dashboard');await until("!!document.querySelector('dialog[aria-label=\"Message from PineVela administrators\"]')",'Primary deletion popup');assert(await evaluate("document.querySelector('dialog').innerText.includes('Hostel Deleted')"));
    assert.deepEqual(errors,[],'No JavaScript errors');
    console.log('Passed: all four mobile tabs at 375/768px without content/navigation overlap, desktop full form, actual photo mini-form submission, scoped gateway popup/dismiss/reload, keyed review/quorum/founder deletion and primary notification');
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
