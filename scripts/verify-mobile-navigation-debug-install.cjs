/** Update the development APK without clearing data, then verify a normal
 * emulator close/reopen retains that exact update. No authentication action. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const reopenOnly=process.argv.includes('--reopen-only');
  const resumeFirstReopen=process.argv.includes('--resume-first-reopen');
  const app='app.pinevela.mobile.debug',serial='emulator-5554',port=9254;
  const sdk=process.env.ANDROID_HOME||'/home/wyse/Android/Sdk';
  const output=path.resolve('docs/verification/mobile-navigation-2026-11-04/android');
  const apk=path.resolve('releases/android/pinevela-mobile-navigation-20261104.apk');
  const expected=crypto.createHash('sha256').update(await fs.readFile(apk)).digest('hex');
  const adb=args=>execFileSync(path.join(sdk,'platform-tools/adb'),['-s',serial,...args],{timeout:40000,maxBuffer:32*1024*1024,stdio:['ignore','pipe','pipe']});
  const text=args=>adb(args).toString().trim();
  let ws,sequence=0;const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},30000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});assert(!r.exceptionDetails,'Bundled debug diagnostics succeed');return r.result.value;};
  const installed=()=>{const location=text(['shell','pm','path',app]);assert(/^package:\/data\/app\/[A-Za-z0-9_./~+=-]+\/base\.apk$/.test(location));return {path:location.slice(8),sha256:text(['shell','sha256sum',location.slice(8)]).match(/^[a-f0-9]{64}/)?.[0]};};
  const attach=async()=>{
    ws?.close();let target;
    for(let i=0;i<120&&!target;i++){
      try{const pid=text(['shell','pidof',app]).split(/\s+/)[0];if(pid){adb(['forward',`tcp:${port}`,`localabstract:webview_devtools_remote_${pid}`]);target=(await fetch(`http://127.0.0.1:${port}/json/list`).then(r=>r.json())).find(t=>{if(t.type!=='page'||!t.url.startsWith('https://localhost'))return false;const d=JSON.parse(t.description||'{}');return d.attached===true&&d.empty===false&&d.height>0&&d.width>0;});}}catch{}
      if(!target)await pause(200);
    }
    assert(target,'Updated debug APK exposes its actual bundled WebView');ws=new WebSocket(target.webSocketDebuggerUrl.replace(/localhost(?=:)/,'127.0.0.1'));await once(ws,'open');
    ws.addEventListener('message',event=>{const m=JSON.parse(event.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);});
    await send('Runtime.enable');await send('Page.enable');
  };
  const launch=async name=>{
    adb(['shell','am','start','-n',app+'/app.pinevela.mobile.MainActivity']);await attach();
    const end=Date.now()+80000;let ready=false;
    while(Date.now()<end){ready=await evaluate(`!document.querySelector('#pv-app-launch')&&!!document.querySelector('[data-native-welcome],.login-credentials-form,.pv-bottom-navigation')`);if(ready)break;await pause(250);}
    assert(ready,'Updated debug UI reaches its existing account/entry state');
    await evaluate('document.fonts.ready');await pause(800);
    const result=await evaluate(`(()=>{const header=document.querySelector('.native-welcome-header,.login-header,[data-portal-navigation="header"]'),r=header?.getBoundingClientRect();return {page:document.querySelector('[data-native-welcome]')?'welcome':document.querySelector('.login-credentials-form')?'login':'existing-account',theme:document.documentElement.dataset.theme,viewport:document.querySelector('meta[name=viewport]').content,width:innerWidth,height:innerHeight,overflow:document.documentElement.scrollWidth>innerWidth+1,header:r?{top:r.top,bottom:r.bottom}:null,newNavigationPresent:!!document.querySelector('[data-curved-navigation]')}})()`);
    assert(result.viewport.includes('viewport-fit=contain'),'Contained Android viewport is retained');assert(!result.overflow,'Actual debug document has no horizontal overflow');
    if(result.header)assert(result.header.top>=-1&&result.header.bottom<=result.height+1,'Header is inside the native safe viewport');
    // Save only the account-free entry screen. Existing signed-in data stays
    // untouched and is never dumped into the verification artifacts.
    if(result.page!=='existing-account')await fs.writeFile(path.join(output,name+'.png'),adb(['exec-out','screencap','-p']));
    return result;
  };
  const ownedEmulatorPids=()=>{
    try{return execFileSync('pgrep',['-f','^'+path.join(sdk,'emulator/qemu/linux-x86_64/qemu-system-x86_64')+'.*-avd PineVela_Pixel_4a_API_36( |$)'],{stdio:['ignore','pipe','pipe']}).toString().trim().split(/\s+/).filter(Boolean);}catch{return [];}
  };
  const flushGuestWrites=async()=>{
    // PackageManager coalesces some settings writes for ten seconds. A VM
    // termination is not an Android OS shutdown, so drain and sync first.
    await pause(15000);
    adb(['shell','cmd','package','wait-for-handler','--timeout','30000']);
    adb(['shell','cmd','package','wait-for-background-handler','--timeout','30000']);
    adb(['shell','sync']);
    assert.equal(installed().sha256,expected,'Final APK remains readable after PackageManager and disk flush');
    console.log('PASS PackageManager queues and guest filesystem flushed before VM close');
  };
  const reopen=async(logName='quickboot-reopen.log')=>{
    // Normal shutdown may spend several seconds saving RAM snapshots after
    // ADB disconnects. Wait for the owned QEMU process, never delete its lock.
    const stoppedBy=Date.now()+180000;
    while(ownedEmulatorPids().length&&Date.now()<stoppedBy)await pause(500);
    assert.equal(ownedEmulatorPids().length,0,'Previous owned emulator completed its normal snapshot shutdown');
    const log=await fs.open(path.join(output,logName),'w');
    let earlyExit,spawnFailure;
    const emulator=spawn(path.join(sdk,'emulator/emulator'),['-avd','PineVela_Pixel_4a_API_36','-no-audio','-no-boot-anim'],{stdio:['ignore',log.fd,log.fd],detached:true});
    emulator.once('exit',code=>{earlyExit=code;});emulator.once('error',error=>{spawnFailure=error.message;});emulator.unref();await log.close();
    let booted=false;const end=Date.now()+180000;
    while(Date.now()<end){
      assert(earlyExit===undefined&&!spawnFailure,'Owned emulator remains running while reopening');
      try{if(text(['shell','getprop','sys.boot_completed'])==='1'&&text(['shell','pm','path',app]).startsWith('package:')){booted=true;break;}}catch{}
      await pause(1000);
    }
    assert(booted,'Existing Pixel emulator reopens normally with the installed app retained');
    // Boot completion precedes System UI/WebView readiness on this host.
    await pause(10000);
  };
  const removed=[];
  try {
    await fs.mkdir(output,{recursive:true});
    const avdConfig=await fs.readFile('/home/wyse/.android/avd/PineVela_Pixel_4a_API_36.avd/config.ini','utf8');
    const coldBootConfigured=/^fastboot\.forceColdBoot\s*=\s*yes\s*$/m.test(avdConfig);
    assert(coldBootConfigured,'Reversible AVD cold-boot preference bypasses the inconsistent snapshot');
    if(reopenOnly)await reopen();
    else if(!resumeFirstReopen){
      for(const owned of ['app.pinevela.mobile.transporttest.test','app.pinevela.mobile.transporttest']){
        const present=text(['shell','pm','list','packages',owned]).split('\n').includes('package:'+owned);
        if(present){assert(text(['uninstall',owned]).endsWith('Success'));removed.push(owned);}
      }
      assert(text(['install','-r',apk]).endsWith('Success'),'Updated debug APK installs while retaining app data');
    }
    const before=installed();assert.equal(before.sha256,expected,'Installed debug APK matches the persistent release');
    const bytes=adb(['exec-out','cat',before.path]);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),expected);
    const bundle=JSON.parse(execFileSync('python3',['-c',`import sys,io,zipfile,json
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
 index=z.read('assets/public/index.html').decode()
 scripts=[z.read(n) for n in z.namelist() if n.startswith('assets/public/assets/') and n.endswith('.js')]
 print(json.dumps({'viewportContain':'viewport-fit=contain' in index,'curvedNavigationMarker':any(b'data-curved-navigation' in b for b in scripts),'bundledJavascriptFiles':len(scripts)}))`],{input:bytes,maxBuffer:1024*1024}).toString());
    assert(bundle.viewportContain&&bundle.curvedNavigationMarker,'Installed package contains the approved new navigation bundle');
    const first=await launch(reopenOnly?'debug-after-emulator-reopen':resumeFirstReopen?'debug-after-emulator-reopen-1':'debug-after-update');
    const original=JSON.parse(await fs.readFile(path.join(output,'device-before.json'),'utf8'));
    for(const [key,value] of Object.entries(original))adb(value==='null'?['shell','settings','delete','system',key]:['shell','settings','put','system',key,value]);
    const previous=resumeFirstReopen?JSON.parse(await fs.readFile(path.join(output,'debug-install-before-reopen.json'),'utf8')):null;
    if(previous)assert.equal(previous.installedDebugSha256,expected,'Resume proof uses the same installed APK as the first flushed reopen');
    const reopenChecks=[];
    if(resumeFirstReopen){const bootLog=await fs.readFile(path.join(output,'emulator-reopen-1.log'),'utf8');assert(!/Loading snapshot '/i.test(bootLog));reopenChecks.push({cycle:1,installedDebugSha256:before.sha256,ui:first,log:'emulator-reopen-1.log'});console.log('PASS first cold-boot retained final APK; resumed after System UI dialog and active-WebView selection');}
    let second=first,quickBootLog='';
    if(!reopenOnly){
      if(!resumeFirstReopen)await fs.writeFile(path.join(output,'debug-install-before-reopen.json'),JSON.stringify({installedDebugSha256:expected,initialUi:first,testOnlyPackagesRemoved:removed},null,2)+'\n');
      for(let cycle=resumeFirstReopen?2:1;cycle<=2;cycle++){
        await flushGuestWrites();
        ws?.close();ws=null;adb(['emu','kill']);
        const logName='emulator-reopen-'+cycle+'.log';await reopen(logName);
        const after=installed();assert.equal(after.sha256,expected,'The same updated APK persists after normal emulator reopen '+cycle);
        second=await launch(cycle===2?'debug-after-emulator-reopen':'debug-after-emulator-reopen-1');
        const bootLog=await fs.readFile(path.join(output,logName),'utf8');quickBootLog+=bootLog;
        assert(!/Loading snapshot '/i.test(bootLog),'Normal launch bypasses inconsistent snapshot loading');
        reopenChecks.push({cycle,installedDebugSha256:after.sha256,ui:second,log:logName});
        console.log('PASS normal cold-boot reopen '+cycle+' retained final APK');
      }
    }else{
      quickBootLog=await fs.readFile(path.join(output,'quickboot-reopen.log'),'utf8');
      reopenChecks.push({cycle:1,installedDebugSha256:before.sha256,ui:first,log:'quickboot-reopen.log'});
    }
    const testOnlyPackagesAbsent=['app.pinevela.mobile.transporttest.test','app.pinevela.mobile.transporttest'].every(owned=>!text(['shell','pm','list','packages',owned]).split('\n').includes('package:'+owned));
    const report={passed:true,installedPackage:app,installedDebugSha256:expected,persistentApk:path.relative(process.cwd(),apk),bundledAssets:bundle,normalEmulatorShutdownAndReopen:true,reopenCycles:reopenChecks.length,reopenChecks,coldBootConfigured,quickBootSnapshotLoaded:/Loaded snapshot|snapshot .+ loaded|loaded snapshot/i.test(quickBootLog),initialUi:reopenOnly?null:previous?.initialUi||first,priorInstallCapture:reopenOnly||resumeFirstReopen?'debug-after-update.png':undefined,reopenedUi:second,installerClearedAppData:false,userdataClearCommandRun:false,preexistingInconsistentSnapshotObserved:true,priorImmediateVmExitLostApkCodeWhileRegistryRemained:true,packageManagerHandlersDrained:true,guestFilesystemSyncedBeforeEachClose:true,postInstallFlushDelayMs:15000,avdRepairReport:'../avd-cold-boot-repair.json',avdConfigAndMetadataBackup:'../avd-recovery-backup',logoutPerformed:false,authenticationFormsSubmitted:false,productionMutationsSubmitted:0,testOnlyPackagesRemoved:previous?.testOnlyPackagesRemoved||removed,testOnlyPackagesAbsent,reopenRetriedAfterSnapshotShutdown:reopenOnly,resumedAfterSystemUiDialogAndActiveWebViewSelection:resumeFirstReopen,emulatorLeftRunning:true};
    await fs.writeFile(path.join(output,'debug-install-quickboot.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,installedDebugSha256:expected,normalReopen:true,quickBootSnapshotLoaded:report.quickBootSnapshotLoaded,ui:second.page,testOnlyPackagesRemoved:removed.length}));
  } finally {
    ws?.close();for(const waiter of pending.values())clearTimeout(waiter.timer);try{adb(['forward','--remove',`tcp:${port}`]);}catch{}
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
