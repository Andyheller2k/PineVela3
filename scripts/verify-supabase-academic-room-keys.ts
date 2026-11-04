/** Annual room-key resets in an isolated restore with genuine Google subjects/native sessions.
 * No cloud product/Auth writes, fabricated Auth identities or provider replies. */
import assert from 'node:assert/strict';import crypto from 'node:crypto';import fs from 'node:fs';import dotenv from 'dotenv';import {spawnSync} from 'node:child_process';import type {PoolClient} from 'pg';
import {withIsolatedBackup} from './lib/isolated-postgres.js';import {ApiError,SupabaseDatabase,type VerifiedActor} from '../supabase/db.js';
import {SupabaseAuth} from '../supabase/auth.js';
import {hashCredentialAsync} from '../accountSecurity.js';import {hashPortalPin} from '../supabase/portalAccess.js';
import {issueManagerKey,checkManagerKey,rotateManagerKey} from '../supabase/managerKeys.js';import {checkApprovalKey,deniedApprovalKey} from '../supabase/adminGovernance.js';
import {academicResetPreview,resetAcademicRoomKeys,academicYear} from '../supabase/academicRoomKeys.js';
import {releaseResidentRoom,keyRows,generateRoomKeys} from '../supabase/housing.js';import {claimResidentRoom} from '../supabase/enrollment.js';import {reactivateResident} from '../supabase/residentReactivation.js';
dotenv.config({ quiet: true });
const [checkpoint, applicationCheckpoint] = process.argv.slice(2);
if (process.argv.length !== 4 || [checkpoint, applicationCheckpoint].some(v => !/^[a-f0-9-]{36}$/.test(v || ''))) throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks = 0, stage = 'restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  if((typeof expected==='number'?error?.status:error?.code)!==expected)fs.writeFileSync('.security/migration-reset/academic-room-keys-denial.log',JSON.stringify({expected,actualCode:error?.code,actualStatus:error?.status,label,detail:String(error?.stack||error)},null,2),{mode:0o600});
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, label);
}
const randomPin = () => String(crypto.randomInt(100000, 1000000));
try {
  await withIsolatedBackup(checkpoint, async config => {
    let db = new SupabaseDatabase(config);
    try {
      const authDigest = async () => (await db.pool.query(`select md5(jsonb_build_object('users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
      const beforeAuth = await authDigest();
      const currentPin = randomPin(); let nextPin = randomPin(); while (nextPin === currentPin) nextPin = randomPin();
      let sellerPin = randomPin(); while ([currentPin, nextPin].includes(sellerPin)) sellerPin = randomPin();
      const fixture = await db.system(async c => {
        const people = (await c.query(`select u.id,u.email,coalesce(u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'full_name','') as name,
          (select array_agg(s.id order by s.created_at desc) from auth.sessions s where s.user_id=u.id and (s.not_after is null or s.not_after>clock_timestamp())) as sessions
          from auth.users u where u.email_confirmed_at is not null and not u.is_anonymous
          and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google' and i.identity_data->'email_verified'='true'::jsonb
            and lower(i.identity_data->>'email')=lower(u.email)) order by u.id`)).rows.filter(p => p.sessions?.length);
        const student = people.find(p => p.sessions.length >= 2);
        check(people.length >= 4 && student, 'Actual verified subjects include one identity with two genuine sessions');
        const [ownerPerson, foreignOwnerPerson, foreignPerson] = people.filter(p => p.id !== student.id);
        const ownerActors: VerifiedActor[] = [];
        for (const p of [ownerPerson, foreignOwnerPerson]) {
          await c.query('select private.initialize_auth_profile($1,null)', [p.id]);
          ownerActors.push({ authUserId: p.id, sessionId: p.sessions[0], kind: 'primary', contextId: (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'", [p.id])).rows[0].id });
        }
        for (const [p, owner] of [[student, ownerPerson], [foreignPerson, foreignOwnerPerson]])
          await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)', [p.id, p.email, p.name, owner.id]);
        const resident: VerifiedActor = { authUserId: student.id, sessionId: student.sessions[0], kind: 'resident', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id", [student.id, ownerPerson.id])).rows[0].id };
        const seller: VerifiedActor = { ...resident, sessionId: student.sessions[1], kind: 'seller', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id", [student.id, ownerPerson.id])).rows[0].id };
        const foreign: VerifiedActor = { authUserId: foreignPerson.id, sessionId: foreignPerson.sessions[0], kind: 'resident', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id", [foreignPerson.id, foreignOwnerPerson.id])).rows[0].id };
        const home = (await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id", [ownerPerson.id, ownerPerson.name])).rows[0].id;
        const block = (await c.query("insert into public.blocks(residence_id,name,room_prefix) values($1,$2,'PM') returning id", [home, student.name])).rows[0].id;
        const floor = (await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id', [block])).rows[0].id;
        const room = (await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id", [floor])).rows[0].id;
        const bed = (await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id', [room])).rows[0].id;
        const allocation = (await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id', [resident.contextId, room, bed])).rows[0].id;
        const managers:VerifiedActor[]=[];
        const spare=people.filter(p=>![student.id,ownerPerson.id,foreignOwnerPerson.id,foreignPerson.id].includes(p.id));
        check(spare.length>=2,'Two additional genuine subjects provide manager sessions');
        for(let i=0;i<2;i++){
          const p=spare[i],parent=[ownerPerson,foreignOwnerPerson][i];
          await c.query('insert into public.profiles(id,email,display_name,primary_owner_id) values($1,$2,$3,$4)',[p.id,p.email,p.name,parent.id]);
          managers.push({authUserId:p.id,sessionId:p.sessions[0],kind:'manager',contextId:(await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id",[p.id,parent.id])).rows[0].id});
        }
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[0].contextId,home]);
        const key=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at) values($1,$2,$3,now()) returning id',[room,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase(),resident.contextId])).rows[0].id;
        const foreignHome=(await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id",[foreignOwnerPerson.id,foreignOwnerPerson.name])).rows[0].id;
        await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)',[managers[1].contextId,foreignHome]);
        const fb=(await c.query("insert into public.blocks(residence_id,name,room_prefix) values($1,$2,'PF') returning id",[foreignHome,foreignPerson.name])).rows[0].id;
        const ff=(await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id',[fb])).rows[0].id;
        const fr=(await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id",[ff])).rows[0].id;
        const fbed=(await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id',[fr])).rows[0].id;
        const foreignAllocation=(await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id',[foreign.contextId,fr,fbed])).rows[0].id;
        const foreignKey=(await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at) values($1,$2,$3,now()) returning id',[fr,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase(),foreign.contextId])).rows[0].id;
        await c.query('insert into public.maintenance_issues(residence_id,room_id,reporter_context_id,allocation_id,title) values($1,$2,$3,$4,$5)',[home,room,resident.contextId,allocation,student.name||student.email]);
        for (const [actor, pin] of [[resident, currentPin], [seller, sellerPin]] as const)
          await c.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2)', [actor.contextId, await hashPortalPin(pin)]);
        for (const a of [...ownerActors, resident, seller, foreign,...managers])
          await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id,portal_pin_version) values($1,$2,$3,$4)', [a.sessionId, a.authUserId, a.contextId, ['resident', 'seller'].includes(a.kind) && a !== foreign ? 1 : null]);
        const adminPerson=ownerPerson;check(adminPerson.sessions.length>=1,'Administrator reuses a genuine session through verified context switching');
        const admin:VerifiedActor={authUserId:adminPerson.id,sessionId:adminPerson.sessions[0],kind:'admin',contextId:(await c.query("insert into public.account_contexts(auth_user_id,kind,status)values($1,'admin','active')returning id",[adminPerson.id])).rows[0].id};
        const approval=crypto.randomBytes(32).toString('base64url'),settings=crypto.randomBytes(32).toString('base64url');
        await c.query('insert into public.admin_memberships(context_id,slot)values($1,1)',[admin.contextId]);
        await c.query('insert into private.admin_secrets(context_id,approval_key_hash,approval_enrolled_at,settings_key_hash,settings_enrolled_at)values($1,$2,now(),$3,now())',[admin.contextId,await hashCredentialAsync(`approval:${admin.contextId}:${approval}`),await hashCredentialAsync(`settings:${admin.contextId}:${settings}`)]);
        for(const h of[home,foreignHome]){await c.query('update public.residences set setup_submitted_at=now() where id=$1',[h]);await c.query("insert into public.verification_cases(applicant_context_id,residence_id,kind,status)values($1,$2,'residence_registration','approved')",[managers[h===home?0:1].contextId,h]);}
        const extraRooms=[];for(const n of['2','3']){const id=(await c.query('insert into public.rooms(floor_id,room_number)values($1,$2)returning id',[floor,n])).rows[0].id;extraRooms.push(id);await c.query('insert into public.beds(room_id,bed_number)values($1,1)',[id]);if(n==='2')await c.query('insert into private.room_activation_keys(room_id,code)values($1,$2)',[id,'PV-'+crypto.randomBytes(16).toString('hex').toUpperCase()]);}
        const enrollment=(await c.query("insert into private.account_enrollments(initiator_context_id,primary_owner_id,kind,invited_email,token_digest,enrollment_fields,status,verified_at,auth_user_id,linked_context_id,room_id,residence_id,expires_at)values($1,$2,'resident',$3,$4,$5,'completed',now(),$6,$7,$8,$9,now()+interval'24 hours')returning id",[ownerActors[0].contextId,ownerPerson.id,student.email,crypto.randomBytes(32).toString('hex'),JSON.stringify({displayName:student.name,phone:''}),student.id,resident.contextId,room,home])).rows[0].id;
        const applied = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (applied.has(version)) assert.equal(applied.get(version), digest);
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
        return {owner:ownerActors[0],resident,seller,foreign,allocation,key,room,home,managers,foreignHome,foreignKey,foreignAllocation,admin,approval,settings,extraRooms,enrollment,student};
      });
      const {owner,resident,seller,foreign,managers,home,foreignHome,admin,approval,settings,extraRooms,enrollment,student}=fixture;
      const run=<T>(a:VerifiedActor,work:(c:PoolClient)=>Promise<T>,exclusive=false)=>db.authorizedSystem(a,[a.kind],work,false,false,exclusive);
      const managerCodes=new Map<string,string>();
      for(const manager of managers){const key=(await run(manager,c=>issueManagerKey(c,manager))).key;check(/^[0-9]{6}$/.test(key),'New manager authorization code has exactly six digits');managerCodes.set(manager.contextId,key);manager.managerKeyVersion=(await run(manager,c=>checkManagerKey(c,manager,key))).version;}
      stage='short manager code security';
      const current=managers[0],oldCode=managerCodes.get(current.contextId)!;
      const legacy=crypto.randomBytes(32).toString('base64url');
      const legacyHash=await hashCredentialAsync(legacy);
      await db.system(c=>c.query('update private.manager_operation_keys set key_hash=$2 where manager_context_id=$1',[current.contextId,legacyHash]));
      current.managerKeyVersion=(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,legacy))).version;
      check(Boolean(current.managerKeyVersion),'Existing long manager keys still authenticate');
      const stale={...current};
      let replaced=(await run(current,c=>rotateManagerKey(c,current))).key;
      check(/^[0-9]{6}$/.test(replaced),'Owner-authorized replacement issues a six-digit code');
      await denied(()=>run(stale,c=>c.query('select 1')),403,'Rotating a manager code invalidates stale authorization proofs');
      check(!(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,legacy))).allowed,'Previous long manager key stops working after replacement');
      check(!(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,oldCode))).allowed,'Earlier six-digit manager code does not authorize a later version');
      current.managerKeyVersion=(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,replaced))).version;
      await denied(()=>run({...current,managerKeyVersion:undefined},c=>rotateManagerKey(c,{...current,managerKeyVersion:undefined})),403,'Rotation cannot bypass current key proof');
      for(const other of[owner,seller,resident])await denied(()=>run(other,c=>rotateManagerKey(c,other)),403,'Other portal roles cannot rotate manager codes');
      const parallel=await Promise.allSettled([run(current,c=>rotateManagerKey(c,current)),run(current,c=>rotateManagerKey(c,current))]);
      const winners=parallel.filter(r=>r.status==='fulfilled'),losers=parallel.filter(r=>r.status==='rejected');
      check(winners.length===1&&losers.length===1,'Concurrent manager rotations produce exactly one replacement');
      check([403,409].includes((losers[0] as PromiseRejectedResult).reason.status),'Concurrent rotation is rejected cleanly without a database deadlock');
      replaced=(winners[0] as PromiseFulfilledResult<{key:string}>).value.key;
      current.managerKeyVersion=(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,replaced))).version;
      const wrong=replaced==='999999'?'888888':'999999';
      for(let i=0;i<5;i++)check(!(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,wrong))).allowed,'Incorrect numeric code is denied and counted');
      check((await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,replaced))).locked,'Correct code cannot bypass the persisted five-attempt lockout');
      await db.system(c=>c.query("update private.manager_operation_keys set locked_until=clock_timestamp()-interval'1 second' where manager_context_id=$1",[current.contextId]));
      current.managerKeyVersion=(await run({...current,managerKeyVersion:undefined},c=>checkManagerKey(c,current,replaced))).version;
      const audit=(await db.pool.query("select event_data from private.audit_events where event_type='manager_secret_key_rotated'")).rows;
      check(audit.length===2&&!JSON.stringify(audit).includes(replaced),'Manager rotation audit never includes the secret code');
      stage='initial room key generation';
      // One never-issued empty room exercises generation while the other legacy codes remain valid.
      const generated=await run(current,c=>generateRoomKeys(c,current,home));
      check(/^PM-[A-HJ-NP-Z2-9]{4}$/.test(generated.find(r=>r.roomId===extraRooms[1]).roomKey),'Initial room generation uses the saved block prefix and four random characters');
      check(generated.some(r=>/^PV-[A-F0-9]{32}$/.test(r.roomKey)),'Unreplaced long room keys remain intact');

      const year='2026/2027';const preview=(a=managers[0],id=home,y=year)=>run(a,c=>academicResetPreview(c,a,id,y));
      const initial=await preview();check(initial.rooms===3&&initial.occupants===1&&!initial.alreadyCompleted,'Exact own-residence preview counts occupied and empty rooms');
      check(!JSON.stringify(initial).includes(student.email)&&!JSON.stringify(initial).includes('roomKey'),'Preview exposes no resident mailbox or activation code');
      const input={academicYear:year,confirm:'RESET ROOM ACCESS',fingerprint:initial.fingerprint};
      const reset=(a=managers[0],id=home,body:any=input,grant?:any)=>run(a,c=>resetAcademicRoomKeys(c,a,id,body,grant),true);
      for(const a of[owner,resident,seller,foreign])await denied(()=>preview(a),403,'Other portals cannot inspect annual reset scope');
      await denied(()=>preview(managers[1]),404,'Foreign manager cannot preview another residence');await denied(()=>reset(managers[1]),404,'Foreign manager cannot reset another residence');
      for(const patch of[{contextId:managers[1].contextId},{authUserId:managers[1].authUserId},{sessionId:owner.sessionId}])await denied(()=>preview({...managers[0],...patch}),401,'Spoofed identity/session/context is denied');
      for(const bad of[undefined,2026,'2026/2026','2026/2028','26/27','2026/2027 extra'])await denied(async()=>academicYear(bad),400,'Invalid academic year is rejected');
      for(const patch of[{confirm:true},{managerId:managers[0].contextId},{userId:owner.authUserId},{roomId:fixture.room},{academicYear:2026},{fingerprint:'stale'}])await denied(()=>reset(managers[0],home,{...input,...patch}),patch.fingerprint?409:400,'Unsafe reset bodies and stale preview are rejected');
      await denied(()=>reset({...managers[0],managerKeyVersion:undefined}),403,'Manager must have its own current operation-key proof');
      for(const role of['anon','authenticated','pinevela_backend'])await denied(()=>db.system(async c=>{await c.query('set local role '+role);await c.query('select * from private.residence_room_key_cycles');}),'42501','Scoped SQL cannot read private cycle receipts');
      await run(managers[0],c=>c.query("update public.rooms set room_number='4' where id=$1",[extraRooms[0]]));await denied(()=>reset(),409,'Changed room structure invalidates exact preview');await run(managers[0],c=>c.query("update public.rooms set room_number='2' where id=$1",[extraRooms[0]]));
      const frozen=await db.system(async c=>{await c.query("update public.residences set status='inspection' where id=$1",[home]);});
      await denied(()=>preview(),409,'Unapproved residence cannot reset');await db.system(c=>c.query("update public.residences set status='approved' where id=$1",[home]));
      const mutableDigest=async()=>(await db.pool.query(`select md5(jsonb_build_object('a',(select jsonb_agg(to_jsonb(t)order by id)from public.allocations t),'c',(select jsonb_agg(to_jsonb(t)order by id)from public.account_contexts t),'k',(select jsonb_agg(to_jsonb(t)order by id)from private.room_activation_keys t),'s',(select jsonb_agg(to_jsonb(t)order by session_id)from private.account_sessions t),'r',(select jsonb_agg(to_jsonb(t)order by id)from private.residence_room_key_cycles t),'n',(select jsonb_agg(to_jsonb(t)order by id)from public.notifications t),'e',(select jsonb_agg(to_jsonb(t)order by id)from private.audit_events t))::text)as d`)).rows[0].d;
      const beforeFailure=await mutableDigest();
      // An actual database constraint failure verifies rollback after closure writes.
      await db.system(c=>c.query("create function private.reject_cycle_key_test() returns trigger language plpgsql as $$begin if new.cycle_id is not null then raise exception using errcode='22000',message='Isolated native key rejection';end if;return new;end;$$; create trigger reject_cycle_key_test before insert on private.room_activation_keys for each row execute function private.reject_cycle_key_test()"));
      await denied(()=>reset(),'22000','Native key insertion failure rolls back the entire reset');check(await mutableDigest()===beforeFailure,'Allocations, contexts, sessions, keys, receipts, audits and notices all roll back');
      await db.system(c=>c.query('drop trigger reject_cycle_key_test on private.room_activation_keys; drop function private.reject_cycle_key_test()'));
      stage='atomic annual reset';const oldKeys=(await run(managers[0],c=>keyRows(c,managers[0],home))).map(r=>r.roomKey);
      const outcomes=await Promise.all([reset(),reset()]);check(outcomes.every(r=>r.success)&&outcomes.filter(r=>!r.noChange).length===1,'Concurrent exact retries produce one completed cycle');const result=outcomes.find(r=>!r.noChange)!;
      check(result.count===3&&result.occupantsRemoved===1,'All selected residence rooms reset atomically');
      const nowKeys=await run(managers[0],c=>keyRows(c,managers[0],home));check(nowKeys.length===3&&nowKeys.every(r=>!r.isAssigned&&r.academicYear===year&&!oldKeys.includes(r.roomKey)),'Exactly one distinct new unclaimed key per room carries its academic year');
      check(nowKeys.every(r=>/^PM-[A-HJ-NP-Z2-9]{4}$/.test(r.roomKey)),'Annual room reset uses the saved initials and four random alphanumeric characters');
      check((await db.pool.query('select count(*)from private.room_activation_keys where room_id=any($1::uuid[])and revoked_at is not null',[nowKeys.map(r=>r.roomId)])).rows[0].count==='3','Every old room key is retained and revoked');
      check((await db.pool.query('select ended_at from public.allocations where id=$1',[fixture.allocation])).rows[0].ended_at,'Original allocation history is retained');
      check((await db.pool.query('select status from public.account_contexts where id=$1',[resident.contextId])).rows[0].status==='closed','Only resident portal closes');
      check((await db.pool.query('select status from public.account_contexts where id=$1',[seller.contextId])).rows[0].status==='active','Shared verified seller portal remains active');
      check((await db.actor(seller,c=>c.query('select private.current_context_id()as id'))).rows[0].id===seller.contextId,'Shared seller native app binding/PIN remains usable');
      check((await db.actor(owner,c=>c.query('select private.current_context_id()as id'))).rows[0].id===owner.contextId,'Primary account remains usable');
      await denied(()=>run(resident,c=>c.query('select 1')),401,'Previous resident binding cannot access housing');
      check((await db.pool.query('select ended_at from public.allocations where id=$1',[fixture.foreignAllocation])).rows[0].ended_at===null,'Foreign residence occupancy remains intact');
      check((await db.pool.query('select count(*)from private.residence_room_key_cycles')).rows[0].count==='1','Exactly one immutable reset receipt is recorded');
      check((await db.pool.query("select count(*)from private.audit_events where event_type='academic_year_room_keys_reset'")).rows[0].count==='1','One atomic annual audit receipt is recorded');
      const noticeIds=(await db.pool.query("select r.context_id from public.notification_recipients r join public.notifications n on n.id=r.notification_id where n.title='Academic-year resident room access ended'")).rows.map(r=>r.context_id);
      check(noticeIds.includes(owner.contextId)&&!noticeIds.includes(seller.contextId)&&!noticeIds.includes(foreign.contextId),'Room-loss notice reaches the saved primary owner without crossing portal boundaries');
      await denied(()=>run(managers[0],c=>c.query('delete from private.residence_room_key_cycles where id=$1',[result.cycleId])),'42501','Cycle history cannot be deleted');
      await denied(()=>run(managers[0],c=>c.query("update private.residence_room_key_cycles set residence_name='changed' where id=$1",[result.cycleId])),'42501','Saved cycle scope cannot be edited');
      await denied(()=>db.system(c=>c.query('truncate private.residence_room_key_cycles cascade')),'42501','Cycle receipts cannot be truncated');
      await denied(()=>run(managers[0],c=>c.query('update private.room_activation_keys set cycle_id=null where id=$1',[nowKeys[0].id])),'42501','Key cycle association cannot be changed');
      await denied(()=>preview(managers[0],home,'2025/2026'),409,'Academic year cannot move backwards');
      stage='verified identity reuse';check((await run(owner,c=>reactivateResident(c,owner,enrollment,{authUserId:resident.authUserId,sessionId:resident.sessionId,email:student.email},'1'))).status==='pending_review','Ended resident identity can use existing verified re-enrollment');
      await denied(()=>run(owner,c=>claimResidentRoom(c,owner,enrollment,oldKeys[0])),404,'Retired key cannot reactivate a room');
      await run(owner,c=>claimResidentRoom(c,owner,enrollment,nowKeys[0].roomKey));check((await db.pool.query('select count(*)from public.allocations where resident_context_id=$1 and ended_at is null',[resident.contextId])).rows[0].count==='1','Reactivation retains one active allocation on the same resident identity');
      const afterClaim=await mutableDigest();check((await reset()).noChange,'Retry of a completed year returns its receipt');check(await mutableDigest()===afterClaim,'Completed-year retry never evicts a newly activated resident or reissues keys');
      const released=await run(managers[0],c=>releaseResidentRoom(c,managers[0],nowKeys[0].id,true),true);check(released.academicYear===year&&!released.isAssigned&&/^PM-[A-HJ-NP-Z2-9]{4}$/.test(released.roomKey),'Individual release retains its academic year and issues a short replacement key');
      const next=await preview(managers[0],home,'2027/2028');await denied(()=>reset(managers[0],home,{...input,academicYear:'2027/2028'}),409,'New year requires its own exact preview');
      const nextResult=await reset(managers[0],home,{...input,academicYear:'2027/2028',fingerprint:next.fingerprint});check(nextResult.count===3&&nextResult.occupantsRemoved===0,'Next consecutive year replaces every key while preserving empty-room history');
      stage='native completion boundary';
      await db.system(c=>c.query("update private.manager_operation_keys set locked_until=clock_timestamp()+interval'15 minutes' where manager_context_id=$1",[managers[0].contextId]));
      await denied(()=>reset(),403,'Locked manager operation key cannot reset even a completed year');
      await db.system(c=>c.query('update private.manager_operation_keys set locked_until=null where manager_context_id=$1',[managers[0].contextId]));
      const unfinished=await preview(managers[0],home,'2028/2029');
      await denied(()=>run(managers[0],async c=>{
        await c.query("select set_config('pinevela.room_cycle_confirmation','RESET ROOM ACCESS',true),set_config('pinevela.room_cycle_key_version',$1,true)",[managers[0].managerKeyVersion]);
        await c.query("insert into private.residence_room_key_cycles(residence_id,residence_name,academic_year,actor_context_id,actor_kind,manager_key_version,fingerprint,room_count,occupants_removed)select id,name,'2028/2029',$2,'manager',$3,$4,3,0 from public.residences where id=$1",[home,managers[0].contextId,managers[0].managerKeyVersion,unfinished.fingerprint]);
      },true),'42501','Deferred native guard refuses a completed receipt without replacing every room key');
      check((await db.pool.query('select count(*)from private.residence_room_key_cycles')).rows[0].count==='2','Incomplete native receipt cannot survive commit');
      stage='administrator own-key';await new SupabaseAuth(db).switchContext(owner,admin.contextId);await denied(()=>reset(admin,foreignHome,{...input}),403,'Administrator cannot skip separate approval-key proof');
      const bad=await run(admin,c=>checkApprovalKey(c,admin,settings));check(!bad.allowed,'Administrator settings key cannot replace approval key');
      const grant=await run(admin,c=>checkApprovalKey(c,admin,approval));deniedApprovalKey(grant);
      const adminPreview=await preview(admin,foreignHome);const adminResult=await reset(admin,foreignHome,{...input,fingerprint:adminPreview.fingerprint},grant);check(adminResult.count===1&&adminResult.occupantsRemoved===1,'Genuine administrator with own approval grant can reset its selected approved residence');
      check((await db.pool.query('select count(*)from public.registration_bans')).rows[0].count==='0','Annual reset creates no registration cooldown');check(await authDigest()===beforeAuth,'Genuine Auth users, identities and native sessions remain byte-for-byte unchanged');
      await db.close();db=new SupabaseDatabase(config);check((await db.pool.query('select count(*)from private.residence_room_key_cycles')).rows[0].count==='3','All immutable cycle receipts survive reconnect');
      const advisorSkipped=process.env.PINEVELA_SKIP_DB_ADVISORS==='1';
      if(!advisorSkipped){
      const advisor=spawnSync('/tmp/pv-supabase-cli-2.120.0/supabase',['db','advisors','--db-url','postgresql://pv_restore@localhost:6543/postgres?host='+encodeURIComponent(String(config.host)),'--type','security','--output-format','json'],{timeout:60000,maxBuffer:4*1024*1024});fs.writeFileSync('.security/migration-reset/academic-room-keys-native-advisors.json',advisor.stdout.length?advisor.stdout:advisor.stderr,{mode:0o600});check(advisor.status===0,'Native security advisors completed');const reportData=JSON.parse(advisor.stdout.toString()),findings=reportData.results||reportData;check(Array.isArray(findings)&&!findings.length,'Native security advisors report zero findings');
      }
      const report={passed:true,checks,advisorSkipped,shortCodesVerified:true,isolatedNative:true,genuineArchivedGoogleIdentities:true,cloudRecordsModified:0,authRecordsChanged:false,providerMocks:false,realManagerResetBrowserPending:true};fs.writeFileSync('.security/migration-reset/academic-room-keys-native.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});if(process.env.PINEVELA_SHORT_KEY_REPORT)fs.writeFileSync(process.env.PINEVELA_SHORT_KEY_REPORT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
    }finally{await db.close();}
  },{applicationCheckpoint});
}catch(e:any){fs.writeFileSync('.security/migration-reset/academic-room-keys-failure.log',String(e.stack||e),{mode:0o600});console.error(JSON.stringify({passed:false,stage,checks,code:e?.code||null,error:e instanceof assert.AssertionError?e.message:'Native verification failed; diagnostics saved privately.'}));process.exitCode=1;}
