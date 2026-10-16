/** Prepare native administrator/officer invitations on the owned local stack,
 * then serve the actual frontend until interrupted. Never uses cloud credentials. */
import assert from 'node:assert/strict';
import {createLocalPrimary,readLocalFixture,saveLocalFixture,signInLocalAccount,runLocalSupabaseVerification,
 type LocalSupabaseHarness,type LocalAccountCredentials} from './lib/local-supabase-harness.js';

let checks=0,stage='local administrator preparation';
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;};
type Administrator=LocalAccountCredentials&{slot:number;contextId:string;role:'admin';accountKind:'admin';approvalKey?:string;settingsKey?:string};
async function enrollKeys(h:LocalSupabaseHarness,credentials:Administrator){
 const signed=await signInLocalAccount(h,credentials,'admin');
 for(const [field,route,column]of[
  ['approvalKey','/api/admin/governance/keys/enroll','approval_key_hash'],
  ['settingsKey','/api/admin/governance/keys/settings/enroll','settings_key_hash'],
 ]as const){
  const native=(await h.db.pool.query(`select ${column} is not null as enrolled from private.admin_secrets where context_id=$1`,[credentials.contextId])).rows[0];
  if(native?.enrolled){assert.ok(credentials[field],'An already issued local key must have its actual saved private receipt');continue;}
  const response=await signed.session.json(route,{});
  check(response.status===200,'Native local administrator key enrollment succeeds');
  const key=response.data?.[field==='approvalKey'?'privateKey':'settingsKey'];assert.equal(typeof key,'string');credentials[field]=key;
  saveLocalFixture(h,'administrator-'+credentials.slot+'.json',credentials);
 }
 return signed.session;
}
async function prepare(h:LocalSupabaseHarness){
 await h.assertOwned();
 const founder=readLocalFixture<LocalAccountCredentials>(h,'auth-smoke-credentials.json');assert.ok(founder,'Run the actual local Auth smoke first');
 const row=(await h.db.pool.query(`select c.id,m.slot from public.account_contexts c join public.admin_memberships m on m.context_id=c.id
  join auth.users u on u.id=c.auth_user_id where lower(u.email)=$1 and c.kind='admin' and m.slot=1 and m.status='active'`,[founder.email])).rows[0];
 assert.ok(row,'Actual local founder bootstrap exists');
 const administrators:Administrator[]=[];
 const main:Administrator=readLocalFixture<Administrator>(h,'administrator-1.json')||{...founder,contextId:row.id,
  name:founder.name||'Local Auth Founder',slot:1,role:'admin',accountKind:'admin'};
 saveLocalFixture(h,'administrator-1.json',main);administrators.push(main);
 const founderSession=await enrollKeys(h,main);
 console.log(JSON.stringify({localFixtureProgress:true,stage:'founder keys enrolled',cloudRecordsModified:0}));
 let otherPrimary:Awaited<ReturnType<typeof createLocalPrimary>>|undefined;
 for(let slot=2;slot<=5;slot++){
  stage='administrator slot '+slot;
  const target=await createLocalPrimary(h,'administrator-'+slot);otherPrimary??=target;
  let native=(await h.db.pool.query(`select c.id,m.slot from public.account_contexts c join public.admin_memberships m on m.context_id=c.id
   join auth.users u on u.id=c.auth_user_id where lower(u.email)=$1 and c.kind='admin' and m.status='active'`,[target.credentials.email])).rows[0];
  const receiptName='administrator-invitation-'+slot+'.json';
  let invitation=readLocalFixture<any>(h,receiptName);
  if(!native){
   if(!invitation){
    const previous=(await h.db.pool.query('select id from private.admin_invitations where invited_email=$1 and accepted_at is null and cancelled_at is null',[target.credentials.email])).rows[0];
    assert.ok(!previous,'A missing private invitation receipt requires review before another invitation');
    const response=await founderSession.json('/api/admin/governance/invitations',{name:target.credentials.name,email:target.credentials.email,privateKey:main.approvalKey});
    check(response.status===200,'Native founder-keyed administrator invitation is created');invitation=response.data;saveLocalFixture(h,receiptName,invitation);
   }
   check((await target.session.json('/api/auth/admin-invitation/inspect',{invitationToken:invitation.invitationToken})).status===200,'Exact verified invited identity can inspect its real invitation');
   const accepted=await target.session.json('/api/auth/admin-invitation/accept',{invitationToken:invitation.invitationToken});
   check(accepted.status===200&&accepted.data?.slot===slot,'Native reserved administrator invitation is accepted');
   native={id:accepted.data.id,slot};
  }
  const credentials:Administrator=readLocalFixture<Administrator>(h,'administrator-'+slot+'.json')
   ||{...target.credentials,contextId:native.id,slot,role:'admin',accountKind:'admin'};
  assert.equal(native.slot,slot);assert.equal(credentials.contextId,native.id);
  saveLocalFixture(h,'administrator-'+slot+'.json',credentials);await enrollKeys(h,credentials);administrators.push(credentials);
  console.log(JSON.stringify({localFixtureProgress:true,stage:'administrator ready',slot,cloudRecordsModified:0}));
 }
 stage='officer invitation';
 const primary=await createLocalPrimary(h,'inspection-officer');
 let officer=readLocalFixture<LocalAccountCredentials>(h,'officer.json');
 let native=(await h.db.pool.query(`select c.id from public.account_contexts c join auth.users u on u.id=c.auth_user_id
  where c.kind='officer' and c.status='active' and lower(u.email)=$1`,[primary.credentials.email])).rows[0];
 if(!native){
  let invitation=readLocalFixture<any>(h,'officer-invitation.json');
  if(!invitation){
   assert.ok(!(await h.db.pool.query("select id from private.account_enrollments where kind='officer' and invited_email=$1 and status='pending_email'",[primary.credentials.email])).rowCount,'Missing officer invitation receipt requires review');
   const response=await founderSession.json('/api/verification-teams',{fullName:'Local Inspection Officer',email:primary.credentials.email,
    phone:'+233200000001',assignedZone:'Local Workflow Zone',privateKey:main.approvalKey});
   check(response.status===201,'Native administrator-keyed officer invitation is created');invitation=response.data;saveLocalFixture(h,'officer-invitation.json',invitation);
  }
  check((await otherPrimary!.session.json('/api/auth/officer-invitation/inspect',{invitationToken:invitation.invitationToken})).status===403,'An actual different email identity cannot inspect the officer invitation');
  const inspected=await primary.session.json('/api/auth/officer-invitation/inspect',{invitationToken:invitation.invitationToken});
  check(inspected.status===200&&inspected.data?.fullName==='Local Inspection Officer','Exact verified officer identity inspects saved invitation fields');
  const accepted=await primary.session.json('/api/auth/officer-invitation/accept',{invitationToken:invitation.invitationToken});
  check(accepted.status===200&&accepted.data?.requiresSeparateLogin===true,'Actual officer invitation creates its separate native role');native={id:accepted.data.id};
 }
 officer={...primary.credentials,...officer,contextId:native.id,accountKind:'officer',role:'verification_team',name:'Local Inspection Officer'};
 saveLocalFixture(h,'officer.json',officer);
 const signedOfficer=await signInLocalAccount(h,officer,'officer');
 const identity=await signedOfficer.session.request('/api/verification-team/me');
 check(identity.status===200&&identity.data?.fullName==='Local Inspection Officer','Actual separate officer password login projects registered signature fields');
 check((await signedOfficer.session.request('/api/admin/governance')).status===403,'Officer cannot enter administrator governance');
 const status=await founderSession.request('/api/admin/settings/status');
 check(status.status===200&&status.data?.members?.length===5,'All five native administrator memberships are active');
 check(status.data?.members?.every((member:any)=>member.keyEnrolled&&member.settingsKeyEnrolled),'All five administrators enrolled actual separate keys');
 const result={version:1,runId:h.meta.runId,metadataPath:process.argv.at(-1),origin:h.origin,databaseOwned:true,
  administrators,officer,checks,actualGoTrue:true,actualNativeInvitations:true,actualIssuedKeys:true,cloudRecordsModified:0};
 saveLocalFixture(h,'administrator-fixtures.json',result);
 saveLocalFixture(h,'server.json',{version:1,runId:h.meta.runId,metadataPath:process.argv.at(-1),origin:h.origin,databaseOwned:true,
  administratorFixtureFile:'administrator-fixtures.json',staticFrontend:true,authSetupFinishedAt:Date.now()});
 console.log(JSON.stringify({localWorkflowServerReady:true,origin:h.origin,checks,administrators:5,officers:1,
  privateFixturesReady:true,cloudRecordsModified:0}));
 await new Promise<void>(resolve=>{process.once('SIGINT',resolve);process.once('SIGTERM',resolve);});
}
try{await runLocalSupabaseVerification(prepare,{staticFrontend:true});}catch(error){
 console.error(JSON.stringify({localWorkflowServerReady:false,stage,checks,error:'Local fixture preparation stopped; private receipts and native state remain available for reconciliation.'}));
 if(process.argv[2]==='--local-supabase-worker')throw error;process.exitCode=1;
}
