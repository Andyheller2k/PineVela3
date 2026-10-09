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
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-storefront-browser-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const imageUrl = '/assets/' + (await fs.readdir(path.join(project, 'dist/assets'))).find(name => /^login-market-.*\.png$/.test(name));
  const buyer = { id: crypto.randomUUID(), role: 'user', name: 'Isolated buyer', email: 'buyer@example.test', token: crypto.randomUUID(), isVerified: true, appearanceTheme: 'light' };
  const sellers = ['default','star','pro'].map(plan=>({ id:crypto.randomUUID(), role:'merchant', email:`${plan}@example.test`, name:`Isolated ${plan} seller`, token:crypto.randomUUID(), isVerified:true, isDigitalMarketOnly:true, isApprovedMerchant:true, merchantSetupCompleted:true, appearanceTheme:'dark' }));
  const future = new Date(Date.now()+86400000).toISOString();
  const markets = sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,storeName:`Isolated ${index} market`,status:'active',setupCompleted:true,registrationFeePaid:true,location:'Registered campus location',category:'Electronics',description:'Seller-owned store description',phone:'+233241234567',phoneCountry:'GH',deliveryMode:'Campus Delivery',university:'Registered university',subscriptionPlan:['default','star','pro'][index],subscriptionStatus:'active',subscriptionExpiresAt:future,semesterExpiresAt:future}));
  sellers.forEach((seller,index)=>seller.merchantStoreId=markets[index].id);
  const products=markets.flatMap((market,index)=>[false,true].map(service=>({id:`${index}-${service?'service':'item'}`,storeId:market.id,sellerId:sellers[index].id,sellerEmail:sellers[index].email,storeName:market.storeName,title:`Shared ${service?'service':'item'} ${index}`,description:'Isolated browser regression',category:service?'Services':'Electronics',price:10+index*10,stockQuantity:5,isAvailable:true,isService:service,serviceLocationMode:'flexible',imageUrl})));
  products.find(product=>product.id==='2-service').priceCategories=[{id:'basic',name:'Basic',price:30,imageUrl},{id:'premium',name:'Premium',price:60,imageUrl}];
  const activating={id:crypto.randomUUID(),role:'merchant',name:'New approved merchant',email:'activating@example.test',token:crypto.randomUUID(),isDigitalMarketOnly:true,isApprovedMerchant:true,merchantSetupCompleted:false,merchantRegistrationFeePaid:false,merchantStoreId:crypto.randomUUID()};
  const newStore={id:activating.merchantStoreId,studentEmail:activating.email,storeName:'New approved store',status:'pending_setup',setupCompleted:false,registrationFeePaid:false};
  const completed={id:crypto.randomUUID(),buyerId:buyer.id,buyerEmail:buyer.email,storeId:markets[2].id,productId:'2-item',sellerEmail:sellers[2].email,status:'Completed & Paid'};
  const rating={id:crypto.randomUUID(),orderId:completed.id,buyerId:buyer.id,storeId:markets[2].id,productId:'2-item',sellerEmail:sellers[2].email,rating:5,purchaseVerifiedVersion:1};
  products.push({...products.find(p=>p.id==='2-item'),id:'2-unpublished',title:'Unpublished store item',isAvailable:false});
  await fs.writeFile(path.join(dataDir,'pinevela_store.json'),sessionFixtureJson({credentialExposureVersion:1,accountSecurityVersion:1,users:[buyer,...sellers,activating],hostels:[],digitalMarketStores:[...markets,newStore],digitalMarketProducts:products,digitalMarketOrders:[completed],digitalMarketRatings:[rating],digitalMarketApplications:[...sellers.map((seller,index)=>({id:crypto.randomUUID(),userId:seller.id,studentEmail:seller.email,status:'approved',storeName:markets[index].storeName})),{id:crypto.randomUUID(),studentEmail:activating.email,status:'approved',fullName:activating.name,university:'Registered campus',categoryToSell:'Laptops, Phones & Computing Gear',phone:'+233241234567'}],paymentTransactions:markets.map(market=>({id:crypto.randomUUID(),storeId:market.id,purpose:'activation',status:'fulfilled',mode:'free'})),platformSettings:{registrationFee:0,semesterFee:0,subscriptionPrices:{default:0,star:0,pro:0},maintenanceMode:false}}));
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
    let activeWidth=1440;
    const open=async(who,route)=>{
      const oldTarget=target.id,handler=socket.onmessage;
      await command('Network.clearBrowserCookies');
      const created=await command('Target.createTarget',{url:'about:blank'});
      target=(await(await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find(item=>item.id===created.targetId);
      socket.close();socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});socket.onmessage=handler;
      await command('Page.enable');await command('Page.bringToFront');await command('Runtime.enable');await command('Network.enable');
      await command('Target.closeTarget',{targetId:oldTarget});
      await viewport(activeWidth);
      if(who)await command('Network.setCookie',{name:'pv_auth_token',value:who.token,url:base,httpOnly:true,sameSite:'Strict'});
      await command('Page.navigate',{url:base+'/#/'+route});
    };

    const fill=async(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const sort=async(value)=>evaluate(`(()=>{const e=[...document.querySelectorAll('select')].find(e=>e.querySelector('option[value=featured]'));e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);

    const click=async text=>{
      const expression=`(()=>[...(document.querySelector('dialog[open]:last-of-type')||document).querySelectorAll('button')].find(button=>button.getClientRects().length&&button.textContent.trim()===${JSON.stringify(text)}))()`;
      await until(expression,'Button '+text);await evaluate(`(${expression}).click()`);
    };
    const choose=async(selector,value)=>evaluate(`(()=>{const field=document.querySelector(${JSON.stringify(selector)});field.value=${JSON.stringify(value)};field.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const upload=async label=>{
      await command('DOM.enable');await command('Page.setInterceptFileChooserDialog',{enabled:true});
      const documentNode=await command('DOM.getDocument');const input=await command('DOM.querySelector',{nodeId:documentNode.root.nodeId,selector:`input[type=file][aria-label="${label}"]`});
      const image=(await fs.readdir(path.join(project,'dist/assets'))).find(name=>/^login-market-.*\.png$/.test(name));
      await command('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path.join(project,'dist/assets',image)]});
      await until(`document.querySelector('img[alt="${label}"]')?.src.includes('/uploads/')`,'Actual '+label+' upload');
    };
    await open(activating,'digital-market/onboard');await until("document.querySelector('input')&&document.body.textContent.includes('Continue to Campus Location')",'Approved seller setup');
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"PineVela cover collection\"] button').length"),4);assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Store branding\"] input[type=file]').length"),0,'Default activation has no custom uploads');await evaluate("document.querySelector('button[aria-label=\"Use Forest Glass cover\"]').click()");await click('Continue to Campus Location');
    await until("document.querySelector('select[aria-label=\"Delivery / Handover Mode\"]')",'Delivery selection dropdown');await choose('select[aria-label="Delivery / Handover Mode"]','Store Pickup');
    await fill('input[type=tel]','201234567');await click('Continue to Secure Checkout');await click('Continue and activate store');
    await until("location.hash==='#/digital-market'&&[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Store Profile')",'Real free-fee activation completes');await click('Store Profile');
    await until("document.querySelector('[aria-label=\"Store profile\"]')?.textContent.includes('Store Pickup')",'Delivery survives activation');assert(await evaluate("document.querySelector('[aria-label=\"Store profile\"]').textContent.includes('+233201234567')"));
    await command('Page.reload');await pause(500);await until("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Store Profile')",'Activated store reload');await click('Store Profile');await until("document.querySelector('select[aria-label=\"Delivery / Handover Mode\"]')?.value==='Store Pickup'",'Persisted delivery prefill');
    console.log('Passed Default store activation with four covers, standard logo, locked custom uploads, delivery/contact persistence');
    await open(sellers[2],'digital-market');await until("[...document.querySelectorAll('button')].some(button=>button.textContent.trim()==='Store Profile')",'Seller dashboard');await click('Store Profile');
    await until("document.querySelector('select[aria-label=\"Delivery / Handover Mode\"]')?.value==='Campus Delivery'",'Original activation field is visible');
    await fill('#prof-group-username input','registered-merchant');await choose('select[aria-label="Delivery / Handover Mode"]','Courier Delivery');await fill('input[type=tel]','201234567');await upload('Upload Store Cover');await upload('Upload Store Logo');await click('Save Store Changes');
    await until("document.querySelector('[aria-label=\"Store profile\"]')?.textContent.includes('Courier Delivery')",'Seller saved delivery');
    assert(await evaluate("document.querySelector('[aria-label=\"Store profile\"]').textContent.includes('5.0 (1 review)')"),'Seller rating shown');
    await open(null,'pinemarket');await until("document.querySelector('[data-listing-id=\"2-item\"]')",'Public listing');await evaluate("document.querySelector('[data-listing-id=\"2-item\"] button[aria-haspopup=dialog]').click()");await click('View Store');
    await until(`document.querySelector('[data-market-storefront="${markets[2].id}"]')`,'Public View Store destination');
    assert.equal(await evaluate("document.querySelectorAll('[data-market-storefront] [data-listing-id]').length"),2,'Only this seller published items and services');
    assert(!await evaluate("document.body.textContent.includes('Unpublished store item')"),'Hidden listing excluded');
    assert(await evaluate("document.querySelector('[aria-label=\"Store profile\"]').textContent.includes('Courier Delivery')&&document.querySelector('[aria-label=\"Store profile\"]').textContent.includes('+233201234567')"),'Buyer sees persisted delivery and contact');
    assert(await evaluate("document.querySelector('[aria-label=\"Store rating\"]').textContent.includes('5.0 (1 review)')"),'Actual verified rating visible');
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=\"Store profile\"] input,[data-market-storefront] input[type=file],button[aria-label=\"Save Store Changes\"]').length"),0,'Buyer has no profile or upload editor');
    await until("[...document.querySelectorAll('[aria-label=\"Store profile\"] img')].length===2&&[...document.querySelectorAll('[aria-label=\"Store profile\"] img')].every(image=>image.naturalWidth>0&&image.src.includes('/uploads/'))",'Actual uploaded branding loads');
    if(await evaluate("document.documentElement.dataset.theme==='dark'")){await evaluate("document.querySelector('[data-market-storefront] [role=switch]').click()");await pause(250);}
    for(const width of [1440,768,375]){
      await viewport(width);await pause(200);assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Store fits '+width);await screenshot('storefront-'+width);
      await evaluate("document.querySelector('[data-market-storefront] [role=switch]').click()");await pause(200);assert(await evaluate("document.documentElement.dataset.theme==='dark'"),'Dark theme switching');await screenshot('storefront-dark-'+width);await evaluate("document.querySelector('[data-market-storefront] [role=switch]').click()");
    }
    await click('Message Store');await until("document.querySelector('dialog[aria-label=\"Sign in to message store\"]')?.open",'Guest message requires sign-in');await click('Log In');await until("location.hash.includes('marketStore')&&!!document.querySelector('.login-auth-card')",'Store messaging carries login selection');
    await open(buyer,`user/dashboard?marketItem=2-item`);await until("document.querySelector('dialog[aria-label^=Inspect]')?.open",'Buyer inspection');await click('View Store');await until("document.querySelector('dialog[aria-label=\"Merchant storefront\"]')?.open&&!!document.querySelector('[data-market-storefront]')",'Account storefront');
    await click('Message Store');await until("!!document.querySelector('dialog[aria-label^=Message] textarea')",'Actual seller message form');
    await evaluate("(()=>{const e=document.querySelector('dialog[aria-label^=Message] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'Is the listed service available tomorrow?');e.dispatchEvent(new Event('input',{bubbles:true}));})()");await evaluate("document.querySelector('dialog[aria-label^=Message] button[aria-label=\"Send message\"]').click()");
    await until("document.querySelector('dialog[aria-label^=Message]')?.textContent.includes('Is the listed service available tomorrow?')",'Buyer inquiry persisted');
    await evaluate("document.querySelector('[aria-label=\"Close store messages\"]').click()");await evaluate("document.querySelector('[data-market-storefront] [data-listing-id=\"2-service\"] button[aria-haspopup=dialog]').click()");await until("document.querySelector('dialog[aria-label^=Inspect]')?.textContent.includes('Shared service 2')",'Store service opens normal inspection');
    await click('Book');await until("document.querySelector('dialog[aria-label=\"Request to Buy or Book\"]')?.open",'Normal booking form preserved');
    console.log('Passed seller profile editing, public/buyer storefronts, published listings, verified rating, responsive themes, buyer messaging and existing booking workflow');
    await open(sellers[2],'digital-market');const messageTab="[...document.querySelectorAll('button[data-page-tabs]')].find(button=>button.getClientRects().length&&[...button.querySelectorAll('span')].some(span=>span.textContent.trim()==='Messages'))";await until(messageTab,'Seller messages navigation');await evaluate(`(${messageTab}).click()`);
    await until("document.querySelector('[aria-label=\"Buyer messages\"]')?.textContent.includes('Is the listed service available tomorrow?')",'Seller receives store inquiry');
    await open(buyer,`user/dashboard?marketStore=${markets[2].id}&storeAction=message`);await until("document.querySelector('dialog[aria-label^=Message]')?.open",'Login continuation opens store conversation');
    assert.deepEqual(errors,[],'No Chromium runtime errors');console.log('Passed independent seller inbox delivery and store-message login continuation');
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
