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
import {initializeRetainedGooglePrimary} from '../supabase/googleSignup.js';
dotenv.config({quiet:true});const[checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0],checkpointFiles:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='restore';const progress=(value:string)=>{stage=value;console.log(JSON.stringify({stage:value}));};const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,code:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof code==='number'?e?.status:e?.code)!==code)fs.writeFileSync('.security/migration-reset/operational-wipe-denial.log',JSON.stringify({label,code,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e),where:e?.where},null,2),{mode:0o600});
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
 progress('own manager requests');
 const managerGrant=await run(manager,c=>checkManagerKey(c,manager,rawManagerKey));check(managerGrant.allowed,'Real local manager key verifies');
 const keyedManager={...manager,managerKeyVersion:managerGrant.version};
 const closureRequest=await run(keyedManager,async c=>{const v=await managerClosurePreview(c,manager.contextId);return submitManagerClosure(c,keyedManager,{confirm:true,reason:people[5].name,requestWaiver:false,fingerprint:v.fingerprint});});
 const changeRequest=await run(keyedManager,c=>submitResidenceChanges(c,keyedManager,{hostelId:home,changes:{managerName:people[0].name}}));
 const pendingCaseBefore=await row('public.verification_cases',pendingCase);
 const staffReview=(await db.system(async c=>c.query('insert into public.staff_reviews(staff_assignment_id,resident_context_id,allocation_id,rating,comment)values($1,$2,$3,5,$4)returning id',[ (await db.pool.query('select id from public.staff_assignments where staff_context_id=$1 and ended_at is null',[staff])).rows[0].id,resident,allocation,people[1].name]))).rows[0].id;
 const reviewDigest=await digest('public.staff_reviews');
 progress('private execution boundary');
 for(const role of['anon','authenticated','pinevela_backend']){
  check(!(await db.pool.query("select has_function_privilege($1,'private.run_operational_wipe(uuid)','execute')as allowed",[role])).rows[0].allowed,role+' cannot invoke operational closure');
  check(!(await db.pool.query("select has_table_privilege($1,'private.primary_wipe_executions','insert')as allowed",[role])).rows[0].allowed,role+' cannot create an execution receipt');
 }
 check((await db.pool.query("select relrowsecurity from pg_class where oid='private.primary_wipe_executions'::regclass")).rows[0].relrowsecurity,'Private execution ledger retains RLS');
 await denied(()=>db.system(c=>c.query('select private.run_operational_wipe($1)',[crypto.randomUUID()])),'42501','Unknown consent cannot admit execution');
 const currentIssue=(await db.pool.query('select id from public.maintenance_issues where reporter_context_id=$1',[resident])).rows[0].id;
 const pastReport=JSON.stringify(await row('public.maintenance_issues',pastIssue));
 const profiles=await digest('public.profiles'),adminSecrets=await digest('private.admin_secrets'),storageHistory=await digest('storage.objects');
 progress('resident-only closure');
 const first=await prepare('residents'),firstProof=await archives(first.id);
 await denied(()=>execute(firstProof),409,'Recovery without final founder consent cannot close operational portals');
 await run(admins[0],c=>authorizeSystemWipeExecution(c,admins[0],grants[0],first.id,{confirmation:'AUTHORIZE REVIEWED WIPE'}));
 await denied(()=>run(admins[1],c=>executeOperationalWipeCore(c,admins[1],grants[1],firstProof,projectRef)),403,'Non-founder cannot execute');
 await denied(()=>run(admins[0],c=>executeOperationalWipeCore(c,admins[0],{allowed:false},firstProof,projectRef)),403,'Founder must supply own current approval key');
 await denied(()=>run(admins[0],c=>executeOperationalWipeCore(c,admins[0],grants[0],JSON.parse(JSON.stringify(firstProof)),projectRef)),409,'Copied recovery JSON cannot replace actual restored proof');
 const consent=(await db.pool.query('select id from private.system_wipe_execution_authorizations where preparation_id=$1',[firstProof.preparation.id])).rows[0].id;
 await denied(()=>db.system(c=>c.query('select private.run_operational_wipe($1)',[consent])),'42501','Direct native call without founder grant rejected');
 const setup=async(c:any)=>{await recordSystemWipeRecovery(c,firstProof,projectRef);await c.query("select set_config('pinevela.approval_key_version',$1,true)",[grants[0].version]);
  const proof=(await c.query("select to_jsonb(r)-'verified_at'as proof from private.system_wipe_recovery_evidence r where preparation_id=$1",[firstProof.preparation.id])).rows[0].proof;
  await c.query("select set_config('pinevela.operational_wipe_confirmation','CLOSE REVIEWED OPERATIONAL PORTALS',true),set_config('pinevela.primary_wipe_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(proof)]);
  return(await c.query("insert into private.primary_wipe_executions(authorization_id,execution_kind)values($1,'operational')returning id",[consent])).rows[0].id;};
 await denied(()=>run(admins[0],async c=>{await setup(c);}),'42501','Incomplete running admission cannot commit');
 await denied(()=>run(admins[0],async c=>{await setup(c);await c.query('update public.profiles set display_name=display_name||$2 where id=$1',[people[1].id,' ']);}),'42501','Running receipt cannot authorize profile edits');
 await denied(()=>run(admins[0],async c=>{const id=await setup(c);await c.query("update private.primary_wipe_executions set effect_plan='[]'::jsonb where id=$1",[id]);}),'42501','Caller cannot edit native effect plan');
 await denied(()=>run(admins[0],async c=>{await setup(c);await c.query("update public.account_contexts set status='closed'where id=$1",[seller]);}),'42501','Resident admission cannot close same-identity seller sibling');
 check((await db.pool.query('select count(*)from private.primary_wipe_executions')).rows[0].count==='0','Rejected admissions leave no receipt');
 progress('atomic rollback');
 await db.system(c=>c.query("create function private.reject_operational_notice()returns trigger language plpgsql as $$begin if new.title='Operational portals closed after reviewed system wipe'then raise exception using errcode='23514',message='Native notice failure';end if;return new;end;$$;create trigger reject_operational_notice before insert on public.notifications for each row execute function private.reject_operational_notice()"));
 await denied(()=>execute(firstProof),'23514','Notice failure rolls back all operational effects');
 await db.system(c=>c.query('drop trigger reject_operational_notice on public.notifications;drop function private.reject_operational_notice()'));
 check((await row('public.account_contexts',resident)).status==='active','Rejected execution leaves resident active');
 check((await row('public.allocations',allocation)).ended_at===null,'Rejected execution retains allocation');
 check(!(await row('public.maintenance_issues',currentIssue)).withdrawn_by_wipe_id,'Rejected execution leaves report untouched');
 const residentResult=await execute(firstProof);check(residentResult.success&&residentResult.storageObjectsModified===0,'Reviewed resident execution completes');
 check((await row('public.account_contexts',resident)).status==='closed','Exact resident closes');
 check(Boolean((await row('public.allocations',allocation)).ended_at),'Resident allocation ends');
 check((await row('private.room_activation_keys',key)).revoked_at===null,'Unclaimed key in same room is not revoked by resident scope');
 check((await row('public.account_contexts',seller)).status==='active','Shared mailbox seller sibling remains active');
 check((await row('public.account_contexts',staff)).status==='active','Independent staff portal remains active');
 check((await row('public.account_contexts',manager.contextId)).status==='active','Manager remains active');
 check((await row('public.residences',home)).status==='approved','Resident scope does not close residence');
 check(JSON.stringify(await row('public.maintenance_issues',pastIssue))===pastReport,'Past occupant report in same room remains exact history');
 const withdrawn=await row('public.maintenance_issues',currentIssue);
 check(withdrawn.withdrawn_by_wipe_id===residentResult.executionId&&withdrawn.status==='reported'&&withdrawn.completed_at===null&&withdrawn.confirmed_at===null,'Withdrawal preserves true unresolved repair evidence');
 const issues=await db.actor(admins[0],c=>housingDashboardRows(c,'issues'));
 check(issues.some(r=>r.id===currentIssue&&r.status==='Withdrawn'&&r.workflowState==='withdrawn'&&!r.studentConfirmed&&!r.staffCompleted),'Housing projection exposes honest withdrawn state');
 await denied(()=>run(admins[0],c=>editIssue(c,admins[0],currentIssue,{title:people[0].name})),409,'Archived report rejects API edits');
 await denied(()=>run(admins[0],c=>actOnIssue(c,admins[0],currentIssue,'manager-close',{})),409,'Archived report rejects API actions');
 await denied(()=>db.system(c=>c.query('update public.maintenance_issues set title=$2 where id=$1',[currentIssue,people[0].name])),'42501','Withdrawn report cannot be rewritten directly');
 await denied(()=>db.system(c=>c.query('update public.maintenance_issues set withdrawn_by_wipe_id=null where id=$1',[currentIssue])),'42501','Withdrawal marker cannot be cleared');
 await denied(()=>db.system(c=>c.query("insert into public.maintenance_events(issue_id,actor_context_id,event_type,notes)values($1,$2,'maintenance_reported',$3)",[currentIssue,admins[0].contextId,people[0].name])),'42501','Withdrawn report cannot accept new evidence');
 await denied(()=>execute(firstProof),409,'Completed scope cannot be replayed with old consent');
 progress('real zero-fee paid history');
 const sellerActor={authUserId:people[1].id,sessionId:people[1].session_id,contextId:seller,kind:'seller'};
 const sellerRun=<T>(work:(c:any)=>Promise<T>)=>db.system(async c=>{await c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[sellerActor.sessionId,seller]);
  await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:sellerActor.authUserId,session_id:sellerActor.sessionId,role:'authenticated'})]);return work(c);});
 await sellerRun(c=>saveStoreProfile(c,sellerActor,{storeName:people[1].name,username:'wipe-'+seller,location:'KNUST Campus',category:'Services',deliveryMode:'Campus Delivery',phone:'0241234567',phoneCountry:'GH',description:''},true));
 const checkout=await sellerRun(c=>prepareCheckout(c,sellerActor,{requestId:crypto.randomUUID(),purpose:'activation',plan:'default'}));
 check(checkout.record.mode==='free','Native zero-fee policy needs no simulated payment provider');await sellerRun(c=>fulfillCheckout(c,checkout.record.id));
 await db.system(c=>c.query('update private.account_sessions set active_context_id=$2 where session_id=$1',[admins[1].sessionId,admins[1].contextId]));
 check((await row('public.stores',store)).status==='active','Native activation creates actual store access');
 const paymentDigest=await digest('public.payments'),quoteDigest=await digest('private.payment_checkouts'),feeDigest=await digest('public.store_fee_periods');
 const paid=(await db.pool.query('select * from public.store_subscriptions where store_id=$1',[store])).rows[0];check(!!paid,'Native paid period exists');
 progress('seller closure');const market=await authorized('markets'),marketResult=await execute(market.proof);
 check(marketResult.success&&(await row('public.stores',store)).status==='closed','Reviewed market closes its store');
 check((await row('public.account_contexts',seller)).status==='closed','Seller portal closes');
 const closedPaid=await row('public.store_subscriptions',paid.id);
 check(closedPaid.status==='cancelled'&&closedPaid.payment_id===paid.payment_id&&+closedPaid.starts_at===+paid.starts_at&&+closedPaid.ends_at===+paid.ends_at,'Subscription cancellation preserves verified paid interval');
 check(await digest('public.payments')===paymentDigest&&await digest('private.payment_checkouts')===quoteDigest&&await digest('public.store_fee_periods')===feeDigest,'Payment receipts, quotes and fee history remain exact');
 progress('manager and staff closure');const managers=await authorized('managers'),managerResult=await execute(managers.proof);
 check(managerResult.success&&(await row('public.account_contexts',manager.contextId)).status==='closed','Reviewed manager portal closes');
 check((await row('public.account_contexts',staff)).status==='closed','Assigned staff portal closes');
 const closure=(await db.pool.query('select * from private.manager_closure_requests where manager_context_id=$1',[manager.contextId])).rows[0];
 check(closure.state==='resolved'&&closure.withdrawn_by_wipe_id===managerResult.executionId,'Own manager closure request resolves through exact retained wipe receipt');
 check((await row('public.residence_change_requests',changeRequest.id)).status==='invalidated','Unfinished residence change is invalidated');
 const pendingCaseAfter=await row('public.verification_cases',pendingCase);
 check(pendingCaseAfter.status===pendingCaseBefore.status&&pendingCaseAfter.reviewed_at===null&&pendingCaseAfter.withdrawn_by_wipe_id===managerResult.executionId,'Pending verification withdraws without invented approval or rejection');
 check(await digest('public.staff_reviews')===reviewDigest&&Boolean(await row('public.staff_reviews',staffReview)),'Actual activated-resident staff review remains exact');

 check((await row('public.residences',home)).status==='closed','Managed residence closes');
 check((await row('public.residences',formerHome)).status==='approved','Former distinct-owner residence remains open');
 check((await row('private.room_activation_keys',key)).revoked_at!==null,'Residence closure revokes remaining room key');
 const managerKey=await row('private.manager_operation_keys',manager.contextId,'manager_context_id');check(managerKey.key_hash===null&&managerKey.version==='2','Manager operation key is invalidated once');
 for(const id of meetingIds)check((await row('public.meetings',id)).status==='cancelled','Saved historical appointment cancels without losing contact evidence');
 check((await row('public.staff_bargains',staffBargain)).status==='cancelled','Declined unresolved retention process is cancelled');
 check((await row('public.maintenance_issues',pastIssue)).status==='reported'&&Boolean((await row('public.maintenance_issues',pastIssue)).withdrawn_by_wipe_id),'Residence closure withdraws remaining reports without pretending repair');
 progress('remaining mixed primary and property closure');const total=await authorized('total'),totalResult=await execute(total.proof);
 check(totalResult.success&&(await row('public.residences',formerHome)).status==='closed','Total closure includes remaining independently owned residence');
 for(const id of[owners[0],owners[4]])check((await row('public.account_contexts',id)).status==='closed','Canonical primary closes with retained history');
 for(const a of admins)check((await db.actor(a,c=>c.query('select private.current_context_id()as id'))).rows[0].id===a.contextId,'Independent administrator session remains usable');
 check((await db.pool.query("select count(*)from private.primary_wipe_executions where state='completed'and execution_kind='operational'")).rows[0].count==='4','Four distinct reviewed scope executions commit once');
 check((await db.pool.query("select count(*)from public.admin_proposals where kind='system_wipe'and status='executed'")).rows[0].count==='4','Every receipt completes its reviewed proposal');
 check((await db.pool.query("select count(*)from private.system_wipe_freezes where state='frozen'")).rows[0].count==='0','Completed scopes leave no active pause');
 const entries=(await db.pool.query('select * from private.primary_wipe_executions order by started_at')).rows;
 for(const e of entries){
  check(e.operational_context_ids.every((id:string)=>!admins.some(a=>a.contextId===id)),'Native plan excludes all administrator contexts');
  check(e.context_ids.every((id:string)=>[owners[0],owners[4]].includes(id)),'Primary re-entry receipts contain only canonical primary contexts');
  const recipients=(await db.pool.query('select context_id from public.notification_recipients where notification_id=$1',[e.notification_id])).rows.map(r=>r.context_id);
  check(e.recipient_context_ids.every((id:string)=>recipients.includes(id))&&admins.every(a=>recipients.includes(a.contextId)),'All derived recipients and administrators receive retained outcome');
 }
 check(await digest('public.profiles')===profiles&&await digest('private.admin_secrets')===adminSecrets,'Profile and administrator key history remain exact');
 check(await digest('storage.objects')===storageHistory,'Storage catalog is unchanged');
 check(await authDigest()===beforeAuth,'Google subjects, identities and native provider sessions are byte-for-byte unchanged');
 check(await db.system(c=>initializeRetainedGooglePrimary(c,{authUserId:people[0].id,sessionId:people[0].session_id})),'Canonical primary can re-enter through retained Google lifecycle');
 check((await row('public.residences',home)).status==='closed'&&(await row('public.stores',store)).status==='closed','Primary re-entry never reopens closed property or store');
 const reopened=new SupabaseDatabase(config);try{check((await reopened.pool.query("select count(*)from private.primary_wipe_executions where state='completed'")).rows[0].count==='4','Receipts survive process reconnect');}finally{await reopened.close();}
 check(await authDigest()===beforeAuth,'Re-entry also leaves real Auth bytes unchanged');
 const latestMigration=(await db.pool.query('select version,digest from private.schema_migrations order by version desc limit 1')).rows[0];
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,actualNativeDumpsAndRestores:true,cloudRecordsModified:0,cloudObjectsModified:0,authRecordsChanged:false,providerRepliesMocked:false,liveExecutionEnabled:false,scopesExecuted:['residents','markets','managers','total'],latestMigration};
 fs.writeFileSync('.security/migration-reset/operational-wipe-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/operational-wipe-failure.log',String(e.stack||e)+'\n'+String(e.where||''),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native lifecycle verification failed; private diagnostics saved.'}));process.exitCode=1;}
finally{for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
