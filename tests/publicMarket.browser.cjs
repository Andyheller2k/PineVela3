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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-public-market-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/assets/' + (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^login-market-.*\.png$/.test(name));
  const buyer = { id: crypto.randomUUID(), role: 'user', name: 'Isolated buyer', email: 'buyer@example.test', token: crypto.randomUUID(), isVerified: true, appearanceTheme: 'dark' };
  const sellers = ['default','star','pro'].map(plan=>({ id:crypto.randomUUID(), role:'merchant', email:`${plan}@example.test`, name:`Isolated ${plan} seller`, token:crypto.randomUUID(), isVerified:true, isDigitalMarketOnly:true, isApprovedMerchant:true, merchantSetupCompleted:true, appearanceTheme:'dark' }));
  const future = new Date(Date.now()+86400000).toISOString();
  const markets = sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,storeName:`Isolated ${index} market`,status:'active',setupCompleted:true,registrationFeePaid:true,subscriptionPlan:['default','star','pro'][index],subscriptionStatus:'active',subscriptionExpiresAt:future,semesterExpiresAt:future}));
  sellers.forEach((seller,index)=>seller.merchantStoreId=markets[index].id);
  const products=markets.flatMap((market,index)=>[false,true].map(service=>({id:`${index}-${service?'service':'item'}`,storeId:market.id,sellerId:sellers[index].id,sellerEmail:sellers[index].email,storeName:market.storeName,title:`Shared ${service?'service':'item'} ${index}`,description:'Isolated browser regression',category:service?'Services':'Electronics',price:10+index*10,stockQuantity:5,isAvailable:true,isService:service,serviceLocationMode:'flexible',imageUrl})));
  products.find(product=>product.id==='2-service').priceCategories=[{id:'basic',name:'Basic',price:30,imageUrl},{id:'premium',name:'Premium',price:60,imageUrl}];
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

    assert.equal((await fetch(base+'/api/digital-market/products')).status,200,'Catalog is public');
    const denied = await fetch(base+'/api/digital-market/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:products[0].id,quantity:1})});
    assert.equal(denied.status,401,'Guests cannot bypass sign-in with a direct order request');
    const goPublic = async()=>{await command('Page.navigate',{url:'about:blank'});await command('Page.navigate',{url:base+'/#/pinemarket'});await until("document.querySelectorAll('[data-public-market=catalog] [data-listing-id]').length===6",'Public catalog loads without authentication');await pause(250);};
    const click = async text=>{
      const expression = `(() => [...(document.querySelector('dialog[open]:last-of-type')||document).querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(text)}))()`;
      await until(expression, 'Button available: '+text);
      return evaluate(`(${expression}).click()`);
    };
    const closePrompt = async()=>evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
    const inspectListing = async service=>{
      await evaluate(`document.querySelector('[data-listing-id="2-${service?'service':'item'}"] button[aria-haspopup=dialog]').click()`);
      await until("document.querySelector('dialog[aria-label^=Inspect]')?.open",'Inspection is available to guests');
      await evaluate("document.querySelector('dialog button[aria-label^=Enlarge]').click()");
      await until("document.querySelector('dialog[aria-label$=photographs]')?.open",'Photographs enlarge');
      await evaluate("document.querySelector('[aria-label=\"Close photographs\"]').click()");
      if(service){await evaluate("[...document.querySelectorAll('dialog[aria-label^=Inspect] button')].find(b=>b.textContent.includes('Premium')).click()");await until("[...document.querySelectorAll('dialog[aria-label^=Inspect] button[aria-pressed=true]')].some(b=>b.textContent.includes('Premium'))",'Service price variants are selectable');}
      await click(service?'Book':'Request to Buy');await until("document.querySelector('dialog[aria-label=\"Sign in to PineMarket\"]')?.open",'Ordering shows sign-in popup');
      assert(await evaluate("document.querySelector('dialog[aria-label=\"Sign in to PineMarket\"]').textContent.includes('Log in or sign up to complete your order')"));
      assert(await evaluate("[...document.querySelectorAll('dialog[aria-label=\"Sign in to PineMarket\"] button')].some(b=>b.textContent==='Log In') && [...document.querySelectorAll('dialog[aria-label=\"Sign in to PineMarket\"] button')].some(b=>b.textContent==='Sign Up')"));
      await closePrompt();await evaluate("document.querySelector('[aria-label=\"Close inspection\"]').click()");
    };
    await viewport(1440);await command('Page.navigate',{url:base+'/#/'});
    await until("document.querySelectorAll('[data-public-market=preview] [data-listing-id]').length===6",'Landing includes every real listing');
    assert(await evaluate("[...document.querySelectorAll('[data-public-market=preview] [data-listing-id]')].slice(0,2).every(e=>e.dataset.marketPlan==='pro')"),'Featured Pro priority on landing');
    assert(await evaluate("!!document.querySelector('[data-public-residence=preview]')"),'Residences section is available');
    await evaluate("document.getElementById('pinemarket-section').scrollIntoView()");await pause(200);await screenshot('pinemarket-landing');
    await click('Explore Market');await until("location.hash==='#/pinemarket'&&document.querySelectorAll('[data-listing-id]').length===6",'Explore opens a separate public page');
    for(const width of [1440,375,320,768]){
      await viewport(width);await goPublic();
      assert.equal(await evaluate("document.querySelectorAll('.mobile-bottom-nav').length"),0,'Public page is outside account dashboard');
      await check('Public PineMarket at '+width);
      const header = await evaluate("(()=>{const h=document.getElementById('public-header'),main=document.querySelector('main');return {signup:[...h.querySelectorAll('button')].some(b=>b.textContent.trim()==='Sign Up'),login:[...h.querySelectorAll('button')].some(b=>b.textContent.trim()==='Login'),about:[...h.querySelectorAll('button')].some(b=>b.textContent.trim()==='About Us'),search:!!h.querySelector('input[placeholder=\"Search for residence and items.\"]'),clearance:main.getBoundingClientRect().top>=h.getBoundingClientRect().bottom-1}})()");
      assert.deepEqual(header,{signup:true,login:true,about:true,search:true,clearance:true});
      assert(await evaluate("[...document.querySelectorAll('[data-listing-id]')].slice(0,2).every(e=>e.dataset.marketPlan==='pro')"));
      await fill('input[placeholder="Search marketplace items..."]','Shared service');await until("document.querySelectorAll('[data-listing-id]').length===3",'Marketplace search');
      await fill('input[placeholder="Search marketplace items..."]','');await click('Electronics');await until("document.querySelectorAll('[data-listing-id]').length===3",'Category filtering');
      await click('Services');await until("document.querySelectorAll('[data-listing-id]').length===3&&document.querySelector('[data-listing-id]').dataset.listingId.includes('service')",'Service filtering');
      await click('All');await sort('price-asc');await until("document.querySelector('[data-listing-id]').dataset.marketPlan==='default'",'Price ascending');
      await sort('price-desc');await until("document.querySelector('[data-listing-id]').dataset.marketPlan==='pro'",'Price descending');
      await sort('newest');assert.equal(await evaluate("document.querySelector('[data-listing-id]').dataset.listingId"),'2-service');await sort('featured');
      await click('Price Filter');await until("document.querySelector('[aria-label=\"Minimum price\"]')",'Price sliders expand');
      await evaluate("(()=>{for(const [name,value]of [['Minimum price',20],['Maximum price',20]]){const e=document.querySelector('input[aria-label=\"'+name+'\"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,value);e.dispatchEvent(new Event('input',{bubbles:true}))}})()");
      await until("document.querySelectorAll('[data-listing-id]').length===2",'Price bounds applied');await click('Reset Price Filter');await click('Price Filter');
      await until("document.querySelectorAll('[data-listing-id]').length===6",'Price reset restores catalog');
      await inspectListing(false);await inspectListing(true);
      await evaluate("document.querySelector('[data-listing-id] button[aria-pressed]').click()");await until("document.querySelector('dialog[aria-label=\"Sign in to PineMarket\"]')?.open",'Guest favourites require an account');await closePrompt();
      await evaluate("document.querySelector('main.public-market-content').scrollTop=0");await pause(100);await screenshot('pinemarket-'+width);await toggle();await check('Public PineMarket alternate theme '+width);await inspectListing(false);await inspectListing(true);await evaluate("document.querySelector('main.public-market-content').scrollTop=0");await pause(100);await screenshot('pinemarket-alternate-'+width);
      await evaluate("(()=>{const m=document.querySelector('main.public-market-content');m.style.paddingBottom='1000px';m.scrollTop=300})()");await pause(100);
      assert(await evaluate("(()=>{const m=document.querySelector('main'),b=document.querySelector('.marketplace-filter-bar'),r=b.getBoundingClientRect();return r.top>=m.getBoundingClientRect().top-1&&r.top<document.getElementById('public-header').getBoundingClientRect().bottom+40})()"),'Filter bar sticks below public header');
      await evaluate("document.querySelector('main.public-market-content').style.removeProperty('padding-bottom')");
      console.log('Passed guest landing/catalog/inspect/order gate/search/filter/sort at',width);
    }
    await goPublic();await evaluate("document.querySelector('[data-listing-id] button[aria-haspopup=dialog]').click()");await click('Request to Buy');await click('Log In');await until("location.hash.startsWith('#/login?next=')",'Log In navigates correctly');
    await goPublic();await evaluate("document.querySelector('[data-listing-id] button[aria-haspopup=dialog]').click()");await click('Request to Buy');await click('Sign Up');await until("location.hash.startsWith('#/login?mode=register&next=')",'Sign Up navigates correctly');await until("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Sign Up Now'))",'Signup form opens');
    await goPublic();await click('About Us');await until("location.hash==='#/?section=about-us' && document.activeElement?.id==='title-about-us'",'About Us continues on landing');assert(!await evaluate("document.querySelector('dialog[aria-label=\"About PineVela\"]')"),'About Us does not open a separate page/dialog');await goPublic();await fill('#public-header input','Campus');await click('Search');await until("location.hash==='#/?search=Campus'",'Header retains residence search navigation');
    await open(buyer,'pinemarket');await until("document.querySelectorAll('[data-listing-id]').length===6 && document.getElementById('public-header').textContent.includes('Logout')",'Authenticated buyer public catalog');await evaluate("document.querySelector('[data-listing-id] button[aria-pressed]').click()");await until("document.querySelector('[data-listing-id] button[aria-pressed] svg').getAttribute('fill')==='#f43f5e'",'Signed-in favourites work');await evaluate("document.querySelector('[data-listing-id] button[aria-haspopup=dialog]').click()");await click('Request to Buy');await until("location.hash.startsWith('#/user/dashboard')",'Signed-in buyer continues through real buyer dashboard');await until("!document.querySelector('[data-public-market]')",'Public route finishes closing');await until("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')?.open || document.querySelector('dialog[aria-label^=Inspect]')?.open",'Buyer handoff becomes ready');if(await evaluate("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')")){await evaluate("[...document.querySelectorAll('dialog[aria-label=\"Welcome to PineVela\"] button')].find(b=>b.textContent.includes('Got It')).click()");}await until("document.querySelector('dialog[aria-label^=Inspect]')?.open && document.querySelector('dialog[aria-label^=Inspect]').textContent.includes('Anti-Scam Guarantee')",'Selected listing carries to authenticated order workflow');await click('Request to Buy');await until("document.querySelector('dialog[aria-label=\"Request to Buy or Book\"]')?.open",'Real authenticated order form opens');
    assert.deepEqual(errors,[],'No browser runtime errors');console.log('Passed public routes, auth links, direct API denial, and authenticated purchase handoff.');
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
