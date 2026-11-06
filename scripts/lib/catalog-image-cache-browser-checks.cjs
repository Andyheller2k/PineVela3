/** Read-only local catalogue fixtures; no hosted accounts or Storage requests. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
module.exports=async({viewport,load,evaluate,until,test,capture,command,pause,output,photoRequests,photoPath,resetCatalogPhotos,notifyCatalog,settingsStreams,updateCatalog})=>{
 const measurements=[],baseline=process.env.PINEVELA_CACHE_BASELINE==='1';
 const market='#home-market-section [data-listing-id="browser-fixture-item-0"] img';
 const residence='#home-hostels-section [data-residence-id="browser-fixture-residence-0"] img';
 const click=async selector=>assert(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`),'Visible '+selector);
 const tab=async(id,width)=>click(width<1024?`[data-navigation-id="${id}"]`:`[data-user-navigation][title="${{home:'Home Tab',options:'Options Tab','digital-market':'Purchases & Tracking'}[id]}"]`);
 const catalog=async index=>{await click(`.user-catalog-switcher button:nth-child(${index})`);await until(`document.querySelector('${index===1?'#home-market-section':'#home-hostels-section'}')?.getClientRects().length>0`,'Selected catalogue');};
 const ready=selector=>until(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e?.complete&&e.naturalWidth>0})()`,'Loaded photo');
 const open=async(width,theme)=>{
  resetCatalogPhotos();await command('Network.clearBrowserCache');await viewport(width);
  await load('/#/user/dashboard',theme,false,{role:'user',selector:'.user-dashboard [data-dashboard-view]'});
  if(await evaluate(`!!document.querySelector('dialog[aria-label="Welcome to PineVela"]')`))await click('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]');
  await ready(market);await pause(250);
 };
 const refresh=async()=>{
  const end=Date.now()+10000;while(!settingsStreams.size&&Date.now()<end)await pause(50);
  assert(settingsStreams.size,'Actual query sync connected');notifyCatalog();
 };
 for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} catalog image cache navigation`,async()=>{
  await open(width,theme);
  assert(!photoRequests.some(r=>r.path===photoPath('2')),'Unvisited residence photos are not prefetched');
  await evaluate(`window.originalMarketPhoto=document.querySelector(${JSON.stringify(market)});true`);
  const before=photoRequests.length;
  await catalog(2);await ready(residence);await pause(250);
  await evaluate(`window.originalResidencePhoto=document.querySelector(${JSON.stringify(residence)});true`);
  const both=photoRequests.length;
  await catalog(1);await ready(market);await pause(250);
  const marketSame=await evaluate(`window.originalMarketPhoto===document.querySelector(${JSON.stringify(market)})`);
  await catalog(2);await ready(residence);await pause(250);
  const residenceSame=await evaluate(`window.originalResidencePhoto===document.querySelector(${JSON.stringify(residence)})`);
  await tab('options',width);await until(`document.querySelector('.user-dashboard [data-dashboard-view]')?.dataset.dashboardView==='options'`,'Options');
  await tab('home',width);await until(`document.querySelector('#home-hostels-section')?.getClientRects().length>0`,'Home');await ready(residence);await pause(250);
  const homeSame=await evaluate(`window.originalResidencePhoto===document.querySelector(${JSON.stringify(residence)})`);
  const navigationRequests=photoRequests.slice(both);
  measurements.push({width,theme,marketSame,residenceSame,homeSame,initialMarketRequests:before,initialBothRequests:both,navigationRequests,navigationDownloadedBytes:navigationRequests.reduce((sum,r)=>sum+r.bytes,0)});
  if(!baseline){
   assert(marketSame&&residenceSame&&homeSame,'Loaded image nodes survive all view switches');
   assert.equal(navigationRequests.length,0,'Switching views causes zero image HTTP requests');
   assert(await evaluate(`(()=>{const hidden=document.querySelector('#home-market-section');return hidden.hidden&&getComputedStyle(hidden).display==='none'&&![...hidden.querySelectorAll('button,input,a')].some(e=>e.getClientRects().length)})()`),'Hidden catalogue cannot display or receive keyboard focus');
   assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`),'No horizontal page overflow');
   await capture(`${width}-${theme}-residence-cache`);
  }
 });
 if(!baseline)for(const theme of ['light','dark']){
  await test(`${theme} catalog image cache hidden panels cannot leave the filters modal open`,async()=>{
   await open(390,theme);await evaluate(`window.originalMarketPhoto=document.querySelector(${JSON.stringify(market)});true`);
   const before=photoRequests.length;await click('.market-price-toggle');await until(`!!document.querySelector('dialog[aria-label="Marketplace filters"]')`,'Filter modal');
   // Simulate route-driven navigation while a modal has the normal UI inert.
   await tab('options',390);await until(`document.querySelector('[data-dashboard-view]')?.dataset.dashboardView==='options'&&!document.querySelector('dialog[aria-label="Marketplace filters"]')`,'Hidden Home closes its portal');
   await tab('home',390);await until(`document.querySelector('#home-market-section')?.getClientRects().length>0`,'Home');
   assert(await evaluate(`!document.querySelector('dialog[aria-label="Marketplace filters"]')&&window.originalMarketPhoto===document.querySelector(${JSON.stringify(market)})`),'Returning restores photos without reopening the old dialog');
   assert.equal(photoRequests.length,before);
  });
  await test(`${theme} catalog image cache updates hidden images and removes withdrawn cards`,async()=>{
   await open(390,theme);await catalog(2);await ready(residence);await catalog(1);
   updateCatalog((items,hostels)=>{items[0].imageUrl=photoPath('3');hostels[0].imageUrl=photoPath('4');items.splice(1,1);hostels.splice(1,1);});
   await refresh();await until(`document.querySelector(${JSON.stringify(market)})?.getAttribute('src')===${JSON.stringify(photoPath('3')+'?size=card')}`,'Changed market photo');await ready(market);
   await catalog(2);await until(`document.querySelector(${JSON.stringify(residence)})?.getAttribute('src')===${JSON.stringify(photoPath('4')+'?size=card')}`,'Changed residence photo');await ready(residence);
   assert(await evaluate(`!document.querySelector('[data-listing-id="browser-fixture-item-1"]')&&!document.querySelector('[data-residence-id="browser-fixture-residence-1"]')`),'Removed listings do not remain in retained DOM');
  });
  await test(`${theme} catalog image cache reuses image bytes after a filter remount`,async()=>{
   await open(390,theme);const before=photoRequests.length;
   await evaluate(`(()=>{const e=document.querySelector('#home-market-section input[type="text"]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;if(!(e instanceof HTMLInputElement))throw Error('Missing catalogue search');set.call(e,'No matching fixture');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
   await until(`!document.querySelector(${JSON.stringify(market)})`,'Filtered card removed');
   await evaluate(`(()=>{const e=document.querySelector('#home-market-section input[type="text"]'),set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
   await ready(market);await pause(200);
   const requests=photoRequests.slice(before);assert(requests.every(r=>r.status===304&&r.bytes===0),'Browser reuses validated photo bytes');
   measurements.push({theme,filterRevalidation:requests});
  });
  await test(`${theme} catalog image cache residence recovers when a failed cover is replaced`,async()=>{
   await open(390,theme);updateCatalog((_items,hostels)=>{hostels[0].imageUrl=photoPath('9');});await refresh();await catalog(2);
   await until(`document.querySelector('[data-residence-id="browser-fixture-residence-0"]')?.textContent.includes('No residence photos uploaded')`,'Failed cover fallback');
   updateCatalog((_items,hostels)=>{hostels[0].imageUrl=photoPath('5');});await refresh();
   await until(`document.querySelector(${JSON.stringify(residence)})?.getAttribute('src')===${JSON.stringify(photoPath('5')+'?size=card')}`,'Replacement cover');await ready(residence);
  });
  await test(`${theme} catalog image cache survives a browser reload with conditional validation`,async()=>{
   await open(390,theme);const before=photoRequests.length;
   await command('Page.reload');await until(`!!document.querySelector(${JSON.stringify(market)})`,'Reloaded catalogue');await ready(market);await pause(250);
   const requests=photoRequests.slice(before);assert(requests.some(r=>r.path===photoPath('1')&&r.status===304),'Reload validates the stored image');
   assert(requests.every(r=>r.conditional&&r.status===304&&r.bytes===0),'Reload never downloads unchanged photo bytes');
   measurements.push({theme,browserReload:requests});
  });
 }
 for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} purchase image cache navigation`,async()=>{
  await open(width,theme);await tab('digital-market',width);
  const purchase='[data-purchases-panel] .purchase-product img';await ready(purchase);await pause(150);
  const initial=await evaluate(`(()=>{window.retainedPurchasePhoto=document.querySelector('${purchase}');return{src:window.retainedPurchasePhoto.getAttribute('src'),count:document.querySelectorAll('[data-purchases-panel] .purchase-card').length}})()`);
  assert(initial.count>0&&initial.src.endsWith('?size=thumb'),'Actual purchase cards use compact image variants');
  const before=photoRequests.length;await tab('options',width);
  await until(`document.querySelector('[data-dashboard-view]')?.dataset.dashboardView==='options'`,'Options');
  assert(await evaluate(`(()=>{const p=document.querySelector('[data-purchases-panel]');return p.hidden&&p.inert&&!p.getClientRects().length})()`),'Hidden purchase details cannot receive focus');
  await tab('home',width);await tab('digital-market',width);await ready(purchase);await pause(150);
  assert(await evaluate(`window.retainedPurchasePhoto===document.querySelector('${purchase}')`),'The same decoded purchase image node survives navigation');
  assert.equal(photoRequests.length,before,'Purchase-tab round trips cause zero photo HTTP requests');
  await capture(`${width}-${theme}-purchase-image-cache`);
  measurements.push({width,theme,purchases:{...initial,requestsAfterNavigation:photoRequests.length-before}});
 });
 await fs.writeFile(output+'/cache-measurements.json',JSON.stringify({baseline,measurements},null,2)+'\n');
};
