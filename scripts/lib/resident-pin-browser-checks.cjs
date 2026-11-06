/** Local UI fixtures only. Actual Auth, allocation and RLS checks run separately. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const {createHash}=require('node:crypto');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,output,residentPinRequests})=>{
 const measurements=[];
 const sourceFiles=['src/components/PageUnifiedLogin.tsx','src/components/PageUserDashboard.tsx','src/components/ResidentPinReset.tsx','src/components/SupabaseResidentActivation.tsx','src/context/AuthContext.tsx','dist-supabase/index.html'];
 const fingerprints=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(file)).digest('hex')])));
 const sourceSha256=await fingerprints();
 const fill=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const clickText=text=>evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()===${JSON.stringify(text)}&&e.getClientRects().length);if(!e)throw Error('Missing button: '+${JSON.stringify(text)});e.click();})()`);
 const resetGeometry=async()=>{
  await pause(180);
  const bounds=await evaluate(`(()=>{const d=document.querySelector('dialog[aria-label="Reset room PIN"]'),card=d.querySelector('[data-popup-card]'),rect=e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}};return{width:innerWidth,height:innerHeight,dialog:rect(d),card:rect(card),scrollWidth:card.scrollWidth,clientWidth:card.clientWidth,controls:[...card.querySelectorAll('input,button')].map(rect)}})()`);
  for(const r of [bounds.dialog,bounds.card,...bounds.controls])assert(r.left>=-1&&r.right<=bounds.width+1,'Reset popup and controls fit the phone width');
  assert(bounds.card.top>=-1&&bounds.card.bottom<=bounds.height+1,'Reset popup fits the visible height');
  assert(bounds.scrollWidth<=bounds.clientWidth+1,'Long account email cannot widen the reset card');
  return bounds;
 };
 const geometry=async(selector,theme)=>{
  await pause(200);
  const r=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect(),s=getComputedStyle(e);return{theme:document.documentElement.dataset.theme,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,left:r.left,right:r.right,image:s.backgroundImage,color:s.color}})()`);
  assert.equal(r.theme,theme);assert(!r.overflow&&r.left>=0&&r.right<=r.width+1,'Form fits the viewport');
  assert(r.image.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 195, 0)'),'Primary button uses the PineVela theme');
  return r;
 };
 for(const width of [320,390,1440])for(const theme of ['light','dark']){
  await test(`${width}px ${theme} resident PIN login form`,async()=>{
   await viewport(width);await load('/#/login',theme,false,{selector:'.login-credentials-form'});
   assert(!await evaluate(`!![...document.querySelectorAll('.login-credentials-form button')].find(e=>['Email & password','Resident room PIN'].includes(e.textContent.trim()))`),'No authentication-method switch is rendered');
   const credential='input[aria-label="Password"]',email='input[aria-label="Email address"]';
   assert(await evaluate(`!![...document.querySelectorAll('.login-credentials-form label')].find(e=>e.textContent.trim()==='Password')`),'The shared credential label remains Password');
   const field=await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(credential)});return{pattern:e.pattern,maxLength:e.maxLength,type:e.type}})()`);
   assert.equal(field.pattern,'');assert.equal(field.type,'password');assert.equal(field.maxLength,256);
   await fill(email,'resident.visual@pinevela.invalid');
   for(const value of ['812946','MyPrimary!Password49']){
    await fill(credential,value);const before=residentPinRequests.length;
    await evaluate(`document.querySelector('.login-credentials-form').requestSubmit()`);
    await until(`document.body.textContent.includes('Visual fixture submission received.')`,'Server denial is readable');
    const sent=residentPinRequests.slice(before).find(r=>r.route==='/api/auth/login');assert(sent&&sent.body.usernameOrEmail==='resident.visual@pinevela.invalid'&&sent.body.password===value);
    assert(!('accountKind' in sent.body)&&!('authentication' in sent.body)&&!('pin' in sent.body),'One unchanged form submits either credential to the normal login endpoint');
   }
   measurements.push({page:'login',...await geometry('.login-credentials-form button[type=submit]',theme)});await capture(`${width}-${theme}-unified-login`);
  });
  await test(`${width}px ${theme} resident PIN activation form`,async()=>{
   await viewport(width);await load('/#/user/dashboard',theme,false,{role:'user',selector:'.user-dashboard [data-dashboard-view]'});
   if(await evaluate(`!!document.querySelector('dialog[aria-label="Welcome to PineVela"]')`))await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]').click()`);
   await evaluate(width<1024?`document.querySelector('[data-navigation-id="options"]').click()`:`document.querySelector('[data-user-navigation][title="Options Tab"]').click()`);
   await until(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Activate Room Key Now'&&e.getClientRects().length)`,'Options activation');await clickText('Activate Room Key Now');
   await until(`!!document.getElementById('resident-activation-key')`,'Activation dialog');await fill('#resident-activation-key','PV101X');await clickText('Check room key');
   await until(`!!document.getElementById('resident-new-pin')`,'Room PIN form');
   assert(!await evaluate(`!!document.querySelector('[aria-label="Activate resident account"] input[type=email]')`),'No additional mailbox is required');
   assert(!await evaluate(`!![...document.querySelectorAll('[aria-label=\"Activate resident account\"] button')].find(e=>/reset|forgot/i.test(e.textContent))`),'Unactivated setup never offers a PIN reset control');
   await fill('#resident-new-pin','812946');await fill('#resident-confirm-pin','812947');
   const before=residentPinRequests.length;await clickText('Activate my room');await until(`document.querySelector('#resident-pin-error')?.textContent.includes('do not match')`,'Inline confirmation error');
   assert.equal(residentPinRequests.length,before,'Mismatch makes no activation request');await fill('#resident-confirm-pin','812946');await clickText('Activate my room');
   await until(`document.querySelector('#resident-pin-error')?.textContent.includes('Visual fixture submission received.')`,'Inline server error');
   const sent=residentPinRequests.slice(before).find(r=>r.route==='/api/auth/resident-activate');assert.deepEqual(sent?.body,{pin:'812946',roomKey:'PV101X'});
   measurements.push({page:'activation',...await geometry('[aria-label="Activate resident account"] button[type=submit],[aria-label="Activate resident account"] form button:not([type])',theme)});await capture(`${width}-${theme}-resident-pin-activation`);
  });
 }
 for(const width of [320,390,1440])for(const theme of ['light','dark'])for(const state of ['none','pending','closed','active'])await test(`${width}px ${theme} active room PIN ${state}`,async()=>{
  await viewport(width);await load('/#/user/dashboard',theme,false,{role:'user',setup:'resident-'+state,selector:'.user-dashboard [data-dashboard-view]'});
  if(await evaluate(`!!document.querySelector('dialog[aria-label="Welcome to PineVela"]')`))await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]').click()`);
  const tab=id=>evaluate(width<1024?`document.querySelector('[data-navigation-id="${id}"]').click()`:`document.querySelector('[data-user-navigation][title="${id==='options'?'Options Tab':state==='active'?'Resident Room':'Log Into Your Room'}"]').click()`);
  await tab('options');await until(`document.querySelector('[data-dashboard-view]')?.dataset.dashboardView==='options'`,'Settings open');
  await pause(150);
  assert(!await evaluate(`!!document.querySelector('[data-room-pin-reset]')`),'Settings has no duplicate reset control');
  if(state==='active'){
   await until(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Manage active room'&&e.getClientRects().length)`,'Registered active room is loaded');
   await clickText('Manage active room');await until(`!!document.querySelector('[data-active-room-status] [data-room-pin-reset]')`,'Active room reset action');
   assert(await evaluate(`(()=>{const e=document.querySelector('[data-active-room-status] [data-resident-login-steps]');return !!e&&e.querySelectorAll('li').length===3&&e.textContent.includes('primary email')&&e.textContent.includes('room PIN in the Password field')&&e.textContent.includes('Tap Login.');})()`),'The active room card gives three short sign-in steps');
   await clickText('Reset room PIN');await until(`!!document.querySelector('dialog[aria-label="Reset room PIN"]')`,'Reset dialog');
   measurements.push({page:'reset-form',theme,...await resetGeometry()});
   measurements.push({page:'reset-action',...await geometry('dialog[aria-label="Reset room PIN"] form button',theme)});
   await capture(`${width}-${theme}-active-room-pin-form`);
   await fill('input[aria-label="New room PIN"]','732491');await fill('input[aria-label="Confirm new room PIN"]','732491');
   const before=residentPinRequests.length;await evaluate(`document.querySelector('dialog[aria-label="Reset room PIN"] form').requestSubmit()`);
   await until(`document.querySelector('dialog[aria-label="Reset room PIN"]')?.textContent.includes('Your room PIN is reset.')`,'Reset saved');
   const sent=residentPinRequests.slice(before).find(r=>r.route==='/api/auth/resident-pin/reset');assert.deepEqual(sent?.body,{newPin:'732491'});
   assert(!await evaluate(`document.querySelector('dialog[aria-label="Reset room PIN"]').textContent.includes('with Resident room PIN')`),'Reset confirmation uses the single login form');
   measurements.push({page:'reset-success',theme,...await resetGeometry()});
   await capture(`${width}-${theme}-active-room-pin-reset`);
  }else{
   assert(!await evaluate(`!![...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Manage active room')`),'Inactive accounts have no active-room settings shortcut');
   await tab('login-room');await until(`document.querySelector('[data-dashboard-view]')?.dataset.dashboardView==='login-room'`,'Room tab');
   assert(!await evaluate(`!!document.querySelector('[data-room-pin-reset]')`),'No PIN reset exists without an activated resident room');
   assert(!await evaluate(`!!document.querySelector('[data-resident-login-steps]')`),'Inactive rooms do not show active-room sign-in instructions');
  }
 });
 assert.deepEqual(await fingerprints(),sourceSha256,'The verified sources and entry build remain unchanged throughout the scenarios');
 await fs.writeFile(output+'/resident-pin-ui.json',JSON.stringify({passed:true,localVisualFixturesOnly:true,cloudWrites:0,sourceSha256,measurements},null,2)+'\n');
};
