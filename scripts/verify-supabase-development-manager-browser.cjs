/** Genuine Google manager acceptance for the already approved development shell.
 * Reads only. Never issues, reads, copies or enters an operation key, creates
 * housing data, follows provider pages, or changes the user's original tabs. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const root='.security/migration-reset/',reportPath=root+'development-manager-browser.json';
let checks=0,stage='prepared genuine manager session',lastState;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
(async()=>{
 const approved=JSON.parse(await fs.readFile(root+'development-manager-approval.json','utf8'));
 await withApprovedPineVelaBrowser(async({base,evaluate,navigate,waitFor,command,onEvent})=>{
  const writes=[],reads=[],pendingReads=new Map();
  const dashboardPaths=new Set(['/api/hostels','/api/manager/my-hostel','/api/issue-reports','/api/staff','/api/staff/invitations','/api/staff-bargains','/api/board-requests','/api/activities','/api/room-keys']);
  onEvent(event=>{
   if(event.method==='Network.requestWillBeSent'){
    const r=event.params.request,u=new URL(r.url);if(u.origin===base&&!['GET','HEAD','OPTIONS'].includes(r.method)&&
     /^\/api\/(?:manager\/|hostels|hostel-verifications|staff|issue-reports|room-keys|auth\/profile)/.test(u.pathname))writes.push(u.pathname);
    if(u.origin===base&&dashboardPaths.has(u.pathname))pendingReads.set(event.params.requestId,{path:u.pathname,startedMs:event.params.timestamp*1000});
   }
   if(event.method==='Network.responseReceived'){
    const r=event.params.response,u=new URL(r.url),pending=pendingReads.get(event.params.requestId);if(u.origin===base&&dashboardPaths.has(u.pathname)){reads.push({path:u.pathname,status:r.status,startedMs:pending?.startedMs,finishedMs:event.params.timestamp*1000});pendingReads.delete(event.params.requestId);console.log(JSON.stringify({stage:'native dashboard read',path:u.pathname,status:r.status}));}
   }
  });
  await command('Network.enable');
  const me=()=>evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)}),u=await r.json();return{status:r.status,id:u.id,profileId:u.profileId,email:u.email,name:u.name,role:u.role,verified:u.isVerified===true};})()");
  const actor=await me();
  check(actor.status===200&&actor.role==='manager'&&actor.verified&&actor.email==='mindspacehqr@gmail.com','The exact real Google manager is signed in and verified.');
  check(actor.id===approved.managerId&&actor.id!==actor.profileId,'The saved manager context is separate from its Auth profile.');
  const read=(path,guest=false)=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{credentials:${JSON.stringify(guest?'omit':'same-origin')},signal:AbortSignal.timeout(90000)});return{status:r.status,data:await r.json()};})()`);
  stage='native owned property and private key setup status';
  const [owned,key]=await Promise.all([read('/api/manager/my-hostel'),read('/api/manager/secret-key')]);
  const property=owned.data.hostel;
  check(owned.status===200&&owned.data.success&&property?.id===approved.residenceId&&property.managerId===actor.id&&property.name==='Premuim Pine','The native manager endpoint derives the exact saved property assignment.');
  check(property.status==='approved'&&property.registrationRequired===true&&property.isApproved===false,'Manager approval preserves the separate residence setup and publication gate.');
  check(property.totalRooms===0&&property.totalBeds===0,'The actual development shell contains no invented rooms or beds.');
  check(key.status===200&&key.data.available&&key.data.hasResidence&&!key.data.issueRequired,'The manager has completed the genuine private key issuance before opening a task dashboard.');
  stage='native role and unpublished-property boundaries';
  const [guest,...denied]=await Promise.all([read('/api/manager/my-hostel',true),
   ...['/api/admin/all-users','/api/admin/verification-inspections','/api/verification-team/my-inspections'].map(path=>read(path))]);
  check(guest.status===401,'A guest cannot read the private manager property.');
  denied.forEach(reply=>check(reply.status===403,'The manager cannot read an administrator or officer-only resource.'));
  const unpublished=await read('/api/hostels/'+approved.residenceId,true);
  check(unpublished.status===404,'The unreviewed residence is unavailable through its public detail endpoint.');
  const ready="location.hash.split('?')[0]==='#/manager/dashboard'&&document.body.textContent.includes('Manager Dashboard')&&document.body.textContent.includes('Complete residence registration')&&document.body.textContent.includes('Premuim Pine')";
  stage='actual manager dashboard';await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const started=Date.now(),readStart=reads.length;
  await navigate('/?developmentManagerAcceptance='+Date.now()+'#/manager/dashboard');
  try{await waitFor("!!document.querySelector('[role=dialog][aria-label=\"Save your manager secret key\"]')||("+ready+")",'Actual manager dashboard',240000);}
  catch(error){lastState=await evaluate("({route:location.hash.split('?')[0],sessionRetry:!!document.querySelector('#session-retry-title'),dashboardRetry:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Retry dashboard'),keyDialog:!!document.querySelector('[role=dialog][aria-label=\"Save your manager secret key\"]')})").catch(()=>null);throw error;}
  check(!(await evaluate("!!document.querySelector('[role=dialog][aria-label=\"Save your manager secret key\"]')")),'No secret key is issued or displayed in the task tab.');
  const dashboardReadyMs=Date.now()-started;
  check([...dashboardPaths].every(path=>reads.slice(readStart).some(r=>r.path===path&&r.status===200)),'Every real initial dashboard dataset loaded successfully.');
  const initial=reads.slice(readStart),starts=initial.filter(r=>r.path==='/api/hostels').map(r=>r.startedMs).sort((a,b)=>a-b);
  const concurrentReads=starts.some((start,index)=>{const batch=[...dashboardPaths].map(path=>initial.find(r=>r.path===path&&r.status===200&&r.startedMs>=start-1&&r.startedMs<(starts[index+1]??Infinity)-1));
   return batch.every(Boolean)&&Math.max(...batch.map(r=>r.startedMs))<Math.min(...batch.map(r=>r.finishedMs));});
  check(concurrentReads,'All nine genuine successful dashboard reads overlap instead of loading sequentially.');
  const responsive=[];
  for(const [width,height]of[[1440,900],[375,812]]){
   stage='approved manager shell at '+width+'px';await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
   lastState=await evaluate(`(()=>{const main=document.querySelector('main'),action=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Complete Registration'),r=action?.getBoundingClientRect();
    const navigation=${width<600}?document.querySelector('nav[aria-label="Manager navigation"]'):[...document.querySelectorAll('aside,nav')].find(n=>n.getBoundingClientRect().width>0&&n.querySelector('button[title="My Properties"],button[aria-label="Properties"]'));
    const locked=navigation?[...navigation.querySelectorAll('button')].filter(b=>['My Properties','Blocks & Rooms','Staff Management','Maintenance Hub'].includes(b.title)||/^(Properties|Blocks|Staff|Fixes)(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||'')||['properties','maintenance'].includes(b.dataset.navigationId)):[];
    return{width:${width},setupHonest:main?.textContent.includes('Your manager account is verified. Add the property photographs and actual room configuration for residence review.'),
     propertyVisible:main?.textContent.includes('Premuim Pine'),setupActionReady:!!action&&!action.disabled,
     actionBounded:!!r&&r.left>=-1&&r.right<=innerWidth+1,viewportBounded:document.documentElement.scrollWidth<=innerWidth+1,
     operationalControlsLocked:locked.length>=2&&locked.every(b=>b.disabled),lockedControls:locked.map(b=>({label:b.title||b.getAttribute('aria-label'),disabled:b.disabled})),noSecretDialog:!document.querySelector('[role=dialog][aria-label="Save your manager secret key"]')};})()`);
   check(lastState.setupHonest&&lastState.propertyVisible&&lastState.setupActionReady,'The real dashboard identifies the saved property and asks for actual residence setup.');
   check(lastState.operationalControlsLocked,'Housing operations remain locked until separate residence review.');
   check(lastState.actionBounded&&lastState.viewportBounded&&lastState.noSecretDialog,'The setup action and manager page fit without exposing a key.');responsive.push(lastState);
  }
  stage='read-only manager profile';
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const settings="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&b.title==='Manager Profile Settings')";
  await waitFor('!!('+settings+')','Manager profile navigation',15000);await evaluate('('+settings+').click()');
  await waitFor("!!document.querySelector('section[aria-label=\"Manager Profile Settings\"]')",'Actual manager profile',15000);
  check(await evaluate("(()=>{const s=document.querySelector('section[aria-label=\"Manager Profile Settings\"]'),e=s.querySelector('input[aria-label=\"Account Email (Verified Login)\"]');return e?.value==='mindspacehqr@gmail.com'&&(e.readOnly||e.disabled);})()"),'The manager profile displays the actual immutable login email.');
  stage='genuine manager full reload';await command('Page.reload',{ignoreCache:true});
  await waitFor(ready,'The same saved manager dashboard after reload',240000);
  const after=await me();check(after.status===200&&after.id===actor.id&&after.email===actor.email&&after.role==='manager'&&after.verified,'The genuine manager identity and property portal survive reload.');
  check(writes.length===0,'No operation-key issue, profile, housing, staff, maintenance or room-key mutation was requested.');
  const report={passed:true,checks,dashboardReadyMs,concurrentReads,responsive,nativeRoleDenials:denied.map(r=>r.status),guestProperty:guest.status,publicProperty:unpublished.status,
   actualProperty:property.name,residenceSetupRequired:true,operationalHousingAcceptance:false,genuineGoogleManagerSession:true,originalTabsModified:false,credentialsExtracted:false,operationalWrites:0};
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 },{preferManagerContext:true,evaluationTimeoutMs:120000});
})().catch(async error=>{const report={passed:false,checks,stage,error:error.message,lastState,credentialsExtracted:false};await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;});
