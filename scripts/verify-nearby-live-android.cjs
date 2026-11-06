/** Read-only public-map smoke check in the actual installed Android WebView. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 const output=path.resolve('docs/verification/nearby-shops-2026-11-06/android');
 const app='app.pinevela.mobile.debug',port=9255;
 const adb=args=>execFileSync('/home/wyse/Android/Sdk/platform-tools/adb',['-s','emulator-5554',...args],{timeout:30000,maxBuffer:8*1024*1024,stdio:['ignore','pipe','pipe']});
 const pending=new Map();let ws,seq=0,originalHash,runtimeExceptions=0;
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},25000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Public map diagnostic executes');return r.result.value;};
 const until=async(expression,label)=>{for(let i=0;i<160;i++){if(await evaluate(expression))return;await pause(250);}throw Error(label+' did not become ready');};
 try{
  const location=adb(['shell','pm','path',app]).toString().trim();
  assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(location));
  const installedApkSha256=adb(['shell','sha256sum',location.slice(8)]).toString().match(/^[a-f0-9]{64}/)?.[0];
  const expected=JSON.parse(await fs.readFile('docs/verification/nearby-shops-2026-11-06/summary.json','utf8')).apkSha256;
  assert.equal(installedApkSha256,expected,'The persistent development APK matches the current release after reopen');
  const pid=adb(['shell','pidof',app]).toString().trim().split(/\s+/)[0];assert(pid);
  adb(['forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`]);
  let target;
  for(let i=0;i<100&&!target;i++){
   try{target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>{if(t.type!=='page'||!t.url.startsWith('https://localhost'))return false;const d=JSON.parse(t.description||'{}');return d.attached&&!d.empty&&d.width>0;});}catch{}
   if(!target)await pause(250);
  }
  assert(target,'The real visible bundled WebView becomes ready');
  ws=new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/,'127.0.0.1'));await once(ws,'open');
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}else if(m.method==='Runtime.exceptionThrown')runtimeExceptions++;});
  await send('Runtime.enable');originalHash=await evaluate('location.hash');
  const shop=await evaluate(`(async()=>{const r=await fetch('/api/digital-market/stores?q=PineVela');if(!r.ok)throw Error('Public directory unavailable');const j=await r.json();const s=j.stores.find(s=>s.storeName==='PineVela Store');if(!s)throw Error('Expected public shop missing');return{id:s.id,name:s.storeName,address:s.location};})()`);
  await evaluate(`location.hash='/pinemarket'`);
  await until(`!!document.querySelector('[aria-label="Find shops and services nearby"]')`,'Native public marketplace location button');
  await evaluate(`document.querySelector('[aria-label="Find shops and services nearby"]').click()`);
  await until(`!!document.querySelector('.nearby-services-screen')`,'Native map');
  await until(`!!document.querySelector('[data-service-marker="store:${shop.id}"][data-location-precision="approximate"]')`,'Native shop area marker from live server');
  // Exercise denial through the actual foreground permission dialog, if shown.
  // Never grant location access or submit an account form.
  const focus=adb(['shell','dumpsys','window']).toString();
  assert(!/mCurrentFocus=[^\n]*Application Not Responding/.test(focus),'Android shell must be responsive before the map check');
  const permissionPromptCancelled=/mCurrentFocus=[^\n]*GrantPermissionsActivity/.test(focus);
  if(permissionPromptCancelled){
   const dump='/data/local/tmp/pinevela-nearby-permission.xml';
   adb(['shell','uiautomator','dump',dump]);
   const xml=adb(['shell','cat',dump]).toString();adb(['shell','rm',dump]);
   const deny=xml.match(/<node\b[^>]*resource-id="[^"]*:id\/permission_deny(?:_and_dont_ask_again)?_button"[^>]*>/)?.[0];
   const bounds=deny?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
   assert(bounds,'The visible Android denial button is located');
   adb(['shell','input','tap',String(Math.round((+bounds[1]+ +bounds[3])/2)),String(Math.round((+bounds[2]+ +bounds[4])/2))]);
   await pause(500);
  }
  await evaluate(`(()=>{const e=document.querySelector('[aria-label="Search shops and services on map"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(shop.name)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(`document.querySelector('[data-map-summary]')?.textContent.includes('1 matching')`,'Native live shop-name search');
  await evaluate(`document.querySelector('[data-map-search-result="store:${shop.id}"]').click()`);
  await until(`!!document.querySelector('[data-approximate-shop]')`,'Native approximate-area explanation');
  const ui=await evaluate(`(()=>{const e=document.querySelector('.nearby-services-screen'),m=document.querySelector('.nearby-map'),r=e.getBoundingClientRect();return{width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,mapWithinViewport:r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1,approximateNotice:document.querySelector('[data-approximate-shop]').textContent.includes('Approximate area'),noExactDirections:!document.querySelector('[aria-label="Waypoint directions"]'),viewShopAvailable:!![...document.querySelectorAll('.nearby-map-results button')].find(b=>b.textContent==='View shop'),tilesLoaded:[...m.querySelectorAll('img.leaflet-tile')].filter(i=>i.complete&&i.naturalWidth>0).length,deviceLocationUsed:e.dataset.originSource==='device'}})()`);
  assert(!ui.overflow&&ui.mapWithinViewport&&ui.approximateNotice&&ui.noExactDirections&&ui.viewShopAvailable,'Native map fits and distinguishes the public approximate shop area');
  const finalFocus=adb(['shell','dumpsys','window']).toString();
  assert(!/mCurrentFocus=[^\n]*(Application Not Responding|GrantPermissionsActivity)/.test(finalFocus),'No Android system dialog covers the verified map');
  if(!ui.deviceLocationUsed)await fs.writeFile(path.join(output,'nearby-live-public-map.png'),adb(['exec-out','screencap','-p']));
  await evaluate(`document.querySelector('[aria-label="Close services map"]').click()`);
  await evaluate(`location.hash=${JSON.stringify(originalHash)}`);
  await until(`location.hash===${JSON.stringify(originalHash)}&&!document.querySelector('.nearby-services-screen')`,'Previous app route restored');
  assert.equal(runtimeExceptions,0,'No native WebView runtime exceptions');
  const report={passed:true,actualInstalledAndroidWebView:true,installedApkSha256,backend:'https://pinevela.app',publicShop:shop,permissionPromptDenied:permissionPromptCancelled,permissionsGrantedByVerifier:false,mapWorksWithoutDeviceLocationFix:!ui.deviceLocationUsed,launcherRecoveryBeforeCheck:process.env.PINEVELA_LAUNCHER_RECOVERED==='1',noSystemDialogCoveringMap:true,accountFormsSubmitted:false,accountWrites:0,originalRouteRestored:true,runtimeExceptions,ui,emulatorLeftRunning:true};
  await fs.writeFile(path.join(output,'nearby-live-map.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{
  if(ws?.readyState===WebSocket.OPEN&&originalHash!==undefined)try{await evaluate(`location.hash=${JSON.stringify(originalHash)}`);}catch{}
  ws?.close();for(const p of pending.values())clearTimeout(p.timer);
  try{adb(['forward','--remove',`tcp:${port}`]);}catch{}
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
