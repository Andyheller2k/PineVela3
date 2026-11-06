import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync('public/analytics.js','utf8'),ID='G-NWBP5E04F9',KEY='pinevela:analytics-consent';
function browser(url='https://pinevela.app/#/',choice:any='granted',referrer='https://www.google.com/search?q=private',gpc=false){
  const storage=new Map<string,string>();if(choice!==undefined)storage.set(KEY,JSON.stringify(typeof choice==='string'?{version:1,analytics:choice}:choice));
  const listeners=new Map<string,Function>(),scripts:any[]=[],cookies=new Map([['_ga','old-id'],['_ga_NWBP5E04F9','old-session'],['appearance','dark']]);
  const location=new URL(url),window:any={location,localStorage:{getItem:(key:string)=>storage.get(key)||null,setItem:(key:string,value:string)=>storage.set(key,value)},
    addEventListener:(event:string,handler:Function)=>listeners.set(event,handler),dispatchEvent:()=>true};
  const document:any={readyState:'complete',body:null,referrer,head:{appendChild:(script:any)=>scripts.push(script)},
    addEventListener:()=>{},createElement:()=>({}),getElementById:()=>null,title:'Private person private@example.test'};
  Object.defineProperty(document,'cookie',{get:()=>[...cookies].map(([k,v])=>k+'='+v).join('; '),set:(v:string)=>{const name=v.split('=')[0];if(v.includes('Max-Age=0'))cookies.delete(name);}});
  const context=vm.createContext({window,location,document,localStorage:window.localStorage,navigator:{globalPrivacyControl:gpc},URL,URLSearchParams,Event,Element:class{}});
  vm.runInContext(source,context);
  return {window,location,document,scripts,cookies,context,storage,change:(value:any)=>{storage.set(KEY,JSON.stringify(value));listeners.get('storage')!({key:KEY});},
    commands:()=>Array.from(window.dataLayer||[],(entry:any)=>Array.from(entry)),
    views:()=>Array.from(window.dataLayer||[],(entry:any)=>Array.from(entry)).filter((c:any)=>c[0]==='event'&&c[1]==='page_view') as any[]};
}

