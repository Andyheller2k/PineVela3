/** Review the actual owner-authorized development report, then approve once
 * through the normal administrator UI with an explicit development-only reason. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const mode=process.argv[2];assert(['preview','approve'].includes(mode)&&process.argv.length===3,'Pass preview or approve.');
const root='.security/migration-reset/',reportPath=root+'development-approval-'+mode+'-browser.json',journalPath=root+'development-manager-approval.json';
const notes='Development-only workflow approval authorized by the application owner for temporary Premuim Pine testing. The officer requested reinspection and no physical verification is claimed. This approval exercises manager activation for development. The development property and linked test records will be reviewed for cleanup afterward.';
let checks=0,stage='genuine administrator session',attempted=false,lastState;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
const save=(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
(async()=>{
 await fs.mkdir(root,{recursive:true,mode:0o700});
 await withApprovedPineVelaBrowser(async({base,evaluate,navigate,waitFor,command,onEvent})=>{
  const decisions=[];
  onEvent(event=>{if(event.method==='Network.requestWillBeSent'){
   const r=event.params.request,u=new URL(r.url);if(u.origin===base&&r.method==='PUT'&&/^\/api\/manager-verifications\/[^/]+\/approve$/.test(u.pathname))decisions.push(u.pathname);
  }});
  await command('Network.enable');
  const actor=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)}),u=await r.json();return{status:r.status,id:u.id,role:u.role,verified:u.isVerified===true};})()");
  check(actor.status===200&&actor.role==='admin'&&actor.verified,'Use the genuine signed-in administrator.');
  const read=path=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(path)},{signal:AbortSignal.timeout(90000)});return{status:r.status,data:await r.json()};})()`);
  const [applications,inspections]=await Promise.all([read('/api/manager-verifications'),read('/api/admin/verification-inspections')]);
  check(applications.status===200&&Array.isArray(applications.data)&&inspections.status===200&&Array.isArray(inspections.data),'Native administrator application and inspection reads succeed.');
  const cases=applications.data.filter(c=>c.managerEmail==='mindspacehqr@gmail.com'&&c.hostelName==='Premuim Pine');
  check(cases.length===1,'Review the one exact existing development application.');
  const application=cases[0],matches=inspections.data.filter(i=>i.managerVerificationId===application.id);
  check(matches.length===1&&matches[0].report?.recommendation==='requires_reinspection'&&matches[0].report.observations.startsWith('Development-only workflow validation authorized by the application owner.'),'The exact saved report requests reinspection and identifies development testing.');
  const validateSaved=async()=>{
   const [reviews,queue,hostels]=await Promise.all([read('/api/manager-verifications'),read('/api/admin/verification-inspections'),read('/api/admin/hostels')]);
   const review=reviews.data.find(c=>c.id===application.id),inspection=queue.data.find(i=>i.id===matches[0].id),residence=hostels.data.find(h=>h.id===application.residenceId);
   check([reviews.status,queue.status,hostels.status].every(s=>s===200),'Native saved approval, inspection and property reads succeed.');
   check(review?.status==='approved'&&review.adminNotes===notes&&Number.isFinite(Date.parse(review.reviewedAt)),'The saved administrator decision contains the exact development-only reason and review time.');
   check(inspection?.status==='approved'&&inspection.report.recommendation==='requires_reinspection'&&Object.values(inspection.report.checklist).every(v=>v===false),'Administrator approval preserves the officer report and unconfirmed physical findings.');
   check(residence?.status==='approved'&&residence.managerId===application.managerId&&residence.managerStatus==='active','The native decision activates only the saved assigned manager and property.');
   return{caseStatus:review.status,inspectionStatus:inspection.status,managerStatus:residence.managerStatus,residenceStatus:residence.status,publiclyListed:residence.isApproved===true};
  };
  if(mode==='approve'){
   let journal;try{journal=JSON.parse(await fs.readFile(journalPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(journal){check(journal.caseId===application.id,'The approval journal names the exact development application.');const state=await validateSaved();await save(reportPath,{passed:true,checks,state,replayedWrites:0,physicalInspectionVerified:false});console.log(JSON.stringify({passed:true,checks,state,alreadySaved:true,replayedWrites:0}));return;}
  }
  check(application.status==='under_review'&&matches[0].status==='report_submitted','The submitted development report is awaiting administrator review.');
  stage='native report review UI';
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await navigate('/?developmentApproval='+Date.now()+'#/admin/dashboard');
  const navigation="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&(b.dataset.navigationId==='managers'||b.title==='Managers & Staffs'||/^Managers(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||'')))";
  await waitFor('!!('+navigation+')','Manager navigation',90000);await evaluate('('+navigation+').click()');
  const card="(()=>{const email=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()==='mindspacehqr@gmail.com');return email?.closest('div.grid')?.parentElement;})()";
  await waitFor("!!("+card+")&&[...("+card+").querySelectorAll('button')].some(b=>b.textContent.includes('Review On-Site Report'))",'Saved report review card',90000);
  await evaluate("[...("+card+").querySelectorAll('button')].find(b=>b.textContent.includes('Review On-Site Report')).click()");
  await waitFor("!!document.querySelector('[role=dialog][aria-label=\"Review inspection report\"]')",'Actual saved report viewer',15000);
  const report=await evaluate("(()=>{const d=document.querySelector('[role=dialog][aria-label=\"Review inspection report\"]');return{developmentContext:d.textContent.includes('Development-only workflow validation authorized by the application owner.'),property:d.textContent.includes('Premuim Pine'),noFabricatedPhotos:!d.querySelector('img'),hasApprove:[...d.querySelectorAll('button')].some(b=>b.textContent.includes('Approve & Authorize Manager'))};})()");
  check(report.developmentContext&&report.property&&report.noFabricatedPhotos&&report.hasApprove,'The administrator views the actual development report without fabricated photographs.');
  await evaluate("[...document.querySelector('[role=dialog][aria-label=\"Review inspection report\"]').querySelectorAll('button')].find(b=>b.textContent.includes('Approve & Authorize Manager')).click()");
  const dialog="document.querySelector('[role=dialog][aria-label=\"Approve manager application\"]')";
  await waitFor('!!('+dialog+')','Native approval reason dialog',15000);
  const responsive=[];
  for(const [width,height]of[[1440,900],[375,812]]){
   stage='approval reason at '+width+'px';await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
   lastState=await evaluate(`(()=>{const d=${dialog},t=d.querySelector('textarea[aria-label="Approval reason"]'),b=d.querySelector('button[type=submit]'),card=d.querySelector('[data-popup-card]'),r=card.getBoundingClientRect();
    return{width:${width},savedIdentity:d.textContent.includes('Premuim Pine')&&d.textContent.includes('mindspacehqr@gmail.com'),overrideExplained:d.textContent.includes('The officer did not recommend approval.'),
     reasonRequired:t.required&&t.minLength===5&&t.maxLength===4000,blankBlocked:b.disabled&&!t.form.checkValidity(),
     bounded:r.left>=-1&&r.right<=innerWidth+1&&card.scrollWidth<=card.clientWidth+1&&document.documentElement.scrollWidth<=innerWidth+1,closeAvailable:!!d.querySelector('button[aria-label="Close dialog"]')};})()`);
   check(lastState.savedIdentity&&lastState.overrideExplained&&lastState.reasonRequired,'The decision dialog identifies the real case and requires a reason for the officer override.');
   check(lastState.blankBlocked&&lastState.bounded&&lastState.closeAvailable,'Blank approval is blocked and the dialog fits with a visible close control.');responsive.push(lastState);
  }
  await evaluate('('+dialog+').querySelector("form").requestSubmit()');
  check(decisions.length===0,'Blank native validation prevents any approval request.');
  if(mode==='preview'){
   await evaluate("[...("+dialog+").querySelectorAll('button')].find(b=>b.textContent.trim()==='Cancel').click()");
   const unchanged=await read('/api/manager-verifications');check(unchanged.data.find(c=>c.id===application.id)?.status==='under_review','Cancelling review leaves the saved development application unchanged.');
   await save(reportPath,{passed:true,checks,responsive,approvalWrites:0,physicalInspectionVerified:false});console.log(JSON.stringify({passed:true,checks,responsive,approvalWrites:0}));return;
  }
  stage='explicit development approval reason';
  await evaluate(`(()=>{const t=(${dialog}).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(notes)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await waitFor('!('+dialog+').querySelector("button[type=submit]").disabled','Entered development approval reason',15000);
  await save(journalPath,{caseId:application.id,managerId:application.managerId,residenceId:application.residenceId,attemptedAt:new Date().toISOString(),notes,warning:'Read saved state before any retry. Never replay an uncertain approval.'});
  stage='one native administrator approval';attempted=true;
  await evaluate('('+dialog+').querySelector("form").requestSubmit()');
  await waitFor('!('+dialog+')||!!('+dialog+').querySelector("[role=alert]")','Native approval result',90000);
  const state=await validateSaved();
  check(decisions.length===1&&decisions[0]===`/api/manager-verifications/${application.id}/approve`,'Exactly one approval request was sent.');
  await save(reportPath,{passed:true,checks,responsive,state,approvalWrites:1,developmentOnly:true,physicalInspectionVerified:false,originalTabsModified:false,credentialsExtracted:false});
  console.log(JSON.stringify({passed:true,checks,state,approvalWrites:1,physicalInspectionVerified:false}));
 },{evaluationTimeoutMs:120000});
})().catch(async error=>{const result={passed:false,checks,stage,error:error.message,lastState,approvalAttempted:attempted};await save(reportPath,result);console.error(JSON.stringify(result));process.exitCode=1;});
