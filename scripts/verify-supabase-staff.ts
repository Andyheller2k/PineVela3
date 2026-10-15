/** Actual PostgreSQL staff enrollment/lifecycle and RLS, using existing verified
 * subjects only. All application fixtures, migration DDL and bindings roll back.
 * No provider mocks, signup, outgoing email or Auth-user modification. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { reserveStaffInvitation,staffInvitation,finishStaffInvitation,editStaff,editStaffProfile,rotateStaffInvitation,cancelStaffInvitation } from '../supabase/staff.js';
import { housingDashboardRows } from '../supabase/dashboardReads.js';
import { createIssue,actOnIssue } from '../supabase/maintenance.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'staff_checks',checks}));};
console.log(JSON.stringify({phase:'connecting'}));
try {
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as users,
    (select count(*) from private.account_enrollments) as enrollments,(select count(*) from public.staff_assignments) as staff`)).rows[0];
  const before=await counts();if(before.profiles!=='0')throw new Error('Run before operational profiles exist.');
  const applied=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');
    if(applied.has(file.slice(0,14)))assert.equal(applied.get(file.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
  }
  const subjects=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
  if(subjects.length!==4)throw new Error('Four existing verified identities required.');
  const [owner,other,worker,staffUser]=subjects;
  for(const p of subjects.slice(0,3))await c.query('insert into public.profiles(id,email,display_name) values ($1,$2,$3)',[p.id,p.email,p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || '']);
  await c.query('update public.profiles set primary_owner_id=$1 where id=$2',[owner.id,worker.id]);
  async function context(p:any,kind:string,root?:any):Promise<VerifiedActor>{const id=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,$3,'active') returning id",[p.id,root?.id || null,kind])).rows[0].id;return {authUserId:p.id,sessionId:p.session_id,contextId:id,kind};}
  const primary=await context(owner,'primary'),foreignPrimary=await context(other,'primary'),manager=await context(worker,'manager',owner);
  const home=(await c.query("insert into public.residences(primary_owner_id,name,status) values ($1,$2,'approved') returning id",[owner.id,owner.raw_user_meta_data?.full_name || owner.email])).rows[0].id;
  const foreign=(await c.query("insert into public.residences(primary_owner_id,name,status) values ($1,$2,'approved') returning id",[other.id,other.raw_user_meta_data?.full_name || other.email])).rows[0].id;
  await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[manager.contextId,home]);
  const block=(await c.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id',[home,owner.raw_user_meta_data?.full_name || owner.email])).rows[0];
  const foreignBlock=(await c.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id',[foreign,other.raw_user_meta_data?.full_name || other.email])).rows[0];
  let token=crypto.randomBytes(32).toString('hex');
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string){await c.query('savepoint denied');let e:any;try{await work();}catch(error){e=error;}await c.query('rollback to savepoint denied');check(typeof expected==='number'?e instanceof ApiError && e.status===expected:e?.code===expected,label);}
  const input={hostelId:home,name:staffUser.raw_user_meta_data?.full_name || staffUser.email,phone:staffUser.raw_user_meta_data?.phone || '',email:staffUser.email};
  await denied(()=>reserveStaffInvitation(c,primary,input,token),403,'Primary owners cannot invite staff');
  await denied(()=>reserveStaffInvitation(c,{...foreignPrimary,kind:'manager'},{...input,hostelId:foreign},token),404,'A client role label cannot establish a residence assignment');
  await denied(()=>reserveStaffInvitation(c,manager,{...input,hostelId:foreign},token),404,'Manager cannot create staff for an unassigned residence');
  await denied(()=>reserveStaffInvitation(c,manager,input,token),403,'Physical approval without reviewed setup does not permit staff creation');
  await c.query('update public.residences set setup_submitted_at=now() where id=$1',[home]);
  await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values ($1,$2,'residence_registration','approved')",[manager.contextId,home]);
  await denied(()=>reserveStaffInvitation(c,manager,{...input,phone:input.phone || '+233241234567',password:'manager-set'},token),400,'Managers cannot choose staff login credentials');
  await denied(()=>reserveStaffInvitation(c,manager,{...input,phone:input.phone || '+233241234567'},token),409,'Existing Auth email cannot be adopted as manager-owned staff');
  await denied(()=>reserveStaffInvitation(c,manager,{...input,phone:input.phone || '+233241234567',assignedBlock:other.raw_user_meta_data?.full_name || other.email},token),400,'Foreign block cannot be assigned by name');
  // Existing provider identity tests the private initializer without creating,
  // altering or pretending to verify an Auth user. Reservation is a rollback fixture.
  const id=(await c.query(`insert into private.account_enrollments(initiator_context_id,kind,invited_email,token_digest,residence_id,enrollment_fields,expires_at)
    values ($1,'staff',$2,$3,$4,$5,now()+interval '24 hours') returning id`,[manager.contextId,staffUser.email.toLowerCase(),crypto.createHash('sha256').update(token).digest('hex'),home,JSON.stringify({displayName:input.name,phone:input.phone,role:'',shift:'',assignedBlockId:block.id})])).rows[0].id;
  check((await staffInvitation(c,token)).id===id,'Saved manager invitation is scoped to reviewed residence');
  check((await c.query('select token_digest from private.account_enrollments where id=$1',[id])).rows[0].token_digest!==token,'Invitation secret is stored only as a SHA-256 digest');
  await c.query('savepoint expired');await c.query("update private.account_enrollments set created_at=created_at-interval '2 days',expires_at=clock_timestamp()-interval '1 day' where id=$1",[id]);
  await denied(()=>staffInvitation(c,token),404,'Expired invitation cannot inspect or activate staff');await c.query('rollback to savepoint expired');
  await c.query('savepoint cancelled');await c.query("update private.account_enrollments set status='cancelled' where id=$1",[id]);
  await denied(()=>staffInvitation(c,token),404,'Cancelled invitation cannot grant staff access');await c.query('rollback to savepoint cancelled');
  await denied(()=>staffInvitation(c,crypto.randomBytes(32).toString('hex')),404,'Wrong invitation token cannot read invited staff details');
  await denied(()=>c.query('select private.initialize_auth_profile($1,$2)',[staffUser.id,crypto.randomBytes(32).toString('hex')]),'23514','Wrong enrollment nonce cannot bind a staff identity');
  await c.query('savepoint inactive_manager');await c.query("update public.account_contexts set status='suspended' where id=$1",[manager.contextId]);
  await denied(()=>staffInvitation(c,token),404,'Suspended manager invalidates invitation');
  await denied(()=>c.query('select private.initialize_auth_profile($1,$2)',[staffUser.id,token]),'23514','Provider initializer rejects a revoked manager');await c.query('rollback to savepoint inactive_manager');
  await denied(()=>rotateStaffInvitation(c,foreignPrimary,id,crypto.randomBytes(32).toString('hex')),404,'Other account cannot renew manager invitation');
  const previousToken=token;token=crypto.randomBytes(32).toString('hex');await rotateStaffInvitation(c,manager,id,token);
  await denied(()=>staffInvitation(c,previousToken),404,'Renewing invitation revokes previous link');
  await denied(()=>c.query('select private.initialize_auth_profile($1,$2)',[staffUser.id,previousToken]),'23514','Old invitation nonce cannot bind a provider subject');
  await c.query('select private.initialize_auth_profile($1,$2)',[staffUser.id,token]);
  const e=(await c.query('select * from private.account_enrollments where id=$1',[id])).rows[0];
  const staff:VerifiedActor={authUserId:staffUser.id,sessionId:staffUser.session_id,contextId:e.linked_context_id,kind:'staff'};
  check(e.auth_user_id===staffUser.id,'Nonce-bound Auth subject is saved');
  await c.query('savepoint cancel_bound');await cancelStaffInvitation(c,manager,id);
  check((await c.query('select status from public.account_contexts where id=$1',[staff.contextId])).rows[0].status==='closed','Cancelling a started signup closes its pending portal');
  await denied(()=>finishStaffInvitation(c,token,{authUserId:staffUser.id,sessionId:staffUser.session_id,email:staffUser.email.toLowerCase()}),404,'Cancelled signup cannot be activated after email verification');
  await c.query('rollback to savepoint cancel_bound');

  check((await c.query('select status from public.account_contexts where id=$1',[staff.contextId])).rows[0].status==='pending','Unfinished invitation does not grant staff access');
  await denied(()=>finishStaffInvitation(c,token,{authUserId:other.id,sessionId:other.session_id,email:staffUser.email.toLowerCase()}),403,'Matching email input cannot impersonate the invited subject');
  await denied(()=>finishStaffInvitation(c,token,{authUserId:staffUser.id,sessionId:other.session_id,email:staffUser.email.toLowerCase()}),403,'Foreign Auth session cannot confirm staff');
  await denied(()=>finishStaffInvitation(c,token,{authUserId:staffUser.id,sessionId:staffUser.session_id,email:other.email.toLowerCase()}),403,'Wrong verified mailbox cannot accept invitation');
  const result=await finishStaffInvitation(c,token,{authUserId:staffUser.id,sessionId:staffUser.session_id,email:staffUser.email.toLowerCase()});
  check(result.success && result.requiresSeparateLogin,'Verified staff activates without switching manager session');
  const assignment=(await c.query('select * from public.staff_assignments where id=$1',[result.staffId])).rows[0];
  check(assignment.created_by_manager_id===manager.contextId && assignment.residence_id===home && assignment.assigned_block_id===block.id,'Employment uses immutable invited manager/residence/block');
  check((await c.query('select verified_at,status from private.account_enrollments where id=$1',[id])).rows[0].status==='completed','Invitation completes after live verified session proof');
  await denied(()=>finishStaffInvitation(c,token,{authUserId:staffUser.id,sessionId:staffUser.session_id,email:staffUser.email.toLowerCase()}),404,'Completed invitation is single-use');
  async function bind(a:VerifiedActor){await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
    on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);await claims(a);}
  async function claims(a:VerifiedActor){await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  async function scoped(a:VerifiedActor,work:()=>Promise<any>){await bind(a);await c.query('set local role pinevela_backend');try{return await work();}finally{await c.query('reset role');}}
  check((await scoped(manager,()=>housingDashboardRows(c,'staff'))).length===1,'Assigned manager sees staff roster');
  check((await scoped(staff,()=>housingDashboardRows(c,'staff'))).length===1,'Staff sees own saved assignment');
  check((await scoped(foreignPrimary,()=>housingDashboardRows(c,'staff'))).length===0,'Unrelated primary cannot read staff directory');
  await c.query('set local role anon');await denied(()=>c.query('select * from private.housing_staff_directory'),'42501','No public staff directory');await c.query('reset role');
  await c.query('set local role pinevela_backend');await denied(()=>c.query('select * from private.account_enrollments'),'42501','Direct backend/browser role cannot read private invitation tokens');
  await denied(()=>c.query('update public.staff_assignments set status=$2 where id=$1',[result.staffId,'removed']),'42501','Direct role cannot bypass staff lifecycle');await c.query('reset role');
  await denied(()=>editStaff(c,foreignPrimary,result.staffId,{status:'Active'}),403,'Primary cannot edit staff');
  await denied(()=>editStaff(c,{...foreignPrimary,kind:'manager'},result.staffId,{status:'Suspended'}),404,'Foreign manager cannot suspend staff');
  await denied(()=>editStaff(c,manager,result.staffId,{email:other.email}),400,'Manager cannot mutate staff email ownership');
  await denied(()=>editStaffProfile(c,manager,{name:input.name}),403,'Manager cannot call staff self-profile API');
  await denied(()=>editStaffProfile(c,staff,{email:other.email}),400,'Staff cannot replace verified mailbox through profile fields');
  await denied(()=>editStaffProfile(c,staff,{userId:other.id}),400,'Staff cannot spoof profile subject');
  await editStaffProfile(c,staff,{name:input.name});
  check((await c.query('select display_name,email from public.profiles where id=$1',[staff.authUserId])).rows[0].display_name===input.name,'Staff can edit own contact profile without changing login identity');
  await denied(()=>editStaff(c,manager,result.staffId,{status:'admin'}),400,'Employment status cannot promote role');
  await denied(()=>c.query('update public.staff_assignments set residence_id=$2 where id=$1',[result.staffId,foreign]),'23514','SQL cannot change historical employment residence');
  await denied(()=>c.query('update public.staff_assignments set assigned_block_id=$2 where id=$1',[result.staffId,foreignBlock.id]),'23514','SQL rejects foreign block');
  await bind(manager);const issue=await createIssue(c,manager,{title:'Staff lifecycle verification',hostelId:home});await actOnIssue(c,manager,issue.id,'assign',{staffId:result.staffId});
  await bind(staff);await actOnIssue(c,staff,issue.id,'accept-assignment',{});await actOnIssue(c,staff,issue.id,'staff-complete',{completionNotes:'Facility work completed for lifecycle verification'});
  await editStaff(c,manager,result.staffId,{status:'Suspended'});await claims(staff);
  check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Suspended staff immediately loses SQL/RLS context');
  check((await c.query('select session_id from private.account_sessions where active_context_id=$1',[staff.contextId])).rowCount===0,'Suspension revokes saved portal bindings');
  await editStaff(c,manager,result.staffId,{status:'Active',shift:'',assignedBlock:'All Blocks'});
  await claims(staff);check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Restoration does not revive old portal bindings');
  await bind(staff);check((await c.query('select private.current_context_id() as id')).rows[0].id===staff.contextId,'Restored staff can establish a fresh verified binding');
  await denied(()=>editStaff(c,staff,result.staffId,{reason:'No'},'resigned'),400,'Resignation requires actual reason');
  await denied(()=>editStaff(c,staff,result.staffId,{reason:'Employment ending',role:'Changed role'},'resigned'),400,'Staff cannot modify employment fields through resignation');
  await denied(()=>editStaff(c,foreignPrimary,result.staffId,{reason:'Employment ending'},'resigned'),403,'Others cannot resign on behalf of staff');
  await c.query('savepoint remove');await editStaff(c,manager,result.staffId,{},'removed');
  check((await c.query('select status,ended_at from public.staff_assignments where id=$1',[result.staffId])).rows[0].status==='removed','Removal ends employment without deleting row');
  check((await c.query('select assigned_staff_id from public.maintenance_issues where id=$1',[issue.id])).rows[0].assigned_staff_id===result.staffId,'Removal retains assigned repair history');
  await claims(staff);check((await c.query('select private.current_context_id() as id')).rows[0].id===null,'Removed staff loses account access immediately');
  await denied(()=>editStaff(c,manager,result.staffId,{status:'Active'}),409,'Removed employment cannot be reopened');
  await denied(()=>c.query("update public.staff_assignments set status='active',ended_at=null where id=$1",[result.staffId]),'23514','Database rejects reopening historical employment');
  await bind(manager);await actOnIssue(c,manager,issue.id,'manager-close',{});check((await c.query('select status from public.maintenance_issues where id=$1',[issue.id])).rows[0].status==='closed','Historical removed assignee does not block manager closure of completed facility work');
  await c.query('rollback to savepoint remove');
  await bind(staff);await editStaff(c,staff,result.staffId,{reason:'Employment lifecycle verification'},'resigned');
  const ended=(await c.query('select status,end_reason,ended_at from public.staff_assignments where id=$1',[result.staffId])).rows[0];
  check(ended.status==='resigned' && ended.ended_at && ended.end_reason==='Employment lifecycle verification','Staff self-resignation saves actual reason and end time');
  check((await c.query('select status from public.account_contexts where id=$1',[staff.contextId])).rows[0].status==='closed','Resignation closes staff portal context');
  check((await c.query('select count(*) from auth.users')).rows[0].count===before.users,'Ending employment never deletes Auth identity');
  check((await scoped(manager,()=>housingDashboardRows(c,'staff'))).length===0,'Ended staff is excluded from current roster');
  check((await c.query('select notification_id from public.notification_recipients where context_id=$1',[manager.contextId])).rowCount!>0,'Saved manager receives workflow notifications');
  check((await c.query('select notification_id from public.notification_recipients where context_id=$1',[primary.contextId])).rowCount===0,'Parent portal cannot receive unrelated staff notices');
  await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,rolledBack:true,authUsersCreated:0,providerFlowTested:false,newMailboxReservationTested:false}));
} finally {await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
