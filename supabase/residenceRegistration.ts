import type { Express,RequestHandler } from 'express';
import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import type { SupabaseAuth,AuthRequest } from './auth.js';
import { internationalPhone } from '../internationalPhone.js';
import { retiredHostelFields } from '../hostelRegistrationFields.js';
import { parseResidenceStructure,createResidenceStructure,residenceStructure } from './residenceStructure.js';
import { ownedMedia } from './media.js';
import { notify,notifyPrimaryOwner } from './notifications.js';
const text = (value:unknown,max:number,required=false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) throw new ApiError(400,'Check the residence fields and their lengths.');
  return value.trim();
};
const optional = (value:unknown,max:number) => text(value ?? '',max);
export function parseResidenceRegistration(body:any) {
  if (!body || typeof body !== 'object' || Object.keys(body).some(k => retiredHostelFields.has(k))) throw new ApiError(400,'Use the current residence registration fields.');
  const name = text(body.name,200,true),addressLine1 = text(body.addressLine1,600,true);
  const digitalAddress = text(body.digitalAddress,20,true).toUpperCase();
  if (!/^[A-Z]{2}-\d{3}-\d{4}$/.test(digitalAddress)) throw new ApiError(400,'Enter a valid GhanaPost digital address.');
  const latitude = body.latitude,longitude = body.longitude;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < 6.5 || latitude > 6.85 || longitude < -1.75 || longitude > -1.4)
    throw new ApiError(400,'Use the actual verified Kumasi map location.');
  const contactEmail = text(body.contactEmail,254,true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) throw new ApiError(400,'Enter a valid property contact email.');
  let contactPhone:string;
  try { contactPhone = internationalPhone(body.contactPhone,body.contactPhoneCountry).number; }
  catch (error) { throw new ApiError(400,(error as Error).message); }
  let alternativePhone = optional(body.alternativePhone,40);
  if (alternativePhone) try { alternativePhone = internationalPhone(alternativePhone,body.contactPhoneCountry).number; }
  catch { throw new ApiError(400,'Enter a valid alternative contact number for the chosen country.'); }
  const website = optional(body.website,2048);
  if (website) { let url:URL;try {url = new URL(website);} catch {throw new ApiError(400,'Enter a full website URL.');}
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new ApiError(400,'Use an HTTP or HTTPS website URL.'); }
  if (!['Male','Female','Mixed'].includes(body.genderCategory)) throw new ApiError(400,'Choose the residence gender category.');
  if (!['Hostel','Inn','Hotel','Estate'].includes(body.wing)) throw new ApiError(400,'Choose the property category.');
  if (!Number.isSafeInteger(body.yearEstablished) || body.yearEstablished < 1000 || body.yearEstablished > new Date().getFullYear()) throw new ApiError(400,'Enter the actual establishment year.');
  const paymentFrequency = text(body.paymentFrequency,60,true);
  if (!['Per Night','Per Day','Per Week','Monthly','Weekend Package','Quarterly','Bi-Annually','Per Year','Per Academic Year','Per Semester'].includes(paymentFrequency)) throw new ApiError(400,'Choose a supported stay cycle.');
  if (body.agreeTerms !== true || body.accuracyCertified !== true) throw new ApiError(400,'Confirm the registration terms and accuracy of these details.');
  if (!Array.isArray(body.gallery) || body.gallery.length < 1 || body.gallery.length > 3 || new Set(body.gallery).size !== body.gallery.length) throw new ApiError(400,'Upload one to three distinct residence gallery photographs.');
  const blocksList = parseResidenceStructure(body.blocksList);
  return {name,description:optional(body.description,4000),propertyType:text(body.hostelType,120,true),genderCategory:body.genderCategory as string,
    wing:body.wing as string,yearEstablished:body.yearEstablished as number,contactEmail,contactPhone,contactPhoneCountry:body.contactPhoneCountry as string,
    alternativePhone,website,addressLine1,addressLine2:optional(body.addressLine2,600),city:text(body.city,120,true),region:text(body.region,120,true),
    district:optional(body.district,120),country:text(body.country,120,true),postalCode:optional(body.postalCode,40),digitalAddress,landmark:optional(body.landmark,200),
    campusProximity:optional(body.campusProximity,120),campusProximityDetails:optional(body.campusProximityDetails,600),latitude,longitude,
    imageUrl:text(body.imageUrl,100,true),gallery:body.gallery.map((p:unknown) => text(p,100,true)),paymentFrequency,blocksList,agreeTerms:true,accuracyCertified:true};
}
type Registration = ReturnType<typeof parseResidenceRegistration>;
async function assignedResidence(client:PoolClient,actor:VerifiedActor,id?:string,lock=false) {
  if (actor.kind !== 'manager') throw new ApiError(403,'Sign in to the verified manager account.');
  const rows = (await client.query(`select r.* from public.residences r join public.manager_assignments a on a.residence_id = r.id
    join public.account_contexts c on c.id = a.manager_context_id where a.manager_context_id = $1 and a.ended_at is null
    and c.kind = 'manager' and c.status = 'active' and r.primary_owner_id = c.primary_owner_id
    and ($2::uuid is null or r.id = $2) order by a.assigned_at ${lock ? 'for update of r' : ''}`,[actor.contextId,id || null])).rows;
  if (rows.length !== 1) throw new ApiError(rows.length ? 409 : 404,'An unambiguous assigned residence is required.');
  if (lock && (await client.query('select id from public.manager_assignments where manager_context_id = $1 and residence_id = $2 and ended_at is null for share',[actor.contextId,rows[0].id])).rowCount !== 1)
    throw new ApiError(403,'Manager assignment is no longer active.');
  return rows[0];
}
export async function residenceRegistrationDraft(client:PoolClient,actor:VerifiedActor) {
  const r = await assignedResidence(client,actor);
  const data = (await client.query(`select id,status,submitted_data from public.verification_cases where residence_id = $1 and kind = 'residence_registration'`,[r.id])).rows[0];
  return {residenceId:r.id,verificationId:data?.id || null,status:data?.status || 'not_submitted',draft:data?.submitted_data || {
    name:r.name,description:r.description,contactEmail:r.contact_email || '',contactPhone:r.contact_phone || '',contactPhoneCountry:r.contact_country || 'GH',
    addressLine1:r.location,city:r.city,region:r.region,digitalAddress:r.digital_address,landmark:r.landmark,latitude:Number(r.latitude),longitude:Number(r.longitude),
    formattedAddress:r.location,isLocationConfirmed:r.latitude !== null && r.longitude !== null,blocksList:(await residenceStructure(client,actor,r.id)).blocksList,
    imageUrl:r.cover_path || '',gallery:r.gallery_paths}};
}
/** Runs inside authorizedSystem, which locks and revalidates the actual session. */
export async function submitResidenceRegistration(client:PoolClient,actor:VerifiedActor,id:string,data:Registration) {
  const residence = await assignedResidence(client,actor,id,true);
  const prior = (await client.query(`select id,status,submitted_data from public.verification_cases where residence_id = $1 and kind = 'residence_registration' for update`,[id])).rows[0];
  // Use PostgreSQL JSON equality: recursive comparison does not discard layout fields.
  if (prior) {
    const same = (await client.query('select $1::jsonb = $2::jsonb as same',[JSON.stringify(prior.submitted_data),JSON.stringify(data)])).rows[0].same;
    if (!same) throw new ApiError(409,'Registration already exists. Submit changes through its reviewed change workflow.');
    return {alreadySubmitted:true,verificationId:prior.id,hostel:await registeredResidence(client,actor,residence,prior.status)};
  }
  if (residence.status !== 'approved' || residence.setup_submitted_at) throw new ApiError(409,'Complete physical manager verification before registering this residence.');
  const physical = (await client.query(`select submitted_data from public.verification_cases where residence_id = $1 and applicant_context_id = $2
    and kind = 'manager_registration' and status = 'approved'`,[id,actor.contextId])).rows[0];
  if (!physical || physical.submitted_data.name !== data.name || physical.submitted_data.digitalAddress !== data.digitalAddress ||
      Number(physical.submitted_data.latitude).toFixed(6) !== data.latitude.toFixed(6) || Number(physical.submitted_data.longitude).toFixed(6) !== data.longitude.toFixed(6))
    throw new ApiError(409,'The property identity and map pin must match the physically verified residence. Changes require verification review.');
  const banned = await client.query(`select 1 from public.registration_bans b join public.account_contexts c on c.id = b.account_context_id
    where coalesce(c.primary_owner_id,c.auth_user_id) = $1 and b.kind in ('residence','manager_account') and b.until_at > clock_timestamp()`,[residence.primary_owner_id]);
  if (banned.rowCount) throw new ApiError(403,'Registration is temporarily restricted for this account.');
  await ownedMedia(client,actor,data.imageUrl,'hostel');
  for (const photo of data.gallery) await ownedMedia(client,actor,photo,'hostel');
  await createResidenceStructure(client,actor,id,data.blocksList);
  // Dynamic columns are constants controlled here, never client-supplied SQL.
  const fields:Record<string,unknown> = {description:data.description,property_type:data.propertyType,property_category:data.wing,gender_category:data.genderCategory,year_established:data.yearEstablished,
    contact_phone:data.contactPhone,contact_country:data.contactPhoneCountry,contact_email:data.contactEmail,alternative_phone:data.alternativePhone,website:data.website,
    address_line1:data.addressLine1,address_line2:data.addressLine2,city:data.city,region:data.region,district:data.district,country:data.country,postal_code:data.postalCode,
    landmark:data.landmark,campus_proximity:data.campusProximity,campus_proximity_details:data.campusProximityDetails,payment_frequency:data.paymentFrequency,
    cover_path:data.imageUrl,gallery_paths:data.gallery};
  const columns = Object.keys(fields);
  const updated = (await client.query(`update public.residences set ${columns.map((column,i) => `${column} = $${i+2}`).join(',')},
    setup_submitted_at = now(),status = 'pending',updated_at = now() where id = $1 returning *`,[id,...Object.values(fields)])).rows[0];
  const record = (await client.query(`insert into public.verification_cases(applicant_context_id,residence_id,kind,status,submitted_data)
    values ($1,$2,'residence_registration','under_review',$3) returning id`,[actor.contextId,id,JSON.stringify(data)])).rows[0];
  await notifyPrimaryOwner(client,actor.contextId,{category:'verification',title:'Residence Registration Submitted',
    message:`The registration and room configuration for "${data.name}" are awaiting administrator review.`,sender:actor.contextId});
  const admins = (await client.query(`select c.id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id
    where c.kind = 'admin' and c.status = 'active' and m.status = 'active'`)).rows.map(r => r.id);
  await notify(client,admins,{category:'verification',title:'Residence Registration Awaiting Review',message:`The registration for "${data.name}" is ready for review.`,sender:actor.contextId});
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'residence_registration_submitted','verification_case',$2,$3)`,[actor.contextId,record.id,JSON.stringify({residenceId:id})]);
  return {alreadySubmitted:false,verificationId:record.id,hostel:await registeredResidence(client,actor,updated,'under_review')};
}
async function registeredResidence(client:PoolClient,actor:VerifiedActor,r:any,status:string) {
  const manager = (await client.query(`select c.id,p.display_name,p.email,p.phone from public.verification_cases v
    join public.account_contexts c on c.id = v.applicant_context_id join public.profiles p on p.id = c.auth_user_id
    where v.residence_id = $1 and v.kind = 'residence_registration' and c.kind = 'manager'`,[r.id])).rows[0];
  return {id:r.id,name:r.name,location:r.location,description:r.description,...await residenceStructure(client,actor,r.id),
    image:r.cover_path,imageUrl:r.cover_path,gallery:r.gallery_paths,isApproved:r.status === 'approved',approvalStatus:status,status:r.status,
    managerId:manager?.id,managerName:manager?.display_name,managerEmail:manager?.email,managerPhone:manager?.phone,
    contactPhone:r.contact_phone,contactEmail:r.contact_email,digitalAddress:r.digital_address,hostelType:r.property_type,wing:r.property_category,
    latitude:r.latitude === null ? null : Number(r.latitude),longitude:r.longitude === null ? null : Number(r.longitude)};
}
export async function decideResidenceRegistration(client:PoolClient,actor:VerifiedActor,id:string,decision:'approved'|'rejected'|'more_info_required',notes:unknown) {
  if (actor.kind !== 'admin') throw new ApiError(403,'Administrator access required.');
  const reviewNotes = optional(notes,4000);
  if (decision !== 'approved' && reviewNotes.length < 5) throw new ApiError(400,'Explain the residence review decision.');
  const target = (await client.query("select residence_id from public.verification_cases where id = $1 and kind = 'residence_registration'",[id])).rows[0];
  if (!target) throw new ApiError(404,'Residence registration not found.');
  // Property first matches registration, hierarchy and room-operation lock order.
  const residence = (await client.query('select * from public.residences where id = $1 for update',[target.residence_id])).rows[0];
  const record = (await client.query("select * from public.verification_cases where id = $1 and residence_id = $2 and kind = 'residence_registration' for update",[id,target.residence_id])).rows[0];
  if (!residence || !record) throw new ApiError(404,'Residence registration not found.');
  if (record.status === decision) {
    if ((record.review_notes || '') !== reviewNotes) throw new ApiError(409,'A saved decision cannot be rewritten by a retry.');
    return {alreadyDecided:true,id,status:decision,hostel:await registeredResidence(client,actor,residence,decision)};
  }
  if (!['under_review','more_info_required'].includes(record.status) || residence.status !== 'pending' || !residence.setup_submitted_at)
    throw new ApiError(409,'This residence registration is not awaiting review.');
  if (decision === 'approved') {
    const manager = (await client.query(`select c.id,c.auth_user_id,c.primary_owner_id from public.account_contexts c
      join public.manager_assignments a on a.manager_context_id = c.id where c.id = $1 and a.residence_id = $2
      and c.kind = 'manager' and c.status = 'active' and c.primary_owner_id = $3 and a.ended_at is null for share of c,a`,
      [record.applicant_context_id,residence.id,residence.primary_owner_id])).rows[0];
    if (!manager) throw new ApiError(409,'An active verified manager assignment is required.');
    const physical = await client.query(`select 1 from public.verification_cases v join public.verification_inspections i on i.case_id = v.id
      where v.residence_id = $1 and v.applicant_context_id = $2 and v.kind = 'manager_registration' and v.status = 'approved'
      and i.status = 'accepted' and i.report is not null and i.submitted_at is not null`,[residence.id,manager.id]);
    if (!physical.rowCount) throw new ApiError(409,'An accepted physical inspection is required for this exact residence.');
    const banned = await client.query(`select 1 from public.registration_bans b join public.account_contexts c on c.id = b.account_context_id
      where coalesce(c.primary_owner_id,c.auth_user_id) = $1 and b.kind in ('residence','manager_account') and b.until_at > clock_timestamp()`,[residence.primary_owner_id]);
    if (banned.rowCount) throw new ApiError(409,'An active registration ban prevents approval.');
    const saved = record.submitted_data;
    const structure = await residenceStructure(client,actor,residence.id);
    const normalized = (blocks:ReturnType<typeof parseResidenceStructure>) => [...blocks].sort((a,b) => a.name.localeCompare(b.name));
    let actual:ReturnType<typeof parseResidenceStructure>;
    try {actual = parseResidenceStructure(structure.blocksList);} catch {throw new ApiError(409,'The configured rooms and beds require review.');}
    if (!(await client.query('select $1::jsonb = $2::jsonb as same',[JSON.stringify(normalized(actual)),JSON.stringify(normalized(saved.blocksList))])).rows[0].same)
      throw new ApiError(409,'Room configuration differs from the submitted registration.');
    const beds = (await client.query(`select count(*)::integer as count from public.beds bed join public.rooms room on room.id = bed.room_id
      join public.floors floor on floor.id = room.floor_id join public.blocks block on block.id = floor.block_id where block.residence_id = $1`,[residence.id])).rows[0].count;
    if (beds !== structure.totalBeds) throw new ApiError(409,'Actual room bed counts differ from the submitted layouts.');
    if (residence.cover_path !== saved.imageUrl || JSON.stringify(residence.gallery_paths) !== JSON.stringify(saved.gallery)) throw new ApiError(409,'Photographs differ from the submitted registration.');
    // This media owner is derived from the saved grant, never a request identity.
    const mediaOwner:VerifiedActor = {...actor,authUserId:manager.auth_user_id,contextId:manager.id,kind:'manager'};
    await ownedMedia(client,mediaOwner,saved.imageUrl,'hostel');
    for (const photo of saved.gallery) await ownedMedia(client,mediaOwner,photo,'hostel');
  }
  const status = decision === 'more_info_required' ? 'pending' : decision;
  const updated = (await client.query('update public.residences set status = $2,updated_at = now() where id = $1 returning *',[residence.id,status])).rows[0];
  await client.query('update public.verification_cases set status = $2,reviewed_at = now(),reviewed_by_context_id = $3,review_notes = $4 where id = $1',[id,decision,actor.contextId,reviewNotes]);
  const label = decision.replaceAll('_',' ');
  await notifyPrimaryOwner(client,record.applicant_context_id,{category:decision === 'approved' ? 'success' : 'verification',title:`Residence Registration ${decision === 'approved' ? 'Approved!' : decision === 'rejected' ? 'Rejected' : 'Needs More Information'}`,
    message:`The registration for "${residence.name}" is ${label}.${reviewNotes ? ' '+reviewNotes : ''}`,sender:actor.contextId});
  const admins = (await client.query("select c.id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id where c.kind = 'admin' and c.status = 'active' and m.status = 'active'")).rows.map(r => r.id);
  await notify(client,admins,{category:'verification',title:'Residence Registration Review Updated',message:`"${residence.name}" is ${label}.`,sender:actor.contextId});
  await client.query(`insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id,event_data)
    values ($1,'residence_registration_decided','verification_case',$2,$3)`,[actor.contextId,id,JSON.stringify({residenceId:residence.id,decision,notes:reviewNotes})]);
  return {alreadyDecided:false,id,status:decision,hostel:await registeredResidence(client,actor,updated,decision)};
}
export async function adminResidenceRows(client:PoolClient,actor:VerifiedActor) {
  if (actor.kind !== 'admin') throw new ApiError(403,'Administrator access required.');
  const rows = (await client.query(`select r.*,v.status as registration_status,c.id as manager_id,p.display_name as manager_name,p.email as manager_email,p.phone as manager_phone,
    private.residence_is_public(r.id) as published,
    (select count(*)::integer from public.blocks b where b.residence_id = r.id) as total_blocks,
    (select count(*)::integer from public.floors f join public.blocks b on b.id = f.block_id where b.residence_id = r.id) as total_floors,
    (select count(*)::integer from public.rooms room join public.floors f on f.id = room.floor_id join public.blocks b on b.id = f.block_id where b.residence_id = r.id) as total_rooms,
    (select count(*)::integer from public.beds bed join public.rooms room on room.id = bed.room_id join public.floors f on f.id = room.floor_id join public.blocks b on b.id = f.block_id where b.residence_id = r.id) as total_beds,
    coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'gender',b.gender,'roomPrefix',b.room_prefix,'startNum',b.starting_room_number,
      'floors',(select count(*)::integer from public.floors f where f.block_id = b.id),
      'totalRooms',(select count(*)::integer from public.rooms room join public.floors f on f.id = room.floor_id where f.block_id = b.id),
      'roomTypes',coalesce((select jsonb_agg(t order by t.first_room) from (select room.layout_label as "typeName",count(*)::integer as "totalRooms",
        min((select count(*)::integer from public.beds bed where bed.room_id = room.id)) as "bedsPerRoom",min(room.room_number) as first_room
        from public.rooms room join public.floors f on f.id = room.floor_id where f.block_id = b.id group by room.layout_label) t),'[]'::jsonb)) order by b.created_at,b.id)
      from public.blocks b where b.residence_id = r.id),'[]'::jsonb) as blocks_list
    from public.residences r left join public.verification_cases v on v.residence_id = r.id and v.kind = 'residence_registration'
    left join lateral (select ma.manager_context_id from public.manager_assignments ma where ma.residence_id = r.id and ma.ended_at is null
      order by (ma.manager_context_id = v.applicant_context_id) desc nulls last,ma.assigned_at,ma.id limit 1) a on true
    left join public.account_contexts c on c.id = a.manager_context_id left join public.profiles p on p.id = c.auth_user_id
    order by r.registered_at desc limit 500`)).rows;
  return rows.map(r => ({id:r.id,name:r.name,location:r.location,description:r.description,registrationDate:r.registered_at,
    status:r.status,isApproved:r.published,approvalStatus:r.registration_status || 'not_submitted',registrationRequired:!r.setup_submitted_at,
    image:r.cover_path,imageUrl:r.cover_path,gallery:r.gallery_paths,hostelType:r.property_type,hostel_type:r.property_type,wing:r.property_category,
    totalBlocks:r.total_blocks,totalFloors:r.total_floors,totalRooms:r.total_rooms,
    totalBeds:r.total_beds,totalCapacity:r.total_beds,capacity:r.total_beds,blocksList:r.blocks_list,blocksConfig:r.blocks_list,
    managerId:r.manager_id,managerName:r.manager_name,managerEmail:r.manager_email,managerPhone:r.manager_phone,
    contactPhone:r.contact_phone,contactEmail:r.contact_email,digitalAddress:r.digital_address,
    latitude:r.latitude === null ? null : Number(r.latitude),longitude:r.longitude === null ? null : Number(r.longitude)}));
}
export function installResidenceRegistration(app:Express,auth:SupabaseAuth) {
  const route = (work:(req:AuthRequest,res:any)=>Promise<unknown>):RequestHandler => (req,res,next) => {work(req as AuthRequest,res).catch(next);};
  app.get('/api/manager/residence-registration',auth.require(['manager']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['manager'],c => residenceRegistrationDraft(c,req.actor)))));
  app.post('/api/hostels/register',auth.require(['manager']),route(async (req,res) => {
    const data = parseResidenceRegistration(req.body),id = uuid(req.body?.residenceId);
    const result = await auth.db.authorizedSystem(req.actor,['manager'],c => submitResidenceRegistration(c,req.actor,id,data));
    return res.status(result.alreadySubmitted ? 200 : 201).json({success:true,...result});
  }));
  const review = (decision:'approved'|'rejected'|'more_info_required') => route(async (req,res) => {
      const result = await auth.db.authorizedSystem(req.actor,['admin'],c => decideResidenceRegistration(c,req.actor,uuid(req.params.id),decision,req.body?.adminNotes));
      return res.json({success:true,...result,record:{id:result.id,status:result.status},verification:{id:result.id,status:result.status}});
  });
  app.put('/api/hostel-verifications/:id/approve',auth.require(['admin']),review('approved'));
  app.put('/api/hostel-verifications/:id/reject',auth.require(['admin']),review('rejected'));
  app.put('/api/hostel-verifications/:id/request-info',auth.require(['admin']),review('more_info_required'));
  app.put('/api/hostels/:id/verify',auth.require(['admin']),route(async (req,res) => {
    const values = [req.body?.status,req.body?.approvalStatus].filter(v => v !== undefined).map(v => typeof v === 'string' ? v.toLowerCase() : 'invalid');
    if (req.body?.isApproved !== undefined) values.push(req.body.isApproved === true ? 'approved' : req.body.isApproved === false ? 'rejected' : 'invalid');
    if (!values.length || new Set(values).size !== 1 || !['approved','rejected'].includes(values[0])) throw new ApiError(400,'Choose a consistent approved or rejected residence decision.');
    const result = await auth.db.authorizedSystem(req.actor,['admin'],async c => {
      const record = (await c.query("select id from public.verification_cases where residence_id = $1 and kind = 'residence_registration'",[uuid(req.params.id)])).rows[0];
      if (!record) throw new ApiError(404,'Submitted residence registration not found.');
      return decideResidenceRegistration(c,req.actor,record.id,values[0] as 'approved'|'rejected',req.body?.adminNotes ?? req.body?.rejectionReason);
    });
    return res.json({success:true,...result});
  }));
  app.get('/api/admin/hostels',auth.require(['admin']),route(async (req,res) => res.json(await auth.db.authorizedSystem(req.actor,['admin'],c => adminResidenceRows(c,req.actor)))));
  app.get('/api/hostel-verifications',auth.require(['admin','manager']),route(async (req,res) => res.json(await auth.db.actor(req.actor,async c =>
    (await c.query(`select v.id,v.residence_id as "hostelId",r.name as "hostelName",r.location,v.status,v.submitted_at as "submittedAt",
      v.reviewed_at as "reviewedAt",v.review_notes as "adminNotes",v.submitted_data as registration,
      r.cover_path as "imageUrl",r.digital_address as "digitalAddress",
      (select count(*)::integer from public.rooms room join public.floors floor on floor.id = room.floor_id
        join public.blocks block on block.id = floor.block_id where block.residence_id = r.id) as "totalRooms"
      from public.verification_cases v join public.residences r on r.id = v.residence_id
      where v.kind = 'residence_registration' and ($1::boolean or v.applicant_context_id = $2) order by v.submitted_at desc limit 500`,[req.actor.kind === 'admin',req.actor.contextId])).rows))));
}
