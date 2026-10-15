/** Wipe review protocol in a disposable native restore. Actual archived Google
 * identities/sessions only; no cloud writes, simulated provider replies or wipes. */
import {spawnSync} from 'node:child_process';import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';import {checkApprovalKey,deniedApprovalKey,setAdministratorActive} from '../supabase/adminGovernance.js';
import {wipeScopes,systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,refreshSystemWipeReviews,systemWipeReviewStatus} from '../supabase/systemWipeReviews.js';
import {nativeRecoveryCheckpoint} from './lib/native-recovery-checkpoint.js';
import {storageCheckpoint,storageArchiveRoot} from './lib/storage-checkpoint.js';
import {createStorageBackup,readStorageSnapshot,verifyStorageBackup} from '../supabase/storageBackup.js';
import {SupabaseStorage} from '../supabase/storage.js';
import {pauseSystemWipeScope,authorizeSystemWipeExecution,startSystemWipePreparation,cancelSystemWipePreparation} from '../supabase/systemWipeReviews.js';
import {systemWipeRecoveryPreparation,verifySystemWipeRecoveryFiles,recordSystemWipeRecovery,attachSystemWipeRecovery} from './lib/system-wipe-recovery.js';
import path from 'node:path';
dotenv.config({quiet:true});const [checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4||[checkpoint,applicationCheckpoint].some(v=>!/^[a-f0-9-]{36}$/.test(v||'')))throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
const projectRef=new URL(process.env.SUPABASE_URL!).hostname.split('.')[0];const checkpointFiles:string[]=[],storageDirectories:string[]=[];
let checks=0,stage='restore';function check(v:unknown,label:string){assert.ok(v,label);checks++;}
async function denied(work:()=>Promise<unknown>,status:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}
 if((typeof status==='number'?e?.status:e?.code)!==status)fs.writeFileSync('.security/migration-reset/system-wipe-denial.log',JSON.stringify({label,status,actualStatus:e?.status,actualCode:e?.code,detail:String(e?.stack||e)},null,2),{mode:0o600});
 check(typeof status==='number'?e instanceof ApiError&&e.status===status:e?.code===status,label);}
