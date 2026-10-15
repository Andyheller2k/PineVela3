/** Real native operational closure in a disposable PostgreSQL restore.
 * Archived Google subjects and provider sessions stay unchanged. No cloud writes. */
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import path from 'node:path';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,startSystemWipePreparation,pauseSystemWipeScope,authorizeSystemWipeExecution} from '../supabase/systemWipeReviews.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {createStorageBackup,readStorageSnapshot} from '../supabase/storageBackup.js';import {SupabaseStorage} from '../supabase/storage.js';
import {verifySystemWipeRecoveryFiles,recordSystemWipeRecovery} from './lib/system-wipe-recovery.js';import {executeOperationalWipeCore} from './lib/operational-wipe-execution.js';
import {saveStoreProfile} from '../supabase/storeSetup.js';import {prepareCheckout,fulfillCheckout} from '../supabase/payments.js';
import {housingDashboardRows} from '../supabase/dashboardReads.js';import {actOnIssue,editIssue} from '../supabase/maintenance.js';
import {managerClosurePreview,submitManagerClosure} from '../supabase/managerClosureRequests.js';
import {submitResidenceChanges} from '../supabase/residenceChanges.js';import {checkManagerKey} from '../supabase/managerKeys.js';
import {createOfficerInvitation,officerInvitationDigest,acceptOfficerInvitation} from '../supabase/officerInvitations.js';
import {dispatchInspection,inspectionRows} from '../supabase/inspections.js';
import {decideSellerApplication} from '../supabase/sellerRegistration.js';
import {initializeRetainedGooglePrimary} from '../supabase/googleSignup.js';
dotenv.config({quiet:true});const[checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],checkpointFiles:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='restore';const progress=(value:string)=>{stage=value;console.log(JSON.stringify({stage:value}));};const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,code:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof code==='number'?e?.status:e?.code)!==code)fs.writeFileSync('.security/migration-reset/operational-officer-wipe-denial.log',JSON.stringify({label,code,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e),where:e?.where},null,2),{mode:0o600});
 check(typeof code==='number'?e instanceof ApiError&&e.status===code:e?.code===code,label);}
