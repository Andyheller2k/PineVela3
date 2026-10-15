import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { editStaff,staffManagerResidence } from './staff.js';
import { residentRoom,maintenanceResidence } from './maintenance.js';
import { notify } from './notifications.js';

const route=(work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler=>(req,res,next)=>{work(req as AuthRequest,res).catch(next);};
function fields(body:any,allowed:string[]) {
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!allowed.includes(k))) throw new ApiError(400,'Unsupported staff workflow fields.');
}
function text(value:unknown,max:number,min=0) {
  if (value===undefined && min===0) return '';
  if (typeof value!=='string' || value.length>max || value.trim().length<min) throw new ApiError(400,'Provide valid staff workflow text.');
  return value.trim();
}
async function record(c:PoolClient,a:VerifiedActor,b:any,event:string,message:string) {
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,$2,'staff_bargain',$3)",[a.contextId,event,b.id]);
  await notify(c,[b.manager_context_id,b.staff_context_id],{category:'staff_bargain',title:event.replace(/_/g,' '),message,sender:a.contextId});
}
async function assignment(c:PoolClient,a:VerifiedActor,id?:string) {
  const initial=(await c.query(`select residence_id from public.staff_assignments where ${id?'id=$1':'staff_context_id=$1 and status=\'active\' and ended_at is null'}`,[id || a.contextId])).rows[0];
  if(!initial)throw new ApiError(404,'Active staff employment not found.');
  if(a.kind==='manager')await staffManagerResidence(c,a,initial.residence_id);
  else if(a.kind==='staff')await c.query('select id from public.residences where id=$1 for update',[initial.residence_id]);
  else throw new ApiError(403,'Use an authorized staff or manager portal.');
  const s=(await c.query(`select s.*,p.display_name as staff_name from public.staff_assignments s
    join public.account_contexts x on x.id=s.staff_context_id join public.profiles p on p.id=x.auth_user_id
    where ${id?'s.id=$1':'s.staff_context_id=$1'} and s.status='active' and s.ended_at is null and x.kind='staff' and x.status='active'
      and ($2='manager' or (x.id=$3 and x.auth_user_id=$4)) for update of s,x`,[id || a.contextId,a.kind,a.contextId,a.authUserId])).rows[0];
  if(!s)throw new ApiError(403,'This active employment does not belong to your staff portal.');
  return s;
}
async function proposal(c:PoolClient,a:VerifiedActor,value:unknown) {
  const id=uuid(value),initial=(await c.query('select staff_assignment_id,manager_context_id from public.staff_bargains where id=$1',[id])).rows[0];
  if(!initial)throw new ApiError(404,'Retention proposal not found.');
  if(a.kind==='manager' && initial.manager_context_id!==a.contextId)throw new ApiError(404,'Retention proposal not found.');
  const s=await assignment(c,a,initial.staff_assignment_id);
  const b=(await c.query('select * from public.staff_bargains where id=$1 for update',[id])).rows[0];
  return {...b,staff_context_id:s.staff_context_id,staff_name:s.staff_name,residence_id:s.residence_id};
}
export async function createStaffBargain(c:PoolClient,a:VerifiedActor,body:any) {
  if(a.kind!=='staff')throw new ApiError(403,'Staff portal required.');
  fields(body,['reasonToQuit','isBargain','bargainProposal']);
  if(body.isBargain!==true)throw new ApiError(400,'Use the resignation action to end employment.');
  const reason=text(body.reasonToQuit,2000,5),p=body.bargainProposal;
  fields(p,['type','title','proposedTerms','notes']);
  if(!['salary','shift','wing','workload','custom'].includes(p.type))throw new ApiError(400,'Choose a valid retention proposal category.');
  const terms={type:p.type,title:text(p.title,200,1),proposedTerms:text(p.proposedTerms,8000,3),notes:text(p.notes,3000)};
  const s=await assignment(c,a);
  // The proposal's recipient comes from saved employment and an active residence
  // grant, never a submitted manager ID, name or mailbox alias.
  const manager=(await c.query(`select m.manager_context_id from public.manager_assignments m join public.account_contexts x on x.id=m.manager_context_id
    where m.manager_context_id=$1 and m.residence_id=$2 and m.ended_at is null and x.status='active' and x.kind='manager' for share of m,x`,[s.created_by_manager_id,s.residence_id])).rows[0];
  if(!manager)throw new ApiError(409,'Your employment manager is unavailable. Contact residence support.');
  if((await c.query("select id from public.staff_bargains where staff_assignment_id=$1 and status in ('proposed','declined')",[s.id])).rowCount)
    throw new ApiError(409,'Resolve your current proposal before submitting another.');
  const b=(await c.query(`insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id)
    values ($1,$2,$3,$4,$5,$6,$7) returning *`,[s.id,manager.manager_context_id,JSON.stringify(terms),reason,s.job_role,s.shift,s.assigned_block_id])).rows[0];
  await record(c,a,{...b,staff_context_id:s.staff_context_id},'retention_proposal_submitted',`${s.staff_name} submitted a retention proposal: ${terms.title}.`);
  return {success:true,bargainId:b.id};
}
export async function respondStaffBargain(c:PoolClient,a:VerifiedActor,value:unknown,body:any) {
  if(a.kind!=='manager')throw new ApiError(403,'Only the assigned manager may decide retention terms.');
  fields(body,['action','responseNote','updatedShift','updatedBlock']);
  if(!['accept','reject'].includes(body.action))throw new ApiError(400,'Choose accept or reject.');
  const note=text(body.responseNote,3000,body.action==='reject'?1:0),b=await proposal(c,a,value);
  const changes:Record<string,string>={};
  for(const k of ['updatedShift','updatedBlock'])if(body[k]!==undefined)changes[k]=text(body[k],200,1);
  if(body.action==='reject' && Object.keys(changes).length)throw new ApiError(400,'Declining a proposal cannot change employment terms.');
  const status=body.action==='accept'?'accepted':'declined';
  if(b.status===status && b.response_note===note && Object.keys(b.decision_fields).length===Object.keys(changes).length && Object.entries(changes).every(([k,v])=>b.decision_fields[k]===v))return {success:true,idempotent:true};
  if(b.status!=='proposed')throw new ApiError(409,'This proposal already has a manager decision.');
  if(body.action==='accept' && Object.keys(changes).length)await editStaff(c,a,b.staff_assignment_id,{
    ...(changes.updatedShift!==undefined?{shift:changes.updatedShift}:{}),...(changes.updatedBlock!==undefined?{assignedBlock:changes.updatedBlock}:{})
  });
  await c.query('update public.staff_bargains set status=$2,response_note=$3,decision_fields=$4,decided_at=now(),updated_at=now() where id=$1',[b.id,status,note,JSON.stringify(changes)]);
  await record(c,a,b,body.action==='accept'?'retention_proposal_accepted':'retention_proposal_declined',body.action==='accept'?`Your manager accepted the proposal.${note?' '+note:''}`:`Your manager declined the proposal: ${note} Choose whether to stay on current terms or resign.`);
  return {success:true};
}
export async function decideStaffBargain(c:PoolClient,a:VerifiedActor,value:unknown,body:any) {
  if(a.kind!=='staff')throw new ApiError(403,'Staff portal required.');
  fields(body,['decision']);if(!['stay','quit'].includes(body.decision))throw new ApiError(400,'Choose stay or quit.');
  const b=await proposal(c,a,value),status=body.decision==='stay'?'stay_confirmed':'quit_confirmed';
  if(b.status===status)return {success:true,idempotent:true,quit:body.decision==='quit'};
  if(b.status!=='declined')throw new ApiError(409,'Make this choice only after a declined proposal.');
  await c.query('update public.staff_bargains set status=$2,staff_decided_at=now(),updated_at=now() where id=$1',[b.id,status]);
  if(body.decision==='quit')await editStaff(c,a,b.staff_assignment_id,{reason:b.reason_to_quit},'resigned');
  await record(c,a,b,body.decision==='stay'?'staff_retention_confirmed':'staff_resignation_confirmed',body.decision==='stay'?`${b.staff_name} chose to stay on current employment terms.`:`${b.staff_name} resigned after the declined proposal. Reason: ${b.reason_to_quit}`);
  return {success:true,quit:body.decision==='quit'};
}
export async function createStaffReview(c:PoolClient,a:VerifiedActor,body:any) {
  fields(body,['staffId','rating','comment']);
  if(!Number.isInteger(body.rating) || body.rating<1 || body.rating>5)throw new ApiError(400,'Choose a rating from 1 to 5.');
  const comment=text(body.comment,3000),staffId=uuid(body.staffId),room=await residentRoom(c,a);
  await maintenanceResidence(c,a,room.residence_id);
  const current=await residentRoom(c,a,true);
  if(current.allocation_id!==room.allocation_id)throw new ApiError(409,'Your room allocation changed.');
  const s=(await c.query(`select s.id,s.staff_context_id from public.staff_assignments s join public.account_contexts x on x.id=s.staff_context_id
    where s.id=$1 and s.residence_id=$2 and s.status='active' and s.ended_at is null and x.status='active' for share of s,x`,[staffId,room.residence_id])).rows[0];
  if(!s)throw new ApiError(403,'Review only active staff of your activated residence.');
  const r=(await c.query(`insert into public.staff_reviews(allocation_id,staff_assignment_id,resident_context_id,rating,comment) values ($1,$2,$3,$4,$5) returning *`,[room.allocation_id,s.id,a.contextId,body.rating,comment])).rows[0];
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values ($1,'staff_review_submitted','staff_review',$2)",[a.contextId,r.id]);
  await notify(c,[s.staff_context_id],{category:'staff_review',title:'Resident Staff Review',message:`A resident in your residence submitted a ${r.rating}/5 staff review.`,sender:a.contextId});
  return {id:r.id,staffId:s.id,hostelId:room.residence_id,reviewerId:a.contextId,rating:r.rating,comment:r.comment,createdAt:r.created_at};
}
export async function staffReviews(c:PoolClient,filter?:unknown) {
  const id=filter===undefined?null:uuid(filter);
  return (await c.query('select * from private.housing_staff_reviews where ($1::uuid is null or staff_assignment_id=$1) order by created_at desc limit 1000',[id])).rows.map(r=>({
    id:r.id,staffId:r.staff_assignment_id,hostelId:r.residence_id,reviewerId:r.resident_context_id,reviewerName:r.reviewer_name,rating:r.rating,comment:r.comment,createdAt:r.created_at
  }));
}
export function installStaffRetention(app:Express,auth:SupabaseAuth) {
  app.post('/api/staff-bargains',auth.require(['staff']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['staff'],c=>createStaffBargain(c,req.actor,req.body)))));
  app.post('/api/staff-bargains/:id/manager-response',auth.require(['manager']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['manager'],c=>respondStaffBargain(c,req.actor,req.params.id,req.body)))));
  app.post('/api/staff-bargains/:id/staff-decision',auth.require(['staff']),route(async(req,res)=>res.json(await auth.db.authorizedSystem(req.actor,['staff'],c=>decideStaffBargain(c,req.actor,req.params.id,req.body)))));
  app.get('/api/staff-reviews',auth.require(['manager','staff','resident']),route(async(req,res)=>res.json(await auth.db.actor(req.actor,c=>staffReviews(c,req.query.staffId)))));
  app.post('/api/staff-reviews',auth.require(['resident']),route(async(req,res)=>res.status(201).json(await auth.db.authorizedSystem(req.actor,['resident'],c=>createStaffReview(c,req.actor,req.body)))));
}
