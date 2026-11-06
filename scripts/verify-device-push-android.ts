/** Real FCM -> owned Android emulator -> native notification -> tap route.
 * Sends three clearly labelled connection checks only to the emulator token
 * acquired here. No account is created, no app API write is made, and sender
 * credentials/registration tokens never enter the report or console. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {once} from 'node:events';
import dotenv from 'dotenv';
import {sendDevicePush} from '../supabase/devicePushProvider.js';
import {pushOpenPath} from '../devicePushPolicy.js';
dotenv.config({quiet:true});
const app='app.pinevela.mobile.debug',serial=process.env.PINEVELA_ANDROID_SERIAL||'emulator-5554';
const adbPath=path.join(process.env.ANDROID_HOME||'/home/wyse/Android/Sdk','platform-tools/adb');
const output='docs/verification/device-push-2026-11-05/android',port=9255;
const adb=(args:string[])=>execFileSync(adbPath,['-s',serial,...args],{timeout:30000,maxBuffer:20*1024*1024});
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let stage='connect',socket:WebSocket|undefined,sequence=0,originalRoute='',token='',sent=0,ownsTestRegistration=false,realDialogAccepted=false;
const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}>();
const checks:string[]=[],check=(value:unknown,label:string)=>{assert.ok(value,label);checks.push(label);};
async function until<T>(read:()=>Promise<T>,label:string,timeout=45000){const end=Date.now()+timeout;while(Date.now()<end){const value=await read();if(value)return value;await pause(250);}throw Error(label+' timed out');}
function send(method:string,params:any={}){return new Promise<any>((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(method+' timed out'));},20000);pending.set(id,{resolve,reject,timer});socket!.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression:string){const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});if(result.exceptionDetails)throw Error('Android diagnostic expression failed');return result.result.value;}
async function attach(){
  socket?.close();for(const p of pending.values())clearTimeout(p.timer);pending.clear();
  const target:any=await until(async()=>{
    try{const pid=adb(['shell','pidof',app]).toString().trim().split(/\s+/)[0];if(!pid)return;
      adb(['forward','tcp:'+port,'localabstract:webview_devtools_remote_'+pid]);
      return(await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json())).find((t:any)=>t.type==='page'&&t.url.startsWith('https://localhost')&&JSON.parse(t.description||'{}').attached===true);
    }catch{return;}
  },'Android WebView',60000);
  socket=new WebSocket(target.webSocketDebuggerUrl);socket.addEventListener('message',event=>{
    const message=JSON.parse(String(event.data)),p=pending.get(message.id);if(!p)return;pending.delete(message.id);clearTimeout(p.timer);
    message.error?p.reject(Error(message.error.message)):p.resolve(message.result);
  });await once(socket,'open');await send('Page.enable');await send('Runtime.enable');
}
function ownNotification(tag:string){
  const dump=adb(['shell','dumpsys','notification','--noredact']).toString();
  const record=dump.split(/(?=NotificationRecord\()/).find(part=>part.includes('pkg='+app)&&part.includes('tag='+tag));
  return record?{found:true,picture:/android\.picture/.test(record)}:null;
}
async function tapNotification(label:string){
  adb(['shell','cmd','statusbar','expand-notifications']);
  await until(async()=>{
    adb(['shell','uiautomator','dump','/sdcard/pinevela-push-check.xml']);
    const xml=adb(['exec-out','cat','/sdcard/pinevela-push-check.xml']).toString();
    const node=xml.match(new RegExp('<node[^>]*text="[^"]*'+label+'[^"]*"[^>]*>'))?.[0];
    const bounds=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);if(!bounds)return;
    adb(['shell','input','tap',String(Math.round((Number(bounds[1])+Number(bounds[3]))/2)),String(Math.round((Number(bounds[2])+Number(bounds[4]))/2))]);return true;
  },'Notification tray item',20000);
}
try{
  await fs.mkdir(output,{recursive:true});
  const installedPath=adb(['shell','pm','path',app]).toString().trim().split('\n').map(s=>s.replace(/^package:/,'')).find(s=>s.endsWith('/base.apk'));
  assert(installedPath&&/^\/data\/app\/[^\s]+\/base\.apk$/.test(installedPath));
  check(crypto.createHash('sha256').update(adb(['exec-out','cat',installedPath])).digest('hex')===crypto.createHash('sha256').update(await fs.readFile('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex'),'Actually installed APK matches the final build');
  adb(['shell','input','keyevent','KEYCODE_WAKEUP']);adb(['shell','wm','dismiss-keyguard']);
  adb(['shell','am','start','-n',app+'/app.pinevela.mobile.MainActivity']);await attach();
  await until(()=>evaluate("Boolean(window.Capacitor?.Plugins?.PushNotifications&&document.documentElement&&document.body)"),'Native push plugin');
  originalRoute=await evaluate('location.hash');
  check(!(await evaluate("JSON.parse(localStorage.getItem('pinevela:device-push')||'null')?.enabled")),'Existing connected-device preferences are not overwritten');
  ownsTestRegistration=true;
  stage='real notification permission and Firebase token';
  await evaluate(`(async()=>{
    const p=window.Capacitor.Plugins.PushNotifications;window.__pvPushSmoke={received:0,permission:'',error:false,token:'',clicked:false};
    await p.addListener('registration',v=>{window.__pvPushSmoke.token=v.value;});
    await p.addListener('registrationError',()=>{window.__pvPushSmoke.error=true;});
    await p.addListener('pushNotificationReceived',()=>{window.__pvPushSmoke.received++;});
    const button=document.createElement('button');button.id='pv-push-test-button';button.textContent='Allow PineVela notification connection test';
    button.style.cssText='position:fixed;left:12px;right:12px;top:40%;z-index:2147483647;padding:24px;border-radius:20px;background:#003566;color:white;font-weight:bold';
    button.onclick=async()=>{window.__pvPushSmoke.clicked=true;const permission=await p.requestPermissions();window.__pvPushSmoke.permission=permission.receive;if(permission.receive!=='granted')return;
      await p.createChannel({id:'pinevela_accounts',name:'Account & maintenance alerts',importance:4,visibility:0});
      await p.createChannel({id:'pinevela_discoveries',name:'New marketplace & residence listings',importance:3,visibility:0});await p.register();};
    document.body.append(button);return true;
  })()`);
  await evaluate("document.getElementById('pv-push-test-button').click();true");
  for(let attempt=0;attempt<20;attempt++){
    if(await evaluate("window.__pvPushSmoke.permission==='granted'"))break;
    adb(['shell','uiautomator','dump','/sdcard/pinevela-push-permission.xml']);
    const xml=adb(['exec-out','cat','/sdcard/pinevela-push-permission.xml']).toString();
    const node=xml.match(/<node[^>]*resource-id="[^"]*:id\/permission_allow_button"[^>]*>/)?.[0],bounds=node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if(bounds){adb(['shell','input','tap',String(Math.round((+bounds[1]+ +bounds[3])/2)),String(Math.round((+bounds[2]+ +bounds[4])/2))]);realDialogAccepted=true;break;}await pause(200);
  }
  await until(()=>evaluate("window.__pvPushSmoke.permission==='granted'"),'Android permission accepted',20000);
  token=await until(()=>evaluate('window.__pvPushSmoke.token'),'Firebase registration token',60000);
  check(typeof token==='string'&&token.length>30,'Real Firebase registration succeeded without browser sign-in');
  check(adb(['shell','dumpsys','package',app]).toString().includes('android.permission.POST_NOTIFICATIONS: granted=true'),'Android reports the real notification permission granted');
  await evaluate("document.getElementById('pv-push-test-button')?.remove();true");
  const context=crypto.randomUUID();
  const message=(step:number)=>{const id=crypto.randomUUID();return{title:'PineVela · User — Android delivery check '+step,
    body:'Device connection check '+step+'. Open PineVela to continue.',tag:'pv:'+id+':'+context,path:pushOpenPath(id,context,'primary'),
    accountKind:'primary',notificationId:id,contextId:context,discovery:false,
    image:'https://pinevela.app/icons/pinevela-192.png'};};
  const one=message(1);stage='foreground FCM delivery';
  check((await sendDevicePush('android',{token},one)).state==='sent','FCM accepted the emulator foreground connection check');sent++;
  await until(()=>evaluate('window.__pvPushSmoke.received>=1'),'Foreground receive event');
  const foreground=await until(async()=>ownNotification(one.tag),'Foreground system notification');check(foreground.found,'Foreground delivery appears in the native notification tray');
  check(foreground.picture,'Foreground notification contains an actual downloaded picture');
  await evaluate('window.Capacitor.Plugins.PushNotifications.removeAllDeliveredNotifications()');
  stage='background FCM delivery and tap';adb(['shell','input','keyevent','KEYCODE_HOME']);
  const two=message(2);check((await sendDevicePush('android',{token},two)).state==='sent','FCM accepted the background connection check');sent++;
  await until(async()=>ownNotification(two.tag),'Background system notification');check(true,'Background delivery reaches the native tray');
  await tapNotification('Android delivery check 2');
  await until(()=>evaluate('location.hash==='+JSON.stringify('#'+two.path)),'Background notification route');check(true,'Background notification tap routes into the app');
  await evaluate('window.Capacitor.Plugins.PushNotifications.removeAllDeliveredNotifications()');
  stage='terminated activity delivery and cold-start tap';adb(['shell','input','keyevent','KEYCODE_HOME']);await pause(500);
  const pid=adb(['shell','pidof',app]).toString().trim().split(/\s+/)[0];assert(/^\d+$/.test(pid));socket?.close();
  adb(['shell','run-as',app,'/system/bin/kill','-9',pid]);
  const three=message(3);check((await sendDevicePush('android',{token},three)).state==='sent','FCM accepted the terminated-app connection check');sent++;
  await until(async()=>ownNotification(three.tag),'Terminated app notification');check(true,'Delivery continues without the app activity running');
  await tapNotification('Android delivery check 3');await attach();
  await until(()=>evaluate('location.hash==='+JSON.stringify('#'+three.path)),'Retained cold-start tap');
  check(true,'A cold-start notification tap opens the exact app notification route');
  await until(()=>evaluate("document.body.innerText.includes('Sign in to this account')"),'Private notification account gate');
  check(true,'A test notification cannot bypass the account gate');
  stage='cleanup';await evaluate('window.Capacitor.Plugins.PushNotifications.removeAllDeliveredNotifications()');
  await evaluate('window.Capacitor.Plugins.PushNotifications.unregister()');token='';
  await evaluate('location.hash='+JSON.stringify(originalRoute||'#/login')+';true');
  const preflight=JSON.parse(await fs.readFile(output+'/permission-preflight.json','utf8').catch(()=>'{}'));
  const report={passed:true,checks:checks.length,checkLabels:checks,actualAndroidWebView:true,actualFcmDelivery:true,realPermissionDialog:realDialogAccepted||preflight.nativePermissionDialogAccepted===true,
    foreground:true,background:true,terminatedActivity:true,coldTap:true,richPicture:true,cloudMessagesSent:sent,
    recipients:'owned emulator only',accountApiWrites:0,accountDataCleared:false,temporaryRegistrationRemoved:true,
    hostedQueueDeliveryVerified:false,apkSha256:crypto.createHash('sha256').update(await fs.readFile('android/app/build/outputs/apk/debug/app-debug.apk')).digest('hex')};
  await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');await fs.rm(output+'/failure.json',{force:true});console.log(JSON.stringify({...report,checkLabels:undefined}));
}catch(error:any){let diagnostic:any;try{diagnostic=await evaluate("(async()=>({permission:window.__pvPushSmoke?.permission,clicked:window.__pvPushSmoke?.clicked,tokenPresent:Boolean(window.__pvPushSmoke?.token),registrationError:Boolean(window.__pvPushSmoke?.error),nativePermission:(await window.Capacitor.Plugins.PushNotifications.checkPermissions()).receive}))()");}catch{}
  await fs.mkdir(output,{recursive:true});await fs.writeFile(output+'/failure.json',JSON.stringify({passed:false,stage,checks,diagnostic,error:String(error?.message||'Android verification failed').slice(0,500),cloudMessagesSent:sent},null,2)+'\n');console.error(JSON.stringify({passed:false,stage,checks:checks.length,cloudMessagesSent:sent}));process.exitCode=1;}
finally{
  token='';if(ownsTestRegistration&&socket?.readyState===WebSocket.OPEN){try{await evaluate("window.Capacitor?.Plugins?.PushNotifications?.unregister();document.getElementById('pv-push-test-button')?.remove();delete window.__pvPushSmoke;true");}catch{}}
  socket?.close();for(const p of pending.values())clearTimeout(p.timer);adb(['forward','--remove','tcp:'+port]);
  adb(['shell','rm','-f','/sdcard/pinevela-push-check.xml','/sdcard/pinevela-push-permission.xml']);
}
