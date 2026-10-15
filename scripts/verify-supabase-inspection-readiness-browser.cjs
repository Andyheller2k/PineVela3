/** Read actual inspection readiness without dispatching or submitting evidence. */
const assert = require('node:assert/strict'), fs = require('node:fs/promises');
const { withApprovedPineVelaBrowser } = require('./lib/approved-pinevela-browser.cjs');
const managerEmail = (process.argv[2] || '').trim().toLowerCase();
const developmentOnly = process.argv[3] === '--development-only';
assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(managerEmail) &&
  (process.argv.length === 3 || (process.argv.length === 4 && developmentOnly)),
  'Pass the actual manager email and optional --development-only when confirmed by the owner.');
const reportPath = '.security/migration-reset/inspection-readiness-browser.json';
let checks = 0, stage = 'approved administrator browser';
const check = (condition, label) => { assert.ok(condition, label); checks++; };
const save = async report => {
  await fs.mkdir('.security/migration-reset', { recursive: true, mode: 0o700 });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
};

(async () => {
  await withApprovedPineVelaBrowser(async ({ base, evaluate, command, onEvent }) => {
    const mutations = [];
    onEvent(event => {
      if (event.method !== 'Network.requestWillBeSent') return;
      const request = event.params.request, url = new URL(request.url);
      if (url.origin === base && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) mutations.push(url.pathname);
    });
    await command('Network.enable');
    stage = 'genuine administrator session';
    const authentication = await evaluate(`(async()=>{
      const r=await fetch('/api/auth/me',{credentials:'same-origin',signal:AbortSignal.timeout(45000)}),u=await r.json();
      return{status:r.status,role:u.role,verified:u.isVerified===true,id:u.id};})()`);
    check(authentication.status === 200 && authentication.role === 'admin' && authentication.verified &&
      typeof authentication.id === 'string', 'A genuine verified administrator must be signed in.');
    stage = 'actual saved application, officer roster and inspections';
    const snapshot = await evaluate(`(async()=>{
      const read=async path=>{const r=await fetch(path,{credentials:'same-origin',
        headers:{'X-PineVela-Profile-Context':${JSON.stringify(authentication.id)}},signal:AbortSignal.timeout(45000)});
        return{status:r.status,data:await r.json()};};
      const [cases,officers,inspections]=await Promise.all(['/api/manager-verifications','/api/verification-teams','/api/admin/verification-inspections'].map(read));
      const applications=Array.isArray(cases.data)?cases.data.filter(c=>c.managerEmail?.toLowerCase()===${JSON.stringify(managerEmail)}):[];
      const application=applications.length===1?applications[0]:null;
      return{statuses:[cases.status,officers.status,inspections.status],listsValid:[cases,officers,inspections].every(r=>Array.isArray(r.data)),
        matchingCases:applications.length,application:application?{id:application.id,propertyName:application.hostelName,
          managerEmail:application.managerEmail,location:application.location,status:application.status,residenceId:application.residenceId}:null,
        officers:Array.isArray(officers.data)?officers.data.map(o=>({id:o.officerId||o.id,name:o.fullName,email:o.email,zone:o.assignedZone,status:o.status})):[],
        inspections:Array.isArray(inspections.data)&&application?inspections.data.filter(i=>i.managerVerificationId===application.id)
          .map(i=>({id:i.id,status:i.status,hasReport:!!i.report})):[]};})()`);
    check(snapshot.statuses.every(status => status === 200) && snapshot.listsValid, 'All three actual administrator endpoints return real lists.');
    check(snapshot.matchingCases === 1 && snapshot.application?.residenceId && snapshot.application?.propertyName,
      'The exact submitted manager application and residence are saved.');
    const application = snapshot.application;
    const activeOfficers = snapshot.officers.filter(officer => officer.status === 'active');
    const liveInspections = snapshot.inspections.filter(inspection => ['dispatched', 'report_submitted'].includes(inspection.status));
    check(liveInspections.length <= 1, 'The saved case has at most one live inspection.');
    stage = 'unchanged saved inspection state';
    const after = await evaluate(`(async()=>{
      const [me,r]=await Promise.all(['/api/auth/me','/api/admin/verification-inspections'].map(path=>fetch(path,
        {credentials:'same-origin',headers:{'X-PineVela-Profile-Context':${JSON.stringify(authentication.id)}},signal:AbortSignal.timeout(45000)})));
      const [actor,list]=await Promise.all([me.json(),r.json()]);
      return{authStatus:me.status,actorId:actor.id,role:actor.role,verified:actor.isVerified===true,readStatus:r.status,
        inspections:Array.isArray(list)?list.filter(i=>i.managerVerificationId===${JSON.stringify(application.id)})
          .map(i=>({id:i.id,status:i.status,hasReport:!!i.report})):null};})()`);
    check(after.authStatus === 200 && after.actorId === authentication.id && after.role === 'admin' && after.verified,
      'The actual administrator session is preserved.');
    check(after.readStatus === 200 && JSON.stringify(after.inspections) === JSON.stringify(snapshot.inspections),
      'Read-only checks leave actual saved inspections unchanged.');
    check(mutations.length === 0, 'No product mutation request was sent.');
    const nextStep = developmentOnly ? 'real_property_required_for_physical_acceptance'
      : application.status === 'approved' ? 'operational_manager_acceptance'
      : liveInspections.some(inspection => inspection.status === 'report_submitted') ? 'administrator_report_review'
      : liveInspections.length ? 'officer_report_pending' : 'review_dispatch_prerequisites';
    const report = { passed: true, checks, nextStep, developmentOnlyConfirmedByUser: developmentOnly,
      application, activeOfficers, liveInspections, actualReplies: true, productMutationsRequested: 0,
      credentialsExtracted: false, providerRepliesFabricated: false, administratorSessionPreserved: true };
    await save(report);
    console.log(JSON.stringify({ passed: true, checks, nextStep, developmentOnlyConfirmedByUser: developmentOnly,
      application: { propertyName: application.propertyName, managerEmail: application.managerEmail, status: application.status },
      activeOfficers: activeOfficers.map(({ name, email, zone }) => ({ name, email, zone })),
      liveInspectionCount: liveInspections.length, productMutationsRequested: 0, administratorSessionPreserved: true }));
  }, { approvalTimeoutMs: 120000 });
})().catch(async error => {
  await save({ passed: false, checks, stage, error: error.message, productMutationsRequested: 0,
    credentialsExtracted: false, providerRepliesFabricated: false });
  console.error(JSON.stringify({ passed: false, checks, stage, error: error.message })); process.exitCode = 1;
});
