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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-public-residence-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/store-covers/campus-blue.svg';
  const { hashCredential } = await import('../accountSecurity.ts');
  const password = 'Private-catalog-login-248!';
  const buyer = { id: crypto.randomUUID(), role: 'user', password: hashCredential(password), name: 'Isolated buyer', email: 'buyer@example.test', token: crypto.randomUUID(), isVerified: true, appearanceTheme: 'light' };
  const sellers = ['default','star','pro'].map(plan=>({ id:crypto.randomUUID(), role:'merchant', email:`${plan}@example.test`, name:`Isolated ${plan} seller`, token:crypto.randomUUID(), isVerified:true, isDigitalMarketOnly:true, isApprovedMerchant:true, merchantSetupCompleted:true, appearanceTheme:'dark' }));
  const future = new Date(Date.now()+86400000).toISOString();
  const markets = sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,storeName:`Isolated ${index} market`,status:'active',setupCompleted:true,registrationFeePaid:true,subscriptionPlan:['default','star','pro'][index],subscriptionStatus:'active',subscriptionExpiresAt:future,semesterExpiresAt:future}));
  sellers.forEach((seller,index)=>seller.merchantStoreId=markets[index].id);
  const products=markets.flatMap((market,index)=>[false,true].map(service=>({id:`${index}-${service?'service':'item'}`,storeId:market.id,sellerId:sellers[index].id,sellerEmail:sellers[index].email,storeName:market.storeName,title:`Shared ${service?'service':'item'} ${index}`,description:'Isolated browser regression',category:service?'Services':'Electronics',price:10+index*10,stockQuantity:5,isAvailable:true,isService:service,serviceLocationMode:'flexible',imageUrl})));
  products.find(product=>product.id==='2-service').priceCategories=[{id:'basic',name:'Basic',price:30,imageUrl},{id:'premium',name:'Premium',price:60,imageUrl}];
  const hostels = Array.from({length:5}, (_, index) => ({id:crypto.randomUUID(),name:`Registered residence ${index}`,location:`Campus area ${index}`,managerName:'Authorized property manager',isApproved:true,approvalStatus:'Approved',hostelType:'Hostel',image:imageUrl}));
  const hidden = [{...hostels[0],id:crypto.randomUUID(),name:'Pending residence',isApproved:false,approvalStatus:'Pending Approval'},{...hostels[0],id:crypto.randomUUID(),name:'Deleted residence',isDeleted:true}];
  const rooms = hostels.slice(0,2).map((hostel,index)=>({id:crypto.randomUUID(),hostelId:hostel.id,hostelName:hostel.name,roomNumber:`A-${index}`,roomKey:`TEST-${crypto.randomInt(100000,999999)}`,status:'Available',isAssigned:false}));
  await fs.writeFile(path.join(dataDir,'pinevela_store.json'),sessionFixtureJson({credentialExposureVersion:1,accountSecurityVersion:1,users:[buyer,...sellers],hostels:[...hostels,...hidden],roomKeys:rooms,digitalMarketStores:markets,digitalMarketProducts:products,digitalMarketApplications:sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,status:'approved',storeName:markets[index].storeName})),paymentTransactions:markets.map(market=>({id:crypto.randomUUID(),storeId:market.id,purpose:'activation',status:'fulfilled',mode:'free'}))}));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket; let logs = ''; const errors = []; let sequence = 0; const pending = new Map(); let rejectAppearanceWrites = false;
  try {
    server = spawn(process.execPath, ['--import',path.join(project,'node_modules/tsx/dist/loader.mjs'),path.join(project,'server.ts')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'development', DISABLE_HMR: 'true', PINEVELA_DEV_SIGNUP_CODES: 'true', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: '' }, stdio: ['ignore','pipe','pipe'] });
    server.stdout.on('data', data => logs += data); server.stderr.on('data', data => logs += data);
    for (let i=0;i<600;i++) { try { if ((await fetch(base+'/api/health')).ok) break; } catch {} assert(server.exitCode === null, logs); await pause(100); }
    chrome = spawn(process.env.CHROMIUM_PATH || '/snap/bin/chromium', ['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-features=BackForwardCache','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--no-first-run',`--remote-debugging-port=${debugPort}`,`--user-data-dir=${path.join(temp,'chrome')}`,'about:blank'], {stdio:'ignore'});
    let target; for(let i=0;i<600;i++) { try {target=(await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(t=>t.type==='page'); if(target)break;}catch{} await pause(100); } assert(target,'Chromium did not start');
    socket = new WebSocket(target.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    const command = (method,params={})=>new Promise((resolve,reject)=>{const id=++sequence; const timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});
    socket.onmessage = event=>{const message=JSON.parse(event.data);
      if(message.method==='Page.javascriptDialogOpening' && message.params.type==='beforeunload') { void command('Page.handleJavaScriptDialog',{accept:true}); }
      else if(message.method==='Fetch.requestPaused'){
        if(rejectAppearanceWrites && message.params.request.method==='PUT') void command('Fetch.fulfillRequest',{requestId:message.params.requestId,responseCode:503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify({error:'Isolated unavailable-server check'})).toString('base64')});
        else void command('Fetch.continueRequest',{requestId:message.params.requestId});
      } else if(message.id){const item=pending.get(message.id);if(!item)return;pending.delete(message.id);clearTimeout(item.timer);message.error?item.reject(new Error(message.error.message)):item.resolve(message.result);}else if(message.method==='Runtime.exceptionThrown')errors.push(message.params.exceptionDetails.exception?.description||message.params.exceptionDetails.text);else if(message.method==='Runtime.consoleAPICalled'&&message.params.type==='error')errors.push(message.params.args.map(a=>a.value||a.description).join(' '));};
    await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
    const evaluate = async expression=>{const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const until = async (expression,label)=>{for(let i=0;i<300;i++){if(await evaluate(`Boolean(${expression})`))return;await pause(100);}throw new Error(label+': '+await evaluate('location.hash+" "+document.body.innerText.slice(-1200)')+' '+JSON.stringify(errors));};
    let activeWidth=1440;
    const viewport = width=>{activeWidth=width;return command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<768});};
    const screenshot = async name=>{const result=await command('Page.captureScreenshot',{format:'png'});await fs.writeFile(`/tmp/pinevela-theme-${name}.png`,Buffer.from(result.data,'base64'));};
    const check = async label=>{
      assert(await evaluate('document.documentElement.scrollWidth <= innerWidth+1'),label+' horizontal overflow');
      assert(await evaluate("!!document.querySelector('[role=switch][aria-label=\"Dark mode\"]')"),label+' has toggle');
      assert(!await evaluate("document.body.textContent.includes('This page could not load')"),label+' route error');
      assert(!await evaluate("document.body.textContent.includes('Retry dashboard') || document.body.textContent.includes('Retry resident portal')"),label+' data loaded');
      const dark = await evaluate("document.documentElement.dataset.theme === 'dark'");
      if(dark)assert(await evaluate("(()=>{const p=[...document.querySelectorAll('[class~=text-slate-900],[class~=text-slate-800],[class~=text-blue-950]')].find(e=>e.getClientRects().length);if(!p)return true;return getComputedStyle(p).color.match(/[0-9]+/g).slice(0,3).map(Number).some(n=>n>140)})()"),label+' heading readable');
      console.log('Passed:',label);
    };
    const toggle = async()=>{
      const result = await evaluate("(()=>{const before=document.documentElement.dataset.theme;document.querySelector('[role=switch][aria-label=\"Dark mode\"]').click();const surface=document.querySelector('main')||document.querySelector('nav');return {changed:before!==document.documentElement.dataset.theme,duration:surface?getComputedStyle(surface).transitionDuration:'0s'};})()");
      assert(result.changed, 'Theme updates synchronously without waiting for preference save');
      assert.equal(result.duration, '0s', 'Page surfaces do not run costly theme paint transitions');
      await pause(250);
    };
    const open=async(who,route)=>{await command('Page.navigate',{url:'about:blank'});await command('Network.clearBrowserCookies');await command('Network.setCookie',{name:'pv_auth_token',value:who.token,url:base,httpOnly:true,sameSite:'Strict'});await command('Page.navigate',{url:base+'/#/'+route});};
    const fill=async(selector,value)=>{await until(`!!document.querySelector(${JSON.stringify(selector)})`,'Input '+selector);return evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);};
    const sort=async(value)=>evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>e.querySelector('option[value=featured]'));e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);

    const click = async text => {
      const expression = `(()=>[...(document.querySelector('dialog[open]:last-of-type')||document).querySelectorAll('button')].find(button=>button.getClientRects().length&&button.textContent.trim()===${JSON.stringify(text)}))()`;
      await until(expression,'Available button '+text); await evaluate(`(${expression}).click()`);
    };
    const guest = async route => {
      // Independent journeys use fresh tabs; login reload and continuation are
      // still tested within one tab. Close the previous live dashboard's SSE.
      await command('Network.clearBrowserCookies');
      const oldTarget = target.id, handler = socket.onmessage;
      const created = await command('Target.createTarget', {url:'about:blank'});
      target = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item=>item.id===created.targetId);
      socket.close(); socket = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=handler;
      await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
      await viewport(activeWidth);
      await command('Target.closeTarget',{targetId:oldTarget});
      await command('Page.navigate',{url:base+'/#/'+route});
    };

    const gate = async (signup=false) => {
      await until("document.querySelectorAll('[data-residence-id]').length>=4",'Actual residence cards');
      await evaluate(`document.querySelector('[data-residence-id="${hostels[0].id}"] button').click()`);
      await until("document.querySelector('dialog[aria-label=\"Hostel Accommodation Details\"]')?.open",'Guest details');
      assert(await evaluate(`document.querySelector('dialog').textContent.includes(${JSON.stringify(hostels[0].name)})`));
      await click('Activate Digital Key'); await until("document.querySelector('dialog[aria-label=\"Sign in to PineResidence\"]')?.open",'Activation gate');
      await click(signup?'Sign Up':'Log In'); await until("!!document.querySelector('.login-auth-card input')",'Login route');
      assert(await evaluate("new URLSearchParams(location.hash.split('?')[1]).get('next').includes('residenceAction=activate')"));
    };
    await viewport(1440); await guest('');
    await until("document.querySelectorAll('[data-public-market=preview] [data-listing-id]').length===6 && document.querySelectorAll('[data-public-residence=preview] [data-residence-id]').length===5",'All genuine listings on both rails');
    assert(await evaluate("!!document.querySelector('#public-header [aria-label=\"PineVela home\"] .pinevela-brand-mark')"),'Landing logo restored');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#public-header')).backgroundColor"),'rgb(255, 255, 255)','Landing header is opaque white');
    assert.equal(await evaluate("document.querySelector('#public-header input').placeholder"),'Search for residence and items.');
    assert(await evaluate("(()=>{const m=document.getElementById('pinemarket-section').getBoundingClientRect(),r=document.getElementById('hostels-section').getBoundingClientRect();return r.left>m.left&&Math.abs(r.top-m.top)<1&&getComputedStyle(document.getElementById('hostels-section')).borderLeftWidth==='1px'})()"),'Desktop two columns and divider');
    await evaluate("document.getElementById('catalogs-section').scrollIntoView()");await pause(900);await screenshot('residence-landing-desktop');
    console.log('Passed landing unlimited horizontal catalogs and compact search header');
    if(!process.argv.includes('--continuation-only')) {
    for(const width of [1920,1440,1024,768,375,320]) {
      await viewport(width);
      for(const theme of ['light','dark']) {
        if(await evaluate('document.documentElement.dataset.theme')!==theme)await evaluate("document.querySelector('#public-header .theme-toggle').click()");
        if(width>=1024) {
          await pause(800);
          const alignment=await evaluate("(()=>{const m=document.querySelector('[data-public-market=preview]'),r=document.querySelector('[data-public-residence=preview]'),mc=m.querySelector('.public-catalog-track > *').getBoundingClientRect(),rc=r.querySelector('.public-catalog-track > *').getBoundingClientRect(),mb=[...m.querySelectorAll('button')].find(b=>b.textContent.includes('Explore Market')).getBoundingClientRect(),rb=[...r.querySelectorAll('button')].find(b=>b.textContent.includes('Explore Residence')).getBoundingClientRect();return {top:Math.abs(mc.top-rc.top),bottom:Math.abs(mc.bottom-rc.bottom),buttons:Math.abs(mb.top-rb.top),buttonBottom:Math.abs(mb.bottom-rb.bottom),height:mc.height}})()");
          assert(alignment.top<1&&alignment.bottom<1,'Both desktop card rows align '+JSON.stringify(alignment));
          assert(alignment.buttons<1&&alignment.buttonBottom<1,'Explore buttons share a line '+JSON.stringify(alignment));
        }
        for(const label of ['PineMarket','PineResidence']) {
          const selector=`[aria-label="${label} listings"]`;
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`);await pause(800);
          const layout=await evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(selector)}),r=t.getBoundingClientRect(),c=[...t.children].map(e=>e.getBoundingClientRect());return {count:c.length,singleRow:c.every(e=>Math.abs(e.top-c[0].top)<1),maxThree:c[0].width>=(t.clientWidth-28)/3-1,overflow:t.scrollWidth>t.clientWidth,scrollbar:getComputedStyle(t).scrollbarWidth,webkit:getComputedStyle(t,'::-webkit-scrollbar').display,mask:getComputedStyle(t).maskImage,next:t.parentElement.dataset.canNext,previous:t.parentElement.dataset.canPrevious,bodyOverflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
          assert.equal(layout.count,label==='PineMarket'?6:5);assert(layout.singleRow,'Single row '+width+' '+label);assert(layout.maxThree,'At most three cards fit');assert(layout.overflow,'Other cards scroll');assert(!layout.bodyOverflow,'No page overflow');assert.equal(layout.scrollbar,'none');assert.equal(layout.webkit,'none');assert(layout.mask.includes('linear-gradient'),'Soft edges');
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTo({left:0,behavior:'instant'})`);await pause(100);
          await evaluate(`document.querySelector('button[aria-label="Next ${label} listings"]').click()`);
          await until(`document.querySelector(${JSON.stringify(selector)}).scrollLeft>30`,'Forward scroll');
          await pause(550);
          await until(`document.querySelector(${JSON.stringify(selector)}).parentElement.dataset.canPrevious==='true'`,'Left edge fade becomes available');
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTo({left:99999,behavior:'instant'})`);await pause(300);
          await until(`document.querySelector('button[aria-label="Next ${label} listings"]').disabled`,'End control disables');
          await until(`Number(getComputedStyle(document.querySelector(${JSON.stringify(selector)}).lastElementChild).opacity)>.99`,'New cards reveal from the side');
          await evaluate(`document.querySelector('button[aria-label="Previous ${label} listings"]').click()`);
          await until(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});return t.scrollLeft<t.scrollWidth-t.clientWidth-10})()`,'Backward scroll '+width+' '+label);
          const backward=await evaluate(`(()=>{const t=document.querySelector(${JSON.stringify(selector)});return {left:t.scrollLeft,max:t.scrollWidth-t.clientWidth,disabled:document.querySelector('button[aria-label="Previous ${label} listings"]').disabled,positions:[...t.children].map(e=>e.offsetLeft)}})()`);
          assert(backward.left<backward.max-10,'Backward scroll '+width+' '+label+' '+JSON.stringify(backward));
          await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTo({left:0,behavior:'instant'})`);
        }
        console.log('Passed: both hidden-scrollbar rails '+width+' '+theme);
      }
    }
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await evaluate("document.querySelector('button[aria-label=\"Next PineMarket listings\"]').click()");
    assert(await evaluate("document.querySelector('[aria-label=\"PineMarket listings\"]').scrollLeft>0 && getComputedStyle(document.querySelector('[aria-label=\"PineMarket listings\"]')).scrollBehavior==='auto'"),'Reduced motion scroll is immediate');
    await evaluate("document.querySelector('.public-catalog-track').focus({preventScroll:true})");
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'End',code:'End'});
    assert(await evaluate("(()=>{const t=document.querySelector('.public-catalog-track');return Math.abs(t.scrollLeft-(t.scrollWidth-t.clientWidth))<2})()"),'Keyboard End reaches final card');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Home',code:'Home'});
    assert.equal(await evaluate("document.querySelector('.public-catalog-track').scrollLeft"),0,'Keyboard Home returns to first card');
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight'});
    assert(await evaluate("document.querySelector('.public-catalog-track').scrollLeft>0"),'Keyboard arrows browse cards');
    await command('Emulation.setEmulatedMedia',{features:[]});await viewport(1440);
    await evaluate("[...document.querySelectorAll('.public-catalog-track')].forEach(t=>t.scrollTo({left:0,behavior:'instant'}))");
    }
    const cardClass=await evaluate("document.querySelector('[data-residence-id]').className.split(' ').filter(name=>!['landing-reveal','landing-revealed'].includes(name)).join(' ')");
    await fill('#public-header input','Registered residence 3');await until("document.querySelectorAll('[data-residence-id]').length===1 && document.querySelectorAll('[data-listing-id]').length===0",'Search filters both catalogs');
    await fill('#public-header input','');await click('Explore Residence');
    await until("location.hash==='#/pineresidence'&&document.querySelectorAll('[data-public-residence=catalog] [data-residence-id]').length===5",'Full residence catalog');
    assert(!await evaluate("document.querySelector('main').textContent.includes('Pending residence')||document.querySelector('main').textContent.includes('Deleted residence')"),'Unapproved and deleted residences hidden');
    for(const width of [375,768,1440]) {
      await viewport(width);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No horizontal overflow '+width);
      await evaluate("document.querySelector('[data-residence-id] button').click()");await until("document.querySelector('dialog')?.open",'Details available');
      await screenshot('residence-details-'+width);await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");
      await toggle();await evaluate("document.querySelector('[data-residence-id] button').click()");await until("document.querySelector('dialog')?.open",'Dark details');await screenshot('residence-dark-'+width);await evaluate("document.querySelector('[aria-label=\"Close dialog\"]').click()");await toggle();
    }
    console.log('Passed full public residence catalog, mobile/tablet/desktop details, and both themes');
    assert.equal((await fetch(base+'/api/room-keys/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({roomKey:rooms[0].roomKey})})).status,401,'Guest cannot activate via API');
    await viewport(1440);await gate();
    await command('Page.reload');await pause(500);await until("!!document.querySelector('.login-auth-card input')",'Selection persists on login reload');
    await fill('.login-auth-card input[type=text]',buyer.email);await fill('.login-auth-card input[type=password]',password);await click('Login');
    await until("document.querySelector('dialog[aria-label=\"Resident Room Registration\"]')?.open",'Password login resumes activation');
    assert(await evaluate(`document.querySelector('dialog[aria-label="Resident Room Registration"]').textContent.includes(${JSON.stringify(hostels[0].name)})`));
    assert(!await evaluate("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')"),'First visit does not interrupt continuation');
    await fill('dialog input',rooms[1].roomKey);await click('Verify Key');
    await until("document.querySelector('dialog').textContent.includes('different residence')",'Key from another residence rejected');
    await fill('dialog input',rooms[0].roomKey);await click('Verify Key');
    await until("document.querySelector('dialog').textContent.includes('A-0')",'Selected residence key verifies');
    await evaluate("document.querySelector('dialog button[aria-label=\"Close dialog\"]').click()");
    await until("document.querySelectorAll('[data-residence-id]').length===5",'Same account residence catalog');
    assert.equal(await evaluate("document.querySelector('[data-residence-id]').className"),cardClass,'Public and account cards identical');
    console.log('Passed residence discovery, responsive themes, details, API guest denial, persistent password handoff, and selected-residence key validation');
    await guest('pineresidence');await gate(true);
    const signupEmail=crypto.randomUUID()+'@example.test';
    await fill('.login-auth-card input[type=text]','Isolated signup continuation');await fill('.login-auth-card input[type=email]',signupEmail);
    await fill('.login-auth-card input[placeholder=\"Min. 6 characters\"]',password);await fill('.login-auth-card input[placeholder=\"Repeat password\"]',password);await click('Sign Up Now');
    await until("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Use this code')",'Actual development signup issued');await click('Use this code');await click('Continue in development');
    await until("document.querySelector('dialog[aria-label=\"Resident Room Registration\"]')?.open",'Verified signup resumes activation');
    assert(await evaluate(`document.querySelector('dialog').textContent.includes(${JSON.stringify(hostels[0].name)})`));
    await guest('login');await until("!!document.querySelector('.login-auth-card input')",'Normal login');
    for (const width of [1024,1440]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:700,deviceScaleFactor:1,mobile:false});await pause(200);
      const layout = await evaluate("(()=>{const left=document.querySelector('.login-showcase-pane'),right=document.querySelector('.login-form-pane'),image=document.querySelector('.login-feature-card img'),description=document.querySelector('.login-feature-description');left.scrollTop=100;right.scrollTop=100;return {fixed:left.scrollTop===0&&getComputedStyle(left).overflowY==='clip',formScrollable:right.scrollTop>0,fits:description.getBoundingClientRect().bottom<=left.getBoundingClientRect().bottom+1&&left.scrollHeight<=left.clientHeight+1,imageLoaded:image.naturalWidth>0&&getComputedStyle(image).objectFit==='contain',overflow:document.documentElement.scrollHeight>innerHeight+1}})()");
      assert(layout.fixed&&layout.fits,'Desktop picture and description fit without scrolling '+width);assert(layout.formScrollable,'Login form remains reachable '+width);assert(layout.imageLoaded,'Full picture loads '+width);assert(!layout.overflow,'Desktop viewport stays fixed '+width);
      await screenshot('login-fixed-picture-'+width);
    }
    await viewport(375);assert(await evaluate("getComputedStyle(document.querySelector('.login-showcase-pane')).display==='none'"),'Mobile login unchanged');
    await fill('.login-auth-card input[type=text]',buyer.email);await fill('.login-auth-card input[type=password]',password);await click('Login');
    await until("location.hash==='#/user/dashboard'",'Ordinary login uses default destination');
    console.log('Passed real signup verification handoff, ordinary-login destination, fixed desktop picture and scrollable form, and mobile login layout');
    await guest('pinemarket');await until("document.querySelectorAll('[data-listing-id]').length===6",'Market loaded');await evaluate("document.querySelector('[data-listing-id] button[aria-haspopup=dialog]').click()");await click('Request to Buy');await click('Log In');await until("!!document.querySelector('.login-auth-card input')",'Market login');
    await fill('.login-auth-card input[type=text]',buyer.email);await fill('.login-auth-card input[type=password]',password);await click('Login');
    await until("document.querySelector('dialog[aria-label^=Inspect]')?.textContent.includes('Anti-Scam Guarantee')",'Market login resumes selected purchase');
    assert.deepEqual(errors,[],'No browser runtime errors');console.log('Passed market password-login selection handoff.');
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
