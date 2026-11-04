/** Render and inspect the standalone design only. No app, API or account writes. */
const fs=require('node:fs/promises');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const output=__dirname,root=path.resolve(__dirname,'../..');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rgba=value=>value.startsWith('#')?[...value.slice(1).matchAll(/../g)].map(c=>parseInt(c[0],16)):(value.match(/[\d.]+/g)||[]).map(Number);
const over=(paint,base)=>paint.slice(0,3).map((v,i)=>v*(paint[3]??1)+base[i]*(1-(paint[3]??1)));
const luminance=color=>color.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
(async()=>{
 const allowed=new Map([
  ['/index.html',path.join(output,'index.html')],
  ['/public/brand.css',path.join(root,'public/brand.css')],
  ['/public/brand/caviar-dreams-bold.ttf',path.join(root,'public/brand/caviar-dreams-bold.ttf')],
  ['/public/store-covers/pinevela-logo.svg',path.join(root,'public/store-covers/pinevela-logo.svg')],
  ['/assets/fonts/native/plus-jakarta-sans-latin-variable.woff2',path.join(root,'assets/fonts/native/plus-jakarta-sans-latin-variable.woff2')],
 ]);
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),file=allowed.get(url.pathname==='/'?'/index.html':url.pathname);
  if(req.method!=='GET'||!file){res.writeHead(404);res.end();return;}
  const type={'.html':'text/html','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)];
  res.setHeader('Content-Type',type);res.end(await fs.readFile(file));
 });
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const origin='http://127.0.0.1:'+server.address().port;
 const profile=await fs.mkdtemp('/tmp/pinevela-plan-preview-');
 const chrome=spawn('/snap/chromium/current/usr/lib/chromium-browser/chrome',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--no-first-run','--remote-debugging-pipe','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','ignore','pipe','pipe']});
 let buffer='',sequence=0;const pending=new Map(),checks=[],errors=[];
 chrome.stdio[4].on('data',chunk=>{buffer+=chunk;let index;while((index=buffer.indexOf('\0'))>=0){const item=JSON.parse(buffer.slice(0,index));buffer=buffer.slice(index+1);if(item.method==='Runtime.exceptionThrown')errors.push(item.params.exceptionDetails.text);const waiter=pending.get(item.id);if(waiter){pending.delete(item.id);clearTimeout(waiter.timer);item.error?waiter.reject(Error(item.error.message)):waiter.resolve(item.result);}}});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timeout'));},20000);pending.set(id,{resolve,reject,timer});chrome.stdio[3].write(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})})+'\0');});
 try{
  const {targetId}=await send('Target.createTarget',{url:'about:blank'}),{sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
  const command=(method,params)=>send(method,params,sessionId);
  const evaluate=async(expression)=>{const r=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
  await command('Page.enable');await command('Runtime.enable');await command('Network.enable');await command('Network.setBlockedURLs',{urls:['https://*']});
  const navigate=async(query,width,height=1040)=>{
   await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<640});
   await command('Page.navigate',{url:origin+'/index.html?'+query});
   const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(`document.readyState==='complete'&&!!document.querySelector('#comparison-rows tr')`))break;await wait(50);}
   await evaluate('document.fonts.ready');await wait(100);
  };
  const capture=async name=>{const shot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(path.join(output,name+'.png'),Buffer.from(shot.data,'base64'));};
  for(const width of [320,390,430,1280])for(const theme of ['light','dark'])for(const plan of ['default','star']){
   await navigate('capture=1&theme='+theme+'&plan='+plan,width);
   const state=await evaluate(`(()=>{const b=document.querySelector('.upgrade-button'),s=getComputedStyle(b),t=document.querySelector('table'),r=t.getBoundingClientRect();return {theme:document.documentElement.dataset.theme,next:document.querySelector('#next-name').textContent,action:s.backgroundImage,ink:s.color,actionHeight:b.getBoundingClientRect().height,noOverflow:document.documentElement.scrollWidth<=innerWidth,tableFits:r.x>=0&&r.right<=innerWidth,rows:document.querySelectorAll('tbody tr').length,cardBottom:document.querySelector('.plan-card').getBoundingClientRect().bottom,contrastColors:[getComputedStyle(document.body).color,getComputedStyle(document.querySelector('.feature small')).color,getComputedStyle(document.querySelector('.next-value')).color],backgrounds:[getComputedStyle(document.body).getPropertyValue('--canvas').trim(),getComputedStyle(document.body).getPropertyValue('--target').trim()]}})()`);
   assert(state.noOverflow&&state.tableFits,'Comparison fits '+width);
   assert(state.actionHeight>=44);assert.equal(state.rows,6);
   assert(state.next.includes(plan==='default'?'Star':'Pro'));
   assert(state.action.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)'));
   assert.equal(state.ink,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');
   const palette=await evaluate(`(()=>{const s=getComputedStyle(document.body);return Object.fromEntries(['canvas','panel','target','ink','muted','selected'].map(k=>[k,s.getPropertyValue('--'+k).trim()]))})()`);
   const canvas=rgba(palette.canvas),panel=over(rgba(palette.panel),canvas),target=rgba(palette.target);
   state.contrastRatios={body:contrast(rgba(palette.ink),panel),helper:contrast(rgba(palette.muted),panel),target:contrast(rgba(palette.selected),target),action:Math.min(...(theme==='light'?['#003566','#001d3d']:['#ffc300','#ffd60a']).map(color=>contrast(rgba(state.ink),rgba(color))))};
   for(const [label,ratio] of Object.entries(state.contrastRatios))assert(ratio>=4.5,label+' text contrast is at least 4.5:1');
   checks.push({width,theme,plan,...state});
   if(width===390)await capture(theme+'-'+plan+'-to-'+(plan==='default'?'star':'pro'));
   if(width===1280&&plan==='default')await capture('desktop-'+theme);
  }
  await navigate('',390);
  await evaluate(`document.querySelector('[data-theme-choice="dark"]').click();document.querySelector('[data-plan-choice="star"]').click()`);
  assert.equal(await evaluate('document.documentElement.dataset.theme'),'dark');assert((await evaluate(`document.querySelector('#next-name').textContent`)).includes('Pro'));
  await evaluate(`document.querySelector('.upgrade-button').click()`);assert((await evaluate(`document.querySelector('#preview-status').textContent`)).includes('Preview only'));
  await evaluate(`document.querySelector('.keep-button').click()`);assert((await evaluate(`document.querySelector('#preview-status').textContent`)).includes('current plan'));
  await navigate('board=1',858,2040);
  await evaluate(`Promise.all([...document.querySelectorAll('iframe')].map(f=>new Promise(resolve=>{const ready=()=>f.contentDocument?.readyState==='complete';if(ready())resolve();else f.addEventListener('load',resolve,{once:true});})))`);
  await evaluate(`Promise.all([...document.querySelectorAll('iframe')].map(f=>f.contentDocument.fonts.ready))`);
  await evaluate(`document.querySelectorAll('iframe').forEach(f=>{f.style.height=(f.contentDocument.documentElement.scrollHeight+2)+'px';})`);
  const height=await evaluate('document.documentElement.scrollHeight');
  await command('Emulation.setDeviceMetricsOverride',{width:858,height:Math.ceil(height),deviceScaleFactor:1,mobile:false});
  await capture('preview-board');
  assert.equal(errors.length,0);
  const report={passed:true,prototypeOnly:true,applicationSourceChanged:false,checkoutImplemented:false,responsiveThemeCases:checks.length,interactiveControlsPassed:true,runtimeExceptions:errors,checks};
  await fs.writeFile(path.join(output,'preview-checks.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,responsiveThemeCases:checks.length,preview:path.join(output,'index.html'),board:path.join(output,'preview-board.png')}));
 }finally{chrome.kill();for(const item of pending.values()){clearTimeout(item.timer);item.reject(Error('Browser closed'));}pending.clear();server.close();await fs.rm(profile,{force:true,recursive:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
