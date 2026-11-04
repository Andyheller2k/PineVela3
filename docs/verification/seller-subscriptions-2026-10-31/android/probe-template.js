(async()=>{
 const fixture=__NATIVE_SUBSCRIPTION_FIXTURE__;
 const html=document.documentElement;
 const before={theme:html.getAttribute('data-theme'),appearance:html.getAttribute('data-appearance'),localAppearance:localStorage.getItem('pinevela:appearance')};
 const addedCss=[];let root;const results=[],cssVerification=[];
 const paint=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundImage,color:s.color,fontSize:s.fontSize,width:r.width,height:r.height};};
 const digest=async text=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('');
 try{
  for(const stylesheet of fixture.bundledCss){
   const response=await fetch(stylesheet.href,{cache:'no-store'});
   if(!response.ok)throw Error('Bundled subscription CSS unavailable');
   const sha256=await digest(await response.text());
   if(sha256!==stylesheet.sha256)throw Error('Bundled subscription CSS differs from the frozen final build');
   cssVerification.push({href:stylesheet.href,sha256,matchesFinalBuild:true});
   if(![...document.querySelectorAll('link[rel="stylesheet"]')].some(e=>new URL(e.href).pathname===stylesheet.href)){
    const link=document.createElement('link');link.rel='stylesheet';link.href=stylesheet.href;link.dataset.pvSubscriptionProbeCss='true';
    await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error('Bundled subscription CSS failed to apply'));addedCss.push(link);document.head.append(link);});
   }
  }
  root=document.createElement('section');root.id='pv-native-subscription-probe';root.className='app-canvas';root.setAttribute('data-product-screen','market');root.setAttribute('aria-label','Isolated component markup and CSS probe; synthetic prices');root.inert=true;
  root.style.cssText='position:fixed;inset:0;z-index:2147483646;overflow:auto;padding:12px;background:var(--pv-canvas);color:var(--pv-text);pointer-events:none';
  document.body.append(root);html.dataset.appearance='product';
  for(const theme of ['light','dark']){
   html.dataset.theme=theme;
   for(const plan of fixture.plans){
    root.innerHTML='<p style="margin:0 0 8px;font-size:11px">Isolated SSR/CSS probe · synthetic prices · no account or payment action</p><div class="seller-subscriptions-section">'+plan.markup+'</div>';
    root.scrollTop=0;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const component=root.querySelector('[data-seller-subscriptions]');const card=root.querySelector('.seller-plan-card');const table=root.querySelector('table');const checkout=root.querySelector('[data-subscription-checkout]');
    const mainPrice=root.querySelector('[data-subscription-price]').textContent.trim();
    const expectedPrice=plan.currentPlan==='default'?'GH₵127.35':'GH₵211.50';const expectedTarget=plan.currentPlan==='default'?'star':'pro';
    const closed={mainPrice,buttonLabel:checkout.textContent.replace(/\s+/g,' ').trim(),checkoutTarget:checkout.dataset.subscriptionCheckout,mainButton:paint(checkout),keepButton:paint(root.querySelector('.seller-plan-keep')),tableWidth:table.getBoundingClientRect().width,tableScrollWidth:table.scrollWidth,tableClientWidth:table.clientWidth,componentWidth:component.getBoundingClientRect().width,componentScrollWidth:component.scrollWidth,cardWidth:card.getBoundingClientRect().width,rootClientWidth:root.clientWidth,rootScrollWidth:root.scrollWidth,headers:[...table.querySelectorAll('thead th')].map(e=>e.textContent.replace(/\s+/g,' ').trim())};
    root.querySelector('details').open=true;await new Promise(resolve=>requestAnimationFrame(resolve));
    const optionPrices=[...root.querySelectorAll('[data-plan-option]')].map(e=>({plan:e.dataset.planOption,label:e.querySelector('.seller-plan-option-price').textContent.replace(/\s+/g,' ').trim(),button:paint(e.querySelector('button'))}));
    const targetColor=theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)';const actionInk=theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)';
    const allButtons=[...component.querySelectorAll('button')];const summary=root.querySelector('summary');
    const checks={currentPlanMatches:component.dataset.currentPlan===plan.currentPlan,mainPriceUsesExplicitSyntheticProps:mainPrice===expectedPrice,checkoutTargetMatches:checkout.dataset.subscriptionCheckout===expectedTarget,allExplicitPricesVisible:optionPrices.every(p=>p.label.includes(p.plan==='default'?'GH₵7.25':p.plan==='star'?'GH₵127.35':'GH₵211.50')),actionButtonUsesTheme:closed.mainButton.background.includes(targetColor)&&closed.mainButton.color===actionInk,allRenewalButtonsUseTheme:optionPrices.every(p=>p.button.background.includes(targetColor)&&p.button.color===actionInk),allButtonsAtLeast44px:allButtons.every(e=>e.getBoundingClientRect().height>=44),summaryAtLeast44px:summary.getBoundingClientRect().height>=44,tableFitsWithinCard:closed.tableWidth<=closed.cardWidth+1&&closed.tableScrollWidth<=closed.tableClientWidth+1,componentHasNoHorizontalOverflow:closed.componentScrollWidth<=closed.componentWidth+1,probeHasNoHorizontalOverflow:root.scrollWidth<=root.clientWidth+1,renderedWithoutAccountActions:!root.querySelector('form')&&!root.querySelector('iframe')&&root.inert};
    results.push({theme,currentPlan:plan.currentPlan,checks,closed,optionPrices,buttonHeights:allButtons.map(e=>e.getBoundingClientRect().height),summaryHeight:summary.getBoundingClientRect().height});
   }
  }
  return {scope:'Isolated server-rendered actual component markup with final APK CSS; no authenticated seller context',isolatedDomCssProbes:true,ssrActualComponent:'src/components/SellerSubscriptionPlans.tsx',syntheticPrices:fixture.syntheticPrices,actualAndroidWebView:true,origin:location.origin,viewport:{width:innerWidth,height:innerHeight},sourceHashes:fixture.sourceHashes,cssVerification,allChecksPassed:results.every(r=>Object.values(r.checks).every(Boolean)),results,before};
 } finally {
  root?.remove();for(const link of addedCss)link.remove();
  for(const key of ['theme','appearance']){const value=before[key];if(value===null)html.removeAttribute('data-'+key);else html.setAttribute('data-'+key,value);}
 }
})()
