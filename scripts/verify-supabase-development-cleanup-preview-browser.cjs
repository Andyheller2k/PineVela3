/** Native administrator dependency preview only. Interactive mode prepares the
 * user's dashboard for their own keyed submission; it never reads or enters keys. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const interactive=process.argv[2]==='--interactive';
assert(process.argv.length===2||process.argv.length===3&&interactive,'Pass optional --interactive for the user-prepared founder dashboard.');
const root='.security/migration-reset/',reportPath=root+'development-cleanup-preview-browser.json';
let checks=0,stage='genuine administrator session';const check=(c,label)=>{assert.ok(c,label);checks++;};
(async()=>{
 const saved=JSON.parse(await fs.readFile(root+'development-manager-approval.json','utf8'));
 await withApprovedPineVelaBrowser(async({base,evaluate,waitFor,command,onEvent})=>{
  const mutations=[];onEvent(e=>{if(e.method==='Network.requestWillBeSent'){const r=e.params.request,u=new URL(r.url);if(u.origin===base&&!['GET','HEAD','OPTIONS'].includes(r.method)&&u.pathname.startsWith('/api/admin/governance/')&&!u.pathname.endsWith('/preview'))mutations.push(u.pathname);}});await command('Network.enable');
  const actor=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)}),u=await r.json();return{status:r.status,id:u.id,role:u.role,verified:u.isVerified===true};})()");
  console.log(JSON.stringify({stage,status:actor.status,role:actor.role,verified:actor.verified}));
  check(actor.status===200&&actor.role==='admin'&&actor.verified,'The preview uses a genuine verified administrator.');
  stage='native property-only cleanup preview';
  const result=await evaluate(`(async()=>{const [p,g]=await Promise.all([
   fetch('/api/admin/governance/residences/preview',{method:'POST',headers:{'content-type':'application/json','X-PineVela-Account-Context':${JSON.stringify(actor.id)}},body:JSON.stringify({hostelId:${JSON.stringify(saved.residenceId)},deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}}),signal:AbortSignal.timeout(90000)}),
   fetch('/api/admin/governance',{signal:AbortSignal.timeout(90000)})]);
   const preview=await p.json(),governance=await g.json();return{previewStatus:p.status,governanceStatus:g.status,preview,
    currentId:governance.currentId,mainId:governance.mainId,keyEnrolled:governance.members?.find(m=>m.id===governance.currentId)?.keyEnrolled===true,
    executionRequestsEnabled:governance.capabilities?.residenceExecutionRequests===true};})()`);
  check(result.previewStatus===200&&result.governanceStatus===200,'The actual administrator preview and capability reads succeed.');
  const p=result.preview,c=p.counts;
  check(p.hostelName==='Premuim Pine'&&p.residences.length===1&&p.residences[0].id===saved.residenceId&&p.deleteManager===false,'Only the exact development property is selected, retaining manager sign-in.');
  check(p.accounts.length===1&&p.accounts[0].id===saved.managerId&&p.accounts[0].effect==='retain-sign-in','The real Google manager is explicitly retained by the native preview.');
  check(c.residences===1&&c.manager_assignments===1&&c.verification_cases===1&&c.verification_inspections===1,'The native reviewed scope contains one property, assignment, application and report.');
  check(['blocks','floors','rooms','beds','allocations','staff_assignments','payments','maintenance_issues'].every(k=>c[k]===0),'The actual candidate set contains no housing structure, occupants, staff, payments or maintenance.');
  check(p.uploadCount===0&&p.uploadBytes===0&&p.ban.amount===0,'No property media or registration cooldown is included.');
  check(p.blockers.length===0&&mutations.length===0,'The preview adds no proposal, approval, pause or deletion request.');
  const report={passed:true,checks,readAt:new Date().toISOString(),scope:'property-only cleanup candidate preview',preview:p,executionRequestsEnabled:result.executionRequestsEnabled,proposalsSubmitted:0,recordsDeleted:0,keysRead:false,originalTabsModified:false};
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  const plan=['# Premuim Pine development cleanup preview','',`Residence: Premuim Pine (${saved.residenceId})`,`Manager: mindspacehqr@gmail.com (${saved.managerId}) — retain sign-in.`,
   '', 'Proposed native removal scope:',`- One residence: ${saved.residenceId}`,`- One manager assignment: ${p.resources.manager_assignments.join(', ')}`,`- One manager application: ${p.resources.verification_cases.join(', ')}`,`- One inspection report: ${p.resources.verification_inspections.join(', ')}`,
   '', 'No blocks, floors, rooms, beds, occupants, staff, payments, maintenance or property uploads are included. No registration ban.',
   'Retain the genuine Google manager identity, primary owner, officer, administrators, other accounts, and required audit/recovery history.',
   '', 'No proposal, approval, pause, consent, deletion or Storage operation has been submitted.',
   `Native execution-request release gate: ${result.executionRequestsEnabled?'enabled':'disabled'}.`,
   'Existing workflow requires two distinct administrator approval keys, founder keyed pause/final consent, and fresh fully rehearsed database plus Storage-byte recovery evidence. Current supplemental rows are not a restorable cleanup backup.',
   '', 'Review and approval of this exact scope are required before destructive execution.',''].join('\n');
  await fs.writeFile(root+'development-property-cleanup-plan.md',plan,{mode:0o600});
  console.log(JSON.stringify({passed:true,checks,property:p.hostelName,managerRetained:true,reviewed:{residences:c.residences,assignments:c.manager_assignments,applications:c.verification_cases,reports:c.verification_inspections,uploads:p.uploadCount},executionRequestsEnabled:result.executionRequestsEnabled,proposalsSubmitted:0,recordsDeleted:0}));
  if(!interactive)return;
  // Stop network observation before the user enters a private approval key.
  await command('Network.disable');
  check(result.currentId===actor.id&&result.mainId===actor.id&&result.keyEnrolled,'The genuine founder has their own enrolled approval key.');
  const target=(await command('Target.getTargetInfo')).targetInfo;
  stage='prepared property-only deletion dialog';
  const navigation="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&(b.dataset.navigationId==='residences'||b.title==='Residences'||/^Residences(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||'')))";
  await waitFor('!!('+navigation+')','Actual residence navigation',90000);await evaluate('('+navigation+').click()');
  const open="document.querySelector('button[aria-label=\"Propose deletion of Premuim Pine\"]')";
  await waitFor('!!('+open+')','Actual saved property deletion action',240000);await evaluate('('+open+').click()');
  const dialog="document.querySelector('[role=dialog][aria-label=\"Review hostel deletion\"]')";
  await waitFor('!!('+dialog+')','Existing native deletion review',15000);
  const reason='Remove the temporary development-only Premuim Pine after owner-authorized inspection and manager portal validation. Retain genuine Google manager sign-in and required audit/recovery history. No registration cooldown.';
  await evaluate(`(()=>{const t=(${dialog}).querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(reason)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await evaluate("[...("+dialog+").querySelectorAll('button')].find(b=>b.textContent.trim()==='Review deletion').click()");
  await waitFor('('+dialog+")?.textContent.includes('Deletion preview')",'Actual UI deletion preview',120000);
  const ready=await evaluate(`(()=>{const d=${dialog},boxes=[...d.querySelectorAll('input[type=checkbox]')],duration=d.querySelector('input[type=number]');return{scopeShown:d.textContent.includes(${JSON.stringify(saved.residenceId)})&&d.textContent.includes('Manager sign-in retained'),
   retainManager:boxes.length===2&&boxes[0].checked&&!boxes[1].checked,noBan:duration?.value==='0',privateInput:!!d.querySelector('input[type=password][aria-label="Hostel deletion approval key"]'),
   userSubmitAvailable:[...d.querySelectorAll('button')].some(b=>b.textContent.trim()==='Submit deletion for approval')};})()`);
  check(ready.scopeShown&&ready.retainManager&&ready.noBan&&ready.privateInput&&ready.userSubmitAvailable,'The existing dialog presents exact property-only scope and the user-only masked approval field.');
  const session={preparedAt:new Date().toISOString(),browserContextId:target.browserContextId||'default',targetId:target.targetId,founderId:actor.id,residenceId:saved.residenceId,
   reason,scope:'property-only; manager sign-in retained; no ban',awaitingUserKeyedSubmission:true,keysRead:false};
  await fs.writeFile(root+'development-cleanup-review-session.json',JSON.stringify(session,null,2)+'\n',{mode:0o600});
  Object.assign(report,{checks,originalTabsModified:true,preparedAt:session.preparedAt,awaitingUserKeyedSubmission:true});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({prepared:true,awaitingUserKeyedSubmission:true,keysRead:false,commands:['status','verify','close']}));
  const lines=require('node:readline').createInterface({input:process.stdin,terminal:false});
  for await(const line of lines){
   if(line.trim()==='close')break;
   if(!['status','verify'].includes(line.trim()))continue;
   const status=await evaluate(`(async()=>{const r=await fetch('/api/admin/governance',{signal:AbortSignal.timeout(90000)}),g=await r.json();const matches=g.residenceProposals?.filter(q=>q.preview?.residences?.length===1&&q.preview.residences[0].id===${JSON.stringify(saved.residenceId)}&&q.preview.deleteManager===false&&q.reason===${JSON.stringify(reason)})||[];return{status:r.status,currentId:g.currentId,mainId:g.mainId,proposals:matches.map(q=>({id:q.id,status:q.status,votes:q.votes.map(v=>({id:v.id,slot:v.slot,decision:v.decision})),preparation:q.preparation}))};})()`);
   check(status.status===200&&status.currentId===actor.id,'The same genuine founder remains active for the saved review read.');
   if(status.proposals.length===1){const q=status.proposals[0];await fs.writeFile(root+'development-cleanup-proposal.json',JSON.stringify({...session,verifiedAt:new Date().toISOString(),awaitingUserKeyedSubmission:false,proposal:q},null,2)+'\n',{mode:0o600});
    console.log(JSON.stringify({userKeyedProposalSaved:true,status:q.status,votes:q.votes.map(v=>({slot:v.slot,decision:v.decision})),recordsDeleted:0,keysRead:false}));}
   else console.log(JSON.stringify({userKeyedProposalSaved:false,matchingReviews:status.proposals.length,recordsDeleted:0,keysRead:false}));
  }
  lines.close();
 },{existingAdmin:interactive,evaluationTimeoutMs:120000});
})().catch(async error=>{const report={passed:false,checks,stage,error:error.message,recordsDeleted:0};await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;});
