/** Disposable local fixtures only. These checks never authenticate or write to hosting. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
module.exports = async ({ viewport, load, evaluate, until, test, capture, command, os, pause, productRoutes, output }) => {
  const measurements = [];
  const click = async selector => {
    assert(await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)return false;e.click();return true})()`), 'Visible control: ' + selector);
  };
  const closeWelcome = async () => {
    if (await evaluate(`!!document.querySelector('dialog[aria-label="Welcome to PineVela"]')`)) {
      assert(await evaluate(`!document.querySelector('dialog[aria-label="Welcome to PineVela"]').textContent.includes('Staff accounts')`), 'Welcome omits the staff sentence');
      await click('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]');
    }
  };
  const checkPaint = async (selector, theme) => {
    const paint = await evaluate(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length),s=getComputedStyle(e);return {fill:s.backgroundImage,ink:s.color}})()`);
    assert(paint.fill.includes(theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 195, 0)'), selector + ' action colour: ' + JSON.stringify(paint));
    assert.equal(paint.ink, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 29, 61)', selector + ' action text');
  };
  const checkNavigation = async () => {
    await pause(560); // Let the curved surface and icon movement settle.
    const mobile = await evaluate(`(()=>{const n=[...document.querySelectorAll('nav.pv-bottom-navigation')].find(e=>e.getClientRects().length);if(!n)return null;const selected=n.querySelector('[data-nav-selected="true"]'),path=n.querySelector('.pv-nav-surface path:not(.pv-nav-edge)'),indicator=n.querySelector('.pv-nav-indicator'),r=n.getBoundingClientRect();return {theme:document.documentElement.dataset.theme,variant:n.dataset.curvedNavigation,selected:!!selected,label:selected?.querySelector('.pv-nav-label')?.textContent,ink:selected?getComputedStyle(selected.querySelector('.pv-nav-label')).color:null,icon:selected?getComputedStyle(selected.querySelector('.pv-nav-icon')).color:null,surface:path?getComputedStyle(path).fill:null,path:path?.getAttribute('d'),highlight:indicator?getComputedStyle(indicator).backgroundColor:null,left:r.left,right:r.right,bottom:r.bottom,viewport:innerWidth,height:innerHeight}})()`);
    if (mobile) {
      const accent = mobile.theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)';
      assert(mobile.selected && mobile.label, 'An actual selected mobile destination has a readable label');
      assert(mobile.path?.startsWith('M'), 'Mobile navigation renders its SVG surface');
      assert.equal(mobile.surface, mobile.theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 53, 102)', 'Mobile navigation surface follows the theme');
      assert.equal(mobile.highlight, accent, 'Separate mobile highlight follows the theme');
      assert.equal(mobile.ink, accent, 'Selected mobile label follows the theme');
      assert.equal(mobile.icon, mobile.variant === 'action' ? accent : mobile.theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 29, 61)', 'Selected mobile icon contrasts with its highlight');
      assert(Math.abs(mobile.left) <= 1 && Math.abs(mobile.right - mobile.viewport) <= 1 && Math.abs(mobile.bottom - mobile.height) <= 1, 'Mobile surface connects to the bottom and sides of the viewport');
      return;
    }
    const selected = await evaluate(`(()=>{return [...document.querySelectorAll('[data-portal-navigation] [aria-current="page"],nav[data-page-tabs] [aria-current="page"],button[data-page-tabs][aria-current="page"]')].filter(e=>e.getClientRects().length).map(e=>{const shape=e.querySelector('.user-navigation-highlight')||e,s=getComputedStyle(shape);return {label:e.textContent.trim(),fill:s.backgroundImage,ink:getComputedStyle(e).color}})})()`);
    assert(selected.length > 0, 'An actual active navigation control renders');
    for (const paint of selected) {
      assert(paint.fill.includes('rgb(255, 195, 0)') && paint.fill.includes('rgb(255, 214, 10)'), 'Desktop navigation stays yellow: ' + JSON.stringify(paint));
      assert.equal(paint.ink, 'rgb(0, 29, 61)', 'Desktop navigation keeps navy text');
    }
  };
  const checkGrid = async (selector, width, maxHeight) => {
    const m = await evaluate(`(()=>{const g=document.querySelector(${JSON.stringify(selector)}),cards=[...g.querySelectorAll(':scope > [data-listing-id]')],rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}},rows=cards.map(e=>({kind:e.dataset.marketKind,...rect(e),image:rect(e.querySelector('.market-card-thumbnail')),parts:[...e.querySelectorAll('.market-card-copy,.seller-service-meta,.market-card-title,.compact-card-details-toggle,.compact-card-details-content,.market-card-footer')].map(p=>({name:p.className,...rect(p),display:getComputedStyle(p).display}))}));return {viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,rows}})()`);
    assert.equal(m.overflow, false, 'No horizontal page overflow');
    assert(m.rows.length >= 2, 'Actual listings render');
    if (width < 640) {
      assert(Math.abs(m.rows[0].y - m.rows[1].y) < 2 && m.rows[1].x > m.rows[0].x, 'Two cards share the first row');
      for (const r of m.rows) {
        assert(r.h <= maxHeight, 'Phone card height is compact: ' + JSON.stringify(r));
        assert(r.image.h <= 120 && r.image.h <= r.w * .76, 'Image uses a compact bounded preview');
      }
    }
    measurements.push({ selector, width, ...m });
  };
  const sellerTab = async (id, width) => {
    if (width < 640 && ['services', 'profile', 'notifications'].includes(id)) {
      await click('[data-navigation-id="more"]');
      await until(`!!document.querySelector('[data-portal-navigation="menu"]')`, 'More navigation');
      await click(`[data-portal-navigation="menu"] [data-navigation-id="${id}"]`);
    } else if (width < 640) await click(`[data-navigation-id="${id}"]`);
    else {
      const text = { inventory: 'Inventory', services: 'Services', profile: 'Store Profile', notifications: 'Notifications' }[id];
      assert(await evaluate(`(()=>{const e=[...document.querySelectorAll('button[data-page-tabs]')].find(e=>e.getClientRects().length&&e.textContent.includes(${JSON.stringify(text)}));if(!e)return false;e.click();return true})()`), 'Seller tab: ' + id);
    }
    await pause(80);
  };
  for (const width of [320, 390, 430, 1440]) for (const theme of ['light', 'dark']) {
    await test(`${width}px ${theme} mobile UI market cards and page selectors`, async () => {
      await viewport(width); await load('/#/user/dashboard', theme, false, { role: 'user', selector: '.user-dashboard [data-dashboard-view]' });
      await until(`document.querySelectorAll('#home-market-section [data-listing-id]').length===4`, 'Fixture catalog'); await closeWelcome();
      await checkPaint('.market-categories button[aria-pressed="true"]', theme);
      const catalogInk = await evaluate(`getComputedStyle(document.querySelector('.user-catalog-switcher button[aria-pressed="true"]>span:last-child')).color`);
      assert.equal(catalogInk, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 29, 61)');
      const highlight = await evaluate(`getComputedStyle(document.querySelector('.user-catalog-switcher .user-navigation-highlight')).backgroundImage`);
      assert(highlight.includes(theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 195, 0)'));
      await checkNavigation(); await checkGrid('#home-market-section .market-catalog-grid', width, 290);
      await click('.market-price-toggle'); await until(`!!document.querySelector('dialog[aria-label="Marketplace filters"]')`, 'Filters');
      await checkPaint('dialog .market-filter-footer button', theme); await click('[aria-label="Close marketplace filters"]');
      assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('.market-categories button')].find(e=>e.textContent==='Services');b.click();return true})()`));
      await until(`document.querySelectorAll('#home-market-section [data-listing-id]').length===2`, 'Services filter');
      await checkGrid('#home-market-section .market-catalog-grid', width, 290);
      if (width === 390) await capture(`390-${theme}-compact-market-services`);
    });
    await test(`${width}px ${theme} mobile UI compact seller cards and scrolling alerts`, async () => {
      await viewport(width); await load('/#/digital-market', theme, false, { role: 'merchant', selector: '[data-product-screen="market"] main' });
      await sellerTab('inventory', width); await until(`!!document.querySelector('[data-seller-panel="inventory"] [data-listing-id]')`, 'Stock');
      await checkNavigation(); await checkGrid('[data-seller-panel="inventory"] .market-inventory-grid', width, 330);
      await sellerTab('services', width); await until(`document.querySelectorAll('.seller-services-grid [data-listing-id]').length===2`, 'Service inventory');
      await checkGrid('.seller-services-grid', width, 340);
      const contentVisible = () => evaluate(`getComputedStyle(document.querySelector('.compact-card-details-content')).display!=='none'`);
      assert.equal(await contentVisible(), width >= 640, 'Secondary details collapse on phones only');
      if (width < 640) {
        await click('.compact-card-details-toggle'); assert(await contentVisible(), 'Service detail expands');
        await click('.compact-card-details-toggle'); assert.equal(await contentVisible(), false, 'Service detail closes');
      }
      if (width === 390) await capture(`390-${theme}-compact-seller-services`);
      await sellerTab('notifications', width); await until(`!!document.querySelector('.pv-scroll-filters')`, 'Notification filters');
      const scroll = await evaluate(`(()=>{const e=document.querySelector('.pv-scroll-filters');return {overflow:getComputedStyle(e).overflowX,width:e.clientWidth,content:e.scrollWidth,buttons:[...e.children].map(b=>({w:b.clientWidth,content:b.scrollWidth,shrink:getComputedStyle(b).flexShrink}))}})()`);
      assert.equal(scroll.overflow, 'auto'); assert(scroll.buttons.every(b => b.shrink === '0' && b.content <= b.w + 1), 'Full filter labels do not squeeze or clip');
      if (width < 640) {
        assert(scroll.content > scroll.width, 'Filter rail actually overflows within its container');
        await until(`!document.querySelector('dialog[open]')`, 'Navigation overlay closes before rail interaction');
        await evaluate(`document.querySelector('.pv-scroll-filters').focus({preventScroll:true})`);
        await until(`document.activeElement===document.querySelector('.pv-scroll-filters')`, 'Filter rail receives keyboard focus');
        for (let i = 0; i < 6; i++) {
          await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
          await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
        }
        await until(`document.querySelector('.pv-scroll-filters').scrollLeft>0`, 'Filter rail scrolls with the keyboard', 3000);
      }
      await checkPaint('.pv-scroll-filters button[aria-pressed="true"]', theme);
      await checkNavigation(); assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`));
      if (width === 390) await capture(`390-${theme}-scrollable-seller-alerts`);
    });
    await test(`${width}px ${theme} mobile UI compact purchases expand with PIN and tracking`, async () => {
      await viewport(width); await load('/#/user/dashboard', theme, false, { role: 'user', selector: '.user-dashboard [data-dashboard-view]' }); await closeWelcome();
      assert(await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-user-navigation],[data-navigation-id="digital-market"]')].find(e=>e.getClientRects().length&&(e.dataset.navigationId==='digital-market'||/Purchases/.test(e.textContent)));if(!e)return false;e.click();return true})()`));
      await until(`document.querySelectorAll('[data-purchase-id]').length===3`, 'Purchase summaries');
      assert(await evaluate(`[...document.querySelectorAll('[data-purchase-id]')].every(e=>!e.open&&!e.querySelector('.purchase-details'))`), 'PINs and detailed tracking are not mounted before expansion');
      const before = await evaluate(`(()=>{const e=document.querySelector('[data-purchase-id="7f535369-873a-40a1-98f7-57f1d219e72b"]'),r=e.getBoundingClientRect(),ref=e.querySelector('.purchase-reference');return {height:r.height,reference:ref.textContent,referenceHeight:ref.getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
      assert(before.height <= 205 && before.referenceHeight < 20 && !before.overflow, 'Compact readable order summary: ' + JSON.stringify(before));
      assert.equal(before.reference, 'Order #7F535369'); await checkNavigation();
      if (width === 390) await capture(`390-${theme}-compact-purchases`);
      await evaluate(`document.querySelector('[data-purchase-id="7f535369-873a-40a1-98f7-57f1d219e72b"]>.purchase-summary').focus()`);
      await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
      await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await until(`document.querySelector('.purchase-details')?.textContent.includes('491638')`, 'Keyboard expands buyer PIN');
      assert(await evaluate(`document.querySelector('.purchase-details').textContent.includes('Chronological Order Timeline')&&document.querySelector('.purchase-details').textContent.includes('Cancel request')`), 'Existing timeline and cancellation remain available');
      assert(await evaluate(`!![...document.querySelectorAll('.purchase-details button')].find(e=>e.textContent.includes('View Map'))`), 'Existing map action remains available');
      await click('[data-purchase-id="7f535369-873a-40a1-98f7-57f1d219e72b"]>.purchase-summary'); await until(`!document.querySelector('.purchase-details')`, 'Collapse unmounts PIN controls');
      await evaluate(`document.querySelector('[data-purchase-id="f65d1540-38da-41a5-b782-482e873ef1a2"]>.purchase-summary').click()`); await until(`document.querySelector('[data-purchase-id="f65d1540-38da-41a5-b782-482e873ef1a2"]').open`, 'Completed order opens');
      assert(await evaluate(`document.querySelector('[data-purchase-id="f65d1540-38da-41a5-b782-482e873ef1a2"]').textContent.includes('Rate Store')`), 'Completed purchase still offers the review flow');
      measurements.push({ width, theme, purchase: before });
    });
  }
  for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) for (const role of ['user', 'merchant']) {
    await test(`${width}px ${theme} mobile UI ${role} System default keeps pill shape`, async () => {
      await viewport(width); await load(role === 'user' ? '/#/user/dashboard' : '/#/digital-market', theme, theme === 'dark', { role, selector: role === 'user' ? '.user-dashboard [data-dashboard-view]' : '[data-product-screen="market"] main' }); await closeWelcome();
      if (role === 'merchant') await sellerTab('profile', width);
      else assert(await evaluate(`(()=>{const e=[...document.querySelectorAll('[data-user-navigation],[data-navigation-id="options"]')].find(e=>e.getClientRects().length&&(e.dataset.navigationId==='options'||/Options/.test(e.textContent)));if(!e)return false;e.click();return true})()`));
      await until(`!!document.querySelector('.theme-system-choice')`, 'Appearance settings');
      if (await evaluate(`!!document.querySelector('button.pv-merchant-join')`)) {
        const merchant = await evaluate(`(()=>{const s=getComputedStyle(document.querySelector('button.pv-merchant-join'));return {fill:s.backgroundImage,ink:s.color}})()`);
        assert(merchant.fill.includes('rgb(255, 214, 10)') && merchant.fill.includes('rgb(255, 195, 0)'), 'Merchant invitation stays gold in both themes');
        assert.equal(merchant.ink, 'rgb(0, 29, 61)');
      }
      await click('.theme-system-choice'); await until(`document.querySelector('.theme-system-choice').getAttribute('aria-pressed')==='true'`, 'System default selected');
      const shape = await evaluate(`(()=>{const b=document.querySelector('.theme-system-choice'),i=b.firstElementChild,rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {h:r.height,radius:parseFloat(s.borderRadius),fill:s.backgroundImage,background:s.backgroundColor}};return {outer:rect(b),inner:rect(i)}})()`);
      assert(shape.outer.radius >= shape.outer.h / 2 && shape.inner.radius >= shape.inner.h / 2, 'Both pill layers retain rounded ends: ' + JSON.stringify(shape));
      assert.equal(shape.outer.background, 'rgba(0, 0, 0, 0)', 'No rectangular selected fill behind the pill');
      assert(shape.inner.fill.includes(theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 195, 0)'));
      await os(theme === 'light'); await until(`document.documentElement.dataset.theme===${JSON.stringify(theme === 'light' ? 'dark' : 'light')}`, 'System colour change');
      assert.equal(await evaluate(`document.querySelector('.theme-system-choice').getAttribute('aria-pressed')`), 'true');
      if (width === 390) await capture(`390-${theme}-${role}-system-pill`);
      await click('.theme-toggle'); await until(`document.querySelector('.theme-system-choice').getAttribute('aria-pressed')==='false'`, 'Manual slider leaves System');
      await checkNavigation();
    });
  }
  for (const theme of ['light', 'dark']) await test(`390px ${theme} mobile UI map and companion page controls`, async () => {
    await viewport(390); await load('/#/user/dashboard', theme, false, { role: 'user', selector: '.user-dashboard [data-dashboard-view]' }); await closeWelcome();
    await until(`!!document.querySelector('.pv-companion-nav-launcher')`, 'AI navigation');
    await click('.pv-companion-nav-launcher'); await until(`!!document.querySelector('.pv-companion-enable .pv-companion-primary')`, 'Companion consent controls');
    await checkPaint('.pv-companion-primary', theme); await checkPaint('.pv-companion-composer button', theme);
    await click('[aria-label="Customize companion"]');
    const edge = await evaluate(`getComputedStyle(document.querySelector('.pv-companion-choice.is-selected')).borderTopColor`);
    assert.equal(edge, theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)');
    await click('[aria-label="Close companion"]');
    assert(await evaluate(`(()=>{const b=[...document.querySelectorAll('.market-categories button')].find(e=>e.textContent==='Services');b.click();return true})()`));
    await click('[aria-label="Find services near you"]'); await until(`!!document.querySelector('.nearby-travel-modes')`, 'Nearby services map controls');
    await checkPaint('.nearby-travel-modes button[aria-pressed="true"]', theme);
    await capture(`390-${theme}-map-page-controls`);
  });
  for (const width of [390, 1440]) for (const theme of ['light', 'dark']) for (const page of productRoutes.slice(0, 8)) {
    await test(`${width}px ${theme} mobile UI role navigation: ${page.name}`, async () => {
      await viewport(width); await load(page.route, theme, false, page); await closeWelcome(); await checkNavigation();
      assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth`), 'Dashboard fits its viewport');
      if (width >= 1024) {
        const changed = await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&/top navigation|hide sidebar/i.test(e.title||e.getAttribute('aria-label')||''));if(!e)return false;e.click();return true})()`);
        if (changed) { await pause(300); await checkNavigation(); }
      }
    });
  }
  await fs.writeFile(output + '/mobile-ui-geometry.json', JSON.stringify(measurements, null, 2) + '\n');
};
