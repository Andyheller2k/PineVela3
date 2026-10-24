/** Genuine officer-session acceptance in a task tab in the prepared officer context.
 * Reads only; never signs in, dispatches, submits evidence or extracts credentials. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises');
const { withApprovedPineVelaBrowser } = require('./lib/approved-pinevela-browser.cjs');
const officerEmail = (process.argv[2] || '').trim().toLowerCase();
const layoutOnly = process.argv[3] === '--layout-only';
const managerEmail = (process.argv[4] || '').trim().toLowerCase();
const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
assert(validEmail(officerEmail) && (process.argv.length === 3 ||
  (layoutOnly && (process.argv.length === 4 || (process.argv.length === 5 && validEmail(managerEmail))))),
  'Pass the actual officer email and optional --layout-only [actual manager email].');
const reportPath = '.security/migration-reset/' + (managerEmail ? 'officer-dispatch' : 'officer-session' + (layoutOnly ? '-layout' : '')) + '-browser.json';
let checks = 0, stage = 'prepared officer browser context', lastPageState;
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const save = async report => {
  await fs.mkdir('.security/migration-reset', { recursive: true, mode: 0o700 });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
};

(async () => {
  await withApprovedPineVelaBrowser(async ({ base, evaluate, navigate, waitFor, command, onEvent }) => {
    const operationalWrites = [], queueResponses = [];
    onEvent(event => {
      if (event.method === 'Network.requestWillBeSent') {
        const request = event.params.request, url = new URL(request.url);
        if (url.origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
          (/^\/api\/(?:admin\/dispatch-verification-team|verification-team\/inspections\/|storage\/upload-inspection-image)/.test(url.pathname) ||
            /^\/api\/manager-verifications\/[^/]+\/(?:approve|reject|request-info)$/.test(url.pathname))) operationalWrites.push(url.pathname);
      }
      if (event.method === 'Network.responseReceived') {
        const response = event.params.response, url = new URL(response.url);
        if (url.origin === base && url.pathname === '/api/verification-team/my-inspections') queueResponses.push(response.status);
      }
    });
    await command('Network.enable');
    const waitForQueueResponse = async (previousCount, label) => {
      const deadline = Date.now() + 90000;
      while (Date.now() < deadline) {
        if (queueResponses.length > previousCount) return;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw new Error(label + ' did not receive an actual queue response.');
    };
    const me = () => evaluate(`(async()=>{
      const started=performance.now();let r;
      try{r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)});const u=await r.json();
        return{status:r.status,id:u.id,profileId:u.profileId,officerId:u.officerId,name:u.name,email:u.email,
          role:u.role,verified:u.isVerified===true,zone:u.assignedZone,elapsedMs:Math.round(performance.now()-started)};
      }catch(error){return{status:r?.status??null,readFailed:true,errorName:error.name,elapsedMs:Math.round(performance.now()-started)};}})()`);
    stage = 'genuine verified officer identity';
    const actor = await me();
    console.log(JSON.stringify({stage,status:actor.status,role:actor.role,verified:actor.verified,
      readFailed:actor.readFailed,errorName:actor.errorName,elapsedMs:actor.elapsedMs}));
    check(actor.status === 200 && actor.verified && ['verification_team', 'officer', 'field_officer'].includes(actor.role),
      'A genuine verified officer must be signed in.');
    check(actor.email?.toLowerCase() === officerEmail && actor.id === actor.officerId && actor.id !== actor.profileId,
      'The exact officer identity has its own saved officer context.');
    check(typeof actor.name === 'string' && actor.name.length > 0 && typeof actor.zone === 'string' && actor.zone.length > 0,
      'Actual completed officer name and zone metadata are projected.');
    const request = (path, { guest = false, stale = false } = {}) => evaluate(`(async()=>{
      const r=await fetch(${JSON.stringify(path)},{credentials:${JSON.stringify(guest ? 'omit' : 'same-origin')},
        signal:AbortSignal.timeout(45000),headers:${JSON.stringify(stale ? { 'X-PineVela-Profile-Context': actor.profileId } : { 'X-PineVela-Profile-Context': actor.id })}}),d=await r.json();
      return{status:r.status,array:Array.isArray(d),count:Array.isArray(d)?d.length:null,
        allAssigned:Array.isArray(d)&&d.every(i=>i.assignedOfficerId===${JSON.stringify(actor.id)}),cache:r.headers.get('cache-control'),
        assignments:Array.isArray(d)?d.map(i=>({id:i.id,caseId:i.managerVerificationId,managerEmail:i.managerEmail,
          managerName:i.managerName,propertyName:i.hostelName,status:i.status,priority:i.priority,hasReport:!!i.report,
          officerId:i.assignedOfficerId,dispatchedAt:i.dispatchedAt})):[]};})()`);
    stage = 'own saved inspection queue';
    const queue = await request('/api/verification-team/my-inspections');
    console.log(JSON.stringify({stage,status:queue.status,count:queue.count}));
    check(queue.status === 200 && queue.array && queue.allAssigned, 'The saved queue returns only assignments to the authenticated officer.');
    check(/no-store/.test(queue.cache || ''), 'Private assignment reads cannot be cached.');
    let assignment;
    if (managerEmail) {
      stage = 'actual manually dispatched application';
      const matches = queue.assignments.filter(item => item.managerEmail?.toLowerCase() === managerEmail && item.status === 'dispatched');
      check(matches.length === 1, 'The actual manager has one pending dispatch in this officer queue.');
      assignment = matches[0];
      check(assignment.officerId === actor.id && !!assignment.caseId && !!assignment.propertyName && !assignment.hasReport && Number.isFinite(Date.parse(assignment.dispatchedAt)),
        'The actual saved dispatch is assigned to this officer and has no submitted report.');
      const [guest, stale] = await Promise.all([
        request('/api/verification-team/my-inspections', { guest: true }),
        request('/api/verification-team/my-inspections', { stale: true })
      ]);
      check(guest.status === 401 && !guest.array, 'The populated officer queue remains private to authenticated users.');
      check(stale.status === 409 && !stale.array, 'The populated officer queue rejects a stale captured context.');
      console.log(JSON.stringify({stage,checks,property:assignment.propertyName,status:assignment.status,hasReport:assignment.hasReport,guest:guest.status,stale:stale.status}));
    }
    if (!layoutOnly) {
    stage = 'guest, stale-context and administrator-access denials';
    const [guest, stale, ...denied] = await Promise.all([
      request('/api/verification-team/my-inspections', { guest: true }),
      request('/api/verification-team/my-inspections', { stale: true }),
      ...['/api/admin/verification-inspections', '/api/verification-teams', '/api/manager-verifications'].map(path => request(path))
    ]);
    check(guest.status === 401 && !guest.array, 'A genuine guest cannot read officer assignments.');
    check(stale.status === 409 && !stale.array, 'A stale captured profile cannot select the officer context.');
    denied.forEach(result => check(result.status === 403 && !result.array, 'The officer cannot read an administrator-only list.'));
    console.log(JSON.stringify({stage,checks,guest:guest.status,stale:stale.status,administratorReads:denied.map(r=>r.status)}));
    }

    const portalReady = "location.hash.split('?')[0]==='#/field-officer'&&document.body.textContent.includes('Field Officer')&&document.body.textContent.includes('Dispatched Property Inspections')&&!document.body.textContent.includes('Loading your dispatched assignments...')";
    stage = 'real officer portal';
    let responseCount = queueResponses.length;
    await navigate('/?officerAcceptance=' + Date.now() + '#/field-officer');
    await waitForQueueResponse(responseCount, 'Officer portal');
    try { await waitFor(portalReady, 'The real officer portal and queue', 90000); }
    catch (error) {
      lastPageState = await evaluate(`(()=>{const t=document.body.textContent;return{route:location.hash.split('?')[0],
        portal:t.includes('Field Officer'),queue:t.includes('Dispatched Property Inspections'),
        loading:t.includes('Loading your dispatched assignments...'),retry:!!document.querySelector('#session-retry-title'),
        denied:t.includes('Access Denied'),login:!!document.querySelector('input[type=password]')};})()`).catch(() => null);
      throw error;
    }
    check(queueResponses.length > responseCount && queueResponses.at(-1) === 200, 'The visible portal completed an actual successful queue read.');
    const responsive = [];
    for (const [width, height] of [[1440, 900], [375, 812]]) {
      stage = 'officer portal at ' + width + 'px';
      await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
      await waitFor('innerWidth===' + width + '&&(' + portalReady + ')', 'Officer portal viewport', 15000);
      const state = await evaluate(`(()=>{const text=document.body.textContent;
        const controls=[...document.querySelectorAll('button')].filter(b=>/Inspections|Options|Refresh Queue|Pending Visits|Submitted History|All \\(/.test(b.textContent));
        const rects=controls.map(b=>b.getBoundingClientRect()).filter(r=>r.width>0&&r.height>0);
        return{identityVisible:text.includes(${JSON.stringify(actor.name)})&&text.includes(${JSON.stringify(officerEmail)})&&text.includes(${JSON.stringify(actor.zone)}),
          countMatches:text.includes(${JSON.stringify('Dispatched Property Inspections (' + queue.count + ')')}),
          emptyMatches:${queue.count === 0}?text.includes('No Dispatches in Queue'):!text.includes('No Dispatches in Queue'),
          noReportOpen:!document.querySelector('form,dialog[open]'),
          bounded:document.documentElement.scrollWidth<=innerWidth+1,
          controlsBounded:rects.length>=5&&rects.every(r=>r.left>=-1&&r.right<=innerWidth+1),
          overflowingControls:controls.filter(b=>{const r=b.getBoundingClientRect();return r.width>0&&r.height>0&&(r.left< -1||r.right>innerWidth+1);})
            .map(b=>({label:b.textContent.trim(),left:Math.round(b.getBoundingClientRect().left),right:Math.round(b.getBoundingClientRect().right)})),
          refreshVisible:[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Refresh Queue')&&b.getBoundingClientRect().width>0)};})()`);
      lastPageState = { width, height, ...state };
      console.log(JSON.stringify({stage,checks,...lastPageState}));
      check(state.identityVisible && state.countMatches && state.emptyMatches, 'The real identity, zone and saved queue state are visible.');
      check(state.noReportOpen && state.refreshVisible, 'The queue offers refresh without opening an invented report.');
      check(state.bounded && state.controlsBounded, 'The officer portal and its queue controls stay inside the viewport.');
      if (assignment) {
        const card = await evaluate(`(()=>{
          const id=[...document.querySelectorAll('span')].find(s=>s.textContent.trim()===${JSON.stringify(assignment.id)});
          const card=id?.closest('div.rounded-3xl'),text=card?.textContent||'',rect=card?.getBoundingClientRect();
          return{propertyMatches:text.includes(${JSON.stringify(assignment.propertyName)}),managerMatches:text.includes(${JSON.stringify(assignment.managerName)}),
            pending:text.includes('Pending Field Visit')&&!text.includes('Report Submitted')&&!text.includes('Verified & Approved'),
            openActionReady:!!card&&[...card.querySelectorAll('button')].some(b=>b.textContent.includes('Perform On-Site Inspection')&&!b.disabled),
            bounded:!!rect&&rect.left>=-1&&rect.right<=innerWidth+1&&card.scrollWidth<=card.clientWidth+1};})()`);
        lastPageState = { ...lastPageState, assignmentCard: card };
        console.log(JSON.stringify({stage,assignmentCard:card}));
        check(card.propertyMatches && card.managerMatches && card.pending && card.openActionReady,
          'The exact saved dispatch is visible as a pending field visit with its existing action.');
        check(card.bounded, 'The populated dispatch card stays inside the viewport.');
        state.assignmentCard = card;
      }
      responsive.push({ width, height, ...state });
    }
    if (!layoutOnly) {
    stage = 'real queue refresh';
    responseCount = queueResponses.length;
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Refresh Queue')).click()");
    await waitForQueueResponse(responseCount, 'Explicit queue refresh');
    await waitFor(portalReady, 'Refreshed officer portal', 90000);
    check(queueResponses.length > responseCount && queueResponses.at(-1) === 200, 'Explicit refresh completes an actual queue read.');
    stage = 'administrator page denial';
    await navigate('/?officerBoundary=' + Date.now() + '#/admin/dashboard');
    await waitFor("document.body.innerText.includes('Access Denied')", 'Officer administrator-route denial', 90000); checks++;
    check(!(await evaluate("!!document.querySelector('[data-navigation-id=managers]')")), 'The denied administrator route does not render manager controls.');
    stage = 'officer return and reload';
    responseCount = queueResponses.length;
    await evaluate("[...document.querySelectorAll('a')].find(a=>new URL(a.href).origin===location.origin&&new URL(a.href).hash==='#/field-officer').click()");
    await waitForQueueResponse(responseCount, 'Return to the officer portal');
    await waitFor(portalReady, 'Return to the officer portal', 90000); checks++;
    responseCount = queueResponses.length;
    await command('Page.reload', { ignoreCache: true });
    await waitForQueueResponse(responseCount, 'Officer session reload');
    await waitFor(portalReady, 'Officer session survives reload', 90000);
    check(queueResponses.length > responseCount && queueResponses.at(-1) === 200, 'Reload restores the real officer queue.');
    }
    const after = await me();
    check(after.status === 200 && after.id === actor.id && after.officerId === actor.officerId && after.email === actor.email && after.role === actor.role && after.verified,
      'The same genuine officer identity remains signed in.');
    if (assignment) {
      const afterQueue = await request('/api/verification-team/my-inspections');
      const saved = afterQueue.assignments?.find(item => item.id === assignment.id);
      check(afterQueue.status === 200 && afterQueue.allAssigned && saved?.caseId === assignment.caseId && saved?.status === assignment.status && !saved?.hasReport,
        'The same actual pending dispatch remains saved after read-only checks.');
    }
    check(operationalWrites.length === 0, 'No dispatch, report, approval or evidence upload was requested.');
    const report = { passed: true, checks, scope: managerEmail ? 'manually created dispatch and officer queue' : layoutOnly ? 'officer identity and queue layout' : 'officer session, access boundaries and queue layout',
      actualOfficer: { name: actor.name, email: actor.email, zone: actor.zone },
      actualAssignment: assignment ? { propertyName: assignment.propertyName, managerEmail: assignment.managerEmail,
        status: assignment.status,priority: assignment.priority,hasReport: assignment.hasReport } : undefined,
      actualQueueCount: queue.count, responsive, nativeReplies: true, operationalWritesRequested: 0,
      credentialsExtracted: false, providerRepliesFabricated: false, originalTabsModified: false,
      genuineFreshSignInBrowserVerified: true, physicalInspectionAcceptancePending: true,
      ownQueueAssignmentOwnershipChecked: true, crossOfficerPopulatedIsolationVerified: false };
    await save(report); console.log(JSON.stringify(report));
  }, { preferOfficerContext: true, approvalTimeoutMs: 120000 });
})().catch(async error => {
  const report = { passed: false, checks, stage, error: error.message, lastPageState, credentialsExtracted: false,
    providerRepliesFabricated: false, positiveOfficerBrowserAcceptancePending: true };
  await save(report); console.error(JSON.stringify(report)); process.exitCode = 1;
});
