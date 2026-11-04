/** Actual browser-return component; local status fixtures, no identity or code transfer. */
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
module.exports=async({viewport,load,evaluate,until,test,capture,pause,output,apiRequests})=>{
 const measurements=[];
 for(const state of ['none','fresh','stale'])await test(`Google return marker ${state}`,async()=>{
  const before=apiRequests.filter(path=>path==='/api/auth/mobile/status').length;
  await viewport(390,780);
  await load('/#/user/dashboard','light',false,{role:'user',selector:'.user-dashboard',mobileReturn:state==='none'?undefined:state});
  await evaluate(`document.querySelector('dialog[aria-label="Welcome to PineVela"] [aria-label="Close dialog"]')?.click()`);
  const dialog=`document.querySelector('dialog[aria-label="Continue in PineVela Android"]')`;
  if(state==='none'){
   await pause(450);assert.equal(await evaluate(`!!${dialog}`),false);
   assert.equal(apiRequests.filter(path=>path==='/api/auth/mobile/status').length,before,'Ordinary web entry does not request a native return');
  }else{
   await until(`!!${dialog}`,'Google return prompt without a mobile query');
   assert.equal(await evaluate(`location.hash.includes('mobile=1')`),false);
   const text=await evaluate(`${dialog}.textContent`);
   assert(text.includes(state==='fresh'?'Continue in the app':'Sign out and sign in again'));
   assert.equal(apiRequests.includes('/api/auth/mobile/finish'),false,'Showing the prompt does not transfer the account');
   await capture(`google-return-${state}`);
   await evaluate(`[...${dialog}.querySelectorAll('button')].find(button=>button.textContent==='Stay in browser').click()`);
   await until(`!${dialog}`,'Return prompt closes');
   assert.equal(await evaluate(`sessionStorage.getItem('pinevela:mobile-handoff-active')`),null);
  }
  measurements.push({state,passed:true,noAccountTransfer:true});
 });
 await fs.writeFile(output+'/google-return-measurements.json',JSON.stringify({localStatusFixturesOnly:true,measurements},null,2)+'\n');
};
