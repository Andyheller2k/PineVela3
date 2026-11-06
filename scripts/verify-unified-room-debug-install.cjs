/** Update the development app in place; retain data/auth state and do not reboot. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {once}=require('node:events');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const output=path.resolve('docs/verification/unified-room-login-2026-11-05/android');
 const apk=path.resolve(process.env.PINEVELA_INSTALL_APK||'releases/android/pinevela-unified-room-login-20261105.apk');
 const app='app.pinevela.mobile.debug',port=9254,serial='emulator-5554';
 const sdk=process.env.ANDROID_HOME||'/home/wyse/Android/Sdk';
 const adb=args=>execFileSync(path.join(sdk,'platform-tools/adb'),['-s',serial,...args],{timeout:40000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
 const text=args=>adb(args).toString().trim();
 const expected=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
 let ws,sequence=0;const pending=new Map();
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Entry-state diagnostic runs');return r.result.value;};
 const attach=async()=>{
  let target;
  for(let i=0;i<120&&!target;i++){
   try{const pid=text(['shell','pidof',app]).split(/\s+/)[0];if(pid){adb(['forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`]);target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>{if(t.type!=='page'||!t.url.startsWith('https://localhost'))return false;const d=JSON.parse(t.description||'{}');return d.attached===true&&d.empty===false&&d.width>0&&d.height>0;});}}catch{}
   if(!target)await pause(250);
  }
  assert(target,'Actual updated bundled WebView is attached and nonempty');ws=new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/,'127.0.0.1'));await once(ws,'open');
  ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
  await send('Runtime.enable');await send('Page.enable');
 };
 try{
  await fs.mkdir(output,{recursive:true});
  const previousLocation=text(['shell','pm','path',app]);
  const previousDebugSha256=/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(previousLocation)?text(['shell','sha256sum',previousLocation.slice(8)]).match(/^[a-f0-9]{64}/)?.[0]:null;
  assert(text(['install','-r',apk]).endsWith('Success'),'Development update installs in place');
  const location=text(['shell','pm','path',app]);assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(location));
  const installed=text(['shell','sha256sum',location.slice(8)]).match(/^[a-f0-9]{64}/)?.[0];assert.equal(installed,expected,'Installed debug APK matches persistent release');
  adb(['shell','am','start','-n',app+'/app.pinevela.mobile.MainActivity']);await attach();
  const end=Date.now()+80000;let ready=false;
  while(Date.now()<end){ready=await evaluate(`!document.querySelector('#pv-app-launch')&&!!document.querySelector('[data-native-welcome],.login-credentials-form,.pv-bottom-navigation')`);if(ready)break;await pause(300);}
  assert(ready,'Updated development app preserves its normal entry/account screen');
  await evaluate('document.fonts.ready');await pause(3000);
  const ui=await evaluate(`(()=>{const h=document.querySelector('.native-welcome-header,.login-header,[data-portal-navigation="header"]'),r=h?.getBoundingClientRect();return{page:document.querySelector('[data-native-welcome]')?'welcome':document.querySelector('.login-credentials-form')?'login':'existing-account',theme:document.documentElement.dataset.theme,viewport:document.querySelector('meta[name=viewport]').content,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,header:r?{top:r.top,bottom:r.bottom}:null}})()`);
  assert(ui.viewport.includes('viewport-fit=contain')&&!ui.overflow,'Entry document fits the existing native contained viewport');if(ui.header)assert(ui.header.top>=-1&&ui.header.bottom<=ui.height+1);
  // Never capture an existing signed-in account's private screen.
  if(ui.page!=='existing-account')await fs.writeFile(path.join(output,'debug-after-update.png'),adb(['exec-out','screencap','-p']));
  let loginUi=null;
  if(ui.page!=='existing-account'){
   if(ui.page==='welcome')await evaluate(`document.querySelector('[data-native-welcome-login]').click()`);
   for(let i=0;i<100&&!await evaluate(`!!document.querySelector('.login-credentials-form input[aria-label="Password"]')`);i++)await pause(250);
   loginUi=await evaluate(`(()=>{const f=document.querySelector('.login-credentials-form');return{passwordLabel:!!f?.querySelector('input[aria-label="Password"]'),emailField:!!f?.querySelector('input[aria-label="Email address"]'),methodSwitch:!![...(f?.querySelectorAll('button')||[])].find(e=>e.textContent.trim()==='Resident room PIN'),overflow:document.documentElement.scrollWidth>innerWidth+1}})()`);
   assert(loginUi.passwordLabel&&loginUi.emailField&&!loginUi.methodSwitch&&!loginUi.overflow,'Installed native login uses one email/Password form without overflow');
   await fs.writeFile(path.join(output,'debug-unified-login.png'),adb(['exec-out','screencap','-p']));
  }
  // Drain PackageManager's batched writes before the emulator can be closed.
  await pause(12000);
  adb(['shell','cmd','package','wait-for-handler','--timeout','30000']);
  adb(['shell','cmd','package','wait-for-background-handler','--timeout','30000']);
  adb(['shell','sync']);
  const testInstall={startedPreviouslyStoppedExistingEmulator:true,emulatorRestartedForMemory:true};
  const installedByRun=[]; // This update installed no instrumentation packages.
  const removed=[];
  for(const name of installedByRun){assert(['app.pinevela.mobile.transporttest','app.pinevela.mobile.transporttest.test'].includes(name));if(text(['shell','pm','list','packages',name]).split('\n').includes('package:'+name)){assert(text(['uninstall',name]).endsWith('Success'));removed.push(name);}}
  const report={passed:true,installedPackage:app,previousDebugSha256,installedDebugSha256:installed,installedFrom:path.relative(process.cwd(),apk),noDataClearing:true,packageWritesFlushed:true,installMode:'adb install -r',rebootPerformed:false,emulatorRestartedForMemory:!!testInstall.emulatorRestartedForMemory,startedPreviouslyStoppedExistingEmulator:!!testInstall.startedPreviouslyStoppedExistingEmulator,logoutPerformed:false,authenticationFormsSubmitted:false,accountMutationsRequestedByVerifier:0,normalAppTrafficIntercepted:false,ui,loginUi,testOnlyPackagesRemoved:removed,emulatorLeftRunning:true};
  await fs.writeFile(path.join(output,'debug-install.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{ws?.close();for(const p of pending.values())clearTimeout(p.timer);try{adb(['forward','--remove',`tcp:${port}`]);}catch{}}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
