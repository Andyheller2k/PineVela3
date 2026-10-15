/** Existing owner-authorized development case only. Uses the genuine prepared
 * officer session and native form; never invents physical evidence or retries a write. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const mode=process.argv[2],checkpoint=process.argv[3];
assert(['preview','submit'].includes(mode)&&process.argv.length===(mode==='submit'?4:3),'Pass preview or submit <encrypted current-row checkpoint UUID>.');
const root='.security/migration-reset/',reportPath=root+'development-inspection-'+mode+'-browser.json',journalPath=root+'development-inspection-submission.json';
const observations='Development-only workflow validation authorized by the application owner. Premuim Pine is a development application. No physical site visit, manager presence, property condition, capacity, safety or utility verification is claimed. This report exercises the assigned-officer submission and administrator review workflow. Any captured GPS is the testing device location, not evidence of the property location. Capacity fields remain at their unset form defaults and are not inspected measurements.';
const save=async(file,data)=>fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{mode:0o600});
let checks=0,stage='prepared officer session',lastState,attempted=false;
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
(async()=>{
 await fs.mkdir(root,{recursive:true,mode:0o700});
 if(mode==='submit'){
  assert(/^[0-9a-f-]{36}$/.test(checkpoint),'Use the actual recovery checkpoint UUID.');
  const metadata=JSON.parse(await fs.readFile(root+checkpoint+'.json','utf8'));
  check(metadata.encrypted===true&&metadata.verified===true&&metadata.archive?.endsWith('.pvrecords')&&
   Number(metadata.counts?.['public.verification_inspections'])>0&&Number(metadata.counts?.['private.schema_migrations'])===69,
   'The actual current rows are preserved privately, including the real inspection and unchanged migration ledger. This supplemental export is not a destructive-cleanup backup.');
 }
 await withApprovedPineVelaBrowser(async({base,evaluate,navigate,waitFor,command,onEvent})=>{
  const writes=[];
  onEvent(event=>{if(event.method==='Network.requestWillBeSent'){
   const r=event.params.request,u=new URL(r.url);
   if(u.origin===base&&!['GET','HEAD','OPTIONS'].includes(r.method)&&/^\/api\/(verification-team\/inspections\/|storage\/upload-inspection-image|manager-verifications\/)/.test(u.pathname))writes.push({method:r.method,path:u.pathname});
  }});
  await command('Network.enable');
  const me=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)});const u=await r.json();return{status:r.status,id:u.id,profileId:u.profileId,email:u.email,name:u.name,role:u.role,verified:u.isVerified===true};})()");
  console.log(JSON.stringify({stage:'native officer session',status:me.status,role:me.role,expectedEmail:me.email==='andrewsoppongmn@gmail.com'}));
  check(me.status===200&&me.email==='andrewsoppongmn@gmail.com'&&me.role==='verification_team'&&me.verified,'Use the exact real verified officer.');
  const readQueue=()=>evaluate("(async()=>{const r=await fetch('/api/verification-team/my-inspections',{signal:AbortSignal.timeout(90000)});return{status:r.status,rows:await r.json()};})()");
  stage='native assigned inspection queue';
  const queue=await readQueue();
  check(queue.status===200&&Array.isArray(queue.rows),'The real officer queue loads.');
  const matches=queue.rows.filter(i=>i.managerEmail==='mindspacehqr@gmail.com'&&i.hostelName==='Premuim Pine');
  check(matches.length===1&&matches[0].assignedOfficerId===me.id,'The one exact existing development case belongs to this officer.');
  const assignment=matches[0];
  const validateSaved=saved=>{
   check(['report_submitted','approved'].includes(saved?.status)&&saved.report?.observations===observations,'The actual saved report contains the explicit development context.');
   check(saved.report.recommendation==='requires_reinspection'&&Object.values(saved.report.checklist).every(v=>v===false),'The officer requests reinspection and leaves all physical findings unconfirmed.');
   check(Array.isArray(saved.report.photos)&&saved.report.photos.length===0,'No property photograph has been invented.');
   check(saved.report.officerId===me.id&&saved.report.inspectorSignature===`${me.name} (${me.id})`&&Number.isFinite(Date.parse(saved.report.submittedAt)),'The server stamps the registered officer and submission time.');
  };
  if(mode==='submit'){
   let journal;try{journal=JSON.parse(await fs.readFile(journalPath,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
   if(journal){
    check(journal.inspectionId===assignment.id&&journal.caseId===assignment.managerVerificationId,'The submission journal matches the exact saved case.');
    validateSaved(assignment);
    await save(reportPath,{passed:true,checks,scope:'saved development report recovery read',replayedWrites:0,physicalInspectionVerified:false});
    console.log(JSON.stringify({passed:true,checks,alreadySaved:true,replayedWrites:0}));return;
   }
  }
  check(assignment.status==='dispatched'&&!assignment.report,'The existing dispatch is awaiting its first report.');
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  stage='actual assigned inspection form';
  await navigate('/?developmentInspection='+Date.now()+'#/field-officer');
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Perform On-Site Inspection')&&!b.disabled)",'Assigned inspection action',90000);
  const card="(()=>{const id=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()==="+JSON.stringify(assignment.id)+");return id?.closest('div.rounded-3xl');})()";
  check(await evaluate('!!('+card+')'),'The actual dispatched card is present.');
  await evaluate("[...("+card+").querySelectorAll('button')].find(b=>b.textContent.includes('Perform On-Site Inspection')).click()");
  await waitFor("!!document.querySelector('textarea[aria-label=\"Inspector Detailed Observations & Ground Findings\"]')",'Actual report form',15000);
  console.log(JSON.stringify({stage:'native device location requested',permission:await evaluate("navigator.permissions.query({name:'geolocation'}).then(p=>p.state)")}));
  stage='native device location result';
  await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Recalibrate GPS')&&!b.disabled)",'Native device location response',180000);
  const responsive=[];
  for(const [width,height]of[[1440,900],[375,812]]){
   stage='inspection form at '+width+'px';
   await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
   const state=await evaluate(`(()=>{const form=document.querySelector('textarea[aria-label="Inspector Detailed Observations & Ground Findings"]')?.form;
    const signature=form?.querySelector('input[aria-label="Officer Digital Signature"]'),r=form?.getBoundingClientRect();
    return{property:document.body.textContent.includes('Premuim Pine'),observationsBlank:form?.querySelector('textarea').value==='',
     recommendationBlank:form?.querySelector('select[aria-label="Officer Recommendation"]').value==='',
     physicalConfirmations:[...form.querySelectorAll('input[type=checkbox]')].filter(i=>i.checked).length,
     signatureCorrect:signature?.readOnly&&signature.value===${JSON.stringify(me.name+' ('+me.id+')')},
     nativeRequiredFieldsInvalid:!form.checkValidity(),viewportBounded:document.documentElement.scrollWidth<=innerWidth+1,
     formBounded:!!r&&r.left>=-1&&r.right<=innerWidth+1&&form.scrollWidth<=form.clientWidth+1,
     gpsAbsent:form.textContent.includes('Device coordinates have not been recorded.'),nativeCoordinatesPresent:form.textContent.includes('Accuracy: ±'),nativeLocationError:!!form.querySelector('[role=alert]')};})()`);
   lastState={width,...state};
   check(state.property&&state.observationsBlank&&state.recommendationBlank&&state.physicalConfirmations===0,'The actual form starts without invented findings or a preselected recommendation.');
   check(state.signatureCorrect&&state.nativeRequiredFieldsInvalid,'The real signature is read-only and required report fields prevent blank submission.');
   check(state.gpsAbsent!==state.nativeCoordinatesPresent,'The form shows either a native device measurement or explicitly missing coordinates.');
   check(state.viewportBounded&&state.formBounded,'The actual inspection form fits the requested viewport.');
   responsive.push(lastState);
  }
  stage='native empty-form validation';
  await evaluate("document.querySelector('textarea[aria-label=\"Inspector Detailed Observations & Ground Findings\"]').form.requestSubmit()");
  check(writes.length===0,'An empty native form cannot send a report.');
  if(mode==='preview'){
   await save(reportPath,{passed:true,checks,responsive,operationalWrites:0,physicalInspectionVerified:false,originalTabsModified:false,credentialsExtracted:false});
   console.log(JSON.stringify({passed:true,checks,scope:'actual development inspection form',responsive,operationalWrites:0}));return;
  }
  stage='truthful development report entry';
  await evaluate(`(()=>{const t=document.querySelector('textarea[aria-label="Inspector Detailed Observations & Ground Findings"]');
   Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(observations)});t.dispatchEvent(new Event('input',{bubbles:true}));
   const s=document.querySelector('select[aria-label="Officer Recommendation"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'requires_reinspection');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await waitFor("document.querySelector('select[aria-label=\"Officer Recommendation\"]').value==='requires_reinspection'&&document.querySelector('textarea[aria-label=\"Inspector Detailed Observations & Ground Findings\"]').form.checkValidity()",'Truthful report fields',15000);
  check(writes.length===0,'Entering the truthful report has not submitted it.');
  await save(journalPath,{inspectionId:assignment.id,caseId:assignment.managerVerificationId,officerId:me.id,checkpoint,priorAssignment:assignment,attemptedAt:new Date().toISOString(),warning:'Read saved state before any retry. Never replay an uncertain report submission. Supplemental row checkpoint is not destructive-cleanup recovery evidence.'});
  attempted=true;stage='one native report submission';
  await evaluate("document.querySelector('textarea[aria-label=\"Inspector Detailed Observations & Ground Findings\"]').form.requestSubmit()");
  await waitFor("document.body.textContent.includes('Field inspection report submitted successfully!')||document.body.textContent.includes('Report Submitted')",'Saved development report',90000);
  const after=await readQueue();
  check(after.status===200,'The submitted report is read back from the native officer queue.');
  validateSaved(after.rows.find(i=>i.id===assignment.id));
  check(writes.length===1&&writes[0].path===`/api/verification-team/inspections/${assignment.id}/submit-report`,'Exactly one real report submission was requested, with no uploads or administrator decision.');
  await save(reportPath,{passed:true,checks,responsive,reportSubmitted:true,developmentOnly:true,physicalInspectionVerified:false,operationalWrites:1,originalTabsModified:false,credentialsExtracted:false});
  console.log(JSON.stringify({passed:true,checks,developmentReportSubmitted:true,physicalInspectionVerified:false,operationalWrites:1}));
 },{preferOfficerContext:true,evaluationTimeoutMs:120000});
})().catch(async error=>{const result={passed:false,checks,stage,error:error.message,lastState,submissionAttempted:attempted,physicalInspectionVerified:false};await save(reportPath,result);console.error(JSON.stringify(result));process.exitCode=1;});
