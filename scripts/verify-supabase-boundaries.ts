/** Validates relational constraints and RLS against real existing Auth subjects.
 * All temporary domain records, bindings, and session-revocation checks roll back.
 * Never creates an Auth identity, sends an email, or imports a legacy JSON record. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import type {PoolConfig} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';
import { issueManagerKey,checkManagerKey,requireManagerKeyGrant,managerKeyStatus,petitionManagerKey } from '../supabase/managerKeys.js';
import { keyRows,generateRoomKeys,releaseResidentRoom } from '../supabase/housing.js';
import { parseResidenceStructure,createResidenceStructure,residenceStructure } from '../supabase/residenceStructure.js';
import { housingDashboardRows } from '../supabase/dashboardReads.js';
import { ApiError,SupabaseDatabase,type VerifiedActor } from '../supabase/db.js';
import {submitSellerApplication,decideSellerApplication} from '../supabase/sellerRegistration.js';
dotenv.config({ quiet: true });
async function verify(config?:PoolConfig) {
const db = new SupabaseDatabase(config);
const client = await db.pool.connect();
let checks = 0;
const check = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; };
try {
  await client.query('begin');
  const baseline = (await client.query('select (select count(*) from public.profiles) as profiles, (select count(*) from auth.users) as auth_users')).rows[0];
  const applied = new Map((await client.query('select version, digest from private.schema_migrations')).rows.map(row => [row.version, row.digest]));
  for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}.*\.sql$/.test(f)).sort()) {
    const content = fs.readFileSync(path.join('supabase/migrations', file), 'utf8');
    const digest = crypto.createHash('sha256').update(content).digest('hex');
    if (applied.has(file.slice(0, 14))) assert.equal(applied.get(file.slice(0, 14)), digest);
    else await client.query(content);
  }
  const identities = (await client.query(`select distinct on (u.id) u.id, u.email, u.raw_user_meta_data, s.id as session_id
    from auth.users u join auth.sessions s on s.user_id = u.id
    where u.email_confirmed_at is not null and (s.not_after is null or s.not_after > now())
    order by u.id, s.created_at desc limit 4`)).rows;
  if (identities.length !== 4) throw new Error('Four existing verified Auth subjects with live sessions are required for separate-identity rollback checks.');
  const [owner1, owner2, first, second] = identities;
  for (const person of identities) {
    const existing = await client.query('select id from public.profiles where id = $1', [person.id]);
    if (existing.rowCount) throw new Error('Run this fresh-start verification before operational profiles exist.');
    await client.query('insert into public.profiles(id, email, display_name) values ($1,$2,$3)', [person.id, person.email, String(person.raw_user_meta_data?.name || person.raw_user_meta_data?.full_name || '')]);
  }
  await client.query('update public.profiles set primary_owner_id = $1 where id = $2', [owner1.id,first.id]);
  await client.query('update public.profiles set primary_owner_id = $1 where id = $2', [owner2.id,second.id]);
  async function context(subject: string, kind: string) {
    const owner = kind === 'primary' ? null : subject === first.id ? owner1.id : subject === second.id ? owner2.id : null;
    return (await client.query("insert into public.account_contexts(auth_user_id, primary_owner_id, kind, status) values ($1,$3,$2,'active') returning id", [subject, kind, owner])).rows[0].id;
  }
  const primary1 = await context(owner1.id, 'primary'), primary2 = await context(owner2.id, 'primary');
  const manager1 = await context(first.id, 'manager'), manager2 = await context(second.id, 'manager');
  const resident1 = await context(first.id, 'resident'), resident2 = await context(second.id, 'resident');
  const staff2 = await context(second.id, 'staff'), seller1 = await context(first.id, 'seller');
  const residence1 = (await client.query('insert into public.residences(primary_owner_id,name) values ($1,$2) returning id', [owner1.id, first.raw_user_meta_data?.name || first.email])).rows[0].id;
  const residence2 = (await client.query('insert into public.residences(primary_owner_id,name) values ($1,$2) returning id', [owner2.id, second.raw_user_meta_data?.name || second.email])).rows[0].id;
  for (const [manager, residence] of [[manager1,residence1],[manager2,residence2]]) await client.query('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)', [manager,residence]);
  async function room(residence: string) {
    const block = (await client.query("insert into public.blocks(residence_id,name) values ($1,'Boundary verification') returning id", [residence])).rows[0].id;
    const floor = (await client.query('insert into public.floors(block_id,floor_number) values ($1,0) returning id', [block])).rows[0].id;
    const roomId = (await client.query("insert into public.rooms(floor_id,room_number) values ($1,'1') returning id", [floor])).rows[0].id;
    const bed = (await client.query('insert into public.beds(room_id,bed_number) values ($1,1) returning id', [roomId])).rows[0].id;
    return { block, roomId, bed };
  }
  const room1 = await room(residence1), room2 = await room(residence2);
  const unoccupiedBed = (await client.query('insert into public.beds(room_id,bed_number) values ($1,2) returning id', [room1.roomId])).rows[0].id;
  async function denied(sql: string, values: unknown[], code: string, label: string) {
    await client.query('savepoint negative_check');
    let failure: any;
    try { await client.query(sql, values); } catch (error) { failure = error; }
    await client.query('rollback to savepoint negative_check');
    check(failure?.code === code, label);
  }
  await denied('insert into public.manager_assignments(manager_context_id,residence_id) values ($1,$2)', [primary1,residence1], '23514', 'A primary account cannot become a manager by assignment');
  await denied("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$1,'seller','active')", [owner2.id], '23514', 'Sub-account requires a separate identity');
  await denied("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values ($1,$2,'seller','active')", [second.id,owner1.id], '23514', 'Sub-account cannot spoof its saved owner');
  await denied('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id) values ($1,$2,$3,$4)', [staff2,residence2,manager1,room1.block], '23514', 'Staff cannot cross manager or block boundaries');
  await client.query('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)', [resident1,room1.roomId,room1.bed]);
  await denied('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)', [resident2,room1.roomId,room1.bed], '23505', 'Room and bed cannot have a second active resident');
  await denied('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)', [resident1,room2.roomId,room2.bed], '23505', 'Resident cannot hold a second allocation');
  await denied('insert into public.allocations(resident_context_id,room_id,bed_id) values ($1,$2,$3)', [resident2,room2.roomId,unoccupiedBed], '23503', 'Bed must belong to allocation room');
  await denied('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,title) values ($1,$2,$3,$4)', [residence2,room1.roomId,resident1,'Boundary verification'], '23514', 'Maintenance room must belong to residence');
  await denied('insert into public.stores(seller_context_id,primary_owner_id,name) values ($1,$2,$3)', [seller1,second.id,'Boundary verification'], '23514', 'Seller identity cannot spoof store ownership');
  await client.query("update public.account_contexts set status='pending' where id=$1",[seller1]);
  const sellerEnrollment=(await client.query(`insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,expires_at,auth_user_id,linked_context_id,status,verified_at)
    values($1,$2,'seller',$3,$4,'{}',now()+interval '24 hours',$5,$6,'pending_review',now()) returning id`,[primary1,owner1.id,first.email.toLowerCase(),crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex'),first.id,seller1])).rows[0].id;
  const sellerOwner:VerifiedActor={authUserId:owner1.id,sessionId:owner1.session_id,contextId:primary1,kind:'primary'};
  const admin:VerifiedActor={authUserId:owner2.id,sessionId:owner2.session_id,contextId:await context(owner2.id,'admin'),kind:'admin'};
  await client.query('insert into public.admin_memberships(context_id,slot) values($1,1)',[admin.contextId]);
  await denied("update public.admin_memberships set status='suspended' where context_id=$1",[admin.contextId],'42501','Founder suspension is forbidden in the committed database');
  await denied('delete from public.admin_memberships where context_id=$1',[admin.contextId],'42501','Founder removal cannot bypass governance');
  await denied("update public.account_contexts set status='suspended' where id=$1",[admin.contextId],'42501','Generic account status cannot suspend the founder');
  await denied('delete from public.account_contexts where id=$1',[admin.contextId],'42501','Generic context deletion cannot remove the founder');
  await denied('update public.admin_memberships set sessions_invalidated_at=clock_timestamp() where context_id=$1',[admin.contextId],'42501','Administrator session epoch is database-controlled');
  async function bindReview(a:VerifiedActor){await client.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3) on conflict(session_id) do update set active_context_id=excluded.active_context_id',[a.sessionId,a.authUserId,a.contextId]);await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:a.authUserId,session_id:a.sessionId,role:'authenticated'})]);}
  await bindReview(sellerOwner);
  const sellerApplication=await submitSellerApplication(client,sellerOwner,{enrollmentId:sellerEnrollment,university:'Boundary verification campus',categoryToSell:'General Campus Essentials',idNumber:'PV-BOUNDARY-CHECK',storeName:first.raw_user_meta_data?.full_name || first.email,certified:true});
  await bindReview(admin);await decideSellerApplication(client,admin,{id:sellerApplication.application.id},true);
  const store1=(await client.query('select id from public.stores where seller_context_id=$1',[seller1])).rows[0].id;
  await denied("insert into public.listings(store_id,kind,title,price) values ($1,'service','Boundary verification',1)", [store1], '23514', 'Service mode cannot be NULL');
  await denied("insert into public.listings(store_id,kind,title,price,service_location_mode) values ($1,'service','Boundary verification',1,'fixed')", [store1], '23514', 'Fixed service requires an actual map pin');
  const staffAssignment = (await client.query('insert into public.staff_assignments(staff_context_id,residence_id,created_by_manager_id,assigned_block_id) values ($1,$2,$3,$4) returning id', [staff2,residence2,manager2,room2.block])).rows[0].id;
  const maintenance = (await client.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,title,allocation_id) values ($1,$2,$3,$4,(select id from public.allocations where resident_context_id = $3 and ended_at is null)) returning id',[residence1,room1.roomId,resident1,'Housing boundary verification'])).rows[0].id;
  const bargain = (await client.query(`insert into public.staff_bargains(staff_assignment_id,manager_context_id,proposed_terms,reason_to_quit,original_role,original_shift,original_block_id)
    values ($1,$2,$3,'Housing boundary verification','','',$4) returning id`,[staffAssignment,manager2,JSON.stringify({type:'custom',title:'Housing boundary verification',proposedTerms:'Review saved employment terms',notes:''}),room2.block])).rows[0].id;
  await client.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values ($1,$2,$3),($4,$5,$6)', [first.session_id,first.id,manager1,second.session_id,second.id,manager2]);
  await denied('update private.account_sessions set active_context_id = $1 where session_id = $2', [primary1,first.session_id], '23503', 'Sub-account session cannot impersonate primary owner');
  const notification = (await client.query("insert into public.notifications(category,title,message) values ('verification','Boundary verification','Boundary verification') returning id")).rows[0].id;
  await client.query('insert into public.notification_recipients(notification_id,context_id) values ($1,$2)', [notification,manager1]);
  async function asActor(person: any, work: () => Promise<void>) {
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: person.id, session_id: person.session_id, role:'authenticated' })]);
    await client.query('set local role pinevela_backend');
    try { await work(); } finally { await client.query('reset role'); }
  }
  await asActor(first, async () => {
    check((await housingDashboardRows(client,'staff')).length === 0,'Manager cannot see another hostel staff directory');
    check((await housingDashboardRows(client,'issues')).some(i => i.id === maintenance),'Assigned manager can read own residence maintenance');
    check((await housingDashboardRows(client,'bargains')).length === 0,'Manager cannot see another hostel employment bargains');
    check((await client.query('select id from public.residences')).rowCount === 1, 'Manager sees only own residence');
    check((await client.query('select id from public.notifications')).rowCount === 1, 'Exact recipient sees notification');
    check((await client.query('update public.notification_recipients set read_at = now() where notification_id = $1', [notification])).rowCount === 1, 'Exact recipient can mark read');
    check((await client.query('update public.profiles set display_name = display_name where id = $1', [first.id])).rowCount === 1, 'Own profile update allowed');
    check((await client.query('update public.profiles set display_name = display_name where id = $1', [second.id])).rowCount === 0, 'Other profile update denied');
    await denied("update public.account_contexts set kind = 'admin' where id = $1", [primary1], '42501', 'Backend actor cannot promote itself');
    await denied('update public.profiles set primary_owner_id = $1 where id = $2', [owner2.id,first.id], '42501', 'Backend actor cannot change its owner relationship');
  });
  await asActor(second, async () => {
    check((await housingDashboardRows(client,'staff')).some(s => s.id === staffAssignment),'Manager can read their actual assigned staff and verified profile');
    check((await housingDashboardRows(client,'issues')).length === 0,'Maintenance details cannot cross hostel boundaries');
    check((await housingDashboardRows(client,'bargains')).some(b => b.id === bargain),'Assigned manager can read their own staff bargain');
    check((await client.query('select id from public.notifications')).rowCount === 0, 'Other account cannot see notification');
    check((await client.query('update public.notification_recipients set read_at = now() where notification_id = $1', [notification])).rowCount === 0, 'Other account cannot acknowledge notification');
    check((await client.query('select id from public.residences where id = $1', [residence1])).rowCount === 0, 'Cross residence read denied');
  });
  await client.query('savepoint staff_lifecycle');
  await client.query('update private.account_sessions set active_context_id = $1 where session_id = $2', [staff2,second.session_id]);
  await asActor(second, async () => {
    check((await client.query('select private.current_context_id() as id')).rows[0].id === staff2, 'Active managed staff can resolve own context');
    check((await housingDashboardRows(client,'staff')).some(s => s.id === staffAssignment),'Staff can read their own managed employment record');
    check((await housingDashboardRows(client,'issues')).length === 0,'Staff cannot read unassigned maintenance in another residence');
  });
  await client.query("update public.staff_assignments set status = 'suspended' where id = $1", [staffAssignment]);
  await asActor(second, async () => {
    check((await client.query('select private.current_context_id() as id')).rows[0].id === null, 'Suspended staff cannot retain database context');
  });
  await client.query('rollback to savepoint staff_lifecycle');
  await client.query('savepoint resident_lifecycle');
  await client.query('update private.account_sessions set active_context_id = $1 where session_id = $2', [resident1,first.session_id]);
  await asActor(first, async () => {
    check((await client.query('select private.current_context_id() as id')).rows[0].id === resident1, 'Activated resident can resolve own context');
    check((await housingDashboardRows(client,'issues')).some(i => i.id === maintenance),'Activated resident can read their own maintenance report');
    check((await housingDashboardRows(client,'staff')).length === 0,'Resident staff directory excludes other hostels');
  });
  await client.query('update public.allocations set ended_at = now() where resident_context_id = $1', [resident1]);
  await asActor(first, async () => {
    check((await client.query('select private.current_context_id() as id')).rows[0].id === null, 'Released room cannot retain resident context');
  });
  await client.query('rollback to savepoint resident_lifecycle');
  await client.query("update public.residences set status = 'approved' where id = $1", [residence1]);
  await asActor(second, async () => {
    check((await client.query('select id from public.rooms where id = $1', [room1.roomId])).rowCount === 0, 'Public approval does not expose another residence room structure');
  });
  await client.query('savepoint housing_operations');
  const managerActor:VerifiedActor = {authUserId:first.id,sessionId:first.session_id,contextId:manager1,kind:'manager'};
  const otherManager:VerifiedActor = {authUserId:second.id,sessionId:second.session_id,contextId:manager2,kind:'manager'};
  const staffActor:VerifiedActor = {...otherManager,contextId:staff2,kind:'staff'};
  async function housingDenied(work:()=>Promise<unknown>,status:number,label:string) {
    await client.query('savepoint housing_negative');
    let error:any;try {await work();} catch (caught) {error = caught;}
    await client.query('rollback to savepoint housing_negative');
    check(error instanceof ApiError && error.status === status,label);
  }
  await housingDenied(() => generateRoomKeys(client,managerActor,residence1),409,'Manager-account approval alone cannot issue room activation keys');
  await client.query('update public.residences set setup_submitted_at = now() where id = $1',[residence1]);
  await client.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values ($1,$2,'residence_registration','approved')",[manager1,residence1]);
  check((await managerKeyStatus(client,managerActor)).issueRequired,'Assigned manager can request a first secret key');
  const issued = await issueManagerKey(client,managerActor);
  check(typeof issued.key === 'string' && issued.key.length === 43,'Manager receives a real cryptographically generated secret key once');
  check((await client.query('select key_hash from private.manager_operation_keys where manager_context_id = $1',[manager1])).rows[0].key_hash !== issued.key,'Raw manager key is never stored');
  await housingDenied(() => issueManagerKey(client,managerActor),409,'Manager key cannot be retrieved or reissued after the first display');
  check(!(await checkManagerKey(client,managerActor,undefined)).allowed,'Missing manager key does not authorize an operation');
  check((await client.query('select failed_attempts from private.manager_operation_keys where manager_context_id = $1',[manager1])).rows[0].failed_attempts === 0,'Missing key prompt does not consume a guess');
  const badKey = crypto.randomBytes(32).toString('base64url');
  for (let n = 0; n < 5; n++) await checkManagerKey(client,managerActor,badKey);
  const locked = (await client.query('select failed_attempts,locked_until from private.manager_operation_keys where manager_context_id = $1',[manager1])).rows[0];
  check(locked.failed_attempts === 5 && locked.locked_until,'Manager key failures persist and lock after five guesses');
  check(!(await checkManagerKey(client,managerActor,issued.key)).allowed,'Correct key cannot bypass an active lockout');
  await client.query("update private.manager_operation_keys set locked_until = now() - interval '1 second' where manager_context_id = $1",[manager1]);
  const grant = await checkManagerKey(client,managerActor,issued.key);
  check(grant.allowed && grant.version,'Correct manager key is accepted after lockout expiry');
  await requireManagerKeyGrant(client,{...managerActor,managerKeyVersion:grant.version});
  await client.query('savepoint manager_key_reset');
  await client.query('update private.manager_operation_keys set key_hash = null where manager_context_id = $1',[manager1]);
  await housingDenied(() => requireManagerKeyGrant(client,{...managerActor,managerKeyVersion:grant.version}),403,'A key reset invalidates previously accepted operation proof');
  await client.query('rollback to savepoint manager_key_reset');
  const petition = await petitionManagerKey(client,managerActor,'The original manager secret key was lost.');
  check(petition.managerId === manager1,'Key recovery petition belongs to the authenticated manager');
  await housingDenied(() => petitionManagerKey(client,managerActor,'Another reason'),409,'Duplicate pending key recovery petition is rejected');
  await housingDenied(() => issueManagerKey(client,staffActor),403,'Staff cannot issue manager secret keys');
  await housingDenied(() => generateRoomKeys(client,otherManager,residence1),404,'Manager cannot generate keys for another residence');
  await housingDenied(() => generateRoomKeys(client,managerActor,residence1),409,'Generation cannot fabricate a new key for an already occupied room');
  const occupiedCode = `PV-${crypto.randomBytes(16).toString('hex').toUpperCase()}`;
  const occupiedKey = (await client.query('insert into private.room_activation_keys(room_id,code,claimed_at,claimed_by) values ($1,$2,now(),$3) returning id',[room1.roomId,occupiedCode,resident1])).rows[0].id;
  const foreignKey = (await client.query('insert into private.room_activation_keys(room_id,code) values ($1,$2) returning id',[room2.roomId,`PV-${crypto.randomBytes(16).toString('hex').toUpperCase()}`])).rows[0].id;
  check((await keyRows(client,managerActor)).length === 1 && (await keyRows(client,managerActor))[0].id === occupiedKey,'Manager key read contains only their saved residence');
  check((await keyRows(client,staffActor)).length === 1 && (await keyRows(client,staffActor))[0].id === foreignKey,'Staff key read follows their active roster residence');
  await housingDenied(() => keyRows(client,otherManager,residence1),404,'Residence query parameters cannot widen key access');
  await housingDenied(() => releaseResidentRoom(client,otherManager,occupiedKey,true),404,'Another manager cannot release the occupied room');
  await housingDenied(() => releaseResidentRoom(client,managerActor,occupiedKey,false),400,'Release requires explicit occupancy-removal confirmation');
  const parentProfileCount = (await client.query('select count(*) as n from public.profiles')).rows[0].n;
  const released = await releaseResidentRoom(client,managerActor,occupiedKey,true);
  check(released && released.id !== occupiedKey && released.roomKey !== occupiedCode && !released.isAssigned,'Release rotates the key and ends occupancy atomically');
  check((await client.query('select status from public.account_contexts where id = $1',[resident1])).rows[0].status === 'closed','Release revokes only the resident portal');
  check((await client.query('select status from public.account_contexts where id = $1',[seller1])).rows[0].status === 'active','Shared seller identity remains active after room release');
  check((await client.query('select count(*) as n from public.profiles')).rows[0].n === parentProfileCount,'Release does not delete linked Auth/profile identities');
  check((await client.query('select code from private.room_activation_keys where code = $1 and revoked_at is null',[occupiedCode])).rowCount === 0,'Released key can never activate another resident');
  await housingDenied(() => releaseResidentRoom(client,managerActor,released.id,true),409,'Already available room cannot be released again');
  const currentKeys = await generateRoomKeys(client,managerActor,residence1);
  check(currentKeys.length === 1 && currentKeys[0].id === released.id,'Generation preserves the current valid key on retry');
  const existingFloor = (await client.query('select floor_id from public.rooms where id = $1',[room1.roomId])).rows[0].floor_id;
  const vacant = (await client.query("insert into public.rooms(floor_id,room_number) values ($1,'2') returning id",[existingFloor])).rows[0].id;
  await client.query('insert into public.beds(room_id,bed_number) values ($1,1)',[vacant]);
  const generated = await generateRoomKeys(client,managerActor,residence1);
  check(generated.length === 2 && generated.some(r => r.roomId === vacant && /^PV-[A-F0-9]{32}$/.test(r.roomKey)),'Generation produces a cryptographically random key for a configured vacant room');
  check((await generateRoomKeys(client,managerActor,residence1)).length === 2,'Generation does not duplicate current room keys');
  await housingDenied(() => generateRoomKeys(client,staffActor,residence2),403,'Staff may read keys but cannot generate them');
  await client.query('rollback to savepoint housing_operations');
  await client.query('savepoint hierarchy_configuration');
  await client.query('delete from public.staff_bargains where id = $1',[bargain]);
  await client.query('delete from public.staff_assignments where id = $1',[staffAssignment]);
  await client.query('delete from public.blocks where id = $1',[room2.block]);
  await client.query("update public.residences set status = 'approved' where id = $1",[residence2]);
  await client.query('update public.residences set setup_submitted_at = now() where id = $1',[residence2]);
  await client.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status) values ($1,$2,'residence_registration','approved')",[manager2,residence2]);
  const layouts = [{name:'Boundary verification',gender:'Mixed',floors:2,roomPrefix:'B',startNum:201,totalRooms:5,
    roomTypes:[{typeName:'1 in 1 Room',bedsPerRoom:1,totalRooms:2},{typeName:'2 in 1 Room',bedsPerRoom:2,totalRooms:3}]}];
  await housingDenied(async () => parseResidenceStructure([]),400,'Room configuration cannot fabricate default blocks');
  await housingDenied(async () => parseResidenceStructure([{...layouts[0],floors:0}]),400,'Floor count must be a positive integer');
  await housingDenied(async () => parseResidenceStructure([{...layouts[0],floors:6}]),400,'Each declared floor must contain an actual room');
  await housingDenied(async () => parseResidenceStructure([{...layouts[0],totalRooms:4}]),400,'Client totals cannot contradict actual layout counts');
  await housingDenied(async () => parseResidenceStructure([{...layouts[0],roomTypes:[{...layouts[0].roomTypes[0],totalRooms:-1}]}]),400,'Negative room counts are rejected');
  await housingDenied(async () => parseResidenceStructure([{...layouts[0],roomTypes:[{...layouts[0].roomTypes[0],bedsPerRoom:0}]}]),400,'Each actual room must have a configured bed');
  const configuration = parseResidenceStructure(layouts);
  await housingDenied(() => createResidenceStructure(client,managerActor,residence2,configuration),404,'Manager cannot configure another hostel rooms');
  await housingDenied(() => createResidenceStructure(client,staffActor,residence2,configuration),403,'Staff cannot create hostel structure');
  const created = await createResidenceStructure(client,otherManager,residence2,configuration);
  check(created.totalBlocks === 1 && created.totalFloors === 2 && created.totalRooms === 5 && created.totalBeds === 8,'Declared layouts create exact relational block, floor, room and bed counts');
  const floorCounts = (await client.query(`select f.floor_number,count(r.id)::integer as rooms from public.floors f
    join public.blocks b on b.id = f.block_id left join public.rooms r on r.floor_id = f.id
    where b.residence_id = $1 group by f.floor_number order by f.floor_number`,[residence2])).rows;
  check(floorCounts.length === 2 && floorCounts[0].rooms === 3 && floorCounts[1].rooms === 2,'Rooms distribute over every declared floor without inventing extra floors');
  check((await client.query(`select r.room_number from public.rooms r join public.floors f on f.id = r.floor_id
    join public.blocks b on b.id = f.block_id where b.residence_id = $1 order by r.room_number`,[residence2])).rows.map(r => r.room_number).join(',') === '201,202,203,204,205','Configured room numbers persist sequentially from the supplied starting number');
  check((await createResidenceStructure(client,otherManager,residence2,configuration)).alreadyConfigured,'Exact structure retry cannot duplicate housing records');
  await housingDenied(() => createResidenceStructure(client,otherManager,residence2,parseResidenceStructure([{...layouts[0],startNum:401}])),409,'Existing room structure cannot be silently replaced');
  await housingDenied(() => residenceStructure(client,managerActor,residence2),404,'Structure read cannot cross hostel ownership');
  const structuredKeys = await generateRoomKeys(client,otherManager,residence2);
  check(structuredKeys.length === 5 && new Set(structuredKeys.map(k => k.roomKey)).size === 5,'Actual configured rooms receive one distinct activation key each despite multiple beds');
  await client.query('rollback to savepoint hierarchy_configuration');
  await client.query('delete from auth.sessions where id = $1', [first.session_id]);
  await asActor(first, async () => {
    check((await client.query('select private.current_context_id() as id')).rows[0].id === null, 'Revoked session cannot resolve context');
    check((await client.query('select id from public.profiles')).rowCount === 0, 'Revoked JWT cannot read profile');
    check((await client.query('select id from public.notifications')).rowCount === 0, 'Revoked JWT cannot read notifications');
  });
  await client.query('set local role anon');
  await denied('select id from public.housing_staff_directory', [], '42501', 'Staff directory is not public');
  await denied('select id from public.housing_issue_details', [], '42501', 'Maintenance details are not public');
  await denied('select id from public.account_activity_feed', [], '42501', 'Activity feed cannot expose private audit records to guests');
  check((await client.query('select id from public.residence_catalog')).rowCount === 0, 'Approved physical shells without reviewed setup are absent from the public catalog');
  await denied('select id from public.market_orders', [], '42501', 'Guest cannot query private orders');
  await client.query('reset role');
  check((await client.query("select count(*) as count from pg_tables where schemaname = 'public' and not rowsecurity")).rows[0].count === '0', 'All base application tables have RLS');
  check((await client.query("select rolbypassrls from pg_roles where rolname = 'pinevela_backend'")).rows[0].rolbypassrls === false, 'Backend actor role cannot bypass RLS');
  await client.query('rollback');
  const after = (await client.query('select (select count(*) from public.profiles) as profiles, (select count(*) from auth.users) as auth_users')).rows[0];
  assert.deepEqual(after, baseline);
  console.log(JSON.stringify({ checks, passed: true, rolledBack: true, authAccountsCreated: 0, legacyRecordsImported: 0 }));
} finally {
  await client.query('rollback').catch(() => undefined); client.release(); await db.close();
}
}
const [backup,applicationCheckpoint]=process.argv.slice(2);
if(backup){
  if(!applicationCheckpoint)throw new Error('Pass the genuine Auth checkpoint and immutable pre-enrollment application checkpoint.');
  await withIsolatedBackup(backup,verify,{applicationCheckpoint});
}else await verify();
