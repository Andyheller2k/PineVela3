/** Actual built React UI in disposable Chromium. Browser push/permission and
 * API replies are explicit local fixtures. This is not a live delivery test. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const crypto=require('node:crypto');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const webPush=require('web-push');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const account='833a9820-b35b-4ba1-8565-7520bb9236a4',foreign='5318b08c-84c5-41bf-bdd1-8127abb5b469',notice='36231273-e45d-4598-9a99-240d738432db';
const listing='25998d0d-64d3-4cd4-b81a-53fc508447fb',residence='8d97e768-07de-4d98-a726-831583cf127b';
const root=path.resolve('dist-supabase'),output=path.resolve(process.env.PINEVELA_PUSH_UI_OUTPUT||'docs/verification/device-push-2026-11-05/browser');
const fixtureKeys=webPush.generateVAPIDKeys();
(async()=>{
 await fs.mkdir(output,{recursive:true});
 await fs.rm(path.join(output,'failure.json'),{force:true});
 let theme='light',signedIn=true,changedOwner=false,available=true,active=false,subscription=null,stage='startup';
 const registrations=[],disconnects=[],tests=[],opens=[],checks=[],scenes=[],exceptions=[];
 const user=()=>({id:account,role:'user',name:'Push UI fixture',email:'push-ui@pinevela.invalid',isVerified:true,legal:{accepted:true,document:{version:'2026-11-05',href:'/legal/terms-2026-11-05.html',privacyHref:'/privacy.html'}}});
 const product={id:listing,storeId:'fixture-store',storeName:'Campus fixture',title:'Campus headphones',description:'Local visual fixture',price:75,category:'Electronics',stockQuantity:4,imageUrl:'/icons/pinevela-192.png'};
 const hostel={id:residence,name:'Campus residence',location:'Kumasi',isApproved:true,managerName:'Fixture contact',hostelType:'Hostel',imageUrl:'/icons/pinevela-192.png'};
 const server=http.createServer(async(req,res)=>{
  try{
   const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;
   if(route.startsWith('/api/')){
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');
    const json=(data,status=200)=>{res.writeHead(status);res.end(JSON.stringify(data));};
    if(route==='/api/device-push/config')return json({web:available,android:false,vapidPublicKey:fixtureKeys.publicKey});
    if(route==='/api/device-push/status')return json({connected:active&&!changedOwner,registered:active&&!changedOwner,otherAccounts:active&&changedOwner,accounts:active&&!changedOwner?[{contextId:account,kind:'primary',label:'User',feedback:false,...subscription}]:[]});
    if(req.method==='POST'){
     let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)throw Error('Oversized UI fixture');}
     const body=JSON.parse(raw||'{}');
     if(route==='/api/device-push/register'){registrations.push({body,headers:req.headers});active=true;changedOwner=false;subscription={accountAlerts:body.accountAlerts,marketplace:body.marketplace,residences:body.residences};return json({registered:true});}
     if(route==='/api/device-push/disconnect'){disconnects.push(body);active=false;return json({success:true});}
     if(route==='/api/device-push/test'){tests.push(req.headers);return json({queued:true});}
     return json({},405);
    }
    if(route==='/api/auth/me')return json(signedIn?user():{},signedIn?200:401);
    if(route==='/api/legal/status')return json(user().legal);
    if(route==='/api/auth/appearance')return json({theme});
    if(route==='/api/auth/maintenance-notice')return json({serverTime:new Date().toISOString(),notice:null});
    if(route==='/api/auth/account-access')return json({restrictions:[]});
    if(route==='/api/settings')return json({maintenanceMode:false,contactDetails:{},subscriptionPrices:{default:0,star:0,pro:0}});
    if(route==='/api/hostels')return json([hostel]);
    if(route==='/api/digital-market/products')return json([product]);
    if(route==='/api/users/my-registered-accounts')return json({managerAccount:null,residentAccount:null,merchantAccount:null});
    if(route==='/api/student/my-profile')return json({user:user(),rooms:[]});
    if(route==='/api/companion')return json({preferences:{aiEnabled:false},turns:[],available:false});
    if(route==='/api/device-push/open/'+notice){opens.push(route);return json({id:notice,title:'Maintenance updated',message:'Private details are visible inside the correct account.',accountLabel:'User',accountKind:'primary',destination:'/user/dashboard',discovery:null});}
    if(route==='/api/notifications'||route==='/api/auth/enrollments'||route==='/api/admin-messages/pending')return json([]);
    return json({},404);
   }
   const file=path.resolve(root,decodeURIComponent(route).replace(/^\/+/,'')||'index.html');
   if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
   const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.webmanifest':'application/manifest+json','.woff2':'font/woff2'}[path.extname(file)]||'application/octet-stream';
   const bytes=await fs.readFile(file);res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(bytes);
  }catch{res.writeHead(404);res.end();}
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');const origin='http://127.0.0.1:'+server.address().port;
 const profile=await fs.mkdtemp('/tmp/pinevela-push-browser-');
 const chrome=spawn(process.env.CHROME_BIN||'/snap/chromium/current/usr/lib/chromium-browser/chrome',[
  '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--no-default-browser-check','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'
 ],{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let sequence=0,buffer='',stderr='',seed;const pending=new Map();
 chrome.stderr.on('data',c=>stderr=(stderr+c).slice(-1000));
 chrome.stdio[4].on('data',c=>{buffer+=c;let end;while((end=buffer.indexOf('\0'))>=0){const m=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);
  if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  const p=pending.get(m.id);if(!p)continue;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);
 }});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out: '+stderr));},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(m,p)=>send(m,p,sessionId);
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const until=async(expression,label)=>{const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await pause(50);}throw Error(label+' did not settle');};
  const check=(value,label)=>{assert.ok(value,label);checks.push(label);};
  const load=async(route,width=390,mode='light',options={})=>{
   theme=mode;stage=width+' '+mode+' '+route;
   if(seed)await command('Page.removeScriptToEvaluateOnNewDocument',{identifier:seed});
   const local=options.local||null;
   const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();
   const sub={endpoint:'https://fcm.googleapis.com/fcm/send/browser-ui-fixture',keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')},expirationTime:null};
   seed=(await command('Page.addScriptToEvaluateOnNewDocument',{source:`
    localStorage.clear();localStorage.setItem('pinevela:appearance',${JSON.stringify(mode)});sessionStorage.clear();
    ${local?`localStorage.setItem('pinevela:device-push',${JSON.stringify(JSON.stringify(local))});`:''}
    window.__pushFixture={prompts:0,subscriptions:0,unsubscribed:0,permission:${JSON.stringify(options.permission||'default')}};
    Object.defineProperty(Notification,'permission',{get:()=>window.__pushFixture.permission});
    Notification.requestPermission=async()=>{window.__pushFixture.prompts++;window.__pushFixture.permission='granted';return 'granted';};
    let current=null;
    PushManager.prototype.getSubscription=async()=>current;
    PushManager.prototype.subscribe=async function(options){window.__pushFixture.subscriptions++;current={options,toJSON:()=>(${JSON.stringify(sub)}),unsubscribe:async()=>{window.__pushFixture.unsubscribed++;current=null;return true;}};return current;};
   `})).identifier;
   await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<640});
   await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
   await command('Page.navigate',{url:origin+'/?case='+crypto.randomUUID()+'#'+route});
   await until("document.documentElement?.dataset.theme==='"+mode+"'&&document.getElementById('root')?.innerText.length>20",'Built application');
  };
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  const color=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
  const contrast=(a,b)=>{const l=v=>v.map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);return(Math.max(l(a),l(b))+.05)/(Math.min(l(a),l(b))+.05);};
  for(const width of [320,390,1440])for(const mode of ['light','dark']){
   active=false;changedOwner=false;available=true;await load('/notification-settings',width,mode);
   await until("document.querySelector('.pv-device-primary')&&!document.querySelector('.pv-device-primary').disabled",'Notification settings');
   await until("[...document.querySelectorAll('.pinevela-brand-mark')].every(i=>i.complete&&i.naturalWidth>0)",'PineVela logo');
   const state=await evaluate("(()=>{const card=document.querySelector('.pv-device-settings'),button=card.querySelector('.pv-device-primary'),s=getComputedStyle(button);return{overflow:document.documentElement.scrollWidth>innerWidth,background:s.backgroundColor,color:s.color,buttonHeight:button.getBoundingClientRect().height,choices:[...card.querySelectorAll('input')].map(i=>i.checked),checkboxColor:getComputedStyle(card.querySelector('input')).accentColor,promptCount:window.__pushFixture.prompts}})()");
   check(!state.overflow,width+'px '+mode+' has no horizontal overflow');check(state.buttonHeight>=44,width+'px '+mode+' has accessible action size');
   check(contrast(color(state.background),color(state.color))>=4.5,width+'px '+mode+' primary text contrast passes');
   check(state.background===(mode==='light'?'rgb(0, 53, 102)':'rgb(255, 215, 0)'),width+'px '+mode+' uses the correct primary theme color');
   check(state.checkboxColor===(mode==='light'?'rgb(0, 53, 102)':'rgb(255, 215, 0)'),width+'px '+mode+' selectors use the correct theme color');
   check(JSON.stringify(state.choices)==='[true,false,false]'&&state.promptCount===0,'Discovery is optional and permission waits for a button press');
   await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false}).then(r=>fs.writeFile(path.join(output,width+'-'+mode+'.png'),Buffer.from(r.data,'base64')));
   scenes.push({width,theme:mode,...state});
  }
  active=false;await load('/notification-settings');await until("document.querySelector('.pv-device-primary')&&!document.querySelector('.pv-device-primary').disabled",'Enable action');
  await evaluate("document.querySelector('.pv-device-primary').click()");
  await until("document.querySelector('.pv-device-status').textContent.includes('connected')",'Subscribed UI');
  check(registrations.length>0&&registrations.every(r=>r.body.platform==='web'&&r.body.accountAlerts&&!r.body.marketplace&&!r.body.residences),'Enable saves only the chosen current-account preferences');
  check(await evaluate('window.__pushFixture.prompts===1&&window.__pushFixture.subscriptions===1'),'Explicit enable prompts once and reuses the browser subscription');
  check(registrations.every(r=>r.headers['x-pinevela-profile-context']===account),'Registration is bound to the projected current account');
  check(await evaluate("document.querySelectorAll('.pv-device-actions button').length===1&&!/Send a test|Disable on this device/.test(document.querySelector('.pv-device-settings').textContent)"),'Connected settings retain only Save notification preferences');
  await evaluate("[...document.querySelectorAll('.pv-device-options label')].find(l=>l.textContent.includes('New marketplace listings')).querySelector('input').click()");
  await until("document.querySelectorAll('.pv-device-options input')[1].checked",'Marketplace choice');
  await evaluate("[...document.querySelectorAll('.pv-device-options label')].find(l=>l.textContent.includes('Account & maintenance alerts')).querySelector('input').click()");
  await until("!document.querySelectorAll('.pv-device-options input')[0].checked",'Account alerts choice');
  await evaluate("document.querySelector('.pv-device-primary').click()");
  await until("!document.querySelector('.pv-device-primary').disabled&&document.querySelector('.pv-device-status').textContent.includes('connected')",'Updated preferences saved');
  check(!registrations.at(-1).body.accountAlerts&&registrations.at(-1).body.marketplace&&!registrations.at(-1).body.residences,'Save updates chosen categories without disconnecting the device');
  await evaluate("[...document.querySelectorAll('.pv-device-options label input')].filter(e=>e.checked).forEach(e=>e.click())");
  await until("[...document.querySelectorAll('.pv-device-options input')].every(e=>!e.checked)",'No alert category selected');
  await evaluate("document.querySelector('.pv-device-primary').click()");
  await until("!document.querySelector('.pv-device-primary').disabled&&document.querySelector('.pv-device-status').textContent.includes('connected')",'All categories disabled');
  check(!registrations.at(-1).body.accountAlerts&&!registrations.at(-1).body.marketplace&&!registrations.at(-1).body.residences,'Every alert category can be turned off through preferences');
  check(tests.length===0&&disconnects.length===0&&await evaluate('window.__pushFixture.prompts===1'),'Preference saves never send test notifications, disconnect or prompt again');
  active=true;changedOwner=true;
  await load('/notification-settings',390,'light',{local:{id:crypto.randomUUID(),secret:crypto.randomBytes(32).toString('base64url'),enabled:true},permission:'granted'});
  await until("document.querySelector('.pv-device-primary')&&!document.querySelector('.pv-device-primary').disabled",'Shared-device settings');
  await until("JSON.parse(localStorage.getItem('pinevela:device-push')).enabled===false",'Old person disconnected');
  check(disconnects.length===0&&await evaluate("window.__pushFixture.prompts===0&&!![...document.querySelectorAll('label')].find(l=>l.textContent.includes('Keep my other accounts'))"),'An independent login requires an explicit choice before joining the device');
  await evaluate("[...document.querySelectorAll('label')].find(l=>l.textContent.includes('Keep my other accounts')).querySelector('input').click();document.querySelector('.pv-device-primary').click()");
  await until("document.querySelector('.pv-device-status').textContent.includes('connected')",'Independent account connected');
  check(registrations.at(-1).body.keepExistingAccounts===true,'Keeping other verified accounts is an explicit submitted preference');
  changedOwner=false;active=false;
  await load('/notification-settings',390,'light',{permission:'denied'});await until("document.querySelector('.pv-device-status')?.textContent.includes('blocked')",'Blocked permission');
  check(await evaluate('window.__pushFixture.prompts===0'),'Denied permission does not prompt repeatedly');
  await load('/device-notification?notice='+notice+'&account='+account+'&kind=primary');
  await until("document.body.innerText.includes('Private details are visible')",'Correct account notification');check(opens.length===1,'Correct account loads the private notification');
  await load('/device-notification?notice='+notice+'&account='+foreign+'&kind=manager');
  await until("document.body.innerText.includes('Sign in to this account')",'Different account gate');check(opens.length===1,'Wrong account UI never fetches private notification content');
  await load('/pinemarket?listing='+listing);await until("document.querySelector('[role=dialog]')?.textContent.includes('Campus headphones')",'Market discovery details');check(true,'Market discovery opens the requested item details');
  await load('/pineresidence?property='+residence);await until("document.querySelector('[role=dialog]')?.textContent.includes('Campus residence')",'Residence discovery details');check(true,'Residence discovery opens the requested property details');
  check(exceptions.length===0,'No uncaught browser exceptions');
  const report={passed:true,checks:checks.length,checkLabels:checks,scenes,actualBuiltReact:true,actualServiceWorkerRegistration:true,
   browserPermissionAndSubscription:'explicit fixtures',syntheticApiReplies:true,remoteDeliveryVerified:false,productionWrites:0};
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,checkLabels:undefined,scenes:scenes.length}));
 }catch(error){await fs.writeFile(path.join(output,'failure.json'),JSON.stringify({passed:false,stage,error:error.message,checks,exceptions},null,2)+'\n');throw error;}
 finally{chrome.kill();await Promise.race([once(chrome,'exit'),pause(3000)]).catch(()=>{});for(const p of pending.values())clearTimeout(p.timer);server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(profile,{recursive:true,force:true,maxRetries:4,retryDelay:100});}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
