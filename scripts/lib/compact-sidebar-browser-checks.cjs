/** Actual built pages, synthetic loopback accounts; no hosted auth or writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');

module.exports = async ({ viewport, load, evaluate, until, test, capture, command, pause, productRoutes, output }) => {
  const results = [];
  const pages = productRoutes.filter(p => ['primary dashboard', 'resident dashboard', 'manager dashboard', 'staff dashboard', 'administrator dashboard'].includes(p.name));
  const state = () => evaluate(`(()=>{
    const aside=[...document.querySelectorAll('aside[data-portal-navigation="sidebar"]')].find(e=>e.getClientRects().length),main=document.querySelector('main');
    const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom}},paint=e=>{const s=getComputedStyle(e);return{background:s.backgroundColor,color:s.color,backgroundImage:s.backgroundImage}};
    const toggle=aside?.querySelector('[data-sidebar-toggle]'),selection=aside?.querySelector('[aria-current="page"]');
    return{aside:aside?rect(aside):null,main:main?rect(main):null,compact:aside?.dataset.sidebarCollapsed,stored:localStorage.getItem('pinevela_navigation_layout'),overflow:document.documentElement.scrollWidth>innerWidth+1,
      topBars:document.querySelectorAll('[data-portal-navigation="top"]').length,focusOnToggle:document.activeElement===toggle,expanded:toggle?.getAttribute('aria-expanded'),
      selection:selection?{id:selection.dataset.navigationId,...paint(selection),icon:paint(selection.querySelector('.pv-sidebar-icon')||selection),label:selection.querySelector('.pv-sidebar-label')?.textContent}:null,
      surface:aside?paint(aside):null,highlight:aside?.querySelector('.pv-sidebar-highlight')?{...rect(aside.querySelector('.pv-sidebar-highlight')),...paint(aside.querySelector('.pv-sidebar-highlight'))}:null,
      ids:[...aside?.querySelectorAll('[data-navigation-id]')||[]].map(b=>({id:b.dataset.navigationId,disabled:b.disabled,label:b.getAttribute('aria-label')}))};
  })()`);
  const clickToggle = async () => {
    const point = await evaluate(`(()=>{const b=[...document.querySelectorAll('[data-sidebar-toggle]')].find(e=>e.getClientRects().length);const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
  };
  const loadPage = async (p, width, theme, height = 900) => {
    await viewport(width, height); await load(p.route, theme, false, p);
    await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]')?.click()`);
    await evaluate('document.fonts.ready'); await pause(80);
  };
  for (const width of [1024, 1440]) for (const theme of ['light', 'dark']) for (const page of pages) await test(`${width}px ${theme} compact sidebar: ${page.name}`, async () => {
    await loadPage(page, width, theme);
    const before = await state(); assert.equal(before.compact, 'false');
    await clickToggle();
    await until(`!!document.querySelector('.pv-compact-sidebar')&&localStorage.getItem('pinevela_navigation_layout')==='compact'`, 'Compact sidebar');
    const compact = await state();
    assert.equal(compact.topBars, 0); assert.equal(compact.compact, 'true'); assert.equal(compact.expanded, 'false');
    assert(compact.focusOnToggle, 'The layout toggle retains keyboard focus');
    assert(compact.aside.w <= 110 && compact.aside.w >= 90 && compact.aside.x >= 0, 'Compact navigation remains at the left side');
    assert(compact.main.x >= compact.aside.right - 1, 'Content is beside the rail');
    assert(compact.main.w > before.main.w + 100, 'Minimizing frees useful content width');
    assert(!compact.overflow && compact.aside.bottom <= 901);
    assert(compact.ids.length >= 3, 'Destinations remain available');
    assert.equal(compact.surface.background, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 53, 102)');
    if (compact.highlight) {
      assert.equal(compact.highlight.background, theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)');
      assert.equal(compact.selection.icon.color, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 29, 61)');
      assert.equal(compact.highlight.w, 50); assert.equal(compact.highlight.h, 50);
    }
    if (page.name === 'manager dashboard') {
      assert(compact.ids.filter(b => ['overview', 'properties', 'blocks', 'staff', 'maintenance', 'meetings'].includes(b.id)).every(b => b.disabled), 'Pending property locks survive minimizing');
      assert(compact.ids.filter(b => ['settings', 'registration', 'notifications'].includes(b.id)).every(b => !b.disabled), 'Account settings, registration and alerts stay available');
      await evaluate(`document.querySelector('.pv-compact-sidebar [data-navigation-id="blocks"]').click()`);
      assert.equal((await state()).selection?.id, compact.selection?.id, 'A disabled destination cannot change tabs');
    }
    const settingsId = page.name === 'primary dashboard' ? 'options' : 'settings';
    await evaluate(`(()=>{const b=document.querySelector('.pv-compact-sidebar [data-navigation-id="${settingsId}"]');b.scrollIntoView({block:'nearest'});b.click()})()`);
    await until(`document.querySelector('.pv-compact-sidebar [data-navigation-id="${settingsId}"]')?.getAttribute('aria-current')==='page'`, 'Account settings selected');
    const labels = await evaluate(`(()=>{const b=document.querySelector('.pv-compact-sidebar [aria-current="page"]'),l=b.querySelector('.pv-sidebar-label'),i=b.querySelector('.pv-sidebar-icon'),r=l.getBoundingClientRect(),ir=i.getBoundingClientRect(),text=document.createRange();text.selectNodeContents(l);const t=text.getBoundingClientRect();return{labelBelowIcon:r.top>=ir.bottom+3,textFits:t.left>=r.left-1&&t.right<=r.right+1&&t.bottom<=r.bottom+1,clickable:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b}})()`);
    assert(labels.labelBelowIcon && labels.textFits && labels.clickable, 'Selected icon and readable label keep their own space');
    await evaluate(`document.querySelector('[role="group"][aria-label="Appearance theme"] [role="switch"]').click()`);
    await until(`document.documentElement.dataset.theme==='${theme === 'light' ? 'dark' : 'light'}'`, 'Live theme switch');
    assert.equal((await state()).surface.background, theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 255, 255)', 'The compact rail responds immediately to a theme switch');
    await evaluate(`document.querySelector('[role="group"][aria-label="Appearance theme"] [role="switch"]').click()`);
    await until(`document.documentElement.dataset.theme==='${theme}'`, 'Original theme restored');
    if (width === 1440) await capture(`1440-${theme}-compact-sidebar-${page.name.replaceAll(' ', '-')}`);
    await command('Page.reload');
    await until(`!!document.querySelector('.pv-compact-sidebar')`, 'Compact preference survives reload');
    // Expand with the keyboard, then minimize again for a pointer/keyboard cycle.
    await evaluate(`document.querySelector('.pv-compact-sidebar [data-sidebar-toggle]').focus()`);
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r' });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await until(`!document.querySelector('.pv-compact-sidebar')&&localStorage.getItem('pinevela_navigation_layout')==='sidebar'`, 'Expanded sidebar restored');
    const expanded = await state(); assert.equal(expanded.aside.w, before.aside.w); assert.equal(expanded.main.w, before.main.w); assert(expanded.focusOnToggle); assert.equal(expanded.expanded, 'true');
    results.push({ width, theme, page: page.name, before, compact, expanded, labels });
  });
  for (const page of [pages[0], pages.find(p => p.name === 'administrator dashboard')]) await test(`1024px compact sidebar short screen and legacy preference: ${page.name}`, async () => {
    await loadPage(page, 1024, 'dark', 600);
    await evaluate(`localStorage.setItem('pinevela_navigation_layout','top')`); await command('Page.reload');
    await until(`!!document.querySelector('.pv-compact-sidebar')&&localStorage.getItem('pinevela_navigation_layout')==='compact'`, 'Legacy top preference becomes a side rail');
    assert.equal((await state()).topBars, 0);
    const scroll = await evaluate(`(()=>{const n=document.querySelector('.pv-sidebar-list'),last=n.querySelector('button:last-child');last.scrollIntoView({block:'nearest'});const r=last.getBoundingClientRect(),f=document.querySelector('.pv-sidebar-footer').getBoundingClientRect();return{scrollTop:n.scrollTop,bottom:r.bottom,footerTop:f.top,footerBottom:f.bottom,height:innerHeight}})()`);
    assert(scroll.bottom <= scroll.footerTop + 1 && scroll.footerBottom <= scroll.height, 'All destinations scroll above the reachable footer');
    await capture(`1024-short-${page.name.replaceAll(' ', '-')}`);
    results.push({ page: page.name, shortScreen: true, ...scroll });
  });
  await fs.writeFile(output + '/compact-sidebar-measurements.json', JSON.stringify({ passed: true, syntheticLoopbackFixtures: true, productionWrites: 0, results }, null, 2) + '\n');
};
