/** Render only this standalone concept; do not load the app or any remote page. */
const fs=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const output=__dirname;
const color=value=>(value.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=rgb=>rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
(async()=>{
 const profile=await fs.mkdtemp('/tmp/pinevela-nav-design-');
 const chrome=spawn(process.env.CHROME_BIN||'/snap/chromium/current/usr/lib/chromium-browser/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--allow-file-access-from-files','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe','pipe','pipe']});
 let buffer='',sequence=0,stderr='';const pending=new Map(),errors=[];chrome.stderr.on('data',data=>stderr+=data);
 chrome.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const item=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(item.method==='Runtime.exceptionThrown')errors.push(item.params.exceptionDetails.text);const waiter=pending.get(item.id);if(waiter){pending.delete(item.id);clearTimeout(waiter.timer);item.error?waiter.reject(Error(item.error.message)):waiter.resolve(item.result)}}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out '+stderr.slice(-600)))},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0')});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  const evaluate=async expression=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['http://*','https://*']});
  const navigate=async(width=1540)=>{
   await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});
   await command('Page.navigate',{url:pathToFileURL(path.join(output,'index.html')).href+'?capture=1'});
   const end=Date.now()+10000;while(Date.now()<end){if(await evaluate("document.querySelectorAll('.bottom-nav').length===6&&!!window.previewState"))break;await pause(30)}
   await evaluate('document.fonts.ready');await pause(100);
  };
  await navigate();
  const cases=[];
  for(const width of [320,390,430,1540]){
   await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await pause(100);
   const data=await evaluate(`(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bars:[...document.querySelectorAll('.bottom-nav')].map(n=>{const r=n.getBoundingClientRect(),p=n.parentElement.getBoundingClientRect(),b=n.querySelector('[aria-current=page]'),s=getComputedStyle(b),i=getComputedStyle(n.querySelector('.indicator')),inactive=getComputedStyle(n.querySelector('.destination:not([aria-current]):not(.center-action)'));return{theme:n.parentElement.dataset.theme,role:n.parentElement.dataset.role,barWidth:r.width,parentWidth:p.width-10,connected:Math.abs(r.bottom-(p.bottom-5))<1,leftEdge:Math.abs(r.left-(p.left+5))<1,fill:getComputedStyle(n.querySelector('.nav-surface .fill')).fill,selection:i.backgroundColor,selected:s.color,inactive:inactive.color,hitTargets:[...n.querySelectorAll('button')].every(e=>e.getBoundingClientRect().width>=44&&e.getBoundingClientRect().height>=44)}})}))()`);
   assert(!data.overflow,'The design sheet fits '+width);
   for(const bar of data.bars){
    assert(bar.connected&&bar.leftEdge&&bar.hitTargets,'Bar touches screen edges and has usable hit targets');
    assert.equal(bar.fill,bar.theme==='light'?'rgb(255, 255, 255)':'rgb(0, 53, 102)');
    assert.equal(bar.selection,bar.theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)');
    assert(contrast(color(bar.selected),color(bar.fill))>=4.5,'Selected label contrast');
    assert(contrast(color(bar.inactive),color(bar.fill))>=4.5,'Inactive label contrast');
   }
   cases.push({width,...data});
  }
  await command('Emulation.setDeviceMetricsOverride',{width:1540,height:1100,deviceScaleFactor:1,mobile:false});await pause(100);
  const original=await evaluate('previewState.navStates[0].position');
  await evaluate('previewState.navStates[0].select(4)');await pause(90);
  const intermediate=await evaluate('previewState.navStates[0].position');assert(intermediate>original,'Selection moves across the bar');
  const iconTravel=await evaluate("(()=>{const s=previewState.navStates[0],y=i=>new DOMMatrixReadOnly(getComputedStyle(s.buttons[i].querySelector('.nav-icon')).transform).m42;return{previous:y(1),target:y(4)}})()");
  assert(iconTravel.previous>-28&&iconTravel.previous<0,'Previous icon lowers gradually');
  assert(iconTravel.target<0&&iconTravel.target>-28,'Target icon rises gradually');await pause(500);
  const completed=await evaluate('previewState.navStates[0].position');assert(completed>intermediate,'The curve and circle settle at the selected destination');
  for(const index of [2,3,4,5]){
   const x=await evaluate(`previewState.navStates[${index}].position`);
   await evaluate(`previewState.navStates[${index}].select(3);previewState.navStates[${index}].select(2)`);
   assert.equal(await evaluate(`previewState.navStates[${index}].position`),x,'The central + remains fixed');
   assert(await evaluate(`previewState.navStates[${index}].nav.parentElement.querySelector('.toast').classList.contains('open')`));
   await evaluate(`previewState.navStates[${index}].nav.parentElement.querySelector('.toast button').click()`);
  }
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  await evaluate('previewState.navStates[0].select(0)');await pause(40);assert.equal(await evaluate('previewState.navStates[0].frame'),0,'Reduced motion jumps directly to the destination');
  await command('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
  await evaluate('previewState.navStates.forEach(s=>s.select(1))');await pause(720);
  const height=await evaluate('document.documentElement.scrollHeight');
  await command('Emulation.setDeviceMetricsOverride',{width:1540,height:Math.ceil(height),deviceScaleFactor:1,mobile:false});await pause(80);
  const capture=async(name,clip)=>{const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:!!clip,...(clip?{clip}:{})});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'))};
  await capture('pinevela-mobile-navigation-preview');
  const panels=await evaluate("[...document.querySelectorAll('.device')].map(e=>{const r=e.getBoundingClientRect();return{name:e.dataset.role+'-'+e.dataset.theme,clip:{x:r.x,y:r.y,width:r.width,height:r.height,scale:2}}})");
  for(const panel of panels)await capture(panel.name,panel.clip);
  assert.equal(errors.length,0,errors.join('\n'));
  const report={passed:true,previewOnly:true,applicationFilesChanged:false,networkRequestsAllowed:false,roleThemeCases:cases.length*6,slidingCurveChecked:true,fixedPlusChecked:true,reducedMotionChecked:true,runtimeExceptions:errors,cases};
  await fs.writeFile(path.join(output,'preview-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,preview:path.join(output,'pinevela-mobile-navigation-preview.png'),interactive:path.join(output,'index.html'),roleThemeCases:report.roleThemeCases}));
 }finally{const stopped=new Promise(resolve=>{if(chrome.exitCode!==null||chrome.signalCode!==null)resolve();else chrome.once('exit',resolve)});chrome.kill();await stopped;for(const waiter of pending.values()){clearTimeout(waiter.timer);waiter.reject(Error('Browser closed'))}pending.clear();await fs.rm(profile,{force:true,recursive:true,maxRetries:3,retryDelay:100})}
})().catch(error=>{console.error(error);process.exitCode=1});
