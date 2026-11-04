/** Local-only UI reproduction. Backend authority is verified separately with PostgreSQL. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,output,legalAcceptances})=>{
 const baseline=process.env.PINEVELA_MANAGER_BASELINE==='1',measurements=[],terms=[];
 const enter=async(label,value)=>evaluate(`(()=>{const input=[...document.querySelectorAll('input[aria-label]')].find(input=>input.getAttribute('aria-label')===${JSON.stringify(label)});if(!input)throw Error('Missing fixture field: '+${JSON.stringify(label)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
 const next=()=>evaluate(`[...document.querySelectorAll('button')].find(button=>button.textContent.trim()==='Next Step').click()`);
 for(const width of baseline?[1440]:[390,1440])for(const theme of ['light','dark'])await test(`${width} ${theme} manager password eye`,async()=>{
  await viewport(width,900);await load('/#/register-manager',theme,false,{role:'user',selector:'.onboarding-fields'});
  await enter('Manager Full Legal Name','Local Fixture Manager');await enter('Official Residence / Hostel Name','Local Fixture Residence');await next();
  await until(`!!document.querySelector('input[aria-label="Street Address or Plot Number"]')`,'Manager location phase');
  await enter('Street Address or Plot Number','KNUST, Kumasi');await next();
  await until(`!!document.querySelector('input[aria-label="Account Password"]')`,'Manager security phase');
  await enter('Account Password','LocalFixture7!');
  const geometry=()=>evaluate(`(()=>{const input=document.querySelector('input[aria-label="Account Password"]'),button=document.querySelector('button[aria-label$=" password"]'),svg=button.querySelector('svg'),r=button.getBoundingClientRect(),f=input.getBoundingClientRect(),s=getComputedStyle(button);return {pressed:button.getAttribute('aria-pressed'),type:input.type,background:s.backgroundColor,image:s.backgroundImage,color:s.color,iconColor:getComputedStyle(svg).color,x:r.x,right:r.right,width:r.width,centerY:r.y+r.height/2,inputRight:f.right,inputCenterY:f.y+f.height/2,viewport:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}})()`);
  const hidden=await geometry();
  await evaluate(`document.querySelector('button[aria-label="Show password"]').scrollIntoView({block:'center'});document.querySelector('button[aria-label="Show password"]').click()`);
  await until(`document.querySelector('input[aria-label="Account Password"]').type==='text'`,'Password shown');
  const shown=await geometry();await capture(`${width}-${theme}-manager-password-shown`);
  measurements.push({width,theme,hidden,shown});
  if(!baseline){
   assert.equal(hidden.type,'password');assert.equal(hidden.pressed,'false');assert.equal(hidden.background,'rgba(0, 0, 0, 0)');
   assert.equal(shown.background,'rgba(0, 0, 0, 0)');assert.equal(shown.image,'none');assert.equal(hidden.image,'none');assert.equal(hidden.width,shown.width);
   assert.equal(shown.color,shown.iconColor);assert.equal(shown.pressed,'true');assert.equal(shown.overflow,false);
   assert(shown.width>=44&&shown.right<=shown.inputRight+1,'Eye has a contained, usable target');
   assert(Math.abs(shown.centerY-shown.inputCenterY)<1,'Eye stays vertically centered');
   await evaluate(`document.querySelector('button[aria-label="Hide password"]').click()`);
   assert.equal((await geometry()).type,'password');
  }else assert.match(shown.image,/linear-gradient/,'Baseline reproduces a filled selected-state square');
 });
 const termsState=()=>evaluate(`(()=>{const save=document.querySelector('.terms-review-primary');return {gated:!!document.querySelector('.terms-review-card'),button:save?.textContent,disabled:save?.disabled,error:document.querySelector('.terms-review-error')?.textContent||'',dashboard:!!document.querySelector('[data-dashboard-shell]'),hiddenKeyPrompt:!!document.querySelector('[aria-label="Authorize manager action"]'),overflow:document.documentElement.scrollWidth>innerWidth}})()`);
 const assertGatedError=async()=>{const state=await termsState();assert.equal(state.gated,true);assert.equal(state.dashboard,false);assert.equal(state.hiddenKeyPrompt,false);assert.equal(state.disabled,false);assert(state.error);assert.equal(state.overflow,false);return state;};
 for(const width of [390,1440])for(const theme of ['light','dark'])await test(`${width} ${theme} manager Terms first save`,async()=>{
  if(baseline)return;
  await viewport(width,900);await load('/#/manager/dashboard',theme,false,{role:'manager',terms:'pending',selector:'.terms-review-card'});
  await until(`!!document.querySelector('.terms-review-card input[type="checkbox"]')`,'Current manager agreement');
  const before=legalAcceptances.length;assert.equal((await termsState()).dashboard,false,'Product remains gated before explicit consent');
  assert.equal(await evaluate(`document.querySelector('.terms-review-primary').disabled`),true);
  await evaluate(`document.querySelector('.terms-review-primary').click()`);assert.equal(legalAcceptances.length,before,'Unchecked consent cannot write');
  await evaluate(`document.querySelector('.terms-review-card input[type="checkbox"]').click();document.querySelector('.terms-review-primary').click()`);
  await until(`!document.querySelector('.terms-review-card')&&!!document.querySelector('[data-dashboard-shell]')`,'Accepted manager enters product');
  assert.equal(await evaluate(`document.querySelector('h1')?.textContent.includes('agreement')||false`),false);
  assert.equal(legalAcceptances.length-before,1,'One explicit acceptance request');terms.push({scenario:'first save',width,theme,requests:legalAcceptances.length-before,...await termsState()});
  await capture(`${width}-${theme}-manager-terms-accepted`);
 });
 await test('manager Terms legacy-key denial settles without hidden prompt',async()=>{
  await viewport(390,900);await load('/#/manager/dashboard','light',false,{role:'manager',terms:'pending-manager-key',selector:'.terms-review-card'});
  await until(`!!document.querySelector('.terms-review-card input')`,'Manager agreement ready');
  await evaluate(`document.querySelector('.terms-review-card input').click();document.querySelector('.terms-review-primary').click()`);
  if(baseline){await pause(650);assert.equal(await evaluate(`document.querySelector('.terms-review-primary').textContent`),'Saving…');terms.push({scenario:'legacy-key denial',...await termsState()});await capture('manager-saving-before');return;}
  await until(`!!document.querySelector('.terms-review-error')&&!document.querySelector('.terms-review-primary').disabled`,'Legacy key error recovers');
  assert.match(await evaluate(`document.querySelector('.terms-review-error').textContent`),/manager secret key/);
  terms.push({scenario:'legacy-key denial',...await assertGatedError()});await capture('manager-terms-legacy-key-error');
 });
 if(!baseline){
  await test('manager Terms failed save remains gated and can retry',async()=>{
   await viewport(390,900);await load('/#/manager/dashboard','dark',false,{role:'manager',terms:'pending-retry',selector:'.terms-review-card'});
   await until(`!!document.querySelector('.terms-review-card input')`,'Manager agreement ready');
   const before=legalAcceptances.length;await evaluate(`document.querySelector('.terms-review-card input').click();document.querySelector('.terms-review-primary').click()`);
   await until(`!!document.querySelector('.terms-review-error')&&!document.querySelector('.terms-review-primary').disabled`,'Save failure shown');
   terms.push({scenario:'503 error before explicit retry',...await assertGatedError()});assert.equal(legalAcceptances.length-before,1);
   await capture('manager-terms-retry');await evaluate(`document.querySelector('.terms-review-primary').click()`);
   await until(`!document.querySelector('.terms-review-card')&&!!document.querySelector('[data-dashboard-shell]')`,'Explicit retry succeeds');
   assert.equal(legalAcceptances.length-before,2,'Only the explicit retry writes again');terms.push({scenario:'503 explicit retry',requests:legalAcceptances.length-before,...await termsState()});
  });
  await test('manager Terms stalled save times out and stays gated',async()=>{
   await viewport(390,900);await load('/#/manager/dashboard','light',false,{role:'manager',terms:'pending-hang',selector:'.terms-review-card'});
   await until(`!!document.querySelector('.terms-review-card input')`,'Manager agreement ready');const before=legalAcceptances.length;
   const started=Date.now();await evaluate(`document.querySelector('.terms-review-card input').click();document.querySelector('.terms-review-primary').click()`);
   await until(`!!document.querySelector('.terms-review-error')&&!document.querySelector('.terms-review-primary').disabled`,'Stalled save recovers',23_000);
   assert.match(await evaluate(`document.querySelector('.terms-review-error').textContent`),/It may have been saved/);
   const elapsed=Date.now()-started;assert(elapsed>=19_000&&elapsed<23_500,'Production 20 second deadline remains bounded');
   assert.equal(legalAcceptances.length-before,1,'No automatic retry or false consent');terms.push({scenario:'stalled save',elapsedMs:elapsed,requests:legalAcceptances.length-before,...await assertGatedError()});await capture('manager-terms-timeout');
  });
 }
 await fs.writeFile(output+'/manager-measurements.json',JSON.stringify({baseline,localFixturesOnly:true,measurements,terms},null,2)+'\n');
};
