import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import vm from 'node:vm';
import webPush from 'web-push';
import {PUSH_ACCOUNT_LABELS,privatePushBody,pushOpenPath,pushTitle,safePushPath} from '../devicePushPolicy.js';
import {androidPushPayload,validateAndroidToken,validateWebSubscription,webPushKeys,fcmCredentials} from '../supabase/devicePushProvider.js';
import {deviceProof} from '../supabase/devicePush.js';

const notice=crypto.randomUUID(),account=crypto.randomUUID(),destination=pushOpenPath(notice,account,'manager');
const webSubscription=()=>{const ecdh=crypto.createECDH('prime256v1');ecdh.generateKeys();return {
  endpoint:'https://fcm.googleapis.com/fcm/send/test-subscription',expirationTime:null,
  keys:{p256dh:ecdh.getPublicKey().toString('base64url'),auth:crypto.randomBytes(16).toString('base64url')},
};};
test('every account has a distinct device label and a strict internal destination',()=>{
  for(const [kind,label] of Object.entries(PUSH_ACCOUNT_LABELS)){
    assert(pushTitle(kind,'New alert').includes(label));assert.equal(safePushPath(pushOpenPath(notice,account,kind)),pushOpenPath(notice,account,kind));
  }
  for(const invalid of ['https://evil.invalid'+destination,'//evil.invalid'+destination,destination+'&kind=admin',destination+'&userId='+account,
    destination.replace(account,'someone'),destination+'#secret',destination.replace('kind=manager','kind=unknown'),'/manager/dashboard'])assert.equal(safePushPath(invalid),null);
  assert.throws(()=>pushOpenPath('invalid',account,'manager'));
  assert(!pushTitle('manager','a\n\u0000b').includes('\n'));
});
test('private payloads use summaries and never contain notification message contents',()=>{
  assert.match(privatePushBody('resident','maintenance_updated'),/maintenance/i);
  assert.match(privatePushBody('staff','issue_report'),/maintenance/i);
  assert.match(privatePushBody('seller','market_message'),/encrypted marketplace message/);
  const body=privatePushBody('manager','verification');
  assert(!body.includes('123456'));assert.match(body,/Open PineVela/);
});
test('browser endpoints cannot redirect the sender to arbitrary hosts or private network services',()=>{
  const good=webSubscription();assert.equal(validateWebSubscription(good).endpoint,good.endpoint);
  for(const endpoint of ['http://fcm.googleapis.com/a','https://127.0.0.1/a','https://169.254.169.254/latest',
    'https://fcm.googleapis.com.evil.invalid/a','https://user:secret@fcm.googleapis.com/a','https://fcm.googleapis.com:444/a',
    'https://fcm.googleapis.com/a?recipient=anything','https://fcm.googleapis.com/a#fragment'])assert.throws(()=>validateWebSubscription({...good,endpoint}));
  assert.throws(()=>validateWebSubscription({...good,authUserId:account}));
  assert.throws(()=>validateWebSubscription({...good,keys:{...good.keys,auth:'short'}}));
  assert.throws(()=>validateWebSubscription({...good,keys:{...good.keys,p256dh:Buffer.alloc(65,2).toString('base64url')}}));
});
test('Chromium subscriptions keep their original documented Google push endpoint',()=>{
  const good=webSubscription();
  for(const endpoint of ['https://fcm.googleapis.com/fcm/send/test-subscription',
    'https://fcm.googleapis.com/wp/test-subscription','https://fcm.googleapis.com/preprod/wp/test-subscription',
    'https://jmt17.google.com/fcm/send/test-subscription']){
    assert.equal(validateWebSubscription({...good,endpoint}).endpoint,endpoint);
  }
  for(const endpoint of ['http://jmt17.google.com/fcm/send/test-subscription',
    'https://jmt17.google.com.evil.invalid/fcm/send/test-subscription','https://other.google.com/fcm/send/test-subscription',
    'https://jmt17.google.com:444/fcm/send/test-subscription','https://user:secret@jmt17.google.com/fcm/send/test-subscription',
    'https://jmt17.google.com/fcm/send/test-subscription?redirect=https://127.0.0.1/',
    'https://jmt17.google.com/fcm/send/test-subscription#fragment','https://jmt17.google.com/url/redirect',
    'https://jmt17.google.com/fcm/send/','https://jmt17.google.com/fcm/send/../redirect']){
    assert.throws(()=>validateWebSubscription({...good,endpoint}));
  }
});
test('installation capabilities and Android registrations reject malformed values',()=>{
  const secret=crypto.randomBytes(32).toString('base64url');assert.match(deviceProof(account,secret).hash,/^[a-f0-9]{64}$/);
  assert.throws(()=>deviceProof(account,'bad'));assert.throws(()=>deviceProof('bad',secret));
  assert.deepEqual(validateAndroidToken('registration:token_'.repeat(6)),{token:'registration:token_'.repeat(6)});
  for(const token of ['','short','token\r\nHeader:bad','x'.repeat(4097),{userId:account}])assert.throws(()=>validateAndroidToken(token));
});
test('VAPID key files require exact matching keys, private permissions and no symlinks',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pinevela-push-keys-')),file=path.join(root,'web.json');
  const keys={...webPush.generateVAPIDKeys(),subject:'mailto:pinevela@pinevela.app'};
  try{
    fs.writeFileSync(file,JSON.stringify(keys),{mode:0o600});assert.equal(webPushKeys({PUSH_WEB_KEY_FILE:file})?.publicKey,keys.publicKey);
    const wrong=path.join(root,'mismatch.json');fs.writeFileSync(wrong,JSON.stringify({...keys,privateKey:webPush.generateVAPIDKeys().privateKey}),{mode:0o600});
    assert.throws(()=>webPushKeys({PUSH_WEB_KEY_FILE:wrong}));
    const readable=path.join(root,'readable.json');fs.writeFileSync(readable,JSON.stringify(keys),{mode:0o644});assert.throws(()=>webPushKeys({PUSH_WEB_KEY_FILE:readable}));
    const link=path.join(root,'link.json');fs.symlinkSync(file,link);assert.throws(()=>webPushKeys({PUSH_WEB_KEY_FILE:link}));
    fs.writeFileSync(path.join(root,'fcm.json'),JSON.stringify({type:'external_account',project_id:'pinevela'}),{mode:0o600});
    assert.throws(()=>fcmCredentials({PUSH_FCM_KEY_FILE:path.join(root,'fcm.json')}));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('FCM payload identifies the account and sends public discovery images through a separate channel',()=>{
  const base={title:pushTitle('manager','Update'),body:privatePushBody('manager','maintenance'),path:destination,tag:'pv:'+notice+':'+account,
    accountKind:'manager',notificationId:notice,contextId:account,discovery:false};
  const privatePayload=androidPushPayload('test-registration-'.repeat(4),base).message;
  assert.equal(privatePayload.android.notification.channelId,'pinevela_accounts');assert.equal(privatePayload.android.notification.visibility,'PRIVATE');
  assert.equal(privatePayload.data.accountKind,'manager');assert.equal(privatePayload.android.priority,'high');
  const rich=androidPushPayload('test-registration-'.repeat(4),{...base,discovery:true,image:'https://pinevela.app/api/device-push/images/listing/'+notice+'.jpg'}).message;
  assert.equal(rich.android.notification.channelId,'pinevela_discoveries');assert.equal(rich.android.priority,'normal');
  assert.equal(rich.notification.image,rich.android.notification.image);
});
function worker(){
  const handlers=new Map<string,(event:any)=>void>(),shown:any[]=[],closed:any[]=[],opened:string[]=[],navigated:string[]=[];
  let windows:any[]=[];
  const context={URL,self:{location:{origin:'https://pinevela.app'},skipWaiting:async()=>{},
    clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async(url:string)=>{opened.push(url);}},
    registration:{showNotification:async(title:string,options:any)=>{shown.push({title,...options});},getNotifications:async()=>shown.map(n=>({close:()=>closed.push(n)}))},
    addEventListener:(name:string,fn:(e:any)=>void)=>handlers.set(name,fn)},fetch:()=>{throw Error('Push must not fetch private APIs.');}};
  vm.runInNewContext(fs.readFileSync('public/sw.js','utf8'),context);
  const dispatch=async(type:string,extra:any)=>{let work:Promise<unknown>|undefined;handlers.get(type)!({...extra,waitUntil:(p:Promise<unknown>)=>work=p});await work;};
  return{shown,closed,opened,navigated,dispatch,window:()=>{windows=[{url:'https://pinevela.app/#/user/dashboard',navigate:async(url:string)=>{navigated.push(url);return{focus:async()=>{}};},focus:async()=>{}}];}};
}
const push={v:1,title:'PineVela · Manager — Update',body:'Open PineVela to read your alert.',tag:'pv:'+notice+':'+account,path:destination};
test('actual service worker displays bounded alerts with same-origin images and no private fetch or persistence',async()=>{
  const w=worker();await w.dispatch('push',{data:{json:()=>({...push,image:'https://pinevela.app/api/device-push/images/listing/'+notice+'.jpg'})}});
  assert.equal(w.shown.length,1);assert.equal(w.shown[0].data.path,destination);assert.match(w.shown[0].image,/^https:\/\/pinevela.app\//);
  await w.dispatch('push',{data:{json:()=>({...push,image:'https://evil.invalid/track.png'})}});assert.equal(w.shown[1].image,undefined);
  for(const invalid of [{...push,path:'https://evil.invalid/'},{...push,path:destination+'&kind=admin'},
    {...push,tag:'unknown'},{...push,v:2},{...push,title:'x'.repeat(201)},{...push,body:'x'.repeat(301)}])await w.dispatch('push',{data:{json:()=>invalid}});
  assert.equal(w.shown.length,2);
  await w.dispatch('push',{data:{json:()=>{throw Error('Bad JSON');}}});assert.equal(w.shown.length,2);
});
test('actual worker opens a fixed app route, reuses an existing app window and clears delivered notices on logout',async()=>{
  const w=worker();let closed=0;
  await w.dispatch('notificationclick',{notification:{data:{path:destination},close:()=>closed++}});
  assert.deepEqual(w.opened,['https://pinevela.app/#'+destination]);w.window();
  await w.dispatch('notificationclick',{notification:{data:{path:destination},close:()=>closed++}});
  assert.deepEqual(w.navigated,['https://pinevela.app/#'+destination]);assert.equal(closed,2);
  await w.dispatch('push',{data:{json:()=>push}});await w.dispatch('message',{data:{type:'pinevela-clear-notifications'}});assert.equal(w.closed.length,1);
});
