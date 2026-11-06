import {Capacitor,type PluginListenerHandle} from '@capacitor/core';
import {NATIVE_APP,NATIVE_PREVIEW} from '../native/environment';
import {sessionFetch} from './session';
import {safePushPath} from '../../devicePushPolicy';

const KEY='pinevela:device-push';
export type DevicePushLocal={id:string;secret:string;enabled:boolean};
export type DevicePushPreferences={accountAlerts:boolean;marketplace:boolean;residences:boolean;keepExistingAccounts?:boolean};
type PushPlugin=typeof import('@capacitor/push-notifications')['PushNotifications'];
let native:PushPlugin|undefined,initializing:Promise<void>|undefined,token:string|undefined;
const tokenWaiters=new Set<{resolve:(token:string)=>void;reject:(error:Error)=>void}>();
const handles:PluginListenerHandle[]=[];
export function localDevicePush(create=false):DevicePushLocal|null {
  try{
    const raw=JSON.parse(localStorage.getItem(KEY)||'null');
    if(raw&&/^[a-f0-9-]{36}$/i.test(raw.id)&&/^[A-Za-z0-9_-]{43}$/.test(raw.secret)&&typeof raw.enabled==='boolean')return raw;
    if(create){const bytes=crypto.getRandomValues(new Uint8Array(32));const secret=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
      const next={id:crypto.randomUUID(),secret,enabled:false};localStorage.setItem(KEY,JSON.stringify(next));return next;}
  }catch{/* Storage denial must not prevent normal app use. */}
  return null;
}
export function setDevicePushEnabled(enabled:boolean){try{const saved=localDevicePush();if(saved)localStorage.setItem(KEY,JSON.stringify({...saved,enabled}));}catch{}}
export function devicePushProofHeaders(){const p=localDevicePush();return p?{'X-PineVela-Push-Installation':p.id,'X-PineVela-Push-Key':p.secret}:{};}
export function devicePushPlatform(){return NATIVE_APP&&Capacitor.getPlatform()==='android'?'android':'web';}
export async function initializeNativePush(){
  if(!NATIVE_APP||NATIVE_PREVIEW||Capacitor.getPlatform()!=='android')return;
  if(initializing)return initializing;
  initializing=(async()=>{
    native=(await import('@capacitor/push-notifications')).PushNotifications;
    handles.push(await native.addListener('registration',value=>{
      const changed=Boolean(token&&token!==value.value);token=value.value;for(const waiter of tokenWaiters)waiter.resolve(token);tokenWaiters.clear();
      if(changed)window.dispatchEvent(new Event('pinevela-push-token-changed'));
    }));
    handles.push(await native.addListener('registrationError',()=>{
      for(const waiter of tokenWaiters)waiter.reject(new Error('Android notification registration failed. Please retry.'));tokenWaiters.clear();
    }));
    handles.push(await native.addListener('pushNotificationActionPerformed',event=>{
      const destination=safePushPath(event.notification.data?.path);
      if(destination)location.hash='#'+destination;
    }));
    handles.push(await native.addListener('pushNotificationReceived',()=>window.dispatchEvent(new Event('pinevela-data-changed'))));
  })().catch(async error=>{await Promise.allSettled(handles.splice(0).map(handle=>handle.remove()));native=undefined;initializing=undefined;throw error;});
  return initializing;
}
export function supportsDevicePush(){return !NATIVE_PREVIEW&&(devicePushPlatform()==='android'
  ?Capacitor.isPluginAvailable('PushNotifications')
  :window.isSecureContext&&'Notification' in window&&'serviceWorker' in navigator&&'PushManager' in window);}