test('unknown, invalid and declined choices never load a Google tag or queue views',()=>{
  for(const choice of [null,{version:2,analytics:'granted'},{version:1,analytics:true},'denied']){
    const b=browser(undefined,choice);assert.equal(b.scripts.length,0);assert.equal(b.views().length,0);assert.equal(b.window['ga-disable-'+ID],true);
  }
});
test('explicit analytics permission enables one configured stream with advertising denied',()=>{
  const b=browser();assert.equal(b.scripts.length,1);assert.equal(b.scripts[0].src,'https://www.googletagmanager.com/gtag/js?id='+ID);
  assert.equal(b.scripts[0].referrerPolicy,'no-referrer');
  const config=b.commands().find((c:any)=>c[0]==='config') as any;
  assert.equal(config[1],ID);assert.equal(config[2].send_page_view,false);assert.equal(config[2].allow_google_signals,false);assert.equal(config[2].allow_ad_personalization_signals,false);
  assert.equal(config[2].cookie_expires,2592000);assert.equal(config[2].cookie_update,false);
  const consent=b.commands().filter((c:any)=>c[0]==='consent');assert.equal(consent.length,2);
  for(const c of consent){for(const field of ['ad_storage','ad_user_data','ad_personalization'])assert.equal((c[2] as any)[field],'denied');}
  assert.equal(b.views().length,1);
});
test('only general allowlisted pages, sanitized store paths and origin-only sources are sent',()=>{
  const b=browser('https://pinevela.app/?utm_source=private@example.test#/pinemarket/stores/private-store-uuid?search=room-secret','granted');
  const event=b.views()[0][2];assert.equal(event.page_location,'https://pinevela.app/pinemarket/stores/store');assert.equal(event.page_title,'PineVela | Marketplace store');
  assert.equal(event.page_referrer,'https://www.google.com/');
  const payload=JSON.stringify(b.commands());for(const value of ['private@example.test','private-store-uuid','room-secret','Private person','search?q='])assert(!payload.includes(value));
  assert(!payload.includes('user_id'));assert(!payload.includes('user_properties'));
});
test('authentication, enrollment, payment, unknown and sensitive-query pages are excluded',()=>{
  for(const path of ['/#/login','/#/login?code=private','/#/register-manager','/#/digital-market/onboard','/#/payments/return?reference=private',
    '/#/staff-invitation?token=private','/#/officer-invitation','/#/admin-invitation','/#/manager-google-result',
    '/#/pinemarket?roomKey=private','/?email=private@example.test#/','/#/user/dashboard?pin=private','/#/unknown-private-screen','/api/auth/google/callback?code=private']){
    const b=browser('https://pinevela.app'+path);assert.equal(b.scripts.length,0,path);assert.equal(b.views().length,0,path);
  }
});
test('refreshes and policy anchors do not double count; actual route changes do',()=>{
  const b=browser();b.window.PineVelaAnalytics.refresh();b.window.PineVelaAnalytics.refresh();assert.equal(b.views().length,1);
  b.location.hash='#/pinemarket';b.window.PineVelaAnalytics.refresh();b.window.PineVelaAnalytics.refresh();assert.equal(b.views().length,2);
  assert.equal(b.views()[1][2].page_referrer,'https://pinevela.app/');
  b.location.hash='#/pinemarket/stores/first';b.window.PineVelaAnalytics.refresh();b.location.hash='#/pinemarket/stores/second';b.window.PineVelaAnalytics.refresh();assert.equal(b.views().length,4);
  const legal=browser('https://pinevela.app/privacy.html#choices');legal.location.hash='#analytics';legal.window.PineVelaAnalytics.refresh();assert.equal(legal.views().length,1);
});
test('withdrawal stops future events, clears only analytics cookies and permits later opt-in once',()=>{
  const b=browser();b.change({version:1,analytics:'denied'});assert.equal(b.window['ga-disable-'+ID],true);
  assert.equal(b.cookies.has('_ga'),false);assert.equal(b.cookies.has('_ga_NWBP5E04F9'),false);assert.equal(b.cookies.get('appearance'),'dark');
  b.location.hash='#/pinemarket';b.window.PineVelaAnalytics.refresh();assert.equal(b.views().length,1);
  b.change({version:1,analytics:'granted'});assert.equal(b.scripts.length,1);assert.equal(b.views().length,2);assert.equal(b.views()[1][2].page_location,'https://pinevela.app/pinemarket');
});
test('sensitive routes disable an already-loaded tag and never become a referrer',()=>{
  const b=browser();b.location.hash='#/login?token=private';b.window.PineVelaAnalytics.refresh();assert.equal(b.window['ga-disable-'+ID],true);assert.equal(b.views().length,1);
  b.location.hash='#/faq';b.window.PineVelaAnalytics.refresh();assert.equal(b.views().length,2);assert.equal(b.views()[1][2].page_referrer,'https://pinevela.app/');
  assert(!JSON.stringify(b.commands()).includes('token=private'));
});
test('preview/development and browser privacy signals do not collect data',()=>{
  for(const host of ['http://localhost:3000/#/','http://127.0.0.1:3000/#/','https://preview.pinevela.app/#/','https://pinevela.app.evil.invalid/#/','https://pinevela.app:444/#/'])assert.equal(browser(host).scripts.length,0);
  const b=browser(undefined,'granted','',true);assert.equal(b.scripts.length,0);assert.equal(b.window.PineVelaAnalytics.choice(),'denied');
});
test('repeated bootstrap inclusion keeps one controller and one tag',()=>{
  const b=browser(),original=b.window.PineVelaAnalytics;vm.runInContext(source,b.context);assert.equal(b.window.PineVelaAnalytics,original);assert.equal(b.scripts.length,1);
});
test('a blocked tag stops queue growth and never starts retries',()=>{
  const b=browser();b.scripts[0].onerror();const commands=b.commands().length;
  b.location.hash='#/pinemarket';b.window.PineVelaAnalytics.refresh();b.location.hash='#/faq';b.window.PineVelaAnalytics.refresh();
  assert.equal(b.scripts.length,1);assert.equal(b.views().length,1);assert.equal(b.commands().length,commands);
  assert.equal(b.window['ga-disable-'+ID],true);
});
test('standalone policy documents and the app include the shared bootstrap once',()=>{
  for(const file of ['index.html','public/privacy.html','public/terms.html','public/legal/terms-2026-10-27.html','public/legal/terms-2026-11-05.html']){
    const html=fs.readFileSync(file,'utf8');assert.equal((html.match(/src="\/analytics\.js"/g)||[]).length,1);assert(!html.includes('googletagmanager.com/gtag/js'));
  }
});
