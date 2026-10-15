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
import {requestSystemWipeExecution,systemWipeExecutionRequestsEnabled} from '../supabase/systemWipeExecutionRequests.js';
import {processSystemWipeExecutionRequest} from './lib/system-wipe-execution-worker.js';
import {runSystemWipeWorkerBatch} from './lib/system-wipe-worker-batch.js';
import {systemWipeReviewStatus,cancelSystemWipePreparation} from '../supabase/systemWipeReviews.js';
import {setAdministratorActive} from '../supabase/adminGovernance.js';
import {initializeRetainedGooglePrimary} from '../supabase/googleSignup.js';
dotenv.config({quiet:true});const[checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],checkpointFiles:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='restore';const progress=(value:string)=>{stage=value;console.log(JSON.stringify({stage:value}));};const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,code:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof code==='number'?e?.status:e?.code)!==code)fs.writeFileSync('.security/migration-reset/system-wipe-handoff-denial.log',JSON.stringify({label,code,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e),where:e?.where},null,2),{mode:0o600});
 check(code==='error'?e instanceof Error:typeof code==='number'?e instanceof ApiError&&e.status===code:e?.code===code,label);}
const savedReleaseGate=process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS;
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
  const p=people[5];await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[p.id,people[0].id]);
  const contextId=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'manager','active')returning id",[p.id,people[0].id])).rows[0].id;
  const manager:VerifiedActor={authUserId:p.id,sessionId:p.session_id,contextId,kind:'manager'};
  await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id)values($1,$2,$3)',[manager.sessionId,manager.authUserId,contextId]);

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
  await c.query("update public.seller_applications set status='approved',reviewed_at=clock_timestamp(),reviewed_by_context_id=$2 where id=$1",[application,admins[0].contextId]);
  await c.query("update public.account_contexts set status='active' where id=$1",[seller]);
  const store=(await c.query("insert into public.stores(seller_context_id,primary_owner_id,name,campus,status)values($1,$2,$3,$4,'pending')returning id",[seller,people[0].id,people[1].name,campus])).rows[0].id;
  await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title)values($1,$2,$3,$4,$5)',[home,room,resident,allocation,people[1].name]);
  await c.query('delete from public.account_contexts where id=any($1::uuid[])',[[owners[1],owners[2],owners[3],owners[5]]]);
  await c.query("update private.account_enrollments set status='cancelled'where id=$1",[pendingMarketEnrollment]);
  await c.query("insert into private.platform_settings(key,value)values('platform','{\"registrationFee\":0}'::jsonb)on conflict(key)do update set value=private.platform_settings.value||excluded.value");
  const managerKey=crypto.randomBytes(32).toString('hex');
  await c.query('insert into private.manager_operation_keys(manager_context_id,key_hash,issued_at)values($1,$2,clock_timestamp())',[contextId,await hashCredentialAsync(managerKey)]);
  const pendingHome=(await c.query("insert into public.residences(primary_owner_id,name,status)values($1,$2,'pending')returning id",[people[0].id,people[5].name])).rows[0].id;
  await c.query('insert into public.manager_assignments(manager_context_id,residence_id)values($1,$2)',[contextId,pendingHome]);
  const pendingCase=(await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,submitted_data)values($1,$2,'residence_registration',$3)returning id",[contextId,pendingHome,JSON.stringify({name:people[5].name})])).rows[0].id;
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken,managerKey,pendingCase};
 });

 const{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken,managerKey:rawManagerKey,pendingCase}=fixture;
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
 const confirmation='CLOSE REVIEWED OPERATIONAL PORTALS';
 const queue=(proposal:string,a=admins[0],g=grants[0],body:any={confirmation})=>run(a,c=>requestSystemWipeExecution(c,a,g,proposal,body));
 const allBindings=async()=>(await db.pool.query('select count(*)from private.system_wipe_execution_requests')).rows[0].count;
 progress('native queue boundary');
 for(const role of['anon','authenticated','pinevela_backend']){
  check(!(await db.pool.query("select has_table_privilege($1,'private.system_wipe_execution_requests','insert')as allowed",[role])).rows[0].allowed,role+' cannot queue directly');
  check(!(await db.pool.query("select has_table_privilege($1,'private.system_wipe_execution_requests','select')as allowed",[role])).rows[0].allowed,role+' cannot read private request identities');
  check(!(await db.pool.query("select has_function_privilege($1,'private.system_wipe_execution_request_current(private.system_wipe_execution_requests)','execute')as allowed",[role])).rows[0].allowed,role+' cannot invoke private consent lookup');
 }
 check((await db.pool.query("select relrowsecurity from pg_class where oid='private.system_wipe_execution_requests'::regclass")).rows[0].relrowsecurity,'Private request table has RLS');
 for(const signature of['private.system_wipe_execution_request_guard()','private.system_wipe_request_commit_guard()','private.system_wipe_execution_handoff_commit_guard()']){
  const fn=(await db.pool.query('select prosecdef,proconfig from pg_proc where oid=$1::regprocedure',[signature])).rows[0];
  check(!fn.prosecdef&&fn.proconfig.includes('search_path=""'),'Native queue guard is invoker-only with empty search path');
 }
 for(const value of[undefined,'','false','TRUE','1']){
  if(value===undefined)delete process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS;else process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS=value;
  check(!systemWipeExecutionRequestsEnabled(),'Only the exact server-only true setting releases execution');
 }
 delete process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS;
 await denied(()=>queue(crypto.randomUUID()),503,'Disabled gate rejects valid founder without queuing');
 await denied(()=>runSystemWipeWorkerBatch(db,{execute:true,projectRef}),503,'Disabled worker cannot mutate pending requests');
 await denied(()=>processSystemWipeExecutionRequest(db,crypto.randomUUID(),projectRef),503,'Direct worker entry also checks release gate');
 check(await allBindings()==='0','Disabled gates leave no requests');
 process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS='true';
 progress('real reviewed resident handoff');
 const first=await prepare('residents');
 await denied(()=>queue(first.id),409,'Approved paused scope without recovery and final consent cannot queue');
 const proof=await archives(first.id);
 await denied(()=>queue(first.id),409,'Restored proof without final consent cannot queue');
 await run(admins[0],c=>authorizeSystemWipeExecution(c,admins[0],grants[0],first.id,{confirmation:'AUTHORIZE REVIEWED WIPE'}));
 await denied(()=>queue(first.id,admins[1],grants[1]),403,'Other administrator cannot request founder execution');
 await denied(()=>queue(first.id,admins[0],{allowed:false}),403,'Own current founder key is mandatory');
 await denied(()=>queue(first.id,admins[0],grants[0],{confirmation:'DELETE ALL'}),400,'Explicit exact closure confirmation is required');
 for(const field of['founderId','authUserId','sessionId','checkpointId','storageArchiveId','verified','effects','execute'])
  await denied(()=>queue(first.id,admins[0],grants[0],{confirmation,[field]:people[0].id}),400,'Client authority, paths and effect selectors are rejected');
 const noticeCount=async()=>(await db.pool.query("select count(*)from public.notifications where title='Reviewed system wipe queued'")).rows[0].count;
 await db.system(c=>c.query("create function private.reject_wipe_request_audit()returns trigger language plpgsql as $$begin if new.event_type='system_wipe_execution_requested'then raise exception using errcode='23514',message='Native request audit failure';end if;return new;end;$$;create trigger reject_wipe_request_audit before insert on private.audit_events for each row execute function private.reject_wipe_request_audit()"));
 await denied(()=>queue(first.id),'23514','Audit failure rolls back queue and notification together');
 await db.system(c=>c.query('drop trigger reject_wipe_request_audit on private.audit_events;drop function private.reject_wipe_request_audit()'));
 check(await allBindings()==='0'&&await noticeCount()==='0','Rejected request leaves neither queue nor notice');
 const delivered=await Promise.all([queue(first.id),queue(first.id)]),queued=delivered[0];
 check(delivered.every(r=>r.status==='queued')&&delivered.filter(r=>r.noChange===false).length===1,'Concurrent duplicate requests queue exactly once');
 check(delivered.every(r=>'request'in r&&r.request?.id===('request'in queued?queued.request?.id:null)),'Duplicate delivery returns the same native request');
 if(!('request'in queued)||!queued.request)throw Error('Native request missing');const id=queued.request.id;
 const native=await row('private.system_wipe_execution_requests',id);
 check(native.auth_user_id===admins[0].authUserId&&native.session_id===admins[0].sessionId&&native.founder_context_id===admins[0].contextId,'Native request is bound to real founder subject and session');
 check(+native.expires_at===+(await row('private.system_wipe_execution_authorizations',native.authorization_id)).expires_at,'Queue does not extend final consent deadline');
 check(await noticeCount()==='1','Only one queued notice is emitted');
 check((await db.pool.query("select count(*)from private.audit_events where event_type='system_wipe_execution_requested'")).rows[0].count==='1','Only one request audit is emitted');
 const beforePreview=await digest('private.system_wipe_execution_requests');
 const preview=await runSystemWipeWorkerBatch(db,{execute:false,projectRef});
 check(preview.readOnly&&preview.execution.pending===1&&preview.execution.completed===0&&await digest('private.system_wipe_execution_requests')===beforePreview,'Default worker previews without changing requests');
 const aborted=new AbortController();aborted.abort();
 check((await runSystemWipeWorkerBatch(db,{execute:true,projectRef,signal:aborted.signal})).stopping,'Stopped worker does not begin a queued job');
 const visible=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0]));
 const shown=visible.find(r=>r.id===first.id)?.preparation.executionRequest;
 check(shown?.state==='requested'&&shown.current,'Governance reports the actual queued state');
 const encoded=JSON.stringify(visible);
 check(!encoded.includes(admins[0].sessionId)&&!encoded.includes(proof.evidence.checkpoint_id)&&!encoded.includes(proof.evidence.storage_archive_id)&&keys.every(k=>!encoded.includes(k)),'Governance exposes no sessions, keys or backup identifiers');
 await denied(()=>db.system(c=>c.query("update private.system_wipe_execution_requests set expires_at=expires_at+interval'1 hour'where id=$1",[id])),'42501','Native deadline extension is rejected');
 await denied(()=>db.system(c=>c.query("update private.system_wipe_execution_requests set auth_user_id=$2 where id=$1",[id,people[1].id])),'42501','Native founder identity cannot be substituted');
 await denied(()=>db.system(c=>c.query("update private.system_wipe_execution_requests set state='completed',execution_id=$2 where id=$1",[id,crypto.randomUUID()])),'42501','Completion cannot be forged');
 await denied(()=>db.system(c=>c.query("update private.system_wipe_execution_requests set state='invalidated'where id=$1",[id])),'42501','Current valid request cannot be invalidated');
 await denied(()=>db.system(c=>c.query('delete from private.system_wipe_execution_requests where id=$1',[id])),'42501','Request history cannot be deleted');
 await denied(()=>db.system(c=>c.query('truncate private.system_wipe_execution_requests')),'42501','Request history cannot be truncated');
 await denied(()=>execute(proof),'42501','Native execution cannot commit while its queued handoff remains incomplete');
 check((await row('public.account_contexts',resident)).status==='active'&&(await row('private.system_wipe_execution_requests',id)).state==='requested','Rejected incomplete handoff rolls operational effects back');
 progress('worker failure and duplicate delivery');
 const held=await db.pool.connect();try{
  await held.query("select pg_advisory_lock(hashtextextended('system-wipe-execution-request:'||$1::text,0))",[id]);
  check('skipped'in await processSystemWipeExecutionRequest(db,id,projectRef),'Another worker holding the native claim prevents duplicate work');
 }finally{await held.query("select pg_advisory_unlock(hashtextextended('system-wipe-execution-request:'||$1::text,0))",[id]);held.release();}
 await db.system(c=>c.query("create function private.reject_wipe_request_completion()returns trigger language plpgsql as $$begin if new.state='completed'then raise exception using errcode='23514',message='Native request completion failure';end if;return new;end;$$;create trigger reject_wipe_request_completion before update on private.system_wipe_execution_requests for each row execute function private.reject_wipe_request_completion()"));
 await denied(()=>processSystemWipeExecutionRequest(db,id,projectRef),'23514','Handoff completion failure rolls back the real worker closure');
 await db.system(c=>c.query('drop trigger reject_wipe_request_completion on private.system_wipe_execution_requests;drop function private.reject_wipe_request_completion()'));
 check((await row('public.account_contexts',resident)).status==='active'&&(await row('public.allocations',allocation)).ended_at===null,'Worker failure preserves active portal and room');
 check((await row('private.system_wipe_execution_requests',id)).state==='requested'&&(await db.pool.query('select count(*)from private.primary_wipe_executions')).rows[0].count==='0','Worker failure leaves no partial receipt');
 const outcomes=await Promise.all([processSystemWipeExecutionRequest(db,id,projectRef),processSystemWipeExecutionRequest(db,id,projectRef)]);
 check(outcomes.filter(r=>'executionId'in r&&r.noChange!==true).length===1,'Concurrent real workers execute once');
 check((await row('private.system_wipe_execution_requests',id)).state==='completed','Worker completes durable request');
 check((await row('public.account_contexts',resident)).status==='closed'&&(await row('public.account_contexts',seller)).status==='active','Worker closes resident while preserving its shared-identity seller');
 const replay=await processSystemWipeExecutionRequest(db,id,projectRef);check('noChange'in replay&&replay.noChange,'Restart/retry reads the completed receipt without executing');
 const repeated=await queue(first.id);check(repeated.status==='executed'&&repeated.noChange,'Public handoff retry reconciles completed outcome');
 check((await db.pool.query('select count(*)from private.primary_wipe_executions')).rows[0].count==='1','Reconciliation creates no second closure');
 progress('recovery damage and actual batch execution');
 const market=await authorized('markets');const mq=await queue(market.p.id);if(!('request'in mq)||!mq.request)throw Error('Native market request missing');
 const manifest=path.join(storageArchiveRoot(),market.proof.evidence.storage_archive_id+'.pvstorage','manifest.pvsb'),original=fs.readFileSync(manifest);
 try{const damaged=Buffer.from(original);damaged[damaged.length-1]^=1;fs.writeFileSync(manifest,damaged);
  await denied(()=>processSystemWipeExecutionRequest(db,mq.request!.id,projectRef),'error','Worker authenticates actual encrypted Storage archive before closing');
 }finally{fs.writeFileSync(manifest,original);}
 check((await row('private.system_wipe_execution_requests',mq.request.id)).state==='requested'&&(await row('public.account_contexts',seller)).status==='active','Bad recovery leaves queue and store access unchanged');
 const batch=await runSystemWipeWorkerBatch(db,{execute:true,projectRef});
 check(batch.execution.completed===1&&batch.execution.failed===0&&batch.storageObjectsModified===0,'Bounded worker batch completes the reviewed market request');
 check((await row('public.stores',store)).status==='closed'&&(await row('public.account_contexts',seller)).status==='closed','Worker uses actual operational store closure core');
 progress('stale consent invalidation');
 const managerReview=await authorized('managers'),stale=await queue(managerReview.p.id);if(!('request'in stale)||!stale.request)throw Error('Native stale request missing');
 await run(admins[0],c=>setAdministratorActive(c,admins[0],grants[0],admins[4].contextId,false));
 check(!(await db.pool.query('select private.system_wipe_execution_request_current(q)as current from private.system_wipe_execution_requests q where id=$1',[stale.request.id])).rows[0].current,'Real keyed roster change invalidates the queued consent');
 const invalidated=await processSystemWipeExecutionRequest(db,stale.request.id,projectRef);
 check(invalidated.status==='invalidated','Worker terminally invalidates unusable consent');
 const stopped=await row('private.system_wipe_execution_requests',stale.request.id);
 check(stopped.failure_code==='consent_changed'&&Boolean(stopped.finished_at)&&!stopped.execution_id,'Native invalidation records precise terminal outcome');
 check((await row('public.account_contexts',manager.contextId)).status==='active'&&(await row('public.residences',home)).status==='approved','Invalidated request does not close manager or residence');
 check((await row('private.system_wipe_freezes',managerReview.proof.preparation.id,'preparation_id')).state==='frozen','Invalidation does not silently release reviewed pause');
 const terminal=await processSystemWipeExecutionRequest(db,stale.request.id,projectRef);check('skipped'in terminal,'Invalidated work never revives on replay');
 await denied(()=>queue(managerReview.p.id),409,'Invalidated old founder consent cannot queue again');
 await run(admins[0],c=>cancelSystemWipePreparation(c,admins[0],grants[0],managerReview.p.id,{reason:people[0].name}));
 check((await row('private.system_wipe_freezes',managerReview.proof.preparation.id,'preparation_id')).state==='cancelled','Explicit founder cancellation releases the pause');
 check((await db.pool.query('select count(*)from private.primary_wipe_executions')).rows[0].count==='2','Only the two genuinely reviewed successful requests executed');
 check(await authDigest()===beforeAuth,'All genuine Google users, identities and native Auth sessions stay byte-for-byte unchanged');
 const reconnected=new SupabaseDatabase(config);try{check((await reconnected.pool.query("select count(*)from private.system_wipe_execution_requests where state='completed'")).rows[0].count==='2','Request outcomes survive process reconnect');}finally{await reconnected.close();}
 const latestMigration=(await db.pool.query('select version,digest from private.schema_migrations order by version desc limit 1')).rows[0];
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,actualNativeDumpsAndRestores:true,actualEncryptedStorageVerification:true,cloudRecordsModified:0,cloudObjectsModified:0,authRecordsChanged:false,providerRepliesMocked:false,liveExecutionEnabled:false,latestMigration};
 fs.writeFileSync('.security/migration-reset/system-wipe-handoff-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/system-wipe-handoff-failure.log',String(e.stack||e)+'\n'+String(e.where||''),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native handoff verification failed; private diagnostics saved.'}));process.exitCode=1;}
finally{if(savedReleaseGate===undefined)delete process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS;else process.env.PINEVELA_SYSTEM_WIPE_EXECUTION_REQUESTS=savedReleaseGate;for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
