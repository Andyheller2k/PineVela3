/** Actual bundled Android UI and system-window checks; no account form submit. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { once } = require('node:events');
const { execFileSync } = require('node:child_process');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const app = 'app.pinevela.mobile.debug';
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const adbPath = path.join(process.env.ANDROID_HOME || '/home/wyse/Android/Sdk', 'platform-tools/adb');
  const output = path.resolve(process.env.PINEVELA_ANDROID_SAFE_AREA_OUTPUT || 'docs/verification/android-safe-area-2026-11-01/android');
  const port = 9242;
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 30000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  const pixels = () => execFileSync(adbPath, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 30000, maxBuffer: 24 * 1024 * 1024 });
  const pending = new Map(), scenes = [], exceptions = [];
  let ws, sequence = 0, savedAppearance, stage = 'prepare';
  const original = {
    size: adb(['shell', 'wm', 'size']).match(/Override size: (\d+x\d+)/)?.[1] || null,
    density: adb(['shell', 'wm', 'density']).match(/Override density: (\d+)/)?.[1] || null,
    autoRotate: adb(['shell', 'settings', 'get', 'system', 'accelerometer_rotation']).trim(),
    rotation: adb(['shell', 'settings', 'get', 'system', 'user_rotation']).trim(),
    night: adb(['shell', 'cmd', 'uimode', 'night']).trim(),
    showImeWithHardwareKeyboard: adb(['shell', 'settings', 'get', 'secure', 'show_ime_with_hard_keyboard']).trim(),
    navigation: adb(['shell', 'cmd', 'overlay', 'list']).match(/\[x\] (com\.android\.internal\.systemui\.navbar\.\S+)/)?.[1],
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    assert(!result.exceptionDetails, 'Local diagnostic evaluation succeeds');
    return result.result.value;
  };
  const until = async (expression, label, timeout = 30000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      if (await evaluate(`Boolean(${expression})`)) return;
      await pause(150);
    }
    throw Error(label + ' did not settle');
  };
  const connect = async () => {
    ws?.close();
    let target;
    for (let attempt = 0; attempt < 160 && !target; attempt++) {
      try {
        const pid = adb(['shell', 'pidof', app]).trim().split(/\s+/)[0];
        if (pid) {
          adb(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]);
          target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => t.type === 'page' && t.url.startsWith('https://localhost'));
        }
      } catch {}
      if (!target) await pause(200);
    }
    assert(target, 'Installed app exposes its actual bundled WebView');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1'));
    await once(ws, 'open');
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push('Uncaught WebView exception');
      const waiter = pending.get(message.id); if (!waiter) return;
      clearTimeout(waiter.timer); pending.delete(message.id);
      message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
    });
    await send('Runtime.enable'); await send('Page.enable');
  };
  const load = async (url, selector) => {
    await send('Page.navigate', { url });
    await until(`document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('#pv-app-launch')`, 'Local route ' + url, 60000);
    await evaluate(`(async()=>{await document.fonts.ready;dispatchEvent(new Event('resize'));dispatchEvent(new PageTransitionEvent('pageshow'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()`);
    await pause(180);
  };
  const checkDocument = async (name, theme, geometry, header, footer, screenshot) => {
    stage = name;
    const data = await evaluate(`(()=>{
      const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
      const probe=document.createElement('div');probe.style.cssText='position:fixed;inset:0;pointer-events:none;visibility:hidden';document.body.append(probe);const fixed=rect(probe);probe.remove();
      return {url:location.origin+location.pathname+location.hash,theme:document.documentElement.dataset.theme,viewport:[...document.querySelectorAll('meta[name=viewport]')].at(-1)?.content,innerWidth,innerHeight,ratio:devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,header:rect(document.querySelector(${JSON.stringify(header)})),fixed};
    })()`);
    assert.match(data.viewport, /viewport-fit=contain/);
    assert(!data.viewport.includes('viewport-fit=cover'));
    assert.equal(data.theme, theme);
    assert(data.scrollWidth <= data.innerWidth + 1, name + ': no horizontal page overflow');
    assert(Math.abs(data.innerWidth * data.ratio - geometry.width) <= 4, name + ': CSS width matches contained physical WebView');
    assert(Math.abs(data.innerHeight * data.ratio - geometry.height) <= 4, name + ': CSS height matches contained physical WebView');
    assert(data.header && data.header.top >= -1 && data.header.bottom <= data.innerHeight + 1, name + ': header lies in safe viewport');
    assert(Math.abs(data.fixed.top) < 1 && Math.abs(data.fixed.left) < 1 && Math.abs(data.fixed.bottom - data.innerHeight) < 1 && Math.abs(data.fixed.right - data.innerWidth) < 1,
      name + ': fixed full-screen overlay coordinates are contained too');
    if (footer) {
      await evaluate(`document.querySelector(${JSON.stringify(footer)}).scrollIntoView({block:'end'})`);
      await pause(180);
      data.footer = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(footer)}).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,viewportHeight:innerHeight}})()`);
      assert(data.footer.top >= 0 && data.footer.bottom <= data.footer.viewportHeight + 1, name + ': footer is reachable above Android navigation');
    }
    if (screenshot) await fs.writeFile(path.join(output, name + '.png'), pixels());
    scenes.push({ name, ...data, nativeWebView: geometry, screenshot: screenshot ? name + '.png' : undefined });
    console.log('PASS ' + name);
  };
  const physicalGeometry = async name => {
    // Welcome-only hierarchy: no private dashboard fields are inspected.
    adb(['shell', 'uiautomator', 'dump', '/sdcard/pinevela-safe-area-ui.xml']);
    const xml = adb(['shell', 'cat', '/sdcard/pinevela-safe-area-ui.xml']);
    const bounds = [...xml.matchAll(/<node\b[^>]*class="android\.webkit\.WebView"[^>]*>/g)].map(([node]) => node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)).filter(Boolean)
      .map(m => ({ left: +m[1], top: +m[2], right: +m[3], bottom: +m[4], width: +m[3] - +m[1], height: +m[4] - +m[2] }))[0];
    // The first node is Android's physical WebView. Its nested accessibility
    // virtual-document node can round CSS dimensions a couple of pixels beyond
    // the physical clipping bounds and is not the native view geometry.
    assert(bounds && bounds.width > 0 && bounds.height > 0, 'Native hierarchy contains the physical WebView');
    const windows = adb(['shell', 'dumpsys', 'window']);
    const sources = [...windows.matchAll(/type=(statusBars|navigationBars|displayCutout) frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/g)]
      .map(m => ({ type: m[1], left: +m[2], top: +m[3], right: +m[4], bottom: +m[5] })).filter((v,i,a)=>a.findIndex(w=>JSON.stringify(w)===JSON.stringify(v))===i);
    const overlap = source => Math.min(bounds.right, source.right) > Math.max(bounds.left, source.left) && Math.min(bounds.bottom, source.bottom) > Math.max(bounds.top, source.top);
    const relevant = sources.filter(s => s.right > s.left && s.bottom > s.top);
    assert(relevant.some(s => s.type === 'statusBars') && relevant.some(s => s.type === 'navigationBars'));
    for (const source of relevant) assert(!overlap(source), name + ': physical WebView never overlaps ' + source.type);
    await fs.writeFile(path.join(output, name + '-native-geometry.json'), JSON.stringify({ bounds, sources: relevant }, null, 2) + '\n');
    await fs.writeFile(path.join(output, name + '-welcome-ui.xml'), xml);
    return bounds;
  };
  await fs.mkdir(output, { recursive: true });
  try {
    const packagePath = adb(['shell', 'pm', 'path', app]).trim();
    assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(packagePath));
    const installedApkSha256 = adb(['shell', 'sha256sum', packagePath.slice(8)]).match(/^[a-f0-9]{64}/)?.[0];
    assert.equal(installedApkSha256, crypto.createHash('sha256').update(await fs.readFile('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex'));
    adb(['shell', 'am', 'start', '-n', app + '/app.pinevela.mobile.MainActivity']);
    await connect(); await load('https://localhost/', '[data-native-welcome]');
    savedAppearance = await evaluate(`localStorage.getItem('pinevela:appearance')`);
    const webViewPackage = adb(['shell', 'dumpsys', 'webviewupdate']).split('\n').find(line => line.includes('Current WebView package'))?.trim();
    adb(['shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0']);
    const configurations = process.env.PINEVELA_ANDROID_SAFE_AREA_SMOKE === '1'
      ? [{name:'original-phone',size:null,density:null,rotation:0}]
      : [{name:'compact-phone',size:'1080x1920',density:'480',rotation:0},
         {name:'tall-phone',size:'1080x2400',density:'440',rotation:0},
         {name:'phone-landscape',size:'1080x2400',density:'440',rotation:1},
         {name:'tablet-window',size:'1200x1920',density:'240',rotation:0}];
    for (const configuration of configurations) {
      for (const navigation of ['gestural','threebutton']) {
        stage = configuration.name + '-' + navigation;
        adb(['shell', 'wm', 'size', configuration.size || original.size || 'reset']);
        adb(['shell', 'wm', 'density', configuration.density || original.density || 'reset']);
        adb(['shell', 'settings', 'put', 'system', 'user_rotation', String(configuration.rotation)]);
        adb(['shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.' + navigation]);
        await pause(1800); await connect();
        await load('https://localhost/', '[data-native-welcome]');
        const geometry = await physicalGeometry(stage);
        for (const theme of ['light','dark']) {
          await load('https://localhost/#/login', '[data-native-welcome]');
          if (await evaluate(`document.documentElement.dataset.theme`) !== theme)
            await evaluate(`document.querySelector('.native-welcome [role="switch"]').click()`);
          await until(`document.querySelector('[data-native-welcome]') && document.documentElement.dataset.theme===${JSON.stringify(theme)} && !document.querySelector('#pv-app-launch')`, 'Themed welcome');
          const prefix = configuration.name + '-' + navigation + '-' + theme;
          await checkDocument(prefix + '-welcome', theme, geometry, '.native-welcome-header', '.native-welcome-footer', true);
          await load('https://localhost/#/login?mode=login', '.login-credentials-form');
          await checkDocument(prefix + '-login', theme, geometry, '.login-header', '.login-footer', configuration.name === 'compact-phone');
          await load('https://localhost/#/login?mode=register', '.login-signup-form');
          await checkDocument(prefix + '-signup', theme, geometry, '.login-header', '.login-footer', configuration.name === 'compact-phone');
          if (configuration.name === 'compact-phone' && navigation === 'threebutton' && theme === 'light') {
            stage = prefix + '-actual-keyboard';
            adb(['shell','settings','put','secure','show_ime_with_hard_keyboard','1']);
            const target = await evaluate(`(()=>{const input=document.querySelector('.login-signup-form input[type="password"]');input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,height:innerHeight,ratio:devicePixelRatio}})()`);
            adb(['shell','input','tap',String(Math.round(geometry.left+target.x*target.ratio)),String(Math.round(geometry.top+target.y*target.ratio))]);
            await until(`innerHeight < ${target.height - 80}`, 'Actual Android keyboard shrinks safe viewport');
            await pause(500);
            const windowInfo = adb(['shell','dumpsys','window']);
            const ime = [...windowInfo.matchAll(/type=ime frame=\[(\d+),(\d+)\]\[(\d+),(\d+)\]/g)].map(m=>({left:+m[1],top:+m[2],right:+m[3],bottom:+m[4]})).find(r=>r.bottom>r.top);
            assert(ime,'Android reports the actual IME frame');
            const keyboardView = await evaluate(`({innerHeight,ratio:devicePixelRatio,meta:document.querySelector('meta[name=viewport]').content})`);
            assert(geometry.top+keyboardView.innerHeight*keyboardView.ratio <= ime.top+4,'WebView stops above the actual keyboard');
            await fs.writeFile(path.join(output,stage+'.png'),pixels());
            scenes.push({name:stage,actualIme:true,ime,keyboardView,originalView:geometry,submitted:false,screenshot:stage+'.png'});
            console.log('PASS '+stage);
            adb(['shell','input','keyevent','KEYCODE_BACK']);
            await until(`Math.abs(innerHeight - ${target.height}) < 2`,'Keyboard dismiss restores safe viewport');
          }
          if (configuration.name === 'tall-phone') {
            await load('https://localhost/#/faq', '.faq-search');
            await checkDocument(prefix + '-faq', theme, geometry, '[data-support-header]', null, true);
            await load('https://localhost/#/help', '.support-surface textarea');
            await checkDocument(prefix + '-help', theme, geometry, '[data-support-header]', null, true);
            for (const policy of ['privacy', 'terms']) {
              await load('https://localhost/' + policy + '.html', '.document');
              await checkDocument(prefix + '-' + policy, theme, geometry, '.site-header', 'footer', true);
            }
          }
        }
      }
    }
    assert.equal(exceptions.length, 0, 'No uncaught WebView exception');
    const report = { passed:true, date:new Date().toISOString(), installedApkSha256, actualAndroidWebView:true, webViewPackage,
      scenes, sceneCount:scenes.length, accountFormsSubmitted:false, paymentActionsSubmitted:false,
      accountDataCleared:false, privateAccountFieldsInspected:false, physicalPhoneTested:false,
      newerWebViewInstalled:false, limitations:['Runtime checks use the existing emulator WebView package. Modern WebView branch independence is additionally established by contained document meta, plugin configuration, and production inset-listener instrumentation.'] };
    await fs.writeFile(path.join(output,'ui-result.json'),JSON.stringify(report,null,2)+'\n');
    await fs.rm(path.join(output,'ui-failure.json'),{force:true});
    console.log(JSON.stringify({passed:true,scenes:scenes.length,installedApkSha256}));
  } catch(error) {
    let state;try{state=await evaluate(`({url:location.origin+location.pathname+location.hash,theme:document.documentElement.dataset.theme,welcome:!!document.querySelector('[data-native-welcome]'),form:!!document.querySelector('.login-auth-card'),meta:document.querySelector('meta[name=viewport]')?.content})`);}catch{}
    await fs.writeFile(path.join(output,'ui-failure.json'),JSON.stringify({passed:false,stage,message:String(error.message),state,scenes:scenes.map(s=>s.name)},null,2)+'\n');
    throw error;
  } finally {
    adb(['shell','wm','size',original.size||'reset']); adb(['shell','wm','density',original.density||'reset']);
    adb(['shell','settings','put','system','user_rotation',original.rotation]); adb(['shell','settings','put','system','accelerometer_rotation',original.autoRotate]);
    if(original.showImeWithHardwareKeyboard==='null') adb(['shell','settings','delete','secure','show_ime_with_hard_keyboard']);
    else adb(['shell','settings','put','secure','show_ime_with_hard_keyboard',original.showImeWithHardwareKeyboard]);
    if(original.navigation) adb(['shell','cmd','overlay','enable-exclusive','--category',original.navigation]);
    await pause(1200);
    try {
      await connect(); await load('https://localhost/', '[data-native-welcome]');
      if(savedAppearance!==undefined) await evaluate(savedAppearance===null?`localStorage.removeItem('pinevela:appearance')`:`localStorage.setItem('pinevela:appearance',${JSON.stringify(savedAppearance)})`);
      await send('Page.reload',{ignoreCache:true});
      await until(`document.querySelector('[data-native-welcome]')&&!document.querySelector('#pv-app-launch')`,'Restored native welcome');
    } finally { ws?.close(); for(const waiter of pending.values())clearTimeout(waiter.timer); try{adb(['forward','--remove',`tcp:${port}`]);}catch{} }
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
