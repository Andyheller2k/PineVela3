/** Isolated native closure-plan checks using real archived Google identities. */
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {hashCredentialAsync} from '../accountSecurity.js';
import {inspectSystemWipeClosure,planSystemWipeClosure} from './lib/system-wipe-closure-plan.js';
import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {systemWipePreview,proposeSystemWipe,voteSystemWipe,founderSystemWipeReview,startSystemWipePreparation,pauseSystemWipeScope,cancelSystemWipePreparation} from '../supabase/systemWipeReviews.js';
dotenv.config({quiet:true});const[checkpoint,applicationCheckpoint]=process.argv.slice(2);
if(process.argv.length!==4)throw Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let stage='restore',checks=0;const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;};
async function denied(work:()=>Promise<unknown>,code:number|string,label:string){let e:any;try{await work();}catch(error){e=error;}check(typeof code==='number'?e instanceof ApiError&&e.status===code:e?.code===code,label);}
try{await withIsolatedBackup(checkpoint,async config=>{const db=new SupabaseDatabase(config);try{
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
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()){
   const sql=fs.readFileSync('supabase/migrations/'+file,'utf8'),version=file.slice(0,14),digest=crypto.createHash('sha256').update(sql).digest('hex');
   if(ledger.has(version))assert.equal(ledger.get(version),digest);else{await c.query(sql);await c.query('insert into private.schema_migrations(version,digest)values($1,$2)',[version,digest]);}
  }
  return{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken};
 });

 const{people,admins,keys,settings,owners,manager,home,room,store,resident,seller,staff,allocation,pastResident,pastAllocation,pastIssue,formerHome,formerAllocation,formerStaffAssignment,meetingIds,staffBargain,key,pendingMarketEnrollment,pendingMarketToken}=fixture;
 stage='read-only plans';
 const snapshot=async()=>{const c=await db.pool.connect();try{
  const tables=(await c.query("select schemaname,tablename from pg_tables where schemaname in('public','private','auth','storage')order by schemaname,tablename")).rows;
  const pieces=[];for(const t of tables){const q=(s:string)=>'"'+s.replaceAll('"','""')+'"';pieces.push([t.schemaname,t.tablename,(await c.query(`select md5(coalesce(string_agg(to_jsonb(t)::text,'|'order by to_jsonb(t)::text),''))as d from ${q(t.schemaname)}.${q(t.tablename)} t`)).rows[0].d]);}return crypto.createHash('sha256').update(JSON.stringify(pieces)).digest('hex');
 }finally{c.release();}};
 const baseline=await snapshot();
 const total=await planSystemWipeClosure(db,['total']);
 const effect=(plan:typeof total,table:string)=>plan.effects.find(e=>e.table===table)?.ids||[];
 check(total.executionAvailable===false&&total.authorizesMutation===false,'Planner cannot authorize execution');
 check(effect(total,'public.account_contexts').includes(resident)&&effect(total,'public.account_contexts').includes(seller)&&effect(total,'public.account_contexts').includes(manager.contextId),'Total closure includes actual owned portals');
 check(admins.every(a=>!effect(total,'public.account_contexts').includes(a.contextId)),'All administrator portals excluded despite shared primary identities');
 check(total.blockers.some(b=>b.code==='operational_scope_closure_required'),'Mixed operational scope is not supported by primary-only executor');
 check(total.sellerReentryImplemented&&total.blockers.some(b=>b.code==='seller_scope_closure_required'),'Seller re-entry is implemented but operational closure remains gated');
 check(total.constraints.some(r=>r.table_name==='public.account_contexts'&&r.definition.includes("'primary'")),'Actual native primary check is inspected');
 check(total.constraints.some(r=>r.table_name==='public.stores'&&r.definition==='UNIQUE (seller_context_id, registration_generation)'),'Actual store-per-generation constraint is inspected');
 check(total.retained.authIdentities&&total.retained.nativeAuthSessions&&total.retained.storageBytes&&total.retained.payments&&total.retained.reviews,'Verified login, finance, review and Storage history retained');
 check(total.effects.every(e=>e.historyRetained)&&!total.effects.some(e=>/^(auth|storage)\./.test(e.table)),'No Auth/Storage mutation or physical row deletion planned');
 check(total.applicationBindingsToRevoke.every(b=>!admins.some(a=>a.contextId===b.context_id)),'Administrator application sessions protected');
 check(total.applicationBindingsToRevoke.some(b=>b.context_id===manager.contextId&&b.count===1),'Only affected app bindings identified');
 const encoded=JSON.stringify(total);check([...keys,...settings,...people.map(p=>p.session_id)].every(secret=>!encoded.includes(secret)),'No admin keys or native session identifiers exported');
 const again=await planSystemWipeClosure(db,['total']);check(total.planDigest===again.planDigest,'Unchanged native snapshots produce a stable plan digest');
 const residentOnly=await planSystemWipeClosure(db,['residents']);
 check(effect(residentOnly,'public.account_contexts').includes(resident)&&!effect(residentOnly,'public.account_contexts').includes(seller),'Shared student mailbox does not close seller with resident');
 check(effect(residentOnly,'public.residences').length===0&&effect(residentOnly,'public.stores').length===0,'Resident-only closure retains residence and store');
 check(effect(residentOnly,'public.allocations').length===1&&effect(residentOnly,'public.staff_assignments').length===0,'Resident-only closure releases only its room allocation');
 check(effect(residentOnly,'public.allocations').includes(allocation)&&!effect(residentOnly,'public.allocations').includes(pastAllocation),'A historical sibling allocation is retained without another allocation-ending effect');
 check(!effect(residentOnly,'public.account_contexts').includes(pastResident),'Previously closed resident history is not reopened or retargeted');
 check(!effect(residentOnly,'public.maintenance_issues').includes(pastIssue),'A previous occupant report is not closed merely because its room appears in the selected resident review');
 check(!effect(residentOnly,'private.room_activation_keys').includes(key),'Resident portal closure does not revoke an unclaimed key solely because its physical room is reviewed');
 const market=await planSystemWipeClosure(db,['markets']);
 check(effect(market,'public.stores').includes(store)&&effect(market,'public.account_contexts').includes(seller),'Market scope includes linked store and seller');
 check(!effect(market,'public.account_contexts').includes(resident)&&effect(market,'public.allocations').length===0,'Market scope preserves shared-identity resident and housing');
 check(market.retained.resourceIds.account_enrollments.includes(pendingMarketEnrollment),'An unlinked pending seller invitation without a store is included in the market review');
 check(market.blockers.some(b=>b.code==='active_email_verification'&&b.ids?.includes(pendingMarketEnrollment)),'Unfinished verified-email seller signup blocks market preparation');
 check(!JSON.stringify(market).includes(pendingMarketToken),'A sealed pending invitation is reviewed without exposing its token digest');
 const housing=await planSystemWipeClosure(db,['hostels']);
 check(effect(housing,'public.residences').includes(home)&&effect(housing,'public.account_contexts').includes(resident)&&effect(housing,'public.account_contexts').includes(staff),'Residence closure resolves resident and staff relationships');
 check(!effect(housing,'public.account_contexts').includes(manager.contextId)&&!effect(housing,'public.account_contexts').includes(seller),'Residence-only closure retains manager/seller portals');
 check(effect(housing,'public.manager_assignments').length===1&&effect(housing,'public.staff_assignments').length===1,'Residence closure ends assignments while retaining rows');
 const managers=await planSystemWipeClosure(db,['managers']);check(effect(managers,'public.account_contexts').includes(manager.contextId)&&effect(managers,'public.residences').includes(home),'Manager scope follows saved assignments');
 check(!effect(managers,'public.residences').includes(formerHome),'A former assigned residence remains outside the manager closure effects');
 check(meetingIds.every(id=>managers.retained.resourceIds.meetings.includes(id)),'All external, resident and staff appointments follow the saved manager/requester even after housing relationships end');
 check(meetingIds.every(id=>effect(managers,'public.meetings').includes(id)),'Pending appointments at an unaffected former residence are explicitly reviewed for cancellation');
 check(!managers.blockers.some(b=>b.code==='unreviewed_meeting_dependencies'),'The exact native review captures every saved appointment relationship');
 check(effect(managers,'public.staff_bargains').includes(staffBargain),'Declined unresolved retention decision is included in cancellation side effects');
 const users=await planSystemWipeClosure(db,['users']);check(owners.every(id=>effect(users,'public.account_contexts').includes(id))&&effect(users,'public.stores').includes(store),'Primary scope follows saved owned store relationship');
 const combined=await planSystemWipeClosure(db,['residents','markets']);check(combined.scopes.join(',')==='markets,residents','Scope combinations canonicalized');
 check(combined.effects.every(e=>new Set(e.ids).size===e.ids.length),'Overlapping scopes never duplicate effects');
 for(const scopes of[[],['total','users'],['residents','residents'],['admin'],['markets);delete from auth.users;--']])await denied(()=>planSystemWipeClosure(db,scopes),400,'Unsupported or injected scope rejected');
 await denied(()=>planSystemWipeClosure(db,['total'],crypto.randomUUID()),409,'Unknown review cannot establish authority');
 await denied(()=>db.system(c=>inspectSystemWipeClosure(c,['total'])),409,'Read-write transactions cannot run the planner');
 const c=await db.pool.connect();try{
  await c.query('begin isolation level repeatable read read only');await c.query('set local role pinevela_backend');
  await denied(()=>inspectSystemWipeClosure(c,['total']),409,'Scoped backend cannot use operator planner');await c.query('rollback');
  await c.query('begin isolation level repeatable read read only');await inspectSystemWipeClosure(c,['total']);
  await denied(()=>c.query("update public.residences set name=name where id=$1",[home]),'25006','Native read-only transaction prohibits accidental writes');await c.query('rollback');
 }finally{c.release();}
 check(await snapshot()===baseline,'All public/private/Auth/Storage tables unchanged after planning and denials');
 stage='exact saved review';const a=admins[1];const run=<T>(work:(c:any)=>Promise<T>)=>db.authorizedSystem(a,['admin'],work,false,false,true);
 const g=await run(c=>checkApprovalKey(c,a,keys[1]));deniedApprovalKey(g);
 const preview=await run(c=>systemWipePreview(c,a,['markets']));
 const proposal=await run(c=>proposeSystemWipe(c,a,g,{scopes:['markets'],reason:people[1].name,fingerprint:preview.fingerprint}));
 const reviewed=await planSystemWipeClosure(db,['markets'],proposal.id);
 check(reviewed.review?.id===proposal.id&&!reviewed.review.quorum&&reviewed.review.status==='pending','Saved pending proposal is identified without treating it as consent');
 await denied(()=>planSystemWipeClosure(db,['residents'],proposal.id),409,'A proposal cannot authorize different requested scope');
 await db.system(c=>c.query('update public.residences set name=$2 where id=$1',[home,people[0].name]));
 await denied(()=>planSystemWipeClosure(db,['markets'],proposal.id),409,'Tracked changes invalidate saved scope even when unrelated');
 const fresh=await planSystemWipeClosure(db,['markets']);check(fresh.planDigest!==market.planDigest,'Domain revision changes alter the plan digest');
 stage='native reviewed pause';
 const runAdmin=<T>(i:number,work:(c:any)=>Promise<T>,exclusive=false)=>db.authorizedSystem(admins[i],['admin'],work,false,false,exclusive);
 const grants=[];for(let i=0;i<5;i++){const grant=await runAdmin(i,c=>checkApprovalKey(c,admins[i],keys[i]));deniedApprovalKey(grant);grants.push(grant);}
 const current=await runAdmin(1,c=>systemWipePreview(c,admins[1],['managers']));
 const pauseProposal=await runAdmin(1,c=>proposeSystemWipe(c,admins[1],grants[1],{scopes:['managers'],reason:people[1].name,fingerprint:current.fingerprint}),true);
 for(const i of[2,3,4,0])await runAdmin(i,c=>voteSystemWipe(c,admins[i],grants[i],pauseProposal.id,'approved'),true);
 await runAdmin(0,c=>founderSystemWipeReview(c,admins[0],grants[0],pauseProposal.id,{decision:'approve-backup',reason:people[0].name,confirmation:'APPROVE WIPE BACKUP'}),true);
 await runAdmin(0,c=>startSystemWipePreparation(c,admins[0],grants[0],pauseProposal.id,{confirmation:'START WIPE BACKUP'}),true);
 const paused=await runAdmin(0,c=>pauseSystemWipeScope(c,admins[0],grants[0],pauseProposal.id,{confirmation:'PAUSE REVIEWED WIPE'}),true);
 check(paused.success&&paused.executionAvailable===false,'Five actual local own-key approvals and current founder consent establish a non-destructive exact native write pause');
 for(const [field,context] of [['requested_by_context_id',manager.contextId],['manager_context_id',manager.contextId],['participant_context_id',staff]]){
  const isPaused=(await db.pool.query("select private.system_wipe_row_paused('public','meetings','{}'::jsonb,jsonb_build_object($1::text,$2::text))as paused",[field,context])).rows[0].paused;
  check(isPaused,'Native pause maps the saved appointment '+field+' edge');
 }
 check(!(await db.pool.query("select private.system_wipe_row_paused('public','meetings','{}'::jsonb,jsonb_build_object('participant_context_id',$1::text))as paused",[admins[0].contextId])).rows[0].paused,'A retained administrator portal is not frozen through an unrelated appointment participant selector');
 for(const id of meetingIds)await denied(()=>db.system(c=>c.query('update public.meetings set response_notes=$2 where id=$1',[id,people[0].name])),409,'Actual historical external/resident/staff appointment writes are paused');
 await denied(()=>db.system(c=>c.query('update public.staff_bargains set updated_at=clock_timestamp()where id=$1',[staffBargain])),409,'Declined retention history is frozen with its reviewed employment');
 await runAdmin(0,c=>cancelSystemWipePreparation(c,admins[0],grants[0],pauseProposal.id,{reason:people[0].name}),true);
 await db.system(c=>c.query('update public.meetings set response_notes=$2 where id=$1',[meetingIds[0],people[0].name]));
 check((await db.pool.query('select response_notes from public.meetings where id=$1',[meetingIds[0]])).rows[0].response_notes===people[0].name,'Cancelling the native reviewed pause permits ordinary appointment updates');
 check(await authDigest()===beforeAuth,'Actual archived Google identities and native Auth sessions remain unchanged');
 const latestMigration=(await db.pool.query('select version,digest from private.schema_migrations order by version desc limit 1')).rows[0];
 const latestFile=fs.readdirSync('supabase/migrations').find(name=>name.startsWith(latestMigration.version+'_'));
 check(!!latestFile&&crypto.createHash('sha256').update(fs.readFileSync('supabase/migrations/'+latestFile)).digest('hex')===latestMigration.digest,'Tested latest migration still matches its exact SQL file');
 const report={passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,cloudWrites:false,providerRepliesMocked:false,executionAvailable:false,latestMigration};
 fs.writeFileSync('.security/migration-reset/system-wipe-closure-plan-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));
 }finally{await db.close();}},{applicationCheckpoint});}catch(e:any){fs.writeFileSync('.security/migration-reset/system-wipe-closure-plan-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native verification failed; private diagnostics saved.'}));process.exitCode=1;}
