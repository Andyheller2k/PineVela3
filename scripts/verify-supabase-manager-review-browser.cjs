/** Genuine administrator reads of the user's existing manager application.
 * Only navigation and read retry are clicked; no dispatch, decision, notification acknowledgement,
 * credentials, browser storage or fabricated responses are used. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
const {withApprovedPineVelaBrowser}=require('./lib/approved-pinevela-browser.cjs');
const managerEmail=(process.argv[2]||'').trim().toLowerCase();
const verifyRecovery=process.argv[3]==='--recovery';
assert((process.argv.length===3||process.argv.length===4&&verifyRecovery)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail),'Pass the actual existing manager email and optional --recovery.');
let checks=0,stage='approved administrator browser',lastAuth,viewDiagnostics,populatedReviewEvidence;
const startedAt=Date.now(),requests=new Map(),requestResults=[];
const observedPaths=new Set(['/api/auth/me','/api/admin/hostels','/api/manager-requests','/api/manager-verifications',
 '/api/admin/manager-restrictions','/api/board-requests','/api/activities','/api/admin/digital-market/applications',
 '/api/admin/digital-market/stores','/api/verification-teams','/api/admin/verification-inspections','/api/admin/payments',
 '/api/admin/all-users','/api/notifications']);
const reportPath='.security/migration-reset/manager-review-browser.json';
const check=(value,label)=>{assert.ok(value,label);checks++;};

(async()=>{
 await withApprovedPineVelaBrowser(async({base,evaluate,navigate,waitFor,command,onEvent})=>{
  onEvent(event=>{
   if(event.method==='Network.requestWillBeSent'){
    const url=new URL(event.params.request.url);
    if(url.origin===base&&observedPaths.has(url.pathname))requests.set(event.params.requestId,{path:url.pathname,started:event.params.timestamp});
   }
   if(event.method==='Network.responseReceived'&&requests.has(event.params.requestId)){
    const request=requests.get(event.params.requestId);requests.delete(event.params.requestId);
    requestResults.push({path:request.path,status:event.params.response.status,startedMs:Math.round(request.started*1000),
      headersMs:Math.round((event.params.timestamp-request.started)*1000)});
   }
   if(event.method==='Network.loadingFailed'&&requests.has(event.params.requestId)){
    const request=requests.get(event.params.requestId);requests.delete(event.params.requestId);
    requestResults.push({path:request.path,failed:true,cancelled:event.params.canceled===true});
   }
  });
  await command('Network.enable');
  try{
  stage='genuine administrator session';
  lastAuth=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const data=await r.json();return{status:r.status,role:typeof data.role==='string'?data.role:null,verified:data.isVerified===true};})()");
  console.log(JSON.stringify({stage,...lastAuth}));
  check(lastAuth.status===200&&lastAuth.role==='admin'&&lastAuth.verified,'A genuine verified administrator must already be signed in.');
  stage='existing manager ownership, review and submission notice';
  const saved=await evaluate(`(async()=>{
    const read=async(route)=>{const r=await fetch(route,{credentials:'same-origin',signal:AbortSignal.timeout(45000)});return{status:r.status,data:await r.json()};};
    const [directory,reviews,notices,officers]=await Promise.all(['/api/admin/all-users','/api/manager-verifications','/api/notifications','/api/verification-teams'].map(read));
    const users=Array.isArray(directory.data.users)?directory.data.users:[];
    const managers=users.filter(u=>u.role==='manager'&&u.email?.toLowerCase()===${JSON.stringify(managerEmail)});
    const primaries=users.filter(u=>u.role==='user'&&u.email?.toLowerCase()==='finalform2k@gmail.com');
    const cases=Array.isArray(reviews.data)?reviews.data.filter(r=>r.managerEmail?.toLowerCase()===${JSON.stringify(managerEmail)}):[];
    const manager=managers[0],primary=primaries[0],review=cases[0];
    return{statuses:[directory.status,reviews.status,notices.status,officers.status],directoryArray:Array.isArray(directory.data.users),
      reviewArray:Array.isArray(reviews.data),noticeArray:Array.isArray(notices.data),officerArray:Array.isArray(officers.data),
      officerCount:Array.isArray(officers.data)?officers.data.length:null,
      officerNames:Array.isArray(officers.data)?officers.data.map(o=>o.fullName).filter(name=>typeof name==='string'&&name.length>0):[],
      activeOfficerCount:Array.isArray(officers.data)?officers.data.filter(o=>o.status==='active').length:null,managerCount:managers.length,primaryCount:primaries.length,
      childOwned:!!manager&&!!primary&&manager.primaryAccountId===primary.id&&manager.parentId===primary.id&&manager.parentRole==='user'&&manager.id!==primary.id,
      managerStatus:manager?.status,caseCount:cases.length,caseMatchesManager:!!review&&review.managerId===manager?.id,
      caseStatus:review?.status,savedResidence:typeof review?.residenceId==='string'&&review.residenceId.length>0,
      propertyName:typeof review?.hostelName==='string'?review.hostelName:'',managerName:typeof review?.managerName==='string'?review.managerName:'',
      noticePresent:Array.isArray(notices.data)&&!!review?.hostelName&&notices.data.some(n=>n.title==='Manager Registration Submitted'
        &&n.category==='verification'&&typeof n.message==='string'&&n.message.includes('"'+review.hostelName+'"')),
      pendingCount:Array.isArray(reviews.data)?reviews.data.filter(r=>!r.status||['pending','inspection_pending','under_review','more_info_required','submitted'].includes(r.status.toLowerCase())).length:0};
  })()`);
  check(saved.statuses.every(status=>status===200),'Actual administrator directory, verification, notification and officer-roster GETs succeed.');
  check(saved.directoryArray&&saved.reviewArray&&saved.noticeArray&&saved.officerArray,'The real endpoints preserve their documented directory and list shapes.');
  check(saved.managerCount===1&&saved.primaryCount===1&&saved.childOwned,'The exact manager is linked to the actual selected primary account.');
  check(saved.managerStatus==='pending','The separate manager portal remains pending administrator verification.');
  check(saved.caseCount===1&&saved.caseMatchesManager&&saved.caseStatus==='inspection_pending'&&saved.savedResidence,'The exact existing manager has its saved residence and inspection-pending application.');
  check(saved.propertyName.length>0&&saved.managerName.length>0,'The real submitted application supplies its saved display details.');
  check(saved.noticePresent,'The current administrator received the actual property-registration submission notification.');
  console.log(JSON.stringify({stage,checks,managerStatus:saved.managerStatus,caseStatus:saved.caseStatus,matchingCases:saved.caseCount,submissionNoticePresent:saved.noticePresent,officerCount:saved.officerCount,activeOfficerCount:saved.activeOfficerCount}));

  stage='real guest and stale-account review denials';
  const denials=await evaluate(`(async()=>Promise.all(['/api/manager-verifications','/api/admin/verification-inspections','/api/verification-teams'].map(async path=>{
    const [guest,stale]=await Promise.all([
      fetch(path,{credentials:'omit',signal:AbortSignal.timeout(45000)}),
      fetch(path,{credentials:'same-origin',headers:{'X-PineVela-Profile-Context':crypto.randomUUID()},signal:AbortSignal.timeout(45000)})
    ]);return{path,guest:guest.status,stale:stale.status};})))()`);
  for(const denial of denials){
    check(denial.guest===401,'The actual review endpoint rejects a request without authentication: '+denial.path);
    check(denial.stale===409,'The actual review endpoint rejects a stale account binding: '+denial.path);
  }

  stage='actual manager review navigation';
  console.log(JSON.stringify({stage,elapsedMs:Date.now()-startedAt}));
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  const documentStarted=Date.now(),documentReadsStart=requestResults.length;
  await navigate('/?managerReviewAcceptance='+Date.now()+'#/admin/dashboard');
  stage='actual manager navigation control';
  // Actual current controls: desktop sidebar title, desktop top-nav aria label,
  // or MobileNavigation's stable destination id. These select navigation only.
  const navigation="[...document.querySelectorAll('button')].find(b=>b.getBoundingClientRect().width>0&&(b.dataset.navigationId==='managers'||b.title==='Managers & Staffs'||/^Managers(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||'')))";
  await waitFor('!!('+navigation+')','Actual manager navigation',90000);
  await evaluate('('+navigation+').click()');
  stage='actual saved manager application card';
  console.log(JSON.stringify({stage,elapsedMs:Date.now()-startedAt}));
  const card="(()=>{const email=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()==="+JSON.stringify(managerEmail)+");return email?.closest('div.grid')?.parentElement;})()";
  const cardReady="(()=>{const card="+card+";return !!card&&!!card.querySelector('h4')&&card.textContent.includes("+JSON.stringify(saved.propertyName)+")&&card.textContent.includes('Awaiting Dispatch');})()";
  await waitFor(cardReady,'Actual saved inspection-pending manager card',45000);checks++;
  const managerReadyMs=Date.now()-documentStarted,initialReads=requestResults.slice(documentReadsStart);
  const reviewPaths=['/api/manager-verifications','/api/admin/verification-inspections'];
  const reviewReads=reviewPaths.map(path=>initialReads.find(result=>result.path===path&&result.status===200));
  check(reviewReads.every(Boolean),'The page loads the actual applications and inspection reports successfully.');
  check(Math.max(...reviewReads.map(result=>result.startedMs))<Math.min(...reviewReads.map(result=>result.startedMs+result.headersMs)),
    'The two initial review reads overlap instead of waiting for sequential dashboard or officer-roster reads.');
  check(!initialReads.some(result=>result.path==='/api/manager-requests'),'The Supabase page does not request the duplicate manager-list alias.');
  console.log(JSON.stringify({stage,checks,managerReadyMs,concurrentReviewReads:true}));
  const responsive=[];
  for(const [width,height]of[[1440,900],[375,812]]){
    stage='read-only manager application card at '+width+'px';
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await waitFor('innerWidth==='+width+'&&('+cardReady+')','Actual manager card at requested viewport',45000);
    const state=await evaluate(`(()=>{
      const card=${card},navigation=${navigation},buttons=card?[...card.querySelectorAll('button')].map(b=>b.textContent.trim()):[];
      const label=navigation?(navigation.getAttribute('aria-label')||navigation.textContent):'';
      const rect=card?.getBoundingClientRect();
      return{managerName:card?.querySelector('h4')?.textContent.trim()===${JSON.stringify(saved.managerName)},
        property:!!card&&card.textContent.includes(${JSON.stringify(saved.propertyName)}),awaitingDispatch:!!card&&card.textContent.includes('Awaiting PineVela On-Site Verification Dispatch'),
        dispatchAvailable:buttons.includes('Dispatch Verification Team'),correctionsAvailable:buttons.includes('Request corrections'),
        prematureApprovalHidden:!buttons.includes('Approve')&&!buttons.includes('Review On-Site Report'),
        selectedNavigation:navigation?.getAttribute('aria-current')==='page',pendingBadge:!!label&&new RegExp('(?:^|\\\\D)'+${saved.pendingCount}+'(?:\\\\D|$)').test(label),
        viewportBounded:document.documentElement.scrollWidth<=innerWidth+1,
        cardBounded:!!card&&card.scrollWidth<=card.clientWidth+1&&rect.left>=-1&&rect.right<=innerWidth+1};
    })()`);
    check(state.managerName&&state.property&&state.awaitingDispatch,'The actual manager card preserves saved identity, property and pending-dispatch status.');
    check(state.dispatchAvailable&&state.correctionsAvailable&&state.prematureApprovalHidden,'Pending inspection offers dispatch/corrections and hides premature report review or approval.');
    check(state.selectedNavigation&&state.pendingBadge,'The actual manager navigation is selected and displays its saved pending count.');
    check(state.viewportBounded&&state.cardBounded,'The actual manager application remains within the desktop/mobile viewport.');
    responsive.push({width,height,...state});
  }
  populatedReviewEvidence={managerReadyMs,concurrentReviewReads:true,responsive,denials};
  console.log(JSON.stringify({stage:'populated manager review verified',checks,...populatedReviewEvidence}));
  let recovery;
  if(verifyRecovery){
    stage='real delayed manager read and bounded retry';
    console.log(JSON.stringify({stage,checks}));
    const held=new Set(),heldCounts={applications:0,officers:0};
    const removeListener=onEvent(event=>{if(event.method==='Fetch.requestPaused'){
      held.add(event.params.requestId);heldCounts[new URL(event.params.request.url).pathname==='/api/verification-teams'?'officers':'applications']++;
    }});
    try{
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
      await command('Fetch.enable',{patterns:[{urlPattern:base+'/api/manager-verifications',requestStage:'Request'},
        {urlPattern:base+'/api/verification-teams',requestStage:'Request'}]});
      await navigate('/?managerReviewRecovery='+Date.now()+'#/admin/dashboard');
      await waitFor('!!('+navigation+')','Actual manager navigation for recovery',90000);
      await evaluate('('+navigation+').click()');
      const retry="[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry manager applications')";
      await waitFor('!!('+retry+')','Bounded manager-read error and explicit retry',45000);checks++;
      check(heldCounts.applications===1&&heldCounts.officers===1,'Exactly one genuine application read and one roster read are delayed; replies are never fabricated.');
      check(await evaluate("document.body.textContent.includes('Manager applications could not load.')&&!document.body.textContent.includes('No Manager Verification Requests')"),
        'A failed review read is shown as a retry state rather than an empty application list.');
      // An errored read should wait for the user's retry, including across the
      // normal eight-second polling interval. Other real requests continue.
      await new Promise(resolve=>setTimeout(resolve,9000));
      check(heldCounts.applications===1&&heldCounts.officers===1,'Failed review and roster queries do not keep polling while waiting for explicit retry.');
      for(const id of held){await command('Fetch.continueRequest',{requestId:id}).catch(()=>{});held.delete(id);}
      await command('Fetch.disable');
      stage='actual manager read recovers after retry';
      await evaluate('('+retry+').click()');
      await waitFor(cardReady,'The actual saved manager card after retry',45000);checks++;
      check(await evaluate("!document.body.textContent.includes('Manager applications could not load.')"),'Successful real reads clear the retry state.');

      stage='independent field officer roster recovery';
      await evaluate("[...document.querySelectorAll('button')].find(b=>/^Field Officers \\(\\d+\\)$/.test(b.textContent.trim())).click()");
      const officerRetry="[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Retry field officers')";
      await waitFor('!!('+officerRetry+')','Independent roster retry control',15000);checks++;
      check(await evaluate('!!('+officerRetry+")&&document.body.textContent.includes('Could not load field officers.')&&!document.body.textContent.includes('No Verification Officers Registered')"),
        'An unavailable officer roster has its own retry state after the manager application has already recovered.');
      await evaluate('('+officerRetry+').click()');
      const officersReady="!document.body.textContent.includes('Could not load field officers.')&&"+
        JSON.stringify(saved.officerNames)+".every(name=>[...document.querySelectorAll('h5')].some(h=>h.textContent.trim()===name))";
      await waitFor(officersReady,'Actual saved field officer roster after its own retry',45000);checks++;
      check(await evaluate("document.documentElement.scrollWidth<=innerWidth+1"),'The actual roster retry remains within the viewport.');
      await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Physical Inspections')).click()");
      await waitFor(cardReady,'Manager review preserved after independent roster retry',45000);checks++;
      recovery={heldActualRequests:heldCounts,deadlineMs:30000,errorDisplayed:true,falseEmptyStateHidden:true,
        automaticRetryDisabled:true,actualRetryRecovered:true,officerRosterIndependent:true,actualOfficerRosterRetryRecovered:true};
      console.log(JSON.stringify({stage,checks,...recovery}));
    }finally{
      for(const id of held)await command('Fetch.continueRequest',{requestId:id}).catch(()=>{});
      await command('Fetch.disable').catch(()=>{});removeListener();
    }
  }
  stage='administrator sign-in preserved';
  const after=await evaluate("(async()=>{const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const data=await r.json();return{status:r.status,role:data.role,verified:data.isVerified===true};})()");
  check(after.status===200&&after.role==='admin'&&after.verified,'Read-only review preserves the genuine administrator session.');
  const report={passed:true,checks,genuineAdministrator:true,actualReplies:true,ownedManagerLinkVerified:true,
    managerStatus:saved.managerStatus,caseStatus:saved.caseStatus,actualSubmissionNotificationVerified:true,
    populatedManagerReviewUiVerified:true,responsive,officerCount:saved.officerCount,activeOfficerCount:saved.activeOfficerCount,
    managerReadyMs,concurrentReviewReads:true,denials,recovery,
    elapsedMs:Date.now()-startedAt,requestResults,providerRepliesFabricated:false,credentialsExtracted:false,
    dispatchClicked:false,decisionClicked:false,notificationAcknowledged:false,productMutationsRequested:0};
  await fs.mkdir('.security/migration-reset',{recursive:true,mode:0o700});
  await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
  }catch(error){
   viewDiagnostics=await evaluate(`(()=>({route:location.hash.split('?')[0],readyState:document.readyState,
    routeRetry:!!document.querySelector('[data-route-loading-retry]'),
    loginForm:!!document.querySelector('input[type=password]'),
    managerHeading:document.body.textContent.includes('Hostel Managers & On-Site Verification System'),
    actualManagerPresent:[...document.querySelectorAll('span')].some(s=>s.textContent.trim()===${JSON.stringify(managerEmail)}),
    awaitingDispatch:document.body.textContent.includes('Awaiting Dispatch'),
    managerNavigation:[...document.querySelectorAll('button')].filter(b=>b.dataset.navigationId==='managers'||b.title==='Managers & Staffs'||/^Managers(?: \\(\\d+\\))?$/.test(b.getAttribute('aria-label')||''))
     .map(b=>({title:b.title,label:b.getAttribute('aria-label'),visible:b.getBoundingClientRect().width>0,selected:b.getAttribute('aria-current')}))}))()`).catch(()=>({unavailable:true}));
   throw error;
  }
 },{approvalTimeoutMs:120000});
})().catch(async error=>{
 const report={passed:false,checks,stage,error:error.message,authentication:lastAuth,viewDiagnostics,populatedReviewEvidence,
  elapsedMs:Date.now()-startedAt,requestResults,pendingPaths:[...requests.values()].map(request=>request.path),
  credentialsExtracted:false,dispatchClicked:false,decisionClicked:false,productMutationsRequested:0};
 await fs.mkdir('.security/migration-reset',{recursive:true,mode:0o700});
 await fs.writeFile(reportPath,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.error(JSON.stringify(report));process.exitCode=1;
});
