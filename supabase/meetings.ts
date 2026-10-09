import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { staffManagerResidence } from './staff.js';
import { residentRoom } from './maintenance.js';
import { notify } from './notifications.js';
const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
const statuses:Record<string,string>={requested:'Pending',accepted:'Approved',declined:'Rejected',cancelled:'Cancelled',completed:'Completed'};
const categories=['Room / Accommodation','Maintenance Follow-up','Payment / Billing','Staff Operational Shift','Disciplinary / Grievance','General Consultation'];
const modes=['In-Person (Admin Office)','Google Meet / Video','Phone Call'];
function fields(body:any,allowed:string[]){if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k)))throw new ApiError(400,'Unsupported appointment fields.');}
function text(value:unknown,max:number,min=0){if(value===undefined && !min)return '';if(typeof value!=='string' || value.length>max || value.trim().length<min)throw new ApiError(400,'Enter valid appointment details.');return value.trim();}
export function meetingSchedule(date:unknown,time:unknown) {
  if(typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || typeof time!=='string')throw new ApiError(400,'Choose a valid meeting date and time slot.');
  const parts=/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(time.trim());
  if(!parts)throw new ApiError(400,'Choose a time slot with a start and end time.');
  function clock(hour:string,minute:string,period:string){const h=Number(hour),m=Number(minute);if(h<1 || h>12 || m>59)throw new ApiError(400,'Choose valid meeting times.');return {hour:h%12+(period.toUpperCase()==='PM'?12:0),minute:m};}
  const start=clock(parts[1],parts[2],parts[3]),end=clock(parts[4],parts[5],parts[6]);
  // Current property onboarding is Ghana-only. Store actual instants in UTC and
  // label the existing date/slot form as Ghana time; no server-local time guessing.
  const instant=(v:{hour:number;minute:number})=>new Date(`${date}T${String(v.hour).padStart(2,'0')}:${String(v.minute).padStart(2,'0')}:00Z`);
  const starts=instant(start),ends=instant(end);
  if(!Number.isFinite(starts.getTime()) || starts.toISOString().slice(0,10)!==date || ends<=starts)throw new ApiError(400,'Choose a valid date and an end time after the start.');
  return {starts:starts.toISOString(),ends:ends.toISOString()};
}
function slot(start:Date,end:Date) {const f=new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h12',timeZone:'Africa/Accra'});return `${f.format(start).toUpperCase()} - ${f.format(end).toUpperCase()}`;}
function meetingRow(r:any){const start=new Date(r.starts_at),end=new Date(r.ends_at);return {
  id:r.id,hostelId:r.residence_id,hostelName:r.residence_name,managerId:r.manager_context_id,managerName:r.manager_name,
  requesterId:r.participant_context_id,requesterName:r.contact_name,requesterType:r.requester_type==='resident'?'student':r.requester_type,
  requesterEmail:r.contact_email,requesterPhone:r.contact_phone,roomOrUnit:r.room_label,topic:r.topic,category:r.category,
  date:start.toISOString().slice(0,10),timeSlot:slot(start,end),mode:r.mode,status:statuses[r.status],meetingLinkOrVenue:r.location || '',
  notes:r.notes || '',managerResponseNotes:r.response_notes,createdAt:r.created_at,updatedAt:r.updated_at};}
async function detail(c:PoolClient,id:string) {return meetingRow((await c.query(`select v.*,h.name as residence_name,p.display_name as manager_name from public.meetings v join public.residences h on h.id=v.residence_id
  join public.account_contexts x on x.id=v.manager_context_id join public.profiles p on p.id=x.auth_user_id where v.id=$1`,[id])).rows[0]);}
export async function meetingRows(c:PoolClient){return (await c.query('select * from public.housing_meeting_details where removed_at is null order by starts_at desc limit 1000')).rows.map(meetingRow);}
export async function meetingParticipants(c:PoolClient,id:unknown){return (await c.query('select * from public.housing_meeting_participants where residence_id=$1 order by kind,display_name',[uuid(id)])).rows.map(r=>({
  contextId:r.context_id,kind:r.kind,name:r.display_name,email:r.email,phone:r.phone || '',roomLabel:r.room_label || ''}));}
async function record(c:PoolClient,a:VerifiedActor,m:any,event:string) {
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,$2,'meeting',$3)",[a.contextId,event,m.id]);
  await notify(c,[m.manager_context_id,...(m.participant_context_id?[m.participant_context_id]:[])],{category:'meeting',title:event.replace(/_/g,' '),
    message:`${m.topic}: ${statuses[m.status]}. ${new Date(m.starts_at).toISOString().slice(0,10)}, ${slot(new Date(m.starts_at),new Date(m.ends_at))} (Ghana time).${m.response_notes?' '+m.response_notes:''}`,sender:a.contextId});
}
async function target(c:PoolClient,a:VerifiedActor,value:unknown) {
  const id=uuid(value),initial=(await c.query('select * from public.meetings where id=$1',[id])).rows[0];
  if(!initial)throw new ApiError(404,'Appointment not found.');
  if(a.kind==='manager') {if(initial.manager_context_id!==a.contextId)throw new ApiError(404,'Appointment not found.');await staffManagerResidence(c,a,initial.residence_id);}
  else if(['staff','resident'].includes(a.kind) && initial.participant_context_id===a.contextId)await c.query('select id from public.residences where id=$1 for update',[initial.residence_id]);
  else throw new ApiError(404,'Appointment not found.');
  const m=(await c.query('select * from public.meetings where id=$1 for update',[id])).rows[0];
  if(a.kind!=='manager') {
    const active=a.kind==='resident'?
      await c.query('select id from public.allocations where id=$1 and resident_context_id=$2 and ended_at is null for share',[m.allocation_id,a.contextId]):
      await c.query("select id from public.staff_assignments where id=$1 and staff_context_id=$2 and status='active' and ended_at is null for share",[m.staff_assignment_id,a.contextId]);
    if(!active.rowCount)throw new ApiError(404,'Appointment is outside your current housing access.');
  }
  return m;
}
async function person(c:PoolClient,residence:string,contextId:string,kind:string) {
  const profile=(await c.query(`select x.id,p.display_name,p.email,p.phone from public.account_contexts x join public.profiles p on p.id=x.auth_user_id
    where x.id=$1 and x.kind=$2 and x.status='active' for share of x`,[contextId,kind])).rows[0];
  if(!profile)throw new ApiError(403,'Choose an active participant from this residence.');
  if(kind==='resident') {
    const room=(await c.query(`select a.id,r.room_number from public.allocations a join public.rooms r on r.id=a.room_id join public.floors f on f.id=r.floor_id join public.blocks b on b.id=f.block_id
      where a.resident_context_id=$1 and a.ended_at is null and b.residence_id=$2 for share of a`,[contextId,residence])).rows[0];
    if(!room)throw new ApiError(403,'The resident must have an active room in this residence.');return {...profile,allocation:room.id,assignment:null,roomLabel:room.room_number};
  }
  const s=(await c.query("select id,job_role from public.staff_assignments where staff_context_id=$1 and residence_id=$2 and status='active' and ended_at is null for share",[contextId,residence])).rows[0];
  if(!s)throw new ApiError(403,'Staff must have active employment in this residence.');return {...profile,allocation:null,assignment:s.id,roomLabel:s.job_role};
}
export async function createMeeting(c:PoolClient,a:VerifiedActor,body:any) {
  if(!['manager','resident','staff'].includes(a.kind))throw new ApiError(403,'Use your housing portal to request an appointment.');
  fields(body,['hostelId','requesterType','requesterContextId','requesterName','requesterEmail','requesterPhone','roomOrUnit','topic','category','date','timeSlot','mode','notes']);
  const schedule=meetingSchedule(body.date,body.timeSlot),topic=text(body.topic,200,1),notes=text(body.notes,3000);
  if(!categories.includes(body.category) || !modes.includes(body.mode))throw new ApiError(400,'Choose a supported appointment category and format.');
  let residence:string,manager:string,kind:string,participant:string|null=null,contact:any;
  if(a.kind==='manager') {
    residence=await staffManagerResidence(c,a,body.hostelId);manager=a.contextId;
    kind=body.requesterType==='student'?'resident':body.requesterType;
    if(!['resident','staff','external'].includes(kind))throw new ApiError(400,'Choose a resident, staff member or external contact.');
    if(kind==='external') {
      if(body.requesterContextId!==undefined)throw new ApiError(400,'External contacts do not have portal access.');
      const email=text(body.requesterEmail,254);if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new ApiError(400,'Enter the actual external contact email.');
      contact={display_name:text(body.requesterName,120,1),email,phone:text(body.requesterPhone,40),roomLabel:text(body.roomOrUnit,200),allocation:null,assignment:null};
    } else {
      if(['requesterName','requesterEmail','requesterPhone','roomOrUnit'].some(k=>body[k]!==undefined))throw new ApiError(400,'Internal participant details come from their verified account.');
      participant=uuid(body.requesterContextId);contact=await person(c,residence,participant,kind);
    }
  } else {
    if(['requesterType','requesterContextId','requesterName','requesterEmail','requesterPhone','roomOrUnit'].some(k=>body[k]!==undefined))throw new ApiError(400,'Request only for your own verified housing account.');
    if(Date.parse(schedule.starts)<=Date.now())throw new ApiError(400,'Choose a future appointment time.');
    if(a.kind==='resident')residence=(await residentRoom(c,a)).residence_id;
    else {const s=(await c.query("select residence_id from public.staff_assignments where staff_context_id=$1 and status='active' and ended_at is null",[a.contextId])).rows[0];if(!s)throw new ApiError(403,'Active staff employment required.');residence=s.residence_id;}
    if(body.hostelId!==undefined && body.hostelId!==residence)throw new ApiError(403,'Request appointments only within your active residence.');
    await c.query('select id from public.residences where id=$1 for update',[residence]);
    kind=a.kind;participant=a.contextId;contact=await person(c,residence,participant,kind);
    const managers=(await c.query(`select m.manager_context_id from public.manager_assignments m join public.account_contexts x on x.id=m.manager_context_id
      where m.residence_id=$1 and m.ended_at is null and x.status='active' and x.kind='manager' for share of m,x`,[residence])).rows;
    if(managers.length!==1)throw new ApiError(409,'This residence needs one available appointment manager. Contact residence support.');manager=managers[0].manager_context_id;
  }
  if(body.mode==='Phone Call' && !contact.phone)throw new ApiError(400,'Add a contact phone before scheduling a phone appointment.');
  const m=(await c.query(`insert into public.meetings(residence_id,requested_by_context_id,manager_context_id,participant_context_id,allocation_id,staff_assignment_id,
    requester_type,contact_name,contact_email,contact_phone,room_label,topic,category,starts_at,ends_at,mode,notes)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) returning *`,[residence,a.contextId,manager,participant,contact.allocation,contact.assignment,
      kind,contact.display_name,contact.email,contact.phone || '',contact.roomLabel,topic,body.category,schedule.starts,schedule.ends,body.mode,notes])).rows[0];
  await record(c,a,m,'meeting_requested');
  return detail(c,m.id);
}
function venue(value:unknown,mode:string){const v=text(value,2000);if(v && mode==='Google Meet / Video') {let u:URL;try{u=new URL(v);}catch{throw new ApiError(400,'Enter a real HTTPS meeting link.');}if(u.protocol!=='https:' || u.username || u.password)throw new ApiError(400,'Use a HTTPS meeting link without credentials.');}return v;}
type MeetingResult=ReturnType<typeof meetingRow> & {idempotent?:boolean};
export function updateMeeting(c:PoolClient,a:VerifiedActor,id:unknown,body:any,remove:true):Promise<{success:true;idempotent?:boolean}>;
export function updateMeeting(c:PoolClient,a:VerifiedActor,id:unknown,body:any,remove?:false):Promise<MeetingResult>;
export async function updateMeeting(c:PoolClient,a:VerifiedActor,id:unknown,body:any,remove=false):Promise<MeetingResult|{success:true;idempotent?:boolean}> {
  if(!['manager','resident','staff'].includes(a.kind))throw new ApiError(403,'Authorized housing portal required.');
  fields(body,a.kind==='manager'?['status','managerResponseNotes','meetingLinkOrVenue','date','timeSlot','mode']:['status']);
  if(remove && a.kind!=='manager')throw new ApiError(403,'Only the assigned manager may remove a meeting from the log.');
  const m=await target(c,a,id);
  if(m.removed_at) {if(remove)return {success:true,idempotent:true};throw new ApiError(409,'This meeting was removed from the log.');}
  let status=m.status,notes=m.response_notes,location=m.location || '',mode=m.mode,starts=new Date(m.starts_at).toISOString(),ends=new Date(m.ends_at).toISOString();
  if(body.status!==undefined){const selected=Object.entries(statuses).find(([,label])=>label===body.status);if(!selected)throw new ApiError(400,'Choose a supported meeting status.');status=selected[0];}
  if(a.kind!=='manager' && status!=='cancelled')throw new ApiError(403,'Participants may only cancel their own appointment.');
  if(remove && ['requested','accepted'].includes(status))status='cancelled';
  if(body.mode!==undefined){if(!modes.includes(body.mode))throw new ApiError(400,'Choose a supported meeting format.');mode=body.mode;}
  if(body.date!==undefined || body.timeSlot!==undefined){const s=meetingSchedule(body.date ?? starts.slice(0,10),body.timeSlot ?? slot(new Date(starts),new Date(ends)));starts=s.starts;ends=s.ends;}
  if(body.managerResponseNotes!==undefined)notes=text(body.managerResponseNotes,3000);
  if(body.meetingLinkOrVenue!==undefined)location=venue(body.meetingLinkOrVenue,mode);
  else location=venue(location,mode);
  const unchanged=status===m.status && notes===m.response_notes && location===(m.location || '') && mode===m.mode && starts===new Date(m.starts_at).toISOString() && ends===new Date(m.ends_at).toISOString();
  if(unchanged && !remove)return {...await detail(c,m.id),idempotent:true};
  const allowed=m.status==='requested'?['requested','accepted','declined','cancelled']:m.status==='accepted'?['accepted','completed','cancelled']:[];
  if(!allowed.includes(status) && !(remove && unchanged))throw new ApiError(409,'This appointment already has a final decision.');
  if(status==='accepted' && m.participant_context_id && (m.status!=='accepted' || starts!==new Date(m.starts_at).toISOString() || ends!==new Date(m.ends_at).toISOString() || mode!==m.mode)) {
    const current=await person(c,m.residence_id,m.participant_context_id,m.requester_type);
    if(current.allocation!==m.allocation_id || current.assignment!==m.staff_assignment_id)throw new ApiError(409,'The original participant housing relationship has ended.');
  }
  if(status==='completed' && Date.parse(starts)>Date.now())throw new ApiError(409,'A future appointment cannot be marked completed.');
  if(status==='declined' && !notes)throw new ApiError(400,'Explain why the appointment was declined.');
  if(status==='accepted' && mode==='Google Meet / Video' && !location)throw new ApiError(400,'Provide the actual video meeting link before approval.');
  const row=(await c.query(`update public.meetings set status=$2,response_notes=$3,location=$4,mode=$5,starts_at=$6,ends_at=$7,
    decided_at=case when $2 in ('accepted','declined') then coalesce(decided_at,now()) else decided_at end,
    completed_at=case when $2='completed' then now() else completed_at end,removed_at=case when $8 then now() else removed_at end,updated_at=now() where id=$1 returning *`,[m.id,status,notes,location || null,mode,starts,ends,remove])).rows[0];
  await record(c,a,row,remove?'meeting_removed':'meeting_updated');
  if(remove)return {success:true};
  return detail(c,m.id);
}
export function installMeetings(app:Express,auth:SupabaseAuth) {
  app.get('/api/meetings',auth.require(['manager','resident','staff','admin']),route(async(req,res)=>res.json(await auth.db.actor(req.actor,c=>meetingRows(c)))));
  app.get('/api/meetings/participants',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.actor(req.actor,c=>meetingParticipants(c,req.query.hostelId)))));
  app.post('/api/meetings',auth.require(['manager','resident','staff']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['manager','resident','staff'],c=>createMeeting(c,req.actor,req.body)))));
  app.put('/api/meetings/:id',auth.require(['manager','resident','staff']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager','resident','staff'],c=>updateMeeting(c,req.actor,req.params.id,req.body)))));
  app.delete('/api/meetings/:id',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager'],c=>updateMeeting(c,req.actor,req.params.id,{},true)))));
}
