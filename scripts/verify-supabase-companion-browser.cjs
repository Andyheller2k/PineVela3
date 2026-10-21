/** Real approved session and real replies; network delay is injected without replacing API data. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { withApprovedPineVelaBrowser } = require('./lib/approved-pinevela-browser.cjs');
const directory = '.security/companion';
let checks = 0, stage = 'approved browser';
const check = (value, label) => { assert(value, label); checks++; };
(async () => {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await withApprovedPineVelaBrowser(async ({ evaluate, command, navigate, waitFor, onEvent }) => {
    const account = await evaluate(`(async()=>{const r=await fetch('/api/auth/me');const d=await r.json();return {status:r.status,role:d.role};})()`);
    check(account.status === 200 && account.role === 'user', 'Use the genuine signed-in primary session');
    await navigate('/#/user/dashboard');
    await waitFor(`!!document.querySelector('.pv-companion-launcher')`, 'Companion launcher');
    const open = async () => {
      await evaluate(`(()=>{const welcome=[...document.querySelectorAll('dialog[open]')].find(d=>/welcome/i.test(d.getAttribute('aria-label')||''));welcome?.querySelector('button[aria-label="Close dialog"]')?.click();[...document.querySelectorAll('.pv-companion-launcher,.pv-companion-nav-launcher')].find(b=>b.getClientRects().length)?.click();})()`);
      await waitFor(`!!document.querySelector('#pv-companion-message')`, 'Loaded companion');
    };
    await open();
    check(await evaluate(`!document.querySelector('.pv-companion-enable')`), 'The user has already enabled AI replies');
    check(await evaluate(`!document.querySelector('#pv-companion-message').disabled`), 'Composer accepts input');
    await command('Network.enable');
    let currentRequest;
    const held = new Set();
    onEvent(event => {
      if (event.method === 'Network.requestWillBeSent' && event.params.request.url.endsWith('/api/companion/turns')) currentRequest = event.params.requestId;
      if (event.method === 'Fetch.requestPaused') held.add(event.params.requestId);
    });
    const type = async text => {
      await evaluate(`(()=>{const e=document.querySelector('#pv-companion-message');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));e.focus();})()`);
      await command('Input.insertText', { text });
    };
    const replies = [];
    const cases = process.argv.includes('--ui-only') ? [] : [
      ['submissions', 'Can you check my PineVela submission status?'],
      ['scope', 'Write a Python script that sorts a list.'],
      ['trivia', 'Tell me one short fun fact about the Moon.'],
    ];
    for (const [kind, question] of cases) {
      stage = 'real reply: ' + kind;
      currentRequest = undefined;
      await type(question);
      const started = Date.now();
      await evaluate(`document.querySelector('.pv-companion-composer button[type="submit"]').click()`);
      await waitFor(`!!document.querySelector('.pv-companion-thinking')||!!document.querySelector('.pv-companion-error')`, 'Reply starts');
      await waitFor(`!document.querySelector('.pv-companion-thinking')`, 'Reply finishes', 55000);
      const visibleError = await evaluate(`document.querySelector('.pv-companion-error')?.innerText||''`);
      check(!visibleError, 'Reply has no API error' + (visibleError ? ': ' + visibleError : ''));
      check(currentRequest, 'A real authenticated request was observed');
      const raw = await command('Network.getResponseBody', { requestId: currentRequest });
      const data = JSON.parse(raw.body);
      check(data.turn?.answer && data.turn.user === question, 'Actual API reply belongs to the submitted question');
      check(data.turn.answer.split(/\s+/).length <= 200, 'Reply length stays bounded');
      if (kind === 'scope') check(/PineVela/.test(data.turn.answer) && !/```|def\s+\w+\(/.test(data.turn.answer), 'Coding request is declined');
      replies.push({ kind, elapsedMs: Date.now() - started, cards: data.turn.cards.length });
      console.log(JSON.stringify({ stage, passed: true, elapsedMs: Date.now() - started }));
    }
    stage = 'slow request cancellation';
    await command('Fetch.enable', { patterns: [{ urlPattern: '*/api/companion/turns', requestStage: 'Request' }] });
    const cancelledDraft = 'Let’s play a quick word game.';
    await type(cancelledDraft);
    await evaluate(`document.querySelector('.pv-companion-composer button[type="submit"]').click()`);
    await waitFor(`!!document.querySelector('.pv-companion-thinking')`, 'Pending request');
    await waitFor(`document.querySelector('.pv-companion-thinking')?.innerText.includes('Taking longer than usual')`, 'Slow reply hint', 12000);
    check(await evaluate(`!document.querySelector('#pv-companion-message').disabled`), 'Composer remains editable while waiting');
    await evaluate(`[...document.querySelectorAll('.pv-companion-thinking button')].find(b=>b.textContent==='Cancel reply').click()`);
    await waitFor(`!document.querySelector('.pv-companion-thinking')`, 'Cancellation clears thinking', 3000);
    check(await evaluate(`document.querySelector('#pv-companion-message').value===${JSON.stringify(cancelledDraft)}`), 'Cancellation preserves the draft');
    check(await evaluate(`document.querySelector('.pv-companion-error')?.innerText.includes('Reply cancelled')`), 'Cancellation has clear feedback');
    for (const requestId of held) { try { await command('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch {} }
    held.clear();
    stage = 'automatic browser deadline';
    console.log(JSON.stringify({ stage, started: true }));
    const timedDraft = 'How can I open PineVela Help?';
    await type(timedDraft);
    await evaluate(`document.querySelector('.pv-companion-composer button[type="submit"]').click()`);
    await waitFor(`!!document.querySelector('.pv-companion-thinking')`, 'Deadline test starts');
    await waitFor(`!document.querySelector('.pv-companion-thinking')`, 'Deadline automatically clears thinking', 60000);
    check(await evaluate(`document.querySelector('#pv-companion-message').value===${JSON.stringify(timedDraft)}&&document.querySelector('.pv-companion-error')?.innerText.includes('timed out')`), 'Deadline clears waiting and preserves the draft');
    for (const requestId of held) { try { await command('Fetch.failRequest', { requestId, errorReason: 'Aborted' }); } catch {} }
    await command('Fetch.disable');
    const originalTheme = await evaluate('document.documentElement.dataset.theme');
    const layouts = [];
    try {
      for (const width of [320, 375, 768, 1440]) {
        stage = 'responsive glass: ' + width;
        await evaluate(`document.querySelector('button[aria-label="Close companion"]').click()`);
        await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
        const navigation = await evaluate(`(()=>{const mobile=document.querySelector('.pv-companion-nav-launcher');const desktop=document.querySelector('.pv-companion-launcher');const options=document.querySelector('[data-portal-navigation="mobile"] button[data-navigation-id="options"]');return {mobileVisible:!!mobile?.getClientRects().length,desktopVisible:!!desktop?.getClientRects().length,adjacent:!!mobile&&mobile.getBoundingClientRect().left>=options.getBoundingClientRect().right-1};})()`);
        check(width < 1024 ? navigation.mobileVisible && !navigation.desktopVisible && navigation.adjacent : navigation.desktopVisible && !navigation.mobileVisible, 'Correct companion placement');
        await open();
        for (const theme of ['dark', 'light']) {
          await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(theme)}`);
          const style = await evaluate(`(()=>{const panel=document.querySelector('.pv-companion-panel'),s=getComputedStyle(panel),input=document.querySelector('#pv-companion-message'),r=panel.getBoundingClientRect(),i=input.getBoundingClientRect();return {background:s.backgroundColor,blur:s.backdropFilter,color:getComputedStyle(input).color,fits:r.left>=0&&r.right<=innerWidth&&i.width>140&&i.right<=r.right};})()`);
          const alpha = Number(style.background.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1]);
          check(style.fits && alpha > 0 && alpha <= 0.6 && style.blur.includes('16px'), 'Transparent glass and readable composer fit the viewport');
          layouts.push({ width, theme, ...style });
          if ((width === 1440 && theme === 'dark') || (width === 375 && theme === 'light')) {
            const shot = await command('Page.captureScreenshot', { format: 'png' });
            await fs.writeFile(`${directory}/browser-${theme}-${width}.png`, Buffer.from(shot.data, 'base64'), { mode: 0o600 });
          }
        }
      }
    } finally { await evaluate(`document.documentElement.dataset.theme=${JSON.stringify(originalTheme)}`); }
    const result = { passed: true, checks, authenticatedBrowserValidation: true, realReplies: replies, responseDataReplaced: false, cancellationVerified: true, automaticTimeoutVerified: true, layouts };
    await fs.writeFile(directory + (process.argv.includes('--ui-only') ? '/browser-ui-verification.json' : '/browser-verification.json'), JSON.stringify(result, null, 2), { mode: 0o600 });
    console.log(JSON.stringify({ passed: true, checks, realReplies: replies, cancellationVerified: true, automaticTimeoutVerified: true, widths: [320, 375, 768, 1440], themes: ['dark', 'light'] }));
  }, { preferPrimaryContext: true, approvalTimeoutMs: 45000, evaluationTimeoutMs: 55000 });
})().catch(error => { console.error(JSON.stringify({ passed: false, stage, checks, error: error.message })); process.exitCode = 1; });
