const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {stores}=require('./nearby-ui-fixtures.cjs');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,output,mapStoreRequests})=>{
 const files=['src/components/NearbyServicesMap.tsx','src/components/MarketplaceFilters.tsx','src/components/PublicMarketCatalog.tsx','src/components/PageManagerDashboard.tsx','src/components/MobileNavigation.tsx','src/mobileNavigation.css','src/nearbyShortcut.css','src/lib/nearbyPlaces.ts','dist-supabase/index.html'];
 const hashes=async()=>Object.fromEntries(await Promise.all(files.map(async f=>[f,crypto.createHash('sha256').update(await fs.readFile(f)).digest('hex')]))),sourceSha256=await hashes(),measurements=[];
 const click=selector=>evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)});if(!b)throw Error('Missing '+${JSON.stringify(selector)});b.click();})()`);
 const fill=value=>evaluate(`(()=>{const e=document.querySelector('input[aria-label="Search shops and services on map"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const closeWelcome=()=>evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]'))if(d.getAttribute('aria-label')?.includes('Welcome'))d.querySelector('[aria-label="Close dialog"]')?.click();})()`);
 const user=async(width,theme)=>{await viewport(width);await load('/#/user/dashboard',theme,false,{role:'user',selector:'.user-market-panel .marketplace-filter-bar'});await closeWelcome();};
 for(const width of [320,390,768,822,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} nearby location icon`,async()=>{
  await user(width,theme);const selector='.marketplace-filter-controls [aria-label="Find shops and services nearby"]';
  const m=await evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();return{left:r.left,right:r.right,width:r.width,height:r.height,text:b.textContent.trim(),icon:!!b.querySelector('svg'),visible:!!b.getClientRects().length,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
  assert(m.visible&&m.icon&&!m.text&&m.width>=43.5&&m.height>=43.5);assert(m.left>=0&&m.right<=width+1&&!m.overflow,'Nearby icon is visible in the toolbar on desktop/mobile');
  for(const category of ['Services','Electronics','All']){await evaluate(`document.querySelectorAll('.market-categories button').forEach(b=>{if(b.textContent.trim()===${JSON.stringify(category)})b.click()})`);assert(await evaluate(`!!document.querySelector(${JSON.stringify(selector)})?.getClientRects().length`));}
  measurements.push({scene:'nearby-icon',width,theme,...m});
 });
 for(const width of [320,390,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} nearby shop search and area pins`,async()=>{
  await user(width,theme);const before=mapStoreRequests.length;await click('.marketplace-filter-controls [aria-label="Find shops and services nearby"]');
  await until(`!!document.querySelector('[data-service-marker="store:${stores[1].id}"][data-location-precision="approximate"]')`,'Address-only shop area marker');
  assert(await evaluate(`!!document.querySelector('[data-service-marker="store:${stores[0].id}"]')&&!!document.querySelector('[data-map-search-result="store:${stores[3].id}"]')`),'Goods-only and empty public shops show without GPS');
  await fill('Bomso Creative');await until(`!!document.querySelector('[data-map-search-result="store:${stores[1].id}"]')&&!document.querySelector('[data-map-search-result="store:${stores[0].id}"]')`,'Shop name search');
  await click(`[data-map-search-result="store:${stores[1].id}"]`);await until(`!!document.querySelector('[data-approximate-shop]')`,'Approximate area notice');
  assert(await evaluate(`document.querySelector('[data-approximate-shop]').textContent.includes('Approximate area')&&!document.querySelector('[aria-label="Waypoint directions"]')`),'An area pin cannot silently become an exact route');
  await evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Set a waypoint')b.click()})`);await click(`[data-service-marker="store:${stores[1].id}"]`);
  assert(!await evaluate(`!!document.querySelector('[aria-label="Waypoint directions"]')`),'Choosing an approximate marker in waypoint mode retains its area warning');
  await capture(`${width}-${theme}-nearby-approximate-shop`);
  await fill('Graphic design');await until(`!!document.querySelector('[data-map-search-result="store:${stores[1].id}"]')&&document.querySelector('[data-map-summary]').textContent.includes('1 matching')`,'Flexible service can find its shop');
  assert(!await evaluate(`!!document.querySelector('[data-service-marker="fixture-flexible"]')`),'Flexible service has no fabricated service location');
  await fill('Campus Supply');await until(`!!document.querySelector('[data-map-search-result="store:${stores[0].id}"]')&&!document.querySelector('[data-map-search-result="store:${stores[1].id}"]')`,'Exact shop search');
  await pause(100);const center=await evaluate(`(()=>{const e=document.querySelector('.nearby-map');return{lat:Number(e.dataset.mapCenterLat),lng:Number(e.dataset.mapCenterLng)}})()`);assert(Math.abs(center.lat-6.6701)<.02&&Math.abs(center.lng+1.5602)<.02,'Search pans to the matching shop');
  await click(`[data-map-search-result="store:${stores[0].id}"]`);await until(`!!document.querySelector('[aria-label="Waypoint directions"]')`,'Exact shop retains directions');
  assert(await evaluate(`document.querySelector('[aria-label="Waypoint directions"] a').href.includes('destination=6.6701%2C-1.5602')`));
  await evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Clear waypoint')b.click()})`);
  await evaluate(`document.querySelectorAll('button').forEach(b=>{if(b.textContent.trim()==='Set starting point')b.click()})`);await until(`!!document.querySelector('.nearby-placement-hint button')`,'Manual starting point');await click('.nearby-placement-hint button');
  await fill('Accra Books');await until(`!!document.querySelector('[data-map-search-result="store:${stores[4].id}"]')`,'Shop name search is independent of nearby radius');
  await fill('Unpinned Studio');await until(`!!document.querySelector('[data-map-search-result="store:${stores[2].id}"]')`,'Unresolved shop remains searchable');await click(`[data-map-search-result="store:${stores[2].id}"]`);
  await until(`document.querySelector('[data-approximate-shop]')?.textContent.includes('could not be located')`,'Provider failure is explicit and keeps the shop accessible');
  assert(await evaluate(`!![...document.querySelectorAll('.nearby-map-results button')].find(b=>b.textContent==='View shop')`));
  await fill('No shop matches this');await until(`document.querySelector('.nearby-map-header').textContent.includes('No matching shops or services')`,'Empty search state');
  await click('[aria-label="Close services map"]');await until(`!document.querySelector('.nearby-services-screen')`,'Map closed');
  const after=mapStoreRequests.length;await pause(600);assert.equal(mapStoreRequests.length,after,'Closed map performs no idle location work');assert(after-before<20,'Search and area requests stay bounded');
 });
 for(const width of [320,390,768,822,1440])for(const theme of ['light','dark'])await test(`${width}px ${theme} manager room key header`,async()=>{
  await viewport(width);await load('/?visual_nav_urgency=primary#/manager/dashboard',theme,false,{role:'manager',selector:'[data-dashboard-shell]'});await closeWelcome();
  if(width<1024){await click('.mobile-bottom-nav [data-navigation-id="more"]');await until(`!!document.querySelector('[data-portal-navigation="menu"] [data-navigation-id="blocks"]:not([disabled])')`,'Approved manager blocks destination');await click('[data-portal-navigation="menu"] [data-navigation-id="blocks"]');}
  else await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-portal-navigation="sidebar"] button')].find(b=>b.textContent.includes('Blocks'));if(!b)throw Error('No blocks destination');b.click()})()`);
  await until(`document.querySelector('[data-room-keys-heading]')?.textContent.includes('200 Digital Keys')`,'Realistic room key summary fixture');
  const m=await evaluate(`(()=>{const h=document.querySelector('[data-room-keys-heading]'),rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};return{heading:rect(h),actions:[...h.querySelector('[data-room-key-actions]').children].map(e=>({...rect(e),clipped:e.scrollWidth>e.clientWidth+1})),overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
  assert(!m.overflow);for(const a of m.actions){assert(a.left>=m.heading.left&&a.right<=m.heading.right&&!a.clipped,'Manager header control is fully visible');for(const b of m.actions)if(a!==b)assert(a.right<=b.left+.5||b.right<=a.left+.5||a.bottom<=b.top+.5||b.bottom<=a.top+.5,'Room key buttons and count never overlap');}
  measurements.push({scene:'manager-header',width,theme,...m});if([390,768,822].includes(width))await capture(`${width}-${theme}-manager-room-key-header`);
 });
 for(const width of [320,390,822])for(const theme of ['light','dark'])await test(`${width}px ${theme} resident settings icon`,async()=>{
  await viewport(width);await load('/#/resident/dashboard',theme,false,{role:'student',selector:'.mobile-bottom-nav [data-navigation-id="settings"]'});await closeWelcome();await click('.mobile-bottom-nav [data-navigation-id="settings"]');await until(`document.querySelector('.mobile-bottom-nav')?.dataset.activeDestination==='settings'`,'Resident settings selected');await pause(280);
  const m=await evaluate(`(()=>{const n=document.querySelector('.mobile-bottom-nav'),h=n.querySelector('.pv-nav-side-highlight'),i=n.querySelector('[data-navigation-id="settings"] .pv-nav-icon'),plus=n.querySelector('.pv-nav-central-action .pv-nav-icon'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height}};return{highlight:rect(h),icon:rect(i),plus:rect(plus),radius:getComputedStyle(h).borderRadius,color:getComputedStyle(h).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
  assert(!m.overflow&&Math.abs(m.highlight.w-m.highlight.h)<1&&(m.radius==='50%'||parseFloat(m.radius)>=m.highlight.w/2),'Selected settings highlight is circular');
  assert(Math.abs(m.highlight.x-m.icon.x)<1&&Math.abs(m.highlight.y-m.icon.y)<1,'Resident Settings icon is centered in its highlight');assert(m.plus.y<m.icon.y-10,'Raised plus action remains in place');assert.equal(m.color,theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)');
  measurements.push({scene:'resident-settings',width,theme,...m});await capture(`${width}-${theme}-resident-settings-icon`);
 });
 assert.deepEqual(await hashes(),sourceSha256,'Verified frontend remains unchanged during browser checks');
 await fs.writeFile(output+'/nearby-ui.json',JSON.stringify({passed:true,localFixturesOnly:true,productionWrites:0,sourceSha256,measurements,mapRequests:mapStoreRequests.length},null,2)+'\n');
};
