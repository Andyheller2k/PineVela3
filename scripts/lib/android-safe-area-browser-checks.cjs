/** Actual connected mobile build in modern Chromium, with synthetic local API/bridge
 * fixtures only. No native credentials, real accounts or hosted requests exist. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
exports.bridgeSource=`
window.androidBridge={};window.__nativeAuthRequests=[];window.__nativeExternalRequests=[];
const fixtureFetch=window.fetch.bind(window);
window.Capacitor={PluginHeaders:[
{name:'PineVelaTransport',methods:['request','cancel','beginAuth','resumeAuth','getStatus','openExternal','removeListener'].map(name=>({name,rtype:'promise'})).concat([{name:'addListener',rtype:'callback'}])},
{name:'PineVelaAppearance',methods:[{name:'setAppearance',rtype:'promise'}]},
{name:'SystemBars',methods:[{name:'setStyle',rtype:'promise'}]}],
nativeCallback:()=> 'fixture-listener',nativePromise:async(plugin,method,options)=>{
 if(plugin!=='PineVelaTransport')return {};
 if(method==='beginAuth'){window.__nativeAuthRequests.push(options);return options.provider==='google'?{pending:false,authenticated:true,redirectTo:'/user/dashboard'}:{pending:true};}
 if(method==='openExternal'){window.__nativeExternalRequests.push(options);return {};}
 if(method!=='request')return {pending:false};
 if(!options.path.startsWith('/api/'))throw Error('Invalid local fixture request');
 const response=await fixtureFetch(options.path,{method:options.method,headers:options.headers,...(options.bodyBase64?{body:Uint8Array.from(atob(options.bodyBase64),c=>c.charCodeAt(0))}:{})});
 const bytes=new Uint8Array(await response.arrayBuffer());let text='';for(const byte of bytes)text+=String.fromCharCode(byte);
 return {status:response.status,headers:Object.fromEntries(response.headers),bodyBase64:btoa(text)};
}};`;

exports.run=async({viewport,load,evaluate,until,test,capture,command,pause,output,productRoutes})=>{
 const measurements=[];
 const click=async selector=>assert(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`),'Visible '+selector);
 const closeWelcome=async()=>{if(await evaluate(`!!document.querySelector('dialog[aria-label="Welcome to PineVela"]')`))await click('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]');};
 const contained=async(label)=>{
  await evaluate(`dispatchEvent(new Event('pageshow'))`);
  const data=await evaluate(`(()=>{const viewport=document.querySelector('meta[name="viewport"]').content,rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}},fixed=[...document.querySelectorAll('header,nav,[data-portal-navigation]')].filter(e=>e.getClientRects().length&&['fixed','sticky'].includes(getComputedStyle(e).position));return {viewport,w:innerWidth,h:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,fixed:fixed.map(e=>({tag:e.tagName,label:e.getAttribute('aria-label')||e.dataset.portalNavigation,...rect(e)}))}})()`);
  assert(data.viewport.includes('viewport-fit=contain'),label+' preserves native containment');assert(!data.overflow,label+' has no horizontal page overflow');
  for(const r of data.fixed)assert(r.x>=-1&&r.right<=data.w+1&&r.y>=-1&&r.bottom<=data.h+1,label+' fits '+JSON.stringify(r));
  measurements.push({label,...data});return data;
 };
 for(const size of [[320,560],[390,780],[812,360]])for(const theme of ['light','dark']){
  const [w,h]=size;
  await test(`${w}x${h} ${theme} Android layout welcome and native forms`,async()=>{
   await viewport(w,h);await load('/#/login',theme,false,{selector:'.native-welcome'});await contained('Welcome');
   await evaluate(`document.querySelector('.native-welcome-footer a:last-child').scrollIntoView({block:'end'})`);
   assert(await evaluate(`(()=>{const r=document.querySelector('.native-welcome-footer a:last-child').getBoundingClientRect();return r.y>=0&&r.bottom<=innerHeight+1})()`),'Welcome footer is reachable inside the viewport');
   await click('[data-native-welcome-login]');await until(`!!document.querySelector('.login-credentials-form')`,'Native login');await contained('Login');
   await evaluate(`(()=>{const e=[...document.querySelectorAll('.login-mode-toggle button')].find(e=>e.textContent.includes('Sign Up'));if(!e)throw Error('Missing signup switch');e.click()})()`);
   await until(`!!document.querySelector('.login-signup-form')`,'Native signup');await contained('Signup');
   if(w===390)await capture(`390-${theme}-native-signup`);
  });
  for(const page of productRoutes)await test(`${w}x${h} ${theme} Android layout ${page.name}`,async()=>{
   await viewport(w,h);await load(page.route,theme,false,page);await closeWelcome();await pause(120);await contained(page.name);
   if(page.name==='primary dashboard'){
    await click('.market-price-toggle');await until(`!!document.querySelector('dialog[aria-label="Marketplace filters"]')`,'Product filters');
    assert(await evaluate(`(()=>{const r=document.querySelector('dialog[aria-label="Marketplace filters"]').getBoundingClientRect();return Math.abs(r.x)<1&&Math.abs(r.y)<1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1})()`),'Modal covers only the contained viewport');await click('[aria-label="Close marketplace filters"]');
    if(w===390)await capture(`390-${theme}-native-market`);
   }
  });
 }
 for(const theme of ['light','dark'])for(const route of ['/help','/faq','/pinemarket','/pineresidence'])await test(`${theme} Android layout support/catalogue ${route}`,async()=>{
  await viewport(390,780);await load('/#'+route,theme);await contained(route);
 });
 for(const theme of ['light','dark'])for(const route of ['/privacy.html','/terms.html','/legal/terms-2026-10-27.html','/legal/terms-2026-11-05.html'])await test(`${theme} Android layout policy ${route}`,async()=>{
  await viewport(390,780);await load(route,theme,false,{selector:'.document'});await contained(route);
 });
 for(const mode of ['login','signup'])await test(`${mode} Android Google button starts the native provider handoff`,async()=>{
  await viewport(390,780);await load('/#/login?mode='+ (mode==='signup'?'register':'login'),'light',false,{selector:mode==='signup'?'.login-signup-form':'.login-credentials-form'});
  if(mode==='signup')await click('.login-signup-form input[type="checkbox"]');
  await click('.login-google-button');await until(`window.__nativeAuthRequests.length===1`,'Native Google dispatch');
  const requests=await evaluate('window.__nativeAuthRequests');assert.deepEqual(requests,[{mode,provider:'google',...(mode==='signup'?{termsAcceptance:{accepted:true,version:'2026-10-27'}}:{})}]);
  assert(await evaluate(`location.hash.startsWith('/#/login'.slice(1))`),'Native form remains in the app during external handoff');
 });
 await fs.writeFile(output+'/android-layout-measurements.json',JSON.stringify({actualNativeBundle:true,syntheticBridgeAndApi:true,measurements},null,2)+'\n');
};
