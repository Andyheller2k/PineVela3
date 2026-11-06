/** Curved mobile navigation against built product pages with loopback fixtures.
 * No real sign-in, account mutations, hosted requests or payment flows run here. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

module.exports = async ({ viewport, load, evaluate, until, test, capture, command, pause, output, productRoutes, fileChooserEvents }) => {
  const measurements = [];
  const navSelector = 'nav[data-curved-navigation]';
  const visibleNav = `[...document.querySelectorAll(${JSON.stringify(navSelector)})].find(e=>e.getClientRects().length)`;
  const closeWelcome = async () => {
    await evaluate(`(()=>{for(const d of document.querySelectorAll('dialog[open]')){if(/welcome/i.test(d.getAttribute('aria-label')||'')){const b=d.querySelector('[aria-label="Close dialog"],[aria-label="Close welcome"]');if(b)b.click();}}})()`);
    await pause(60);
  };
  const click = async selector => {
    const point = await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length&&!e.disabled);if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    assert(point, 'Visible enabled control: ' + selector);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const key = async (key, code, keyCode, text) => {
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...(text ? { text } : {}) });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
  };
  const loadProduct = async (page, width, theme) => {
    await viewport(width, 844);
    await load(page.route, theme, false, page);
    await closeWelcome();
    await evaluate('document.fonts.ready.then(()=>true)');
    await pause(120);
  };
  const snapshot = () => evaluate(`(()=>{
    const n=${visibleNav};if(!n)return null;
    const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom,cx:r.x+r.width/2}};
    const paint=e=>{if(!e)return null;const s=getComputedStyle(e);return {background:s.backgroundColor,fill:s.fill,color:s.color,backgroundImage:s.backgroundImage}};
    const caption=e=>{const l=e.querySelector('.pv-nav-label');if(!l)return null;const range=document.createRange();range.selectNodeContents(l);const r=range.getBoundingClientRect(),s=getComputedStyle(l);return{...rect(l),textTop:r.top,textBottom:r.bottom,textLeft:r.left,textRight:r.right,color:s.color,fill:s.webkitTextFillColor,transform:s.transform,translate:s.translate,visible:s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity)>0,foreground:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===e}};
    const s=getComputedStyle(n),surface=n.querySelector('.pv-nav-surface path:not(.edge)')||n.querySelector('.pv-nav-surface'),indicator=n.querySelector('.pv-nav-indicator');
    return {viewport:{w:innerWidth,layoutWidth:document.documentElement.clientWidth,h:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth+1,
      kind:n.dataset.curvedNavigation,active:n.dataset.activeDestination,duration:s.getPropertyValue('--pv-nav-duration').trim(),highlight:paint(n.querySelector('.pv-nav-side-highlight')),nav:rect(n),surface:paint(surface),indicator:{...rect(indicator),...paint(indicator)},
      safeBottom:s.getPropertyValue('--pv-safe-bottom').trim(),reserved:parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--pv-mobile-nav-height'))||0,
      buttons:[...n.querySelectorAll('button[data-navigation-id]')].filter(e=>e.getClientRects().length).map(e=>({id:e.dataset.navigationId,label:e.getAttribute('aria-label'),disabled:e.disabled,current:e.getAttribute('aria-current'),...rect(e),icon:rect(e.querySelector('.pv-nav-icon')),paint:paint(e),iconPaint:paint(e.querySelector('.pv-nav-icon')),caption:caption(e)}))};
  })()`);
  const checkNavigation = async (page, width, theme) => {
    const m = await snapshot();
    // Seller's existing tablet view begins at 640px. Other role shells switch at 1024px.
    if (page.name === 'seller dashboard' && width >= 640) {
      assert.equal(m, null, 'Seller tablet keeps its existing desktop-style tab navigation');
      return { width, theme, page: page.name, mobileNavigation: false };
    }
    assert(m, page.name + ' mounts its shared mobile navigation');
    assert.equal(parseFloat(m.duration)*(m.duration.endsWith('ms')?1:1000),250,'The shared icon and cutout motion use the faster duration');
    assert.equal(m.overflow, false, page.name + ' does not overflow horizontally');
    assert(Math.abs(m.nav.x) <= 1 && Math.abs(m.nav.right - m.viewport.layoutWidth) <= 1, 'Navigation joins both usable screen edges: ' + JSON.stringify(m));
    assert(Math.abs(m.nav.bottom - m.viewport.h) <= 1, 'Navigation joins the bottom edge: ' + JSON.stringify(m.nav));
    assert(m.nav.h >= 64 && m.nav.h <= 150, 'Navigation keeps a bounded bottom footprint');
    assert(m.reserved >= m.nav.h - 1, 'The layout reserves the measured navigation height for page content');
    assert(m.buttons.length >= 2 && m.buttons.length <= 6, 'A small usable set of primary destinations renders');
    for (const b of m.buttons) {
      assert(b.w >= 43.5 && b.h >= 43.5, b.id + ' retains a 44px touch target');
      assert(b.x >= -1 && b.right <= width + 1 && b.bottom <= m.viewport.h + 1, b.id + ' remains in the viewport');
      assert(b.label, b.id + ' has an accessible name');
      assert(b.caption?.visible && b.caption.foreground, b.id + ' caption remains visible and reachable');
      assert(b.caption.y >= b.icon.bottom + 3 && b.caption.bottom <= m.nav.bottom + 1, b.id + ' caption has its own row below the icon and above the bottom edge');
      assert(b.caption.textTop >= b.caption.y - 1 && b.caption.textBottom <= b.caption.bottom + 1, b.id + ' caption glyphs fit without vertical clipping');
      assert.equal(b.caption.transform, 'none', b.id + ' caption stays still while the icon moves');
    }
    const surface = theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 53, 102)';
    const accent = theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)';
    assert([m.surface?.background, m.surface?.fill].includes(surface), 'Navigation surface follows the approved theme: ' + JSON.stringify(m.surface));
    const selectedCaption=m.buttons.find(b=>b.id===m.active)?.caption;
    if(selectedCaption)assert.equal(selectedCaption.color,accent,'Selected caption contrasts with the bar in both themes');
    if (m.active && m.kind === 'standard') assert([m.indicator?.background, m.indicator?.fill, m.indicator?.color].includes(accent), 'The raised selection uses the approved theme accent: ' + JSON.stringify(m.indicator));
    const center = m.buttons.find(b => b.id === 'quick-action');
    if (page.name === 'seller dashboard' || page.name === 'resident dashboard') {
      assert.equal(m.kind, 'action');
      assert.equal(m.highlight.background,accent,'Side selection is solid blue/yellow instead of a pale tint');
      const selected=m.buttons.find(b=>b.current==='page');
      if(selected)assert.equal(selected.iconPaint.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)','Selected side icon contrasts with its solid highlight');
      assert(center, 'Seller and resident keep their center quick action');
      assert(Math.abs(center.cx - width / 2) <= 1, 'The plus action is centered');
      assert([center.paint.background, center.iconPaint?.background, m.indicator?.background, m.indicator?.fill].includes(accent), 'The center plus uses the approved action colour: ' + JSON.stringify(center));
      assert(center.icon && m.buttons.filter(b => b.id !== 'quick-action' && b.icon).every(b => center.icon.y < b.icon.y - 8), 'The fixed plus sits above its side destinations');
    } else assert.equal(m.kind, 'standard', page.name + ' uses the sliding raised icon design');
    return { width, theme, page: page.name, ...m };
  };

  for (const theme of ['light','dark']) for (const page of productRoutes.slice(0,8)) await test(`390px ${theme} navigation touch press ${page.name}`,async()=>{
    await loadProduct(page,390,theme);
    await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    const point=await evaluate(`(()=>{const n=${visibleNav},b=[...n.querySelectorAll('button[data-navigation-id]')].find(e=>!e.disabled&&e.dataset.navigationId!=='quick-action'),r=b.getBoundingClientRect();window.pressedNavigationButton=b;window.navigationTouchTarget=null;document.addEventListener('touchstart',e=>{window.navigationTouchTarget=e.target.closest('button')?.dataset.navigationId||e.target.tagName},{once:true,passive:true});return{x:r.x+r.width/2,y:r.y+90}})()`);
    await command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...point,id:1}]});
    await pause(50);
    const delivered=await evaluate(`window.navigationTouchTarget===window.pressedNavigationButton.dataset.navigationId`);
    assert(delivered,'A real touch reaches the intended navigation button');
    await command('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    // Headless Chromium does not retain :active for emulated touch. Force only
    // that CSS state after proving event delivery; Android checks use ADB touch.
    await command('DOM.enable');await command('CSS.enable');
    await evaluate(`window.pressedNavigationButton.dataset.touchFixture='true';true`);
    const documentRoot=await command('DOM.getDocument');
    const node=await command('DOM.querySelector',{nodeId:documentRoot.root.nodeId,selector:'[data-touch-fixture]'});
    await command('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['active']});
    const pressed=await evaluate(`(()=>{const b=window.pressedNavigationButton,s=getComputedStyle(b);return{active:b.matches(':active'),target:window.navigationTouchTarget,outline:s.outlineStyle,outlineWidth:s.outlineWidth,background:s.backgroundColor,tap:s.webkitTapHighlightColor,children:[...b.querySelectorAll('*')].map(e=>getComputedStyle(e).webkitTapHighlightColor)}})()`);
    assert(pressed.active,'The pressed CSS state is active: '+JSON.stringify({point,pressed}));
    assert.equal(pressed.outline,'none','Touch does not draw a rectangular keyboard outline');
    assert.equal(pressed.background,'rgba(0, 0, 0, 0)','The pressed button has no rectangular fill');
    assert.equal(pressed.tap,'rgba(0, 0, 0, 0)');assert(pressed.children.every(c=>c==='rgba(0, 0, 0, 0)'));
    if(theme==='dark'&&page.name==='user dashboard')await capture('android-touch-dark-user-fixed');
    await command('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:[]});
    await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    const keyboard=await evaluate(`(()=>{const b=window.pressedNavigationButton;b.focus();const i=b.querySelector('.pv-nav-icon'),s=getComputedStyle(i);return{visible:b.matches(':focus-visible'),outline:s.outlineStyle,width:s.outlineWidth,color:s.outlineColor}})()`);
    assert(keyboard.visible&&keyboard.outline==='solid'&&parseFloat(keyboard.width)>=2,'Keyboard users retain a visible focus ring around the icon');
    measurements.push({page:page.name,theme,touchDelivered:delivered,pressedCssStateForced:true,touchPress:pressed,keyboardFocus:keyboard});
  });

  for (const width of [320, 390, 430, 768]) for (const theme of ['light', 'dark']) for (const page of productRoutes.slice(0, 8)) {
    await test(`${width}px ${theme} curved mobile navigation: ${page.name}`, async () => {
      await loadProduct(page, width, theme);
      measurements.push(await checkNavigation(page, width, theme));
      if (width === 390) await capture(`390-${theme}-curved-${page.name.replaceAll(' ', '-')}`);
    });
  }

  const userPage = productRoutes.find(p => p.name === 'primary dashboard');
  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation captions stay visible after actual user taps`, async () => {
    await loadProduct(userPage, 390, theme);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    for (const id of ['digital-market', 'login-room', 'options', 'home']) {
      await click(`nav[data-curved-navigation] [data-navigation-id="${id}"]`);
      await until(`(${visibleNav})?.dataset.activeDestination==='${id}'`, 'Selected destination');
      await pause(350);
      const m = await checkNavigation(userPage, 390, theme);
      measurements.push({ afterActualTap: id, ...m });
      await capture(`390-${theme}-caption-after-${id}`);
    }
  });
  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation secondary caption remains visible`, async () => {
    const page = productRoutes.find(p => p.name === 'administrator dashboard');
    await loadProduct(page, 390, theme);
    await click('nav[data-curved-navigation] [data-navigation-id="more"]');
    await until(`!!document.querySelector('[data-portal-navigation="menu"]')`, 'More destinations');
    await click('[data-portal-navigation="menu"] [data-navigation-id="settings"]');
    await until(`!document.querySelector('[data-portal-navigation="menu"]')&&(${visibleNav})?.dataset.activeDestination==='more'`, 'Secondary tab selects More');
    await pause(350);
    measurements.push({ afterActualSecondaryTap: true, ...await checkNavigation(page, 390, theme) });
    await capture(`390-${theme}-caption-after-more`);
  });
  await test('curved mobile navigation switches at the existing role breakpoints', async () => {
    for (const [name, sizes] of [['primary dashboard', [1023, 1024]], ['seller dashboard', [639, 640]]]) {
      const page = productRoutes.find(p => p.name === name);
      for (let i = 0; i < sizes.length; i++) {
        await loadProduct(page, sizes[i], 'light');
        assert.equal(!!(await snapshot()), i === 0, name + ' mobile breakpoint at ' + sizes[i]);
      }
    }
  });
  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation smooth slide and icon handoff`, async () => {
    await loadProduct(userPage, 390, theme);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await pause(550);
    const motion = await evaluate(`(async()=>{
      const n=${visibleNav},first=n.querySelector('button[aria-current="page"]'),target=[...n.querySelectorAll('button[data-navigation-id]')].find(e=>!e.disabled&&e!==first&&!['more','quick-action','companion'].includes(e.dataset.navigationId));
      if(!first||!target)throw Error('Two standard destinations are required');
      const measure=()=>{const r=n.querySelector('.pv-nav-indicator').getBoundingClientRect();return {indicator:r.x+r.width/2,previous:first.querySelector('.pv-nav-icon').getBoundingClientRect().y,target:target.querySelector('.pv-nav-icon').getBoundingClientRect().y,captions:[...n.querySelectorAll('.pv-nav-label')].map(l=>{const r=l.getBoundingClientRect();return {text:l.textContent,y:r.y,bottom:r.bottom}})}};
      const before=measure();target.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await new Promise(r=>setTimeout(r,90));const during=measure();await new Promise(r=>setTimeout(r,600));return {before,during,after:measure(),selected:target.getAttribute('aria-current'),active:n.dataset.activeDestination,targetId:target.dataset.navigationId};
    })()`);
    assert.equal(motion.selected, 'page', 'The target becomes the current destination');
    assert.equal(motion.active, motion.targetId);
    for(const phase of [motion.during,motion.after])assert.deepEqual(phase.captions,motion.before.captions,'Captions stay in their own row throughout the actual icon slide');
    const distance = motion.after.indicator - motion.before.indicator;
    assert(Math.abs(distance) > 20, 'The highlight moves between distinct tabs');
    const progress = (motion.during.indicator - motion.before.indicator) / distance;
    assert(progress > .01 && progress < .99, 'The indicator is between destinations during the slide: ' + JSON.stringify(motion));
    assert(motion.after.previous > motion.before.previous + 5, 'The previous icon lowers');
    assert(motion.after.target < motion.before.target - 5, 'The target icon rises');
    measurements.push({ theme, motion });
    await capture(`390-${theme}-curved-selected-purchases`);
  });

  await test('390px curved mobile navigation pointer and keyboard activation', async () => {
    await loadProduct(userPage, 390, 'light');
    await click('nav[data-curved-navigation] [data-navigation-id="digital-market"]');
    await until(`(${visibleNav})?.dataset.activeDestination==='digital-market'`, 'Pointer selects purchases');
    await evaluate(`(${visibleNav}).querySelector('[data-navigation-id="options"]').focus()`);
    assert(await evaluate(`document.activeElement?.dataset.navigationId==='options'`), 'A destination is keyboard focusable');
    await key('Enter', 'Enter', 13, '\r');
    await until(`(${visibleNav})?.dataset.activeDestination==='options'`, 'Enter selects options');
    assert(await evaluate(`!!document.querySelector('.theme-system-choice')`), 'Options content really mounts');
    await evaluate(`(${visibleNav}).querySelector('[data-navigation-id="home"]').focus()`);
    await key(' ', 'Space', 32, ' ');
    await until(`(${visibleNav})?.dataset.activeDestination==='home'`, 'Space selects home');
  });

  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation companion visual handoff`, async () => {
    await loadProduct(userPage, 390, theme);
    await click('nav[data-curved-navigation] [data-navigation-id="companion"]');
    await until(`!!document.querySelector('dialog[aria-label="PineVela companion"]')&&(${visibleNav})?.dataset.activeDestination==='companion'`, 'Ask AI receives the raised selection');
    assert(await evaluate(`(${visibleNav}).querySelector('[data-navigation-id="home"]').getAttribute('aria-current')==='page'`), 'The underlying page remains selected while the companion is open');
    await click('dialog[aria-label="PineVela companion"] [aria-label="Close companion"]');
    await until(`!document.querySelector('dialog[open]')&&(${visibleNav})?.dataset.activeDestination==='home'`, 'Closing Ask AI restores the page selection');
    assert(await evaluate(`document.activeElement?.dataset.navigationId==='companion'`), 'Closing the companion returns keyboard focus to Ask AI');
  });

  await test('390px curved mobile navigation reduced motion settles without sliding', async () => {
    await loadProduct(userPage, 390, 'light');
    const reduced = await evaluate(`(async()=>{
      const n=${visibleNav},b=n.querySelector('[data-navigation-id="digital-market"]');b.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const icon=b.querySelector('.pv-nav-icon'),indicator=n.querySelector('.pv-nav-indicator'),r=indicator.getBoundingClientRect(),target=b.getBoundingClientRect();
      const duration=e=>getComputedStyle(e).transitionDuration.split(',').map(parseFloat);return {active:n.dataset.activeDestination,center:r.x+r.width/2,target:target.x+target.width/2,iconDurations:duration(icon),indicatorDurations:duration(indicator)};
    })()`);
    assert.equal(reduced.active, 'digital-market');
    assert(Math.abs(reduced.center - reduced.target) <= 1, 'Reduced motion puts the highlight directly on its target');
    assert([...reduced.iconDurations, ...reduced.indicatorDurations].every(v => v <= .01), 'Reduced-motion transitions are effectively immediate');
    measurements.push({ reduced });
  });

  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation fills the safe area`, async () => {
    await loadProduct(userPage, 390, theme);
    const before = await snapshot();
    await evaluate(`document.documentElement.style.setProperty('--safe-area-inset-bottom','28px')`);
    await until(`Math.abs((${visibleNav}).getBoundingClientRect().height-${before.nav.h + 28})<1`, 'Safe-area inset enlarges the bar');
    await pause(80);
    const after = await snapshot();
    assert(Math.abs(after.nav.bottom - after.viewport.h) <= 1, 'The safe-area surface still meets the bottom edge');
    assert(after.buttons.every(b => b.bottom <= after.viewport.h - 27), 'Touch controls remain above the gesture area');
    assert(after.reserved >= after.nav.h - 1, 'Content clearance includes the safe area');
    measurements.push({ theme, safeAreaBefore: before.nav, safeAreaAfter: after.nav });
    await capture(`390-${theme}-curved-safe-area`);
    await evaluate(`document.documentElement.style.removeProperty('--safe-area-inset-bottom')`);
  });

  const sellerPage = productRoutes.find(p => p.name === 'seller dashboard');
  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation seller More retains Services`, async () => {
    await loadProduct(sellerPage, 390, theme);
    await click('nav[data-curved-navigation] [data-navigation-id="more"]');
    await until(`!!document.querySelector('[data-portal-navigation="menu"]')`, 'More opens');
    assert(await evaluate(`['services','notifications','messages','upgrade','profile'].every(id=>!!document.querySelector('[data-portal-navigation="menu"] [data-navigation-id="'+id+'"]'))`), 'Secondary seller destinations remain available');
    await click('[data-portal-navigation="menu"] [data-navigation-id="services"]');
    await until(`!!document.querySelector('.seller-services-grid')&&!document.querySelector('[data-portal-navigation="menu"]')`, 'Services mounts and More closes');
    assert.equal((await snapshot()).buttons.find(b => b.id === 'more').current, 'page', 'More identifies an active secondary destination');
    await click('nav[data-curved-navigation] [data-navigation-id="more"]');
    await key('Escape', 'Escape', 27);
    await until(`!document.querySelector('[data-portal-navigation="menu"]')`, 'Escape closes More');
    assert(await evaluate(`document.activeElement?.dataset.navigationId==='more'`), 'Closing More restores focus to its trigger');
  });

  for (const theme of ['light', 'dark']) for (const page of [sellerPage, productRoutes.find(p => p.name === 'resident dashboard')]) await test(`390px ${theme} curved mobile navigation ${page.name} center action`, async () => {
    await loadProduct(page, 390, theme);
    const previous = (await snapshot()).active;
    await click('nav[data-curved-navigation] [data-navigation-id="quick-action"]');
    await until(`!!document.querySelector('dialog[open]')`, 'Center action opens its existing chooser');
    const dialog = await evaluate(`(()=>{const d=document.querySelector('dialog[open]');return {label:d.getAttribute('aria-label'),text:d.innerText,buttons:[...d.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>({label:e.getAttribute('aria-label'),text:e.innerText,disabled:e.disabled}))}})()`);
    assert(/publish|quick action/i.test(dialog.label), 'Center button opens the intended action dialog: ' + JSON.stringify(dialog));
    assert.equal((await snapshot()).active, previous, 'Opening the chooser does not change the selected destination');
    if (page === sellerPage) assert(/item/i.test(dialog.text) && /service/i.test(dialog.text), 'Seller chooser preserves item and service publishing');
    await key('Escape', 'Escape', 27);
    await until(`!document.querySelector('dialog[open]')`, 'Escape closes the action chooser');
    assert(await evaluate(`document.activeElement?.dataset.navigationId==='quick-action'`), 'Closing the chooser restores focus to the plus');
    await click('nav[data-curved-navigation] [data-navigation-id="quick-action"]');
    const label = page === sellerPage ? 'Publish an item' : 'Report maintenance';
    await click('dialog[open] button[aria-label="' + label + '"]');
    const formLabel = page === sellerPage ? 'Publish Item to Global Market' : 'File Maintenance Complaint';
    await until(`!!document.querySelector('dialog[aria-label=${JSON.stringify(formLabel)}]')`, 'Existing form opens from the center action');
    assert(await evaluate(`!!document.querySelector('dialog[aria-label=${JSON.stringify(formLabel)}] input')`), 'The real existing form is usable');
    await key('Escape', 'Escape', 27);
    await until(`!document.querySelector('dialog[open]')`, 'Escape closes the existing form');
    measurements.push({ theme, page: page.name, actionDialog: dialog.label });
  });

  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation resident photo picker opens and cancels`, async () => {
    await loadProduct(productRoutes.find(p => p.name === 'resident dashboard'), 390, theme);
    await command('Page.setInterceptFileChooserDialog', { enabled: true });
    try {
      const before = fileChooserEvents.length;
      await click('nav[data-curved-navigation] [data-navigation-id="quick-action"]');
      await until(`!!document.querySelector('dialog[aria-label="Resident quick actions"]')`, 'Resident action chooser');
      await click('dialog[aria-label="Resident quick actions"] [aria-label="Report maintenance with photo"]');
      const deadline = Date.now() + 5000;
      while (fileChooserEvents.length === before && Date.now() < deadline) await pause(50);
      assert.equal(fileChooserEvents.length, before + 1, 'The real browser photo chooser opens from the modal action');
      const chooser = fileChooserEvents.at(-1);
      assert(chooser.backendNodeId, 'Chromium identifies the actual file input');
      assert.equal(chooser.mode, 'selectSingle');
      await until(`!document.querySelector('dialog[open]')`, 'Actions close while the photo picker is open');
      assert(await evaluate(`(()=>{const e=document.querySelector('[data-maintenance-camera]');return e?.isConnected&&e.accept==='image/*'&&e.getAttribute('capture')==='environment'})()`), 'The established camera input remains connected');
      await command('DOM.setFileInputFiles', { backendNodeId: chooser.backendNodeId, files: [] });
      await evaluate(`document.querySelector('[data-maintenance-camera]').dispatchEvent(new Event('cancel',{bubbles:true}))`);
      await pause(100);
      assert(await evaluate(`!document.querySelector('dialog[open]')&&!document.querySelector('dialog[aria-label="Quick maintenance complaint"]')&&document.querySelector('[data-maintenance-camera]').files.length===0`), 'Canceling the camera creates no empty complaint or upload');
      measurements.push({ theme, actualResidentPhotoPicker: true, mode: chooser.mode, selectedFiles: 0 });
    } finally {
      await command('Page.setInterceptFileChooserDialog', { enabled: false });
    }
  });

  for (const theme of ['light', 'dark']) for (const variant of ['primary', 'secondary']) await test(`390px ${theme} curved mobile navigation manager badge-zero urgency ${variant}`, async () => {
    const manager = productRoutes.find(p => p.name === 'manager dashboard');
    await loadProduct({ ...manager, route: '/?visual_nav_urgency=' + variant + '#/manager/dashboard' }, 390, theme);
    const target = variant === 'primary' ? 'maintenance' : 'more';
    await until(`!!(${visibleNav})?.querySelector('[data-navigation-id="${target}"] .ux-nav-update-dot')`, 'Urgent zero-count update has a visible dot');
    const cue = await evaluate(`(()=>{const b=(${visibleNav}).querySelector('[data-navigation-id="${target}"]'),d=b.querySelector('.ux-nav-update-dot'),r=d.getBoundingClientRect();return {label:b.getAttribute('aria-label'),badge:!!b.querySelector('.ux-nav-badge'),dot:getComputedStyle(d).backgroundColor,width:r.width,height:r.height,indicator:getComputedStyle((${visibleNav}).querySelector('.pv-nav-indicator')).backgroundColor}})()`);
    assert(cue.label.includes('updates available'), 'Screen readers hear that updates exist');
    assert.equal(cue.badge, false, 'No invented numeric count appears');
    assert.equal(cue.dot, 'rgb(220, 38, 38)', 'The unread dot stays red in both themes');
    assert(cue.width >= 7 && cue.height >= 7, 'The dot remains visible');
    const accent = theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)';
    assert.equal(cue.indicator, accent, 'Urgency does not override the selection theme');
    await capture(`390-${theme}-curved-urgency-${variant}-unread`);
    await click('nav[data-curved-navigation] [data-navigation-id="' + target + '"]');
    if (variant === 'primary') {
      await until(`(${visibleNav})?.dataset.activeDestination==='maintenance'&&!(${visibleNav}).querySelector('[data-navigation-id="maintenance"] .ux-nav-update-dot')`, 'Reading the maintenance tab clears the log cue');
      assert(await evaluate(`!(${visibleNav}).querySelector('[data-navigation-id="maintenance"]').getAttribute('aria-label').includes('updates available')`), 'The acknowledged update label clears');
    } else {
      await until(`!!document.querySelector('[data-portal-navigation="menu"] [data-navigation-id="maintenance"]')`, 'More exposes the secondary maintenance destination');
      const locked = await evaluate(`(()=>{const b=document.querySelector('[data-portal-navigation="menu"] [data-navigation-id="maintenance"]');return {disabled:b.disabled,label:b.getAttribute('aria-label'),text:b.textContent}})()`);
      assert(locked.disabled && locked.text.includes('Locked'), 'Property approval locks retain their precedence');
      assert(locked.label.includes('updates available'), 'The secondary item retains an accessible update cue');
      await key('Escape', 'Escape', 27);
      await until(`!document.querySelector('[data-portal-navigation="menu"]')`, 'More closes');
    }
    assert.equal(await evaluate(`getComputedStyle((${visibleNav}).querySelector('.pv-nav-indicator')).backgroundColor`), accent, 'The blue/yellow selection accent is preserved');
    await capture(`390-${theme}-curved-urgency-${variant}`);
    measurements.push({ theme, badgeZeroUrgency: variant, cue });
  });

  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation unread manager selection motion (isolated DOM fixture)`, async () => {
    const manager = productRoutes.find(p => p.name === 'manager dashboard');
    await loadProduct({ ...manager, route: '/?visual_nav_urgency=primary#/manager/dashboard' }, 390, theme);
    await until(`!!(${visibleNav})?.querySelector('[data-navigation-id="maintenance"] .ux-nav-update-dot')`, 'Unread maintenance log');
    // Functional manager taps and cue clearing are checked above. Here, drive
    // the same DOM state interface without the maintenance panel's rendering cost.
    await evaluate(`document.querySelector('[data-dashboard-shell] main').style.contentVisibility='hidden'`);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    await pause(100);
    const motion = await evaluate(`(async()=>{
      const n=${visibleNav},previous=n.querySelector('[aria-current="page"]'),target=n.querySelector('[data-navigation-id="maintenance"]'),started=performance.now();
      const measure=()=>{const i=n.querySelector('.pv-nav-indicator').getBoundingClientRect();return {ms:performance.now()-started,indicator:i.x+i.width/2,previousIcon:previous.querySelector('.pv-nav-icon').getBoundingClientRect().y,targetIcon:target.querySelector('.pv-nav-icon').getBoundingClientRect().y,unread:!!target.querySelector('.ux-nav-update-dot')}};
const before=measure(),frames=[];let recording=true;previous.removeAttribute('aria-current');target.setAttribute('aria-current','page');target.querySelector('.ux-nav-update-dot')?.remove();await new Promise(resolve=>requestAnimationFrame(()=>{const record=()=>requestAnimationFrame(()=>{frames.push(measure());if(recording)record()});record();setTimeout(resolve,650)}));recording=false;return {before,frames,after:measure(),selectionDOMFixture:true,realFunctionalSelectionTestedSeparately:true,samplesAtAnimationFrames:true};
    })()`);
    await fs.writeFile(output + '/manager-unread-selection-motion-' + theme + '.json', JSON.stringify(motion, null, 2) + '\n');
    const distance = motion.after.indicator - motion.before.indicator;
    assert(Math.abs(distance) > 20);
    const progress = point => (point.indicator - motion.before.indicator) / distance;
    const iconProgress = point => (motion.before.targetIcon - point.targetIcon) / (motion.before.targetIcon - motion.after.targetIcon);
    const middle = motion.frames.filter(point => progress(point) > .01 && progress(point) < .99);
    assert(middle.length, 'At least one drawable frame captures the actual in-progress slide: ' + JSON.stringify(motion));
    for (const point of motion.frames) assert(Math.abs(progress(point) - iconProgress(point)) < .25, 'Unread state updates keep circle and icon motion aligned at actual elapsed time: ' + JSON.stringify(point));
    assert(Math.abs(progress(motion.after) - 1) < .01 && Math.abs(iconProgress(motion.after) - 1) < .01, 'The circle and icon finish together at the selected destination');
    assert.equal(motion.after.unread, false, 'Viewing the log clears the update cue');
    measurements.push({ theme, unreadSelectionMotion: motion });
  });

  for (const theme of ['light', 'dark']) await test(`390px ${theme} curved mobile navigation rapid destination changes settle on final tab`, async () => {
    await loadProduct(userPage, 390, theme);
    await evaluate(`(()=>{const style=document.createElement('style');style.textContent='.user-dashboard [data-dashboard-view]{content-visibility:hidden}';document.head.append(style)})()`);
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await pause(80);
    const motion = await evaluate(`(async()=>{
      const n=${visibleNav},button=id=>n.querySelector('[data-navigation-id="'+id+'"]'),center=e=>{const r=e.getBoundingClientRect();return r.x+r.width/2},position=()=>center(n.querySelector('.pv-nav-indicator')),wait=ms=>new Promise(r=>setTimeout(r,ms)),frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const targets={home:center(button('home')),purchases:center(button('digital-market')),options:center(button('options'))},before=position();
      let start=performance.now();button('digital-market').click();await frame();await wait(30);const first=position(),firstMs=performance.now()-start;start=performance.now();button('options').click();await frame();await wait(30);const second=position(),secondMs=performance.now()-start;start=performance.now();button('home').click();await frame();await wait(30);const returning=position(),returningMs=performance.now()-start;await wait(400);return {targets,before,first,second,returning,elapsed:{first:firstMs,second:secondMs,returning:returningMs},after:position(),active:n.dataset.activeDestination,currents:[...n.querySelectorAll('[aria-current="page"]')].map(e=>e.dataset.navigationId)};
    })()`);
    await fs.writeFile(output+'/rapid-selection-'+theme+'.json',JSON.stringify(motion,null,2)+'\n');
    // Sampled early eased motion can be less than one CSS pixel, especially if
    // mounting the destination delays the transition's first drawable frame.
    // Require measurable forward/reverse movement without rounding it away.
    const epsilon = .1;
    assert(motion.first > motion.before + epsilon && motion.first <= motion.targets.purchases + 1, 'First tap advances toward Purchases');
    assert(motion.second > motion.first + epsilon && motion.second <= motion.targets.options + 1, 'Second tap continues toward Options');
    assert(motion.returning < motion.second - epsilon && motion.returning >= motion.targets.home - 1, 'Final tap reverses toward Home');
    // Mounting a destination can occupy the main thread beyond the full 250ms.
    // Only demand an intermediate sample when the actual sampling time permits it.
    if(motion.elapsed.first<250)assert(motion.first<motion.targets.purchases-1,'First tap does not jump before its duration');
    if(motion.elapsed.second<250)assert(motion.second<motion.targets.options-1,'Second tap does not jump before its duration');
    if(motion.elapsed.returning<250)assert(motion.returning>motion.targets.home+1,'Return does not jump before its duration');
    assert(Math.abs(motion.after - motion.targets.home) <= 1, 'No stale animation overrides the last destination');
    assert.equal(motion.active, 'home');
    assert.deepEqual(motion.currents, ['home']);
    measurements.push({ theme, rapidSelectionMotion: motion });
  });

  for (const theme of ['light', 'dark']) for (const page of productRoutes.slice(0, 8)) await test(`1440px ${theme} curved mobile navigation preserves desktop ${page.name}`, async () => {
    await loadProduct(page, 1440, theme);
    assert.equal(await snapshot(), null, 'Mobile bar is hidden on desktop');
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`), 'Desktop has no new horizontal overflow');
    const desktop = await evaluate(`(()=>{const n=[...document.querySelectorAll('[data-portal-navigation="sidebar"],nav[data-page-tabs],nav[aria-label="Customer-service sections"],aside,[data-page-tabs][aria-current="page"]')].find(e=>e.getClientRects().length);return n?{label:n.getAttribute('aria-label'),width:n.getBoundingClientRect().width}:null})()`);
    assert(desktop, 'The existing desktop navigation remains visible');
  });

  await fs.writeFile(output + '/mobile-navigation-measurements.json', JSON.stringify({ syntheticLoopbackFixtures: true, realAuthenticationTested: false, measurements }, null, 2) + '\n');
};
