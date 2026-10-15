/** Real manager progress checks, reloadable in one approved task connection. */
const assert=require('node:assert/strict'),fs=require('node:fs/promises');
let stage='approved local browser';
async function verify({base,evaluate,navigate,command},managerEmail){
 let checks=0;
 const check=(v,label)=>{assert(v,label);checks++;};
 // Only these fixed read-only DOM predicates may retry a context lost while
 // Chromium replaces a document. Never replay an arbitrary evaluation/request.
 const transient=e=>e.contextLost||e.message==='Browser command rejected: Runtime.evaluate (-32602)';
 const ready=async(predicate,label,timeout)=>{
  const deadline=Date.now()+timeout;
  while(Date.now()<deadline){
   try{if(await evaluate(predicate))return;}catch(e){if(!transient(e))throw e;}
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw Error(label+' did not become ready');
 };
 const read=async(route,headers={})=>evaluate(`(async()=>{const r=await fetch(${JSON.stringify(route)},{headers:${JSON.stringify(headers)},credentials:'same-origin',signal:AbortSignal.timeout(45000)});return {status:r.status,data:await r.json()};})()`);
 stage='actual primary sign-in';console.log(JSON.stringify({stage}));
 const before=await read('/api/auth/me');
 console.log(JSON.stringify({stage,status:before.status,role:before.data.role||null,verified:before.data.isVerified===true,expectedOwner:before.data.email?.toLowerCase()==='finalform2k@gmail.com'}));
 check(before.status===200&&before.data.role==='user'&&before.data.isVerified,'Keep the genuine verified primary signed in');
 check(before.data.email?.toLowerCase()==='finalform2k@gmail.com','Use the selected primary owner');
 stage='saved Google manager and ownership';
 const snapshot=await read('/api/users/manager-onboarding',{'X-PineVela-Profile-Context':before.data.id});
 check(snapshot.status===200,'Actual owned registration snapshot loads');
 const {registrations,enrollments}=snapshot.data;
 check(Array.isArray(enrollments),'Owned enrollment list is present');
 console.log(JSON.stringify({stage,ownedManagerProgress:enrollments.filter(e=>e.kind==='manager').map(e=>({selectedEmail:e.email?.toLowerCase()===managerEmail,status:e.status,verified:!!e.verified_at,authentication:e.authentication,portalStatus:e.account_status}))}));
 const saved=enrollments.find(e=>e.kind==='manager'&&e.email?.toLowerCase()===managerEmail&&e.verified_at&&['pending_review','completed'].includes(e.status));
 check(saved,'The selected manager identity is actually verified and saved');
 check(saved.authentication==='google','The saved identity came from Google enrollment');
 check(saved.signup_id!==before.data.profileId,'Manager and primary use separate genuine subjects');
 const account=registrations.managerAccount;
 check(account?.id===saved.account_id&&account.email?.toLowerCase()===saved.email.toLowerCase()&&account.emailVerified,'Owned manager and enrollment match');
 const phase=account.requiresPropertyRegistration?'property_details':account.canCorrectRegistration?'corrections':account.isApproved?'approved':'submitted_for_review';
 if(phase==='property_details')check(saved.status==='pending_review'&&!account.hostelId&&!account.residences?.length,'Verified identity has no invented property or assignment');
 else check(saved.status==='completed'&&!!account.hostelId,'Submitted application has its saved residence');
 console.log(JSON.stringify({stage,checks,phase,managerStatus:account.status,enrollmentStatus:saved.status,verifiedGoogle:true}));
 stage='actual primary role and captured-account denials';
 for(const [route,headers,status]of [
  ['/api/users/manager-onboarding?userId=other-account',{},400],
  ['/api/users/manager-onboarding',{'X-PineVela-Profile-Context':'other-account'},409],
  ['/api/users/manager-onboarding',{'X-PineVela-Account-Context':'other-account'},409],
  ['/api/manager/secret-key',{},403],
  ['/api/admin/verification-inspections',{},403]
 ]){
  const r=await read(route,headers);check(r.status===status,'Native role/selector/stale account denial');
  check(!('enrollments'in r.data||'registrations'in r.data||'secretKey'in r.data),'Denied requests return no private registration or key');
 }
 stage='actual registration page resume';console.log(JSON.stringify({stage,checks,phase}));
 try{await navigate('/?managerCreatedAcceptance='+Date.now()+'#/register-manager');}
 catch(e){if(!transient(e))throw e;await ready('location.origin==='+JSON.stringify(base)+"&&document.readyState==='complete'",'Actual local document',90000);}
 const predicate=phase==='property_details'?"!!document.querySelector('section[aria-label=\"Manager registration progress\"]')":phase==='corrections'?"!!document.querySelector('section[aria-label=\"Correct manager application\"]')":"document.body.textContent.includes('Recorded Registered Residence')";
 await ready(predicate,'Actual saved manager registration phase',90000);checks++;
 check(!(await evaluate("document.body.innerText.includes('Create your manager login')")),'A verified manager must resume instead of repeating Google signup');
 const previousDocument=await evaluate('performance.timeOrigin');
 await command('Page.reload',{ignoreCache:true});
 await ready('performance.timeOrigin!=='+previousDocument+'&&('+predicate+')','Saved manager progress after real reload',90000);checks++;
 const after=await read('/api/auth/me');
 check(after.status===200&&after.data.id===before.data.id&&after.data.role==='user'&&after.data.email===before.data.email,'Google manager verification and reload retain the primary sign-in');
 const report={passed:true,checks,genuinePrimary:true,genuineSeparateGoogleManager:true,savedVerifiedEnrollment:true,phase,managerStatus:account.status,enrollmentStatus:saved.status,reloadResumes:true,primarySessionPreserved:true,actualRoleAndScopeDenials:true,providerRepliesFabricated:false,credentialsExtracted:false,propertySubmittedByAutomation:false,inspectionFabricated:false,cloudProductMutations:0};
 await fs.writeFile('.security/migration-reset/google-manager-created-browser.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));return report;
}
async function status(context){return context.evaluate("({route:location.hash.split('?')[0],wizard:!!document.querySelector('section[aria-label=\"Manager registration progress\"]'),savedProperty:document.body.textContent.includes('Recorded Registered Residence'),newGoogleForm:document.body.textContent.includes('Create your manager login'),failed:document.body.textContent.includes('Manager registration could not load'),recovery:!!document.querySelector('[data-route-loading-retry]')})");}
module.exports={verify,status,getStage:()=>stage};
