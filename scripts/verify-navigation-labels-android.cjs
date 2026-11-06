/** Installed bundled Android navigation with isolated, read-only UI fixtures.
 * Every transport request is answered locally inside the WebView. Appearance
 * and SystemBars keep their real native bridge; no production account is used.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { once } = require('node:events');
const sharp = require('sharp');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

const fixtureScript = (role, theme) => `(() => {
  const role=${JSON.stringify(role)}, theme=${JSON.stringify(theme)};
  const legal={accepted:true,document:{version:'2026-10-27',href:'/legal/terms-2026-10-27.html',privacyHref:'/privacy.html'}};
  const user={id:'navigation-fixture-'+role,role,name:'Navigation fixture '+role,email:'navigation-fixture-'+role+'@pinevela.invalid',isVerified:true,hasCustomerServiceAccess:true,hasApprovedHostel:false,legal};
  const json=(value,status=200)=>({status,headers:{'Content-Type':'application/json'},bodyBase64:btoa(unescape(encodeURIComponent(JSON.stringify(value))))});
  window.__navigationFixtureRequests=[];window.__navigationFixtureWrites=[];window.__navigationFixtureNoops=[];
  const request=options=>{
    const route=new URL(options.path,'https://localhost').pathname;
    window.__navigationFixtureRequests.push(route);
    if(options.method==='POST'&&route==='/api/manager/welcome/ensure'){window.__navigationFixtureNoops.push(route);return json({created:false});}
    if(options.method!=='GET'){window.__navigationFixtureWrites.push(route);return json({},405);}
    const store={id:'navigation-fixture-store',storeName:'Campus fixture store',category:'Education',location:'Campus',description:'Read-only navigation fixture.',subscriptionPlan:'default',ratingCount:0,setupCompleted:true,registrationFeePaid:true,username:'navigation-fixture',phone:'+233241234567',phoneCountry:'GH',deliveryMode:'Campus Meetup'};
    const values={
      '/api/auth/me':user,'/api/legal/status':legal,'/api/auth/appearance':{theme},
      '/api/settings':{maintenanceMode:false,contactDetails:{},registrationFee:0,semesterFee:0,commission:0,subscriptionPrices:{default:0,star:0,pro:0}},
      '/api/auth/account-access':{restrictions:[]},'/api/auth/maintenance-notice':{serverTime:new Date().toISOString(),notice:null},
      '/api/student/my-profile':{user,rooms:[]},'/api/student/my-rooms':{rooms:[]},'/api/manager/my-hostel':{hostel:null},
      '/api/users/my-registered-accounts':{managerAccount:null,residentAccount:null,merchantAccount:null},
      '/api/users/manager-onboarding':{registrations:{managerAccount:null},policy:{googleManagerEnrollment:false},enrollments:[],access:{restriction:null,serverTime:new Date().toISOString()}},
      '/api/digital-market/status':{application:role==='merchant'?{id:'navigation-fixture-application',status:'approved',storeName:store.storeName}:null,store:role==='merchant'?store:null},
      '/api/digital-market/my-orders':{orders:[],nextCursor:null,hasMore:false,summary:{total:0,pending:0,completed:0,revenue:0},customers:[]},
      '/api/admin/dashboard-directories':{residences:[],managerRestrictions:[],boardRequests:[],activities:[],digitalMarketApps:[],digitalMarketStores:[],paymentRecords:[],allUsersData:{totalUsers:0,breakdown:{},users:[]}},
      '/api/customer-service/tickets':{tickets:[],members:[],hasMore:false,emailConfigured:true},
      '/api/staff':role==='staff'?[{id:user.id,userId:user.id,name:user.name,email:user.email,role:'Maintenance',status:'Active',hostelName:'Fixture residence',hostelId:'navigation-fixture-residence',managerId:'navigation-fixture-manager'}]:[],
      '/api/companion':{preferences:{companion:'nova',responseStyle:'balanced',interests:'',reminders:true,aiEnabled:false},firstName:'Fixture',turns:[],available:false},
    };
    if(Object.hasOwn(values,route))return json(values[route]);
    const lists=['/api/notifications','/api/auth/enrollments','/api/hostels','/api/digital-market/products','/api/digital-market/inventory','/api/admin-messages/pending','/api/issue-reports','/api/staff/invitations','/api/staff-bargains','/api/board-requests','/api/activities','/api/room-keys','/api/manager-verifications','/api/admin/verification-inspections','/api/verification-teams','/api/verification-team/my-inspections','/api/digital-market/conversations'];
    return lists.includes(route)?json([]):json({},404);
  };
  const hooked=new WeakSet();let capacitor=window.Capacitor;
  const hook=cap=>{
    if(!cap||hooked.has(cap))return cap;hooked.add(cap);
    let nativePromise=cap.nativePromise,nativeCallback=cap.nativeCallback;
    const promise=async(plugin,method,options={})=>{
      if(plugin==='PineVelaTransport')return method==='request'?request(options):{pending:false};
      if(plugin==='PineVelaAppearance'||plugin==='SystemBars')return nativePromise.call(cap,plugin,method,options);
      throw Error('Native fixture denied an unexpected plugin.');
    };
    Object.defineProperty(cap,'nativePromise',{configurable:true,get:()=>promise,set:value=>{nativePromise=value;}});
    Object.defineProperty(cap,'nativeCallback',{configurable:true,get:()=> (plugin,method,options,callback)=>plugin==='PineVelaTransport'?'navigation-fixture-listener':nativeCallback.call(cap,plugin,method,options,callback),set:value=>{nativeCallback=value;}});
    return cap;
  };
  capacitor=hook(capacitor);
  Object.defineProperty(window,'Capacitor',{configurable:true,get:()=>capacitor,set:value=>{capacitor=hook(value);}});
  localStorage.setItem('pinevela:appearance',theme);
})()`;

(async () => {
  const app = 'app.pinevela.mobile.transporttest';
  const serial = process.env.PINEVELA_ANDROID_SERIAL || 'emulator-5554';
  const adbPath = path.join(process.env.ANDROID_HOME || '/home/wyse/Android/Sdk', 'platform-tools/adb');
  const output = path.resolve(process.env.PINEVELA_ANDROID_NAV_OUTPUT || 'docs/verification/navigation-labels-sidebar-2026-11-04/android');
  const port = 9253;
  const adb = args => execFileSync(adbPath, ['-s', serial, ...args], { timeout: 30000, maxBuffer: 20 * 1024 * 1024 });
  let ws, sequence = 0, seedScript, savedAppearance, savedUrl, installedApkSha256;
  const pending = new Map(), scenes = [], exceptions = [], motionChecks = [], actualAdbTaps = [];
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error(method + ' timed out')); }, 30000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!result.exceptionDetails, 'WebView diagnostic evaluation succeeds');
    return result.result.value;
  };
  const until = async (expression, label) => {
    const end = Date.now() + 60000;
    while (Date.now() < end) { if (await evaluate(`Boolean(${expression})`)) return; await pause(150); }
    throw Error(label + ' did not settle');
  };
  const attach = async () => {
    let target;
    for (let attempt = 0; attempt < 120 && !target; attempt++) {
      try {
        const pid = adb(['shell', 'pidof', app]).toString().trim().split(/\s+/)[0];
        if (pid) { adb(['forward', `tcp:${port}`, `localabstract:webview_devtools_remote_${pid}`]); target = (await fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json())).find(t => { if (t.type !== 'page' || !t.url.startsWith('https://localhost')) return false; const d=JSON.parse(t.description || '{}'); return d.attached===true && d.empty===false && d.height>0 && d.width>0; }); }
      } catch {}
      if (!target) await pause(200);
    }
    assert(target, 'Isolated installed app exposes its bundled WebView');
    ws = new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/, '127.0.0.1')); await once(ws, 'open');
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') exceptions.push('Uncaught WebView exception');
      const waiter = pending.get(message.id); if (!waiter) return;
      clearTimeout(waiter.timer); pending.delete(message.id);
      message.error ? waiter.reject(Error(message.error.message)) : waiter.resolve(message.result);
    });
    await send('Runtime.enable'); await send('Page.enable');
  };
  const load = async (role, theme, route) => {
    if (seedScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScript });
    seedScript = (await send('Page.addScriptToEvaluateOnNewDocument', { source: fixtureScript(role, theme) })).identifier;
    await send('Page.navigate', { url: 'https://localhost/?navigation-fixture=' + role + '-' + theme + '#' + route });
    await until(`document.querySelector('.pv-bottom-navigation') && document.documentElement.dataset.mobileNavigation==='true' && !document.querySelector('#pv-app-launch')`, role + ' navigation');
    // Use the existing close control, never accept a legal document or form.
    await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]')?.click()`);
    await evaluate(`document.fonts.ready`); await pause(700);
  };
  const capture = async (name, theme) => {
    await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
    const measurements = await evaluate(`(() => {
      const nav=document.querySelector('.pv-bottom-navigation'),r=nav.getBoundingClientRect(),s=getComputedStyle(nav),indicator=nav.querySelector('.pv-nav-indicator'),bubble=indicator.getBoundingClientRect(),surface=nav.querySelector('.pv-nav-surface'),side=nav.querySelector('.pv-nav-side-highlight'),selected=nav.querySelector('[data-nav-selected="true"] .pv-nav-icon');
      const paint=e=>e?{background:getComputedStyle(e).backgroundColor,color:getComputedStyle(e).color,transitionDuration:getComputedStyle(e).transitionDuration,rect:{left:e.getBoundingClientRect().left,top:e.getBoundingClientRect().top,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}}:null;
      return {theme:document.documentElement.dataset.theme,w:innerWidth,h:innerHeight,ratio:devicePixelRatio,overflow:document.documentElement.scrollWidth>innerWidth+1,
        viewport:document.querySelector('meta[name=viewport]').content,nav:{x:r.x,y:r.y,width:r.width,bottom:r.bottom,height:r.height,background:s.getPropertyValue('--pv-nav-background').trim(),accent:s.getPropertyValue('--pv-nav-accent').trim(),variant:nav.dataset.curvedNavigation,duration:s.getPropertyValue('--pv-nav-duration').trim()},surface:paint(surface),sideHighlight:paint(side),selectedIcon:paint(selected),
        bubble:{left:bubble.left,top:bubble.top,width:bubble.width,height:bubble.height,visible:getComputedStyle(indicator).visibility!=='hidden'},
        buttons:[...nav.querySelectorAll('[data-mobile-nav-items] button')].map(b=>{const l=b.querySelector('.pv-nav-label'),i=b.querySelector('.pv-nav-icon'),r=l.getBoundingClientRect(),ir=i.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(l);const t=range.getBoundingClientRect(),cs=getComputedStyle(l);return{id:b.dataset.navigationId,current:b.getAttribute('aria-current'),disabled:b.disabled,caption:{top:r.top,bottom:r.bottom,iconBottom:ir.bottom,textTop:t.top,textBottom:t.bottom,color:cs.color,transform:cs.transform,visible:cs.visibility!=='hidden'&&Number(cs.opacity)>0,foreground:document.elementFromPoint(t.x+t.width/2,t.y+t.height/2)?.closest('button')===b}}}),
        deniedWrites:window.__navigationFixtureWrites.length,fixtureNoops:window.__navigationFixtureNoops.length,fixtureReads:window.__navigationFixtureRequests.length};
    })()`);
    assert.equal(measurements.theme, theme); assert(!measurements.overflow, name + ': no horizontal overflow');
    assert(measurements.viewport.includes('viewport-fit=contain'), 'Native containment stays enabled');
    assert(Math.abs(measurements.nav.x) < 1 && Math.abs(measurements.nav.width - measurements.w) < 1, 'Navigation spans the contained width');
    assert(Math.abs(measurements.nav.bottom - measurements.h) < 1, 'Navigation touches the native bottom edge');
    assert.equal(measurements.deniedWrites, 0, 'Read-only navigation scenario makes no mutation');
    assert.equal(parseFloat(measurements.nav.duration)*(measurements.nav.duration.endsWith('ms')?1:1000),250,name+': shared motion duration is 250ms');
    if(measurements.nav.variant==='action') {
      assert.equal(measurements.sideHighlight.background,theme==='dark'?'rgb(255, 214, 10)':'rgb(0, 53, 102)',name+': action side highlight is a solid theme accent');
      if(measurements.selectedIcon)assert.equal(measurements.selectedIcon.color,theme==='dark'?'rgb(0, 29, 61)':'rgb(255, 255, 255)',name+': selected side icon contrasts with solid accent');
    }
    for(const b of measurements.buttons){
      assert(b.caption.visible&&b.caption.foreground,name+': '+b.id+' label paints in the foreground');
      assert(b.caption.top>=b.caption.iconBottom+3&&b.caption.bottom<=measurements.nav.bottom+1,name+': '+b.id+' caption has a separate row within the navigation');
      assert(b.caption.textTop>=b.caption.top-1&&b.caption.textBottom<=b.caption.bottom+1,name+': '+b.id+' glyphs are not vertically clipped');
      assert.equal(b.caption.transform,'none',name+': '+b.id+' caption stays still');
    }
    const windows = adb(['shell', 'dumpsys', 'window']).toString();
    const top = windows.match(/type=statusBars frame=\[0,0\]\[(\d+),(\d+)\]/), bottom = windows.match(/type=navigationBars frame=\[0,(\d+)\]\[(\d+),(\d+)\]/);
    assert(top && bottom, 'Portrait system bar geometry is available');
    let bytes, bottomRgb, topRgb, bubbleRgb,sideHighlightRgb;
    const expectedAccent = theme === 'dark' ? [255, 214, 10] : [0, 53, 102];
    for (let attempt=0;attempt<12;attempt++) {
      bytes=adb(['exec-out','screencap','-p']);
      const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const pixel=(x,y)=>Array.from(data.subarray((y*info.width+x)*4,(y*info.width+x)*4+3));
      const x=Math.floor(info.width*.12);
      bottomRgb=pixel(x,Math.floor((+bottom[1]+ +bottom[3])/2));topRgb=pixel(x,Math.max(1,Math.floor(+top[2]/4)));
      bubbleRgb=pixel(Math.round((measurements.bubble.left+measurements.bubble.width*.2)*measurements.ratio),Math.round(+top[2]+(measurements.bubble.top+measurements.bubble.height*.5)*measurements.ratio));
      if(measurements.sideHighlight){const r=measurements.sideHighlight.rect;sideHighlightRgb=pixel(Math.round((r.left+4)*measurements.ratio),Math.round(+top[2]+(r.top+r.height*.5)*measurements.ratio));}
      if((!measurements.bubble.visible||JSON.stringify(bubbleRgb)===JSON.stringify(expectedAccent))&&(!measurements.sideHighlight||JSON.stringify(sideHighlightRgb)===JSON.stringify(expectedAccent)))break;
      // Physical compositor frames can trail DOM measurements on older WebView.
      // Require the real highlighted circle to reach its measured screen point.
      await pause(250);
    }
    await fs.writeFile(path.join(output,name+'.png'),bytes);
    if(measurements.bubble.visible)assert.deepEqual(bubbleRgb,expectedAccent,name+': physical highlighted circle reaches its measured viewport position');
    if(measurements.sideHighlight)assert.deepEqual(sideHighlightRgb,expectedAccent,name+': physical selected side highlight is solid accent');
    assert.deepEqual(bottomRgb, theme === 'dark' ? [0, 53, 102] : [255, 255, 255], name + ': OS navigation area matches app bar');
    assert.deepEqual(topRgb, theme === 'dark' ? [0, 29, 61] : [255, 255, 255], name + ': status background stays consistent');
    scenes.push({ name, ...measurements, pixels: { topRgb, bottomRgb, bubbleRgb,sideHighlightRgb }, screenshot: name + '.png' }); console.log('PASS ' + name);
  };
  const verifyCompositorMotion=async(theme)=>{
    const motion=await evaluate(`(async()=>{
      const nav=document.querySelector('.pv-bottom-navigation'),surface=nav.querySelector('.pv-nav-surface'),indicator=nav.querySelector('.pv-nav-indicator'),items=[...nav.querySelectorAll('[data-navigation-id]')],current=items.find(b=>b.getAttribute('aria-current')==='page'),target=items.find(b=>b!==current&&!b.disabled),pathBefore=surface.querySelector('path').getAttribute('d');
      const before=indicator.getBoundingClientRect().left;
      current?.removeAttribute('aria-current');target.setAttribute('aria-current','page');await new Promise(resolve=>queueMicrotask(resolve));
      surface.getBoundingClientRect();indicator.getBoundingClientRect();
      const duration=e=>getComputedStyle(e).transitionDuration.split(',').map(x=>Number.parseFloat(x)*1000);
      const result={before,target:target.dataset.navigationId,cssDuration:getComputedStyle(nav).getPropertyValue('--pv-nav-duration').trim(),surfaceDurations:duration(surface),indicatorDurations:duration(indicator),iconDurations:duration(target.querySelector('.pv-nav-icon')),surfaceAnimations:surface.getAnimations().map(a=>a.effect.getTiming().duration),indicatorAnimations:indicator.getAnimations().map(a=>a.effect.getTiming().duration),sameNotchPath:surface.querySelector('path').getAttribute('d')===pathBefore,inlinePlaneTransform:surface.style.transform};
      await new Promise(resolve=>setTimeout(resolve,400));result.after=indicator.getBoundingClientRect().left;result.finalTarget=nav.dataset.activeDestination;return result;
    })()`);
    assert.equal(parseFloat(motion.cssDuration)*(motion.cssDuration.endsWith('ms')?1:1000),250);assert(motion.surfaceDurations.includes(250)&&motion.indicatorDurations.includes(250)&&motion.iconDurations.includes(250),'Real WebView plane, circle and icons use 250ms transform transitions');
    assert(motion.sameNotchPath,'Tab movement keeps a fixed SVG notch path and moves its plane');assert.match(motion.inlinePlaneTransform,/^translate3d\(/);assert(Math.abs(motion.after-motion.before)>10,'Real native WebView moves the highlighted circle');
    for(const d of [...motion.surfaceAnimations,...motion.indicatorAnimations])assert.equal(d,250,'Active compositor transition duration is 250ms');
    motionChecks.push({theme,...motion});console.log('PASS '+theme+' 250ms compositor navigation');
  };
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.rm(path.join(output,'verified.json'),{force:true});
    await fs.rm(path.join(output,'failure.json'),{force:true});
    await fs.rm(path.join(output,'failure.png'),{force:true});
    const packagePath = adb(['shell', 'pm', 'path', app]).toString().trim();
    assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(packagePath));
    installedApkSha256 = adb(['shell', 'sha256sum', packagePath.slice(8)]).toString().match(/^[a-f0-9]{64}/)?.[0];
    assert.equal(installedApkSha256, crypto.createHash('sha256').update(await fs.readFile('android/app/build/outputs/apk/transportTest/app-transportTest.apk')).digest('hex'));
    adb(['shell', 'am', 'start', '-n', app + '/app.pinevela.mobile.MainActivity']); await attach();
    savedAppearance = await evaluate(`localStorage.getItem('pinevela:appearance')`); savedUrl = await evaluate('location.href');
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    const pages = [
      ['user', '/user/dashboard'], ['merchant', '/digital-market'], ['student', '/resident/dashboard'], ['manager', '/manager/dashboard'],
      ['staff', '/staff/dashboard'], ['admin', '/admin/dashboard'], ['field_officer', '/field-officer'], ['support', '/customer-service'],
    ];
    for (const [name, route] of pages) for (const theme of ['light', 'dark']) {
      await load(name === 'support' ? 'user' : name, theme, route); await capture(name + '-' + theme, theme);
      if(name==='user'){
        for(const id of ['digital-market','login-room','options','home']){
          if(theme==='light'&&id==='digital-market'){
            // Exercise a real Android input event before using DOM clicks for
            // the remaining synthetic-account navigation coverage.
            const target=await evaluate(`(()=>{const b=document.querySelector('.pv-bottom-navigation [data-navigation-id="digital-market"]'),r=b.getBoundingClientRect();return{cssX:r.x+r.width/2,cssY:r.y+r.height/2,ratio:devicePixelRatio,enabled:!b.disabled,from:document.querySelector('.pv-bottom-navigation').dataset.activeDestination,hitOwnButton:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('button')===b}})()`);
            assert(target.enabled&&target.hitOwnButton,'Actual Android tap targets a visible enabled Purchases control');
            const windows=adb(['shell','dumpsys','window']).toString();
            const status=windows.match(/type=statusBars frame=\[0,0\]\[(\d+),(\d+)\]/);
            assert(status,'Contained Android viewport has a measured status-bar inset');
            const physicalX=Math.round(target.cssX*target.ratio),physicalY=Math.round(Number(status[2])+target.cssY*target.ratio);
            adb(['shell','uiautomator','dump','/sdcard/pinevela-navigation-hardware-tap.xml']);
            await fs.writeFile(path.join(output,'native-hierarchy-before-purchases-tap.xml'),adb(['exec-out','cat','/sdcard/pinevela-navigation-hardware-tap.xml']));
            adb(['shell','rm','/sdcard/pinevela-navigation-hardware-tap.xml']);
            adb(['shell','input','tap',String(physicalX),String(physicalY)]);
            await until(`document.querySelector('.pv-bottom-navigation')?.dataset.activeDestination==='digital-market'`,'Actual Android Purchases tap');
            actualAdbTaps.push({passed:true,package:app,theme,from:target.from,to:id,cssX:target.cssX,cssY:target.cssY,devicePixelRatio:target.ratio,statusInsetPixels:Number(status[2]),physicalX,physicalY,inputCommand:'adb shell input tap',screenshot:name+'-'+theme+'-selected-'+id+'.png',syntheticReadOnlyAccountFixture:true,productionWrites:0});
          }else{
            await evaluate(`document.querySelector('.pv-bottom-navigation [data-navigation-id="${id}"]').click()`);
          }
          await until(`document.querySelector('.pv-bottom-navigation')?.dataset.activeDestination==='${id}'`,'Actual tab selection');
          await pause(700);await capture(name+'-'+theme+'-selected-'+id,theme);
        }
      }
      if(name==='admin'){
        await evaluate(`document.querySelector('.pv-bottom-navigation [data-navigation-id="more"]').click()`);
        await until(`!!document.querySelector('[data-portal-navigation="menu"]')`,'More destinations');
        await evaluate(`document.querySelector('[data-portal-navigation="menu"] [data-navigation-id="settings"]').click()`);
        await until(`!document.querySelector('[data-portal-navigation="menu"]')&&document.querySelector('.pv-bottom-navigation')?.dataset.activeDestination==='more'`,'Secondary destination');
        await pause(700);await capture(name+'-'+theme+'-selected-more',theme);
      }
      if(name==='user'){
        if(theme==='light'){adb(['shell','uiautomator','dump','/sdcard/pinevela-navigation-fixture.xml']);await fs.writeFile(path.join(output,'native-hierarchy-user-light.xml'),adb(['exec-out','cat','/sdcard/pinevela-navigation-fixture.xml']));adb(['shell','rm','/sdcard/pinevela-navigation-fixture.xml']);}
        await verifyCompositorMotion(theme);
      }
      if (['merchant', 'student'].includes(name)) {
        const label = name === 'merchant' ? 'Publish' : 'Actions';
        await evaluate(`document.querySelector('[data-mobile-central-action]').click()`);
        await until(`!!document.querySelector('dialog')`, label + ' chooser');
        assert(await evaluate(`document.querySelector('dialog').getBoundingClientRect().bottom <= innerHeight + 1`), 'Action chooser fits the contained viewport');
        await fs.writeFile(path.join(output, name + '-' + theme + '-actions.png'), adb(['exec-out', 'screencap', '-p']));
        await evaluate(`document.querySelector('dialog [aria-label="Close dialog"]')?.click()`);
      }
    }
    assert.equal(exceptions.length, 0, 'No uncaught WebView exceptions');
    await fs.writeFile(path.join(output, 'verified.json'), JSON.stringify({ passed: true, installedApkSha256, actualInstalledAndroidWebView: true, realNativeAppearance: true, syntheticReadOnlyAccountFixtures: true, productionWrites: 0, debugSessionUntouched: true, scenes,motionChecks,actualAdbTaps }, null, 2) + '\n');
  } catch (error) {
    await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ passed: false, reason: error.message, installedApkSha256, scenes,actualAdbTaps }, null, 2) + '\n');
    try { await fs.writeFile(path.join(output, 'failure.png'), adb(['exec-out', 'screencap', '-p'])); } catch {}
    throw error;
  } finally {
    try {
      if (seedScript) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedScript });
      if (savedAppearance !== undefined) await evaluate(savedAppearance === null ? `localStorage.removeItem('pinevela:appearance')` : `localStorage.setItem('pinevela:appearance',${JSON.stringify(savedAppearance)})`);
      await send('Emulation.setEmulatedMedia', { features: [] });
      if (savedUrl) await send('Page.navigate', { url: savedUrl });
    } catch {}
    ws?.close(); for (const waiter of pending.values()) clearTimeout(waiter.timer);
    try { adb(['forward', '--remove', `tcp:${port}`]); } catch {}
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
