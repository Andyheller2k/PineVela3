/** Read-only installed APK UI check. No login, signup or Google submission. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const sharp = require('sharp');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  // The caller must sign out first; this check never clears an existing session.
  const app = 'app.pinevela.mobile.debug';
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const port = 9233;
  const adbPath = path.join(process.env.ANDROID_HOME || '/home/wyse/Android/Sdk', 'platform-tools/adb');
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const output = path.resolve(process.env.PINEVELA_ANDROID_AUTH_ENTRY_OUTPUT || 'docs/verification/android-welcome-2026-10-30');
  const pending = new Map(), scenarios = [], screenshots = [], exceptions = [];
  let ws, sequence = 0, stage = 'installed development APK', savedAppearance;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error('WebView command timed out')); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!r.exceptionDetails, 'Read-only UI evaluation succeeds'); return r.result.value;
  };
  const until = async (expression, label, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await pause(120); }
    throw Error(label + ' did not settle');
  };
  const tap = async selector => {
    await until(`document.querySelector(${JSON.stringify(selector)})`, 'Visible touch control');
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);
    await pause(280);
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();return {x:(r.left+r.width/2),y:(r.top+r.height/2),ratio:devicePixelRatio,reachable:!!document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest(${JSON.stringify(selector)})}})()`);
    assert(point.reachable, 'The actual control is reachable above other content');
    const top = Number(adb(['shell', 'dumpsys', 'window']).toString().match(/type=statusBars frame=\[0,0\]\[\d+,(\d+)\]/)?.[1]);
    assert(Number.isFinite(top));
    adb(['shell', 'input', 'tap', String(Math.round(point.x * point.ratio)), String(Math.round(point.y * point.ratio + top))]);
  };
  const capture = async (name, theme) => {
    await pause(700);
    const brand = await evaluate(`(async()=>{await document.fonts.ready;const e=document.querySelector('.pinevela-wordmark'),v=e.querySelector('.vela-label'),t=document.querySelector('.theme-toggle-thumb');return {text:e.textContent,font:getComputedStyle(e).fontFamily,fontLoaded:document.fonts.check('800 20px "PineVela Wordmark"'),ink:getComputedStyle(v).color,fill:getComputedStyle(v).webkitTextFillColor,background:getComputedStyle(v).backgroundColor,thumb:getComputedStyle(t).backgroundImage,thumbInk:getComputedStyle(t).color}})()`);
    assert.equal(brand.text, 'PineVela'); assert(brand.font.includes('PineVela Wordmark') && brand.fontLoaded);
    assert.equal(brand.background, 'rgba(0, 0, 0, 0)'); assert.equal(brand.ink, theme === 'light' ? 'rgb(25, 25, 25)' : 'rgb(255, 214, 10)'); assert.equal(brand.fill, brand.ink);
    assert(brand.thumb.includes(theme === 'light' ? 'rgb(0, 53, 102)' : 'rgb(255, 214, 10)')); assert.equal(brand.thumbInk, theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(0, 29, 61)');
    const bytes = adb(['exec-out', 'screencap', '-p']);
    await fs.writeFile(path.join(output, name + '.png'), bytes);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const windowInfo = adb(['shell', 'dumpsys', 'window']).toString();
    const top = windowInfo.match(/type=statusBars frame=\[0,0\]\[\d+,(\d+)\]/);
    const bottom = windowInfo.match(/type=navigationBars frame=\[0,(\d+)\]\[\d+,(\d+)\]/);
    assert(top && bottom);
    const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3));
    const expected = theme === 'dark' ? [0, 29, 61] : [255, 255, 255];
    assert.deepEqual(pixel(Math.floor(info.width * .55), Math.floor(Number(top[1]) / 4)), expected, 'Status bar matches theme');
    assert.deepEqual(pixel(Math.floor(info.width * .12), Math.floor((Number(bottom[1]) + Number(bottom[2])) / 2)), expected, 'Navigation bar matches theme');
    screenshots.push({ name, theme, physicalDisplay: true });
  };
  const scenario = async (label, work) => { stage = label; await work(); scenarios.push(label); console.log('PASS ' + label); };
  const localLogin = async mode => {
    await until(`document.querySelector('.login-auth-card')?.dataset.activeTab===${JSON.stringify(mode)}`, 'Correct in-app card');
    assert.equal(await evaluate(`location.origin`), 'https://localhost');
    assert.equal(await evaluate(`document.querySelectorAll('.login-mode-toggle button').length`), 2);
    assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));
  };
  await fs.mkdir(output, { recursive: true });
  try {
    const installed = adb(['shell', 'pm', 'path', app]).toString().trim();
    assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(installed));
    const installedApkSha256 = adb(['shell', 'sha256sum', installed.slice(8)]).toString().match(/^[a-f0-9]{64}/)?.[0];
    assert.equal(installedApkSha256, crypto.createHash('sha256').update(await fs.readFile('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex'));
    adb(['shell', 'am', 'force-stop', app]); adb(['shell', 'am', 'start', '-n', app + '/app.pinevela.mobile.MainActivity']);
    let target;
    const end = Date.now() + 90000;
    while (!target && Date.now() < end) {
      try {
        const pid = adb(['shell', 'pidof', app]).toString().trim().split(/\s+/)[0];
        if (pid) { adb(['forward', 'tcp:' + port, 'localabstract:webview_devtools_remote_' + pid]); target = (await fetch('http://127.0.0.1:' + port + '/json/list').then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('https://localhost')); }
      } catch {} if (!target) await pause(250);
    }
    assert(target, 'Actual installed WebView is available');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1')); await once(ws, 'open');
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push('Uncaught WebView exception');
      const waiter = pending.get(message.id); if (!waiter) return;
      pending.delete(message.id); clearTimeout(waiter.timer);
      message.error ? waiter.reject(Error('WebView command rejected')) : waiter.resolve(message.result);
    });
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await until(`document.querySelector('[data-native-welcome]')&&!document.querySelector('#pv-app-launch')`, 'Initial mobile welcome', 90000);
    assert.equal(await evaluate(`fetch('/api/auth/me').then(r=>r.status)`), 401, 'The emulator is signed out on the server');
    savedAppearance = await evaluate(`localStorage.getItem('pinevela:appearance')`);
    await evaluate(`localStorage.setItem('pinevela:appearance','light')`); await send('Page.reload', { ignoreCache: true });
    await until(`document.querySelector('[data-native-welcome]')&&document.documentElement.dataset.theme==='light'&&!document.querySelector('#pv-app-launch')`, 'Light welcome');
    await scenario('Cold launch shows the glass welcome over the original landing artwork', async () => {
      assert.equal(await evaluate(`Capacitor.getPlatform()`), 'android');
      assert(await evaluate(`(()=>{const e=document.querySelector('.native-welcome-artwork img'),s=getComputedStyle(document.querySelector('.native-welcome-card'));return e.complete&&e.naturalWidth===1448&&e.currentSrc.startsWith(location.origin+'/')&&e.currentSrc.includes('landing-welcome-transparent')&&s.backgroundImage.includes('0.68')&&s.backdropFilter.includes('blur')&&!document.querySelector('form')&&!document.querySelector('iframe')&&document.documentElement.scrollWidth<=innerWidth+1})()`));
      await capture('welcome-light', 'light');
    });
    await scenario('Sign in opens the local login card and the selector animates both ways', async () => {
      await tap('[data-native-welcome-login]'); await localLogin('login');
      await evaluate(`window.__authEntryMotion=[];window.__authEntryRecord=e=>{if(e.type==='animationstart'&&e.target.matches('form.login-motion-form'))window.__authEntryMotion.push(e.animationName);if(e.type==='transitionrun'&&e.target.matches('.login-mode-toggle'))window.__authEntryMotion.push('selector:'+e.propertyName)};document.addEventListener('animationstart',window.__authEntryRecord,true);document.addEventListener('transitionrun',window.__authEntryRecord,true)`);
      await capture('login-light', 'light');
      await tap('.login-mode-toggle button:nth-child(2)'); await localLogin('register'); await pause(250);
      assert(await evaluate(`window.__authEntryMotion.includes('pv-login-signup-in')&&window.__authEntryMotion.includes('selector:transform')`));
      await tap('.login-mode-toggle button:nth-child(1)'); await localLogin('login'); await pause(250);
      assert(await evaluate(`window.__authEntryMotion.includes('pv-login-signin-in')`));
      await evaluate(`document.removeEventListener('animationstart',window.__authEntryRecord,true);document.removeEventListener('transitionrun',window.__authEntryRecord,true);delete window.__authEntryRecord;delete window.__authEntryMotion`);
    });
    await scenario('Create account opens signup with compact fields and smaller required agreement text', async () => {
      await tap('[aria-label="PineVela welcome"]'); await until(`document.querySelector('[data-native-welcome-signup]')`, 'Welcome again');
      await tap('[data-native-welcome-signup]'); await localLogin('register');
      const density = await evaluate(`(()=>{const form=document.querySelector('.login-signup-form'),fields=[...form.querySelectorAll('input:not([type="checkbox"])')],legal=form.querySelector('.terms-acceptance-choice label'),privacy=form.querySelector('.terms-acceptance-control>p'),check=form.querySelector('input[type="checkbox"]');return {fieldHeights:fields.map(f=>f.getBoundingClientRect().height),fieldFonts:fields.map(f=>parseFloat(getComputedStyle(f).fontSize)),fieldGap:parseFloat(getComputedStyle(form).gap),termsFont:parseFloat(getComputedStyle(legal).fontSize),privacyFont:parseFloat(getComputedStyle(privacy).fontSize),termsRequired:check.required,termsChecked:check.checked,submitDisabled:form.querySelector('button[type="submit"]').disabled,googleDisabled:document.querySelector('.native-google-icon-action').disabled}})()`);
      assert(density.fieldHeights.length === 4 && density.fieldHeights.every(n => n >= 44 && n <= 48));
      assert(density.fieldFonts.every(n => n >= 16) && density.fieldGap <= 10);
      assert(density.termsFont === 11 && density.privacyFont === 10.5 && density.termsRequired && !density.termsChecked && density.submitDisabled && density.googleDisabled);
      await fs.writeFile(path.join(output, 'signup-density.json'), JSON.stringify(density, null, 2) + '\n');
      await capture('signup-light', 'light');
    });
    await scenario('Welcome and both account cards follow dark mode with matching Android bars', async () => {
      await tap('[aria-label="PineVela welcome"]'); await until(`document.querySelector('[data-native-welcome]')`, 'Welcome');
      await tap('.native-welcome [role="switch"]'); await until(`document.documentElement.dataset.theme==='dark'`, 'Dark theme');
      assert(await evaluate(`getComputedStyle(document.querySelector('.native-welcome-card')).backgroundImage.includes('0.66')`));
      await capture('welcome-dark', 'dark'); await tap('[data-native-welcome-signup]'); await localLogin('register'); await capture('signup-dark', 'dark');
      await tap('.login-mode-toggle button:nth-child(1)'); await localLogin('login'); await capture('login-dark', 'dark');
    });
    await scenario('Reduced motion keeps tab switching functional and disables the animations', async () => {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      await tap('.login-mode-toggle button:nth-child(2)'); await localLogin('register');
      assert(await evaluate(`getComputedStyle(document.querySelector('.login-signup-form')).animationName==='none'&&getComputedStyle(document.querySelector('.login-mode-toggle'),'::before').transitionDuration==='0s'`));
    });
    await scenario('Contact support on the bundled policy opens the local Help page', async () => {
      await send('Page.navigate', { url: 'https://localhost/terms.html' }); await until(`document.querySelector('.document')`, 'Bundled Terms');
      assert.equal(await evaluate(`document.querySelector('header a[href="/#/help"]').textContent`), 'Contact support');
      await tap('header a[href="/#/help"]');
      await until(`document.querySelector('.support-surface textarea')`, 'Bundled Help page');
      assert.equal(await evaluate('location.origin'), 'https://localhost'); assert.equal(await evaluate('location.hash'), '#/help');
      assert(await evaluate(`[...document.querySelectorAll('a')].some(a=>a.textContent==='Email support'&&a.protocol==='mailto:')`));
      await capture('help-dark', 'dark');
    });
    assert.equal(exceptions.length, 0);
    const report = { passed: true, date: new Date().toISOString(), installedApkSha256, actualAndroidWebView: true, scenarios, screenshots, uncaughtExceptions: 0, nativeOnlyWelcome: true, bothButtonsOpenBundledForms: true, animationsObserved: true, signedOutStatus401: true, accountFormsSubmitted: false, googleOAuthTested: false, productionCaptchaTested: false, physicalPhoneTested: false, iosBuildTested: false };
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); console.log(JSON.stringify(report));
  } catch (error) {
    const message = String(error?.message || '').split('\n')[0];
    const report = { passed: false, stage, reason: /^[A-Za-z0-9 ,():;.’'-]{1,180}$/.test(message) ? message : 'Native UI check failed', scenarios };
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(report, null, 2) + '\n'); console.error(JSON.stringify(report)); process.exitCode = 1;
  } finally {
    if (ws) {
      await send('Emulation.setEmulatedMedia', { features: [] }).catch(() => {});
      if (savedAppearance !== undefined) await evaluate(savedAppearance === null ? `localStorage.removeItem('pinevela:appearance')` : `localStorage.setItem('pinevela:appearance',${JSON.stringify(savedAppearance)})`).catch(() => {});
      await send('Page.navigate', { url: 'https://localhost/#/login' }).catch(() => {});
      await send('Page.reload', { ignoreCache: true }).catch(() => {});
      ws.close();
    }
    for (const waiter of pending.values()) clearTimeout(waiter.timer);
    try { adb(['forward', '--remove', 'tcp:' + port]); } catch {}
  }
})().catch(() => { console.error(JSON.stringify({ passed: false, reason: 'Installed Android UI harness could not start' })); process.exitCode = 1; });
