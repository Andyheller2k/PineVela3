/** Read the actual saved development review or prepare its existing vote UI.
 * Never submit votes or inspect keys. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const openLogin=process.argv[2]==='--open-independent-login';
const prepareVote=process.argv[2]==='--prepare-independent';
assert(process.argv.length===2||process.argv.length===3&&(openLogin||prepareVote),'Pass optional --open-independent-login or --prepare-independent.');
const root='.security/migration-reset/';
let checks=0,stage='approved browser connection';
const check=(condition,label)=>{assert.ok(condition,label);checks++;};
(async()=>{
 const saved=JSON.parse(await fs.readFile(root+'development-cleanup-proposal.json','utf8'));
 const original=JSON.parse(await fs.readFile(root+'development-cleanup-preview-browser.json','utf8'));
 let prepared=saved;
 if(prepareVote){
  try{prepared=JSON.parse(await fs.readFile(root+'development-cleanup-independent-prepared-context.json','utf8'));}
  catch(e){if(e.code!=='ENOENT')throw e;prepared=JSON.parse(await fs.readFile(root+'development-cleanup-second-admin-browser-context.json','utf8'));}
 }
 await withApprovedPineVelaBrowser(async({base,evaluate,waitFor,command})=>{
  stage='native administrator and saved scope reads';
  console.log(JSON.stringify({stage}));
  const result=await evaluate(`(async()=>{const [a,r]=await Promise.all([
   fetch('/api/auth/me',{signal:AbortSignal.timeout(90000)}),
   fetch('/api/admin/governance',{signal:AbortSignal.timeout(90000)})]);
   const u=await a.json(),g=await r.json();return{actorStatus:a.status,actor:{id:u.id,role:u.role,verified:u.isVerified===true},
    status:r.status,currentId:g.currentId,mainId:g.mainId,members:g.members,
    proposal:g.residenceProposals?.find(p=>p.id===${JSON.stringify(saved.proposal.id)}),
    executionRequestsEnabled:g.capabilities?.residenceExecutionRequests===true};})()`);
  console.log(JSON.stringify({actorStatus:result.actorStatus,role:result.actor.role,verified:result.actor.verified,
   governanceStatus:result.status,currentMatchesActor:result.currentId===result.actor.id,founderMatchesOriginal:result.mainId===saved.founderId,
   administratorSlot:result.members?.find(m=>m.id===result.actor.id)?.slot}));
  check(result.actorStatus===200&&result.actor.role==='admin'&&result.actor.verified,'The actual administrator session is verified.');
  check(result.status===200&&result.currentId===result.actor.id&&result.mainId===saved.founderId,'The same genuine administrator can read the saved proposal.');
  const self=result.members.find(m=>m.id===result.actor.id);
  check(prepareVote?self?.active&&self.keyEnrolled&&self.id!==saved.founderId:result.actor.id===saved.founderId,'The actual prepared administrator is eligible for this review step.');
  const q=result.proposal,p=q?.preview;
  check(['pending','approved'].includes(q?.status)&&q.reason===saved.reason&&p?.hostelName==='Premuim Pine','The exact development proposal remains open.');
  check(p.deleteHostel===true&&p.deleteManager===false&&p.residences.length===1&&p.residences[0].id===saved.residenceId&&p.ban.amount===0,'The saved property-only scope has no registration ban.');
  check(p.accounts.length===1&&p.accounts[0].effect==='retain-sign-in'&&p.accounts[0].id===original.preview.accounts[0].id,'The actual manager identity is retained.');
  assert.deepEqual(p.resources,original.preview.resources,'Saved resource IDs must match the reviewed actual candidates.');checks++;
  assert.deepEqual(p.counts,original.preview.counts,'Saved dependency counts must match the reviewed actual candidates.');checks++;
  check(p.uploadCount===0&&p.uploadBytes===0&&p.blockers.length===0,'There are no property uploads or native blockers.');
  check(q.votes.filter(v=>v.id===saved.founderId&&v.slot===1&&v.decision==='approved').length===1&&new Set(q.votes.map(v=>v.id)).size===q.votes.length,'The founder approval is recorded once and saved voters are distinct.');
  check(q.preparation?.state!=='executed'&&!q.preparation?.execution,'The saved review has not executed deletion.');
  const eligible=result.members.filter(m=>m.id!==saved.founderId&&m.active&&m.keyEnrolled&&!q.votes.some(v=>v.id===m.id));
  const reportPath=root+(prepareVote?'development-cleanup-independent-review-browser.json':'development-cleanup-proposal-scope-browser.json');
  const report={passed:true,checks,verifiedAt:new Date().toISOString(),proposal:q,actor:{id:self.id,slot:self.slot,name:self.name},preparedIndependentReview:false,
   executionRequestsEnabled:result.executionRequestsEnabled,
   eligibleAdministrators:eligible.map(m=>({id:m.id,slot:m.slot,name:m.name})),keysRead:false,recordsDeleted:0};
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  if(prepareVote){
   check(q.status==='pending'&&!q.preparation&&!q.votes.some(v=>v.id===self.id),'This different administrator has an outstanding vote on the exact saved review.');
   stage='existing independent review UI';
   const navigation="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&(b.dataset.navigationId==='governance'||b.title==='Admin Approvals'||/^Approvals(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||'')))";
   const more="[...document.querySelectorAll('button[data-navigation-id=more]')].find(b=>b.getBoundingClientRect().width>0)";
   await waitFor('!!('+navigation+')||!!('+more+')','Actual administrator navigation',90000);
   if(!await evaluate('!!('+navigation+')')){
    await evaluate('('+more+').click()');
    await waitFor('!!('+navigation+')','Actual approvals destination in the More menu',15000);
   }
   console.log(JSON.stringify({stage,administratorSlot:self.slot,navigationReady:true}));
   await evaluate('('+navigation+').click()');
   const panel="[...document.querySelectorAll('section[aria-label=\"Hostel deletion approvals\"]')].find(s=>s.getBoundingClientRect().width>0)";
   const article='('+panel+")&&[...("+panel+").querySelectorAll('article')].find(a=>a.querySelector('h4')?.textContent==='Premuim Pine · pending'&&a.textContent.includes("+JSON.stringify(saved.reason)+'))';
   await waitFor('!!('+article+')','Exact saved deletion proposal in the actual approvals panel',120000);
   await evaluate('(()=>{const a='+article+";a.querySelector('details').open=true;a.scrollIntoView({block:'center'});})()");
   const ready=await evaluate('(()=>{const s='+panel+',a='+article+';return{scope:a.textContent.includes('+JSON.stringify(saved.residenceId)+")&&a.textContent.includes('Manager sign-in retained'),keyField:!!s.querySelector('input[type=password][aria-label=\"Hostel deletion approval key\"]'),approve:[...a.querySelectorAll('button')].some(b=>b.textContent.trim()==='Approve hostel deletion')};})()");
   check(ready.scope&&ready.keyField&&ready.approve,'The actual native proposal exposes the reviewed scope and user-only keyed approval action.');
   Object.assign(report,{checks,preparedIndependentReview:true,originalTabNavigationChanged:true});
   await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  if(openLogin){
   check(q.status==='pending'&&q.votes.length===1&&!q.preparation&&eligible.length>0,'A different enrolled active administrator can give the outstanding approval.');
   const contextPath=root+'development-cleanup-second-admin-browser-context.json';
   try{await fs.access(contextPath);throw new Error('Use the already prepared separate administrator window.');}catch(e){if(e.code!=='ENOENT')throw e;}
   stage='separate independent-administrator login window';
   const context=await command('Target.createBrowserContext',{disposeOnDetach:false},null);
   const target=await command('Target.createTarget',{url:base+'/?propertyCleanup=PremuimPine&review=independent#/login',browserContextId:context.browserContextId,background:false},null);
   await fs.writeFile(contextPath,JSON.stringify({openedAt:new Date().toISOString(),browserContextId:context.browserContextId,targetId:target.targetId,
    proposalId:q.id,scope:'Premuim Pine only; retain manager; no ban',eligibleSlots:eligible.map(m=>m.slot),keysRead:false},null,2)+'\n',{mode:0o600});
   Object.assign(report,{checks,separateAdministratorLoginOpen:true});
   await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});
  }
  console.log(JSON.stringify({passed:true,checks,proposalStatus:q.status,votes:q.votes.map(v=>({slot:v.slot,decision:v.decision})),managerRetained:true,noBan:true,
   eligibleAdministrators:eligible.map(m=>({slot:m.slot,name:m.name})),separateAdministratorLoginOpen:openLogin,preparedIndependentReview:prepareVote,keysRead:false,recordsDeleted:0}));
 },{existingAdmin:prepareVote,preparedContextId:prepared.browserContextId,evaluationTimeoutMs:120000});
})().catch(async e=>{const report={passed:false,checks,stage,error:e.message,keysRead:false,recordsDeleted:0};
 await fs.writeFile(root+'development-cleanup-scope-incomplete-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;});
