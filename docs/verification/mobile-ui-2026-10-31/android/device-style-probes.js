(async()=>{
 const html=document.documentElement;
 const lazyCss=document.createElement('link');lazyCss.rel='stylesheet';lazyCss.href='/assets/ReportButton-DohHaJQO.css';lazyCss.dataset.pvNativeProbeCss='true';
 await new Promise((resolve,reject)=>{lazyCss.onload=resolve;lazyCss.onerror=()=>{lazyCss.remove();reject(Error('Bundled lazy marketplace CSS unavailable'));};document.head.append(lazyCss);});
 const before={theme:html.getAttribute('data-theme'),appearance:html.getAttribute('data-appearance')};
 const root=document.createElement('section');
 root.id='pv-native-ui-style-probes';root.className='app-canvas';root.setAttribute('data-product-screen','market');
 root.style.cssText='position:fixed;top:0;left:0;width:360px;max-width:100vw;z-index:2147483646;padding:8px;background:var(--pv-canvas);color:var(--pv-text);pointer-events:none';
 root.innerHTML='<p>Temporary DOM/CSS probes only; no account or marketplace data</p><button data-probe="primary" class="pv-primary-action">Page action probe</button><button data-probe="legacy" class="bg-yellow-400">Legacy page action probe</button><button data-probe="selector" class="pv-secondary-action" aria-pressed="true">Selected filter probe</button><button data-probe="merchant" class="pv-merchant-join inline-flex shrink-0 items-center justify-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-bold shadow-sm transition-colors border-blue-200 bg-white/90 text-blue-800 hover:bg-blue-50">Merchant probe</button><button data-probe="system" class="theme-preference-choice theme-system-choice" aria-pressed="true"><span class="theme-preference-content">System default</span></button><div class="pv-scroll-filters" data-probe="filters"><button>All alerts</button><button>Unread notifications (0)</button><button>Buy requests and handovers</button><button>Store and plan updates</button></div>';
 for(const mode of ['mobile','top','sidebar','menu','header']){const nav=document.createElement('nav');nav.setAttribute('data-portal-navigation',mode);nav.innerHTML='<button data-page-tabs aria-current="page">Selected '+mode+' navigation probe</button>';root.append(nav);}
 for(const kind of ['market-catalog-grid','market-inventory-grid','seller-services-grid']){
  const grid=document.createElement('div');grid.className=kind;grid.setAttribute('data-probe-grid',kind);
  grid.innerHTML=Array.from({length:2},(_,i)=>'<article class="market-plan-card market-product-card market-inventory-card seller-service-card" data-market-kind="item" data-listing-id="local-style-probe-'+i+'"><div class="market-card-thumbnail"></div><div class="market-card-copy"><h3 class="market-card-title">Local style probe</h3></div><div class="market-card-footer"><button class="pv-primary-action">View</button></div></article>').join('');root.append(grid);
 }
 document.body.append(root);const result=[];
 const paint=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {background:s.backgroundImage,backgroundColor:s.backgroundColor,ink:s.color,radius:parseFloat(s.borderTopLeftRadius),width:r.width,height:r.height};};
 try{
  html.dataset.appearance='product';
  for(const theme of ['light','dark']){
   html.dataset.theme=theme;
   const primary=paint(root.querySelector('[data-probe="primary"]')),legacy=paint(root.querySelector('[data-probe="legacy"]')),selector=paint(root.querySelector('[data-probe="selector"]')),merchant=paint(root.querySelector('[data-probe="merchant"]'));
   const outer=paint(root.querySelector('[data-probe="system"]')),inner=paint(root.querySelector('.theme-preference-content'));
   const navigation=[...root.querySelectorAll('[data-portal-navigation]')].map(n=>({mode:n.dataset.portalNavigation,...paint(n.querySelector('button'))}));
   const grids=[...root.querySelectorAll('[data-probe-grid]')].map(g=>{const s=getComputedStyle(g),a=[...g.children],r=a.map(e=>e.getBoundingClientRect());return {kind:g.dataset.probeGrid,display:s.display,columns:s.gridTemplateColumns,sameTop:Math.abs(r[0].top-r[1].top)<1,cardWidths:r.map(x=>x.width),cardHeights:r.map(x=>x.height),thumbnailHeights:a.map(e=>e.querySelector('.market-card-thumbnail').getBoundingClientRect().height)};});
   const filters=root.querySelector('[data-probe="filters"]');const filterMetrics={overflowX:getComputedStyle(filters).overflowX,clientWidth:filters.clientWidth,scrollWidth:filters.scrollWidth,children:[...filters.children].map(e=>({shrink:getComputedStyle(e).flexShrink,whiteSpace:getComputedStyle(e).whiteSpace,height:e.getBoundingClientRect().height}))};
   const expected=theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)';
   const checks={primaryPageActionUsesTheme:primary.background.includes(expected),legacyGoldPageActionUsesTheme:legacy.background.includes(expected),selectedFilterUsesTheme:selector.background.includes(expected),allAppNavigationGold:navigation.every(n=>n.background.includes('rgb(255, 195, 0)')&&n.ink==='rgb(0, 29, 61)'),merchantRemainsGold:merchant.background.includes('rgb(255, 195, 0)')||merchant.background.includes('rgb(255, 214, 10)'),systemPillOuterTransparent:outer.background==='none'&&outer.backgroundColor==='rgba(0, 0, 0, 0)',systemPillOuterRounded:outer.radius>=outer.height/2,systemPillInnerRounded:inner.radius>=inner.height/2,allPhoneCardGridsTwoColumns:grids.every(g=>g.display==='grid'&&g.sameTop&&g.columns.split(' ').length===2),phoneThumbnailsCompact:grids.every(g=>g.thumbnailHeights.every(h=>h>=96&&h<=120)),alertFiltersSideScrollable:filterMetrics.scrollWidth>filterMetrics.clientWidth&&filterMetrics.overflowX==='auto'&&filterMetrics.children.every(e=>e.shrink==='0'&&e.whiteSpace==='nowrap'&&e.height>=44)};
   result.push({theme,checks,primary,legacy,selector,merchant,navigation,systemPill:{outer,inner},grids,filterMetrics});
  }
  return {temporaryDomCssProbes:true,actualBundledAndroidWebView:true,bundledLazyMarketplaceCssLoadedForProbesOnly:lazyCss.getAttribute('href'),merchantProbeUsesActualRegistrationButtonClasses:true,authenticatedFlow:false,origin:location.origin,viewport:innerWidth,before,allChecksPassed:result.every(r=>Object.values(r.checks).every(Boolean)),results:result};
 } finally {root.remove();lazyCss.remove();for(const [key,value] of Object.entries(before)){if(value===null)html.removeAttribute('data-'+key);else html.setAttribute('data-'+key,value);}}
})()
