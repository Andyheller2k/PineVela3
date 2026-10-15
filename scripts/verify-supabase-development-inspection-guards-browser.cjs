/** Native negative requests against the exact saved development report.
 * Bodies cannot submit a valid report or approve the reinspection recommendation. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const root='.security/migration-reset/',reportPath=root+'development-inspection-guards-browser.json';
let checks=0,stage='saved development report';
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
(async()=>{
 const journal=JSON.parse(await fs.readFile(root+'development-inspection-submission.json','utf8'));
 await withApprovedPineVelaBrowser(async({evaluate})=>{
  const actor=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)}),u=await r.json();return{status:r.status,id:u.id,profileId:u.profileId,email:u.email,role:u.role};})()");
  check(actor.status===200&&actor.email==='andrewsoppongmn@gmail.com'&&actor.role==='verification_team'&&actor.id===journal.officerId&&actor.profileId!==actor.id,'The exact genuine officer and separate primary identity are active.');
  const queue=()=>evaluate("(async()=>{const r=await fetch('/api/verification-team/my-inspections',{signal:AbortSignal.timeout(90000)});return{status:r.status,data:await r.json()};})()");
  const before=await queue(),saved=before.data.find(i=>i.id===journal.inspectionId);
  check(before.status===200&&saved?.managerVerificationId===journal.caseId&&saved.managerEmail==='mindspacehqr@gmail.com'&&saved.report?.recommendation==='requires_reinspection','The exact saved development report is present before denial checks.');
  const reportRoute=`/api/verification-team/inspections/${journal.inspectionId}/submit-report`,approvalRoute=`/api/manager-verifications/${journal.caseId}/approve`;
  const requests=[
   {label:'guest report submission',path:reportRoute,method:'POST',guest:true,expected:401},
   {label:'stale-context report submission',path:reportRoute,method:'POST',context:actor.profileId,expected:409},
   {label:'officer administrator decision',path:approvalRoute,method:'PUT',expected:403},
   {label:'guest administrator decision',path:approvalRoute,method:'PUT',guest:true,expected:401},
   {label:'duplicate finalized report submission',path:reportRoute,method:'POST',expected:409}
  ];
  stage='actual native write-boundary denials';
  const replies=await evaluate(`Promise.all(${JSON.stringify(requests)}.map(async q=>{try{const r=await fetch(q.path,{method:q.method,credentials:q.guest?'omit':'same-origin',headers:{'content-type':'application/json',...(q.context?{'X-PineVela-Profile-Context':q.context}:{})},body:'{}',signal:AbortSignal.timeout(90000)});return{label:q.label,status:r.status,expected:q.expected};}catch(e){return{label:q.label,readFailed:true,errorName:e.name,expected:q.expected};}}))`);
  for(const reply of replies)check(reply.status===reply.expected,reply.label+' is denied by the native server.');
  stage='saved report remains unchanged';const after=await queue(),current=after.data.find(i=>i.id===journal.inspectionId);
  check(after.status===200&&JSON.stringify(current?.report)===JSON.stringify(saved.report),'The recorded development report is unchanged after all negative requests.');
  const report={passed:true,checks,replies,reportUnchanged:true,providerRepliesFabricated:false,credentialsExtracted:false,originalTabsModified:false};
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 },{preferOfficerContext:true,evaluationTimeoutMs:120000});
})().catch(async error=>{const report={passed:false,checks,stage,error:error.message};await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;});
