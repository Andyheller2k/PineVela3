import fs from 'node:fs';
import crypto from 'node:crypto';
import webPush from 'web-push';
import {JWT} from 'google-auth-library';
import {ApiError} from './db.js';

export type PushMessage={title:string;body:string;tag:string;path:string;image?:string;accountKind:string;notificationId:string;contextId:string;discovery:boolean};
type WebKeys={publicKey:string;privateKey:string;subject:string};
type FcmKey={type:string;project_id:string;client_email:string;private_key:string;token_uri?:string};
let keyCache:{file:string;mtime:number;keys:WebKeys}|undefined;
function privateJson(file:string) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>32768||(stat.mode&0o077))throw new Error('Push credentials require a private regular file.');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{return JSON.parse(fs.readFileSync(fd,'utf8'));}finally{fs.closeSync(fd);}
}
export function webPushKeys(env:NodeJS.ProcessEnv=process.env):WebKeys|undefined {
  const file=env.PUSH_WEB_KEY_FILE;if(!file)return;
  try{
    const mtime=fs.statSync(file).mtimeMs;if(keyCache?.file===file&&keyCache.mtime===mtime)return keyCache.keys;
    const keys=privateJson(file);
    if(typeof keys.publicKey!=='string'||typeof keys.privateKey!=='string'||Buffer.from(keys.publicKey,'base64url').length!==65||Buffer.from(keys.privateKey,'base64url').length!==32
      ||keys.subject!=='mailto:pinevela@pinevela.app')throw new Error();
    const ecdh=crypto.createECDH('prime256v1');ecdh.setPrivateKey(Buffer.from(keys.privateKey,'base64url'));
    if(ecdh.getPublicKey().toString('base64url')!==keys.publicKey)throw new Error();
    keyCache={file,mtime,keys};return keys;
  }catch{throw new ApiError(503,'Device notifications are not configured.','push_configuration');}
}
export function fcmCredentials(env:NodeJS.ProcessEnv=process.env):FcmKey|undefined {
  const file=env.PUSH_FCM_KEY_FILE;if(!file)return;
  try{
    const key=privateJson(file);
    if(key.type!=='service_account'||!/^[-a-z0-9]{4,63}$/.test(key.project_id||'')||key.project_id!==(env.PUSH_FCM_PROJECT_ID||'pinevela')
      ||!String(key.client_email).endsWith('@'+key.project_id+'.iam.gserviceaccount.com')
      ||!String(key.private_key).startsWith('-----BEGIN PRIVATE KEY-----')||key.token_uri&&key.token_uri!=='https://oauth2.googleapis.com/token')throw new Error();
    return key;
  }catch{throw new ApiError(503,'Android notifications are not configured.','push_configuration');}
}
export function pushConfiguration(){
  let web:WebKeys|undefined,fcm:FcmKey|undefined;
  try{web=webPushKeys();}catch{}try{fcm=fcmCredentials();}catch{}
  return {web:Boolean(web),android:Boolean(fcm),vapidPublicKey:web?.publicKey||null};
}
export function validateWebSubscription(value:unknown) {
  const data=value as any;
  if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(k=>!['endpoint','expirationTime','keys'].includes(k))
    ||typeof data.endpoint!=='string'||data.endpoint.length>2048)throw new ApiError(400,'Choose a valid browser subscription.');
  let u:URL;try{u=new URL(data.endpoint);}catch{throw new ApiError(400,'Choose a valid browser subscription.');}
  // Arbitrary URLs cannot turn the sender into an SSRF proxy. These are browser
  // push services, not a caller-selected application server or redirect target.
  // Chromium also issues subscriptions through Google's non-stable-channel
  // service. Keep its original endpoint: registrations cannot move between hosts.
  const chromiumGoogle=u.hostname==='jmt17.google.com'&&u.pathname.startsWith('/fcm/send/')&&u.pathname!=='/fcm/send/';
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash||u.search
    ||!['fcm.googleapis.com','updates.push.services.mozilla.com','push.services.mozilla.com','web.push.apple.com','wns2.notify.windows.com'].includes(u.hostname)
      &&!u.hostname.endsWith('.notify.windows.com')&&!chromiumGoogle)throw new ApiError(400,'This browser push service is not supported.');
  if(!data.keys||typeof data.keys!=='object'||Array.isArray(data.keys)||Object.keys(data.keys).some(k=>!['p256dh','auth'].includes(k))
    ||![data.keys.p256dh,data.keys.auth].every(v=>typeof v==='string'&&/^[A-Za-z0-9_-]+={0,2}$/.test(v))
    ||Buffer.from(data.keys.p256dh,'base64url').length!==65||Buffer.from(data.keys.auth,'base64url').length!==16)throw new ApiError(400,'Choose valid browser encryption keys.');
  try{crypto.ECDH.convertKey(Buffer.from(data.keys.p256dh,'base64url'),'prime256v1');}catch{throw new ApiError(400,'Choose valid browser encryption keys.');}
  return {endpoint:u.href,keys:{p256dh:data.keys.p256dh,auth:data.keys.auth}};
}
export function validateAndroidToken(value:unknown){
  if(typeof value!=='string'||value.length<30||value.length>4096||!/^[A-Za-z0-9_:\-.]+$/.test(value))throw new ApiError(400,'Choose a valid Android registration token.');
  return {token:value};
}
export type DeliveryResult={state:'sent'|'retry'|'invalid'|'failed';code:string};
export function androidPushPayload(token:string,message:PushMessage){
  return {message:{token:validateAndroidToken(token).token,
    notification:{title:message.title,body:message.body,...(message.image?{image:message.image}:{})},
    data:{path:message.path,accountKind:message.accountKind,notificationId:message.notificationId,contextId:message.contextId,tag:message.tag},
    android:{priority:message.discovery?'normal':'high',ttl:message.discovery?'21600s':'86400s',notification:{
      channelId:message.discovery?'pinevela_discoveries':'pinevela_accounts',tag:message.tag,icon:'ic_stat_pinevela',color:'#003566',
      ...(message.image?{image:message.image}:{}),visibility:'PRIVATE',
    }}}};
}
let google:{fingerprint:string;auth:JWT}|undefined;
export async function sendDevicePush(platform:string,endpoint:any,message:PushMessage):Promise<DeliveryResult>{
  try{
    if(platform==='web'){
      const keys=webPushKeys();if(!keys)return {state:'retry',code:'web_unconfigured'};
      await webPush.sendNotification(validateWebSubscription(endpoint),JSON.stringify({v:1,...message}),{
        vapidDetails:{subject:keys.subject,publicKey:keys.publicKey,privateKey:keys.privateKey},
        TTL:message.discovery?21600:86400,urgency:message.discovery?'normal':'high',timeout:10000,
      });
      return {state:'sent',code:'web_accepted'};
    }
    const key=fcmCredentials();if(!key)return {state:'retry',code:'android_unconfigured'};
    const fingerprint=crypto.createHash('sha256').update(key.private_key).digest('hex');
    if(google?.fingerprint!==fingerprint)google={fingerprint,auth:new JWT({email:key.client_email,key:key.private_key,
      scopes:['https://www.googleapis.com/auth/firebase.messaging'],transporterOptions:{timeout:10000,retry:false}})};
    const {token}=await google.auth.getAccessToken();if(!token)return {state:'retry',code:'fcm_authorization'};
    const response=await fetch(`https://fcm.googleapis.com/v1/projects/${key.project_id}/messages:send`,{
      method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify(androidPushPayload(endpoint.token,message)),signal:AbortSignal.timeout(10000),redirect:'error',
    });
    if(response.ok)return {state:'sent',code:'fcm_accepted'};
    const body=await response.json().catch(()=>null);
    if(body?.error?.details?.some((d:any)=>d['@type']==='type.googleapis.com/google.firebase.fcm.v1.FcmError'&&d.errorCode==='UNREGISTERED'))return {state:'invalid',code:'fcm_unregistered'};
    return response.status===429||response.status>=500||[401,403].includes(response.status)?{state:'retry',code:'fcm_unavailable'}:{state:'failed',code:'fcm_rejected'};
  }catch(error){
    const status=(error as any)?.statusCode;
    if([404,410].includes(status))return {state:'invalid',code:'web_expired'};
    if(status===400||error instanceof ApiError&&error.status===400)return {state:'failed',code:'invalid_subscription'};
    return {state:'retry',code:'provider_unavailable'};
  }
}
