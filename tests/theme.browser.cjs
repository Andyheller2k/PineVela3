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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-theme-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/assets/' + (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^login-market-.*\.png$/.test(name));
  const actor = role => ({ id: crypto.randomUUID(), role, name: `Appearance ${role}`, email: `${role}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved', appearanceTheme: 'dark' });
  const admin = actor('admin'), manager = actor('manager'), staff = actor('staff'), user = actor('user'), resident = actor('student'), seller = actor('merchant'), officer = { ...actor('verification_team'), fullName: 'Appearance officer', status: 'active' };
  const hostel = { id: crypto.randomUUID(), name: 'Appearance residence', managerId: manager.id, managerEmail: manager.email, isApproved: true, approvalStatus: 'Approved', blocks: [{name:'Female Block',totalRooms:1,startNum:201,roomPrefix:'F',gender:'Female'}], location:'Accra', imageUrl, image: imageUrl };
  Object.assign(resident, { hostelId: hostel.id, hostelName: hostel.name, roomKey: 'APPEARANCE-FEM-123456', roomNumber: 'F-201', blockName: 'Female Block' });
  const room = { id: crypto.randomUUID(), roomKey: resident.roomKey, hostelId: hostel.id, hostelName: hostel.name, roomNumber: resident.roomNumber, blockName: resident.blockName, isAssigned: true, assignedStudentId: resident.id, assignedStudentEmail: resident.email };
  const roster = { id: crypto.randomUUID(), userId: staff.id, hostelId: hostel.id, managerId: manager.id, managerCreated: true, status: 'Active', name: staff.name, email: staff.email, phone: '+233200000000', role: 'Facilities technician', assignedBlock: 'Female Block' };
  Object.assign(staff, { staffId: roster.id, hostelId: hostel.id });
  const market = { id: crypto.randomUUID(), studentEmail: seller.email, userId: user.id, status: 'active', storeName: 'Appearance market', setupCompleted: true, registrationFeePaid: true, subscriptionPlan: 'pro', subscriptionStatus: 'active', subscriptionExpiresAt: new Date(Date.now()+86400000).toISOString(), semesterExpiresAt: new Date(Date.now()+86400000).toISOString() };
  Object.assign(seller, { merchantStoreId: market.id, parentUserId: user.id, isDigitalMarketOnly: true, isApprovedMerchant: true, merchantSetupCompleted: true });
  const issue = { id: crypto.randomUUID(), title: 'Broken Window', description: 'The window at the balcony is broken', category: 'Furniture', urgency: 'Medium', status: 'Resolved', closedByManager: true, isClosed: true, studentConfirmed: true, studentAcceptedResolved: true, staffCompleted: true, assignedStaffId: roster.id, assignedStaffName: staff.name, hostelId: hostel.id, studentId: resident.id, userId: resident.id, roomKey: resident.roomKey, roomNumber: 'F-201', date: '2026-10-04', photos: [imageUrl] };
  await fs.writeFile(path.join(dataDir, 'pinevela_store.json'), sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [admin, manager, staff, user, resident, seller], hostels: [hostel], staff: [roster], roomKeys: [room], issueReports: [issue], verificationTeams: [officer], digitalMarketStores: [market], digitalMarketApplications: [{id:crypto.randomUUID(), studentEmail:seller.email,status:'approved'}], paymentTransactions: [{ id:crypto.randomUUID(),storeId:market.id,purpose:'activation',status:'fulfilled',mode:'free' }] }));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket; let logs = ''; const errors = []; let sequence = 0; const pending = new Map(); let rejectAppearanceWrites = false;
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: admin.id }, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
    for (let i=0;i<600;i++) { try { if ((await fetch(base+'/api/health')).ok) break; } catch {} assert(server.exitCode === null, logs); await pause(100); }
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-features=BackForwardCache','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
    let target; for(let i=0;i<600;i++) { try {target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target)break;}catch{} await pause(100); } assert(target,'Chromium did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command = (method,params={})=>new Promise((resolve,reject)=>{const id=++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage = event=>{const message=JSON.parse(event.data);
      if(message.method==='Fetch.requestPaused'){
        if(rejectAppearanceWrites && message.params.request.method==='PUT') void command('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:'Isolated unavailable-server check'})).toString('base64')});
        else void command('Fetch.continueRequest',{requestId:message.params.requestId});
      } else if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(a=>a.value||a.description).join(' '));};
    await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
    const evaluate = async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const until = async (expression,label)=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error(label+': '+await evaluate('location.hash+" "+document.body.innerText.slice(-1200)')+' '+JSON.stringify(errors));};
    const viewport = width=>command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});
    const screenshot = async name=>{const result=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/pinevela-theme-${name}.png`,Buffer.from(result.data,'base64'));};
    const uxCoverage = [];
    const checkControls = async label => {
      await pause(250); // Measure settled hit areas after the existing popup entrance animation.
      const result = await evaluate(`(()=>{const modal=[...document.querySelectorAll('dialog')].filter(d=>d.matches(':modal')).at(-1),scope=modal||document;const elements=[...scope.querySelectorAll('button, [role="button"], input:not([type="hidden"]), select, textarea')].filter(e=>{const r=e.getBoundingClientRect();return !e.disabled&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[inert]');});const name=e=>e.getAttribute('aria-label')||e.getAttribute('title')||(e.getAttribute('aria-labelledby')||'').split(' ').map(id=>document.getElementById(id)?.textContent||'').join(' ').trim()||(e.labels&&[...e.labels].map(l=>l.innerText).join(' ').trim())||((e.tagName==='BUTTON'||e.getAttribute('role')==='button')&&(e.innerText.trim()||[...e.querySelectorAll('img')].map(i=>i.alt).join(' ').trim()));return {count:elements.length,unnamed:elements.filter(e=>!name(e)).map(e=>e.outerHTML.slice(0,220)),small:innerWidth<1024?elements.filter(e=>{const target=['checkbox','radio','file'].includes(e.type)?e.closest('label')||e.labels?.[0]||e:e;const r=target.getBoundingClientRect();return r.width<43.5||r.height<43.5;}).map(e=>({name:name(e),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,html:e.outerHTML.slice(0,160)})):[]};})()`);
      assert.deepEqual(result.unnamed, [], label+' controls have readable names');
      assert.deepEqual(result.small, [], label+' controls have 44px touch targets');
      uxCoverage.push({label,controls:result.count});
    };
    const check = async label=>{
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'),label+' horizontal overflow');
      assert(await evaluate("!document.querySelector('main') || document.querySelector('main').scrollWidth <= document.querySelector('main').clientWidth+1"),label+' dashboard content stays within viewport');
      assert(await evaluate("!!document.querySelector('[role=switch][aria-label=\"Dark mode\"]')"),label+' has toggle');
      assert(!await evaluate("document.body.textContent.includes('This page could not load')"),label+' route error');
      assert(!await evaluate("document.body.textContent.includes('Retry dashboard') || document.body.textContent.includes('Retry resident portal')"),label+' data loaded');
      const dark = await evaluate("document.documentElement.dataset.theme === 'dark'");
      if(dark)assert(await evaluate("(()=>{const p=[...document.querySelectorAll('[class~=text-slate-900],[class~=text-slate-800],[class~=text-blue-950]')].find(e=>e.getClientRects().length&&!e.closest('.public-header-card'));if(!p)return true;return getComputedStyle(p).color.match(/[0-9]+/g).slice(0,3).map(Number).some(n=>n>140)})()"),label+' heading readable');
      const contrast = await evaluate(`(()=>{
        const luminance=rgb=>rgb.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4;}).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
        const rgb=color=>(color.match(/[0-9.]+/g)||[]).map(Number);
        return [...document.querySelectorAll('button')].filter(b=>!b.disabled&&b.getClientRects().length&&['bg-blue-500','bg-blue-600','bg-blue-700','bg-blue-900'].some(c=>b.classList.contains(c))).map(b=>{
          const s=getComputedStyle(b),bg=rgb(s.backgroundColor),fg=rgb(s.color),values=[luminance(bg),luminance(fg)].sort((a,b)=>a-b);
          return {name:b.getAttribute('aria-label')||b.textContent.trim(),ratio:(values[1]+.05)/(values[0]+.05)};
        }).filter(b=>b.ratio<4.5);
      })()`);
      assert.deepEqual(contrast, [], label+' solid blue actions retain readable labels');
      await checkControls(label);
      console.log('Passed:',label);
    };
    const toggle = async()=>{
      const result = await evaluate("(()=>{const before=document.documentElement.dataset.theme;document.querySelector('[role=switch][aria-label=\"Dark mode\"]').click();const surface=document.querySelector('main')||document.querySelector('nav');return {changed:before!==document.documentElement.dataset.theme,duration:surface?getComputedStyle(surface).transitionDuration:'0s'};})()");
      assert(result.changed, 'Theme updates synchronously without waiting for preference save');
      assert.equal(result.duration, '0s', 'Page surfaces do not run costly theme paint transitions');
      await pause(250);
    };
    await viewport(1440);await command('Page.navigate',{url:base+'/#/'});await until("document.querySelector('#welcome-section h1')",'Landing welcome section');
    if(await evaluate("document.documentElement.dataset.theme !== 'light'"))await toggle();
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#public-header')).backgroundColor"),'rgb(255, 255, 255)','Landing header is opaque white in light mode');
    await check('desktop landing light');await screenshot('landing-light');await toggle();await check('desktop landing dark');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#public-header')).backgroundColor"),'rgb(12, 31, 59)','Landing header follows dark mode');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#public-header input')).backgroundColor"),'rgb(18, 43, 73)','Landing search follows dark mode');
    assert(!await evaluate("document.querySelector('.landing-theme-image,.theme-watermark')"),'Landing has no cover pictures or background logo');
    await until("getComputedStyle(document.querySelector('.theme-stars')).opacity === '0.75'",'Stars settle');
    await screenshot('landing-dark');
    await viewport(375);await check('mobile landing dark');await screenshot('landing-mobile');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('About Us')).click()");
    await until("document.querySelector('#title-about-us')===document.activeElement && scrollY>0",'Inline About Us');
    await pause(1100); await check('mobile company dark'); await screenshot('company-mobile');
    assert.equal(await evaluate("document.querySelectorAll('.landing-company-story .company-chapter').length"),4,'All company chapters continue on landing');
    assert(!await evaluate("document.querySelector('dialog.company-story')"),'Company content does not open a separate dialog');
    await toggle(); assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
    await toggle(); assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
    await command('Page.navigate',{url:base+'/#/login'});await until("document.querySelector('input[type=password]')",'Login');await check('mobile login dark');await screenshot('login-mobile');
    await command('Page.reload');await until("document.querySelector('input[type=password]')",'Reload');assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');
    await evaluate("localStorage.setItem('pinevela_navigation_layout','top')");
    const routes=[[admin,'/admin/dashboard'],[manager,'/manager/dashboard'],[staff,'/staff/dashboard'],[user,'/user/dashboard'],[resident,'/resident/dashboard'],[seller,'/digital-market'],[officer,'/verification-team']];
    for(const [who,route] of routes){
      await command('Page.navigate',{url:'about:blank'});await command('Network.setCookie',{name:'pv_auth_token',value:who.token,url:base,httpOnly:true,sameSite:'Strict',secure:true});
      await viewport(1440);await command('Page.navigate',{url:base+'/#'+route});
      await until("document.querySelector('.theme-dock') && !document.querySelector('[data-route-skeleton]')",who.role+' page loaded');await pause(1400);
      await until("document.documentElement.dataset.theme === 'dark'",who.role+' independent saved dark preference');
      if(who===manager){
        await until("document.querySelector('dialog[aria-label=\"Save your manager secret key\"]')?.open",'Manager key acknowledgement');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await pause(100);
        assert(await evaluate("document.querySelector('dialog[aria-label=\"Save your manager secret key\"]').open"),'Required key acknowledgement cannot be skipped with Escape');
        await evaluate("document.querySelector('dialog[aria-label=\"Save your manager secret key\"] input[type=checkbox]').click()");
        await evaluate("[...document.querySelectorAll('dialog[aria-label=\"Save your manager secret key\"] button')].find(b=>b.textContent==='Continue').click()");
      }
      assert.equal(await evaluate('location.hash'),'#'+route,who.role+' stays in account');await check(who.role+' desktop dark');await screenshot(who.role+'-desktop');
      await until("[...document.querySelectorAll('nav button[aria-current=page],button[data-page-tabs][aria-current=page]')].some(b=>b.getClientRects().length)", who.role+' selected navigation state');
      assert(await evaluate("(()=>{const b=[...document.querySelectorAll('nav button[aria-current=page],button[data-page-tabs][aria-current=page]')].find(b=>b.getClientRects().length);return getComputedStyle(b).backgroundColor==='rgb(0, 119, 182)' && getComputedStyle(b).color==='rgb(255, 255, 255)'})()"),who.role+' selected tab has distinct dark highlight');
      await evaluate("(()=>{const selected=[...document.querySelectorAll('nav button[aria-current=page],button[data-page-tabs][aria-current=page]')].find(b=>b.getClientRects().length);window.__themePreviousTab=selected;const next=[...selected.parentElement.querySelectorAll('button')].find(b=>b!==selected && !b.disabled && (b.hasAttribute('data-page-tabs') || b.classList.contains('flex-1')));if(next)next.click();})()");
      await pause(250);
      await until("[...document.querySelectorAll('nav button[aria-current=page],button[data-page-tabs][aria-current=page]')].some(b=>b.getClientRects().length && getComputedStyle(b).backgroundColor==='rgb(0, 119, 182)')",who.role+' highlight follows selected tab');
      await evaluate("window.__themePreviousTab?.click()");
      if(who===seller){
        await evaluate("document.querySelector('button[aria-label=\"Upgrade your seller plan\"]').click()");
        await until("(()=>{const b=document.querySelector('button[aria-label=\"Upgrade your seller plan\"]');return b.textContent.trim()==='Subscription' && b.getClientRects().length && getComputedStyle(b.querySelector('span')).position!=='absolute' && b.getAttribute('aria-current')==='page' && getComputedStyle(b).backgroundColor==='rgb(0, 119, 182)'})()",'Desktop Subscription label and selected dark highlight');
        await evaluate("[...document.querySelectorAll('nav button')].find(b=>b.textContent.trim()==='Dashboard / POS').click()");
      }
      await viewport(768);await check(who.role+' tablet dark');await viewport(375);await check(who.role+' mobile dark');
      const hasMobileBar = await evaluate("[...document.querySelectorAll('.mobile-bottom-nav')].some(n=>n.getClientRects().length)");
      if(hasMobileBar){
        await until("document.querySelector('.managed-mobile-theme .theme-toggle')",who.role+' theme control clears navigation');
        for (const width of [320, 375, 430]) {
          await viewport(width); await pause(100);
          const layout = await evaluate("(()=>{const n=[...document.querySelectorAll('.mobile-bottom-nav')].find(n=>n.getClientRects().length),row=n.querySelector('[data-mobile-nav-items]')||n,r=n.getBoundingClientRect(),buttons=[...row.children];row.scrollLeft=100;return {scrollable:row.scrollWidth>row.clientWidth+1,scrollLeft:row.scrollLeft,fit:buttons.every(b=>{const v=b.getBoundingClientRect();return v.width>0&&v.left>=r.left-1&&v.right<=r.right+1}),icons:buttons.every(b=>{const i=b.querySelector('svg,.theme-toggle');if(!i)return false;const v=i.getBoundingClientRect();return v.left>=r.left-1&&v.right<=r.right+1})}})()");
          assert.deepEqual(layout, {scrollable:false,scrollLeft:0,fit:true,icons:true}, who.role+' all mobile tabs fit without scrolling at '+width);
          await checkControls(who.role+' at '+width);
          assert(await evaluate("document.querySelector('main').scrollWidth<=document.querySelector('main').clientWidth+1"),who.role+' dashboard has no internal horizontal overflow at '+width);
          assert(await evaluate("document.querySelector('.managed-mobile-theme .theme-toggle').getBoundingClientRect().height >= 44"), who.role+' theme switch has touch target at '+width);
          assert(await evaluate("(()=>{const n=document.querySelector('.mobile-bottom-nav'),t=document.querySelector('.managed-mobile-theme'),f=document.querySelector('[data-seller-add],button[aria-label=\"Log maintenance with camera\"]');const a=t.getBoundingClientRect();if(a.bottom>=n.getBoundingClientRect().top)return false;if(!f)return true;const b=f.getBoundingClientRect();return a.right<=b.left||a.left>=b.right||a.bottom<=b.top||a.top>=b.bottom})()"), who.role+' floating actions do not overlap at '+width);
        }
        await viewport(375);
        assert(await evaluate("document.querySelector('.mobile-bottom-nav [data-mobile-nav-items]').children.length <= 5"),who.role+' primary choices stay manageable');
        assert(await evaluate("(()=>{const n=[...document.querySelectorAll('.mobile-bottom-nav')].find(n=>n.getClientRects().length),b=n.querySelector('[aria-current=page]'),m=document.querySelector('main');return !!b && getComputedStyle(b).backgroundColor==='rgb(0, 119, 182)' && getComputedStyle(b.querySelector('svg')).filter.includes('drop-shadow') && parseFloat(getComputedStyle(m).paddingBottom)>=n.getBoundingClientRect().height+23})()"),who.role+' selected blue glow and bottom clearance');
        const end = await evaluate("(()=>{const m=document.querySelector('main'),n=[...document.querySelectorAll('.mobile-bottom-nav')].find(n=>n.getClientRects().length);m.scrollTop=m.scrollHeight;window.scrollTo(0,document.documentElement.scrollHeight);const last=[...m.children].filter(e=>e.getClientRects().length && getComputedStyle(e).position!=='fixed').at(-1);return {bottom:last?.getBoundingClientRect().bottom,navTop:n.getBoundingClientRect().top}})()");
        assert(end.bottom<=end.navTop+1,who.role+' final content is reachable above bottom bar: '+JSON.stringify(end));
        await evaluate("document.querySelector('main').scrollTop=0;window.scrollTo(0,0)");
        await evaluate("(()=>{const b=document.querySelector('.mobile-bottom-nav [aria-current=page]');window.__mobilePrevious=b;const next=[...b.parentElement.querySelectorAll('button')].find(n=>n!==b&&!n.hasAttribute('role'));next?.click()})()");await pause(300);
        assert(await evaluate("!!document.querySelector('.mobile-bottom-nav [aria-current=page]')"),who.role+' mobile selection follows taps');
        await evaluate("window.__mobilePrevious.click()");
      }
      if(who===manager){
        await evaluate("[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && b.textContent.includes('Edit Manager Profile')).focus();document.activeElement.click()");
        await until("document.querySelector('dialog[aria-label=\"Manager Profile Settings\"]')?.open",'Manager profile dialog');
        await checkControls('Manager profile mobile');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await pause(100);
        assert(await evaluate("document.activeElement.textContent.includes('Edit Manager Profile')"),'Profile cancellation restores opening control');
      }
      if(hasMobileBar && await evaluate("!!document.querySelector('.mobile-bottom-nav [data-navigation-id=more]')")) {
        await evaluate("document.querySelector('.mobile-bottom-nav [data-navigation-id=more]').focus();document.activeElement.click()");
        await until("document.querySelector('dialog.ux-more-overlay')?.open",who.role+' More menu');
        await checkControls(who.role+' secondary navigation');
        assert(await evaluate("document.querySelector('dialog.ux-more-overlay').matches(':modal')"),who.role+' secondary navigation is modal');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
        assert(await evaluate("!!document.activeElement.closest('dialog.ux-more-overlay')"),who.role+' focus enters menu');
        await evaluate("(()=>{const buttons=[...document.querySelectorAll('dialog.ux-more-overlay button:not(:disabled)')];buttons.at(-1).focus()})()");
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab'});
        assert(await evaluate("document.activeElement===document.querySelector('dialog.ux-more-overlay button')"),who.role+' Tab wraps inside menu');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',modifiers:8});
        assert(await evaluate("document.activeElement===[...document.querySelectorAll('dialog.ux-more-overlay button:not(:disabled)')].at(-1)"),who.role+' Shift-Tab wraps inside menu');
        if(who===admin)assert(await evaluate("!!document.querySelector('dialog [data-navigation-id=user_accounts]') && !!document.querySelector('dialog [data-navigation-id=governance]') && !!document.querySelector('dialog [data-navigation-id=settings]')"),'Administrative destinations remain available');
        if(who===manager)assert(await evaluate("!!document.querySelector('dialog [data-navigation-id=staff]') && !!document.querySelector('dialog [data-navigation-id=blocks]') && !!document.querySelector('dialog [data-navigation-id=meetings]')"),'Manager destinations remain available');
        if(who===seller)assert(await evaluate("!!document.querySelector('dialog [data-navigation-id=messages]') && !!document.querySelector('dialog [data-navigation-id=notifications]') && !!document.querySelector('dialog [data-navigation-id=profile]')"),'Seller destinations remain available');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await pause(100);
        assert(await evaluate("document.activeElement.matches('[data-navigation-id=more]')"),who.role+' Escape returns focus to More: '+JSON.stringify(await evaluate("({active:document.activeElement.outerHTML.slice(0,500),dialogs:[...document.querySelectorAll('dialog')].map(d=>({label:d.getAttribute('aria-label'),open:d.open}))})")));
        const destinations = who===admin ? ['user_accounts','digital_market','messages','governance','settings'] : who===manager ? ['blocks','staff','meetings','settings'] : ['notifications','messages','upgrade','profile'];
        for(const destination of destinations){
          await evaluate("document.querySelector('.mobile-bottom-nav [data-navigation-id=more]').click()");
          await until("document.querySelector('dialog.ux-more-overlay')?.open",destination+' menu opened');
          await evaluate(`document.querySelector('dialog.ux-more-overlay [data-navigation-id=${destination}]').click()`);
          await until("!document.querySelector('dialog.ux-more-overlay')",destination+' selected');await pause(600);
          assert(await evaluate("document.querySelector('.mobile-bottom-nav [data-navigation-id=more]').getAttribute('aria-current')==='page'"),who.role+' secondary selection is represented');
          await check(who.role+' '+destination+' mobile dark');
        }
        await evaluate("document.querySelector('.mobile-bottom-nav button:not([data-navigation-id=more])').click()");await pause(200);

      }
      if(who===seller){
        assert(await evaluate("document.querySelector('[data-seller-add]').getBoundingClientRect().bottom < document.querySelector('.mobile-bottom-nav').getBoundingClientRect().top"),'Seller add button clears bottom navigation');
        await evaluate("document.querySelector('[data-seller-add]').click()");await until("document.querySelector('[data-popup-card] form')",'Seller publish form');
        await evaluate("document.querySelector('[data-popup-card] form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))");
        await until("document.querySelector('[data-popup-card] [data-form-feedback] [role=alert]')",'Seller validation stays on popup card');
        assert(await evaluate("(()=>{const card=document.querySelector('[data-popup-card]');return Number(getComputedStyle(card.parentElement).zIndex)>Number(getComputedStyle(document.querySelector('.mobile-bottom-nav')).zIndex)})()"),'Seller popup stays above navigation');
        await screenshot('seller-inline-error');
        await evaluate("[...document.querySelector('[data-popup-card]').querySelectorAll('button')].find(b=>b.querySelector('svg.lucide-x')).click()");
        await evaluate("document.querySelector('.mobile-bottom-nav [data-navigation-id=services]').click()");
        await until("document.querySelector('.mobile-bottom-nav [data-navigation-id=services]').getAttribute('aria-current')==='page'",'Service tab selected');
        await evaluate("document.querySelector('[data-seller-add]').focus();document.activeElement.click()");
        await until("document.querySelector('dialog[aria-label=\"Publish service\"]')?.open",'Seller service form');
        await checkControls('Seller service fields');
        await evaluate("(()=>{const form=document.querySelector('dialog[aria-label=\"Publish service\"] form');form.scrollTop=form.scrollHeight})()");
        await checkControls('Seller service actions');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await pause(100);
        assert(await evaluate("document.activeElement.hasAttribute('data-seller-add')"),'Service form cancellation restores floating shortcut');
        await evaluate("document.querySelector('.mobile-bottom-nav [data-navigation-id=dashboard]').click()");

      }
      await screenshot(who.role+'-mobile');
      if(who===manager){
        await evaluate("[...document.querySelectorAll('button')].find(b=>b.getClientRects().length && /^(Maintenance|Fixes)$/.test(b.textContent.trim()))?.click()");
        await until("[...document.querySelectorAll('span')].some(e=>e.textContent==='View Archived Record (Success)')",'Archived card');
        await evaluate("[...document.querySelectorAll('span')].find(e=>e.textContent==='View Archived Record (Success)').closest('[role=button]').focus()");
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter'});
        await until("document.querySelector('dialog[aria-label=\"Maintenance ticket details\"]')?.open",'Maintenance dialog');
        assert(await evaluate("(()=>{const d=document.querySelector('dialog[aria-label=\"Maintenance ticket details\"]'),r=d.getBoundingClientRect();return d.parentElement===document.body && d.matches(':modal') && r.x===0 && r.y===0 && Math.abs(r.width-innerWidth)<2 && Math.abs(r.height-innerHeight)<2})()"),'Maintenance backdrop covers viewport');
        await screenshot('maintenance-mobile');
        await evaluate("document.querySelector('dialog[aria-label=\"Maintenance ticket details\"] img').click()");
        await until("document.querySelector('dialog[aria-label=\"Image preview\"]')?.open",'Nested image preview');
        assert(await evaluate("document.querySelector('dialog[aria-label=\"Image preview\"]').matches(':modal')"),'Preview is above ticket');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});await pause(200);
        assert(await evaluate("document.querySelector('dialog[aria-label=\"Maintenance ticket details\"]').open"),'Ticket remains open after preview closes');
        await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
      }
      await toggle();await check(who.role+' mobile light');
      await until("!document.querySelector('.theme-toggle')?.title.includes('syncing')",'Preference saved');
    }
    // Another user's light choice cannot replace the first account's saved light/dark mode.
    const stored=JSON.parse(await fs.readFile(path.join(dataDir,'pinevela_store.json'),'utf8'));
    assert(stored.users.every(u=>u.appearanceTheme==='light'));assert.equal(stored.verificationTeams[0].appearanceTheme,'light');
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await toggle();
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.theme-moon span')).animationName"),'none');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.theme-moon')).transitionDuration"),'0s');
    await until("!document.querySelector('.theme-toggle').title.includes('syncing')",'Reduced-motion preference saved');
    await command('Fetch.enable',{patterns:[{urlPattern:'*/api/auth/appearance'}]});rejectAppearanceWrites=true;
    await toggle();
    await until("document.querySelector('.theme-toggle').title.includes('syncing')",'Failed write retains local preference');
    await command('Page.reload');
    await until("document.querySelector('.theme-toggle')?.title.includes('syncing')",'Pending preference survives reload');
    assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
    rejectAppearanceWrites=false;await evaluate("window.dispatchEvent(new Event('online'))");
    await until("!document.querySelector('.theme-toggle').title.includes('syncing')",'Reconnect retries saved preference');
    await command('Fetch.disable');
    await evaluate("(()=>{const b=document.querySelector('.theme-toggle');for(let i=0;i<5;i++)b.click();})()");
    await until("!document.querySelector('.theme-toggle').title.includes('syncing')",'Rapid changes saved in order');
    assert.equal(await evaluate("(async()=>{const r=await fetch('/api/auth/appearance',{headers:{'X-PineVela-Session':'cookie'}});return(await r.json()).theme})()"),'dark');
    await fs.writeFile('/tmp/pinevela-ux-coverage.json',JSON.stringify(uxCoverage,null,2));
    assert.deepEqual(errors,[],'No browser JavaScript errors');console.log('Passed: saved account preferences, public reload persistence, reduced motion, no JavaScript errors');
    console.log('Passed: failed-write reload persistence, reconnect retry, rapid-toggle final preference');
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
