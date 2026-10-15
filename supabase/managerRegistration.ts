import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import { SupabaseAuth,type AuthRequest } from './auth.js';
import { ownedEnrollment } from './enrollment.js';
import { notify } from './notifications.js';
import {managerRegistrationRestricted} from './registrationRestrictions.js';
import {checkProfileContext} from './profiles.js';
type Property = { name:string;location:string;latitude:number;longitude:number;landmark:string;description:string };
export function managerProperty(body:any):Property {
  const text = (value:unknown,maximum:number) => {
    if (typeof value !== 'string' || value.trim().length > maximum) throw new ApiError(400,'Check the residence details and field lengths.');
    return value.trim();
  };
  const name = text(body?.hostelName || body?.residenceName,200),location = text(body?.location || body?.address,600);
  const landmark = text(body?.landmark || '',200),description = text(body?.description || '',4000);
  const latitude = body?.latitude,longitude = body?.longitude;
  if (!name || location.length < 4) throw new ApiError(400,'Enter the residence name and street address or selected map location.');
  // Text mentions are not geographic proof. Match the existing Kumasi bounding
  // box, but enforce it on actual coordinates rather than trusting an address.
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
      latitude < 6.50 || latitude > 6.85 || longitude < -1.75 || longitude > -1.40 || body?.knustAccreditedConfirmed !== true)
    throw new ApiError(400,'Select an actual Kumasi location and confirm KNUST accreditation.');
  return { name,location,latitude,longitude,landmark,description };
}
/** Caller must have locked a live primary actor in authorizedSystem. */
export async function submitManagerRegistration(client:PoolClient,actor:VerifiedActor,enrollmentId:string,property:Property) {
  const enrollment = await ownedEnrollment(client,actor,enrollmentId);
  if (enrollment.kind !== 'manager' || !enrollment.verified_at || !['pending_review','completed'].includes(enrollment.status))
    throw new ApiError(409,'Verify the manager work email before submitting registration.');
  // Inspection decisions and owner corrections serialize before either locks
  // the child context/case. The target comes from the owned enrollment.
  await client.query("select pg_advisory_xact_lock(hashtextextended('manager-registration:' || $1::text,0))",[enrollment.linked_context_id]);
  const person = (await client.query(`select p.display_name,p.email,p.phone from public.profiles p
    join public.account_contexts c on c.auth_user_id = p.id join auth.users u on u.id = p.id
    where c.id = $1 and c.kind = 'manager' and c.primary_owner_id = $2 and p.primary_owner_id = $2
      and c.status = 'pending' and u.email_confirmed_at is not null and lower(u.email) = $3 for share of c,p`,
    [enrollment.linked_context_id,actor.authUserId,enrollment.invited_email])).rows[0];
  if (!person) throw new ApiError(409,'This verified manager identity is not awaiting registration.');
  const identity = { managerId:enrollment.linked_context_id,managerName:person.display_name,managerEmail:person.email,
    managerPhone:person.phone,hostelName:property.name,location:property.location };
  if (await managerRegistrationRestricted(client,enrollment.linked_context_id))
    throw new ApiError(403,'Registration is temporarily restricted for this account.');
  const prior = (await client.query(`select v.* from public.verification_cases v
    where v.applicant_context_id = $1 and v.kind = 'manager_registration' and v.manager_generation=$2
    order by v.submitted_at desc limit 1 for update`,[enrollment.linked_context_id,enrollment.manager_generation])).rows[0];
  if (prior) {
    const old = prior.submitted_data;
    const unchanged = JSON.stringify(Object.entries(old).sort()) === JSON.stringify(Object.entries(property).sort());
    if (prior.withdrawn_by_wipe_id) throw new ApiError(409,'This manager registration has been withdrawn.');
    if (prior.status !== 'more_info_required') {
      if (!unchanged)
      throw new ApiError(409,'A manager registration already exists. Use its review workflow to submit changes.');
      return { ...identity,id:prior.id,residenceId:prior.residence_id,status:prior.status,alreadySubmitted:true };
    }
    if (unchanged) throw new ApiError(400,'Update the property details requested by the administrator before resubmitting.');
    const residence = (await client.query(`select r.id from public.residences r
      join public.manager_assignments a on a.residence_id=r.id and a.manager_context_id=$2 and a.ended_at is null
      where r.id=$1 and r.primary_owner_id=$3 and r.status='inspection'
      and not exists(select 1 from public.verification_cases where residence_id=r.id and kind='residence_registration')
      and not exists(select 1 from public.blocks where residence_id=r.id) for update of r,a`,
      [prior.residence_id,enrollment.linked_context_id,actor.authUserId])).rows;
    if (residence.length !== 1 || (await client.query(`select 1 from public.verification_inspections
      where case_id=$1 and status in ('assigned','in_progress','submitted')`,[prior.id])).rowCount)
      throw new ApiError(409,'This application cannot be corrected while an inspection or residence setup is active.');
    // Older dispatch audit entries did not snapshot the property. Preserve their
    // target before changing the dossier, without rewriting historical events.
    await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
      select $1,'inspection_property_preserved','verification_case',$2,jsonb_build_object('inspectionId',i.id,'property',$3::jsonb)
      from public.verification_inspections i where i.case_id=$2 and not exists(select 1 from private.audit_events a
        where a.resource_id=$2 and a.event_type in ('inspection_dispatched','inspection_property_preserved')
        and a.event_data->>'inspectionId'=i.id::text and jsonb_typeof(a.event_data->'property')='object')`,
      [actor.contextId,prior.id,JSON.stringify(old)]);
    await client.query(`update public.residences set name=$2,location=$3,latitude=$4,longitude=$5,landmark=$6,description=$7,updated_at=now()
      where id=$1`,[prior.residence_id,property.name,property.location,property.latitude,property.longitude,property.landmark,property.description]);
    await client.query(`update public.verification_cases set submitted_data=$2,status='inspection_pending',submitted_at=now(),
      reviewed_at=null,reviewed_by_context_id=null,review_notes=null where id=$1`,[prior.id,JSON.stringify(property)]);
    await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
      values($1,'manager_registration_corrected','verification_case',$2,$3)`,[actor.contextId,prior.id,JSON.stringify({
        managerContextId:enrollment.linked_context_id,residenceId:prior.residence_id,before:old,after:property,
        previousSubmittedAt:prior.submitted_at,previousReview:{status:prior.status,notes:prior.review_notes,reviewedAt:prior.reviewed_at,reviewedBy:prior.reviewed_by_context_id},requiresFreshInspection:true})]);
    await notify(client,[actor.contextId],{category:'verification',title:'Manager Application Corrections Submitted',
      message:`Your corrections for "${property.name}" have been received. A fresh physical inspection is required before manager approval.`,sender:actor.contextId,link:'/user/dashboard?tab=notifications'});
    const administrators=(await client.query(`select c.id from public.account_contexts c join public.admin_memberships m on m.context_id=c.id
      where c.kind='admin' and c.status='active' and m.status='active'`)).rows.map(r=>r.id);
    await notify(client,administrators,{category:'verification',title:'Manager Application Corrections Submitted',
      message:`${person.display_name} corrected "${property.name}". Dispatch a fresh physical inspection before reviewing manager approval.`,sender:actor.contextId,link:'/admin/dashboard'});
    return {...identity,id:prior.id,residenceId:prior.residence_id,status:'inspection_pending',alreadySubmitted:false,corrected:true};
  }
  const residence = (await client.query(`insert into public.residences(primary_owner_id,name,location,description,contact_phone,contact_email,
    status,latitude,longitude,landmark,city,region,knust_accredited_confirmed)
    values ($1,$2,$3,$4,$5,$6,'inspection',$7,$8,$9,'Kumasi','Ashanti Region',true) returning id`,
    [actor.authUserId,property.name,property.location,property.description,person.phone,person.email,property.latitude,property.longitude,property.landmark])).rows[0].id;
  await client.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)',[enrollment.linked_context_id,residence]);
  const record = (await client.query(`insert into public.verification_cases(applicant_context_id,residence_id,kind,status,submitted_data)
    values ($1,$2,'manager_registration','inspection_pending',$3) returning id,status`,[enrollment.linked_context_id,residence,JSON.stringify(property)])).rows[0];
  await client.query("update private.account_enrollments set status = 'completed',residence_id = $2 where id = $1",[enrollment.id,residence]);
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'manager_registration_submitted','verification_case',$2,$3)`,[actor.contextId,record.id,JSON.stringify({ managerContextId:enrollment.linked_context_id,residenceId:residence })]);
  await notify(client,[actor.contextId],{ category:'verification',title:'Manager Account Registered - Inspection Pending',
    message:`Your Manager Account for "${property.name}" has been received. A PineVela verification team will visit and inspect the property in person before your account is approved.`,sender:actor.contextId,link:'/user/dashboard?tab=notifications' });
  const administrators = (await client.query(`select c.id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id
    where c.kind = 'admin' and c.status = 'active' and m.status = 'active'`)).rows.map(r => r.id);
  await notify(client,administrators,{ category:'verification',title:'Manager Registration Submitted',
    message:`${person.display_name} submitted "${property.name}" for physical inspection and manager approval.`,sender:actor.contextId,link:'/admin/dashboard' });
  return { ...identity,id:record.id,residenceId:residence,status:record.status,alreadySubmitted:false };
}
export function installManagerRegistration(app:Express,auth:SupabaseAuth) {
  const submit:RequestHandler = (req,res,next) => {
    const actor = (req as AuthRequest).actor;
    let property:Property,enrollment:string;
    try { checkProfileContext(actor,req.headers['x-pinevela-profile-context']);property = managerProperty(req.body);enrollment = uuid(req.body?.enrollmentId); } catch (error) { return next(error); }
    auth.db.authorizedSystem(actor,['primary'],client => submitManagerRegistration(client,actor,enrollment,property))
      .then(record => res.status(record.alreadySubmitted || 'corrected' in record ? 200 : 201).json({ success:true,verification:record }))
      .catch(error => next((error as any)?.code === '23505' ? new ApiError(409,'A registration for this manager already exists.') : error));
  };
  app.post(['/api/auth/register-manager','/api/auth/register-manager-account','/api/manager-verifications/submit'],auth.require(['primary']),submit);
}
