/** Actual PostgreSQL enrollment/claim transitions using existing verified Auth
 * subjects in a rollback-only transaction. No provider mocks, new Auth users,
 * email delivery, legacy imports, or persistent application fixtures. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { finishEnrollment, claimResidentRoom, reserveEnrollment } from '../supabase/enrollment.js';
import { checkPortalPin,hashPortalPin } from '../supabase/portalAccess.js';
import { registrationStatus } from '../supabase/accountStatus.js';
import { reactivateResident } from '../supabase/residentReactivation.js';
import { dispatchInspection,submitInspection,decideManager,inspectionRows } from '../supabase/inspections.js';
import { verifyResidenceRegistration } from './verify-residence-registration.js';
import { managerProperty,submitManagerRegistration } from '../supabase/managerRegistration.js';
dotenv.config({ quiet:true });
const db = new SupabaseDatabase(), client = await db.pool.connect();
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition,message); checks++; };
try {
  await client.query('begin');
  const counts = async () => (await client.query(`select (select count(*) from auth.users) as users,
    (select count(*) from public.profiles) as profiles,(select count(*) from private.account_enrollments) as enrollments,
    (select count(*) from public.allocations) as allocations,(select count(*) from public.notifications) as notifications`)).rows[0];
  const before = await counts();
  if (before.profiles !== '0') throw new Error('Enrollment rehearsal requires the unused fresh-start application schema.');
  const applied = new Map((await client.query('select version,digest from private.schema_migrations')).rows.map(row => [row.version,row.digest]));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}.*\.sql$/.test(f)).sort()) {
    const sql = fs.readFileSync(path.join('supabase/migrations',file),'utf8');
    if (applied.has(file.slice(0,14))) assert.equal(applied.get(file.slice(0,14)),crypto.createHash('sha256').update(sql).digest('hex'));
    else await client.query(sql);
  }
  const people = (await client.query(`select distinct on (u.id) u.id,u.email,u.raw_user_meta_data,s.id as session_id
    from auth.users u join auth.sessions s on s.user_id = u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after > now())
    order by u.id,s.created_at desc limit 4`)).rows;
  if (people.length !== 4) throw new Error('Four existing confirmed subjects are required for the rollback-only rehearsal.');
  const [owner,other,child,secondChild] = people;
  for (const person of [owner,other]) await client.query('select private.initialize_auth_profile($1,null)',[person.id]);
  async function actor(person: any): Promise<VerifiedActor> {
    const context = (await client.query("select id from public.account_contexts where auth_user_id = $1 and kind = 'primary'",[person.id])).rows[0].id;
    await client.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)',[person.session_id,person.id,context]);
    return { authUserId:person.id,sessionId:person.session_id,contextId:context,kind:'primary' };
  }
  const primary = await actor(owner), foreign = await actor(other);
  async function failure(work: () => Promise<unknown>, expected: string | number, label: string) {
    await client.query('savepoint enrollment_negative');
    let error: any;
    try { await work(); } catch (caught) { error = caught; }
    await client.query('rollback to savepoint enrollment_negative');
    check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected,label);
  }
  await failure(() => reserveEnrollment(client,primary,{ kind:'resident',email:child.email,name:child.raw_user_meta_data?.name || child.email,phone:'',password:'' },crypto.randomBytes(32).toString('hex')),409,'Existing Auth identity cannot be adopted by email');
  async function enrollment(person: any, parent: VerifiedActor) {
    const token = crypto.randomBytes(32).toString('hex');
    const id = (await client.query(`insert into private.account_enrollments
      (initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at)
      values ($1,$2,'resident',$3,$4,$5,now() + interval '24 hours') returning id`,
      [parent.contextId,parent.authUserId,person.email.toLowerCase(),crypto.createHash('sha256').update(token).digest('hex'),JSON.stringify({ displayName:person.raw_user_meta_data?.name || person.raw_user_meta_data?.full_name || person.email,phone:'' })])).rows[0].id;
    return { id,token };
  }
  const pending = await enrollment(child,primary);
  await failure(() => client.query('select private.initialize_auth_profile($1,null)',[child.id]),'23514','Public signup cannot steal a reserved child address');
  await failure(() => client.query('select private.initialize_auth_profile($1,$2)',[child.id,crypto.randomBytes(32).toString('hex')]),'23514','Wrong enrollment nonce cannot grant a sub-account');
  await client.query('select private.initialize_auth_profile($1,$2)',[child.id,pending.token]);
  const account = (await client.query('select * from public.account_contexts where auth_user_id = $1',[child.id])).rows;
  check(account.length === 1 && account[0].kind === 'resident' && account[0].status === 'pending','Enrolled identity has only its pending child context');
  check(account[0].primary_owner_id === owner.id,'Child relationship uses the saved authorized owner');
  await failure(() => client.query("insert into public.account_contexts(auth_user_id,kind,status) values ($1,'primary','active')",[child.id]),'23514','Child cannot gain a parallel primary context');
  const proof = { authUserId:child.id,email:child.email.toLowerCase(),sessionId:child.session_id };
  await failure(() => finishEnrollment(client,foreign,pending.id,proof),404,'Another primary cannot verify this enrollment');
  await failure(() => finishEnrollment(client,primary,pending.id,{ ...proof,authUserId:secondChild.id,email:secondChild.email }),400,'Another verified subject cannot confirm this enrollment');
  await failure(() => claimResidentRoom(client,primary,pending.id,'UNAVAILABLE'),409,'Room activation is blocked before email confirmation');
  await finishEnrollment(client,primary,pending.id,proof);
  check((await client.query('select status,verified_at from private.account_enrollments where id = $1',[pending.id])).rows[0].status === 'pending_review','Verified enrollment awaits room activation');
  const notices = await client.query('select context_id from public.notification_recipients');
  check(notices.rowCount === 1 && notices.rows[0].context_id === primary.contextId,'Email lifecycle notice targets the primary user');
  await finishEnrollment(client,primary,pending.id,proof);
  check((await client.query('select id from public.notifications')).rowCount === 1,'Confirmation retry does not duplicate notifications');
  const residence = (await client.query('insert into public.residences(primary_owner_id,name) values ($1,$2) returning id',[other.id,other.raw_user_meta_data?.name || other.email])).rows[0].id;
  const block = (await client.query('insert into public.blocks(residence_id,name) values ($1,$2) returning id',[residence,'Enrollment verification'])).rows[0].id;
  const floor = (await client.query('insert into public.floors(block_id,floor_number) values ($1,0) returning id',[block])).rows[0].id;
  const room = (await client.query("insert into public.rooms(floor_id,room_number) values ($1,'1') returning id",[floor])).rows[0].id;
  await client.query('insert into public.beds(room_id,bed_number) values ($1,1),($1,2)',[room]);
  const key = crypto.randomBytes(18).toString('hex').toUpperCase();
  await client.query('insert into private.room_activation_keys(room_id,code) values ($1,$2)',[room,key]);
  await failure(() => claimResidentRoom(client,primary,pending.id,key),404,'Pending residence cannot activate a resident');
  await client.query("update public.residences set status = 'approved' where id = $1",[residence]);
  await failure(() => claimResidentRoom(client,primary,pending.id,key),404,'Manager-account approval without reviewed property setup cannot activate rooms');
  await client.query('update public.residences set setup_submitted_at = now() where id = $1',[residence]);
  await client.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values ($1,$2,'residence_registration','approved')",[foreign.contextId,residence]);
  await failure(() => claimResidentRoom(client,foreign,pending.id,key),404,'A primary cannot claim another user enrollment');
  await failure(() => claimResidentRoom(client,primary,pending.id,'UNAVAILABLE'),404,'Wrong room key cannot allocate a room');
  const result = await claimResidentRoom(client,primary,pending.id,key);
  check(result.requiresSeparateLogin === true,'Room activation requires the child own login');
  const ownerStatus = await registrationStatus(client,primary),otherStatus = await registrationStatus(client,foreign);
  check(ownerStatus.residentAccount?.active === true && ownerStatus.residentAccount.email === child.email,'Primary status shows its actual verified resident registration');
  check(otherStatus.residentAccount === null && otherStatus.enrollments.length === 0,'Other primary cannot see linked registration status');
  check((await client.query('select active_context_id from private.account_sessions where session_id = $1',[primary.sessionId])).rows[0].active_context_id === primary.contextId,'Activation cannot replace the primary session');
  check((await client.query('select primary_owner_id from public.allocations where resident_context_id = $1',[account[0].id])).rows[0].primary_owner_id === owner.id,'Room allocation is bound to canonical primary owner');
  check((await client.query('select context_id from public.notification_recipients')).rows.every(row => row.context_id === primary.contextId),'Activation lifecycle notices remain on the primary account');
  await failure(() => claimResidentRoom(client,primary,pending.id,key),409,'Completed enrollment cannot activate a second time');
  const residentPin = String(crypto.randomInt(100000,500000)),sellerPin = String(crypto.randomInt(500000,999999));
  const [residentHash,sellerHash] = await Promise.all([hashPortalPin(residentPin),hashPortalPin(sellerPin)]);
  const shared = await reserveEnrollment(client,primary,{ kind:'seller',email:child.email.toLowerCase(),name:child.raw_user_meta_data?.name || child.email,phone:'',password:'' },crypto.randomBytes(32).toString('hex'),
    { ...proof,existingContextId:account[0].id,newPinHash:sellerHash,existingPinHash:residentHash });
  const sharedRecord = (await client.query('select * from private.account_enrollments where id = $1',[shared])).rows[0];
  check(sharedRecord.auth_user_id === child.id && sharedRecord.verified_at !== null,'Same-email seller reuses the confirmed resident identity');
  check((await client.query('select id from public.account_contexts where auth_user_id = $1',[child.id])).rowCount === 2,'Shared identity keeps separate resident and seller contexts');
  check((await client.query('select pin_hash from private.portal_access_keys')).rows.every(row => row.pin_hash !== residentPin && row.pin_hash !== sellerPin),'Portal PINs are stored only as salted hashes');
  await failure(() => client.query('insert into private.portal_access_keys(context_id,pin_hash) values ($1,$2)',[primary.contextId,residentHash]),'23514','Primary or manager contexts cannot gain student portal PIN records');
  check(!(await checkPortalPin(client,account[0].id,undefined)).allowed,'Supabase credentials alone do not pass a portal PIN');
  check(!(await checkPortalPin(client,account[0].id,sellerPin)).allowed,'Seller PIN cannot unlock resident portal');
  for (let attempt = 0; attempt < 4; attempt++) await checkPortalPin(client,account[0].id,sellerPin);
  check((await client.query('select failed_attempts,locked_until from private.portal_access_keys where context_id = $1',[account[0].id])).rows[0].failed_attempts === 5,'Failed PIN guesses persist and lock after five attempts');
  check(!(await checkPortalPin(client,account[0].id,residentPin)).allowed,'Locked portal refuses guesses even with the correct PIN');
  check((await checkPortalPin(client,sharedRecord.linked_context_id,sellerPin)).allowed,'Seller portal has an independent PIN and attempt budget');
  await client.query("update private.portal_access_keys set locked_until = now() - interval '1 second' where context_id = $1",[account[0].id]);
  const accepted = await checkPortalPin(client,account[0].id,residentPin);
  check(accepted.allowed && accepted.version === '1','Correct resident PIN succeeds after lock expiry');
  await client.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3)',[child.session_id,child.id,account[0].id]);
  await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({ sub:child.id,session_id:child.session_id,role:'authenticated' })]);
  await client.query('set local role pinevela_backend');
  check((await client.query('select private.current_context_id() as id')).rows[0].id === null,'Previously bound session without PIN proof loses RLS context');
  await failure(() => client.query('select pin_hash from private.portal_access_keys'),'42501','Portal hashes cannot be read by browser or backend actor role');
  await client.query('reset role');
  await client.query('update private.account_sessions set portal_pin_version = $1 where session_id = $2',[accepted.version,child.session_id]);
  await client.query('set local role pinevela_backend');
  check((await client.query('select private.current_context_id() as id')).rows[0].id === account[0].id,'Verified PIN session resolves the correct resident context');
  await client.query('reset role');
  await client.query('update private.portal_access_keys set version = version + 1 where context_id = $1',[account[0].id]);
  await client.query('set local role pinevela_backend');
  check((await client.query('select private.current_context_id() as id')).rows[0].id === null,'A new portal PIN version invalidates older session proof');
  await client.query('reset role');
  const nextResidentHash = await hashPortalPin(String(crypto.randomInt(100000,999999)));
  await client.query('update private.portal_access_keys set pin_hash = $1 where context_id = $2',[nextResidentHash,account[0].id]);
  check((await client.query('select version from private.portal_access_keys where context_id = $1',[account[0].id])).rows[0].version === '3','Changing a PIN hash automatically advances the session version');
  await client.query('savepoint resident_reactivation');
  await failure(() => reactivateResident(client,primary,pending.id,proof,'3'),409,'An occupied resident cannot be reactivated');
  await client.query('update public.allocations set ended_at = now() where resident_context_id = $1 and ended_at is null',[account[0].id]);
  await client.query("update public.account_contexts set status = 'closed' where id = $1",[account[0].id]);
  await client.query('update private.room_activation_keys set revoked_at = now() where room_id = $1 and revoked_at is null',[room]);
  await failure(() => reactivateResident(client,foreign,pending.id,proof,'3'),404,'Another primary cannot reactivate this resident identity');
  await failure(() => reactivateResident(client,primary,pending.id,{...proof,authUserId:secondChild.id},'3'),403,'A different verified subject cannot reactivate the resident');
  await failure(() => reactivateResident(client,primary,pending.id,proof,null),403,'Parent ownership does not bypass resident portal PIN proof');
  await failure(() => reactivateResident(client,primary,pending.id,proof,'2'),403,'Stale portal PIN version cannot authorize reactivation');
  const reactivated = await reactivateResident(client,primary,pending.id,proof,'3');
  check(!reactivated.alreadyReactivated && reactivated.enrollmentId === pending.id,'Released resident reuses exactly the saved verified identity and enrollment');
  check((await client.query('select status from public.account_contexts where id = $1',[account[0].id])).rows[0].status === 'pending','Reactivation does not grant resident portal access before a new room claim');
  check((await client.query('select count(*) as n from public.allocations where ended_at is null and primary_owner_id = $1',[owner.id])).rows[0].n === '0','Reactivation alone cannot allocate a room');
  check((await reactivateResident(client,primary,pending.id,proof,'3')).alreadyReactivated,'Reactivation retry is idempotent');
  await failure(() => claimResidentRoom(client,primary,pending.id,key),404,'A released activation key cannot be revived by reactivation');
  const replacement = crypto.randomBytes(18).toString('hex').toUpperCase();
  await client.query('insert into private.room_activation_keys(room_id,code) values ($1,$2)',[room,replacement]);
  await claimResidentRoom(client,primary,pending.id,replacement);
  check((await client.query('select count(*) as n from public.allocations where resident_context_id = $1',[account[0].id])).rows[0].n === '2','Reclaim preserves the ended allocation alongside the single new active allocation');
  check((await client.query('select count(*) as n from public.account_contexts where auth_user_id = $1',[child.id])).rows[0].n === '2','Reclaim creates no duplicate identity or student portal');
  check((await client.query('select active_context_id from private.account_sessions where session_id = $1',[primary.sessionId])).rows[0].active_context_id === primary.contextId,'Reactivation and reclaim leave primary session unchanged');
  await client.query('rollback to savepoint resident_reactivation');
  const second = await enrollment(secondChild,foreign);
  await client.query('select private.initialize_auth_profile($1,$2)',[secondChild.id,second.token]);
  await finishEnrollment(client,foreign,second.id,{ authUserId:secondChild.id,email:secondChild.email.toLowerCase(),sessionId:secondChild.session_id });
  await failure(() => claimResidentRoom(client,foreign,second.id,key),409,'Another resident cannot reuse a claimed room key even with extra beds');
  await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({ sub:owner.id,session_id:owner.session_id,role:'authenticated' })]);
  await client.query('set local role pinevela_backend');
  await failure(() => client.query('select private.initialize_auth_profile($1,null)',[owner.id]),'42501','Backend actor cannot call the signup identity function');
  await failure(() => client.query('select id from private.account_enrollments'),'42501','Browser/backend actor cannot read private enrollment challenges');
  await client.query('reset role');
  // Registration state transitions are rehearsed with the same real provider
  // subjects. This checks PostgreSQL authorization, not work-email delivery.
  const managerContext = (await client.query(`insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status)
    values ($1,$2,'manager','pending') returning id`,[secondChild.id,other.id])).rows[0].id;
  const managerEnrollment = (await client.query(`insert into private.account_enrollments
    (initiator_context_id,primary_owner_id,kind,invited_email,token_digest,auth_user_id,linked_context_id,enrollment_fields,expires_at)
    values ($1,$2,'manager',$3,$4,$5,$6,'{}',now() + interval '24 hours') returning id`,
    [foreign.contextId,other.id,secondChild.email.toLowerCase(),crypto.randomBytes(32).toString('hex'),secondChild.id,managerContext])).rows[0].id;
  const propertyInput = { hostelName:secondChild.raw_user_meta_data?.name || secondChild.email,
    location:'KNUST, Kumasi',latitude:6.6745,longitude:-1.5716,digitalAddress:'AK-001-0001',knustAccreditedConfirmed:true };
  const property = managerProperty(propertyInput);
  await failure(async () => managerProperty({ ...propertyInput,latitude:5.60 }),400,'A Kumasi address string cannot bypass geographic bounds');
  await failure(() => submitManagerRegistration(client,foreign,managerEnrollment,property),409,'Unverified manager enrollment cannot submit a residence');
  await client.query("update private.account_enrollments set status = 'pending_review',verified_at = now() where id = $1",[managerEnrollment]);
  await failure(() => submitManagerRegistration(client,primary,managerEnrollment,property),404,'Another primary cannot submit a manager registration');
  const adminContext = (await client.query("insert into public.account_contexts(auth_user_id,kind,status) values ($1,'admin','active') returning id",[owner.id])).rows[0].id;
  await client.query('insert into public.admin_memberships(context_id,slot) values ($1,1)',[adminContext]);
  const submitted = await submitManagerRegistration(client,foreign,managerEnrollment,property);
  check(submitted.status === 'inspection_pending','Verified manager registration awaits a physical inspection');
  check((await client.query('select primary_owner_id,status from public.residences where id = $1',[submitted.residenceId])).rows[0].primary_owner_id === other.id,'Residence ownership comes from the authenticated initiator');
  check((await client.query('select status from public.account_contexts where id = $1',[managerContext])).rows[0].status === 'pending','Submission does not activate the manager portal');
  const noticesBeforeRetry = (await client.query('select count(*) as total from public.notifications')).rows[0].total;
  const repeated = await submitManagerRegistration(client,foreign,managerEnrollment,property);
  check(repeated.alreadySubmitted && repeated.id === submitted.id,'Retry cannot create a duplicate manager case or residence');
  check((await client.query('select count(*) as total from public.notifications')).rows[0].total === noticesBeforeRetry,'Submission retry cannot duplicate lifecycle notices');
  const registrationNotices = (await client.query(`select n.title,r.context_id from public.notifications n
    join public.notification_recipients r on r.notification_id = n.id where n.title in
    ('Manager Account Registered - Inspection Pending','Manager Registration Submitted')`)).rows;
  check(registrationNotices.some(row => row.context_id === foreign.contextId) && registrationNotices.some(row => row.context_id === adminContext),
    'Primary user and active administrators receive exact submission notifications');
  check(!registrationNotices.some(row => row.context_id === managerContext),'Pending manager portal does not receive the primary lifecycle notice');
  await failure(() => submitManagerRegistration(client,foreign,managerEnrollment,{ ...property,name:property.name + ' changed' }),409,'Changed retry cannot rewrite an immutable inspection submission');
  await client.query('set local role anon');
  check((await client.query('select id from public.residence_catalog where id = $1',[submitted.residenceId])).rowCount === 0,'Pending inspection residence is excluded from guest catalog');
  await client.query('reset role');
  const admin:VerifiedActor = {...primary,contextId:adminContext,kind:'admin'};
  const officerContext = (await client.query("insert into public.account_contexts(auth_user_id,kind,status) values ($1,'officer','active') returning id",[owner.id])).rows[0].id;
  const officer:VerifiedActor = {...primary,contextId:officerContext,kind:'officer'};
  const otherOfficerContext = (await client.query("insert into public.account_contexts(auth_user_id,kind,status) values ($1,'officer','active') returning id",[other.id])).rows[0].id;
  const wrongOfficer:VerifiedActor = {...foreign,contextId:otherOfficerContext,kind:'officer'};
  await failure(() => dispatchInspection(client,foreign,submitted.id,officerContext,'medium',''),403,'Primary account cannot dispatch inspections');
  await failure(() => decideManager(client,admin,submitted.id,'approved',''),409,'Administrator cannot approve before a physical report');
  await failure(() => dispatchInspection(client,admin,submitted.id,managerContext,'medium',''),409,'Manager identity cannot be selected as officer');
  const dispatch = await dispatchInspection(client,admin,submitted.id,officerContext,'medium','Physical property inspection');
  check(!dispatch.alreadyDispatched,'Active registered officer receives a saved dispatch');
  const noticeCount = async () => (await client.query('select count(*) as total from public.notifications')).rows[0].total;
  const dispatchCount = await noticeCount();
  check((await dispatchInspection(client,admin,submitted.id,officerContext,'medium','Physical property inspection')).alreadyDispatched,'Exact dispatch retry is idempotent');
  check(await noticeCount() === dispatchCount,'Dispatch retry cannot duplicate notices');
  await failure(() => dispatchInspection(client,admin,submitted.id,officerContext,'urgent','Changed'),409,'Conflicting live dispatch cannot overwrite assignment');
  check((await inspectionRows(client,wrongOfficer)).length === 0,'Unassigned officer cannot read the dossier or its contacts');
  const reportInput = {observations:'Physical property inspected and manager authority confirmed.',recommendation:'recommend_approval',checklist:{residenceExists:true,managerConnected:true,basicPropertyInfoVerified:true,managerAuthorityConfirmed:true,generalLegitimacyConfirmed:true,safetyHabitableCompliance:true},propertyDetails:{estimatedRooms:10,estimatedBeds:20},gpsCoordinates:{lat:6.6745,lng:-1.5716},officerId:foreign.contextId,submittedAt:'1900-01-01'};
  await failure(() => submitInspection(client,wrongOfficer,dispatch.id,reportInput),404,'Unassigned officer cannot submit another officer report');
  await failure(() => submitInspection(client,officer,dispatch.id,{...reportInput,propertyDetails:{estimatedRooms:-1}}),400,'Invalid property capacity is rejected');
  await failure(() => submitInspection(client,officer,dispatch.id,{...reportInput,photos:[{title:'Uploaded photograph',capturedAt:new Date().toISOString(),url:'https://untrusted.invalid/photo'}]}),400,'Arbitrary photo URLs cannot masquerade as trusted uploads');
  const submittedReport = await submitInspection(client,officer,dispatch.id,reportInput);
  check(submittedReport.report.officerId === officerContext && submittedReport.report.submittedAt !== reportInput.submittedAt,'Report author and timestamp come from the verified officer');
  check((await client.query('select status from public.verification_cases where id = $1',[submitted.id])).rows[0].status === 'under_review','Report moves only its saved dossier to review');
  await failure(() => submitInspection(client,officer,dispatch.id,reportInput),409,'Submitted report cannot be overwritten by duplicate requests');
  await failure(() => client.query('update public.verification_inspections set officer_context_id = $2 where id = $1',[dispatch.id,foreign.contextId]),'23514','Database rejects changing dispatch authorship');
  await failure(() => client.query("update public.verification_inspections set report = '{}' where id = $1",[dispatch.id]),'23514','Database preserves the submitted report');
  await failure(() => decideManager(client,officer,submitted.id,'approved',''),403,'Officer recommendation cannot grant administrator approval');
  await client.query('savepoint reinspection_branch');
  await failure(() => decideManager(client,admin,submitted.id,'more_info_required',''),400,'Further information requires a useful reason');
  const followup = await decideManager(client,admin,submitted.id,'more_info_required','Please arrange another inspection of the utilities.');
  check(followup.status === 'more_info_required','Administrator can request further information without activating manager');
  const reinspection = await dispatchInspection(client,admin,submitted.id,officerContext,'high','Inspect utilities again');
  check(reinspection.id !== dispatch.id,'Reinspection creates a new assignment and retains the original report');
  check((await client.query('select report from public.verification_inspections where id = $1',[dispatch.id])).rows[0].report.officerId === officerContext,'Previous inspection evidence survives reinspection');
  await client.query('rollback to savepoint reinspection_branch');
  await client.query('savepoint rejection_branch');
  const rejected = await decideManager(client,admin,submitted.id,'rejected','Property authorization was not established.');
  check(rejected.status === 'rejected' && (await client.query('select status from public.account_contexts where id = $1',[managerContext])).rows[0].status === 'rejected','Rejection denies manager portal activation');
  await failure(() => dispatchInspection(client,admin,submitted.id,officerContext,'high','Retry'),409,'Rejected dossier cannot be dispatched through the review route');
  await client.query('rollback to savepoint rejection_branch');
  const approved = await decideManager(client,admin,submitted.id,'approved','Inspected and approved');
  check(approved.status === 'approved','Administrator can approve the submitted inspection');
  check((await client.query('select status from public.account_contexts where id = $1',[managerContext])).rows[0].status === 'active','Approval activates exactly the dossier manager');
  check((await client.query('select status from public.residences where id = $1',[submitted.residenceId])).rows[0].status === 'approved','Approval allows the inspected manager to configure the residence');
  const decisionCount = await noticeCount();
  check((await decideManager(client,admin,submitted.id,'approved','Inspected and approved')).alreadyDecided,'Decision retry is idempotent');
  check(await noticeCount() === decisionCount,'Decision retry cannot duplicate notices');
  await failure(() => decideManager(client,admin,submitted.id,'approved','Changed approval notes'),409,'A retry cannot rewrite decision notes');
  await failure(() => decideManager(client,admin,submitted.id,'rejected','Changed decision'),409,'Final approval cannot be overwritten through the review route');
  const lifecycle = (await client.query(`select n.title,r.context_id from public.notifications n join public.notification_recipients r on r.notification_id = n.id
    where n.title in ('PineVela Verification Team Dispatched','Manager Account Approved!')`)).rows;
  check(lifecycle.filter(r => r.context_id === foreign.contextId).length === 2 && !lifecycle.some(r => r.context_id === managerContext),'Dispatch and approval notifications go to the primary owner before portal entry');
  check((await inspectionRows(client,officer)).some(r => r.id === dispatch.id && r.status === 'approved'),'Officer sees the final administrator decision on their assignment');
  await verifyResidenceRegistration(client,{authUserId:secondChild.id,sessionId:secondChild.session_id,contextId:managerContext,kind:'manager'},foreign,primary,submitted.residenceId,property,check);
  await client.query('rollback');
  assert.deepEqual(await counts(),before);
  console.log(JSON.stringify({ checks,passed:true,rolledBack:true,authAccountsCreated:0,legacyRecordsImported:0,providerFlowTested:false }));
} finally {
  await client.query('rollback').catch(() => undefined); client.release(); await db.close();
}
