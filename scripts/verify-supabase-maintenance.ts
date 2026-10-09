/** Actual PostgreSQL workflow/RLS checks on existing verified Auth subjects.
 * Temporary domain rows and pending migrations roll back; no signup or email. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import { createIssue,actOnIssue,residentRoom,editIssue } from '../supabase/maintenance.js';
import { reserveMedia,finishMedia,mediaUrl,canUploadMedia } from '../supabase/media.js';
import { normalizeRasterImage } from '../imageUploadSecurity.js';
import { SupabaseStorage } from '../supabase/storage.js';
dotenv.config({quiet:true});
console.log(JSON.stringify({phase:'connecting'}));
const db=new SupabaseDatabase(),client=await db.pool.connect(),storage=new SupabaseStorage();let checks=0,objectPath:string|undefined,storageRoundTrip=false;
const check=(value:unknown,label:string)=>{assert.ok(value,label);checks++;if(checks%20===0)console.log(JSON.stringify({phase:'workflow_checks',checks}));};
try {
  console.log(JSON.stringify({phase:'connected'}));
  await client.query('begin');
  const baseline=(await client.query(`select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as auth_users,
    (select count(*) from storage.objects) as objects`)).rows[0];
  const ledger=new Map((await client.query('select version,digest from private.schema_migrations')).rows.map(r=>[r.version,r.digest]));
  for (const file of fs.readdirSync('supabase/migrations').filter(f=>/^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql=fs.readFileSync(path.join('supabase/migrations',file),'utf8');
    if (ledger.has(file.slice(0,14))) assert.equal(ledger.get(file.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));else await client.query(sql);
  }
  const subjects=(await client.query(`select distinct on (u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u join auth.sessions s on s.user_id=u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after > now()) order by u.id,s.created_at desc limit 4`)).rows;
  if (subjects.length!==4 || baseline.profiles!=='0') throw new Error('Use four existing verified Auth subjects before operational profiles exist.');
  const [root1,root2,child1,child2]=subjects;
  for (const p of subjects) await client.query('insert into public.profiles(id,email,display_name) values ($1,$2,$3)',[p.id,p.email,p.raw_user_meta_data?.full_name || p.raw_user_meta_data?.name || '']);
  for (const [root,child] of [[root1,child1],[root2,child2]]) await client.query('update public.profiles set primary_owner_id=$1 where id=$2',[root.id,child.id]);
  async function context(p:any,kind:string,owner?:any):Promise<VerifiedActor> {
    const id=(await client.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,$3,'active') returning id",[p.id,owner?.id || null,kind])).rows[0].id;
    return {authUserId:p.id,contextId:id,sessionId:p.session_id,kind};
  }
  const primary=await context(root1,'primary'),manager=await context(child1,'manager',root1),otherManager=await context(child2,'manager',root2),
    resident=await context(child1,'resident',root1),otherResident=await context(child2,'resident',root2),staff=await context(root1,'staff'),otherStaff=await context(root2,'staff');
  async function property(owner:any,m:VerifiedActor) {
    const id=(await client.query("insert into public.residences(primary_owner_id,name,status) values ($1,$2,'approved') returning id",[owner.id,owner.raw_user_meta_data?.full_name || owner.email])).rows[0].id;
    await client.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[m.contextId,id]);
    const block=(await client.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id',[id,owner.raw_user_meta_data?.full_name || owner.email])).rows[0].id;
    const floor=(await client.query('insert into public.floors(block_id,floor_number) values ($1,0) returning id',[block])).rows[0].id;
    const room=(await client.query("insert into public.rooms(floor_id,room_number) values ($1,'1') returning id",[floor])).rows[0].id;
    const bed=(await client.query('insert into public.beds(room_id,bed_number) values ($1,1) returning id',[room])).rows[0].id;return {id,room,bed};
  }
  const home=await property(root1,manager),foreign=await property(root2,otherManager);
  for (const [r,h] of [[resident,home],[otherResident,foreign]] as const) await client.query('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)',[r.contextId,h.room,h.bed]);
  async function assign(s:VerifiedActor,h:any,m:VerifiedActor) {return (await client.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id) values ($1,$2,$3) returning id',[s.contextId,h.id,m.contextId])).rows[0].id;}
  const staffId=await assign(staff,home,manager),otherStaffId=await assign(otherStaff,foreign,otherManager);
  const unassignedStaff=await context(child2,'staff',root2);await assign(unassignedStaff,home,manager);
  async function bind(a:VerifiedActor) {
    await client.query(`insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)
      on conflict(session_id) do update set active_context_id=excluded.active_context_id`,[a.sessionId,a.authUserId,a.contextId]);
    await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);
  }
  async function denied(work:()=>Promise<unknown>,expected:number|string,label:string) {
    await client.query('savepoint negative');let error:any;try {await work();}catch(e){error=e;}
    await client.query('rollback to savepoint negative');check(typeof expected==='number' ? error instanceof ApiError && error.status===expected : error?.code===expected,label);
  }
  async function read(a:VerifiedActor,sql:string,params:unknown[]=[]) {await bind(a);await client.query('set local role pinevela_backend');try{return await client.query(sql,params);}finally{await client.query('reset role');}}
  async function act(a:VerifiedActor,id:string,action:Parameters<typeof actOnIssue>[3],input:any={}) {await bind(a);return actOnIssue(client,a,id,action,input);}
  const bytes=await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),1280);
  await denied(()=>createIssue(client,primary,{title:'Boundary verification'}),403,'Parent account cannot impersonate its resident portal');
  await denied(()=>createIssue(client,resident,{title:'Boundary verification',userId:otherResident.contextId}),400,'Reporter spoofing fields are rejected');
  await denied(()=>createIssue(client,resident,{title:'Boundary verification',hostelId:foreign.id}),403,'Resident cannot choose another residence');
  await denied(()=>createIssue(client,otherManager,{title:'Boundary verification',hostelId:home.id}),404,'Manager cannot report in another residence');
  await denied(()=>createIssue(client,resident,{title:'Boundary verification',photos:['data:image/png;base64,AA==']}),400,'Inline or external media cannot bypass private storage');
  const photo=await reserveMedia(client,resident,'maintenance',bytes);await finishMedia(client,resident,photo.id);
  check(photo.allocation_id===(await residentRoom(client,resident)).allocation_id,'Report photo is bound to actual activated allocation');
  const foreignPhoto=await reserveMedia(client,otherResident,'maintenance',bytes);await finishMedia(client,otherResident,foreignPhoto.id);
  await denied(()=>createIssue(client,resident,{title:'Boundary verification',photos:[mediaUrl(foreignPhoto.id)]}),403,'Other resident photographs cannot be attached');
  await bind(resident);const issue=await createIssue(client,resident,{title:'Boundary verification',photos:[mediaUrl(photo.id)],description:'Actual image attachment workflow verification'});
  check(issue.studentId===resident.contextId && issue.roomId===home.room,'Ticket reporter and room derive from active allocation');
  await denied(()=>editIssue(client,resident,issue.id,{reporter_context_id:otherResident.contextId}),400,'Generic edit cannot change ticket ownership');
  await bind(resident);check((await editIssue(client,resident,issue.id,{visitWindow:'Morning'})).visitWindow==='Morning','Reporting resident can edit supported details');
  check(issue.status==='Pending' && issue.historyLogs.length===1,'Submission stores event and pending state atomically');
  check((await read(manager,'select id from public.media_assets where id=$1',[photo.id])).rowCount===1,'Assigned manager can view attached report evidence');
  check((await read(primary,'select id from public.media_assets where id=$1',[photo.id])).rowCount===0,'Parent portal cannot view child maintenance photographs');
  check((await read(otherManager,'select id from public.housing_issue_details where id=$1',[issue.id])).rowCount===0,'Foreign manager cannot read maintenance dossier');
  check((await read(otherResident,'select id from public.maintenance_events where issue_id=$1',[issue.id])).rowCount===0,'Foreign resident cannot read maintenance history');
  await denied(()=>createIssue(client,resident,{title:'Another complaint'}),409,'Resident has at most one unresolved complaint');
  await denied(()=>act(manager,issue.id,'assign',{staffId:otherStaffId}),403,'Staff assignment cannot cross residence boundaries');
  await denied(()=>act(manager,issue.id,'assign',{staffId,staffName:'Spoofed identity'}),400,'Client staff identity aliases are rejected');
  const assigned=await act(manager,issue.id,'assign',{staffId,timeframe:'12h'});check(assigned.workflowState==='assigned' && assigned.assignedStaffId===staffId,'Authorized manager assigns actual staff');
  check((await read(staff,'select id from public.media_assets where id=$1',[photo.id])).rowCount===1,'Exact assigned staff can read report photograph');
  check((await read(otherStaff,'select id from public.media_assets where id=$1',[photo.id])).rowCount===0,'Unassigned staff cannot read report photograph');
  await denied(()=>act(unassignedStaff,issue.id,'accept-assignment'),403,'Unassigned staff in the same residence cannot accept ticket');
  check((await read(unassignedStaff,'select id from public.media_assets where id=$1',[photo.id])).rowCount===0,'Same-residence unassigned staff cannot read report photographs');
  await denied(()=>act(otherStaff,issue.id,'accept-assignment'),404,'Foreign staff cannot accept ticket');
  await denied(()=>act(staff,issue.id,'staff-complete',{completionNotes:'Completed'}),409,'Staff must accept before completing');
  check((await act(staff,issue.id,'staff-decline',{reason:'Unavailable at proposed time'})).staffDeclineRequested,'Declined work is exposed for manager reassignment controls');
  await denied(()=>act(staff,issue.id,'accept-assignment'),409,'Declined assignment cannot be accepted without reassignment');
  await act(manager,issue.id,'assign',{staffId});await act(staff,issue.id,'accept-assignment');
  await denied(()=>act(staff,issue.id,'accept-assignment'),409,'Assignment acceptance cannot be replayed');
  await act(staff,issue.id,'staff-reschedule',{reason:'Additional repair time required',requestedTimeframe:'48h'});
  await denied(()=>act(staff,issue.id,'staff-complete',{completionNotes:'Completed'}),409,'Pending reschedule blocks premature completion');
  const rescheduled=await act(manager,issue.id,'approve-reschedule',{managerNotes:'Approved'});check(rescheduled.workflowState==='accepted' && rescheduled.timeframe==='48h','Reschedule approval restores acceptance and applies deadline');
  await act(staff,issue.id,'staff-reschedule',{reason:'More time requested',requestedTimeframe:'3d'});
  const declined=await act(manager,issue.id,'decline-reschedule',{reason:'Original schedule retained'});check(declined.timeframe==='48h' && declined.workflowState==='accepted','Declined extension preserves existing deadline');
  const repair=await reserveMedia(client,staff,'repair',bytes,undefined,{issueId:issue.id});await finishMedia(client,staff,repair.id);
  await denied(()=>act(staff,issue.id,'staff-complete',{completionNotes:'Completed',completionPhoto:mediaUrl(photo.id)}),403,'Report media cannot be repurposed as completion evidence');
  const complete=await act(staff,issue.id,'staff-complete',{completionNotes:'Repair performed and checked',completionPhoto:mediaUrl(repair.id)});check(complete.staffCompleted && complete.staffCompletionPhotos.length===1,'Completion stores owned issue-specific repair evidence');
  await denied(()=>act(manager,issue.id,'manager-close'),409,'Manager cannot bypass reporting resident signoff');
  await denied(()=>createIssue(client,resident,{title:'Another complaint'}),409,'Unconfirmed completion does not bypass active complaint limit');
  await denied(()=>act(otherResident,issue.id,'student-confirm',{isResolved:true,rating:5}),404,'Another resident cannot confirm repair');
  await denied(()=>act(resident,issue.id,'student-confirm',{isResolved:true,rating:0}),400,'Repair rating zero is rejected');
  const followup=await act(resident,issue.id,'student-confirm',{isResolved:false,feedback:'Issue still persists'});check(followup.workflowState==='follow_up' && followup.status==='In Progress' && !followup.staffCompleted,'Incomplete repair reopens staff work without false signoff');
  check((await client.query('select issue_id from public.repair_reviews where issue_id=$1',[issue.id])).rowCount===0,'Incomplete repair creates no rating');
  await act(staff,issue.id,'staff-complete',{completionNotes:'Follow-up repair checked',completionPhoto:mediaUrl(repair.id)});
  await denied(()=>act(resident,issue.id,'student-confirm',{isResolved:true,feedback:'A',reviewText:'B'}),400,'Conflicting feedback is rejected');
  const confirmed=await act(resident,issue.id,'student-confirm',{isResolved:true,rating:4,feedback:'Repair confirmed'});check(confirmed.studentConfirmed && confirmed.studentRating===4,'Reporting resident records explicit repair rating');
  check((await client.query('select id from public.staff_reviews')).rowCount===0,'Repair rating does not silently create staff review');
  await denied(()=>act(resident,issue.id,'student-confirm',{isResolved:true,rating:4}),409,'Resident signoff and rating are single-use');
  const closed=await act(manager,issue.id,'manager-close',{managerNotes:'Resident verified the repair'});check(closed.closedByManager && closed.status==='Closed','Manager closes only after valid signoff');
  const eventCount=(await client.query('select count(*) from public.maintenance_events where issue_id=$1',[issue.id])).rows[0].count;
  await act(manager,issue.id,'manager-close');check((await client.query('select count(*) from public.maintenance_events where issue_id=$1',[issue.id])).rows[0].count===eventCount,'Repeated close does not duplicate history or notifications');
  await denied(()=>editIssue(client,manager,issue.id,{title:'Edited after closure'}),409,'Closed report details cannot be changed');
  await denied(()=>act(staff,issue.id,'staff-complete',{completionNotes:'Again'}),409,'Closed repair cannot be changed');
  check((await read(resident,'select id from public.media_assets where id=$1',[repair.id])).rowCount===1,'Reporting resident can inspect private completion evidence');
  await denied(()=>client.query('update public.maintenance_issues set reporter_context_id=$2 where id=$1',[issue.id,otherResident.contextId]),'23514','Database rejects changing reporter ownership');
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[photo.id])).rows[0].allowed,'Maintenance photos never enter public catalog');
  check((await read(manager,'select n.id from public.notifications n where n.category=$1',['issue_report'])).rowCount!>0,'Manager receives saved-recipient workflow notices');
  check((await read(primary,'select n.id from public.notifications n where n.category=$1',['issue_report'])).rowCount===0,'Parent portal does not receive unrelated housing workflow notices');
  await read(resident,'select id from public.maintenance_issues');await client.query('set local role pinevela_backend');
  await denied(()=>client.query('update public.maintenance_issues set status=$1 where id=$2',['closed',issue.id]),'42501','Direct browser/backend role cannot force state changes');await client.query('reset role');
  await bind(manager);const facility=await createIssue(client,manager,{title:'Facility maintenance verification',hostelId:home.id,locationTag:'Common area'});
  await act(manager,facility.id,'assign',{staffId});await act(staff,facility.id,'accept-assignment');await act(staff,facility.id,'staff-complete',{completionNotes:'Facility repair completed'});
  const facilityClosed=await act(manager,facility.id,'manager-close');
  check(facilityClosed.closedByManager && !facilityClosed.studentConfirmed && !facilityClosed.requiresResidentSignoff,'Manager-filed facility report closes without invented resident signoff');
  // Changed allocation, ended staff and grants must invalidate access immediately.
  await bind(resident);const second=await createIssue(client,resident,{title:'Assignment revocation verification'});
  await act(manager,second.id,'assign',{staffId});await act(staff,second.id,'accept-assignment');await act(staff,second.id,'staff-complete',{completionNotes:'Completed'});
  await client.query('update public.allocations set ended_at=now() where resident_context_id=$1 and ended_at is null',[resident.contextId]);
  await denied(()=>act(resident,second.id,'student-confirm',{isResolved:true}),404,'Released resident allocation cannot sign off old ticket');
  await denied(()=>canUploadMedia(client,resident,'maintenance'),403,'Released resident cannot upload new report evidence');
  await bind(manager);const historical=await createIssue(client,manager,{title:'Historical assignment verification',hostelId:home.id});
  await act(manager,historical.id,'assign',{staffId});await act(staff,historical.id,'accept-assignment');await act(staff,historical.id,'staff-complete',{completionNotes:'Facility repair completed before staff release'});
  await client.query("update public.staff_assignments set ended_at=now(),status='removed' where id=$1",[staffId]);
  check((await act(manager,historical.id,'manager-close')).closedByManager,'Historical staff completion remains closable after staff release without new assignment');
  check((await read(staff,'select id from public.maintenance_issues where id=$1',[issue.id])).rowCount===0,'Removed staff loses direct ticket RLS access');
  check((await read(staff,'select id from public.media_assets where id=$1',[photo.id])).rowCount===0,'Removed staff loses report photo access');
  await client.query('update public.manager_assignments set ended_at=now() where manager_context_id=$1',[manager.contextId]);
  await denied(()=>act(manager,second.id,'manager-close'),404,'Ended manager grant cannot close maintenance');
  // Real byte transfer after committed DDL, followed by Storage API cleanup.
  if (ledger.has('20261009130000')) {
    console.log(JSON.stringify({phase:'storage_round_trip',checks}));
    objectPath=photo.object_path;await storage.upload(objectPath,bytes);check((await storage.download(objectPath,photo)).equals(bytes),'Real maintenance photograph round-trips through private Storage');
    await storage.remove(objectPath);objectPath=undefined;storageRoundTrip=true;
  }
  await client.query('rollback');
  const after=(await client.query(`select (select count(*) from public.profiles) as profiles,(select count(*) from auth.users) as auth_users,(select count(*) from storage.objects) as objects`)).rows[0];
  check(JSON.stringify(after)===JSON.stringify(baseline),'Temporary domain data, bindings and real objects are removed');
  console.log(JSON.stringify({checks,passed:true,rolledBack:true,storageRoundTrip,authAccountsCreated:0,legacyRecordsImported:0,providerFlowTested:false}));
} finally {
  try {await client.query('rollback').catch(()=>undefined);if(objectPath)await storage.remove(objectPath);}
  finally {client.release(true);await db.close();}
}
