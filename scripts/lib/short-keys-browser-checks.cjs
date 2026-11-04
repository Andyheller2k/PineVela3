const assert=require('node:assert/strict');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,managerCodeRotations})=>{
 for(const theme of ['light','dark'])await test(`390px ${theme} manager code replacement and one-time save`,async()=>{
  await viewport(390,844);await load('/#/manager/dashboard',theme,false,{role:'manager',selector:'[data-dashboard-shell]'});
  await until(`!!document.querySelector('[data-navigation-id="settings"]')`,'Manager Settings destination');
  await evaluate(`document.querySelector('[data-navigation-id="settings"]').click()`);
  await until(`!!document.querySelector('[aria-label="Manager authorization code"] button')`,'Manager code settings');
  const before=managerCodeRotations.length;
  await evaluate(`document.querySelector('[aria-label="Manager authorization code"] button').click()`);
  await until(`!!document.querySelector('[aria-label="Authorize manager action"] input')`,'Current key challenge');
  const submit=async value=>{
   await evaluate(`(()=>{const e=document.querySelector('[aria-label="Authorize manager action"] input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);
   await evaluate(`document.querySelector('[aria-label="Authorize manager action"] form').requestSubmit()`);
  };
  await submit('111111');
  await until(`!!document.querySelector('[aria-label="Authorize manager action"] [role="alert"]')`,'Wrong code stays in its field');
  assert.match(await evaluate(`document.querySelector('[aria-label="Authorize manager action"] [role="alert"]').textContent`),/Invalid manager/);
  await until(`!document.querySelector('[aria-label="Authorize manager action"] button[type="button"]').disabled`,'Challenge ready for a correct proof');
  await submit('L'.repeat(43));
  await until(`!!document.querySelector('[aria-label="Your manager authorization code"]')`,'New one-time six-digit card');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Your manager authorization code"]').value`),'246802');
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="Authorize manager action"]')`),false,'The successful challenge closes once');
  assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);
  const contrast=await evaluate(`(()=>{const card=document.querySelector('[aria-label="Save your manager authorization code"]'),button=[...card.querySelectorAll('button')].find(b=>b.textContent==='Continue'),s=getComputedStyle(button);return{background:s.backgroundColor,image:s.backgroundImage,color:s.color}})()`);
  const paint=contrast.image==='none'?contrast.background:contrast.image;
  assert(paint.includes(theme==='light'?'rgb(0, 53, 102)':'rgb(255, 214, 10)'),'Save action uses the blue/gold product paint');
  assert.equal(contrast.color,theme==='light'?'rgb(255, 255, 255)':'rgb(0, 29, 61)','Save label contrasts with its theme paint');
  await capture(`390-${theme}-manager-six-digit-save`);
  assert.deepEqual(managerCodeRotations.slice(before).map(r=>r.status),[403,403,200],'One challenge, one wrong proof and one successful proof');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Save your manager authorization code"] button:last-child').disabled`),true);
  await evaluate(`document.querySelector('[aria-label="Save your manager authorization code"] input[type="checkbox"]').click();document.querySelector('[aria-label="Save your manager authorization code"] button:last-child').click()`);
  await until(`!document.querySelector('[aria-label="Save your manager authorization code"]')`,'Acknowledged code card closes');
  await pause(300);assert.equal(managerCodeRotations.length,before+3,'Saving does not repeat rotation');
 });
};