export async function deviceNotificationPermission(){
  if(!supportsDevicePush())return 'unavailable';
  if(devicePushPlatform()==='android'){await initializeNativePush();return (await native!.checkPermissions()).receive;}
  return Notification.permission==='default'?'prompt':Notification.permission;
}
async function androidToken(ask:boolean){
  await initializeNativePush();if(!native)throw new Error('This Android build does not support notifications.');
  let permission=await native.checkPermissions();
  if(ask&&['prompt','prompt-with-rationale'].includes(permission.receive))permission=await native.requestPermissions();
  if(permission.receive!=='granted')throw new Error('Allow notifications in Android settings to enable device alerts.');
  await native.createChannel({id:'pinevela_accounts',name:'Account & maintenance alerts',description:'Personal alerts from your enabled PineVela accounts',importance:4,visibility:0});
  await native.createChannel({id:'pinevela_discoveries',name:'New marketplace & residence listings',description:'Optional new-listing alerts',importance:3,visibility:0});
  if(token)return token;
  return new Promise<string>((resolve,reject)=>{
    const waiter={resolve:(value:string)=>{clearTimeout(timer);tokenWaiters.delete(waiter);resolve(value);},reject:(error:Error)=>{clearTimeout(timer);tokenWaiters.delete(waiter);reject(error);}};
    const timer=setTimeout(()=>{tokenWaiters.delete(waiter);reject(new Error('Android notification registration timed out. Please retry.'));},15000);
    tokenWaiters.add(waiter);void native!.register().catch(()=>waiter.reject(new Error('Android notification registration is unavailable.')));
  });
}
async function browserSubscription(publicKey:string,ask:boolean){
  if(Notification.permission==='default'&&ask)await Notification.requestPermission();
  if(Notification.permission!=='granted')throw new Error('Allow notifications in your browser settings to enable device alerts.');
  await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});
  let timeout:ReturnType<typeof setTimeout>|undefined;
  const registration=await Promise.race([navigator.serviceWorker.ready,new Promise<never>((_resolve,reject)=>{timeout=setTimeout(()=>reject(new Error('The browser notification service did not start. Please retry.')),10000);})]).finally(()=>{if(timeout)clearTimeout(timeout);});
  let subscription=await registration.pushManager.getSubscription();
  const raw=atob(publicKey.replace(/-/g,'+').replace(/_/g,'/'));const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
  if(subscription){
    const existing=subscription.options.applicationServerKey;
    if(existing&&new Uint8Array(existing).some((value,index)=>value!==bytes[index])){await subscription.unsubscribe();subscription=null;}
  }
  return subscription||await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});
}
export async function subscribeDevicePush(config:{web:boolean;android:boolean;vapidPublicKey:string|null},preferences:DevicePushPreferences,contextId:string,ask:boolean,signal?:AbortSignal){
  if(!supportsDevicePush())throw new Error('This device or browser does not support push notifications.');
  const platform=devicePushPlatform();if(!config[platform])throw new Error('Notification delivery is not configured for this platform yet.');
  const saved=localDevicePush(true);if(!saved)throw new Error('Allow site storage to enable device notifications.');
  const payload=platform==='android'?{token:await androidToken(ask)}:{subscription:(await browserSubscription(config.vapidPublicKey!,ask)).toJSON()};
  if(signal?.aborted)throw new DOMException('Cancelled','AbortError');
  const response=await sessionFetch('/api/device-push/register',{method:'POST',headers:{'Content-Type':'application/json','X-PineVela-Profile-Context':contextId},signal,
    body:JSON.stringify({installationId:saved.id,installationSecret:saved.secret,platform,...payload,...preferences})});
  const data=await response.json();if(!response.ok)throw new Error(data.error||'Device notifications could not be saved.');
  if(!signal?.aborted)setDevicePushEnabled(true);return data;
}
export async function disconnectDevicePush(){
  const saved=localDevicePush();if(!saved)return;
  const response=await sessionFetch('/api/device-push/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({installationId:saved.id,installationSecret:saved.secret})});
  if(!response.ok)throw new Error('Device alerts could not be disabled. Please retry.');
  setDevicePushEnabled(false);
  await clearLocalDevicePushOnLogout();
}
export async function clearLocalDevicePushOnLogout(){
  setDevicePushEnabled(false);
  if(devicePushPlatform()==='web'&&'serviceWorker' in navigator){const registration=await navigator.serviceWorker.getRegistration('/');registration?.active?.postMessage({type:'pinevela-clear-notifications'});await registration?.pushManager?.getSubscription().then(s=>s?.unsubscribe()).catch(()=>{});}
  if(native){await native.removeAllDeliveredNotifications().catch(()=>{});await native.unregister().catch(()=>{});token=undefined;}
}
