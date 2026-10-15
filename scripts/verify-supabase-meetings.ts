/** Real PostgreSQL/RLS appointment checks on existing verified subjects.
 * Application fixtures, pending DDL and session bindings roll back. No provider
 * signup, fake Auth response, email, payment, imported account or production seed. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { createMeeting,updateMeeting,meetingRows,meetingParticipants,meetingSchedule } from '../supabase/meetings.js';
import { editStaff } from '../supabase/staff.js';
dotenv.config({quiet:true});
const db=new SupabaseDatabase(),c=await db.pool.connect();let checks=0;
const check=(v:unknown,label:string)=>{assert.ok(v,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'meeting_checks',checks}));};
try {
  await c.query('begin');
  const counts=async()=>(await c.query(`select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as users,
    (select count(*) from auth.sessions) as sessions,(select count(*) from public.meetings) as meetings,
    (select count(*) from private.audit_events) as audit,(select count(*) from public.notifications) as notifications`)).rows[0];
  const before=await counts();if(before.profiles!=='0')throw new Error('Run before operational profiles exist.');
  const ledger=new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for(const f of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql=fs.readFileSync(path.join('supabase/migrations',f),'utf8');
    if(ledger.has(f.slice(0,14)))assert.equal(ledger.get(f.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await c.query(sql);
  }
  const subjects=(await c.query(`select distinct on(u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after>now()) order by u.id,s.created_at desc limit 4`)).rows;
  if(subjects.length!==4)throw new Error('Four existing verified identities required.');
  const [root,other,child,otherChild]=subjects;
  for(const p of subjects)await c.query('insert into public.profiles(id,email,display_name) values ($1,$2,$3)',[p.id,p.email,p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || p.email]);
  for(const [r,ch] of [[root,child],[other,otherChild]])await c.query('update public.profiles set primary_owner_id=$1 where id=$2',[r.id,ch.id]);
  async function context(p:any,kind:string,owner?:any):Promise<VerifiedActor>{const id=(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,$3,'active') returning id",[p.id,owner?.id || null,kind])).rows[0].id;return {authUserId:p.id,sessionId:p.session_id,contextId:id,kind};}
  const primary=await context(root,'primary'),manager=await context(child,'manager',root),foreignManager=await context(otherChild,'manager',other),
    resident=await context(child,'resident',root),foreignResident=await context(otherChild,'resident',other),staff=await context(root,'staff'),foreignStaff=await context(other,'staff');
  async function home(r:any,m:VerifiedActor,res:VerifiedActor,s:VerifiedActor) {
    const id=(await c.query("insert into public.residences(primary_owner_id,name,status) values ($1,$2,'approved') returning id",[r.id,r.raw_user_meta_data?.full_name || r.email])).rows[0].id;
    await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[m.contextId,id]);
    const block=(await c.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id,name',[id,r.email])).rows[0];
    const floor=(await c.query('insert into public.floors(block_id,floor_number) values ($1,0) returning id',[block.id])).rows[0].id;
    const room=(await c.query("insert into public.rooms(floor_id,room_number) values ($1,'1') returning id",[floor])).rows[0].id;
    const bed=(await c.query('insert into public.beds(room_id,bed_number) values ($1,1) returning id',[room])).rows[0].id;
    const allocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3) returning id',[res.contextId,room,bed])).rows[0].id;
    const assignment=(await c.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id) values ($1,$2,$3,$4) returning id',[s.contextId,id,m.contextId,block.id])).rows[0].id;
    return {id,block,allocation,assignment};
  }
  const own=await home(root,manager,resident,staff),foreign=await home(other,foreignManager,foreignResident,foreignStaff);
  async function bind(a:VerifiedActor){await c.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
    on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);await claims(a);}
  async function claims(a:VerifiedActor){await c.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  async function scoped(a:VerifiedActor,work:()=>Promise<any>){await bind(a);await c.query('set local role pinevela_backend');try{return await work();}finally{await c.query('reset role');}}
  async function denied(work:()=>Promise<unknown>,status:number|string,label:string){await c.query('savepoint negative');let e:any;try{await work();}catch(err){e=err;}await c.query('rollback to savepoint negative');check(typeof status==='number'?e instanceof ApiError && e.status===status:e?.code===status,label);}
  const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10),yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);
  const input={hostelId:own.id,requesterType:'student',requesterContextId:resident.contextId,topic:'Appointment boundary verification',category:'General Consultation',date:tomorrow,timeSlot:'10:00 AM - 10:30 AM',mode:'In-Person (Admin Office)',notes:''};
  await denied(()=>createMeeting(c,primary,input),403,'Primary portal cannot book an internal housing appointment');
  await denied(()=>createMeeting(c,foreignManager,input),404,'Foreign manager cannot book in another residence');
  await denied(()=>createMeeting(c,manager,{...input,managerId:foreignManager.contextId}),400,'Submitted manager ownership cannot be trusted');
  await denied(()=>createMeeting(c,manager,{...input,requesterName:'Changed identity'}),400,'Internal participants cannot use supplied identity aliases');
  await denied(()=>createMeeting(c,manager,{...input,requesterContextId:foreignResident.contextId}),403,'Manager cannot invite a foreign resident');
  await denied(()=>createMeeting(c,manager,{...input,requesterType:'staff',requesterContextId:foreignStaff.contextId}),403,'Manager cannot invite foreign staff');
  await denied(()=>createMeeting(c,manager,{...input,requesterType:'staff',requesterContextId:resident.contextId}),403,'A client role label cannot change the participant portal');
  for(const [date,time] of [[tomorrow,'10:30 AM - 10:00 AM'],['2026-02-30','10:00 AM - 10:30 AM'],[tomorrow,'13:00 AM - 13:30 AM'],[tomorrow,'10:60 AM - 11:00 AM']])
    await denied(()=>createMeeting(c,manager,{...input,date,timeSlot:time}),400,'Invalid actual date or time rejected');
  check(meetingSchedule(tomorrow,'11:30 AM - 12:00 PM').ends.endsWith('12:00:00.000Z'),'Noon slot uses correct UTC instant');
  check(meetingSchedule(tomorrow,'12:00 AM - 12:30 AM').starts.endsWith('00:00:00.000Z'),'Midnight slot uses correct UTC instant');
  check((await scoped(manager,()=>meetingParticipants(c,own.id))).length===2,'Manager receives actual active resident and staff options');
  check((await scoped(manager,()=>meetingParticipants(c,foreign.id))).length===0,'Participant query cannot widen residence access');
  check((await scoped(staff,()=>meetingParticipants(c,own.id))).length===0,'Staff cannot enumerate appointment contacts');
  await bind(manager);const booked=await createMeeting(c,manager,input);
  check(booked.requesterId===resident.contextId && booked.hostelId===own.id && booked.managerId===manager.contextId,'Appointment uses saved participant, home and assigned manager');
  check(booked.requesterEmail===child.email && booked.requesterName===(child.raw_user_meta_data?.full_name || child.raw_user_meta_data?.name || child.email),'Contact snapshot comes from actual profile');
  check(booked.roomOrUnit==='1' && booked.status==='Pending','Actual allocated room and requested lifecycle project to existing UI');
  await denied(()=>c.query(`insert into public.meetings(residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes)
    select residence_id,$2,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes from public.meetings where id=$1`,[booked.id,foreignResident.contextId]),'23514','SQL cannot forge an appointment creator');
  await denied(()=>c.query(`insert into public.meetings(residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes)
    select residence_id,requested_by_context_id,manager_context_id,participant_context_id,$2,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes from public.meetings where id=$1`,[booked.id,foreign.allocation]),'23514','SQL rejects a foreign allocation even with a real participant ID');
  await denied(()=>c.query(`insert into public.meetings(residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes)
    select residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,requester_type,contact_name,$2,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes from public.meetings where id=$1`,[booked.id,other.email]),'23514','SQL internal contact snapshot must match saved identity');
  check((await scoped(manager,()=>meetingRows(c))).length===1,'Assigned manager can read appointment');
  check((await scoped(resident,()=>meetingRows(c))).length===1,'Exact resident participant can read appointment');
  for(const a of [primary,staff,foreignManager,foreignResident,foreignStaff])check((await scoped(a,()=>meetingRows(c))).length===0,'Other portal or residence cannot see the appointment');
  check((await scoped(staff,()=>c.query('select id from public.meetings'))).rowCount===0,'Raw RLS denies uninvited staff of the same residence');
  await c.query('set local role anon');await denied(()=>c.query('select * from private.housing_meeting_details'),'42501','No public appointment directory');await c.query('reset role');
  await c.query('set local role pinevela_backend');await denied(()=>c.query("update public.meetings set status='accepted' where id=$1",[booked.id]),'42501','Direct client role cannot bypass appointment lifecycle');await c.query('reset role');
  await denied(()=>c.query('update public.meetings set manager_context_id=$2 where id=$1',[booked.id,foreignManager.contextId]),'23514','Database cannot reassign appointment manager');
  await denied(()=>c.query('update public.meetings set contact_email=$2 where id=$1',[booked.id,other.email]),'23514','Database preserves original contact evidence');
  await denied(()=>updateMeeting(c,foreignManager,booked.id,{status:'Approved'}),404,'Foreign manager cannot decide appointment');
  await denied(()=>updateMeeting(c,staff,booked.id,{status:'Approved'}),404,'Uninvited same-residence staff cannot decide appointment');
  await denied(()=>updateMeeting(c,resident,booked.id,{status:'Approved'}),403,'Resident cannot approve their own appointment');
  await denied(()=>updateMeeting(c,resident,booked.id,{status:'Cancelled',managerResponseNotes:'Spoofed note'}),400,'Participant cannot write manager instructions');
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Completed'}),409,'Pending appointment cannot skip approval');
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Rejected'}),400,'Declining requires a real explanation');
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Approved',mode:'Google Meet / Video',meetingLinkOrVenue:'javascript:alert(1)'}),400,'Video meeting link cannot execute a script');
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Approved',mode:'Google Meet / Video'}),400,'Approval cannot fabricate a video URL');
  await bind(manager);const approved=await updateMeeting(c,manager,booked.id,{status:'Approved',managerResponseNotes:'Meeting accepted'});
  check(approved.status==='Approved' && approved.hostelName && approved.managerName,'Approval returns actual full dashboard projection');
  await denied(()=>c.query("update public.meetings set decided_at=decided_at+interval '1 second' where id=$1",[booked.id]),'23514','Database preserves original manager decision timestamp');
  const beforeRetry=await counts();const retry=await updateMeeting(c,manager,booked.id,{status:'Approved',managerResponseNotes:'Meeting accepted'});
  check(retry.idempotent && retry.hostelName===approved.hostelName && retry.managerName===approved.managerName,'Idempotent retry retains actual names and details');
  assert.deepEqual(await counts(),beforeRetry);checks++;
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Completed'}),409,'Future appointment cannot be marked completed');
  await bind(resident);const cancelled=await updateMeeting(c,resident,booked.id,{status:'Cancelled'});check(cancelled.status==='Cancelled','Actual participant can cancel their appointment');
  await denied(()=>updateMeeting(c,manager,booked.id,{status:'Approved'}),409,'Cancelled appointment cannot be reopened');
  await denied(()=>c.query("update public.meetings set status='requested' where id=$1",[booked.id]),'23514','Database rejects reopening a final appointment');
  await bind(manager);check((await updateMeeting(c,manager,booked.id,{},true)).success,'Manager removes finished appointment from current log');
  check((await scoped(manager,()=>meetingRows(c))).length===0,'Removed log entry is excluded from current dashboard');
  check((await c.query('select id from public.meetings where id=$1',[booked.id])).rowCount===1,'Removing log preserves historical record and foreign keys');
  check((await updateMeeting(c,manager,booked.id,{},true)).idempotent,'Log removal retry is idempotent');
  await denied(()=>c.query('update public.meetings set removed_at=null where id=$1',[booked.id]),'23514','Removed log cannot silently return');

  const contact={...input,requesterType:'external',requesterName:root.raw_user_meta_data?.full_name || root.raw_user_meta_data?.name || root.email,requesterEmail:root.email,requesterPhone:'',roomOrUnit:'',date:yesterday,timeSlot:'11:30 AM - 12:00 PM'};
  delete (contact as any).requesterContextId;
  await bind(manager);const external=await createMeeting(c,manager,contact);
  check(!external.requesterId && external.requesterEmail===root.email && !external.requesterPhone && !external.roomOrUnit,'External contact records actual entered details without fake identity, phone or room');
  check((await c.query('select participant_context_id,allocation_id,staff_assignment_id from public.meetings where id=$1',[external.id])).rows[0].participant_context_id===null,'Existing email cannot grant an external contact portal access');
  await denied(()=>createMeeting(c,manager,{...contact,requesterContextId:primary.contextId}),400,'External contact cannot attach a portal ID');
  await denied(()=>createMeeting(c,manager,{...contact,mode:'Phone Call'}),400,'Phone appointment needs actual contact phone');
  await updateMeeting(c,manager,external.id,{status:'Approved'});
  const completed=await updateMeeting(c,manager,external.id,{status:'Completed'});check(completed.status==='Completed','Manager can log and complete an actual past consultation');
  await denied(()=>updateMeeting(c,manager,external.id,{managerResponseNotes:'Rewritten'}),409,'Completed agenda evidence cannot be rewritten');
  await denied(()=>c.query('update public.meetings set response_notes=$2 where id=$1',[external.id,'Rewritten']),'23514','Database preserves final appointment evidence');

  const ownRequest={topic:input.topic,category:input.category,date:tomorrow,timeSlot:'12:00 AM - 12:30 AM',mode:input.mode,notes:''};
  await denied(()=>createMeeting(c,resident,{...ownRequest,hostelId:foreign.id}),403,'Resident cannot choose another residence');
  await denied(()=>createMeeting(c,staff,{...ownRequest,hostelId:foreign.id}),403,'Staff cannot choose another residence');
  await denied(()=>createMeeting(c,resident,{...ownRequest,requesterContextId:foreignResident.contextId}),400,'Resident request derives self identity');
  await denied(()=>createMeeting(c,resident,{...ownRequest,date:yesterday}),400,'Resident must request a future appointment');
  await bind(resident);const residentRequest=await createMeeting(c,resident,ownRequest);
  check(residentRequest.requesterId===resident.contextId && residentRequest.managerId===manager.contextId,'Resident request derives actual housing and saved manager');
  await bind(staff);const staffRequest=await createMeeting(c,staff,{...ownRequest,timeSlot:'10:00 AM - 10:30 AM'});
  check(staffRequest.requesterId===staff.contextId && staffRequest.requesterType==='staff','Staff request derives actual active employment');
  check((await scoped(staff,()=>meetingRows(c))).length===1,'Staff sees exact invitation, not all residence appointments');
  check((await scoped(primary,()=>meetingRows(c))).length===0,'Shared subject primary portal cannot inherit staff appointments');
  await bind(manager);const staffBooking=await createMeeting(c,manager,{...input,requesterType:'staff',requesterContextId:staff.contextId});
  check(staffBooking.requesterId===staff.contextId && staffBooking.requesterType==='staff','Manager can book for actual assigned staff');
  await c.query('savepoint released');await c.query('update public.allocations set ended_at=now() where id=$1',[own.allocation]);
  check((await scoped(resident,()=>meetingRows(c))).length===0,'Released resident loses appointment access');
  await denied(()=>createMeeting(c,resident,ownRequest),403,'Released resident cannot book');
  await denied(()=>updateMeeting(c,resident,residentRequest.id,{status:'Cancelled'}),404,'Released resident cannot modify historical appointment');await c.query('rollback to savepoint released');
  await c.query('savepoint approval_after_release');await c.query('update public.allocations set ended_at=now() where id=$1',[own.allocation]);
  await denied(()=>updateMeeting(c,manager,residentRequest.id,{status:'Approved'}),403,'Manager cannot approve a resident appointment after the original room is released');
  await denied(()=>c.query("update public.meetings set status='accepted',decided_at=now() where id=$1",[residentRequest.id]),'23514','SQL cannot approve after original allocation release');await c.query('rollback to savepoint approval_after_release');
  await c.query('savepoint suspended');await editStaff(c,manager,own.assignment,{status:'Suspended'});
  check((await scoped(staff,()=>meetingRows(c))).length===0,'Suspended staff loses appointment access');
  await denied(()=>createMeeting(c,manager,{...input,requesterType:'staff',requesterContextId:staff.contextId}),403,'Suspended staff cannot be selected');await c.query('rollback to savepoint suspended');
  await c.query('savepoint approval_after_suspension');await editStaff(c,manager,own.assignment,{status:'Suspended'});
  await denied(()=>updateMeeting(c,manager,staffRequest.id,{status:'Approved'}),403,'Manager cannot approve suspended staff appointment');
  await denied(()=>c.query("update public.meetings set status='accepted',decided_at=now() where id=$1",[staffRequest.id]),'23514','SQL cannot approve suspended staff appointment');await c.query('rollback to savepoint approval_after_suspension');
  await c.query('savepoint manager_ended');await c.query('update public.manager_assignments set ended_at=now() where manager_context_id=$1',[manager.contextId]);
  check((await scoped(manager,()=>meetingRows(c))).length===0,'Former manager loses appointment reads');
  check((await scoped(manager,()=>c.query('select id from public.meetings'))).rowCount===0,'Former manager loses raw appointment RLS');
  await denied(()=>updateMeeting(c,manager,staffRequest.id,{status:'Approved'}),404,'Former manager cannot decide appointment');await c.query('rollback to savepoint manager_ended');
  check((await c.query('select notification_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category=\'meeting\'',[manager.contextId])).rowCount!>0,'Saved manager receives appointment notices');
  check((await c.query('select notification_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where r.context_id=$1 and n.category=\'meeting\'',[resident.contextId])).rowCount!>0,'Exact resident receives lifecycle notices');
  check((await c.query('select notification_id from public.notification_recipients where context_id=$1',[primary.contextId])).rowCount===0,'Shared primary subject does not receive housing notices');
  await c.query('rollback');assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({checks,rolledBack:true,authUsersCreated:0,providerFlowTested:false,authenticatedHttpTested:false}));
} catch(error) {console.error(JSON.stringify({checks,failed:true,code:(error as any)?.code || undefined,message:error instanceof assert.AssertionError?error.message:undefined}));process.exitCode=1;}
finally {await c.query('rollback').catch(()=>undefined);c.release(true);await db.close();}
