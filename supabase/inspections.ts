import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import { SupabaseAuth,type AuthRequest } from './auth.js';
import { notify,notifyPrimaryOwner } from './notifications.js';
import { buildInspectionReport,InspectionSubmissionError } from '../inspectionReportSecurity.js';
import { ownedMedia } from './media.js';
const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => { work(req as AuthRequest,res).catch(next); };
const text = (value:unknown,max:number,minimum=0) => {
  if (typeof value !== 'string' || value.trim().length < minimum || value.trim().length > max) throw new ApiError(400,'Check the notes and field lengths.');
  return value.trim();
};
async function administrators(client:PoolClient) {
  return (await client.query(`select c.id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id
    where c.status = 'active' and m.status = 'active' and c.kind = 'admin'`)).rows.map(row => row.id);
}
async function audit(client:PoolClient,actor:VerifiedActor,type:string,id:string,data:unknown) {
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,$2,$3,$4,$5)`,[actor.contextId,type,type === 'officer_status_changed' ? 'officer' : 'verification_case',id,JSON.stringify(data)]);
}
/** These helpers run only inside authorizedSystem's live actor transaction. */
async function dossier(client:PoolClient,id:string) {
  const record = (await client.query(`select v.*,p.display_name as manager_name,c.status as manager_status
    from public.verification_cases v join public.account_contexts c on c.id = v.applicant_context_id
    join public.residences r on r.id = v.residence_id and r.primary_owner_id = c.primary_owner_id
    join public.profiles p on p.id = c.auth_user_id where v.id = $1 and v.kind = 'manager_registration'
    and c.kind = 'manager' for update of v,c`,[id])).rows[0];
  if (!record) throw new ApiError(404,'Manager registration not found.');
  return record;
}
export async function dispatchInspection(client:PoolClient,actor:VerifiedActor,caseId:string,officerId:string,priority:string,notes:string) {
  if (actor.kind !== 'admin') throw new ApiError(403,'Administrator access required.');
  if (!['low','medium','high','urgent'].includes(priority)) throw new ApiError(400,'Invalid dispatch priority.');
  notes = text(notes,4000);
  const record = await dossier(client,caseId);
  if (record.manager_status !== 'pending' || !['inspection_pending','under_review','more_info_required'].includes(record.status)) throw new ApiError(409,'This registration cannot receive a dispatch.');
  const officer = (await client.query(`select c.id,p.display_name from public.account_contexts c join public.profiles p on p.id = c.auth_user_id
    where c.id = $1 and c.kind = 'officer' and c.status = 'active' for share of c`,[officerId])).rows[0];
  if (!officer) throw new ApiError(409,'Choose an active registered verification officer.');
  const prior = (await client.query(`select * from public.verification_inspections where case_id = $1
    and status in ('assigned','in_progress','submitted') for update`,[caseId])).rows[0];
  if (prior) {
    if (prior.officer_context_id === officerId && prior.priority === priority && prior.dispatch_notes === notes) return { id:prior.id,alreadyDispatched:true };
    throw new ApiError(409,'A live dispatch already exists. Review its report before requesting another inspection.');
  }
  const inspection = (await client.query(`insert into public.verification_inspections(case_id,officer_context_id,dispatched_by_context_id,priority,dispatch_notes)
    values ($1,$2,$3,$4,$5) returning id`,[caseId,officerId,actor.contextId,priority,notes])).rows[0];
  await client.query("update public.verification_cases set status = 'inspection_pending',reviewed_at = null,reviewed_by_context_id = null where id = $1",[caseId]);
  await notify(client,[officerId],{ category:'verification',title:`New Dispatch: ${record.submitted_data.name}`,
    message:`You have been assigned to inspect "${record.submitted_data.name}" at ${record.submitted_data.location}.`,sender:actor.contextId });
  await notifyPrimaryOwner(client,record.applicant_context_id,{category:'verification',title:'PineVela Verification Team Dispatched',
    message:`PineVela Verification Officer ${officer.display_name} has been assigned to visit and physically inspect "${record.submitted_data.name}". Please ensure you or an authorized representative are available.`,sender:actor.contextId});
  await notify(client,await administrators(client),{category:'verification',title:'Verification Team Dispatched',
    message:`${officer.display_name} was dispatched to inspect "${record.submitted_data.name}".`,sender:actor.contextId});
  await audit(client,actor,'inspection_dispatched',caseId,{inspectionId:inspection.id,officerContextId:officerId,priority,notes});
  return {...inspection,alreadyDispatched:false};
}
export async function submitInspection(client:PoolClient,actor:VerifiedActor,id:string,body:any) {
  if (actor.kind !== 'officer') throw new ApiError(403,'Verification officer access required.');
  // Lock the dossier before its dispatch, matching the administrator lock order.
  const linked = (await client.query('select case_id from public.verification_inspections where id = $1 and officer_context_id = $2',[id,actor.contextId])).rows[0];
  if (!linked) throw new ApiError(404,'Assigned inspection not found.');
  const record = await dossier(client,linked.case_id);
  const inspection = (await client.query('select * from public.verification_inspections where id = $1 and officer_context_id = $2 for update',[id,actor.contextId])).rows[0];
  if (!inspection || !['assigned','in_progress'].includes(inspection.status) || !['inspection_pending','under_review','more_info_required'].includes(record.status))
    throw new ApiError(409,'This inspection has already been submitted or decided.');
  if (body?.photos !== undefined && (!Array.isArray(body.photos) || body.photos.length > 12)) throw new ApiError(400,'Use at most twelve uploaded inspection photographs.');
  const photoUrls = new Set<string>();
  for (const photo of body?.photos || []) {
    text(photo?.title,200,1);
    if (typeof photo?.capturedAt !== 'string' || !Number.isFinite(Date.parse(photo.capturedAt)) || Date.parse(photo.capturedAt) > Date.now() + 300000) throw new ApiError(400,'Enter a valid photograph capture time.');
    await ownedMedia(client,actor,photo?.url,'inspection',id);
    if (photoUrls.has(photo.url)) throw new ApiError(400,'Each inspection photograph must be distinct.');
    photoUrls.add(photo.url);
  }
  text(body?.observations,12000,10);
  if (body?.propertyDetails?.buildingStructure !== undefined) text(body.propertyDetails.buildingStructure,2000);
  if (body?.gpsCoordinates?.accuracyMeters !== undefined && (typeof body.gpsCoordinates.accuracyMeters !== 'number' || !Number.isFinite(body.gpsCoordinates.accuracyMeters) || body.gpsCoordinates.accuracyMeters < 0)) throw new ApiError(400,'Invalid GPS accuracy.');
  if (body?.gpsCoordinates?.capturedAddress !== undefined) text(body.gpsCoordinates.capturedAddress,600);
  for (const field of ['estimatedRooms','estimatedBeds']) {
    const value = body?.propertyDetails?.[field];
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > 100000)) throw new ApiError(400,'Invalid estimated property capacity.');
  }
  const person = (await client.query('select display_name,email from public.profiles where id = $1',[actor.authUserId])).rows[0];
  let report:any;
  try { report = buildInspectionReport(body,{id:actor.contextId,fullName:person.display_name,email:person.email}); }
  catch (error) { if (error instanceof InspectionSubmissionError) throw new ApiError(error.status,error.message); throw error; }
  await client.query("update public.verification_inspections set status = 'submitted',report = $2,submitted_at = now() where id = $1",[id,JSON.stringify(report)]);
  await client.query("update public.verification_cases set status = 'under_review' where id = $1",[record.id]);
  await notify(client,await administrators(client),{category:'verification',title:`Verification Report Submitted: ${record.submitted_data.name}`,
    message:`Officer ${person.display_name} submitted a physical inspection report. Recommendation: ${report.recommendation}.`,sender:actor.contextId});
  await notifyPrimaryOwner(client,record.applicant_context_id,{category:'verification',title:'Verification Report Submitted',
    message:`The physical inspection report for "${record.submitted_data.name}" has been submitted for administrator review.`,sender:actor.contextId});
  await audit(client,actor,'inspection_report_submitted',record.id,{inspectionId:id,recommendation:report.recommendation});
  return {id,report,status:'report_submitted'};
}
export async function decideManager(client:PoolClient,actor:VerifiedActor,id:string,decision:'approved'|'rejected'|'more_info_required',notes:string) {
  if (actor.kind !== 'admin') throw new ApiError(403,'Administrator access required.');
  notes = text(notes,4000,decision === 'approved' ? 0 : 5);
  const record = await dossier(client,id);
  if (record.status === decision) {
    if ((record.review_notes || '') !== notes) throw new ApiError(409,'A saved decision cannot be rewritten by a retry.');
    return {id,status:decision,alreadyDecided:true};
  }
  if (['approved','rejected','suspended'].includes(record.status)) throw new ApiError(409,'This registration already has a final decision.');
  const inspection = (await client.query(`select * from public.verification_inspections where case_id = $1
    and status in ('assigned','in_progress','submitted') for update`,[id])).rows[0];
  if (decision === 'approved' && (!inspection || inspection.status !== 'submitted' || !inspection.report || record.manager_status !== 'pending'))
    throw new ApiError(409,'A submitted physical inspection report and pending manager account are required for approval.');
  if (inspection && decision === 'approved' && inspection.report.recommendation !== 'recommend_approval' && notes.length < 5)
    throw new ApiError(400,'Explain the decision to approve despite the inspection recommendation.');
  if (decision === 'approved') {
    const bans = await client.query(`select 1 from public.registration_bans b join public.account_contexts c on c.id = b.account_context_id
      join public.account_contexts target on target.id = $1 where b.until_at > now() and b.kind in ('manager_account','residence')
      and coalesce(c.primary_owner_id,c.auth_user_id) = target.primary_owner_id`,[record.applicant_context_id]);
    if (bans.rowCount) throw new ApiError(409,'This manager registration is restricted by an active ban.');
    const assignment = await client.query(`select id from public.manager_assignments where manager_context_id = $1 and residence_id = $2 and ended_at is null for update`,[record.applicant_context_id,record.residence_id]);
    if (assignment.rowCount !== 1) throw new ApiError(409,'An unambiguous saved manager assignment is required.');
    await client.query("update public.account_contexts set status = 'active',updated_at = now() where id = $1",[record.applicant_context_id]);
    const residence = await client.query("update public.residences set status = 'approved',updated_at = now() where id = $1 and status = 'inspection'",[record.residence_id]);
    if (residence.rowCount !== 1) throw new ApiError(409,'The saved residence is not awaiting inspection approval.');
  } else if (decision === 'rejected') {
    await client.query("update public.account_contexts set status = 'rejected',updated_at = now() where id = $1 and status = 'pending'",[record.applicant_context_id]);
    await client.query("update public.residences set status = 'rejected',updated_at = now() where id = $1 and status = 'inspection'",[record.residence_id]);
  }
  if (inspection) await client.query(`update public.verification_inspections set status = $2,reviewed_at = now(),reviewed_by_context_id = $3 where id = $1`,
    [inspection.id,decision === 'approved' ? 'accepted' : 'rejected',actor.contextId]);
  await client.query('update public.verification_cases set status = $2,reviewed_at = now(),reviewed_by_context_id = $3,review_notes = $4 where id = $1',[id,decision,actor.contextId,notes]);
  const label = decision === 'approved' ? 'Approved!' : decision === 'rejected' ? 'Rejected' : 'More Information Required';
  await notifyPrimaryOwner(client,record.applicant_context_id,{category:decision === 'approved' ? 'success' : 'verification',title:`Manager Account ${label}`,
    message:`${record.manager_name}, your Manager Account for "${record.submitted_data.name}" is ${decision.replaceAll('_',' ')}.${notes ? ' ' + notes : ''}`,sender:actor.contextId});
  await notify(client,await administrators(client),{category:'verification',title:`Manager Registration ${label}`,
    message:`The registration for "${record.submitted_data.name}" is ${decision.replaceAll('_',' ')}.`,sender:actor.contextId});
  await audit(client,actor,'manager_registration_decided',id,{decision,notes,inspectionId:inspection?.id || null});
  return {id,status:decision,alreadyDecided:false};
}
export async function inspectionRows(client:PoolClient,actor:VerifiedActor) {
  if (!['admin','officer'].includes(actor.kind)) throw new ApiError(403,'Inspection access required.');
  return (await client.query(`select i.id,i.case_id as "managerVerificationId",v.applicant_context_id as "managerId",
    p.display_name as "managerName",p.email as "managerEmail",p.phone as "managerPhone",v.submitted_data->>'name' as "hostelName",
    v.submitted_data->>'location' as location,v.submitted_data->>'digitalAddress' as "digitalAddress",
    i.officer_context_id as "assignedOfficerId",o.display_name as "assignedOfficerName",o.email as "assignedOfficerEmail",
    i.assigned_at as "dispatchedAt",i.dispatched_by_context_id as "dispatchedBy",i.priority,i.dispatch_notes as "adminDispatchNotes",i.report,
    case i.status when 'assigned' then 'dispatched' when 'in_progress' then 'dispatched' when 'submitted' then 'report_submitted'
      when 'accepted' then 'approved' else 'rejected' end as status
    from public.verification_inspections i join public.verification_cases v on v.id = i.case_id
    join public.account_contexts c on c.id = v.applicant_context_id join public.profiles p on p.id = c.auth_user_id
    join public.account_contexts oc on oc.id = i.officer_context_id join public.profiles o on o.id = oc.auth_user_id
    where ($1::boolean or i.officer_context_id = $2) order by i.assigned_at desc limit 500`,[actor.kind === 'admin',actor.contextId])).rows;
}
export function installInspections(app:Express,auth:SupabaseAuth) {
  app.get(['/api/manager-verifications','/api/manager-requests'],auth.require(['admin','manager']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin','manager'],async c =>
    (await c.query(`select v.id,v.applicant_context_id as \"managerId\",p.display_name as \"managerName\",p.email as \"managerEmail\",p.phone as \"managerPhone\",
      v.residence_id as \"residenceId\",v.submitted_data->>'name' as \"hostelName\",v.submitted_data->>'location' as location,
      v.submitted_data->>'digitalAddress' as \"digitalAddress\",v.status,v.review_notes as \"adminNotes\",v.submitted_at as \"createdAt\",v.reviewed_at as \"reviewedAt\"
      from public.verification_cases v join public.account_contexts ac on ac.id = v.applicant_context_id
      join public.profiles p on p.id = ac.auth_user_id where v.kind = 'manager_registration' and ($1::boolean or v.applicant_context_id = $2)
      order by v.submitted_at desc limit 500`,[req.actor.kind === 'admin',req.actor.contextId])).rows))));
  const read = route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin','officer'],c => inspectionRows(c,req.actor))));
  app.get(['/api/admin/verification-inspections','/api/verification-inspections'],auth.require(['admin']),read);
  app.get('/api/verification-team/my-inspections',auth.require(['officer']),read);
  app.get('/api/verification-teams',auth.require(['admin']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin'],async c =>
    (await c.query(`select ac.id,p.display_name as "fullName",p.email,p.phone,ac.status,ac.created_at as "createdAt"
      from public.account_contexts ac join public.profiles p on p.id = ac.auth_user_id where ac.kind = 'officer' order by ac.created_at`)).rows))));
  app.put('/api/verification-teams/:id/status',auth.require(['admin']),route(async (req,res) => {
    if (!['active','suspended','inactive'].includes(req.body?.status) || Object.keys(req.body).some(key => key !== 'status')) throw new ApiError(400,'Choose active, suspended or inactive.');
    const officer = await auth.db.authorizedSystem(req.actor,['admin'],async c => {
      const id = uuid(req.params.id),status = req.body.status === 'inactive' ? 'closed' : req.body.status;
      const row = (await c.query("update public.account_contexts set status = $2,updated_at = now() where id = $1 and kind = 'officer' returning id,status",[id,status])).rows[0];
      if (!row) throw new ApiError(404,'Registered officer not found.');
      await c.query('delete from private.account_sessions where active_context_id = $1',[id]);
      await audit(c,req.actor,'officer_status_changed',id,{status});
      await notify(c,await administrators(c),{category:'verification',title:'Verification Officer Status Updated',message:`A registered verification officer is now ${req.body.status}.`,sender:req.actor.contextId});
      return row;
    });
    return res.json({success:true,officer});
  }));
  app.get('/api/verification-team/me',auth.require(['officer']),route(async (req,res) => res.json(await auth.db.actor(req.actor,async c =>
    (await c.query('select $2::uuid as id,p.display_name as "fullName",p.email,p.phone from public.profiles p where p.id = $1',[req.actor.authUserId,req.actor.contextId])).rows[0]))));
  app.post('/api/admin/dispatch-verification-team',auth.require(['admin']),route(async (req,res) => {
    const result = await auth.db.authorizedSystem(req.actor,['admin'],c => dispatchInspection(c,req.actor,uuid(req.body?.managerVerificationId),uuid(req.body?.assignedOfficerId),req.body?.priority || 'medium',req.body?.adminDispatchNotes || req.body?.dispatchNotes || ''));
    return res.status(result.alreadyDispatched ? 200 : 201).json({success:true,inspection:result});
  }));
  app.post('/api/verification-team/inspections/:id/submit-report',auth.require(['officer']),route(async (req,res) =>
    res.json({success:true,...await auth.db.authorizedSystem(req.actor,['officer'],c => submitInspection(c,req.actor,uuid(req.params.id),req.body))})));
  app.put(['/api/manager-requests/:id/approve','/api/manager-verifications/:id/approve'],auth.require(['admin']),route(async (req,res) =>
    res.json({success:true,verification:await auth.db.authorizedSystem(req.actor,['admin'],c => decideManager(c,req.actor,uuid(req.params.id),'approved',req.body?.adminNotes || ''))})));
  app.put(['/api/manager-requests/:id/reject','/api/manager-verifications/:id/reject'],auth.require(['admin']),route(async (req,res) =>
    res.json({success:true,verification:await auth.db.authorizedSystem(req.actor,['admin'],c => decideManager(c,req.actor,uuid(req.params.id),'rejected',req.body?.adminNotes || req.body?.rejectionReason || req.body?.reason || ''))})));
  app.put('/api/manager-verifications/:id/request-info',auth.require(['admin']),route(async (req,res) =>
    res.json({success:true,verification:await auth.db.authorizedSystem(req.actor,['admin'],c => decideManager(c,req.actor,uuid(req.params.id),'more_info_required',req.body?.adminNotes || ''))})));
}
