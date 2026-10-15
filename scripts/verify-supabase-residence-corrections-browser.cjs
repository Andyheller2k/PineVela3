/** Real administrator session; denied manager operations only. No credentials
 * leave the browser, and no live residence/application is created or altered. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
let checks=0,stage='approved browser';
const ui=process.argv[2]==='--ui';
assert(process.argv.length<=3&&(!process.argv[2]||ui),'Optional --ui only');
(async()=>{
 await withApprovedPineVelaBrowser(async({evaluate,navigate,waitFor,command})=>{
  stage='verified administrator';
  const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();return{status:r.status,role:u.role,verified:!!u.isVerified};})()");
  assert(me.status===200&&me.role==='admin'&&me.verified,'A genuine administrator is required');checks++;
  for(const [route,method]of[['/api/manager/residence-registration','GET'],['/api/manager/my-hostel','GET'],['/api/hostels/register','POST'],['/api/manager-verifications/submit','POST'],['/api/auth/enrollments/policy','GET'],['/api/auth/enrollments/google/start','POST']]){
   stage='manager role boundary';
   const result=await evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{method:${JSON.stringify(method)},credentials:'same-origin',signal:AbortSignal.timeout(45000),${method==='POST'?"headers:{'content-type':'application/json'},body:'{}',":''}});const data=await r.json();return{status:r.status,error:typeof data.error==='string'};})()`);
   assert(result.status===403&&result.error,'Administrator sign-in cannot impersonate a manager');checks++;
  }
  stage='stale administrator account guard';
  const stale=await evaluate("(async()=>{const r=await fetch('/api/manager-verifications/00000000-0000-4000-8000-000000000000/request-info',{method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json','X-PineVela-Profile-Context':'00000000-0000-4000-8000-000000000000'},body:JSON.stringify({adminNotes:'Stale account denial check'}),signal:AbortSignal.timeout(45000)});const data=await r.json();return{status:r.status,error:typeof data.error==='string'};})()");
  assert(stale.status===409&&stale.error,'An administrator decision cannot silently use a different captured account');checks++;
  let residences=null,reviewOpened=false;
  if(ui){
   stage='private residence roster';
   const roster=await evaluate("(async()=>{const r=await fetch('/api/admin/hostels',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const rows=await r.json();return{status:r.status,array:Array.isArray(rows),count:Array.isArray(rows)?rows.length:null};})()");
   assert(roster.status===200&&roster.array,'Actual administrator can read the private residence directory');checks++;residences=roster.count;
   await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
   await navigate('/#/admin/dashboard');
   const navigation="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&/^(Available Residences|Residences)/.test(b.textContent.trim()))";
   await waitFor('!!('+navigation+')','Residences navigation');await evaluate('('+navigation+').click()');
   await waitFor('!!document.querySelector(\'[role="region"][aria-label="Residence directory"]\')','Actual residence directory');checks++;
   for(const [width,height]of[[1440,900],[375,812]]){
    stage='residence directory '+width;
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await waitFor('innerWidth==='+width,'Directory viewport');
    const state=await evaluate("(()=>{const visible=[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0);return{bounded:document.documentElement.scrollWidth<=innerWidth+1,rejected:visible.some(b=>b.textContent.trim().startsWith('Rejected (')),categories:['Hostels','Inns','Hotels','Estates'].every(t=>visible.some(b=>b.textContent.trim()===t))};})()");
    assert(state.bounded&&state.rejected&&state.categories,'Actual directory filters remain available without horizontal overflow');checks++;
   }
   if(residences>0){
    stage='real residence review';
    const open="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&/^(Review Registration|View Registration|Details)$/.test(b.textContent.trim()))";
    await waitFor('!!('+open+')','Existing residence review action');await evaluate('('+open+').click()');
    await waitFor('!!document.querySelector(\'section[aria-label="Configured residence capacity"]\')','Saved residence review details');
    const state=await evaluate("(()=>{const d=document.querySelector('dialog[aria-label=\"Review residence registration\"]');const select=d?.querySelector('select');return{dialog:!!d,bounded:d?d.scrollWidth<=d.clientWidth+1:false,explicit:!select||select.value===''};})()");
    assert(state.dialog&&state.bounded&&state.explicit,'Actual review details load and require an explicit decision');checks++;reviewOpened=true;
   }
  }
  const result={passed:true,checks,genuineAdministrator:true,actualReplies:true,managerRoleDenialsVerified:true,staleAdministratorDecisionDenied:true,credentialsExtracted:false,providerRepliesMocked:false,cloudProductMutations:0,genuinePositiveManagerAcceptancePending:true,
   directoryUiVerified:ui,responsiveWidths:ui?[1440,375]:[],realResidenceRows:residences,populatedReviewUiVerified:reviewOpened};
  const directory=path.resolve('.security/migration-reset/browser-acceptance-20261014');await fs.mkdir(directory,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(directory,'residence-corrections-administrator-denials.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(result));
 });
})().catch(error=>{console.error(JSON.stringify({passed:false,stage,checks,error:error.message,credentialsExtracted:false}));process.exitCode=1;});
