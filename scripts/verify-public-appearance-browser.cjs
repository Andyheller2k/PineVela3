/** Built app pages in disposable Chromium with local, read-only visual fixtures.
 * Synthetic role responses only drive the frontend; authentication and server
 * authorization are not tested. No live account or hosted API is contacted. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve('dist-supabase'),output=process.env.PINEVELA_THEME_OUTPUT||'/tmp/pinevela-public-appearance-20261028';
 await fs.mkdir(output,{recursive:true});await fs.rm(output+'/failure.json',{force:true});
 const apiRequests=[],mutations=[];
 const products=Array.from({length:3},(_,i)=>({id:'browser-fixture-item-'+i,storeId:'browser-fixture-store',storeName:'Campus fixture store',title:['Study essentials','Campus headphones','Everyday backpack'][i],description:'Local browser-test fixture.',price:30+i*20,category:'Education',imageUrl:'/icons/pinevela-192.png',stockQuantity:3,status:'Available'}));
 const hostels=Array.from({length:3},(_,i)=>({id:'browser-fixture-residence-'+i,name:['Campus residence','Garden residence','Student residence'][i],location:'Local browser fixture',isApproved:true,managerName:'Fixture manager',hostelType:'Hostel'}));
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname,referer=new URL(req.headers.referer||'/','http://127.0.0.1');
   const role=referer.searchParams.get('visual_role'),theme=referer.searchParams.get('visual_theme')||'system';
   const user=role&&['user','student','manager','staff','admin','merchant','field_officer'].includes(role)?{id:'theme-fixture-'+role,role,name:'Visual fixture '+role,email:'theme-fixture-'+role+'@pinevela.invalid',isVerified:true,hasCustomerServiceAccess:true,hasApprovedHostel:false}:null;
   if(route.startsWith('/api/')){
    apiRequests.push(route);res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    if(req.method!=='GET'){mutations.push(route);res.writeHead(405);return res.end('{}');}
    if(route==='/api/auth/me'){if(user)return res.end(JSON.stringify(user));res.writeHead(401);return res.end('{}');}
    if(route==='/api/settings')return res.end(JSON.stringify({maintenanceMode:false,contactDetails:{linkedinUrl:'',whatsappNumber:'',facebookUrl:'',tiktokUrl:''},registrationFee:0,semesterFee:0,commission:0,subscriptionPrices:{default:0,star:0,pro:0},announcement:''}));
    if(route==='/api/digital-market/products')return res.end(JSON.stringify(products));
    if(route==='/api/hostels')return res.end(JSON.stringify(hostels));
    if(route==='/api/digital-market/stores/browser-fixture-store')return res.end(JSON.stringify({store:{id:'browser-fixture-store',storeName:'Campus fixture store',description:'Read-only visual fixture for the theme audit.',category:'Education',location:'Campus',ratingCount:0},products}));
    if(user){
     const json=data=>res.end(JSON.stringify(data));
     if(route==='/api/auth/appearance')return json({theme});
     if(route==='/api/auth/enrollments')return json([]);
     if(route==='/api/auth/account-access')return json({restrictions:[]});
     if(route==='/api/auth/maintenance-notice')return json({serverTime:new Date().toISOString(),notice:null});
     if(route==='/api/student/my-profile')return json({user,rooms:[]});
     if(route==='/api/student/my-rooms')return json({rooms:[]});
     if(route==='/api/manager/my-hostel')return json({hostel:null});
     if(route==='/api/users/my-registered-accounts')return json({managerAccount:null,residentAccount:null,merchantAccount:null});
     if(route==='/api/users/manager-onboarding')return json({registrations:{managerAccount:null},policy:{googleManagerEnrollment:false},enrollments:[],access:{restriction:null,serverTime:new Date().toISOString()}});
     if(route==='/api/digital-market/status'&&referer.searchParams.has('visual_registration'))return json({application:{id:'theme-fixture-pending',status:'pending',accountStatus:referer.searchParams.get('visual_registration')==='restricted'?'restricted':'active',storeName:'Visual fixture store'},store:null});
     if(route==='/api/digital-market/status')return json({application:user.role==='merchant'?{id:'theme-fixture-application',status:'approved',storeName:'Visual fixture store'}:null,store:user.role==='merchant'?{id:'browser-fixture-store',storeName:'Visual fixture store',category:'Education',location:'Campus',description:'Read-only theme fixture.',subscriptionPlan:'default',ratingCount:0,setupCompleted:referer.searchParams.get('visual_setup')!=='pending',registrationFeePaid:true}:null});
     if(route==='/api/digital-market/my-orders')return json({orders:[],nextCursor:null,hasMore:false,summary:{total:0,pending:0,completed:0,revenue:0},customers:[]});
     if(route==='/api/admin/dashboard-directories')return json({residences:[],managerRestrictions:[],boardRequests:[],activities:[],digitalMarketApps:[],digitalMarketStores:[],paymentRecords:[],allUsersData:{totalUsers:0,breakdown:Object.fromEntries(['total','residents','managers','staff','officers','merchants','admins','others'].map(key=>[key,0])),users:[]}});
     if(route==='/api/customer-service/tickets')return json({tickets:[],members:[],hasMore:false,emailConfigured:true});
     if(route==='/api/staff')return json(user.role==='staff'?[{id:user.id,userId:user.id,name:user.name,email:user.email,role:'Maintenance',status:'Active',hostelName:'Visual fixture residence'}]:[]);
     if(['/api/admin-messages/pending','/api/notifications','/api/digital-market/inventory','/api/issue-reports','/api/staff/invitations','/api/staff-bargains','/api/board-requests','/api/activities','/api/room-keys','/api/manager-verifications','/api/admin/verification-inspections','/api/verification-teams','/api/verification-team/my-inspections','/api/digital-market/conversations'].includes(route))return json([]);
    }
    res.writeHead(404);return res.end('{}');
   }
   let relative=decodeURIComponent(route).replace(/^\/+/,''),file=path.resolve(root,relative||'index.html');
   if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   let data;try{data=await fs.readFile(file);}catch{res.writeHead(404);return res.end('No test file');}
   const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.otf':'font/otf','.ttf':'font/ttf','.woff2':'font/woff2','.webmanifest':'application/manifest+json'}[path.extname(file)]||'application/octet-stream';
   res.setHeader('Content-Type',mime);res.setHeader('Cache-Control','no-store');res.end(data);
  }catch{res.writeHead(500);res.end('Fixture server error');}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port,profile=await fs.mkdtemp('/tmp/pinevela-public-theme-browser-');
 const chrome=spawn(process.env.CHROME_BIN||'/snap/chromium/current/usr/lib/chromium-browser/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-pipe',`--user-data-dir=${profile}`,'about:blank'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let sequence=0,buffer='',stderr='',scenario='startup',seedScript,debug=async()=>({});const pending=new Map(),checks=[],screenshots=[],exceptions=[];
 chrome.stderr.on('data',c=>{stderr=(stderr+c).slice(-1500)});
 chrome.stdio[4].on('data',c=>{buffer+=c;let end;while((end=buffer.indexOf('\0'))>=0){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const m=JSON.parse(raw);if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);const p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error.message)):p.resolve(m.result);}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timed out: '+stderr))},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  debug=()=>evaluate('({url:location.href,title:document.title,text:document.body?.innerText.slice(0,1200),root:!!document.getElementById("root"),scripts:[...document.scripts].map(s=>s.src).filter(Boolean),dataset:{...document.documentElement.dataset}})');
  const until=async(expression,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(50);}throw new Error(label+' did not settle');};
  const os=async dark=>{await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:dark?'dark':'light'},{name:'prefers-reduced-motion',value:'reduce'}]});await pause(80);};
  const viewport=width=>command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});
  const load=async(route,preference,systemDark=false,visual={})=>{
   if(seedScript)await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript});
   const seed=Date.now()+'-'+Math.random();
   seedScript=(await command('Page.addScriptToEvaluateOnNewDocument',{source:`if(sessionStorage.getItem('public-theme-case')!==${JSON.stringify(seed)}){localStorage.clear();${preference?`localStorage.setItem('pinevela:appearance',${JSON.stringify(preference)});`:''}sessionStorage.setItem('public-theme-case',${JSON.stringify(seed)})}`})).identifier;
   await os(systemDark);const url=new URL(route,origin);url.searchParams.set('scene',seed);if(visual.role){url.searchParams.set('visual_role',visual.role);url.searchParams.set('visual_theme',preference||'system');if(visual.setup)url.searchParams.set('visual_setup',visual.setup);if(visual.registration)url.searchParams.set('visual_registration',visual.registration);}await command('Page.navigate',{url:url.href});
   await until(`location.search===${JSON.stringify(url.search)}&&document.readyState==='complete'`,'New document');
   const selector=visual.selector||(route.includes('privacy.html')||route.includes('terms.html')?'.document':route.includes('/faq')?'input[type=search]':route.includes('/help')?'textarea':route.includes('/why-us')?'.why-us-pair':route.includes('/pinemarket/stores/')?'[data-market-storefront]':route.includes('/pinemarket')?'[data-listing-id]':route.includes('/pineresidence')?'[data-public-residence] h1':route.includes('/support-invitation')?'.support-surface h1':'.landing-peak-hero');
   await until(`!!document.querySelector(${JSON.stringify(selector)})`,'Public page mounts');await pause(180);
  };
  const capture=async(name,clip)=>{const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!clip,...(clip?{clip}:{})});const file=path.join(output,name+'.png');await fs.writeFile(file,Buffer.from(shot.data,'base64'));screenshots.push(file);};
  const contrast=(a,b)=>{const l=v=>v.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);const x=l(a),y=l(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
  const color=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const composite=(paint,base)=>paint.slice(0,3).map((c,i)=>c*(paint[3]??1)+base[i]*(1-(paint[3]??1)));
  const glassGeometry=new Map();
  const sceneFilter=process.env.PINEVELA_THEME_SCENES?new RegExp(process.env.PINEVELA_THEME_SCENES):null;
  const test=async(name,run)=>{if(sceneFilter&&!sceneFilter.test(name))return;scenario=name;await run();checks.push(name);console.log('PASS '+name);};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');
  await command('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*','https://tile.openstreetmap.org/*']});
  const marketGeometry=()=>evaluate(`(()=>{const rect=e=>{if(!e||!e.getClientRects().length)return null;const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom}},home=document.getElementById('home-market-section');return{viewport:{width:innerWidth,height:innerHeight},switcher:rect(document.querySelector('.user-catalog-switcher')),header:rect(home?.querySelector('.user-market-header')),toolbar:rect(home?.querySelector('.marketplace-filter-bar')),search:rect(home?.querySelector('input[aria-label="Search marketplace items"]')),sort:rect(home?.querySelector('.marketplace-filter-controls .market-sort-control')),count:rect(home?.querySelector('.market-item-count')),categories:rect(home?.querySelector('.market-categories')),firstCard:rect(home?.querySelector('[data-listing-id]')),secondCard:rect(home?.querySelectorAll('[data-listing-id]')[1]),merchant:rect(home?.querySelector('[data-registration-button=merchant]')),nearby:rect(home?.querySelector('.user-nearby-services')),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  const primaryMarket=async(width,theme)=>{
   await viewport(width);await load('/#/user/dashboard',theme,theme==='light',{role:'user',selector:'.user-dashboard [data-dashboard-view]'});
   await until("document.querySelectorAll('#home-market-section [data-listing-id]').length===3",'Real dashboard catalog mounts');
   if(await evaluate("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')"))await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"] [aria-label=\"Close dialog\"]').click()");
   await until("!document.querySelector('dialog[open]')",'Welcome closes without an API write');await evaluate('document.fonts.ready.then(()=>true)');await pause(300);
  };
  if(process.env.PINEVELA_MARKET_BASELINE==='1'){
   const baseline={};
   for(const width of [320,390,430,640,1024,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market layout baseline`,async()=>{
    await primaryMarket(width,theme);baseline[`${width}-${theme}`]=await marketGeometry();await capture(`${width}-${theme}-market-before`);
   });
   await fs.writeFile('/tmp/pinevela-mobile-market-before-20261028.json',JSON.stringify(baseline,null,2)+'\n');
  }
  if(process.env.PINEVELA_MARKET_AUDIT==='1'){
   const baseline=JSON.parse(await fs.readFile('/tmp/pinevela-mobile-market-before-20261028.json','utf8')),measured={};
   for(const width of [320,390,430,640,1024,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market layout audit`,async()=>{
    await primaryMarket(width,theme);const now=await marketGeometry(),before=baseline[`${width}-${theme}`];measured[`${width}-${theme}`]=now;
    assert.equal(now.overflow,false);assert(now.firstCard&&now.secondCard,'Actual fixture items render');
    assert.equal(now.header,null,'The repeated intro/action block is removed');assert.equal(now.sort,null);assert.equal(now.count,null);assert.equal(now.merchant,null);
    assert.equal(now.toolbar.height,44,'Search and Filters share one compact row');assert(now.search.height>=44);
    assert.equal(now.firstCard.y,now.secondCard.y,'At least two cards fit on the first row');assert.equal(now.firstCard.height,before.firstCard.height,'Product pictures and card dimensions stay intact');
    assert(before.firstCard.y-now.firstCard.y>=150,'Cards gain at least 150px of viewport space at every width');
    if(width<1024)assert(now.firstCard.bottom<await evaluate("document.querySelector('.user-bottom-navigation').getBoundingClientRect().top"),'The whole first row fits above bottom navigation');
    else assert(now.firstCard.bottom<900,'The first desktop row fits in view');
    assert.equal(await evaluate("document.querySelector('#home-market-section .market-price-toggle').innerText.trim()"),'Filters');
    assert(await evaluate("(()=>{const row=document.querySelector('#home-market-section .market-categories');return [...row.querySelectorAll('button')].every(b=>b.getBoundingClientRect().y===row.firstElementChild.getBoundingClientRect().y)})()"),'Category chips stay on one row');
    if(width<640)assert(await evaluate("(()=>{const row=document.querySelector('#home-market-section .market-categories');return row.scrollWidth>row.clientWidth})()"),'Narrow categories scroll horizontally');
    await capture(`${width}-${theme}-market-after`);
   });
   if(Object.keys(measured).length)await fs.writeFile('/tmp/pinevela-mobile-market-after-20261028.json',JSON.stringify(measured,null,2)+'\n');
   const setValue=(selector,value,type='input')=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(${type==='change'?'HTMLSelectElement':'HTMLInputElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${JSON.stringify(type)},{bubbles:true}));})()`);
   const key=async(key,code,virtualKey)=>{await command('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtualKey,...(code==='Enter'?{text:'\r'}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtualKey});};
   for(const width of [320,390,430,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} market interaction`,async()=>{
    await primaryMarket(width,theme);
    const opener='#home-market-section .market-price-toggle',sheet='dialog[aria-label="Marketplace filters"]';
    await evaluate(`document.querySelector(${JSON.stringify(opener)}).focus()`);await key(' ','Space',32);await until(`!!document.querySelector('${sheet}[open]')`,'Keyboard opens combined filters');
    assert(await evaluate(`document.querySelector('${sheet} [aria-label="Sort marketplace"]').getClientRects().length>0`));assert(await evaluate(`!!document.querySelector('${sheet} [aria-label="Minimum price"]')`));
    const panel=await evaluate(`(()=>{const e=document.querySelector('${sheet}>section'),r=e.getBoundingClientRect(),h=e.querySelector('h2'),p=e.querySelector('.market-filter-footer p');return{width:r.width,height:r.height,y:r.y,bottom:r.bottom,viewport:innerWidth,screen:innerHeight,heading:getComputedStyle(h).color,text:getComputedStyle(p).color,background:getComputedStyle(document.documentElement).backgroundColor,panelBackground:getComputedStyle(e).backgroundColor}})()`);
    if(theme==='light')assert.equal(panel.panelBackground,'rgb(255, 255, 255)','The entire light sheet has a readable white surface');
    assert(panel.width<=panel.viewport&&panel.height<panel.screen);if(width>=640)assert(Math.abs(panel.y+panel.height/2-panel.screen/2)<1,'Desktop filters are centered');else assert(Math.abs(panel.screen-panel.bottom-10)<1,'Phone filters use a bottom sheet');assert(contrast(color(panel.heading),color(panel.background))>=4.5);assert(contrast(color(panel.text),color(panel.background))>=4.5);
    await capture(`${width}-${theme}-combined-filters`);
    await setValue(`${sheet} [aria-label="Sort marketplace"]`,'price-desc','change');
    await until("document.querySelector('#home-market-section [data-listing-id]')?.dataset.listingId==='browser-fixture-item-2'",'Sorting updates actual cards');
    await evaluate(`document.querySelector('${sheet} [aria-label="GHS 100 to 500"]').click()`);await until(`document.querySelector('${sheet} [role=status]')?.textContent==='0 matching items'`,'Price selection updates result count');
    await evaluate(`document.querySelector('${sheet} .market-filter-footer button').click()`);await until(`!document.querySelector('${sheet}[open]')`,'Show results closes sheet');
    assert(await evaluate("document.querySelector('#home-market-section').innerText.includes('No items match your criteria')"));
    await evaluate(`document.querySelector(${JSON.stringify(opener)}).click()`);await until(`!!document.querySelector('${sheet}[open]')`,'Filters reopen');
    assert.equal(await evaluate(`document.querySelector('${sheet} [aria-label="Sort marketplace"]').value`),'price-desc','Sort persists while sheet is closed');
    await evaluate(`document.querySelector('${sheet} [aria-label="Reset price filters"]').click()`);await until(`document.querySelector('${sheet} [role=status]')?.textContent==='3 matching items'`,'Reset restores available products');
    await evaluate(`document.querySelector('${sheet} .market-filter-footer button').focus()`);await key('Tab','Tab',9);assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Close marketplace filters','Keyboard focus stays in the sheet');
    await key('Escape','Escape',27);await until(`!document.querySelector('${sheet}[open]')`,'Escape closes sheet');assert(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(opener)})`),'Focus returns to Filters');
    assert.equal(await evaluate("document.querySelector('#home-market-section .market-price-toggle').dataset.filtered"),'true','Non-default sorting remains indicated');
    await setValue('#home-market-section [aria-label="Search marketplace items"]','headphones');await until("document.querySelectorAll('#home-market-section [data-listing-id]').length===1",'Search keeps working');await evaluate("document.querySelector('#home-market-section [aria-label=\"Clear search\"]').click()");await until("document.querySelectorAll('#home-market-section [data-listing-id]').length===3",'Clear restores cards');
    await evaluate("[...document.querySelectorAll('#home-market-section .market-categories button')].find(b=>b.textContent==='Services').click()");await until("!!document.querySelector('.market-nearby-shortcut')",'Nearby appears in Services');
    assert(await evaluate("document.querySelector('.market-nearby-shortcut').getClientRects().length>0"));await evaluate("document.querySelector('.market-nearby-shortcut').click()");await until("!!document.querySelector('dialog[aria-label=\"Services near you\"] .nearby-services-screen')",'Original map finishes loading');await evaluate("document.querySelector('[aria-label=\"Close services map\"]').click()");
    const optionsSelector=width>=1024?'#user-dashboard-sidebar [title="Options Tab"]':'.user-bottom-navigation [data-navigation-id=options]';
    assert(await evaluate(`document.querySelector(${JSON.stringify(optionsSelector)}).getClientRects().length>0`),'Options entry is visible');await evaluate(`document.querySelector(${JSON.stringify(optionsSelector)}).click()`);await until("!!document.querySelector('.user-merchant-settings [data-registration-button=merchant]:not(:disabled)')",'Merchant entry in Options loads');
    const merchant=await evaluate("(()=>{const b=document.querySelector('.user-merchant-settings [data-registration-button=merchant]'),s=getComputedStyle(b);return{visible:b.getClientRects().length>0,label:b.innerText.trim(),status:b.dataset.registrationStatus,background:s.backgroundImage,sheen:getComputedStyle(b,'::after').animationName}})()");
    assert.equal(merchant.visible,true);assert.equal(merchant.label,'Become a Merchant');assert.equal(merchant.status,'unregistered');assert(merchant.background.includes('gradient'),'Gold merchant styling is preserved');await capture(`${width}-${theme}-merchant-options`);
    await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').click()");await until("!!document.querySelector('dialog[open]')",'Existing seller registration opens');assert(await evaluate("document.querySelector('dialog[open]').innerText.toLowerCase().includes('merchant')||document.querySelector('dialog[open]').innerText.toLowerCase().includes('seller')"),'The same seller flow is reachable');
   });
   for(const status of ['pending','restricted'])for(const theme of ['light','dark'])await test(`${theme} merchant registration status in Options: ${status}`,async()=>{
    await viewport(390);await load('/#/user/dashboard',theme,false,{role:'user',registration:status,selector:'.user-dashboard [data-dashboard-view]'});await until("!!document.querySelector('dialog[aria-label=\"Welcome to PineVela\"]')",'Welcome mounts');await evaluate("document.querySelector('dialog[aria-label=\"Welcome to PineVela\"] [aria-label=\"Close dialog\"]').click()");
    await evaluate("document.querySelector('.user-bottom-navigation [data-navigation-id=options]').click()");await until(`document.querySelector('.user-merchant-settings [data-registration-button=merchant]')?.dataset.registrationStatus===${JSON.stringify(status)}`,'Actual registration status appears');
    assert.equal(await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').innerText.trim()"),status==='pending'?'Pending Approval':'Account Restricted');
    assert.equal(await evaluate("document.querySelector('.user-merchant-settings [data-registration-button=merchant]').classList.contains('pv-merchant-join')"),false,'A status control is not shown as an unregistered application');
   });
  }
  if(process.env.PINEVELA_AUTH_MOTION==='1'){
   const typeInput=(label,value)=>evaluate(`(()=>{const e=document.querySelector('input[aria-label=${JSON.stringify(label)}]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   const switchAuth=async(tab)=>evaluate(`new Promise(resolve=>{const b=document.querySelectorAll('.login-mode-toggle button')[${tab==='register'?1:0}];b.focus();b.click();requestAnimationFrame(()=>{const e=document.querySelector('.login-auth-card form'),s=getComputedStyle(e);resolve({name:s.animationName,duration:s.animationDuration,iterations:s.animationIterationCount,opacity:s.opacity,transform:s.transform,frames:e.getAnimations().flatMap(a=>a.effect.getKeyframes().map(f=>({opacity:f.opacity,transform:f.transform,x:f.transform?new DOMMatrixReadOnly(f.transform).m41:0}))),forms:document.querySelectorAll('.login-auth-card form').length,mode:document.querySelector('.login-auth-card').dataset.activeTab});})})`);
   for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const reduced of [false,true])await test(`${width}px ${theme} login/signup motion ${reduced?'reduced':'normal'}`,async()=>{
    await viewport(width);await load('/#/login',theme,theme==='light',{selector:'.login-credentials-form'});
    await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme==='light'?'dark':'light'},{name:'prefers-reduced-motion',value:reduced?'reduce':'no-preference'}]});await evaluate('document.fonts.ready.then(()=>true)');await pause(420);
    const reads=apiRequests.length;await typeInput('Username or Email Address','visual-fixture@pinevela.invalid');
    const signup=await switchAuth('register');assert.equal(signup.mode,'register');assert.equal(signup.forms,1);
    assert.equal(signup.name,reduced?'none':'pv-login-signup-in');if(!reduced){assert.equal(parseFloat(signup.duration),.19);assert.equal(signup.iterations,'1');assert(signup.frames.some(f=>f.x===6),'Signup enters with a small right-side offset: '+JSON.stringify(signup));}
    await until("getComputedStyle(document.querySelector('.login-signup-form')).opacity==='1'&&!document.querySelector('.login-signup-form').getAnimations().some(a=>a.playState==='running')",'Signup transition finishes');
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'),'Animated fields stay inside the viewport');await typeInput('Your Full Name','Local visual fixture');
    const login=await switchAuth('login');assert.equal(login.name,reduced?'none':'pv-login-signin-in');assert.equal(login.mode,'login');assert.equal(login.forms,1);if(!reduced)assert(login.frames.some(f=>f.x===-6),'Login enters from the opposite side');
    await until("getComputedStyle(document.querySelector('.login-credentials-form')).opacity==='1'&&!document.querySelector('.login-credentials-form').getAnimations().some(a=>a.playState==='running')",'Login transition finishes');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Username or Email Address\"]').value"),'visual-fixture@pinevela.invalid','Login draft survives form switching');
    await switchAuth('register');await until("!!document.querySelector('input[aria-label=\"Your Full Name\"]')",'Signup returns');assert.equal(await evaluate("document.querySelector('input[aria-label=\"Your Full Name\"]').value"),'Local visual fixture','Signup draft survives form switching');
    await evaluate("(()=>{const b=document.querySelectorAll('.login-mode-toggle button');b[0].click();b[1].click();b[0].click()})()");await until("document.querySelector('.login-auth-card').dataset.activeTab==='login'",'Rapid switches settle');assert.equal(await evaluate("document.querySelectorAll('.login-auth-card form').length"),1,'Rapid switches leave one active form');
    assert.equal(apiRequests.length,reads,'Changing auth tabs makes no API or CAPTCHA requests');
    if(width<1024)assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-auth-card')).animationName"),'none','The phone glass card stays still');
    if(reduced)assert.equal(await evaluate("getComputedStyle(document.querySelector('.login-mode-toggle'),'::before').transitionDuration"),'0s','Reduced motion also disables selector travel');
    await pause(220);await capture(`${width}-${theme}-auth-${reduced?'reduced':'animated'}`);
   });
  }
  const publicRoutes=[['landing','/#/'],['market','/#/pinemarket'],['residence','/#/pineresidence'],['store','/#/pinemarket/stores/browser-fixture-store'],['why-us','/#/why-us'],['support-invitation','/#/support-invitation'],['faq','/#/faq?from=/'],['help','/#/help?from=/'],['privacy','/privacy.html'],['terms','/terms.html']];
  for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const [name,route]of publicRoutes){
   await test(`${width}px ${theme} ${name}`,async()=>{
    await viewport(width);await load(route,theme,theme==='light');
    const state=await evaluate(`(()=>{const h=document.querySelector('h1'),p=document.querySelector('.landing-peak-copy p,.support-intro>p:nth-of-type(2),.document p,main p'),style=e=>getComputedStyle(e);return{theme:document.documentElement.dataset.theme,overflow:document.documentElement.scrollWidth>innerWidth,headings:document.querySelectorAll('h1').length,mains:document.querySelectorAll('main').length,body:style(document.documentElement).backgroundColor,ink:style(h).color,muted:style(p).color,chrome:document.querySelector('meta[name="theme-color"]').content,systemButtons:document.querySelectorAll('.theme-system-choice').length,publicSwitches:document.querySelectorAll('[role=switch]').length,invalidImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth&&i.loading!=='lazy').length}})()`);
    assert.equal(state.theme,theme);assert.equal(state.overflow,false);assert.equal(state.headings,1);assert.equal(state.mains,1);assert.equal(state.systemButtons,0,'No System button on public pages');
    assert.equal(state.chrome,theme==='light'?'#ffffff':'#001d3d');assert.equal(state.invalidImages,0);
    assert.equal(await evaluate("new URL(document.querySelector('link[rel=icon]').href).pathname"),'/icons/pinevela-192.png','Homepage and policies advertise the same PNG favicon');
    assert(contrast(color(state.ink),color(state.body))>=4.5,'Heading contrast');assert(contrast(color(state.muted),color(state.body))>=4.5,'Body/supporting contrast');
    if(name==='landing'){
     assert.equal(await evaluate("document.body.textContent.includes('Your campus, connected')"),false,'The removed hero label is absent');
     assert.equal(state.publicSwitches,1);const action=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.landing-peak-cta'));return{color:s.color,image:s.backgroundImage}})()");
     assert.equal(action.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');
     const stops=[...action.image.matchAll(/rgb\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));assert(stops.length>=2);for(const stop of stops)assert(contrast(color(action.color),stop)>=4.5);
     if(width<1024){await evaluate("document.querySelector('.public-header-menu-toggle').click()");assert(await evaluate("document.querySelector('[role=switch]').getBoundingClientRect().height>=44"));assert(await evaluate('document.documentElement.scrollWidth<=innerWidth'));await evaluate("document.querySelector('.public-header-menu-toggle').click()");}
     const glass=await evaluate(`(()=>{const e=document.getElementById('benefits'),s=getComputedStyle(e),r=e.getBoundingClientRect();return{image:s.backgroundImage,filter:s.backdropFilter,heading:getComputedStyle(e.querySelector('h2')).color,eyebrow:getComputedStyle(e.querySelector('.company-eyebrow')).color,geometry:{width:r.width,height:r.height},clip:{x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1},cards:[...e.querySelectorAll('.landing-benefit')].map(c=>({background:getComputedStyle(c).backgroundColor,heading:getComputedStyle(c.querySelector('h3')).color,text:getComputedStyle(c.querySelector('p')).color}))}})()`);
     const paints=[...glass.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));
     assert(paints.length>=2&&paints.every(p=>p.length===4&&p[3]>0&&p[3]<1),'The whole benefits section uses translucent glass');assert(glass.filter.includes('blur('));assert.equal(glass.cards.length,3);
     for(const paint of paints){assert(!(paint[0]>180&&paint[1]>140&&paint[2]<100),'No yellow section backdrop');const surface=composite(paint,color(state.body));assert(contrast(color(glass.heading),surface)>=4.5);assert(contrast(color(glass.eyebrow),surface)>=4.5);for(const c of glass.cards){const fill=(c.background.match(/[\d.]+/g)||[]).map(Number);assert(fill.length===4&&fill[3]>0&&fill[3]<1,'Benefit cards stay translucent');const panel=composite(fill,surface);assert(contrast(color(c.heading),panel)>=4.5);assert(contrast(color(c.text),panel)>=4.5);}}
     if(theme==='light')glassGeometry.set(width,glass.geometry);else for(const key of ['width','height'])assert(Math.abs(glass.geometry[key]-glassGeometry.get(width)[key])<1,'Glass section geometry is shared by both themes');
     assert.equal(await evaluate("(async()=>{const i=document.querySelector('.landing-peak-image');await i.decode();const c=document.createElement('canvas');c.width=i.naturalWidth;c.height=i.naturalHeight;const x=c.getContext('2d');x.drawImage(i,0,0);return x.getImageData(0,0,1,1).data[3]})()"),0,'The hero image has a genuinely transparent background');
     if(width===390||width===1440)await capture(`${width}-${theme}-benefits-glass`,glass.clip);
     const chapters=await evaluate(`(()=>{const style=e=>getComputedStyle(e);return [...document.querySelectorAll('.company-chapter')].map(e=>({id:e.id,background:style(e).backgroundColor,image:style(e).backgroundImage,eyebrow:style(e.querySelector('.company-eyebrow')).color,heading:style(e.querySelector('h2')).color,text:style(e.querySelector('.company-paragraphs p:last-child')).color}))})()`);
     assert.equal(chapters.length,4);
     for(const chapter of chapters){const stops=[...chapter.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push(color(chapter.background));for(const surface of stops)for(const key of ['eyebrow','heading','text'])assert(contrast(color(chapter[key]),surface)>=4.5,chapter.id+' '+key+' contrast');if(theme==='light'&&['story-about-us','story-partner-with-us'].includes(chapter.id)){assert.equal(chapter.eyebrow,'rgb(255, 255, 255)');assert.equal(chapter.heading,'rgb(255, 255, 255)');}}
     if(width===1440){await evaluate("document.getElementById('story-about-us').scrollIntoView()");await capture(`${width}-${theme}-about-us-contrast`);await evaluate("document.getElementById('story-partner-with-us').scrollIntoView()");await capture(`${width}-${theme}-partner-contrast`);await evaluate('scrollTo(0,0)');}
    }
    if(name==='why-us'){
     const panels=await evaluate(`[...document.querySelectorAll('.why-us-pair>div')].map(e=>({image:getComputedStyle(e).backgroundImage,background:getComputedStyle(e).backgroundColor,colors:[...e.querySelectorAll('p')].map(p=>getComputedStyle(p).color)}))`);assert.equal(panels.length,28);
     for(const panel of panels){const stops=[...panel.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push(color(panel.background));for(const surface of stops)for(const text of panel.colors)assert(contrast(color(text),surface)>=4.5,'Comparison panel contrast');}
    }
    if(name==='market'||name==='store')assert.equal(await evaluate("document.querySelectorAll('[data-listing-id]').length"),3,'Fixture products actually render');
    if(width===390||width===1440)await capture(`${width}-${theme}-${name}`);
   });
  }
  const dialogContrast=async label=>{
   await until(`!!document.querySelector('dialog[open][aria-label=${JSON.stringify(label)}]')`,'Dialog opens: '+label);
   const data=await evaluate(`(()=>{const d=document.querySelector('dialog[open][aria-label=${JSON.stringify(label)}]'),panel=d.firstElementChild,s=getComputedStyle(panel);return{scrim:getComputedStyle(d).backgroundColor,background:s.backgroundColor,image:s.backgroundImage,width:panel.getBoundingClientRect().width,viewport:innerWidth,heading:getComputedStyle(panel.querySelector('h2,h3')).color,text:[...panel.querySelectorAll('p.text-slate-500,p.text-slate-600,p.text-slate-700,.pv-install-intro')].map(p=>getComputedStyle(p).color),canvas:getComputedStyle(document.documentElement).backgroundColor}})()`);
   assert(data.width<=data.viewport,'Dialog fits viewport');
   const scrim=(data.scrim.match(/[\d.]+/g)||[]).map(Number);assert(scrim.length===4&&scrim[3]>0&&scrim[3]<1,'The dialog scrim stays translucent');
   const stops=[...data.image.matchAll(/rgba?\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number));if(!stops.length)stops.push((data.background.match(/[\d.]+/g)||[]).map(Number));
   for(const stop of stops){const surface=composite(stop,color(data.canvas));for(const ink of [data.heading,...data.text])assert(contrast(color(ink),surface)>=4.5,label+' text contrast');}
  };
  for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} public dialogs and selected filters`,async()=>{
   await viewport(width);await load('/#/pinemarket',theme);
   await evaluate("document.querySelector('.market-price-toggle').click()");await until("!!document.querySelector('.market-price-panel')",'Price controls open');
   const pill=await evaluate("(()=>{const e=document.querySelector('.market-categories [aria-pressed=true]'),s=getComputedStyle(e);return{ink:s.color,image:s.backgroundImage}})()");
   for(const stop of [...pill.image.matchAll(/rgb\(([^)]+)\)/g)].map(m=>m[1].split(',').map(Number)))assert(contrast(color(pill.ink),stop)>=4.5,'Selected category is legible');
   await evaluate("document.querySelector('[aria-label=\"Inspect Study essentials\"]').click()");await dialogContrast('Inspect Study essentials');await capture(`${width}-${theme}-product-inspection`);
   await evaluate("document.querySelector('[aria-label=\"Enlarge Study essentials\"]').click()");await until("!!document.querySelector('dialog[open][data-image-viewer]')",'Product photograph opens');
   const gallery=await evaluate("(()=>{const d=document.querySelector('dialog[open][data-image-viewer]'),s=getComputedStyle(d);return{background:s.backgroundColor,ink:getComputedStyle(d.querySelector('p')).color}})()");assert(contrast(color(gallery.ink),color(gallery.background))>=4.5,'Photograph viewer chrome follows the chosen mode');
   await evaluate("document.querySelector('[aria-label=\"Close photographs\"]').click()");
   await evaluate("[...document.querySelectorAll('dialog[open] button')].find(b=>b.textContent.trim()==='Request to Buy').click()");await dialogContrast('Sign in to PineMarket');await capture(`${width}-${theme}-market-signin`);
   await evaluate("document.querySelector('dialog[aria-label=\"Sign in to PineMarket\"] [aria-label=\"Close sign-in prompt\"]').click()");await evaluate("document.querySelector('[aria-label=\"Close inspection\"]').click()");
   await evaluate("document.querySelector('[aria-label=\"Add Study essentials to wishlist\"]').click()");await dialogContrast('Sign in to PineMarket');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await load('/#/pineresidence',theme);await until("document.querySelectorAll('[data-residence-id]').length===3",'Residence fixtures load');
   await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='View Details').click()");await dialogContrast('Hostel Accommodation Details');await capture(`${width}-${theme}-residence-details`);
   await evaluate("document.querySelector('dialog[open] [aria-label=\"Close dialog\"]').click()");await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Activate Key').click()");await dialogContrast('Sign in to PineResidence');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await load('/#/pinemarket/stores/browser-fixture-store',theme);await evaluate("document.querySelector('[aria-label=\"Message store\"]').click()");await dialogContrast('Sign in to message store');await evaluate("document.querySelector('[aria-label=\"Close sign-in prompt\"]').click()");
   await evaluate("document.querySelector('.pv-install-button').click()");await dialogContrast('Install PineVela');await capture(`${width}-${theme}-install-instructions`);
  });
  await test('Explore pages and Why Us preserve a manual slide through navigation and reload',async()=>{
   await viewport(1440);await load('/#/pinemarket','light',true);await evaluate("document.querySelector('[role=switch]').click()");await until("document.documentElement.dataset.theme==='dark'",'Explore slider changes mode');
   for(const [route,selector] of [['/#/pineresidence','[data-public-residence]'],['/#/pinemarket/stores/browser-fixture-store','[data-market-storefront]'],['/#/why-us','.why-us-page'],['/#/','.landing-peak-hero']]){await command('Page.navigate',{url:origin+route});await until(`!!document.querySelector(${JSON.stringify(selector)})&&document.documentElement.dataset.theme==='dark'`,'Navigation preserves selected mode');await command('Page.reload');await until(`!!document.querySelector(${JSON.stringify(selector)})&&document.documentElement.dataset.theme==='dark'`,'Reload preserves selected mode');}
  });
  await test('Open public dialogs change color live with System',async()=>{
   await load('/#/pinemarket','system',false);await evaluate("document.querySelector('[aria-label=\"Inspect Study essentials\"]').click()");await dialogContrast('Inspect Study essentials');
   const before=await evaluate("getComputedStyle(document.querySelector('dialog[open]>section')).backgroundColor");await os(true);await until("document.documentElement.dataset.theme==='dark'",'Open dialog follows System');await dialogContrast('Inspect Study essentials');assert.notEqual(await evaluate("getComputedStyle(document.querySelector('dialog[open]>section')).backgroundColor"),before,'The already open panel repaints');
  });
  const productRoutes=[
   {name:'primary dashboard',route:'/#/user/dashboard',role:'user',selector:'.user-dashboard [data-dashboard-view]'},
   {name:'manager dashboard',route:'/#/manager/dashboard',role:'manager',selector:'[data-dashboard-shell] main'},
   {name:'staff dashboard',route:'/#/staff/dashboard',role:'staff',selector:'[data-staff-dashboard] main'},
   {name:'resident dashboard',route:'/#/resident/dashboard',role:'student',selector:'[data-dashboard-shell] main'},
   {name:'administrator dashboard',route:'/#/admin/dashboard',role:'admin',selector:'.admin-dashboard main'},
   {name:'seller dashboard',route:'/#/digital-market',role:'merchant',selector:'[data-product-screen=market] main'},
   {name:'field officer',route:'/#/field-officer',role:'field_officer',selector:'.verification-portal'},
   {name:'customer service',route:'/#/customer-service',role:'user',selector:'nav[aria-label="Customer-service sections"]'},
   {name:'manager onboarding',route:'/#/register-manager',role:'user',selector:'section[aria-label="Manager registration progress"],section[aria-labelledby] h1'},
   {name:'store onboarding',route:'/#/digital-market/onboard',role:'merchant',setup:'pending',selector:'section[aria-label="Store activation progress"]'},
  ];
  for(const width of [390,1440])for(const theme of ['light','dark'])for(const page of productRoutes)await test(`${width}px ${theme} product fixture: ${page.name}`,async()=>{
   await viewport(width);await load(page.route,theme,theme==='light',page);
   const data=await evaluate(`(()=>{const s=getComputedStyle(document.documentElement),main=document.querySelector('main,.verification-portal')||document.querySelector('#root .page-canvas');return{theme:document.documentElement.dataset.theme,canvas:s.backgroundColor,ink:getComputedStyle(main).color,overflow:document.documentElement.scrollWidth>innerWidth,text:document.body.innerText,publicTheme:document.documentElement.dataset.publicTheme}})()`);
   assert.equal(data.theme,theme);assert.equal(data.publicTheme,'none');assert.equal(data.overflow,false,'Product page fits the viewport');assert(contrast(color(data.ink),color(data.canvas))>=4.5,'Product content inherits legible theme ink');
   assert(!/This page could not load|Access Denied|Your seller account could not load|Manager registration could not load/.test(data.text),'The actual page renders instead of an error boundary');
   if(width===390)await capture(`${width}-${theme}-${page.name.replaceAll(' ','-')}-fixture`);
  });
  for(const theme of ['light','dark'])await test(`3D PineVela card and glass accessibility fallback: ${theme}`,async()=>{
   await viewport(1440);await load('/#/',theme);await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
   await until("document.querySelector('[data-artwork-layers=landing]')?.getAttribute('data-motion-ready')==='true'",'Transparent animated artwork loads');
   assert(await evaluate("(()=>{const source=document.querySelector('.landing-peak-image').getAttribute('src');return [...document.querySelectorAll('[data-artwork-layers=landing] image')].every(i=>i.getAttribute('href')===source)})()"),'Animated layers must use the same transparent cutout without a yellow clean plate');
   const card=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.landing-peak-brand-card'));return{transform:s.transform,style:s.transformStyle,shadow:s.boxShadow}})()");assert(card.transform.startsWith('matrix3d('));assert.equal(card.style,'preserve-3d');assert(card.shadow.split('rgb').length>=6,'Layered edges give the card visible depth');
   await capture(`1440-${theme}-transparent-hero-3d`);
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-contrast',value:'more'}]});
   assert.equal(await evaluate("getComputedStyle(document.getElementById('benefits')).backdropFilter"),'none');assert.equal(await evaluate("getComputedStyle(document.querySelector('.landing-peak-brand-card')).transform"),'none');
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-contrast',value:'no-preference'}]});
  });
  await test('Conventional favicon endpoint serves an image rather than the SPA document',async()=>{
   const data=await evaluate("(async()=>{const r=await fetch('/favicon.ico'),b=new Uint8Array(await r.arrayBuffer());return{status:r.status,type:r.headers.get('content-type'),prefix:[...b.slice(0,6)]}})()");assert.equal(data.status,200);assert(/image\//.test(data.type));assert.deepEqual(data.prefix,[0,0,1,0,1,0]);
  });
  await test('Browser appearance is the default; live OS changes keep System until a manual slide',async()=>{
   await viewport(1440);await load('/#/',null,false);assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
   assert.equal(await evaluate("localStorage.getItem('pinevela:appearance')"),null);await os(true);await until("document.documentElement.dataset.theme==='dark'",'OS dark');
   await evaluate("document.querySelector('[role=switch]').click()");await until("document.documentElement.dataset.theme==='light'",'Manual light');
   assert.equal(await evaluate("localStorage.getItem('pinevela:appearance')"),'light');await os(false);await os(true);assert.equal(await evaluate('document.documentElement.dataset.theme'),'light');
   await command('Page.reload');await until("document.documentElement.dataset.theme==='light'&&!!document.querySelector('.landing-peak-hero')",'Saved choice after reload');
   await command('Page.navigate',{url:origin+'/privacy.html'});await until("!!document.querySelector('.document')&&document.documentElement.dataset.theme==='light'",'Policy inherits manual light');
   await command('Page.navigate',{url:origin+'/#/faq?from=/'});await until("!!document.querySelector('input[type=search]')&&document.documentElement.dataset.theme==='light'",'FAQ inherits manual light');
   await evaluate("document.querySelector('[role=switch]').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await command('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
   await until("document.documentElement.dataset.theme==='dark'",'Keyboard slider');
   await command('Page.navigate',{url:origin+'/terms.html'});await until("!!document.querySelector('.document')&&document.documentElement.dataset.theme==='dark'",'Terms inherits manual dark');
  });
  await test('FAQ search, native keyboard accordion and topic links remain usable',async()=>{
   await load('/#/faq?from=/','light');const initial=await evaluate('document.querySelectorAll("details").length');
   await evaluate(`(()=>{const i=document.querySelector('input[type=search]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'room');i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
   await until(`document.querySelectorAll('details').length<${initial}`,'FAQ filters');assert(await evaluate('document.querySelectorAll("details").length>0'));
   assert(await evaluate("[...document.querySelectorAll('nav[aria-label=\"FAQ topics\"] a')].every(a=>document.getElementById(a.getAttribute('href').slice(1)))"));
   await evaluate("document.querySelector('summary').focus()");await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});assert(await evaluate('document.querySelector("details").open'));
  });
  await test('Policies follow live System and make no application API requests',async()=>{
   for(const route of ['/privacy.html','/terms.html']){const count=apiRequests.length;await load(route,'system',false);await os(true);await until("document.documentElement.dataset.theme==='dark'",'Live dark policy');await os(false);await until("document.documentElement.dataset.theme==='light'",'Live light policy');assert.equal(apiRequests.length,count);assert(await evaluate("[...document.querySelectorAll('.contents a')].every(a=>document.getElementById(a.getAttribute('href').slice(1)))"));}
  });
  await test('Policies remain readable with JavaScript disabled',async()=>{
   await command('Emulation.setScriptExecutionDisabled',{value:true});
   try{for(const dark of [false,true]){await os(dark);await command('Page.navigate',{url:origin+'/privacy.html?nojs='+dark});await pause(350);const data=await evaluate("({scheme:getComputedStyle(document.documentElement).colorScheme,bg:getComputedStyle(document.body).backgroundColor,rootBg:getComputedStyle(document.documentElement).backgroundColor,text:getComputedStyle(document.querySelector('.document p')).color,overflow:document.documentElement.scrollWidth>innerWidth})");assert.equal(data.scheme,dark?'dark':'light');assert.equal(data.overflow,false);assert(contrast(color(data.text),color(data.rootBg))>=4.5);}}
   finally{await command('Emulation.setScriptExecutionDisabled',{value:false});}
  });
  assert.equal(mutations.length,0);assert.equal(exceptions.length,0,exceptions.join('\n'));
  const report={passed:true,scenes:checks.length,checks,screenshots,syntheticGuestCatalog:true,syntheticRoleVisualFixtures:productRoutes.map(p=>p.name),hostedOrAccountWrites:0,realAuthenticationTested:false,runtimeExceptions:exceptions.length};await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,scenes:checks.length,report:output+'/report.json'}));
 }catch(e){await fs.writeFile(output+'/failure.json',JSON.stringify({scenario,completed:checks.length,error:e.message,exceptions,apiRequests,debug:await debug().catch(()=>({}))},null,2)+'\n');console.error(JSON.stringify({passed:false,scenario,completed:checks.length,error:e.message}));process.exitCode=1;}
 finally{chrome.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('Browser closed'))}pending.clear();server.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
