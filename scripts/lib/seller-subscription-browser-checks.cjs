/** Real built seller UI, with synthetic local settings/store/payment responses only. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
module.exports=async({viewport,load,evaluate,until,test,capture,command,pause,output,setSubscriptionRates,subscriptionCheckouts,settingsStreams})=>{
 const measurements=[],initialRates={default:7.25,star:127.35,pro:211.5};
 const click=async selector=>{assert(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`),'Visible '+selector);};
 const open=async(width,theme,plan='default',prices)=>{
  setSubscriptionRates(initialRates);await viewport(width);
  await load('/#/digital-market',theme,false,{role:'merchant',plan,prices,selector:'[data-product-screen="market"] main'});
  if(width<640){await click('[data-navigation-id="more"]');await until(`!!document.querySelector('[data-portal-navigation="menu"]')`,'More');await click('[data-navigation-id="upgrade"]');}
  else await click('button[aria-label="Upgrade your seller plan"]');
  await until(`!!document.querySelector('[data-seller-subscriptions]')&&!document.querySelector('dialog[open]')`,'Subscription comparison');
  await until(`document.querySelector('[data-subscription-price]')?.textContent!== 'Loading prices…'`,'Admin price load');
  await pause(560);
 };
 const rgba=value=>value.startsWith('#')?[...value.slice(1).matchAll(/../g)].map(c=>parseInt(c[0],16)):(value.match(/[\d.]+/g)||[]).map(Number);
 const over=(a,b)=>a.slice(0,3).map((v,i)=>v*(a[3]??1)+b[i]*(1-(a[3]??1)));
 const lum=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 const contrast=(a,b)=>{const x=lum(a),y=lum(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 for(const width of [320,390,430,1440])for(const theme of ['light','dark'])for(const plan of ['default','star','pro'])await test(`${width}px ${theme} seller subscription comparison ${plan}`,async()=>{
  await open(width,theme,plan);
  const next=plan==='default'?'star':plan==='star'?'pro':'none',target=next==='none'?plan:next;
  const data=await evaluate(`(()=>{const root=document.querySelector('[data-seller-subscriptions]'),button=root.querySelector('.seller-plan-upgrade'),s=getComputedStyle(root),b=getComputedStyle(button),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,w:r.width,h:r.height,right:r.right}},table=root.querySelector('table');return {current:root.dataset.currentPlan,next:root.dataset.nextPlan,heading:root.querySelector('h2').textContent,button:button.textContent,paint:b.backgroundImage,ink:b.color,buttonHeight:rect(button).h,price:root.querySelector('[data-subscription-price]').textContent,overflow:document.documentElement.scrollWidth>innerWidth,table:rect(table),rows:[...root.querySelectorAll('tbody tr')].map(tr=>({feature:tr.dataset.planFeature,values:[...tr.querySelectorAll('td')].map(c=>c.textContent)})),palette:Object.fromEntries(['ink','muted','panel','target','selected'].map(k=>[k,s.getPropertyValue('--sp-'+k).trim()])),canvas:getComputedStyle(document.documentElement).backgroundColor,keep:root.querySelector('.seller-plan-keep').textContent}})()`);
  assert.equal(data.current,plan);assert.equal(data.next,next);assert(!data.overflow&&data.table.x>=0&&data.table.right<=width);
  if(width<640){
   const layout=await evaluate(`(()=>{const n=document.querySelector('nav.pv-bottom-navigation'),c=n?.querySelector('[data-mobile-central-action]'),m=document.querySelector('[data-product-screen="market"] main'),r=n?.getBoundingClientRect(),s=getComputedStyle(document.documentElement);return {visible:!!n?.getClientRects().length,center:!!c?.getClientRects().length,label:c?.getAttribute('aria-label'),fixed:n?getComputedStyle(n).position:null,bottom:r?.bottom,height:r?.height,viewport:innerHeight,reserved:parseFloat(s.getPropertyValue('--pv-mobile-nav-height')),padding:m?parseFloat(getComputedStyle(m).paddingBottom):0}})()`);
   assert(layout.visible&&layout.center&&layout.label==='Publish','Central Publish remains available on the subscription page');
   assert.equal(layout.fixed,'fixed');assert(Math.abs(layout.bottom-layout.viewport)<=1,'Subscription navigation connects to the screen bottom');
   assert(layout.reserved>=layout.height-1&&layout.padding>=layout.height+16,'Subscription content reserves space above the fixed bar and center Publish: '+JSON.stringify(layout));
   data.navigationLayout=layout;
  }
  assert.equal(data.price,'GH₵'+initialRates[target].toFixed(2));assert(data.buttonHeight>=44);
  assert(data.paint.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)'));assert.equal(data.ink,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)');
  if(plan==='pro'){assert(data.button.includes('Renew Pine Pro'));assert(!data.heading.includes('Upgrade'));assert(data.rows.every(row=>row.values.length===1));}
  else assert(data.button.includes('Upgrade to Pine '+(next==='star'?'Star':'Pro')));
  const caps={default:['20','1','200'],star:['100','5','600'],pro:['200','10','900']};
  data.rows.slice(0,3).forEach((row,i)=>{assert.equal(row.values[0],caps[plan][i]);if(next!=='none')assert.equal(row.values[1],caps[next][i]);});
  const panel=over(rgba(data.palette.panel),rgba(data.canvas));
  data.contrastRatios={body:contrast(rgba(data.palette.ink),panel),helper:contrast(rgba(data.palette.muted),panel),target:contrast(rgba(data.palette.selected),rgba(data.palette.target)),button:Math.min(...(theme==='light'?['#003566','#001d3d']:['#ffc300','#ffd60a']).map(p=>contrast(rgba(data.ink),rgba(p))))};
  Object.values(data.contrastRatios).forEach(value=>assert(value>=4.5));
  if(width<640){
   const nav=await evaluate(`(()=>{const n=document.querySelector('nav.pv-bottom-navigation'),e=n.querySelector('[data-nav-selected="true"]'),p=n.querySelector('.pv-nav-surface path:not(.pv-nav-edge)');return {surface:getComputedStyle(p).fill,path:p.getAttribute('d'),highlight:getComputedStyle(n.querySelector('.pv-nav-indicator')).backgroundColor,label:e?.querySelector('.pv-nav-label')?.textContent,ink:e?getComputedStyle(e.querySelector('.pv-nav-label')).color:null}})()`),accent=theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)';
   assert.equal(nav.label,'More','Upgrade stays selected through More');assert(nav.path.startsWith('M'),'Actual curved SVG surface renders');assert.equal(nav.surface,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 53, 102)');assert.equal(nav.highlight,accent);assert.equal(nav.ink,accent,'Selected mobile label follows the theme');
  }else{
   const nav=await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-page-tabs][aria-current="page"]')].find(e=>e.getClientRects().length);return e?getComputedStyle(e).backgroundImage:''})()`);assert(nav.includes('rgb(255, 214, 10)'),'Desktop navigation stays gold');
  }
  await click('.seller-plan-other-plans summary');await until(`document.querySelector('.seller-plan-other-plans').open`,'All plans');
  const rates=await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-plan-option]')].map(e=>[e.dataset.planOption,e.querySelector('.seller-plan-option-price').textContent]))`);
  for(const p of ['default','star','pro'])assert(rates[p].includes('GH₵'+initialRates[p].toFixed(2)));
  await click('.seller-plan-other-plans summary');
  if(width===390||width===1440){
    const clip=await evaluate(`(()=>{const r=document.querySelector('.seller-subscriptions-section').getBoundingClientRect();return {x:r.x,y:r.y+scrollY,width:r.width,height:r.height,scale:1}})()`);
    await capture(`${width}-${theme}-${plan}-subscription`,clip);
  }
  await evaluate(`document.querySelector('.seller-plan-upgrade').scrollIntoView({block:'center'})`);await pause(100);
  assert(await evaluate(`(()=>{const e=document.querySelector('.seller-plan-upgrade'),r=e.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return e===hit||e.contains(hit)})()`),'Upgrade button is reachable above navigation after scrolling');
  assert(await evaluate(`document.querySelector('.seller-billing-details').textContent.includes('two months')&&document.querySelector('.seller-billing-details').textContent.includes('View unfinished payments')`));
  measurements.push({width,theme,plan,...data});
 });
 for(const theme of ['light','dark'])await test(`${theme} seller subscription admin price changes update without page reload`,async()=>{
  await open(390,theme);const same=await evaluate('location.href');
  const end=Date.now()+10000;while(!settingsStreams.size&&Date.now()<end)await pause(50);assert(settingsStreams.size,'Real query sync has a fixture SSE connection');
  setSubscriptionRates({default:9.5,star:163.8,pro:299.99},true);
  await until(`document.querySelector('[data-subscription-price="star"]').textContent==='GH₵163.80'`,'Updated admin Star rate');
  await click('.seller-plan-other-plans summary');
  await until(`document.querySelector('[data-plan-option="pro"] .seller-plan-option-price').textContent.includes('GH₵299.99')`,'Updated Pro rate');
  assert.equal(await evaluate('location.href'),same,'No reload needed');
  assert.equal(subscriptionCheckouts.length,0,'Reading changed prices makes no checkout request');
 });
 for(const theme of ['light','dark'])await test(`${theme} seller subscription missing price disables checkout without fallback`,async()=>{
  await open(390,theme,'default','missing');
  assert(await evaluate(`document.querySelector('[data-subscription-price="star"]').textContent==='Price unavailable'&&document.querySelector('.seller-plan-upgrade').disabled`));
  await click('.seller-plan-other-plans summary');assert(await evaluate(`document.querySelector('[data-plan-option="star"] button').disabled`));
 });
 for(const plan of ['default','star','pro'])await test(`${plan} seller subscription checkout keeps existing server-owned payload`,async()=>{
  await open(390,'light',plan);const target=plan==='default'?'star':'pro';const before=subscriptionCheckouts.length;
  await click('.seller-plan-upgrade');await until(`document.querySelector('.seller-plan-upgrade').disabled`,'Checkout busy guard');
  await until(`document.querySelector('.seller-plan-payment-error')?.textContent==='Local checkout fixture: no payment was created.'`,'Inline checkout error');
  await until(`!document.querySelector('.seller-plan-upgrade').disabled`,'Checkout retry available');
  assert.equal(subscriptionCheckouts.length,before+1);const body=subscriptionCheckouts.at(-1).body;
  assert.deepEqual(Object.keys(body).sort(),['plan','purpose','requestId']);assert.equal(body.plan,target);assert.equal(body.purpose,'subscription');assert.match(body.requestId,/^[a-f\d-]{36}$/);
  assert(await evaluate(`document.querySelector('.seller-plan-payment-error').previousElementSibling===document.querySelector('.seller-plan-upgrade')`));
  await click('.seller-plan-keep');await until(`!document.querySelector('[data-seller-subscriptions]')`,'Keep plan returns to store');assert.equal(subscriptionCheckouts.length,before+1);
 });
 for(const theme of ['light','dark'])await test(`${theme} seller subscription expired Pro uses effective Default comparison`,async()=>{
  await open(390,theme,'expired');assert(await evaluate(`document.querySelector('[data-seller-subscriptions]').dataset.currentPlan==='default'&&document.querySelector('[data-seller-subscriptions]').dataset.nextPlan==='star'`));
 });
 await fs.writeFile(output+'/subscription-measurements.json',JSON.stringify(measurements,null,2)+'\n');
};
