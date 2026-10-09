import type { Express, RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { AuthRequest,SupabaseAuth } from './auth.js';
import { notify } from './notifications.js';
import { ownedMedia } from './media.js';
import { issueRow } from './dashboardReads.js';
const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => {work(req as AuthRequest,res).catch(next);};
const hours:Record<string,number> = {'12h':12,'24h':24,'48h':48,'3d':72,'5d':120,'7d':168};
type Action = 'assign'|'accept-assignment'|'staff-decline'|'staff-reschedule'|'approve-reschedule'|'decline-reschedule'|'staff-complete'|'student-confirm'|'manager-close';
const fields:Record<Action,string[]> = {
  assign:['staffId','timeframe','customDeadline'], 'accept-assignment':[], 'staff-decline':['reason'],
  'staff-reschedule':['reason','requestedTimeframe','requestedDate'], 'approve-reschedule':['approvedTimeframe','managerNotes'],
  'decline-reschedule':['reason'],'staff-complete':['completionNotes','completionPhoto','completionPhotos'],
  'student-confirm':['isResolved','feedback','reviewText','rating'],'manager-close':['managerNotes']
};
function inputObject(input:any,allowed:string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k=>!allowed.includes(k))) throw new ApiError(400,'Unsupported maintenance fields.');
}
function textField(value:unknown,max:number,required=false):string {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > max || required && !value.trim()) throw new ApiError(400,'Provide valid maintenance text.');
  return value.trim();
}
function schedule(timeframe:unknown,date:unknown,defaultTimeframe='24h') {
  const tf = timeframe === undefined ? defaultTimeframe : timeframe;
  if (typeof tf !== 'string' || !hours[tf]) throw new ApiError(400,'Choose a valid repair timeframe.');
  const end = date === undefined ? Date.now()+hours[tf]*3600000 : typeof date === 'string' ? Date.parse(date) : NaN;
  if (!Number.isFinite(end) || end <= Date.now()) throw new ApiError(400,'Choose a future repair deadline.');
  return {timeframe:tf,deadline:new Date(end).toISOString()};
}
export async function residentRoom(client:PoolClient,actor:VerifiedActor,lock=false) {
  if (actor.kind !== 'resident') throw new ApiError(403,'Use your activated resident portal.');
  const r = (await client.query(`select a.id as allocation_id,a.room_id,a.resident_context_id,h.id as residence_id,h.name as residence_name,
    b.name as block_name,f.floor_number,r.room_number,a.bed_id from public.allocations a join public.rooms r on r.id = a.room_id
    join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id join public.residences h on h.id = b.residence_id
    where a.resident_context_id = $1 and a.ended_at is null ${lock ? 'for share of a' : ''}`,[actor.contextId])).rows[0];
  if (!r) throw new ApiError(403,'Activate a room before reporting or confirming maintenance.'); return r;
}
export async function maintenanceResidence(client:PoolClient,actor:VerifiedActor,id:string) {
  if (!['resident','manager','admin','staff'].includes(actor.kind)) throw new ApiError(403,'Housing account required.');
  const row = (await client.query(`select h.id,h.name,h.status from public.residences h where h.id = $1 and (
    $2 = 'admin' or ($2 = 'manager' and exists(select 1 from public.manager_assignments a where a.residence_id = h.id and a.manager_context_id = $3 and a.ended_at is null))
    or ($2 = 'resident' and exists(select 1 from public.allocations a join public.rooms r on r.id = a.room_id join public.floors f on f.id = r.floor_id
      join public.blocks b on b.id = f.block_id where a.resident_context_id = $3 and a.ended_at is null and b.residence_id = h.id))
    or ($2 = 'staff' and exists(select 1 from public.staff_assignments s where s.residence_id = h.id and s.staff_context_id = $3 and s.status = 'active' and s.ended_at is null)))
    for update of h`,[id,actor.kind,actor.contextId])).rows[0];
  if (!row) throw new ApiError(404,'Authorized maintenance residence not found.');
  if (row.status !== 'approved') throw new ApiError(409,'Maintenance operations require an approved residence.');
  if (actor.kind === 'manager' && !(await client.query('select id from public.manager_assignments where manager_context_id = $1 and residence_id = $2 and ended_at is null for share',[actor.contextId,id])).rowCount)
    throw new ApiError(403,'Manager assignment ended.');
  return row;
}
async function ticket(client:PoolClient,id:string) {
  const row = (await client.query('select * from public.housing_issue_details where id = $1',[id])).rows[0];
  if (!row) throw new ApiError(404,'Maintenance ticket not found.'); return issueRow(row);
}
async function record(client:PoolClient,actor:VerifiedActor,issue:any,event:string,notes:string,photos:string[]=[]) {
  await client.query('insert into public.maintenance_events(issue_id,actor_context_id,event_type,notes,photo_paths) values ($1,$2,$3,$4,$5)',[issue.id,actor.contextId,event,notes,photos]);
  await client.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,$2,'maintenance_issue',$3)",[actor.contextId,event,issue.id]);
  const managers = (await client.query(`select m.manager_context_id as id from public.manager_assignments m join public.account_contexts c on c.id = m.manager_context_id
    where m.residence_id = $1 and m.ended_at is null and c.status = 'active'`,[issue.residence_id])).rows.map(r=>r.id);
  const staff = issue.assigned_staff_id && (await client.query("select staff_context_id from public.staff_assignments where id = $1 and status = 'active' and ended_at is null",[issue.assigned_staff_id])).rows[0]?.staff_context_id;
  for (const [recipients,link] of [[managers,'/manager/dashboard'],[[issue.reporter_context_id],issue.allocation_id ? '/resident/dashboard' : '/manager/dashboard'],[staff ? [staff] : [],'/staff/dashboard']] as [string[],string][]) {
    await notify(client,recipients.filter(id=>id!==actor.contextId),{category:'issue_report',title:event.replace(/_/g,' '),message:`${issue.title}: ${notes || event.replace(/_/g,' ')}`,sender:actor.contextId,link});
  }
}
export async function createIssue(client:PoolClient,actor:VerifiedActor,input:any) {
  if (!['resident','manager','admin'].includes(actor.kind)) throw new ApiError(403,'Reporting housing account required.');
  inputObject(input,['title','description','category','urgency','subArea','locationTag','photos','visitWindow','contactPhone','contactMethod','hostelId','roomId']);
  const title = textField(input.title,200,true),details = textField(input.description,10000);
  const room = actor.kind === 'resident' ? await residentRoom(client,actor) : null;
  let residenceId = room?.residence_id || (input.hostelId === undefined ? null : uuid(input.hostelId));
  if (!residenceId && actor.kind === 'manager') {
    const ids = (await client.query('select residence_id from public.manager_assignments where manager_context_id = $1 and ended_at is null',[actor.contextId])).rows;
    if (ids.length === 1) residenceId = ids[0].residence_id;
  }
  if (!residenceId) throw new ApiError(400,'Choose an authorized residence.');
  if (room && (input.hostelId !== undefined && input.hostelId !== residenceId || input.roomId !== undefined && input.roomId !== room.room_id)) throw new ApiError(403,'Report only your activated room.');
  await maintenanceResidence(client,actor,residenceId);
  if (room) {
    const current = await residentRoom(client,actor,true);
    if (current.allocation_id !== room.allocation_id) throw new ApiError(409,'Your room allocation changed.');
    const active = await client.query("select id from public.maintenance_issues where reporter_context_id = $1 and allocation_id is not null and status not in ('resident_confirmed','closed')",[actor.contextId]);
    if (active.rowCount) throw new ApiError(409,'Confirm the repair of your active complaint before filing another.');
  }
  let roomId = room?.room_id || null;
  if (!room && input.roomId !== undefined) {
    roomId = uuid(input.roomId);
    if (!(await client.query(`select r.id from public.rooms r join public.floors f on f.id = r.floor_id join public.blocks b on b.id = f.block_id
      where r.id = $1 and b.residence_id = $2`,[roomId,residenceId])).rowCount) throw new ApiError(403,'Choose a room in this residence.');
  }
  const photos = input.photos ?? [];
  if (!Array.isArray(photos) || photos.length > 10 || new Set(photos).size !== photos.length) throw new ApiError(400,'Use at most ten distinct report photographs.');
  for (const photo of photos) {
    const asset = await ownedMedia(client,actor,photo,'maintenance');
    if (asset.residence_id !== residenceId || asset.allocation_id !== (room?.allocation_id || null)) throw new ApiError(403,'Photograph belongs to another room allocation.');
  }
  const issue = (await client.query(`insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title,details,category,urgency,photo_paths,location_tag,visit_window,contact_phone,contact_method)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning *`,[residenceId,roomId,actor.contextId,room?.allocation_id || null,title,details,
      textField(input.category,100),textField(input.urgency,50),photos,textField(input.locationTag ?? input.subArea,300),textField(input.visitWindow,300),textField(input.contactPhone,50),textField(input.contactMethod,100)])).rows[0];
  await record(client,actor,issue,'maintenance_reported','Maintenance complaint received.',photos);
  // Submission receipt is useful to the reporter too; state transitions notify saved related accounts.
  await notify(client,[actor.contextId],{category:'issue_report',title:'Maintenance Complaint Received',message:`Your complaint "${title}" has been sent to the residence manager.`,link:room ? '/resident/dashboard' : '/manager/dashboard'});
  return ticket(client,issue.id);
}
export async function actOnIssue(client:PoolClient,actor:VerifiedActor,id:string,action:Action,input:any) {
  inputObject(input,fields[action]);
  const initial = (await client.query('select id,residence_id from public.maintenance_issues where id = $1',[id])).rows[0];
  if (!initial) throw new ApiError(404,'Maintenance ticket not found.');
  await maintenanceResidence(client,actor,initial.residence_id);
  const issue = (await client.query('select * from public.maintenance_issues where id = $1 for update',[id])).rows[0];
  const managerAction = ['assign','approve-reschedule','decline-reschedule','manager-close'].includes(action);
  if (managerAction) {if (!['manager','admin'].includes(actor.kind)) throw new ApiError(403,'Manager action required.');}
  else if (action === 'student-confirm') {
    const room = await residentRoom(client,actor,true);
    if (issue.reporter_context_id !== actor.contextId || room.allocation_id !== issue.allocation_id || room.room_id !== issue.room_id) throw new ApiError(403,'Only the reporting resident in the original active room may confirm repairs.');
  } else {
    if (actor.kind !== 'staff' || !(await client.query(`select s.id from public.staff_assignments s where s.id = $1 and s.staff_context_id = $2
      and s.residence_id = $3 and s.status = 'active' and s.ended_at is null for share`,[issue.assigned_staff_id,actor.contextId,issue.residence_id])).rowCount)
      throw new ApiError(403,'Only the active assigned staff member can perform this action.');
  }
  if (issue.status === 'closed' && action === 'manager-close') return ticket(client,id);
  if (issue.status === 'closed') throw new ApiError(409,'This maintenance ticket is closed.');
  let changes:Record<string,unknown> = {},notes='';let photos:string[]=[];
  if (action === 'assign') {
    if (!['reported','assigned','accepted','follow_up','reschedule_requested'].includes(issue.status)) throw new ApiError(409,'This repair cannot be reassigned.');
    const staff = (await client.query(`select s.id from public.staff_assignments s join public.account_contexts c on c.id = s.staff_context_id
      where s.id = $1 and s.residence_id = $2 and s.status = 'active' and s.ended_at is null and c.status = 'active' and c.kind = 'staff' for share of s,c`,[uuid(input.staffId),issue.residence_id])).rows[0];
    if (!staff) throw new ApiError(403,'Assign active staff from this residence.');
    const time = schedule(input.timeframe,input.customDeadline);
    changes = {assigned_staff_id:staff.id,status:'assigned',assigned_at:new Date().toISOString(),deadline:time.deadline,timeframe:time.timeframe,
      accepted_at:null,declined_at:null,decline_reason:null,requested_deadline:null,requested_timeframe:null,reschedule_reason:null,reschedule_previous_status:null,completed_at:null,completion_notes:null,completion_paths:[],confirmed_at:null,resident_feedback:null};
    notes = `Staff assigned. Deadline: ${time.deadline}.`;
  } else if (action === 'accept-assignment') {
    if (issue.status !== 'assigned' || issue.declined_at) throw new ApiError(409,'Accept an available assignment once.');
    changes={status:'accepted',accepted_at:new Date().toISOString()};notes='Staff accepted the work order.';
  } else if (action === 'staff-decline') {
    if (!['assigned','accepted','follow_up'].includes(issue.status) || issue.declined_at) throw new ApiError(409,'This assignment cannot be declined.');
    notes=textField(input.reason,5000,true);changes={status:'assigned',declined_at:new Date().toISOString(),decline_reason:notes,accepted_at:null};
  } else if (action === 'staff-reschedule') {
    if (!['assigned','accepted','follow_up'].includes(issue.status) || issue.declined_at) throw new ApiError(409,'This assignment cannot be rescheduled.');
    notes=textField(input.reason,5000,true);const time=schedule(input.requestedTimeframe,input.requestedDate);
    changes={status:'reschedule_requested',reschedule_previous_status:issue.status,requested_deadline:time.deadline,requested_timeframe:time.timeframe,reschedule_reason:notes};
  } else if (['approve-reschedule','decline-reschedule'].includes(action)) {
    if (issue.status !== 'reschedule_requested') throw new ApiError(409,'There is no pending reschedule request.');
    notes=textField(action === 'approve-reschedule' ? input.managerNotes : input.reason,5000,action === 'decline-reschedule');
    changes={status:issue.reschedule_previous_status,requested_deadline:null,requested_timeframe:null,reschedule_previous_status:null};
    if (action === 'approve-reschedule') {
      const time=input.approvedTimeframe === undefined ? schedule(issue.requested_timeframe,new Date(issue.requested_deadline).toISOString()) : schedule(input.approvedTimeframe,undefined);
      changes.deadline=time.deadline;changes.timeframe=time.timeframe;notes += ` Approved deadline: ${time.deadline}.`;
    }
  } else if (action === 'staff-complete') {
    if (!['accepted','follow_up'].includes(issue.status) || !issue.accepted_at || issue.declined_at) throw new ApiError(409,'Accept the assignment before completing repairs.');
    notes=textField(input.completionNotes,5000,true);photos=input.completionPhotos ?? (input.completionPhoto ? [input.completionPhoto] : []);
    if (!Array.isArray(photos) || photos.length > 12 || new Set(photos).size !== photos.length || input.completionPhoto && input.completionPhotos && input.completionPhoto !== photos[0]) throw new ApiError(400,'Use at most twelve distinct completion photographs.');
    for (const photo of photos) {const asset=await ownedMedia(client,actor,photo,'repair');if (asset.issue_id !== id) throw new ApiError(403,'Repair photograph belongs to another ticket.');}
    changes={status:'staff_completed',completion_notes:notes,completion_paths:photos,completed_at:new Date().toISOString()};
  } else if (action === 'student-confirm') {
    if (issue.status !== 'staff_completed') throw new ApiError(409,'Confirm a completed repair once.');
    if (typeof input.isResolved !== 'boolean') throw new ApiError(400,'Confirm whether the repair is resolved.');
    if (input.feedback !== undefined && input.reviewText !== undefined && input.feedback !== input.reviewText) throw new ApiError(400,'Repair feedback fields disagree.');
    notes=textField(input.feedback ?? input.reviewText,3000,!input.isResolved);
    if (input.rating !== undefined && (typeof input.rating !== 'number' || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)) throw new ApiError(400,'Rate the repair from one to five.');
    if (input.isResolved && input.rating !== undefined) await client.query('insert into public.repair_reviews(issue_id,resident_context_id,rating,comment) values ($1,$2,$3,$4)',[id,actor.contextId,input.rating,notes]);
    changes=input.isResolved ? {status:'resident_confirmed',confirmed_at:new Date().toISOString(),resident_feedback:notes} : {status:'follow_up',resident_feedback:notes,completed_at:null};
  } else {
    if (issue.allocation_id ? issue.status !== 'resident_confirmed' : issue.status !== 'staff_completed') throw new ApiError(409,'Staff completion and reporting-resident confirmation are required before closure.');
    notes=textField(input.managerNotes,5000);changes={status:'closed',closed_at:new Date().toISOString(),manager_close_notes:notes};
  }
  const columns=Object.keys(changes),values=Object.values(changes);
  const updated=(await client.query(`update public.maintenance_issues set ${columns.map((k,i)=>`${k} = $${i+2}`).join(',')},updated_at = now() where id = $1 returning *`,[id,...values])).rows[0];
  await record(client,actor,updated,`maintenance_${action.replace(/-/g,'_')}`,notes,photos);
  return ticket(client,id);
}
export async function editIssue(client:PoolClient,actor:VerifiedActor,id:string,input:any) {
  inputObject(input,['title','description','category','urgency','subArea','locationTag','photos','visitWindow','contactPhone','contactMethod']);
  if (!Object.keys(input).length) throw new ApiError(400,'Provide report details to update.');
  const initial=(await client.query('select residence_id from public.maintenance_issues where id=$1',[id])).rows[0];
  if (!initial) throw new ApiError(404,'Maintenance ticket not found.');
  await maintenanceResidence(client,actor,initial.residence_id);
  const issue=(await client.query('select * from public.maintenance_issues where id=$1 for update',[id])).rows[0];
  if (actor.kind === 'resident') {
    const room=await residentRoom(client,actor,true);
    if (issue.reporter_context_id!==actor.contextId || room.allocation_id!==issue.allocation_id) throw new ApiError(403,'Edit only reports from your current activated room.');
  } else if (!['manager','admin'].includes(actor.kind)) throw new ApiError(403,'Report editing is restricted to its resident or authorized management.');
  if (issue.status === 'closed') throw new ApiError(409,'Closed maintenance reports cannot be edited.');
  const changes:Record<string,unknown>={};
  for (const [field,column,max] of [['title','title',200],['description','details',10000],['category','category',100],['urgency','urgency',50],
    ['locationTag','location_tag',300],['subArea','location_tag',300],['visitWindow','visit_window',300],['contactPhone','contact_phone',50],['contactMethod','contact_method',100]] as const) {
    if (input[field]!==undefined) changes[column]=textField(input[field],max,field==='title');
  }
  if (input.locationTag!==undefined && input.subArea!==undefined && input.locationTag!==input.subArea) throw new ApiError(400,'Report location fields disagree.');
  if (input.photos!==undefined) {
    if (issue.reporter_context_id!==actor.contextId) throw new ApiError(403,'Only the reporter can replace report photographs.');
    if (!Array.isArray(input.photos) || input.photos.length>10 || new Set(input.photos).size!==input.photos.length) throw new ApiError(400,'Use at most ten distinct photographs.');
    for (const photo of input.photos) {const asset=await ownedMedia(client,actor,photo,'maintenance');if(asset.residence_id!==issue.residence_id || asset.allocation_id!==issue.allocation_id) throw new ApiError(403,'Photograph belongs to another housing relationship.');}
    changes.photo_paths=input.photos;
  }
  const columns=Object.keys(changes);
  const updated=(await client.query(`update public.maintenance_issues set ${columns.map((k,i)=>`${k}=$${i+2}`).join(',')},updated_at=now() where id=$1 returning *`,[id,...Object.values(changes)])).rows[0];
  await record(client,actor,updated,'maintenance_details_updated',`Updated: ${Object.keys(input).join(', ')}.`,input.photos || []);
  return ticket(client,id);
}
export function installMaintenance(app:Express,auth:SupabaseAuth) {
  app.post('/api/issue-reports',auth.require(['resident','manager','admin']),route(async (req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['resident','manager','admin'],c=>createIssue(c,req.actor,req.body)))));
  app.put('/api/issue-reports/:id',auth.require(['resident','manager','admin']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['resident','manager','admin'],c=>editIssue(c,req.actor,uuid(req.params.id),req.body)))));
  app.post(['/api/issue-reports/:id/assign','/api/issue-reports/:id/accept-assignment','/api/issue-reports/:id/staff-decline',
    '/api/issue-reports/:id/staff-reschedule','/api/issue-reports/:id/approve-reschedule','/api/issue-reports/:id/decline-reschedule',
    '/api/issue-reports/:id/staff-complete','/api/issue-reports/:id/student-confirm','/api/issue-reports/:id/manager-close'],
    auth.require(['resident','manager','admin','staff']),route(async(req,res)=> {
      const action=req.path.split('/').at(-1) as Action;
      const kinds=action==='student-confirm' ? ['resident'] : ['assign','approve-reschedule','decline-reschedule','manager-close'].includes(action) ? ['manager','admin'] : ['staff'];
      return res.json(await auth.db.authorizedSystem(req.actor,kinds,c=>actOnIssue(c,req.actor,uuid(req.params.id),action,req.body ?? {})));
    }));
  app.get('/api/student/my-rooms',auth.require(['resident']),route(async (req,res)=> {
    const room=await auth.db.authorizedSystem(req.actor,['resident'],async c=> {
      const r=await residentRoom(c,req.actor);
      const key=(await c.query('select id,code from private.room_activation_keys where room_id = $1 and revoked_at is null',[r.room_id])).rows[0];
      return {id:key?.id || r.allocation_id,allocationId:r.allocation_id,roomId:r.room_id,bedId:r.bed_id,roomKey:key?.code,
        hostelId:r.residence_id,hostelName:r.residence_name,blockName:r.block_name,floor:r.floor_number,roomNumber:r.room_number,isAssigned:true,assignedStudentId:req.actor.contextId};
    });return res.json({rooms:[room]});
  }));
}