try{await withIsolatedBackup(checkpoint,async config=>{const db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)as d`)).rows[0].d;
 const beforeAuth=await authDigest();progress('fixture');const fixture=await db.system(async c=>{
  const people=(await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,s.id as session_id from auth.users u join lateral(select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1)s on true where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email)) order by(lower(u.email)='andyheller2k@gmail.com')desc,u.id limit 6`)).rows;
  check(people.length===6,'Six genuine Google subjects with native sessions');const admins:VerifiedActor[]=[],keys:string[]=[],settings:string[]=[],owners:string[]=[];
  for(const [i,p]of people.entries()){
   await c.query('select private.initialize_auth_profile($1,null)',[p.id]);owners.push((await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id);
   if(i===5)continue;
   const contextId=(await c.query("insert into public.account_contexts(auth_user_id,kind,status) values($1,'admin','active')returning id",[p.id])).rows[0].id;
   const a={authUserId:p.id,sessionId:p.session_id,contextId,kind:'admin'};admins.push(a);await c.query('insert into public.admin_memberships(context_id,slot)values($1,$2)',[contextId,i+1]);
   const key=crypto.randomBytes(32).toString('base64url'),setting=crypto.randomBytes(32).toString('base64url');keys.push(key);settings.push(setting);
   await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)values($1,$2,clock_timestamp(),$3,clock_timestamp())',[contextId,await hashCredentialAsync(`approval:${contextId}:${key}`),await hashCredentialAsync(`settings:${contextId}:${setting}`)]);
   await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
  }
  const p=people[1];await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[p.id,people[0].id]);
  const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'manager','active')returning id",[p.id,people[0].id])).rows[0].id;
  const manager:VerifiedActor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'manager'};
  await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)on conflict(session_id)do nothing',[manager.sessionId,manager.authUserId,contextId]);

  const home=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'approved')returning id",[people[0].id,p.name])).rows[0].id;
  await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[contextId,home]);
  const block=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[home,p.name])).rows[0].id;
  const floor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[block])).rows[0].id;
  const room=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'1')returning id",[floor])).rows[0].id;
  const bed=(await c.query('insert into public.beds(room_id,bed_number)values($1,1)returning id',[room])).rows[0].id;
  await c.query('update public.profiles set primary_owner_id=$2 where id=any($1::uuid[])',[[people[1].id,people[2].id,people[3].id],people[0].id]);
  const seller=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'seller','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'staff','active')returning id",[people[2].id,people[0].id])).rows[0].id;
  const pastResident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','active')returning id",[people[3].id,people[0].id])).rows[0].id;
  // Appointments remain after the manager and participant relationships end.
  // This distinct owner's residence must not be closed by the manager scope,
  // yet saved manager/requester edges must still review the old appointments.
  const formerHome=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'approved')returning id",[people[4].id,people[4].name])).rows[0].id;
  const formerManagerAssignment=(await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)returning id',[contextId,formerHome])).rows[0].id;
  const formerBlock=(await c.query('insert into public.blocks(residence_id,name)values($1,$2)returning id',[formerHome,people[4].name])).rows[0].id;
  const formerFloor=(await c.query('insert into public.floors(block_id,floor_number)values($1,0)returning id',[formerBlock])).rows[0].id;
  const formerRoom=(await c.query("insert into public.rooms(floor_id,room_number)values($1,'1')returning id",[formerFloor])).rows[0].id;
  const formerBed=(await c.query('insert into public.beds(room_id,bed_number)values($1,1)returning id',[formerRoom])).rows[0].id;
  const formerAllocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[pastResident,formerRoom,formerBed])).rows[0].id;
  const formerStaffAssignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id)values($1,$2,$3)returning id',[staff,formerHome,contextId])).rows[0].id;
  const meetingIds:string[]=[];
  for(const kind of ['external','resident','staff']){
   const participant=kind==='resident'?pastResident:kind==='staff'?staff:null;
   const p=kind==='resident'?people[3]:kind==='staff'?people[2]:people[4];
   const label=kind==='resident'?'1':'';
   const saved=(await c.query(`insert into public.meetings(residence_id,manager_context_id,requested_by_context_id,
    participant_context_id,allocation_id,staff_assignment_id,requester_type,contact_name,contact_email,contact_phone,
    room_label,topic,category,mode,starts_at,ends_at)
    values($1,$2,$2,$3,$4,$5,$6,$7,$8,$9,$10,$7,'General Consultation','Phone Call',clock_timestamp()+interval'1 day',clock_timestamp()+interval'1 day 1 hour')returning id`,
    [formerHome,contextId,participant,kind==='resident'?formerAllocation:null,kind==='staff'?formerStaffAssignment:null,kind,p.name,p.email,kind==='external'?'':(await c.query('select coalesce(phone,\'\') as phone from public.profiles where id=$1',[p.id])).rows[0].phone,label])).rows[0].id;
   meetingIds.push(saved);
  }
  await c.query('update public.allocations set ended_at=clock_timestamp()where id=$1',[formerAllocation]);
  await c.query("update public.staff_assignments set status='removed',ended_at=clock_timestamp()where id=$1",[formerStaffAssignment]);
  await c.query('update public.manager_assignments set ended_at=clock_timestamp()where id=$1',[formerManagerAssignment]);
  // A past occupant's open report in the same physical room is retained history;
  // ending the new occupant's portal must not silently close this report.
  const pastAllocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[pastResident,room,bed])).rows[0].id;
  const pastIssue=(await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title)values($1,$2,$3,$4,$5)returning id',[home,room,pastResident,pastAllocation,people[3].name])).rows[0].id;
  await c.query('update public.allocations set ended_at=clock_timestamp()where id=$1',[pastAllocation]);
  await c.query("update public.account_contexts set status='closed'where id=$1",[pastResident]);
  const resident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[resident,room,bed])).rows[0].id;
  const staffAssignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id)values($1,$2,$3)returning id',[staff,home,contextId])).rows[0].id;
  const staffBargain=(await c.query(`insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,
   reason_to_quit,original_role,original_shift,original_block_id)select id,$2,$3,$4,job_role,shift,assigned_block_id from public.staff_assignments where id=$1 returning id`,
   [staffAssignment,contextId,JSON.stringify({type:'custom',title:people[2].name,proposedTerms:people[2].name,notes:''}),people[2].name])).rows[0].id;
  await c.query("update public.staff_bargains set status='declined',decided_at=clock_timestamp(),response_note=$2 where id=$1",[staffBargain,people[5].name]);
  const key=(await c.query('insert into private.room_activation_keys(room_id,code)values($1,$2)returning id',[room,crypto.randomBytes(16).toString('hex')])).rows[0].id;
  const pendingMarketToken=crypto.randomBytes(32).toString('hex');
  const pendingMarketEnrollment=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,expires_at)
   values($1,$2,'seller',$3,$4,$5,'pending_email',clock_timestamp()+interval'24 hours')returning id`,
   [owners[4],people[4].id,people[4].email,pendingMarketToken,JSON.stringify({displayName:people[4].name})])).rows[0].id;
  // Establish the saved verified enrollment through real native relationship
  // guards. These disposable domain rows never go to the configured project.
  const campus='Kwame Nkrumah University of Science and Technology (KNUST)',category='Services',studentId=crypto.randomBytes(8).toString('hex').toUpperCase();
  await c.query("update public.account_contexts set status='pending' where id=$1",[seller]);
  const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,expires_at)values($1,$2,'seller',$3,$4,$5,'completed',clock_timestamp(),$6,$7,clock_timestamp()+interval'24 hours')returning id",[owners[0],people[0].id,people[1].email,crypto.randomBytes(32).toString('hex'),JSON.stringify({university:campus,categoryToSell:category,idNumber:studentId,storeName:people[1].name}),people[1].id,seller])).rows[0].id;
  await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admins[0].sessionId,owners[0]]);
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:admins[0].authUserId,session_id:admins[0].sessionId,role:'authenticated'})]);
  const application=(await c.query('insert into public.seller_applications(seller_context_id,enrollment_id,campus,primary_category,student_id,proposed_store_name)values($1,$2,$3,$4,$5,$6)returning id',[seller,enrollment,campus,category,studentId,people[1].name])).rows[0].id;
  await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admins[0].sessionId,admins[0].contextId]);
  const store=null; // This fixture retains an unfinished seller application without a store.
  await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title)values($1,$2,$3,$4,$5)',[home,room,resident,allocation,people[1].name]);
  await c.query('delete from public.account_contexts where id=any($1::uuid[])',[[owners[1],owners[2],owners[3]]]);
  await c.query("update private.account_enrollments set status='cancelled'where id=$1",[pendingMarketEnrollment]);
  await c.query("insert into private.platform_settings(key,value)values('platform','{\"registrationFee\":0}'::jsonb)on conflict(key)do update set value=private.platform_settings.value||excluded.value");
  const managerKey=crypto.randomBytes(32).toString('hex');
  await c.query('insert into private.manager_operation_keys(manager_context_id,key_hash,issued_at)values($1,$2,clock_timestamp())',[contextId,await hashCredentialAsync(managerKey)]);
  const pendingHome=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'pending')returning id",[people[0].id,people[5].name])).rows[0].id;
  await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[contextId,pendingHome]);
  await c.query("update public.account_contexts set status='pending'where id=$1",[contextId]);
  await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,expires_at)values($1,$2,'manager',$3,$4,$5,'completed',clock_timestamp(),$6,$7,clock_timestamp()+interval'24 hours')",[owners[0],people[0].id,p.email,crypto.randomBytes(32).toString('hex'),JSON.stringify({fullName:p.name}),p.id,contextId]);
  const pendingCase=(await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status,submitted_data)values($1,$2,'manager_registration','inspection_pending',$3)returning id",[contextId,pendingHome,JSON.stringify({name:people[5].name})])).rows[0].id;
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken,managerKey,pendingCase,pendingSellerApplication:application};
 });

 const{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken,managerKey:rawManagerKey,pendingCase,pendingSellerApplication}=fixture;
 const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>)=>db.authorizedSystem(a,[a.kind],work,false,false,true);
 const grants=[];for(let i=0;i<5;i++){const g=await run(admins[i],c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(g);grants.push(g);}
 const row=async(table:string,id:string,key='id')=>(await db.pool.query(`select * from ${table} where ${key}=$1`,[id])).rows[0];
 const digest=async(table:string)=>(await db.pool.query(`select encode(sha256(convert_to(coalesce(string_agg(to_jsonb(t)::text,'|'order by to_jsonb(t)::text),''),'UTF8')),'hex')as d from ${table} t`)).rows[0].d;
 const prepare=async(scope:string)=>{const v=await run(admins[1],c=>systemWipePreview(c,admins[1],[scope]));
  const p=await run(admins[1],c=>proposeSystemWipe(c,admins[1],grants[1],{scopes:[scope],reason:people[0].name,fingerprint:v.fingerprint}));
  for(const i of[2,3,4,0])await run(admins[i],c=>voteSystemWipe(c,admins[i],grants[i],p.id,'approved'));
  await run(admins[0],c=>founderSystemWipeReview(c,admins[0],grants[0],p.id,{decision:'approve-backup',reason:people[0].name,confirmation:'APPROVE WIPE BACKUP'}));
  await run(admins[0],c=>startSystemWipePreparation(c,admins[0],grants[0],p.id,{confirmation:'START WIPE BACKUP'}));
  await run(admins[0],c=>pauseSystemWipeScope(c,admins[0],grants[0],p.id,{confirmation:'PAUSE REVIEWED WIPE'}));return p;
 };
 const archives=async(proposalId:string)=>{const backup=nativeRecoveryCheckpoint(config,projectRef);checkpointFiles.push(...backup.files);
  const{binding,snapshot}=await storageCheckpoint(backup.id);const storage=new SupabaseStorage();
  const saved=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
  storageDirectories.push(path.join(storageArchiveRoot(),saved.id+'.pvstorage'));
  const verified=await verifySystemWipeRecoveryFiles(proposalId,backup.id,saved.id);await db.system(c=>recordSystemWipeRecovery(c,verified,projectRef));return verified;
 };
 const authorized=async(scope:string)=>{const p=await prepare(scope),proof=await archives(p.id);
  await run(admins[0],c=>authorizeSystemWipeExecution(c,admins[0],grants[0],p.id,{confirmation:'AUTHORIZE REVIEWED WIPE'}));return{p,proof};};
 const execute=(proof:any)=>run(admins[0],c=>executeOperationalWipeCore(c,admins[0],grants[0],proof,projectRef));
 progress('native officer invitation and dispatch');
 const recipient={authUserId:people[5].id,sessionId:people[5].session_id,contextId:owners[5],kind:'primary'};
 await db.system(c=>c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[recipient.sessionId,recipient.authUserId,recipient.contextId]));
 const invitation=await run(admins[0],c=>createOfficerInvitation(c,admins[0],grants[0],{fullName:people[5].name,email:people[5].email,phone:'0241234567',assignedZone:'KNUST'}));
 const accepted=await run(recipient,c=>acceptOfficerInvitation(c,recipient,officerInvitationDigest(invitation.invitationToken)));
 check(accepted.success&&!accepted.alreadyAccepted,'Separate genuine Google subject accepts native officer invitation');
 const officer={...recipient,contextId:accepted.id,kind:'officer'};
 // Archived provider sessions predate this invitation. Keep the fresh-sign-in
 // boundary intact instead of changing Auth timestamps or simulating a login.
 await denied(()=>db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[officer.sessionId,officer.contextId])),'42501','Pre-invitation provider session cannot bind a newly accepted officer');
 const inspection=await run(admins[0],c=>dispatchInspection(c,admins[0],pendingCase,officer.contextId,'medium',people[0].name));
 check(Boolean(inspection.id)&&!inspection.alreadyDispatched,'Native pending manager inspection is dispatched to actual invited officer');
 const before=await row('public.verification_inspections',inspection.id),beforeCase=await row('public.verification_cases',pendingCase);
 const acceptedEnrollment=JSON.stringify(await row('private.account_enrollments',invitation.invitationId));
 progress('reviewed total closure with officer');
 const total=await authorized('total'),result=await execute(total.proof);check(result.success,'Total operational closure succeeds with an active invited officer');
 check((await row('public.account_contexts',officer.contextId)).status==='closed','Exact selected officer portal is closed');
 check(!(await db.pool.query('select 1 from private.account_sessions where active_context_id=$1',[officer.contextId])).rowCount,'No application binding remains for the closed officer');
 check(JSON.stringify(await row('private.account_enrollments',invitation.invitationId))===acceptedEnrollment,'Completed keyed officer invitation is retained exactly');
 const after=await row('public.verification_inspections',inspection.id),afterCase=await row('public.verification_cases',pendingCase);
 check(after.status===before.status&&after.report===null&&after.submitted_at===null&&after.reviewed_at===null&&after.withdrawn_by_wipe_id===result.executionId,'Unfinished inspection is withdrawn without an invented report or approval');
 check(afterCase.status===beforeCase.status&&afterCase.reviewed_at===null&&afterCase.withdrawn_by_wipe_id===result.executionId,'Manager case retains its undecided evidence');
 const pendingSeller=await row('public.seller_applications',pendingSellerApplication);
 check(pendingSeller.status==='submitted'&&pendingSeller.reviewed_at===null&&pendingSeller.withdrawn_by_wipe_id===result.executionId,'Unfinished seller application withdraws without a false review decision');
 const sellerRows=await db.actor(admins[0],c=>c.query('select id,withdrawn_by_wipe_id from private.seller_application_details where id=$1',[pendingSellerApplication]));
 check(sellerRows.rows[0]?.withdrawn_by_wipe_id===result.executionId,'Private seller projection preserves withdrawal marker behind its original boundary');
 await denied(()=>run(admins[0],c=>decideSellerApplication(c,admins[0],{id:pendingSellerApplication},true)),409,'Archived seller application cannot be approved by API');
 const rows=await run(admins[0],c=>inspectionRows(c,admins[0]));check(rows.some(r=>r.id===inspection.id&&r.status==='withdrawn'),'Administrator inspection list displays withdrawn status');
 await denied(()=>db.actor(officer,c=>c.query('select 1')),401,'Closed officer cannot use its former native session binding');
 await denied(()=>db.system(c=>c.query('update public.verification_inspections set report=$2 where id=$1',[inspection.id,JSON.stringify({officerId:officer.contextId})])),'42501','Withdrawn inspection cannot receive a fabricated report');
 await denied(()=>db.system(c=>c.query('update public.verification_inspections set withdrawn_by_wipe_id=null where id=$1',[inspection.id])),'42501','Inspection withdrawal cannot be cleared');
 await denied(()=>run(admins[0],c=>dispatchInspection(c,admins[0],pendingCase,officer.contextId,'medium',people[0].name)),409,'Archived manager dossier cannot be redispatched');
 for(const a of admins)check((await db.actor(a,c=>c.query('select private.current_context_id()as id'))).rows[0].id===a.contextId,'All five administrator bindings survive officer closure');
 check(await authDigest()===beforeAuth,'All archived provider subjects and native sessions stay exact');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,nativeOfficerInvitation:true,nativeInspectionDispatch:true,authRecordsChanged:false,cloudRecordsModified:0,cloudObjectsModified:0,providerRepliesMocked:false,liveExecutionEnabled:false};
 fs.writeFileSync('.security/migration-reset/operational-officer-wipe-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/operational-officer-wipe-failure.log',String(e.stack||e)+'\n'+String(e.where||''),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native officer verification failed; private diagnostics saved.'}));process.exitCode=1;}
finally{for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
