/* Actual built pages + Google's real public tag. Every page request is fulfilled
 * locally through CDP. Collection requests are captured BEFORE network and
 * answered locally: no visits or test data reach the real Analytics property. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {spawn}=require('node:child_process');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const root=path.resolve('dist-supabase'),output='/tmp/pinevela-ga4-browser-20261028';
 const googleTag=await fs.readFile('/tmp/pinevela-google-tag-20261028.js');
 assert(!googleTag.toString().includes('"function":"__ccd_em_page_view"'),'Turn Enhanced measurement OFF and refresh the downloaded public tag before this real-tag test');
 await fs.mkdir(output,{recursive:true});await fs.rm(output+'/failure.json',{force:true});
 const profile=await fs.mkdtemp('/tmp/pinevela-ga4-chrome-');
 const chrome=spawn('/snap/chromium/current/usr/lib/chromium-browser/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let sequence=0,buffer='',stderr='',scenario='startup',seedScript,command,debug=async()=>({}),blockTag=false;
 const pending=new Map(),checks=[],hits=[],tagLoads=[],requests=[],exceptions=[],screenshots=[],consoleErrors=[];
 chrome.stderr.on('data',c=>{stderr=(stderr+c).slice(-1200)});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out: '+stderr));},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
 async function intercept(p){
  const url=new URL(p.request.url);requests.push({url:url.href,method:p.request.method});
  const fulfill=(status,bytes,type,extra=[])=>command('Fetch.fulfillRequest',{requestId:p.requestId,responseCode:status,responseHeaders:[{name:'Content-Type',value:type},{name:'Cache-Control',value:'no-store'},...extra],body:Buffer.from(bytes).toString('base64')});
  if(url.hostname==='www.googletagmanager.com'&&url.pathname==='/gtag/js'){
   tagLoads.push(url.href);return blockTag?command('Fetch.failRequest',{requestId:p.requestId,errorReason:'BlockedByClient'}):fulfill(200,googleTag,'application/javascript');
  }
  if(/(?:^|\.)google-analytics\.com$/.test(url.hostname)&&url.pathname.includes('collect')){
   let body=p.request.postData||'';
   if(!body&&p.request.hasPostData&&p.networkId)body=(await command('Network.getRequestPostData',{requestId:p.networkId}).catch(()=>({}))).postData||'';
   const rows=body?body.split('\n'):[''];
   for(const row of rows){const fields=new URLSearchParams(url.search);for(const [key,value] of new URLSearchParams(row))fields.set(key,value);hits.push(Object.fromEntries(fields));}
   return fulfill(204,'','text/plain',[{name:'Access-Control-Allow-Origin',value:'https://pinevela.app'},{name:'Access-Control-Allow-Credentials',value:'true'}]);
  }
  if(url.origin==='https://pinevela.app'){
   if(url.pathname.startsWith('/api/')){
    if(p.request.method!=='GET')return fulfill(405,'{}','application/json');
    if(url.pathname==='/api/auth/me')return fulfill(401,'{}','application/json');
    if(url.pathname==='/api/auth/captcha')return fulfill(200,'{"enabled":false}','application/json');
    if(url.pathname==='/api/settings')return fulfill(200,JSON.stringify({maintenanceMode:false,contactDetails:{linkedinUrl:'',whatsappNumber:'',facebookUrl:'',tiktokUrl:''},registrationFee:0,semesterFee:0,commission:0,subscriptionPrices:{default:0,star:0,pro:0},announcement:''}),'application/json');
    if(['/api/hostels','/api/digital-market/products'].includes(url.pathname))return fulfill(200,'[]','application/json');
    if(url.pathname.startsWith('/api/digital-market/stores/'))return fulfill(200,JSON.stringify({store:{id:'PRIVATE_STORE_FIXTURE',storeName:'PRIVATE_PERSON_FIXTURE',description:'Local fixture',category:'Books',ratingCount:0},products:[]}),'application/json');
    return fulfill(404,'{}','application/json');
   }
   const file=path.resolve(root,url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).replace(/^\//,''));
   if(!file.startsWith(root+path.sep))return fulfill(403,'','text/plain');
   try{
    const bytes=await fs.readFile(file),mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg','.otf':'font/otf','.woff2':'font/woff2','.webmanifest':'application/manifest+json','.ico':'image/x-icon'}[path.extname(file)]||'application/octet-stream';
    return fulfill(200,bytes,mime);
   }catch{return fulfill(404,'Not found','text/plain');}
  }
  // Fonts/other third parties are blocked too. There is no continueRequest path.
  return fulfill(200,'',url.pathname.endsWith('.css')?'text/css':'text/plain');
 }
 chrome.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))!==-1){const raw=buffer.slice(0,end);buffer=buffer.slice(end+1);if(!raw)continue;const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result||{});}}else if(m.method==='Debugger.paused'){consoleErrors.push(m.params.data?.description||m.params.reason);void command('Debugger.resume');}else if(m.method==='Fetch.requestPaused')void intercept(m.params).catch(e=>exceptions.push('Intercept: '+e.message));else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')consoleErrors.push(m.params.args.map(a=>a.description||a.value).join(' '));else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);}});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});command=(method,params={})=>send(method,params,sessionId);
  await command('Page.enable');await command('Runtime.enable');if(process.env.PINEVELA_ANALYTICS_DEBUG==='1'){await command('Debugger.enable');await command('Debugger.setPauseOnExceptions',{state:'all'});}await command('Network.enable');await command('Network.setBypassServiceWorker',{bypass:true});await command('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async(expression,label,timeout=15000)=>{const end=Date.now()+timeout;while(Date.now()<end){if(await evaluate(expression))return;await pause(60);}throw Error(label+' did not settle');};
  const hitCount=()=>hits.filter(h=>h.en==='page_view').length;
  const untilHits=async(expected)=>{const end=Date.now()+15000;while(Date.now()<end){if(hitCount()>=expected)return;await pause(80);}throw Error('Expected page views '+expected+', got '+hitCount());};
  debug=()=>evaluate("({url:location.href,text:document.body?.innerText.slice(-1200),choice:window.PineVelaAnalytics?.choice(),disabled:window['ga-disable-G-NWBP5E04F9'],preloadError:window.__analyticsHarnessPreloadError,queued:(window.dataLayer||[]).filter(x=>x[0]==='event').map(x=>[x[0],x[1],x[2]])})");
  const load=async({route='/#/',theme='light',choice=null,width=1440,gpc=false}={})=>{
   if(seedScript)await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:seedScript});
   const seed=Date.now()+'-'+Math.random();
   const setup=`window.addEventListener('vite:preloadError',e=>window.__analyticsHarnessPreloadError=String(e.payload?.stack||e.payload));if(sessionStorage.getItem('analytics-scene')!==${JSON.stringify(seed)}){localStorage.clear();localStorage.setItem('pinevela:appearance',${JSON.stringify(theme)});${choice?`localStorage.setItem('pinevela:analytics-consent',JSON.stringify({version:1,analytics:${JSON.stringify(choice)}}));`:''}sessionStorage.setItem('analytics-scene',${JSON.stringify(seed)});}Object.defineProperty(navigator,'globalPrivacyControl',{configurable:true,value:${gpc}});if(navigator.serviceWorker)navigator.serviceWorker.register=()=>Promise.resolve({addEventListener(){},update:()=>Promise.resolve()});`;
   seedScript=(await command('Page.addScriptToEvaluateOnNewDocument',{source:setup})).identifier;
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-color-scheme',value:theme},{name:'prefers-reduced-motion',value:'reduce'}]});
   const address=new URL(route,'https://pinevela.app');address.searchParams.set('analytics_scene',seed);
   await command('Page.navigate',{url:address.href});await until(`location.search===${JSON.stringify(address.search)}&&document.readyState==='complete'&&!!window.PineVelaAnalytics`,'Local built document');await pause(250);
  };
  const test=async(name,run)=>{scenario=name;await run();checks.push(name);console.log('PASS '+name);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const allow=()=>click('[data-analytics-action=allow]'),decline=()=>click('[data-analytics-action=deny]');
  for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} optional analytics, SPA navigation and withdrawal`,async()=>{
   const tags=tagLoads.length,start=hitCount();await load({width,theme});await until("!!document.getElementById('pinevela-analytics-choice')",'Analytics choice');
   assert.equal(tagLoads.length,tags);assert.equal(hitCount(),start,'No request before permission');
   const rect=await evaluate("(()=>{const r=document.getElementById('pinevela-analytics-choice').getBoundingClientRect();return{x:r.x,right:r.right,bottom:r.bottom,width:innerWidth,height:innerHeight}})()");assert(rect.x>=0&&rect.right<=rect.width&&rect.bottom<=rect.height);
   const shot=await command('Page.captureScreenshot',{format:'png'}),file=output+`/${width}-${theme}-analytics-choice.png`;await fs.writeFile(file,Buffer.from(shot.data,'base64'));screenshots.push(file);
   await allow();await untilHits(start+1);await pause(500);assert.equal(hitCount(),start+1);assert.equal(tagLoads.length,tags+1);
   await until("[...document.querySelectorAll('[data-public-market] button')].some(b=>b.textContent.includes('Explore Market'))",'Real landing market button');await evaluate("[...document.querySelectorAll('[data-public-market] button')].find(b=>b.textContent.includes('Explore Market')).click()");await untilHits(start+2);await pause(500);assert.equal(hitCount(),start+2,'React HashRouter click produces one page view');
   await evaluate("window.PineVelaAnalytics.refresh();window.PineVelaAnalytics.refresh()");await pause(300);assert.equal(hitCount(),start+2);
   await evaluate('window.PineVelaAnalytics.preferences()');await decline();assert.equal(await evaluate("window['ga-disable-G-NWBP5E04F9']"),true);
   await evaluate("location.hash='/faq'");await pause(650);assert.equal(hitCount(),start+2);assert.equal(await evaluate("document.cookie.split(';').some(v=>v.trim().startsWith('_ga'))"),false);
   await evaluate('window.PineVelaAnalytics.preferences()');await allow();await untilHits(start+3);await pause(350);assert.equal(hitCount(),start+3);assert.equal(tagLoads.length,tags+1,'One Google script per document');
  });
  await test('saved decline remains off after reload',async()=>{
   const start=hitCount(),tags=tagLoads.length;await load({choice:'denied'});await command('Page.reload');await until("document.readyState==='complete'&&window.PineVelaAnalytics?.choice()==='denied'",'Saved decline');await pause(400);assert.equal(hitCount(),start);assert.equal(tagLoads.length,tags);
  });
  await test('store identifiers, private query strings and sensitive screens never reach Google',async()=>{
   const start=hitCount();await load({choice:'granted',route:'/?utm_source=PRIVATE_CAMPAIGN_FIXTURE&utm_campaign=PRIVATE_EMAIL_FIXTURE&gclid=PRIVATE_AD_FIXTURE#/pinemarket/stores/PRIVATE_STORE_FIXTURE?search=PRIVATE_SEARCH_FIXTURE'});await untilHits(start+1);
   const hit=hits.filter(h=>h.en==='page_view').at(-1);assert.equal(hit.dl,'https://pinevela.app/pinemarket/stores/store');assert.equal(hit.dt,'PineVela | Marketplace store');
   await evaluate("location.hash='/login?code=PRIVATE_AUTH_FIXTURE'");await pause(450);assert.equal(hitCount(),start+1);assert.equal(await evaluate("window['ga-disable-G-NWBP5E04F9']"),true);
   await evaluate("location.hash='/faq'");await untilHits(start+2);assert(!JSON.stringify(hits).includes('PRIVATE_'));
  });
  await test('accepted choice never loads a tag on an initial login/payment URL',async()=>{
   for(const route of ['/#/login?code=PRIVATE_LOGIN_FIXTURE','/#/payments/return?reference=PRIVATE_PAYMENT_FIXTURE']){const start=hitCount(),tags=tagLoads.length;await load({choice:'granted',route});await pause(350);assert.equal(hitCount(),start);assert.equal(tagLoads.length,tags);}
  });
  await test('standalone policy pages count once and expose working preference controls',async()=>{
   let start=hitCount();await load({choice:'granted',route:'/privacy.html#analytics'});await untilHits(start+1);await pause(300);assert.equal(hitCount(),start+1);
   await click('[data-analytics-preferences]');await until("!!document.getElementById('pinevela-analytics-choice')",'Policy preference control');await decline();
   start=hitCount();await command('Page.navigate',{url:'https://pinevela.app/legal/terms-2026-10-27.html'});await until("document.readyState==='complete'&&!!document.querySelector('.document')",'Immutable Terms');await pause(350);assert.equal(hitCount(),start);
  });
  await test('browser privacy signal prevents tracking even with saved permission',async()=>{
   const start=hitCount(),tags=tagLoads.length;await load({choice:'granted',gpc:true});await evaluate('window.PineVelaAnalytics.preferences()');assert.equal(await evaluate("document.querySelector('[data-analytics-action=allow]').disabled"),true);assert.equal(hitCount(),start);assert.equal(tagLoads.length,tags);
  });
  await test('blocking Google does not break the app or start retry loops',async()=>{
   blockTag=true;const tags=tagLoads.length;await load();await allow();await until("[...document.querySelectorAll('[data-public-market] button')].some(b=>b.textContent.includes('Explore Market'))",'Landing still usable');await evaluate("[...document.querySelectorAll('[data-public-market] button')].find(b=>b.textContent.includes('Explore Market')).click()");await pause(500);assert.equal(tagLoads.length,tags+1);blockTag=false;
  });
  assert.equal(exceptions.length,0,exceptions.join('\n'));
  assert(!JSON.stringify(hits).includes('analytics_scene'),'Raw query parameters are never sent');
  assert(requests.filter(r=>!r.url.startsWith('https://pinevela.app/')).every(r=>!r.url.includes('PRIVATE_')),'Private fixture URLs never reach a third-party request');
  for(const h of hits){assert.equal(h.tid,'G-NWBP5E04F9');assert(!JSON.stringify(h).includes('PRIVATE_'));if(h.dl)assert(/^https:\/\/pinevela\.app\/(?:$|pinemarket(?:\/stores\/store)?$|faq$|privacy\.html$)/.test(h.dl),'Only allowlisted canonical locations are sent: '+h.dl);}
  const report={passed:true,scenes:checks.length,checks,screenshots,realGoogleTag:true,enhancedMeasurementVerifiedOff:true,capturedCollectionRequests:hits.length,pageViews:hitCount(),googleScripts:tagLoads.length,liveCollectionRequests:0,hostedAccountWrites:0,runtimeExceptions:exceptions.length};
  await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }catch(e){await fs.writeFile(output+'/failure.json',JSON.stringify({scenario,error:e.message,checks,exceptions,consoleErrors,hits,tagLoads,requests,debug:await debug().catch(()=>({}))},null,2)+'\n');console.error(JSON.stringify({passed:false,scenario,error:e.message}));process.exitCode=1;}
 finally{chrome.kill();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Browser closed'));}pending.clear();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1});
