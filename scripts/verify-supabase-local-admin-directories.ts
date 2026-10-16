/** Actual local GoTrue and HTTP authorization of the consolidated directory read.
 * Uses retained run-owned test identities; creates no cloud accounts or email. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readLocalFixture,runLocalSupabaseVerification,signInLocalAccount,
 type LocalAccountCredentials} from './lib/local-supabase-harness.js';

let checks=0,stage='owned local stack';
const check=(condition:unknown,label:string)=>{assert.ok(condition,label);checks++;};
try{
 await runLocalSupabaseVerification(async h=>{
  await h.assertOwned();
  const fixture=readLocalFixture<{roles:Record<string,LocalAccountCredentials>}>(h,'business-browser-fixtures.json');
  assert.ok(fixture?.roles.administrator&&fixture.roles.primary&&fixture.roles.manager,'Existing native role fixtures required.');
  const path='/api/admin/dashboard-directories';
  stage='unsigned HTTP denial';
  check((await h.session().request(path)).status===401,'An unsigned HTTP caller cannot load administrator directories');
  stage='actual administrator login';
  const admin=await signInLocalAccount(h,fixture.roles.administrator,'admin');
  const context=admin.user.id;
  const options={headers:{'X-PineVela-Profile-Context':context,'X-PineVela-Account-Context':context}};
  const start=performance.now(),response=await admin.session.request(path,options);
  const directoryMs=Math.round(performance.now()-start);
  check(response.status===200,'The actual signed-in administrator can load all directories');
  check(response.headers.get('cache-control')==='private, no-store','Private directory replies cannot be cached');
  const projections={residences:'/api/admin/hostels',managerRestrictions:'/api/admin/manager-restrictions',
   boardRequests:'/api/board-requests',activities:'/api/activities',digitalMarketApps:'/api/admin/digital-market/applications',
   digitalMarketStores:'/api/admin/digital-market/stores',paymentRecords:'/api/admin/payments',allUsersData:'/api/admin/all-users'};
  stage='actual HTTP projection parity';
  for(const [key,endpoint] of Object.entries(projections)){
   const old=await admin.session.request(endpoint,options);
   check(old.status===200,'The existing '+key+' endpoint remains available');
   assert.deepEqual(response.data[key],old.data,key+' matches the original actual HTTP projection');checks++;
  }
  check(response.data.allUsersData.users.length===response.data.allUsersData.totalUsers,'Authoritative account totals match their actual directory');
  stage='actual HTTP selector and context denial';
  for(const key of ['userId','profileId','hostelId','managerId','sellerId','staffId','roomId','bedId','accountId'])
   check((await admin.session.request(path+'?'+key+'='+encodeURIComponent(fixture.roles.primary.contextId!),options)).status===400,
    'HTTP '+key+' cannot select another identity or property');
  for(const header of ['X-PineVela-Profile-Context','X-PineVela-Account-Context'])
   check((await admin.session.request(path,{headers:{...options.headers,[header]:fixture.roles.primary.contextId!}})).status===409,
    'An actual different context is rejected by '+header);
  stage='actual wrong-role HTTP denial';
  for(const role of ['primary','manager','staffA','officer']){
   const signed=await signInLocalAccount(h,fixture.roles[role],fixture.roles[role].accountKind);
   check((await signed.session.request(path)).status===403,'Actual '+role+' sessions cannot load administrator directories');
   check((await signed.session.request(path,options)).status===403,'An administrator header cannot elevate an actual '+role+' session');
   check((await signed.session.json('/api/auth/logout',{})).status===200,'Actual '+role+' test session logs out');
  }
  stage='actual administrator logout';
  check((await admin.session.json('/api/auth/logout',{})).status===200,'Actual administrator test session logs out');
  check((await admin.session.request(path,options)).status===401,'Logout immediately denies the directory read despite its captured administrator header');
  const report={passed:true,checks,actualGoTrue:true,actualHttp:true,projectionParity:8,directoryMs,
   cloudRecordsModified:0,accountsCreated:0,emailsSent:0,providerRepliesMocked:false,paystackRequests:0};
  fs.writeFileSync('.security/migration-reset/administrator-dashboard-directories-http.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify(report));
 });
}catch(error:any){
 console.error(JSON.stringify({passed:false,stage,checks,code:error.code||null,
  error:'Local administrator directory verification stopped; no credentials or account records are printed.'}));
 process.exitCode=1;
}
