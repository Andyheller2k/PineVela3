/** Relational workflow assertions inside the caller's rollback-only database
 * transaction. Uses real verified subjects and actual supplied image bytes.
 * This does not exercise provider login or upload bytes to Storage. */
import fs from 'node:fs';
import type { PoolClient } from 'pg';
import { ApiError,type VerifiedActor } from '../supabase/db.js';
import { parseResidenceRegistration,submitResidenceRegistration,residenceRegistrationDraft,decideResidenceRegistration,adminResidenceRows } from '../supabase/residenceRegistration.js';
import { reserveMedia,finishMedia } from '../supabase/media.js';
import { normalizeRasterImage } from '../imageUploadSecurity.js';
export async function verifyResidenceRegistration(client:PoolClient,manager:VerifiedActor,primary:VerifiedActor,other:VerifiedActor,residenceId:string,property:any,
  check:(condition:unknown,message:string)=>void) {
  await client.query('savepoint registration_workflow');
  const adminContext = (await client.query("select c.id,c.auth_user_id from public.account_contexts c join public.admin_memberships m on m.context_id = c.id where c.kind = 'admin' and c.status = 'active' and m.status = 'active' limit 1")).rows[0];
  const admin:VerifiedActor = {...primary,authUserId:adminContext.auth_user_id,contextId:adminContext.id,kind:'admin'};
  const image = await normalizeRasterImage(fs.readFileSync('assets/PineCoverlight.png'),2048);
  const upload = await reserveMedia(client,manager,'hostel',image);
  const photo = (await finishMedia(client,manager,upload.id)).imageUrl;
  const account = (await client.query('select email from public.profiles where id = $1',[manager.authUserId])).rows[0];
  const input = {residenceId,name:property.name,description:property.description,hostelType:'Student accommodation',wing:'Hostel',genderCategory:'Mixed',yearEstablished:new Date().getFullYear(),
    contactEmail:account.email,contactPhone:'+233241234567',contactPhoneCountry:'GH',addressLine1:property.location,city:'Kumasi',region:'Ashanti',country:'Ghana',
    latitude:property.latitude,longitude:property.longitude,digitalAddress:property.digitalAddress,landmark:property.landmark,imageUrl:photo,gallery:[photo],
    paymentFrequency:'Per Academic Year',agreeTerms:true,accuracyCertified:true,
    blocksList:[{name:'Registration boundary',gender:'Mixed',floors:2,roomPrefix:'R',startNum:101,
      roomTypes:[{typeName:'2 in 1 Room',bedsPerRoom:2,totalRooms:3},{typeName:'1 in 1 Room',bedsPerRoom:1,totalRooms:1}]}]};
  const data = parseResidenceRegistration(input);
  async function denied(work:()=>Promise<unknown>,status:number,label:string) {
    await client.query('savepoint registration_negative');let error:any;
    try {await work();} catch (caught) {error = caught;}
    await client.query('rollback to savepoint registration_negative');
    check(error instanceof ApiError && error.status === status,label);
  }
  check((await residenceRegistrationDraft(client,manager)).residenceId === residenceId,'Registration prefill uses only the manager assigned property');
  await denied(() => residenceRegistrationDraft(client,primary),403,'Primary owner cannot access manager registration by owning its identity');
  await denied(() => submitResidenceRegistration(client,other,residenceId,data),403,'Another primary cannot submit manager residence details');
  await denied(() => submitResidenceRegistration(client,{...other,kind:'manager'},residenceId,data),404,'A client manager label cannot establish a saved residence assignment');
  await denied(async () => parseResidenceRegistration({...input,amenities:['retired']}),400,'Retired amenities cannot reenter the active registration model');
  await denied(async () => parseResidenceRegistration({...input,yearEstablished:2030}),400,'Establishment year cannot be in the future');
  await denied(async () => parseResidenceRegistration({...input,agreeTerms:false}),400,'Terms acceptance is enforced by the API');
  await denied(async () => parseResidenceRegistration({...input,contactPhone:'wrong'}),400,'Property contacts require a real valid phone format');
  await denied(async () => parseResidenceRegistration({...input,blocksList:[{...input.blocksList[0],roomTypes:[{typeName:'2 in 1 Room',bedsPerRoom:2,totalRooms:0}]}]}),400,'Zero-count room layouts cannot generate phantom capacity');
  await denied(() => submitResidenceRegistration(client,manager,residenceId,{...data,name:data.name+' changed'}),409,'Previously verified property identity cannot be silently changed');
  await denied(() => submitResidenceRegistration(client,manager,residenceId,{...data,imageUrl:'https://external.invalid/photo'}),400,'External photos cannot be attached as owned uploads');
  check(!(await client.query('select private.residence_is_public($1) as allowed',[residenceId])).rows[0].allowed,'Physical manager approval alone cannot publish a property shell');
  const root = (await client.query('select primary_owner_id from public.account_contexts where id = $1',[manager.contextId])).rows[0].primary_owner_id;
  const rootContext = (await client.query("select id from public.account_contexts where auth_user_id = $1 and kind = 'primary'",[root])).rows[0].id;
  await client.query('savepoint registration_ban');
  await client.query("insert into public.registration_bans(account_context_id,kind,until_at,reason,imposed_by_context_id) values ($1,'residence',now()+interval '1 day','Boundary verification',$2)",[rootContext,(await client.query("select id from public.account_contexts where kind = 'admin' limit 1")).rows[0].id]);
  await denied(() => submitResidenceRegistration(client,manager,residenceId,data),403,'Primary registration bans also block the linked manager');
  await client.query('rollback to savepoint registration_ban');
  const submitted = await submitResidenceRegistration(client,manager,residenceId,data);
  check(!submitted.alreadySubmitted && submitted.hostel.id === residenceId,'Full registration completes the physically inspected residence instead of creating another one');
  check(submitted.hostel.totalRooms === 4 && submitted.hostel.totalBeds === 7 && submitted.hostel.totalFloors === 2,'Declared layouts produce real floor, room and bed rows');
  check(submitted.hostel.status === 'pending' && !submitted.hostel.isApproved,'Full registration awaits its own administrator review');
  const roster = (await adminResidenceRows(client,admin)).find(r => r.id === residenceId);
  check(roster?.totalRooms === 4 && roster?.totalBeds === 7 && roster?.blocksList.length === 1 && !roster.isApproved,'Administrator private residence roster includes the pending case and actual hierarchy counts');
  await denied(() => adminResidenceRows(client,manager),403,'Manager cannot read the administrator residence roster');
  const recipients = (await client.query(`select nr.context_id,c.kind from public.notification_recipients nr join public.notifications n on n.id = nr.notification_id
    join public.account_contexts c on c.id = nr.context_id where n.title in ('Residence Registration Submitted','Residence Registration Awaiting Review')`)).rows;
  check(recipients.some(r => r.context_id === rootContext) && recipients.some(r => r.kind === 'admin') && !recipients.some(r => r.context_id === manager.contextId),'Registration notices reach the primary owner and active administrators');
  const before = (await client.query(`select (select count(*) from public.rooms) as rooms,(select count(*) from public.verification_cases) as cases,(select count(*) from public.notifications) as notices`)).rows[0];
  check((await submitResidenceRegistration(client,manager,residenceId,parseResidenceRegistration({...input,managerId:primary.contextId,primary_owner_id:primary.authUserId,isApproved:true}))).alreadySubmitted,'Ownership fields cannot change an exact idempotent registration retry');
  check(JSON.stringify((await client.query(`select (select count(*) from public.rooms) as rooms,(select count(*) from public.verification_cases) as cases,(select count(*) from public.notifications) as notices`)).rows[0]) === JSON.stringify(before),'Retries duplicate neither physical rows, review cases nor notifications');
  await denied(() => submitResidenceRegistration(client,manager,residenceId,{...data,description:'Changed submission'}),409,'Submitted registration details cannot bypass a reviewed change request');
  check((await residenceRegistrationDraft(client,manager)).draft.blocksList[0].roomTypes.length === 2,'Server-side resume retains exact submitted room layouts');
  check(!(await client.query('select private.media_asset_is_public($1) as allowed',[upload.id])).rows[0].allowed,'Awaiting-review property photographs remain private');
  await client.query("update public.residences set status = 'approved' where id = $1",[residenceId]);
  check(!(await client.query('select private.residence_is_public($1) as allowed',[residenceId])).rows[0].allowed,'Changing a residence status alone cannot bypass registration-case approval');
  await client.query("update public.residences set status = 'pending' where id = $1",[residenceId]);
  await denied(() => decideResidenceRegistration(client,manager,submitted.verificationId,'approved',''),403,'Manager cannot approve their own residence setup');
  await client.query('savepoint physical_required');
  await client.query("update public.verification_inspections set status = 'rejected' where case_id in (select id from public.verification_cases where residence_id = $1 and kind = 'manager_registration')",[residenceId]);
  await denied(() => decideResidenceRegistration(client,admin,submitted.verificationId,'approved',''),409,'Residence approval needs an accepted physical inspection for this exact property');
  await client.query('rollback to savepoint physical_required');
  await client.query('savepoint rejected_setup');
  const rejected = await decideResidenceRegistration(client,admin,submitted.verificationId,'rejected','Property details require correction.');
  check(rejected.status === 'rejected' && (await client.query('select status from public.account_contexts where id = $1',[manager.contextId])).rows[0].status === 'active','Rejecting property setup preserves the separately verified manager identity');
  await denied(() => decideResidenceRegistration(client,admin,submitted.verificationId,'approved',''),409,'Final rejection cannot be rewritten as approval');
  await client.query('rollback to savepoint rejected_setup');
  await client.query('savepoint changed_beds');
  await client.query(`insert into public.beds(room_id,bed_number) select room.id,3 from public.rooms room join public.floors floor on floor.id = room.floor_id
    join public.blocks block on block.id = floor.block_id where block.residence_id = $1 and room.layout_label = '2 in 1 Room' limit 1`,[residenceId]);
  await denied(() => decideResidenceRegistration(client,admin,submitted.verificationId,'approved',''),409,'Changed actual bed counts cannot pass residence approval');
  await client.query('rollback to savepoint changed_beds');
  const requested = await decideResidenceRegistration(client,admin,submitted.verificationId,'more_info_required','Clarify the public contact details.');
  check(requested.status === 'more_info_required' && !(await client.query('select private.residence_is_public($1) as allowed',[residenceId])).rows[0].allowed,'Requesting information keeps the residence and photos private');
  const approved = await decideResidenceRegistration(client,admin,submitted.verificationId,'approved','Residence setup reviewed.');
  check(approved.status === 'approved' && approved.hostel.isApproved,'Administrator can approve the verified actual residence setup');
  const noticeCount = (await client.query('select count(*)::int as count from public.notifications')).rows[0].count;
  check((await decideResidenceRegistration(client,admin,submitted.verificationId,'approved','Residence setup reviewed.')).alreadyDecided,'Exact residence decision retry is idempotent');
  check((await client.query('select count(*)::int as count from public.notifications')).rows[0].count === noticeCount,'Approval retry cannot duplicate lifecycle notifications');
  await denied(() => decideResidenceRegistration(client,admin,submitted.verificationId,'approved','Changed decision notes'),409,'Saved approval notes cannot be overwritten by retry');
  check((await client.query(`select 1 from public.notifications n join public.notification_recipients nr on nr.notification_id = n.id
    where n.title = 'Residence Registration Approved!' and nr.context_id = $1`,[rootContext])).rowCount === 1,'Residence approval notice goes to the primary owner before manager portal entry');

  check((await client.query('select private.residence_is_public($1) as allowed',[residenceId])).rows[0].allowed,'Approved setup with an active assigned manager enters the public catalog');
  check((await client.query('select private.media_asset_is_public($1) as allowed',[upload.id])).rows[0].allowed,'Approved public catalog and photo publication share the same gate');
  await client.query("update public.account_contexts set status = 'suspended' where id = $1",[manager.contextId]);
  check(!(await client.query('select private.residence_is_public($1) as allowed',[residenceId])).rows[0].allowed,'A suspended manager cannot retain public property publication');
  await client.query('rollback to savepoint registration_workflow');
}
