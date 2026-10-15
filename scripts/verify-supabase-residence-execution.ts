/** Native reviewed worker on genuine backed-up identities.
 * Image metadata uses actual supplied bytes; this does not upload to a provider.
 * All domain records stay in disposable local PostgreSQL restores. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {SupabaseResidenceReviews} from '../supabase/residenceReviews.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {deliverRoomKey} from '../supabase/roomKeyDelivery.js';
import {issueManagerKey,checkManagerKey} from '../supabase/managerKeys.js';
import {normalizeRasterImage} from '../imageUploadSecurity.js';
dotenv.config({quiet:true});
import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {createStorageBackup,readStorageSnapshot} from '../supabase/storageBackup.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {verifyResidenceRecoveryFiles} from './lib/residence-recovery.js';
import {prepareResidenceCleanup} from './lib/residence-cleanup.js';
import {executeResidenceCore,verifyResidenceExecutionFiles,completedResidenceExecution} from './lib/residence-execution.js';
import {checkApprovalKey,requireApprovalGrant} from '../supabase/adminGovernance.js';
import {processResidenceExecutionRequest} from './lib/residence-execution-worker.js';
import {residenceReviewStatus} from '../supabase/residenceReviews.js';
import {runResidenceWorkerBatch} from './lib/residence-worker-batch.js';
const [backup,applicationCheckpoint,draft]=process.argv.slice(2);
if(!backup||!applicationCheckpoint)throw new Error('Pass the latest genuine Auth checkpoint and immutable migration-27 checkpoint.');
const suffix='_reviewed_residence_execution_core.sql';
const generated=fs.readdirSync('supabase/migrations').find(f=>f.endsWith(suffix));
const file=draft||path.join('supabase/migrations',generated!);
const sql=fs.readFileSync(file,'utf8');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];
const temporary:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='fixture';
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){let error:any;try{await work();}catch(e){error=e;}
 check(typeof expected==='number'?error instanceof ApiError&&error.status===expected:error?.code===expected,
  `${label}: expected ${expected}, received ${error instanceof ApiError?error.status:error?.code||'success'}${error?.constraint?' constraint='+error.constraint:''}${error?.code==='42601'?' '+error.message:''}`);}
const fingerprint=`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
 'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`;
try{await withIsolatedBackup(backup,async config=>{
 const db=new SupabaseDatabase(config);
 try{
  const originalAuth=(await db.pool.query(fingerprint)).rows[0].digest;
  const image=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  const {admins,keys,manager,owner,resident,officer,staff,home,floor,room,allocation,caseId,inspection,issue,nullableCase,enrollment,invitation,blank,deliveryKey}=await db.system(async c=>{
   check((await c.query('select count(*) from private.schema_migrations')).rows[0].count==='27','Seed private domain credentials before enrollment guards');
   const people=(await c.query(`select u.id,u.email,u.email_confirmed_at,s.id as session_id from auth.users u join lateral
    (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp()) order by created_at desc limit 1) s on true
    where u.email_confirmed_at is not null and not u.is_anonymous and exists(select 1 from auth.identities i where i.user_id=u.id
     and i.provider='google' and lower(i.identity_data->>'email')=lower(u.email) and i.identity_data->>'email_verified'='true')
    order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
   check(people.length===5,'Five genuine Google subjects keep their actual native sessions');
   const primaries:VerifiedActor[]=[],admins:VerifiedActor[]=[],keys:string[]=[];
   for(const [i,p] of people.entries()){
    await c.query('select private.initialize_auth_profile($1,null)',[p.id]);
    primaries.push({authUserId:p.id,sessionId:p.session_id,kind:'primary',contextId:
     (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'",[p.id])).rows[0].id});
    if(i<2){
     const a={...primaries[i],kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$1,'admin','active') returning id",[p.id])).rows[0].id};
     admins.push(a);await c.query('insert into public.admin_memberships(context_id,slot) values($1,$2)',[a.contextId,i+1]);
     const key=crypto.randomBytes(32).toString('base64url');keys.push(key);
     await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at) values($1,$2,clock_timestamp())',
      [a.contextId,await hashCredentialAsync(`approval:${a.contextId}:${key}`)]);
    }
   }
   async function context(i:number,kind:string,parent:VerifiedActor){
    if(['manager','resident','staff'].includes(kind))await c.query('update public.profiles set primary_owner_id=$2 where id=$1',[people[i].id,parent.authUserId]);
    return {...primaries[i],kind,contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,$3,'active') returning id",[people[i].id,parent.authUserId,kind])).rows[0].id};
   }
   const owner=primaries[0],manager=await context(2,'manager',owner),resident=await context(3,'resident',primaries[1]),
    staff=await context(4,'staff',owner),officer=await context(1,'officer',primaries[1]);
   for(const a of [...admins,manager,resident,staff])await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)',[a.sessionId,a.authUserId,a.contextId]);
   const home=(await c.query("insert into public.residences(primary_owner_id,name,status,setup_submitted_at) select id,display_name,'approved',now() from public.profiles where id=$1 returning id",[owner.authUserId])).rows[0].id;
   await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,home]);
   const block=(await c.query("insert into public.blocks(residence_id,name) values($1,'Native housing reference verification') returning id",[home])).rows[0].id;
   const floor=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[block])).rows[0].id;
   const room=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[floor])).rows[0].id;
   const bed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[room])).rows[0].id;
   const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[resident.contextId,room,bed])).rows[0].id;
   const deliveryKey=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at)values($1,$2,$3,now())returning id',[room,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase(),resident.contextId])).rows[0].id;
   await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status)values($1,$2,'residence_registration','approved')",[manager.contextId,home]);
   const assignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values($1,$2,$3) returning id',[staff.contextId,home,manager.contextId])).rows[0].id;
   const caseId=(await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values($1,$2,'manager_registration','inspection_pending') returning id",[manager.contextId,home])).rows[0].id;
   const nullableCase=(await c.query("insert into public.verification_cases(applicant_context_id,kind,status) values($1,'residence_registration','submitted') returning id",[manager.contextId])).rows[0].id;
   const inspection=(await c.query('insert into public.verification_inspections(case_id,officer_context_id) values($1,$2) returning id',[caseId,officer.contextId])).rows[0].id;
   const issue=(await c.query("insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,assigned_staff_id,title,status,accepted_at) values($1,$2,$3,$4,$5,'Native housing reference verification','accepted',clock_timestamp()) returning id",[home,room,resident.contextId,allocation,assignment])).rows[0].id;
   const enrollment=(await c.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,
    token_digest,auth_user_id,linked_context_id,room_id,residence_id,status,verified_at,expires_at)
    values($1,$2,'resident',$3,$4,$5,$6,$7,$8,'completed',$9,clock_timestamp()+interval '1 day') returning id`,
    [primaries[1].contextId,primaries[1].authUserId,people[3].email.toLowerCase(),crypto.randomBytes(32).toString('hex'),resident.authUserId,resident.contextId,room,home,people[3].email_confirmed_at])).rows[0].id;
   const invitation=(await c.query(`insert into private.account_enrollments(initiator_context_id,kind,invited_email,
    token_digest,residence_id,expires_at) values($1,'staff',$2,$3,$4,clock_timestamp()+interval '1 day') returning id`,
    [manager.contextId,people[1].email.toLowerCase(),crypto.randomBytes(32).toString('hex'),home])).rows[0].id;
   const blank=(await c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[owner.authUserId])).rows[0].id;
   await c.query("insert into public.blocks(residence_id,name) values($1,'Native frozen reference verification')",[blank]);
   await c.query('insert into public.floors(block_id,floor_number) select id,0 from public.blocks where residence_id=$1',[blank]);
   for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>'20261009220000'&&!f.endsWith(suffix)&&(!generated||f.slice(0,14)<generated.slice(0,14))).sort()){
    const text=fs.readFileSync('supabase/migrations/'+file,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[file.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
   // These are reservations for actual supplied bytes, not fake ready/provider objects.
   for(const [a,purpose,inspectionId,allocationId,issueId] of [[officer,'inspection',inspection,null,null],
    [resident,'maintenance',null,allocation,null],[staff,'repair',null,null,issue]] as const){
    const id=crypto.randomUUID();await c.query(`insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,
     inspection_id,residence_id,allocation_id,issue_id,object_path,byte_size,sha256)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,a.contextId,a.authUserId,purpose,inspectionId,
      purpose==='inspection'?null:home,allocationId,issueId,`contexts/${a.contextId}/${id}.png`,image.length,crypto.createHash('sha256').update(image).digest('hex')]);
   }
   return {admins,keys,manager,owner,resident,officer,staff,home,floor,room,allocation,caseId,inspection,issue,nullableCase,enrollment,invitation,blank,deliveryKey};
  });image.fill(0);
  stage='migration';
  await db.system(c=>c.query("delete from public.media_assets where state='reserved'"));
  const seller=(await db.system(c=>c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) select auth_user_id,primary_owner_id,'seller','active' from public.account_contexts where id=$1 returning id",[resident.contextId]))).rows[0].id;
  const service=new SupabaseResidenceReviews(new SupabaseAuth(db)),founder=admins[0],second=admins[1];
  const oldOptions={hostelId:blank,deleteHostel:true,deleteManager:false,ban:{amount:0,unit:'days'}};
  const oldPreview=await service.preview(second,oldOptions);
  check(oldPreview.version===2,'A genuine pre-migration review uses the preceding protocol');
  // Build the historical upgrade fixture through its real native protocol.
  // Current API notifications depend on manager-closure tables added after 48.
  const oldProposal=await db.authorizedSystem(second,['admin'],async c=>{
   const grant=await checkApprovalKey(c,second,keys[1]);await requireApprovalGrant(c,second,grant);
   const p=(await c.query('select private.residence_review_preview($1::jsonb)as preview',[JSON.stringify(oldOptions)])).rows[0].preview;
   const saved=(await c.query(`insert into public.admin_proposals(kind,proposer_context_id,target_residence_id,preview,baseline_digest,reason,quorum,expires_at,residence_roster_revision,residence_lifecycle_revision)
    values('residence_deletion',$1,$2,$3,$4,$5,2,clock_timestamp()+interval'24 hours',$6,$7)returning id`,
    [second.contextId,blank,JSON.stringify(p),p.fingerprint,'Verify retained pause during execution protocol upgrade',p.rosterRevision,p.lifecycleRevision])).rows[0];
   await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision)values($1,$2,'approved')",[saved.id,second.contextId]);return saved;
  },false,false,true);
  await db.authorizedSystem(founder,['admin'],async c=>{
   const grant=await checkApprovalKey(c,founder,keys[0]);await requireApprovalGrant(c,founder,grant);
   await c.query("insert into public.admin_votes(proposal_id,administrator_context_id,decision)values($1,$2,'approved')",[oldProposal.id,founder.contextId]);
   await c.query("select set_config('pinevela.residence_preparation_confirmation','FREEZE APPROVED HOSTEL',true)");
   await c.query(`insert into private.residence_deletion_preparations(proposal_id,founder_context_id,preview_digest)
    select id,$2,baseline_digest from public.admin_proposals where id=$1`,[oldProposal.id,founder.contextId]);
  },false,false,true);
  await denied(()=>db.system(async c=>{await c.query(sql);throw new ApiError(409,'Abort native worker DDL');}),409,'Worker DDL abort is atomic');
  check((await db.pool.query("select to_regclass('private.residence_executions') as target")).rows[0].target===null,'No partial worker or freeze exemption survives DDL rollback');
  check((await db.pool.query('select status from public.admin_proposals where id=$1',[oldProposal.id])).rows[0].status==='approved','Aborted DDL preserves preceding approved consent');
  await db.system(async c=>{await c.query(sql);if(!draft)await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[path.basename(file).slice(0,14),crypto.createHash('sha256').update(sql).digest('hex')]);});
  if(!draft)await db.system(async c=>{
   for(const later of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)&&f.slice(0,14)>path.basename(file).slice(0,14)).sort()){
    const text=fs.readFileSync('supabase/migrations/'+later,'utf8');await c.query(text);
    await c.query('insert into private.schema_migrations(version,digest) values($1,$2)',[later.slice(0,14),crypto.createHash('sha256').update(text).digest('hex')]);
   }
  });
  const oldState=(await db.pool.query('select p.status,f.state from public.admin_proposals p join private.residence_deletion_preparations f on f.proposal_id=p.id where p.id=$1',[oldProposal.id])).rows[0];
  check(oldState.status==='invalidated'&&oldState.state==='frozen','Protocol upgrade invalidates old consent while keeping its pause');
  await denied(()=>db.system(c=>c.query("update public.residences set description='Changed during old pause' where id=$1",[blank])),409,'An invalidated old review does not silently resume frozen housing writes');
  await denied(()=>service.execute(founder,oldProposal.id,{privateKey:keys[0],confirmation:'DELETE APPROVED HOSTEL'}),503,'A genuine founder still cannot invoke public execution');
  await service.cancelPreparation(founder,oldProposal.id,{privateKey:keys[0],reason:'Cancel old protocol and review a fresh version-3 scope'});
  check((await db.pool.query('select state from private.residence_deletion_preparations where proposal_id=$1',[oldProposal.id])).rows[0].state==='cancelled','The own-key founder can cancel an invalidated old-protocol pause');
  const binding=(a:VerifiedActor)=>db.pool.query('select * from private.account_sessions where session_id=$1',[a.sessionId]);
  const managerBinding=JSON.stringify((await binding(manager)).rows);
  const fingerprintRows=async()=>(await db.pool.query(`select jsonb_build_object('residences',(select jsonb_agg(to_jsonb(t) order by id) from public.residences t),
   'contexts',(select jsonb_agg(to_jsonb(t) order by id) from public.account_contexts t),'notifications',(select jsonb_agg(to_jsonb(t) order by id) from public.notifications t),
   'enrollments',(select jsonb_agg(to_jsonb(t) order by id) from private.account_enrollments t),'execution',(select jsonb_agg(to_jsonb(t) order by id) from private.residence_executions t),
   'bans',(select jsonb_agg(to_jsonb(t) order by id) from public.registration_bans t)) as data`)).rows[0].data;
  const privateKey=async(c:any,a:VerifiedActor)=>{const g=await checkApprovalKey(c,a,keys[admins.findIndex(x=>x.contextId===a.contextId)]);await requireApprovalGrant(c,a,g);return g;};
  const checkpoints=()=>{const result=nativeRecoveryCheckpoint(config,projectRef);temporary.push(...result.files);return result.id;};
  const recover=async(id:string)=>{
   const checkpoint=checkpoints(),{binding,snapshot}=await storageCheckpoint(checkpoint),storage=new SupabaseStorage();
   const archive=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
   storageDirectories.push(path.join(storageArchiveRoot(),archive.id+'.pvstorage'));
   await prepareResidenceCleanup(db,projectRef,id,checkpoint,archive.id);
   await service.authorizeExecution(founder,id,{privateKey:keys[0],confirmation:'AUTHORIZE APPROVED HOSTEL'});
   const grant=await db.authorizedSystem(founder,['admin'],c=>privateKey(c,founder));
   return {verified:await verifyResidenceExecutionFiles(db,founder,grant,id),grant};
  };
  const prepare=async(hostelId:string,deleteManager:boolean,amount:number)=>{
   const options={hostelId,deleteHostel:true,deleteManager,ban:{amount,unit:'days'}};
   const preview=await service.preview(second,options);check(preview.version===3&&!preview.executionAvailable,'Fresh native worker scope still advertises the public execution gate');
   const p=await service.propose(second,{...options,fingerprint:preview.fingerprint,reason:'Verify exact native housing removal and retained identities',privateKey:keys[1]});
   await service.vote(founder,p.id,{decision:'approved',privateKey:keys[0]});
   await service.prepare(founder,p.id,{privateKey:keys[0],confirmation:'FREEZE APPROVED HOSTEL'});return p.id;
  };
  const admitted=async(c:any,id:string)=>{
   await privateKey(c,founder);
   await c.query("select set_config('pinevela.residence_execution_confirmation','DELETE APPROVED HOSTEL',true)");
   const receipt=(await c.query("select to_jsonb(r)-'verified_at' as proof from private.residence_recovery_evidence r join private.residence_deletion_preparations f on f.id=r.preparation_id where f.proposal_id=$1",[id])).rows[0];
   await c.query("select set_config('pinevela.residence_execution_recovery_checked',$1::jsonb::text,true)",[JSON.stringify(receipt.proof)]);
   const a=(await c.query('select a.id from private.residence_execution_authorizations a join private.residence_deletion_preparations f on f.id=a.preparation_id where f.proposal_id=$1 and private.residence_execution_authorization_current(a)',[id])).rows[0];
   return (await c.query('insert into private.residence_executions(authorization_id) values($1) returning id',[a.id])).rows[0].id;
  };
  // Send through the actual keyed service before freeze. The native worker must
  // retain this immutable history while removing its live key/room/residence.
  const managerOperationKey=(await db.authorizedSystem(manager,['manager'],c=>issueManagerKey(c,manager))).key;
  manager.managerKeyVersion=(await db.authorizedSystem(manager,['manager'],c=>checkManagerKey(c,manager,managerOperationKey))).version;
  const recipientEmail=(await db.pool.query('select email from public.profiles where id=(select primary_owner_id from public.account_contexts where id=$1)',[resident.contextId])).rows[0].email;
  const keyDelivery=await db.authorizedSystem(manager,['manager'],c=>deliverRoomKey(c,manager,{keyId:deliveryKey,recipientEmail,requestId:crypto.randomUUID()}));
  check(keyDelivery.success&&keyDelivery.channel==='pinevela_notification','Actual assigned manager delivers the occupied key to its verified primary owner before review');
  const retainedDelivery=JSON.stringify((await db.pool.query('select * from private.room_key_deliveries where id=$1',[keyDelivery.dispatch.id])).rows[0]);
  const deliveryNotice=(await db.pool.query('select notification_id from private.room_key_deliveries where id=$1',[keyDelivery.dispatch.id])).rows[0].notification_id;
  const retainedDeliveryNotice=JSON.stringify((await db.pool.query('select * from public.notifications where id=$1',[deliveryNotice])).rows[0]);
  stage='residence-only';
  const proposalId=await prepare(home,false,1),{verified,grant}=await recover(proposalId);
  const saved=JSON.stringify(await fingerprintRows());
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await executeResidenceCore(c,founder,grant,verified,projectRef);throw new ApiError(409,'Abort actual native removal');},false,false,true),409,'Late failure rolls back source removal, portal closure, cooldowns, notices and receipt');
  check(JSON.stringify(await fingerprintRows())===saved,'Every saved domain row and effect is unchanged after interrupted removal');
  await denied(()=>db.authorizedSystem(founder,['admin'],c=>admitted(c,proposalId),false,false,true),'42501','An unfinished native admission cannot commit');
  check((await db.pool.query('select count(*) from private.residence_executions')).rows[0].count==='0','Unfinished admission rollback leaves no durable running transaction');
  await denied(()=>db.authorizedSystem(second,['admin'],async c=>executeResidenceCore(c,second,await privateKey(c,second),verified,projectRef),false,false,true),403,'A second approver cannot replace final founder execution');
  await denied(()=>db.authorizedSystem(founder,['admin'],c=>executeResidenceCore(c,founder,grant,{} as any,projectRef),false,false,true),409,'Caller-provided JSON cannot substitute real archive restoration');
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
   await c.query('create table private.execution_dependency_probe(id uuid primary key,residence_id uuid references public.residences(id) on delete cascade)');
   return admitted(c,proposalId);
  },false,false,true),'42501','A new unreviewed cascading relation blocks native admission');
  check((await db.pool.query("select to_regclass('private.execution_dependency_probe') as target")).rows[0].target===null,'Dependency rehearsal leaves no unreviewed relation behind');
  await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{
   const execution=await admitted(c,proposalId);
   await c.query('delete from private.account_sessions where session_id=$1',[founder.sessionId]);
   return c.query("update private.residence_executions set state='completed' where id=$1",[execution]);
  },false,false,true),'42501','Revoked founder binding cannot finish an admitted execution');
  for(const statement of ["delete from public.residences where id=$1","update public.profiles set display_name=display_name||'x' where id=$1",
   "update public.account_contexts set status='closed' where id=$1"]){
   const id=statement.includes('profiles')?founder.authUserId:statement.includes('account_contexts')?manager.contextId:blank;
   await denied(()=>db.authorizedSystem(founder,['admin'],async c=>{await admitted(c,proposalId);return c.query(statement,[id]);},false,false,true),'42501','Native admission cannot remove a foreign residence or modify protected profiles/retained portals');
  }
  await denied(()=>db.system(async c=>{await c.query("select set_config('pinevela.residence_execution_confirmation','DELETE APPROVED HOSTEL',true)");return c.query('delete from public.residences where id=$1',[home]);}),409,'A caller-set confirmation cannot bypass a frozen review');
  stage='keyed-request-handoff';
  const enabledService=new SupabaseResidenceReviews(new SupabaseAuth(db),true);
  const requestBody={privateKey:keys[0],confirmation:'DELETE APPROVED HOSTEL'};
  await denied(()=>service.execute(founder,proposalId,requestBody),503,'The default public execution-request gate stays closed');
  await denied(()=>enabledService.execute(founder,proposalId,{...requestBody,founderId:founder.contextId}),400,'Client-supplied founder identity cannot enter the request');
  await denied(()=>enabledService.execute(founder,proposalId,{...requestBody,confirmation:'AUTHORIZE APPROVED HOSTEL'}),400,'Authorization text cannot substitute the deletion request confirmation');
  await denied(()=>enabledService.execute(second,proposalId,{...requestBody,privateKey:keys[1]}),403,'The second approver cannot request final execution');
  await denied(()=>enabledService.execute(founder,proposalId,{...requestBody,privateKey:keys[1]}),403,'Another administrator key cannot authorize the founder request');
  await denied(()=>db.system(c=>c.query(`insert into private.residence_execution_requests(authorization_id,proposal_id,founder_context_id,auth_user_id,session_id,approval_key_version,expires_at)
   select a.id,f.proposal_id,a.founder_context_id,a.auth_user_id,a.session_id,a.approval_key_version,a.expires_at
   from private.residence_execution_authorizations a join private.residence_deletion_preparations f on f.id=a.preparation_id
   where f.proposal_id=$1 order by a.created_at desc limit 1`,[proposalId])),'42501','Copying genuine saved consent cannot create a request without current actor and own-key confirmation');
  const queued=await enabledService.execute(founder,proposalId,requestBody);
  check(queued.status==='queued'&&!!queued.request?.id,'The authenticated native service queues the exact keyed request');
  check((await db.pool.query('select id from public.residences where id=$1',[home])).rowCount===1,'Queuing does not delete the residence');
  const retried=await enabledService.execute(founder,proposalId,requestBody);
  check(retried.noChange&&retried.request?.id===queued.request?.id,'A repeated keyed request reconciles one immutable job');
  check((await db.pool.query("select count(*) from public.notifications where title='Reviewed residence deletion requested'")).rows[0].count==='1','Request notice is sent once to administrator notifications');
  const queuedStatus=(await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder))).find(p=>p.id===proposalId)!;
  check(queuedStatus.preparation.request.current&&queuedStatus.preparation.request.id===queued.request!.id,'Administrator status shows the real current queued request');
  check(!/auth_user_id|session_id|approval_key_version|object_path|checkpoint_id|storage_archive_id/.test(JSON.stringify(queuedStatus)),'Status exposes no private identity binding, key version or archive paths');
  await denied(()=>db.system(c=>c.query('update private.residence_execution_requests set founder_context_id=$2 where id=$1',[queued.request!.id,second.contextId])),'42501','Queued founder identity cannot be rewritten');
  await denied(()=>db.system(c=>c.query("update private.residence_execution_requests set state='completed',execution_id=gen_random_uuid() where id=$1",[queued.request!.id])),'42501','A fake execution identifier cannot complete the job');
  await denied(()=>db.authorizedSystem(founder,['admin'],c=>executeResidenceCore(c,founder,grant,verified,projectRef),false,false,true),'42501','Requested execution cannot commit without completing its handoff');
  check((await db.pool.query('select count(*) from private.residence_executions')).rows[0].count==='0','Incomplete handoff rolls back the whole deletion');
  const processing=await Promise.all([processResidenceExecutionRequest(db,queued.request!.id,projectRef),processResidenceExecutionRequest(db,queued.request!.id,projectRef)]);
  const result=processing.find(r=>'cleanupTasks' in r)!;
  check(!!result&&processing.some(r=>'skipped' in r||'noChange' in r),'Concurrent genuine workers serialize or reconcile the same request');
  check((await db.pool.query('select state,execution_id from private.residence_execution_requests where id=$1',[queued.request!.id])).rows[0].execution_id===result.executionId,'The request records the exact execution in the same commit');
  check(result.status==='executed'&&result.cleanupTasks===0&&result.storageCleanup==='not_required','Actual operational removal completes on an honestly empty provider catalog');
  check(!(await db.pool.query('select id from public.residences where id=$1',[home])).rowCount,'Only the selected residence is removed');
  check(!(await db.pool.query('select id from private.room_activation_keys where id=$1',[deliveryKey])).rowCount&&!(await db.pool.query('select id from public.rooms where id=$1',[room])).rowCount,'Reviewed worker removes the delivered live key and room');
  check(JSON.stringify((await db.pool.query('select * from private.room_key_deliveries where id=$1',[keyDelivery.dispatch.id])).rows[0])===retainedDelivery,'Reviewed physical teardown retains the identical immutable key-delivery receipt');
  check(JSON.stringify((await db.pool.query('select * from public.notifications where id=$1',[deliveryNotice])).rows[0])===retainedDeliveryNotice,'Reviewed physical teardown preserves its exact historical recipient notification');
  check((await db.pool.query('select id from public.residences where id=$1',[blank])).rowCount===1,'Foreign residence remains intact');
  check(JSON.stringify((await binding(manager)).rows)===managerBinding,'Residence-only retains the exact manager sign-in binding');
  check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='active','Residence-only preserves the manager portal');
  for(const a of [resident,staff]){
   check((await db.pool.query('select status from public.account_contexts where id=$1',[a.contextId])).rows[0].status==='closed','Affected housing portal closes');
   check((await binding(a)).rowCount===0,'Affected portal binding is revoked');
   await denied(()=>db.actor(a,c=>c.query('select private.current_context_id()')),401,'An old genuine housing session cannot enter its ended portal');
  }
  check((await db.pool.query('select status from public.account_contexts where id=$1',[seller])).rows[0].status==='active','Shared resident Google identity retains its independent seller portal');
  const ban=(await db.pool.query('select * from public.registration_bans where proposal_id=$1',[proposalId])).rows[0];
  check(ban.kind==='residence'&&ban.account_context_id===manager.contextId,'Residence-only cooldown targets exactly the retained manager');
  check((await db.pool.query("select until_at=started_at+interval '1 day' as exact from public.registration_bans b join private.residence_executions e on e.proposal_id=b.proposal_id where b.proposal_id=$1",[proposalId])).rows[0].exact,'Cooldown starts at actual native execution time');
  check((await db.pool.query("select p.status,f.state from public.admin_proposals p join private.residence_deletion_preparations f on f.proposal_id=p.id where p.id=$1",[proposalId])).rows[0].status==='executed','Proposal records actual executed state');
  check((await db.pool.query('select state from private.residence_deletion_preparations where proposal_id=$1',[proposalId])).rows[0].state==='executed','Successful removal releases the pause as executed');
  check((await db.pool.query('select id from private.account_enrollments where id=$1 and room_id=$2 and residence_id=$3 and status=$4',[enrollment,room,home,'completed'])).rowCount===1,'Completed enrollment retains exact historical binding/status');
  check((await db.pool.query('select id from private.account_enrollments where id=$1 and residence_id=$2 and status=$3',[invitation,home,'cancelled'])).rowCount===1,'The affected pending staff invitation is cancelled with its historical residence retained');
  await denied(()=>db.system(c=>c.query('insert into public.residences(id,primary_owner_id,name) select $1,id,display_name from public.profiles where id=$2',[home,owner.authUserId])),'23505','A removed historical residence UUID cannot be reused');
  await denied(()=>db.system(c=>c.query('insert into public.rooms(id,floor_id,room_number) select $1,id,$3 from public.floors where block_id in(select id from public.blocks where residence_id=$2)',[room,blank,'2'])),'23505','A removed historical room UUID cannot be reused');
  check((await db.pool.query('select id from private.housing_reference_targets where id=any($1::uuid[])',[[room,allocation,caseId,inspection,issue]])).rowCount===5,'Removed operational identifiers remain enforced historical targets');
  check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.title='Residence deleted' and n.message like '%manager portal remains%'",[owner.contextId])).rows[0].count==='1','Creator receives the correct residence-only notice in the primary account');
  check((await db.pool.query("select count(*) from public.notifications where category='admin_governance' and title='Reviewed residence deletion completed'")).rows[0].count==='1','Admins receive actual execution state notification');
  check((await db.pool.query('select id from public.profiles where id=$1',[manager.authUserId])).rowCount===1,'Manager verified profile is retained');
  await denied(()=>db.authorizedSystem(founder,['admin'],c=>executeResidenceCore(c,founder,grant,verified,projectRef),false,false,true),409,'A completed execution cannot replay removal with stale archived consent');
  const reconciled=await db.authorizedSystem(founder,['admin'],c=>completedResidenceExecution(c,founder,grant,proposalId));
  check(reconciled?.noChange&&reconciled.executionId===result.executionId,'A lost response reconciles the immutable receipt without replaying removal');
  check((await db.pool.query('select count(*) from private.residence_executions')).rows[0].count==='1','Reconciliation does not duplicate execution or notices');
  const requestReconciled=await enabledService.execute(founder,proposalId,requestBody);
  check(requestReconciled.status==='executed'&&requestReconciled.noChange,'A lost API response reconciles without replaying queued deletion');
  const operatorReconciled=await processResidenceExecutionRequest(db,queued.request!.id,projectRef);
  check('noChange' in operatorReconciled&&operatorReconciled.noChange,'A restarted operator does not execute a completed request twice');
  const completedStatus=(await db.authorizedSystem(founder,['admin'],c=>residenceReviewStatus(c,founder))).find(p=>p.id===proposalId)!;
  check(completedStatus.preparation.request.state==='completed'&&completedStatus.preparation.execution.cleanupTotal===0,'Admin status shows completed execution and honest zero-image cleanup counts');
  for(const statement of ['update private.residence_execution_requests set state=state','delete from private.residence_execution_requests','truncate private.residence_execution_requests'])
   await denied(()=>db.system(c=>c.query(statement)),'42501','Completed request history cannot be edited or removed');
  stage='combined';
  await db.system(c=>c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[manager.contextId,blank]));
  const combinedId=await prepare(blank,true,2),combined=await recover(combinedId);
  const combinedQueued=await enabledService.execute(founder,combinedId,requestBody);
  const actualBinding=(await binding(founder)).rows[0];
  await db.system(c=>c.query('delete from private.account_sessions where session_id=$1',[founder.sessionId]));
  const invalidating=await Promise.all([processResidenceExecutionRequest(db,combinedQueued.request!.id,projectRef),processResidenceExecutionRequest(db,combinedQueued.request!.id,projectRef)]);
  check(invalidating.some(r=>r.status==='invalidated'),'A revoked real founder binding invalidates queued work');
  check((await db.pool.query("select count(*) from public.notifications where title='Reviewed residence deletion request closed'")).rows[0].count==='1','Concurrent invalidation preserves one committed notice');
  check((await db.pool.query('select id from public.residences where id=$1',[blank])).rowCount===1,'Revoked consent never deletes the queued residence');
  await db.system(c=>c.query('insert into private.account_sessions select * from jsonb_populate_record(null::private.account_sessions,$1)',[JSON.stringify(actualBinding)]));
  check(!(await db.pool.query('select private.residence_execution_request_current(r) as current from private.residence_execution_requests r where id=$1',[combinedQueued.request!.id])).rows[0].current,'Restoring the original genuine binding does not revive invalidated consent');
  await service.authorizeExecution(founder,combinedId,{privateKey:keys[0],confirmation:'AUTHORIZE APPROVED HOSTEL'});
  const freshQueued=await enabledService.execute(founder,combinedId,requestBody);
  check(freshQueued.request!.id!==combinedQueued.request!.id,'New founder consent creates a new job while retaining invalidated history');
  const aborted=new AbortController();aborted.abort();
  const stoppedBatch=await runResidenceWorkerBatch(db,{execute:true,projectRef,signal:aborted.signal});
  check(stoppedBatch.stopping&&stoppedBatch.execution.completed===0,'A stopped runner never starts another queued operation');
  check((await db.pool.query('select state from private.residence_execution_requests where id=$1',[freshQueued.request!.id])).rows[0].state==='requested','Graceful stop preserves the exact durable request for restart');
  const previewBatch=await runResidenceWorkerBatch(db,{execute:false,projectRef});
  check(previewBatch.readOnly&&previewBatch.execution.pending===1&&previewBatch.execution.completed===0,'Default runner preview inspects actual queued work without execution');
  const executedBatch=await runResidenceWorkerBatch(db,{execute:true,projectRef});
  check(executedBatch.execution.completed===1&&executedBatch.execution.failed===0,'The runner executes actual reviewed combined scope after restart');
  check((await db.pool.query('select status from public.account_contexts where id=$1',[manager.contextId])).rows[0].status==='closed','Combined removal closes the manager portal');
  check((await binding(manager)).rowCount===0,'Combined removal revokes only manager bindings');
  await denied(()=>db.actor(manager,c=>c.query('select private.current_context_id()')),401,'Old manager session cannot enter closed manager portal');
  const combinedBan=(await db.pool.query('select kind,account_context_id from public.registration_bans where proposal_id=$1',[combinedId])).rows[0];
  check(combinedBan.kind==='manager_account'&&combinedBan.account_context_id===owner.contextId,'Combined cooldown targets the exact saved primary creator');
  check((await db.pool.query('select status from public.account_contexts where id=$1',[owner.contextId])).rows[0].status==='active','Primary creator portal survives combined removal');
  check((await db.pool.query('select id from public.profiles where id=$1',[manager.authUserId])).rowCount===1,'Combined removal retains verified profile and historical relationships');
  check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.title='Residence deleted' and n.message like '%manager portal is closed%'",[owner.contextId])).rows[0].count==='1','Combined removal informs the saved creator before any sub-account entry');
  stage='unassigned-zero-cooldown';
  const unassigned=(await db.system(c=>c.query('insert into public.residences(primary_owner_id,name) select id,display_name from public.profiles where id=$1 returning id',[owner.authUserId]))).rows[0].id;
  const zeroId=await prepare(unassigned,false,0),zero=await recover(zeroId);
  const expiring=await enabledService.execute(founder,zeroId,requestBody);
  stage='actual-request-expiry';
  const expiry=(await db.pool.query('select greatest(0,extract(epoch from expires_at-clock_timestamp())*1000)::integer as delay from private.residence_execution_requests where id=$1',[expiring.request!.id])).rows[0].delay;
  console.log(JSON.stringify({phase:stage,waitingForActualNativeExpiry:true}));
  await new Promise(resolve=>setTimeout(resolve,expiry+500));
  check((await processResidenceExecutionRequest(db,expiring.request!.id,projectRef)).status==='invalidated','Real native timer expiry invalidates the queued request without execution');
  check((await db.pool.query('select failure_code from private.residence_execution_requests where id=$1',[expiring.request!.id])).rows[0].failure_code==='consent_expired','The expired request keeps its native bounded reason');
  await service.authorizeExecution(founder,zeroId,{privateKey:keys[0],confirmation:'AUTHORIZE APPROVED HOSTEL'});
  const zeroQueued=await enabledService.execute(founder,zeroId,requestBody);
  const zeroResult=await processResidenceExecutionRequest(db,zeroQueued.request!.id,projectRef);
  check(zeroResult.status==='executed','An unassigned residence can be removed under reviewed zero-cooldown scope');
  check((await db.pool.query('select count(*) from public.registration_bans where proposal_id=$1',[zeroId])).rows[0].count==='0','Zero cooldown creates no invented registration ban');
  check((await db.pool.query("select count(*) from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.title='Residence deleted' and n.message like '%primary account remains%'",[owner.contextId])).rows[0].count==='1','An unassigned residence notice describes the actual retained primary account');
  for(const role of ['anon','authenticated','pinevela_backend']){
   for(const table of ['residence_executions','residence_storage_cleanup_tasks','residence_execution_requests'])
    check(!(await db.pool.query('select has_table_privilege($1,$2,$3) as allowed',[role,'private.'+table,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE'])).rows[0].allowed,'No direct role can read or mutate execution/cleanup evidence');
   for(const fn of ['run_residence_execution(uuid)','residence_execution_actor_current(private.residence_executions)',
    'residence_execution_write_allowed(text,text,text,jsonb,jsonb,uuid)','residence_execution_guard()','residence_execution_commit_guard()',
    'residence_execution_recorded()','residence_cleanup_task_guard()',
    'residence_execution_request_current(private.residence_execution_requests)','residence_execution_request_guard()','residence_execution_request_commit_guard()'])
    check(!(await db.pool.query('select has_function_privilege($1,$2,$3) as allowed',[role,'private.'+fn,'EXECUTE'])).rows[0].allowed,'No execution helper is exposed as a browser/backend RPC');
  }
  for(const statement of ['update private.residence_executions set hostel_name=hostel_name','delete from private.residence_executions','truncate private.residence_executions cascade'])
   await denied(()=>db.system(c=>c.query(statement)),'42501','Completed receipt cannot be overwritten, deleted or truncated');
  check((await db.pool.query(fingerprint)).rows[0].digest===originalAuth,'All actual Auth users, identities and native sessions remain unchanged');
  stage='recovery';
  const completed=checkpoints();
  await withIsolatedBackup(completed,async restored=>{
   const recovered=new SupabaseDatabase(restored);try{
    check((await recovered.pool.query('select count(*) from private.residence_executions where state=$1',['completed'])).rows[0].count==='3','Actual full restoration preserves completed worker receipts');
    check((await recovered.pool.query("select count(*) from private.residence_execution_requests where state='completed'")).rows[0].count==='3','Actual restoration preserves completed handoff history');
    check((await recovered.pool.query("select count(*) from private.residence_execution_requests where state='invalidated'")).rows[0].count==='2','Actual restoration preserves revoked and expired request history');
    check((await recovered.pool.query('select count(*) from public.residences')).rows[0].count==='0','Actual restored operational state matches committed removals');
    check((await recovered.pool.query('select count(*) from public.registration_bans')).rows[0].count==='2','Native scoped cooldowns survive encrypted full restore');
    check((await recovered.pool.query(fingerprint)).rows[0].digest===originalAuth,'Native restore preserves genuine Auth bytes');
   }finally{await recovered.close();}
  });
  check((await db.pool.query('select count(*) from private.residence_executions where state=$1',['running'])).rows[0].count==='0','No durable running admission remains');
 }finally{await db.close();}
},{applicationCheckpoint});
console.log(JSON.stringify({passed:true,checks,isolatedNativeRemoval:true,actualEncryptedRecovery:true,cloudRecordsModified:0,cloudObjectsModified:0,authUsersFabricated:0,providerMocks:0,publicExecutionEnabled:false}));
}catch(error){
 const diagnostic='.security/migration-reset/'+crypto.randomUUID()+'.residence-execution-failure.log';
 const fd=fs.openSync(diagnostic,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(fd,error instanceof Error?error.stack||error.message:'Native execution failed.');}finally{fs.closeSync(fd);}
 console.error(JSON.stringify({passed:false,checks,stage,diagnostic,cloudRecordsModified:0,cloudObjectsModified:0}));process.exitCode=1;
}finally{for(const file of temporary)fs.rmSync(file,{force:true});for(const directory of storageDirectories)fs.rmSync(directory,{force:true,recursive:true});}
