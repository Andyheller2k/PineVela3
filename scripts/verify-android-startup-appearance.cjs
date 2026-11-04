/** Actual installed APK UI evidence. No hosted account, credential or API mock. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const sharp = require('sharp');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const app = process.env.PINEVELA_ANDROID_PACKAGE || 'app.pinevela.mobile.transporttest';
  assert(['app.pinevela.mobile.transporttest', 'app.pinevela.mobile.debug'].includes(app), 'Use a PineVela development APK.');
  const component = app + '/app.pinevela.mobile.MainActivity';
  const port = Number(process.env.PINEVELA_WEBVIEW_PORT || 9228);
  const output = path.resolve(process.env.PINEVELA_ANDROID_EVIDENCE || 'docs/verification/android-step3-2026-10-29');
  const adbPath = path.join(process.env.ANDROID_HOME || '/home/wyse/Android/Sdk', 'platform-tools/adb');
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 25_000, maxBuffer: 16 * 1024 * 1024 });
  let ws, sequence = 0, installedApkSha256;
  const pending = new Map(), captures = [], scenarios = [], exceptions = [];
  const originalNavigation = adb(['shell', 'cmd', 'overlay', 'list']).toString().match(/\[x\] (com\.android\.internal\.systemui\.navbar\.\S+)/)?.[1];
  const originalNight = adb(['shell', 'cmd', 'uimode', 'night']).toString().includes('yes') ? 'yes' : 'no';
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 30_000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'WebView diagnostic evaluation failed.');
    return result.result.value;
  };
  const until = async (expression, name) => {
    for (let i = 0; i < 120; i++) {
      try { if (await evaluate(`Boolean(${expression})`)) return; } catch {}
      await pause(200);
    }
    throw Error(name + ' did not settle.');
  };
  const connect = async () => {
    if (ws) ws.close();
    let target;
    for (let i = 0; i < 100 && !target; i++) {
      try {
        const pid = adb(['shell', 'pidof', app]).toString().trim().split(/\s+/)[0];
        if (pid) {
          adb(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]);
          target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('https://localhost'));
        }
      } catch {}
      if (!target) await pause(200);
    }
    assert(target, 'PineVela WebView was not available.');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1'));
    await once(ws, 'open');
    const connection = ws;
    ws.addEventListener('close', () => {
      if (ws !== connection) return;
      for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(Error('WebView recreated its diagnostic connection.')); }
      pending.clear();
    });
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push('Uncaught WebView exception');
      const waiter = pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer); pending.delete(message.id);
      message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
    });
    await send('Runtime.enable'); await send('Page.enable');
  };
  const ready = async () => {
    await until(`document.querySelector('[data-native-welcome-login]') || document.querySelector('.login-credentials-form')`, 'Native entry');
    if (await evaluate(`!!document.querySelector('[data-native-welcome-login]')`)) await evaluate(`document.querySelector('[data-native-welcome-login]').click()`);
    await until(`document.querySelector('.login-credentials-form input[aria-label="Username or Email Address"]') && document.querySelector('.login-credentials-form button[type="submit"]:not([disabled])') && !document.querySelector('#pv-app-launch')`, 'Native sign-in');
    assert.equal(await evaluate(`Capacitor.getPlatform()`), 'android');
    assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`));
  };
  const chooseFromStorageAndReload = async preference => {
    // Used only to prepare the saved System preference. Manual checks below
    // use the actual visible switch through physical ADB touch input.
    await evaluate(`localStorage.setItem('pinevela:appearance',${JSON.stringify(preference)})`);
    await send('Page.navigate', { url: 'https://localhost/#/login?mode=login' });
    await send('Page.reload', { ignoreCache: true });
    await ready();
  };
  const capture = async (name, theme, extra = {}) => {
    await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await pause(700);
    const bytes = adb(['exec-out', 'screencap', '-p']);
    await fs.writeFile(path.join(output, name + '.png'), bytes);
    const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const windows = adb(['shell', 'dumpsys', 'window']).toString();
    const top = windows.match(/type=statusBars frame=\[0,0\]\[(\d+),(\d+)\]/);
    const bottom = windows.match(/type=navigationBars frame=\[0,(\d+)\]\[(\d+),(\d+)\]/);
    assert(top && bottom, 'Visible portrait status and navigation bars required.');
    const pixel = (x, y) => Array.from(data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3));
    const expected = theme === 'dark' ? [0, 29, 61] : [255, 255, 255];
    const topY = Math.floor(Number(top[2]) / 4);
    const bottomY = Math.floor((Number(bottom[1]) + Number(bottom[3])) / 2);
    const samples = {
      status: pixel(Math.floor(info.width * .55), topY),
      navigationLeft: pixel(Math.floor(info.width * .12), bottomY),
      navigationRight: pixel(Math.floor(info.width * .88), bottomY),
    };
    for (const [bar, rgb] of Object.entries(samples)) assert.deepEqual(rgb, expected, name + ': ' + bar + ' background');
    assert.equal(await evaluate(`document.documentElement.dataset.theme`), theme);
    captures.push({ name, theme, width: info.width, height: info.height, statusInset: Number(top[2]), navigationInset: info.height - Number(bottom[1]), samples, ...extra });
    console.log('PASS ' + name);
  };
  const tapTheme = async () => {
    await evaluate(`location.hash='/faq'`);
    // The previous login route also has a switch while the lazy FAQ loads.
    // Wait for the destination header rather than tapping the departing page.
    await until(`document.querySelector('.faq-search') && document.querySelector('[data-support-header] [role="switch"][aria-label="Dark mode"]')`, 'FAQ switch');
    await evaluate(`document.fonts.ready`);
    await pause(400);
    const point = await evaluate(`(() => {const r=document.querySelector('[data-support-header] [role="switch"][aria-label="Dark mode"]').getBoundingClientRect();return {x:(r.left+r.width/2)*devicePixelRatio,y:(r.top+r.height/2)*devicePixelRatio}})()`);
    const windowInfo = adb(['shell', 'dumpsys', 'window']).toString();
    const top = Number(windowInfo.match(/type=statusBars frame=\[0,0\]\[\d+,(\d+)\]/)[1]);
    adb(['shell', 'input', 'tap', String(Math.round(point.x)), String(Math.round(point.y + top))]);
  };
  const requireTheme = async (theme, preference) => {
    await until(`document.documentElement.dataset.theme===${JSON.stringify(theme)} && document.documentElement.dataset.themePreference===${JSON.stringify(preference)}`, 'Appearance ' + preference + '/' + theme);
  };
  let hold;
  try {
    await fs.mkdir(output, { recursive: true });
    const apkPath = adb(['shell', 'pm', 'path', app]).toString().trim();
    assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(apkPath), 'Installed package has a single owned base APK.');
    installedApkSha256 = adb(['shell', 'sha256sum', apkPath.slice('package:'.length)]).toString().match(/^[a-f0-9]{64}/)?.[0];
    const variant = app.endsWith('.transporttest') ? 'transportTest' : 'debug';
    const localApk = await fs.readFile(path.join('android/app/build/outputs/apk', variant, 'app-' + variant + '.apk'));
    assert.equal(crypto.createHash('sha256').update(localApk).digest('hex'), installedApkSha256, 'Appearance evidence uses the current local APK exactly.');
    adb(['shell', 'cmd', 'uimode', 'night', 'no']);
    adb(['shell', 'am', 'start', '-n', component]);
    await connect();
    await send('Emulation.setEmulatedMedia', { features: [] });
    await chooseFromStorageAndReload('system');
    await requireTheme('light', 'system');
    await capture('signin-system-light', 'light');
    adb(['shell', 'cmd', 'uimode', 'night', 'yes']);
    await requireTheme('dark', 'system');
    assert.equal(await evaluate(`matchMedia('(prefers-color-scheme: dark)').matches`), true);
    await capture('signin-system-dark', 'dark');
    scenarios.push('Actual Android night-mode changes update the WebView and physical system bars.');

    await tapTheme();
    await requireTheme('light', 'light');
    await capture('faq-manual-light-system-dark', 'light');
    adb(['shell', 'cmd', 'uimode', 'night', 'no']);
    await requireTheme('light', 'light');
    await tapTheme();
    await requireTheme('dark', 'dark');
    await capture('faq-manual-dark-system-light', 'dark');
    scenarios.push('The real theme switch overrides the opposite Android system appearance.');

    adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME']);
    await pause(400);
    adb(['shell', 'am', 'start', '-n', component]);
    await requireTheme('dark', 'dark');
    await capture('faq-dark-after-resume', 'dark');
    adb(['shell', 'am', 'force-stop', app]);
    adb(['shell', 'am', 'start', '-n', component]);
    await connect();
    await ready();
    await requireTheme('dark', 'dark');
    await capture('signin-dark-after-cold-relaunch', 'dark');
    scenarios.push('Manual dark appearance persists across background/resume and process relaunch.');

    hold = await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {const dispatch=window.dispatchEvent.bind(window);window.dispatchEvent=event => event.type==='pinevela:app-ready'?true:dispatch(event);window.__releasePineVelaStartup=()=>dispatch(new Event('pinevela:app-ready'));})();` });
    await send('Page.reload', { ignoreCache: true });
    await until(`document.querySelector('.login-credentials-form') && document.querySelector('#pv-app-launch img')?.complete`, 'Held loader');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.pv-app-launch-icon')).backgroundColor`), 'rgba(0, 0, 0, 0)');
    assert.ok(await evaluate(`document.querySelector('.pv-app-launch-icon').naturalWidth > 0`));
    const held = { captureMethod: 'Deterministic diagnostic hold of the app-ready event after the real application rendered. Does not measure natural startup timing.' };
    await capture('startup-loader-dark-held', 'dark', held);
    await evaluate(`window.__releasePineVelaStartup()`);
    await until(`!document.querySelector('#pv-app-launch')`, 'Loader removal');
    await evaluate(`location.hash='/faq'`);
    await until(`document.querySelector('[role="switch"]')`, 'FAQ navigation');
    assert.equal(await evaluate(`!!document.querySelector('#pv-app-launch')`), false);
    await tapTheme();
    await requireTheme('light', 'light');
    await send('Page.navigate', { url: 'https://localhost/#/login' });
    await send('Page.reload', { ignoreCache: true });
    await until(`document.querySelector('.login-credentials-form') && document.querySelector('#pv-app-launch img')?.complete`, 'Light held loader');
    await capture('startup-loader-light-held', 'light', held);
    await evaluate(`window.__releasePineVelaStartup()`);
    await until(`!document.querySelector('#pv-app-launch')`, 'Light loader removal');
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hold.identifier }); hold = null;
    scenarios.push('Transparent logo loads, app-ready removes the initial loader once, and hash navigation does not recreate it. Loader screenshots use an explicit diagnostic event hold.');

    await chooseFromStorageAndReload('system');
    await evaluate(`location.assign('/terms.html')`);
    await until(`location.pathname==='/terms.html' && document.querySelector('article')`, 'Local Terms');
    adb(['shell', 'cmd', 'uimode', 'night', 'yes']);
    await requireTheme('dark', 'system');
    await capture('terms-system-dark', 'dark');
    scenarios.push('Bundled policy content and physical bars follow an actual system theme change.');

    const overlays = adb(['shell', 'cmd', 'overlay', 'list']).toString();
    if (overlays.includes('com.android.internal.systemui.navbar.threebutton')) {
      adb(['shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.threebutton']);
      await pause(1500);
      // Android can recreate the Activity/WebView for a resource-overlay change.
      await connect();
      await requireTheme('dark', 'system');
      await capture('dark-three-button-navigation', 'dark', { diagnosticReconnectedAfterAndroidResourceOverlayChange: true });
      scenarios.push('Dark background remains correct with Android three-button navigation.');
    }
    assert.deepEqual(exceptions, []);
    const report = { passed: true, date: new Date().toISOString(), installedApk: true, installedApkSha256, buildVariant: variant, androidApi: adb(['shell', 'getprop', 'ro.build.version.sdk']).toString().trim(), webView: adb(['shell', 'dumpsys', 'package', 'com.google.android.webview']).toString().match(/versionName=([^\s]+)/)?.[1], scenarios, captures, uncaughtExceptions: exceptions.length, realGoogleOrCaptchaCompletion: false, physicalPhoneTested: false };
    await fs.writeFile(path.join(output, 'startup-appearance-result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ passed: true, scenarios: scenarios.length, screenshots: captures.length, output }));
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message.split('\n')[0] : '';
    const reason = /^[A-Za-z0-9_ ,():;.’'/-]{1,180}$/.test(message) ? message : 'Installed appearance check did not complete';
    await fs.writeFile(path.join(output, 'startup-appearance-result.json'), JSON.stringify({ passed: false, date: new Date().toISOString(), installedApkSha256, reason, scenarios, captures }, null, 2) + '\n').catch(() => {});
    throw error;
  } finally {
    if (originalNavigation) adb(['shell', 'cmd', 'overlay', 'enable-exclusive', '--category', originalNavigation]);
    adb(['shell', 'cmd', 'uimode', 'night', originalNight]);
    if (ws) {
      await pause(500);
      await connect().catch(() => {});
      if (hold) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: hold.identifier }).catch(() => {});
      await evaluate(`localStorage.setItem('pinevela:appearance','system')`).catch(() => {});
      await send('Page.navigate', { url: 'https://localhost/#/login' }).catch(() => {});
      await send('Page.reload', { ignoreCache: true }).catch(() => {});
      for (const waiter of pending.values()) clearTimeout(waiter.timer);
      ws.close();
    }
    try { adb(['forward', '--remove', 'tcp:' + port]); } catch {}
  }
})().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; });
