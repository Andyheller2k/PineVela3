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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-listing-benefits-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/assets/' + (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^pinevela-day-.*\.webp$/.test(name));
  const buyer = { id: crypto.randomUUID(), role: 'user', name: 'Isolated buyer', email: 'buyer@example.test', token: crypto.randomUUID(), isVerified: true, appearanceTheme: 'dark' };
  const sellers = ['default','star','pro'].map(plan=>({ id:crypto.randomUUID(), role:'merchant', email:`${plan}@example.test`, name:`Isolated ${plan} seller`, token:crypto.randomUUID(), isVerified:true, isDigitalMarketOnly:true, isApprovedMerchant:true, merchantSetupCompleted:true, appearanceTheme:'dark' }));
  const future = new Date(Date.now()+86400000).toISOString();
  const markets = sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,storeName:`Isolated ${index} market`,status:'active',setupCompleted:true,registrationFeePaid:true,subscriptionPlan:['default','star','pro'][index],subscriptionStatus:'active',subscriptionExpiresAt:future,semesterExpiresAt:future}));
  sellers.forEach((seller,index)=>seller.merchantStoreId=markets[index].id);
  const products=markets.flatMap((market,index)=>[false,true].map(service=>({id:`${index}-${service?'service':'item'}`,storeId:market.id,sellerId:sellers[index].id,sellerEmail:sellers[index].email,storeName:market.storeName,title:`Shared ${service?'service':'item'} ${index}`,description:'Isolated browser regression',category:service?'Services':'Electronics',price:10+index*10,stockQuantity:5,isAvailable:true,isService:service,serviceLocationMode:'flexible',imageUrl})));
  await fs.writeFile(path.join(dataDir,'pinevela_store.json'),sessionFixtureJson({credentialExposureVersion:1,accountSecurityVersion:1,users:[buyer,...sellers],hostels:[],digitalMarketStores:markets,digitalMarketProducts:products,digitalMarketApplications:sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,status:'approved',storeName:markets[index].storeName})),paymentTransactions:markets.map(market=>({id:crypto.randomUUID(),storeId:market.id,purpose:'activation',status:'fulfilled',mode:'free'}))}));
  const appPort = await port(), debugPort = await port(), base = `http://127.0.0.1:${appPort}`;
  let server, chrome, socket; let logs = ''; const errors = []; let sequence = 0; const pending = new Map(); let rejectAppearanceWrites = false;
  try {
    server = spawn(process.execPath, [path.join(project, 'dist/server.cjs')], { cwd: project, detached: true, env: { ...process.env, NODE_ENV: 'production', PORT: String(appPort), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '', PINEVELA_MAIN_ADMIN_ID: '' }, stdio: ['ignore','pipe','pipe'] });
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
    const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const sort=async(value)=>evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>e.querySelector('option[value=featured]'));e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const checkCards=async()=>{
      assert.equal(await evaluate("document.querySelectorAll('[data-listing-id]').length"),6);
      assert(await evaluate("[...document.querySelectorAll('[data-market-plan=star]')].every(e=>e.querySelector('.pinevela-listing-star') && getComputedStyle(e.querySelector('.pinevela-listing-star svg')).filter.includes('drop-shadow'))"),'Star item/service badge glows');
      assert(await evaluate("[...document.querySelectorAll('[data-market-plan=pro]')].every(e=>getComputedStyle(e).borderColor==='rgb(216, 166, 64)' && getComputedStyle(e).boxShadow.includes('inset') && e.querySelector('.pinevela-listing-star'))"),'Pro item/service frames and inherited badge');
      assert(await evaluate("[...document.querySelectorAll('[data-market-plan=default]')].every(e=>!e.querySelector('.pinevela-listing-star') && getComputedStyle(e).borderColor!=='rgb(216, 166, 64)')"),'Default cards have no paid decoration');
      assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No page overflow');
    };
    for(const width of [1440,375]){
      await viewport(width);await open(buyer,'student/dashboard');
      await until("document.querySelectorAll('[data-listing-id]').length===6",'Buyer catalog');
      if(await evaluate("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')"))await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Got It')).click()");
      await fill('input[placeholder="Search marketplace items..."]','Shared');await pause(300);
      assert(await evaluate("[...document.querySelectorAll('[data-listing-id]')].slice(0,2).every(e=>e.dataset.marketPlan==='pro')"),'Pro leads matching search results');
      await checkCards();await screenshot('benefits-buyer-dark-'+width);
      await sort('price-asc');await until("document.querySelector('[data-listing-id]')?.dataset.marketPlan==='default'",'Explicit price sort wins');
      await sort('featured');await until("document.querySelector('[data-listing-id]')?.dataset.marketPlan==='pro'",'Featured restores Pro priority');
      await fill('input[placeholder="Search marketplace items..."]','Shared service');await until("document.querySelectorAll('[data-listing-id]').length===3",'Service search stays filtered');assert.equal(await evaluate("document.querySelector('[data-listing-id]').dataset.marketPlan"),'pro');
      await fill('input[placeholder="Search marketplace items..."]','Shared');await until("document.querySelectorAll('[data-listing-id]').length===6",'Clear service filter');
      await toggle();await checkCards();await screenshot('benefits-buyer-light-'+width);
      console.log('Passed buyer badge/frame/search/sort in dark and light at',width);
      for(const [index,who] of sellers.entries()){
        await open(who,'digital-market');await until("document.querySelector('.mobile-bottom-nav') && document.querySelector('[data-page-tabs]')",'Seller loaded');
        await evaluate("[...document.querySelectorAll('[data-page-tabs]')].find(b=>b.getClientRects().length && /^(Inventory|Stock)/.test(b.textContent.trim())).click()");await until("document.querySelector('[data-listing-id]')",'Seller inventory');
        const plan=['default','star','pro'][index];assert.equal(await evaluate("document.querySelector('[data-listing-id]').dataset.marketPlan"),plan);
        assert.equal(await evaluate("!!document.querySelector('[data-listing-id] .pinevela-listing-star')"),plan!=='default');
        if(plan==='pro')assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-listing-id]')).borderColor"),'rgb(216, 166, 64)');
        await evaluate("[...document.querySelectorAll('[data-page-tabs]')].find(b=>b.getClientRects().length && b.textContent.trim().startsWith('Service')).click()");await until("document.querySelector('[data-listing-id]')?.textContent.includes('Shared service')",'Seller service');
        assert.equal(await evaluate("document.querySelector('[data-listing-id]').dataset.marketPlan"),plan);assert.equal(await evaluate("!!document.querySelector('[data-listing-id] .pinevela-listing-star')"),plan!=='default');
        if(plan==='pro')assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-listing-id]')).borderColor"),'rgb(216, 166, 64)');
        await screenshot('benefits-seller-'+plan+'-'+width);
        await toggle();assert.equal(await evaluate("!!document.querySelector('[data-listing-id] .pinevela-listing-star')"),plan!=='default');if(plan==='pro')assert.equal(await evaluate("getComputedStyle(document.querySelector('[data-listing-id]')).borderColor"),'rgb(216, 166, 64)');await screenshot('benefits-seller-light-'+plan+'-'+width);
      }
    }
    assert.deepEqual(errors,[],'No browser runtime/console errors');console.log('Passed seller item and service benefits for Default/Star/Pro at desktop and mobile widths.');
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