try{await withIsolatedBackup(checkpoint,async config=>{let db=new SupabaseDatabase(config);try{
 const authDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t)order by id)from auth.users t),'identities',(select jsonb_agg(to_jsonb(t)order by id)from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t)order by id)from auth.sessions t))::text)as d`)).rows[0].d;
 const beforeAuth=await authDigest();stage='fixture';const fixture=await db.system(async c=>{
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
  await c.query('update public.profiles set primary_owner_id=$2 where id=any($1::uuid[])',[[people[1].id,people[2].id],people[0].id]);
  const resident=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'resident','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const seller=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'seller','active')returning id",[people[1].id,people[0].id])).rows[0].id;
  const staff=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)values($1,$2,'staff','active')returning id",[people[2].id,people[0].id])).rows[0].id;
  const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id)values($1,$2,$3)returning id',[resident,room,bed])).rows[0].id;
  await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id)values($1,$2,$3)',[staff,home,contextId]);
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
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff};
 });

 const{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff}=fixture;
 const run=<T>(a:VerifiedActor,work:(c:any)=>Promise<T>,exclusive=false)=>db.authorizedSystem(a,[a.kind],work,false,false,exclusive);
 const grants=[];for(let i=0;i<5;i++){const g=await run(admins[i],c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(g);grants.push(g);}
 const body={confirmation:'START WIPE BACKUP'};
 const propose=async(scopes=['total'])=>{const v=await run(admins[1],c=>systemWipePreview(c,admins[1],scopes));return run(admins[1],c=>proposeSystemWipe(c,admins[1],grants[1],{scopes,reason:people[1].name,fingerprint:v.fingerprint}),true);};
 const vote=(id:string,i:number)=>run(admins[i],c=>voteSystemWipe(c,admins[i],grants[i],id,'approved'),true);
 const final=(id:string)=>run(admins[0],c=>founderSystemWipeReview(c,admins[0],grants[0],id,{decision:'approve-backup',reason:people[0].name,confirmation:'APPROVE WIPE BACKUP'}),true);
 const start=(id:string,i=0,b:any=body)=>run(admins[i],c=>startSystemWipePreparation(c,admins[i],grants[i],id,b),true);
 const cancel=(id:string,i=0,b:any={reason:people[0].name})=>run(admins[i],c=>cancelSystemWipePreparation(c,admins[i],grants[i],id,b),true);
 const checkpoint=()=>{const r=nativeRecoveryCheckpoint(config,projectRef);checkpointFiles.push(...r.files);return r.id;};
 const archive=async(id:string)=>{const {binding,snapshot}=await storageCheckpoint(id);const storage=new SupabaseStorage();
  const r=await createStorageBackup(storageArchiveRoot(),binding,snapshot,o=>storage.downloadForBackup(o.path,o),()=>db.system(c=>readStorageSnapshot(c)));
  storageDirectories.push(path.join(storageArchiveRoot(),r.id+'.pvstorage'));return r.id;};
 const operational=async()=>(await db.pool.query(`select md5(jsonb_build_object('contexts',(select jsonb_agg(to_jsonb(t)order by id)from public.account_contexts t),'profiles',(select jsonb_agg(to_jsonb(t)order by id)from public.profiles t),'homes',(select jsonb_agg(to_jsonb(t)order by id)from public.residences t),'allocations',(select jsonb_agg(to_jsonb(t)order by id)from public.allocations t),'stores',(select jsonb_agg(to_jsonb(t)order by id)from public.stores t),'storage',(select jsonb_agg(to_jsonb(t)order by id)from storage.objects t),'bindings',(select jsonb_agg(to_jsonb(t)order by session_id)from private.account_sessions t))::text)as d`)).rows[0].d;
 const beforeOperational=await operational();stage='keyed preparation';
 const p=await propose();
 await denied(()=>start(p.id,1),403,'Non-founder cannot start preparation');await denied(()=>start(p.id,0,{confirmation:true}),400,'Exact typed preparation confirmation required');
 await denied(()=>start(p.id,0,{...body,checkpointId:crypto.randomUUID()}),400,'Browser cannot supply operator recovery assertions');
 await denied(()=>run(admins[0],c=>startSystemWipePreparation(c,admins[0],{allowed:false},p.id,body),true),403,'Own current founder key grant required');
 for(const i of[2,3,4])await vote(p.id,i);
 await denied(()=>start(p.id),409,'Four independent approvals cannot start preparation');await vote(p.id,0);
 await denied(()=>start(p.id),409,'Five votes alone do not replace final founder backup consent');await final(p.id);
 const pre=checkpoint(),preStorage=await archive(pre);
 const prep=await start(p.id);check(prep.success&&!prep.noChange&&prep.preparation.state==='active','Founder explicitly starts non-destructive preparation');
 check((await start(p.id)).noChange,'Exact preparation retry returns same record');
 check((await db.pool.query("select count(*)from public.notifications where title='System wipe backup preparation started'")).rows[0].count==='1','Repeated start produces one notification and preparation');
 check(await operational()===beforeOperational,'Preparation changes no portals, housing, store, bindings or Storage');
 await denied(()=>verifySystemWipeRecoveryFiles(p.id,pre,preStorage),409,'Pre-preparation checkpoint cannot authorize current preparation');
 stage='actual encrypted recovery';const post=checkpoint(),postStorage=await archive(post),verified=await verifySystemWipeRecoveryFiles(p.id,post,postStorage);
 check(verified.preparation.id===prep.preparation.id&&verified.preparation.current&&verified.preparation.quorum,'Actual restored dump contains exact active preparation and five votes');
 const snapshot=await db.system(c=>readStorageSnapshot(c));check(verified.evidence.objects===snapshot.objects.length&&verified.evidence.bytes===snapshot.objects.reduce((n,o)=>n+Number(o.metadata.size),0),'Actual reconstructed bytes cover every real Storage object, including orphan records');
 check(Object.isFrozen(verified)&&Object.isFrozen(verified.evidence),'Checked operator evidence is immutable in memory');
 const counts=async()=>(await db.pool.query(`select (select count(*)from private.system_wipe_recovery_evidence)as receipts,(select count(*)from public.notifications where title='System wipe recovery backups verified')as notices,(select count(*)from private.audit_events where event_type='system_wipe_recovery_verified')as audits`)).rows[0];
 const baseline=await counts();
 await denied(()=>db.system(c=>recordSystemWipeRecovery(c,{...verified,[Object.getOwnPropertySymbols(verified)[0]]:false}as any,projectRef)),409,'Unverified metadata cannot substitute for actual recovery files');
 await denied(()=>db.system(c=>recordSystemWipeRecovery(c,verified,'a'.repeat(20))),409,'Foreign project evidence is rejected');
 await denied(()=>db.system(c=>c.query(`insert into private.system_wipe_recovery_evidence(preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes)
  select preparation_id,checkpoint_id,storage_archive_id,project_ref,dump_sha256,storage_inventory_digest,native_catalog_digest,manifest_sha256,scope_digest,preparation_created_at,checkpoint_created_at,objects,bytes from jsonb_populate_record(null::private.system_wipe_recovery_evidence,$1)`,[JSON.stringify(verified.evidence)])),'42501','Native SQL cannot assert filesystem verification without checked operator evidence');
 await denied(()=>db.system(async c=>{await c.query('set transaction isolation level repeatable read');return recordSystemWipeRecovery(c,verified,projectRef);}),'42501','Old-snapshot recovery insert is rejected');
 const manifest=path.join(storageArchiveRoot(),postStorage+'.pvstorage','manifest.pvsb'),original=fs.readFileSync(manifest);
 try{const damaged=Buffer.from(original);damaged[damaged.length-1]^=1;fs.writeFileSync(manifest,damaged);let error;try{await verifySystemWipeRecoveryFiles(p.id,post,postStorage);}catch(e){error=e;}check(error instanceof Error,'Tampered encrypted manifest fails authentication');}finally{fs.writeFileSync(manifest,original);}
 let mismatch;try{await verifySystemWipeRecoveryFiles(p.id,post,preStorage);}catch(e){mismatch=e;}check(mismatch instanceof Error,'Storage archive cannot swap its database binding');
 await denied(()=>db.system(async c=>{await recordSystemWipeRecovery(c,verified,projectRef);throw new ApiError(409,'Abort actual native receipt transaction');}),409,'Real transaction failure rolls back recovery receipt, notifications and audit');
 check(JSON.stringify(await counts())===JSON.stringify(baseline),'Rejected verification leaves no receipts or notification/audit writes');
 const outcomes=await Promise.all([db.system(c=>recordSystemWipeRecovery(c,verified,projectRef)),db.system(c=>recordSystemWipeRecovery(c,verified,projectRef))]);
 check(outcomes.filter(r=>r.noChange).length===1,'Concurrent verified retries record exactly once');
 check(JSON.stringify(await counts())===JSON.stringify({receipts:'1',notices:'1',audits:'1'}),'Exactly one recovery receipt, notification and audit commit');
 const recipients=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='System wipe recovery backups verified'")).rows.map(r=>r.context_id);
 check(recipients.length===5&&admins.every(a=>recipients.includes(a.contextId)),'Recovery verification status reaches exactly the five administrator portals');
 check((await db.pool.query("select actor_context_id from private.audit_events where event_type='system_wipe_recovery_verified'")).rows[0].actor_context_id===null,'Operator does not impersonate a founder session');
 const status=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0])),view=status.find(r=>r.id===p.id);
 check(view?.preparation?.recovery?.current&&view.preparation.recovery.verifiedAt,'Administrator projection reports genuinely current restored recovery');
 check(!JSON.stringify(status).includes(post)&&!JSON.stringify(status).includes(postStorage)&&!JSON.stringify(status).includes(verified.evidence.dump_sha256),'Browser projection excludes private archive identifiers and recovery hashes');
 for(const role of['anon','authenticated','pinevela_backend'])for(const table of['system_wipe_preparations','system_wipe_recovery_evidence']){
  check(!(await db.pool.query('select has_table_privilege($1,$2,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE\')as allowed',[role,'private.'+table])).rows[0].allowed,'Private preparations/evidence have no browser or scoped backend grants');
  await denied(()=>db.system(async c=>{await c.query('set local role '+role);return c.query('select * from private.'+table);}),'42501','Private preparation/evidence cannot be read directly');
 }
 for(const sql of['update private.system_wipe_recovery_evidence set bytes=bytes+1','delete from private.system_wipe_recovery_evidence','truncate private.system_wipe_recovery_evidence cascade','delete from private.system_wipe_preparations','truncate private.system_wipe_preparations cascade'])await denied(()=>db.system(c=>c.query(sql)),'42501','Native preparation and recovery history is immutable');
 check((await attachSystemWipeRecovery(db,projectRef,p.id,post,postStorage)).noChange,'Restarted operator re-verifies real files and reuses exact receipt');
 const another=await archive(post);await denied(()=>attachSystemWipeRecovery(db,projectRef,p.id,post,another),409,'Different valid archive cannot replace saved immutable evidence');
 const reconnected=new SupabaseDatabase(config);try{check((await reconnected.pool.query('select count(*)from private.system_wipe_recovery_evidence')).rows[0].count==='1','Receipt persists across database reconnect');}finally{await reconnected.close();}
 await denied(()=>run(admins[0],c=>pauseSystemWipeScope(c,admins[0],grants[0],p.id,{confirmation:'PAUSE REVIEWED WIPE'}),true),409,'Earlier unpaused recovery evidence requires cancellation and a fresh review');
 const bucket=(await db.pool.query('select id,name from storage.buckets order by id limit 1')).rows[0];
 await db.system(c=>c.query('update storage.buckets set name=$2 where id=$1',[bucket.id,bucket.name+' ']));
 await denied(()=>db.system(c=>recordSystemWipeRecovery(c,verified,projectRef)),409,'Changed native Storage catalog rejects previously checked evidence');
 const changedStorage=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0]));check(changedStorage.find(r=>r.id===p.id)?.preparation?.recovery?.current===false,'Changed Storage is clearly projected as unusable evidence');
 await db.system(c=>c.query('update storage.buckets set name=$2 where id=$1',[bucket.id,bucket.name]));
 await denied(()=>cancel(p.id,1),403,'Another administrator cannot cancel founder preparation');await denied(()=>cancel(p.id,0,{reason:''}),400,'Cancellation requires a meaningful reason');
 check((await cancel(p.id)).success,'Founder own key cancels active preparation');
 check((await db.pool.query('select status from public.admin_proposals where id=$1',[p.id])).rows[0].status==='invalidated','Cancellation invalidates old five-admin and founder consent');
 await denied(()=>db.system(c=>recordSystemWipeRecovery(c,verified,projectRef)),409,'Cancelled preparation cannot accept old evidence');await denied(()=>start(p.id),409,'Cancelled preparation cannot resume old consent');
 const next=await propose(['markets']);for(const i of[2,3,4,0])await vote(next.id,i);await final(next.id);await start(next.id);
 await denied(()=>verifySystemWipeRecoveryFiles(next.id,post,postStorage),409,'New review cannot use an old archived preparation');
 const oldPreview=await run(admins[0],c=>systemWipePreview(c,admins[0],['markets']));
 await db.system(c=>c.query("update public.stores set status='suspended' where id=$1",[store]));await db.system(c=>c.query("update public.stores set status='pending' where id=$1",[store]));
 await denied(()=>db.system(c=>systemWipeRecoveryPreparation(c,next.id)),409,'Native data change and reversal invalidates preparation');
 await run(admins[0],c=>refreshSystemWipeReviews(c,admins[0]));const outdated=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0]));check(outdated.find(r=>r.id===next.id)?.preparation?.current===false,'Outdated preparation is clearly projected without claiming usable recovery');
 await cancel(next.id);
 check(await operational()===beforeOperational,'Preparation, recovery and cancellation preserve all operational records');
 check(await authDigest()===beforeAuth,'Genuine Auth users, identities and native sessions remain unchanged');

 stage='scoped native pause';
 const scoped=await propose(['markets']);for(const i of[2,3,4,0])await vote(scoped.id,i);await final(scoped.id);const scopedPrep=await start(scoped.id);
 const pause=(i=0,b:any={confirmation:'PAUSE REVIEWED WIPE'})=>run(admins[i],c=>pauseSystemWipeScope(c,admins[i],grants[i],scoped.id,b),true);
 const consent=(i=0,b:any={confirmation:'AUTHORIZE REVIEWED WIPE'})=>run(admins[i],c=>authorizeSystemWipeExecution(c,admins[i],grants[i],scoped.id,b),true);
 await denied(()=>pause(1),403,'Only the founder may pause reviewed records');
 await denied(()=>pause(0,{confirmation:true}),400,'Scope pause needs exact typed confirmation');
 await denied(()=>pause(0,{confirmation:'PAUSE REVIEWED WIPE',userId:people[0].id}),400,'Pause rejects client identity selectors');
 await denied(()=>run(admins[0],c=>pauseSystemWipeScope(c,admins[0],{allowed:false},scoped.id,{confirmation:'PAUSE REVIEWED WIPE'}),true),403,'Pause needs current own approval-key proof');
 await denied(()=>consent(),409,'Unpaused/unverified preparation cannot grant final consent');
 await denied(()=>db.system(async c=>c.query('insert into private.system_wipe_freezes(preparation_id,founder_context_id,scope_digest)values($1,$2,$3)',[scopedPrep.preparation.id,admins[0].contextId,(await c.query('select baseline_digest from public.admin_proposals where id=$1',[scoped.id])).rows[0].baseline_digest])),'42501','Direct pause SQL cannot impersonate the founder');
 // Exercise unresolved native upload admission without creating a cloud object.
 const reservationId=crypto.randomUUID(),assetValues=[reservationId,seller,people[1].id,`contexts/${seller}/${reservationId}.png`,Buffer.from(people[1].name),crypto.createHash('sha256').update(people[1].name).digest('hex')];
 await db.system(c=>c.query("insert into public.media_assets(id,owner_context_id,owner_auth_user_id,purpose,object_path,byte_size,sha256)values($1,$2,$3,'market',$4,$5,$6)",[...assetValues.slice(0,4),assetValues[4].length,assetValues[5]]));
 await run(admins[0],c=>refreshSystemWipeReviews(c,admins[0]));await cancel(scoped.id);
 const pending=await propose(['markets']);for(const i of[2,3,4,0])await vote(pending.id,i);await final(pending.id);await start(pending.id);
 await denied(()=>run(admins[0],c=>pauseSystemWipeScope(c,admins[0],grants[0],pending.id,{confirmation:'PAUSE REVIEWED WIPE'}),true),409,'An actual reserved upload prevents pausing its scope');
 await cancel(pending.id);await db.system(c=>c.query("update public.media_assets set state='removing'where id=$1",[reservationId]));
 const removing=await propose(['markets']);for(const i of[2,3,4,0])await vote(removing.id,i);await final(removing.id);await start(removing.id);
 await denied(()=>run(admins[0],c=>pauseSystemWipeScope(c,admins[0],grants[0],removing.id,{confirmation:'PAUSE REVIEWED WIPE'}),true),409,'An actual removing photograph blocks pause until provider cleanup is reconciled');
 await cancel(removing.id);await db.system(c=>c.query('delete from public.media_assets where id=$1',[reservationId]));
 const reviewed=await propose(['markets']);for(const i of[2,3,4,0])await vote(reviewed.id,i);await final(reviewed.id);const reviewedPrep=await start(reviewed.id);
 const pauseReviewed=(i=0)=>run(admins[i],c=>pauseSystemWipeScope(c,admins[i],grants[i],reviewed.id,{confirmation:'PAUSE REVIEWED WIPE'}),true);
 const consentReviewed=(i=0,b:any={confirmation:'AUTHORIZE REVIEWED WIPE'})=>run(admins[i],c=>authorizeSystemWipeExecution(c,admins[i],grants[i],reviewed.id,b),true);
 const beforePause=checkpoint(),beforePauseStorage=await archive(beforePause),unpaused=await verifySystemWipeRecoveryFiles(reviewed.id,beforePause,beforePauseStorage);
 const pauseEvents=async()=>JSON.stringify((await db.pool.query(`select(select count(*)from private.system_wipe_freezes)as pauses,(select count(*)from public.notifications where title='Reviewed system wipe scope paused')as notices,(select count(*)from private.audit_events where event_type='system_wipe_scope_paused')as audits`)).rows[0]);
 const beforePauseEvents=await pauseEvents();
 await denied(()=>run(admins[0],async c=>{await pauseSystemWipeScope(c,admins[0],grants[0],reviewed.id,{confirmation:'PAUSE REVIEWED WIPE'});throw new ApiError(409,'Abort native pause receipt');},true),409,'Failed transaction rolls back pause, audit and notices');
 check(await pauseEvents()===beforePauseEvents,'Failed pause leaves no durable writer block');
 const paused=await Promise.all([pauseReviewed(),pauseReviewed()]);check(paused.filter(x=>x.noChange).length===1,'Concurrent pause retries create exactly one durable scope pause');
 check(JSON.parse(await pauseEvents()).pauses==='1'&&JSON.parse(await pauseEvents()).notices==='1'&&JSON.parse(await pauseEvents()).audits==='1','Pause commits one receipt and administrator notification');
 check(await operational()===beforeOperational,'Pause does not close portals or change operational records');
 check((await db.pool.query("select count(*)from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Reviewed system wipe scope paused'")).rows[0].count==='5','Every current administrator receives pause status');
 for(const [sql,values]of[
  ['update public.stores set name=name||$2 where id=$1',[store,' ']],
  ["update public.account_contexts set status='suspended'where id=$1",[seller]],
  ['update public.profiles set display_name=display_name||$2 where id=$1',[people[1].id,' ']],
  ["insert into public.listings(store_id,kind,title,price,stock_quantity)values($1,'product',$2,1,1)",[store,people[1].name]],
  ["insert into public.media_assets(owner_context_id,owner_auth_user_id,purpose,object_path,byte_size,sha256)values($1,$2,'market',$3,1,$4)",[seller,people[1].id,`contexts/${seller}/${crypto.randomUUID()}.png`,crypto.createHash('sha256').update(people[1].name).digest('hex')]],
  ["insert into storage.objects(bucket_id,name)values($1,$2)",[bucket.id,`contexts/${seller}/${crypto.randomUUID()}.png`]],
  ['update storage.objects set name=$1 where id=(select id from storage.objects limit 1)',[`contexts/${seller}/${crypto.randomUUID()}.png`]],
 ]as const)await denied(()=>db.system(c=>c.query(sql,[...values])),409,'Native pause prevents updates, future dependent rows and selected object paths');
 await db.system(c=>c.query('update public.stores set name=name where id=$1',[store]));check(await operational()===beforeOperational,'Idempotent no-op remains harmless while paused');
 await denied(()=>db.system(c=>c.query('truncate public.stores cascade')),409,'Native truncate cannot bypass scope pause');
 await denied(()=>db.system(async c=>{await c.query('set transaction isolation level repeatable read');await c.query('update public.stores set name=name where id=$1',[store]);}),'42501','Unsupported snapshot isolation cannot miss a concurrent pause');
 await denied(()=>db.system(c=>recordSystemWipeRecovery(c,unpaused,projectRef)),409,'Actually restored pre-pause files cannot establish paused recovery');
 await denied(()=>consentReviewed(),409,'A paused scope alone does not establish verified recovery');
 stage='actual paused recovery and final consent';
 const pausedCheckpoint=checkpoint(),pausedStorage=await archive(pausedCheckpoint),pausedVerified=await verifySystemWipeRecoveryFiles(reviewed.id,pausedCheckpoint,pausedStorage);
 check(pausedVerified.preparation.pauseState==='frozen'&&pausedVerified.preparation.pausedAt,'Actual restored database includes the exact durable pause');
 await db.system(c=>recordSystemWipeRecovery(c,pausedVerified,projectRef));
 await denied(()=>consentReviewed(1),403,'Final consent is founder-only');
 await denied(()=>consentReviewed(0,{confirmation:'START WIPE BACKUP'}),400,'Backup confirmation does not authorize final consent');
 await denied(()=>consentReviewed(0,{confirmation:'AUTHORIZE REVIEWED WIPE',verified:true}),400,'Final consent rejects browser recovery assertions');
 const authCount=async()=>JSON.stringify((await db.pool.query(`select(select count(*)from private.system_wipe_execution_authorizations)as consents,(select count(*)from public.notifications where title='Founder final system wipe consent recorded')as notices,(select count(*)from private.audit_events where event_type='system_wipe_final_consent')as audits`)).rows[0]);
 const beforeConsent=await authCount();
 await denied(()=>run(admins[0],async c=>{await authorizeSystemWipeExecution(c,admins[0],grants[0],reviewed.id,{confirmation:'AUTHORIZE REVIEWED WIPE'});throw new ApiError(409,'Abort native final receipt');},true),409,'Receipt failure rolls back final consent, notices and audit');
 check(await authCount()===beforeConsent,'Failed final consent leaves no durable authorization');
 const consentOutcomes=await Promise.all([consentReviewed(),consentReviewed()]);check(consentOutcomes.filter(x=>x.noChange).length===1,'Concurrent final-consent retries do not extend the deadline or duplicate records');
 check(await authCount()===JSON.stringify({consents:'1',notices:'1',audits:'1'}),'Final consent commits exactly once');
 const authRow=(await db.pool.query('select to_jsonb(x)as authorization from private.system_wipe_execution_authorizations x')).rows[0].authorization;
 check(new Date(authRow.expires_at).getTime()-new Date(authRow.created_at).getTime()===300000,'Final consent lasts at most five minutes on the native clock');
 check(authRow.session_id===admins[0].sessionId&&authRow.auth_user_id===admins[0].authUserId&&authRow.approval_key_version===grants[0].version,'Final consent binds genuine founder session and actual key version');
 check((await db.pool.query('select private.system_wipe_execution_authorization_current(x)as current from private.system_wipe_execution_authorizations x')).rows[0].current,'Actual saved consent is current only after restored paused recovery');
 const changed=(patch:any)=>db.system(async c=>(await c.query("select private.system_wipe_execution_authorization_current(x)as current from jsonb_populate_record(null::private.system_wipe_execution_authorizations,$1) x",[JSON.stringify({...authRow,...patch})])).rows[0].current);
 for(const patch of[{approval_key_version:crypto.randomUUID()},{session_id:admins[1].sessionId},{auth_user_id:people[1].id},{scope_digest:'0'.repeat(64)},{native_catalog_digest:'0'.repeat(64)},{freeze_created_at:new Date(0).toISOString()},{expires_at:new Date(Date.now()+360000).toISOString()},{created_at:new Date(Date.now()-360000).toISOString(),expires_at:new Date(Date.now()-60000).toISOString()}])check(!await changed(patch),'Native final-consent validity rejects wrong key/session/scope/catalog/pause and actual past deadline');
 const projected=await run(admins[0],c=>systemWipeReviewStatus(c,admins[0])),actual=projected.find(x=>x.id===reviewed.id);
 check(actual?.preparation.pause.state==='frozen'&&actual?.preparation.finalConsent.current,'Administrator projection exposes actual pause and current final consent');
 check(!JSON.stringify(projected).includes(authRow.session_id)&&!JSON.stringify(projected).includes(authRow.approval_key_version)&&!JSON.stringify(projected).includes(pausedCheckpoint),'Projection does not expose sessions, key versions or archives');
 for(const role of['anon','authenticated','pinevela_backend'])for(const table of['system_wipe_freezes','system_wipe_execution_authorizations']){
  check(!(await db.pool.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')as allowed",[role,'private.'+table])).rows[0].allowed,'Pauses and final consent have no browser/scoped-backend grants');
  await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.'+table);}),'42501','Private consent/pause cannot be read directly');
 }
 for(const sql of['delete from private.system_wipe_freezes','truncate private.system_wipe_freezes cascade','update private.system_wipe_execution_authorizations set expires_at=expires_at+interval\'1 minute\'','delete from private.system_wipe_execution_authorizations','truncate private.system_wipe_execution_authorizations cascade'])await denied(()=>db.system(c=>c.query(sql)),'42501','Pause/final-consent history cannot be altered or removed');
 const freshConnection=new SupabaseDatabase(config);try{check((await freshConnection.pool.query("select count(*)from private.system_wipe_freezes where state='frozen'")).rows[0].count==='1','Pause survives reconnect independently of HTTP process memory');}finally{await freshConnection.close();}
 // Unrelated residence writes remain authorized, but the conservative review
 // revision invalidates this consent even if that write is later reversed.
 await db.system(c=>c.query('update public.residences set name=name||$2 where id=$1',[home,' ']));
 check(!(await db.pool.query('select private.system_wipe_execution_authorization_current(x)as current from private.system_wipe_execution_authorizations x')).rows[0].current,'Unrelated tracked changes invalidate final consent without opening paused writes');
 await db.system(c=>c.query('update public.residences set name=$2 where id=$1',[home,people[5].name]));
 await denied(()=>db.system(c=>c.query('update public.stores set name=name||$2 where id=$1',[store,' '])),409,'Outdated consent does not silently release its durable pause');
 await cancel(reviewed.id);check((await db.pool.query("select state from private.system_wipe_freezes where preparation_id=$1",[reviewedPrep.preparation.id])).rows[0].state==='cancelled','Founder preparation cancellation atomically releases scoped pause');
 await db.system(c=>c.query('update public.stores set name=name||$2 where id=$1',[store,' ']));await db.system(c=>c.query('update public.stores set name=$2 where id=$1',[store,people[1].name]));
 check(!(await db.pool.query('select private.system_wipe_execution_authorization_current(x)as current from private.system_wipe_execution_authorizations x')).rows[0].current,'Cancellation permanently invalidates final consent');
 check(await operational()===beforeOperational,'Pausing/recovery/consent/cancellation preserve all operational and Storage records');
 check(await authDigest()===beforeAuth,'Verified Auth identities and actual native sessions remain unchanged');
 const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});
 fs.writeFileSync('.security/migration-reset/system-wipe-pause-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native advisors complete');const findings=JSON.parse(advisor.stdout.toString());check(Array.isArray(findings.results||findings)&&(findings.results||findings).length===0,'Native advisors report zero security findings');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,actualNativeDumpsAndRestores:true,actualStorageObjects:verified.evidence.objects,actualStorageBytes:verified.evidence.bytes,cloudRecordsModified:0,cloudObjectsModified:0,authRecordsChanged:false,providerRepliesMocked:false,writerFreezeVerified:true,finalConsentVerified:true,executionImplemented:false};fs.writeFileSync('.security/migration-reset/system-wipe-pause-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
}finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/system-wipe-pause-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Isolated recovery verification failed; diagnostics saved privately.'}));process.exitCode=1;}
finally{for(const directory of storageDirectories)fs.rmSync(directory,{recursive:true,force:true});for(const file of checkpointFiles)fs.rmSync(file,{force:true});}
