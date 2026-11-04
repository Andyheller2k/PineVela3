/** Reproduce the actual profile-save confirmation against a loopback-only fixture. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,output})=>{
 const measurements=[];
 for(const width of [390,1440])for(const theme of ['light','dark'])for(const role of ['user','student'])await test(`${width} ${theme} profile save confirmation ${role}`,async()=>{
  await viewport(width,900);
  await load(role==='user'?'/#/user/dashboard?tab=options':'/#/resident/dashboard',theme,false,{role,selector:role==='user'?'.user-avatar-selector':'[data-dashboard-shell]'});
  await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]')?.click()`);
  if(role==='student'){
   await evaluate(`(()=>{const e=[...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&(e.textContent.includes('Settings')||e.getAttribute('title')==='Profile & Settings'));if(!e)throw Error('Missing resident settings');e.click()})()`);
   await until(`!!document.querySelector('.user-avatar-selector')`,'Resident avatar form');
  }
  await evaluate(`(()=>{const e=document.querySelector('.user-avatar-selector button:has([data-avatar-preset="pine-emerald"])');e.scrollIntoView({block:'center'});e.click()})()`);
  await until(`!!document.querySelector('.ux-dashboard-toast')`,'Actual profile-save toast');await pause(230);
  const geometry=await evaluate(`(()=>{const e=document.querySelector('.ux-dashboard-toast'),r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,right:r.right,y:r.y,bottom:r.bottom,width:r.width,viewport:innerWidth,height:innerHeight,translate:s.translate,transform:s.transform,text:e.textContent}})()`);
  assert(/profile (avatar|picture) updated successfully/i.test(geometry.text),'The real save callback confirms success');
  assert.equal(await evaluate(`(()=>{const message=document.querySelector('.ux-dashboard-toast').textContent.trim();return [...document.querySelectorAll('h5')].filter(e=>e.textContent.trim()===message).length})()`),0,'A profile change does not emit a second floating confirmation');
  assert(geometry.x>=8&&geometry.right<=geometry.viewport-8,'Confirmation stays inside the screen: '+JSON.stringify(geometry));
  assert(Math.abs((geometry.x+geometry.right)/2-geometry.viewport/2)<=1,'Confirmation is centered');
  assert(geometry.y>=0&&geometry.bottom<=geometry.height,'Confirmation stays vertically visible');
  if(width===390){const navTop=await evaluate(`Math.min(...[...document.querySelectorAll('[data-portal-navigation="mobile"]')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().top),innerHeight)`);assert(geometry.bottom<navTop,'Confirmation clears mobile navigation');}
  measurements.push({width,theme,role,...geometry});await capture(`${width}-${theme}-${role}-profile-confirmation`);
 });
 await fs.writeFile(output+'/profile-toast-measurements.json',JSON.stringify({localProfileFixturesOnly:true,measurements},null,2)+'\n');
};
