/** Genuine Google subjects and native sessions restored to local PostgreSQL.
 * Domain relationships exist only in the disposable restore. No Auth identity,
 * provider reply, JWT or native Auth timestamp is fabricated or modified. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { ownResidentRooms, checkResidentProfileRequest } from '../supabase/residentProfiles.js';
import { saveProfile } from '../supabase/profiles.js';

dotenv.config({ quiet: true });
const [checkpoint, applicationCheckpoint] = process.argv.slice(2);
if (process.argv.length !== 4 || [checkpoint, applicationCheckpoint].some(v => !/^[a-f0-9-]{36}$/.test(v || '')))
  throw new Error('Pass the genuine full Auth checkpoint and pre-enrollment application checkpoint UUIDs.');
let checks = 0, stage = 'restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, label);
}
try {
  await withIsolatedBackup(checkpoint, async config => {
    let db = new SupabaseDatabase(config);
    try {
      const digest = async () => (await db.pool.query(`select md5(jsonb_build_object(
        'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
        'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t))::text) as digest`)).rows[0].digest;
      const authBefore = await digest();
      stage = 'native domain relationships';
      const fixture = await db.system(async c => {
        check((await c.query('select count(*) from private.schema_migrations')).rows[0].count === '27', 'Archived pre-enrollment schema is isolated');
        const people = (await c.query(`select u.id,u.email,u.raw_user_meta_data,s.id as session_id from auth.users u
          join lateral (select id from auth.sessions where user_id=u.id and (not_after is null or not_after>clock_timestamp())
            order by created_at desc limit 1) s on true
          where u.email_confirmed_at is not null and not u.is_anonymous
            and exists(select 1 from auth.identities i where i.user_id=u.id and i.provider='google'
              and i.identity_data->'email_verified'='true'::jsonb and lower(i.identity_data->>'email')=lower(u.email))
          order by (lower(u.email)='andyheller2k@gmail.com') desc,u.id limit 5`)).rows;
        check(people.length === 5, 'Five genuine verified Google subjects have actual native sessions');
        const actors: VerifiedActor[] = [];
        for (let i = 0; i < people.length; i++) {
          const person = people[i], owner = i === 1 ? people[0] : i === 3 ? people[2] : null;
          let id: string;
          if (!owner) {
            await c.query('select private.initialize_auth_profile($1,null)', [person.id]);
            id = (await c.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary'", [person.id])).rows[0].id;
          } else {
            await c.query(`insert into public.profiles(id,email,display_name,primary_owner_id)
              select id,email,coalesce(raw_user_meta_data->>'name',raw_user_meta_data->>'full_name',''),$2
              from auth.users where id=$1`, [person.id, owner.id]);
            id = (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'resident','active') returning id", [person.id, owner.id])).rows[0].id;
          }
          const actor = { authUserId: person.id, sessionId: person.session_id, contextId: id, kind: owner ? 'resident' : 'primary' };
          actors.push(actor);
          await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id) values($1,$2,$3)', [actor.sessionId, actor.authUserId, id]);
        }
        const manager = { ...actors[1], kind: 'manager', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id", [people[1].id, people[0].id])).rows[0].id };
        const homes = [];
        for (const [owner, resident] of [[actors[0], actors[1]], [actors[2], actors[3]]]) {
          const residence = (await c.query("insert into public.residences(primary_owner_id,name,status) select $1,display_name,'approved' from public.profiles where id=$1 returning id", [owner.authUserId])).rows[0].id;
          if (owner === actors[0]) await c.query('insert into public.manager_assignments(manager_context_id,residence_id) values($1,$2)', [manager.contextId, residence]);
          const block = (await c.query('insert into public.blocks(residence_id,name) select $1,display_name from public.profiles where id=$2 returning id', [residence, owner.authUserId])).rows[0].id;
          const floor = (await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id', [block])).rows[0].id;
          const room = (await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id", [floor])).rows[0].id;
          const bed = (await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id', [room])).rows[0].id;
          const allocation = (await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id', [resident.contextId, room, bed])).rows[0].id;
          const code = crypto.randomBytes(24).toString('base64url');
          const key = (await c.query('insert into private.room_activation_keys(room_id,code,claimed_by,claimed_at) values($1,$2,$3,clock_timestamp()) returning id', [room, code, resident.contextId])).rows[0].id;
          homes.push({ residence, room, bed, allocation, code, key });
        }
        const applied = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), hash = crypto.createHash('sha256').update(sql).digest('hex');
          if (applied.has(version)) check(applied.get(version) === hash, 'Historical migration is unchanged');
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, hash]); }
        }
        return { actors, manager, homes };
      });
      const { actors: [owner, resident, foreignOwner, foreignResident, unrelated], manager, homes: [home, foreign] } = fixture;
      const read = (actor: VerifiedActor) => db.authorizedSystem(actor, ['primary', 'resident'], c => ownResidentRooms(c, actor));
      let auth = new SupabaseAuth(db);
      stage = 'owned projections';
      const own = await read(owner), child = await read(resident);
      check(own.length === 1 && own[0].roomId === home.room && own[0].roomKey === home.code, 'Primary sees only its saved active allocation/key');
      check(JSON.stringify(own) === JSON.stringify(child), 'Resident and its linked primary see the same room status');
      check(own[0].assignedStudentId === resident.contextId && own[0].assignedStudentEmail === (await auth.projection(resident)).email, 'Resident identity is confined to room status');
      check(own[0].managerName === (await auth.projection(resident)).name, 'Manager name comes from the actual assignment/profile');
      check(!JSON.stringify(own).includes(foreign.code), 'Foreign activation key is never exposed');
      check((await read(foreignOwner))[0].roomId === foreign.room && (await read(foreignResident))[0].roomId === foreign.room, 'Other owner/resident retain their independent room');
      check((await read(unrelated)).length === 0, 'Unrelated primary has an empty room state');
      await db.authorizedSystem(resident, ['resident'], c => saveProfile(c, resident, { avatar: 'preset:pine-cyan' }));
      const parentProfile = await auth.projection(owner), residentProfile = await auth.projection(resident);
      check(parentProfile.profileId === owner.authUserId && parentProfile.email !== residentProfile.email && parentProfile.avatar === null, 'Parent retains its own identity and does not inherit child photograph');
      check(residentProfile.avatar === 'preset:pine-cyan', 'Resident retains its own canonical portrait');
      check(!Object.keys(own[0]).some(k => /avatar|photo|password|token|pin/i.test(k)), 'Room status contains no child credentials or portrait');
      stage = 'denials and RLS';
      for (const query of [{ userId: foreignOwner.authUserId }, { email: residentProfile.email }, { roomId: foreign.room }])
        await denied(async () => checkResidentProfileRequest(owner, query, undefined), 400, 'Client account/room selectors are rejected');
      await denied(async () => checkResidentProfileRequest(owner, {}, resident.contextId), 409, 'Stale portal context is rejected');
      checkResidentProfileRequest(owner, {}, owner.contextId); check(true, 'Own consistency header is accepted');
      for (const kind of ['admin', 'manager', 'seller', 'staff', 'officer'])
        await denied(async () => checkResidentProfileRequest({ ...owner, kind }, {}, undefined), 403, 'Other portal roles cannot use the resident profile route');
      await denied(() => read({ ...owner, authUserId: foreignOwner.authUserId }), 401, 'Forged subject cannot use another native session');
      await denied(() => read({ ...owner, contextId: foreignOwner.contextId }), 401, 'Forged context cannot impersonate another primary');
      const bind = (actor: VerifiedActor) => db.system(c => c.query('update private.account_sessions set active_context_id=$2 where session_id=$1', [actor.sessionId, actor.contextId]));
      await bind(manager);
      await denied(() => read(manager), 403, 'Genuine manager binding is denied resident-profile access');
      await bind(resident);
      check((await db.actor(resident, c => c.query('select id from public.allocations where id=$1', [home.allocation]))).rowCount === 1, 'Scoped resident RLS reads own allocation');
      check((await db.actor(resident, c => c.query('select id from public.allocations where id=$1', [foreign.allocation]))).rowCount === 0, 'Scoped resident RLS denies foreign allocation');
      check((await db.actor(owner, c => c.query('select id from public.allocations where id=$1', [home.allocation]))).rowCount === 0, 'Parent status read does not widen direct allocation RLS');
      await db.system(async c => { await c.query('set local role anon'); await denied(() => c.query('select id from public.allocations'), '42501', 'Guest has no direct allocation grant'); });
      stage = 'revocation and persistence';
      await db.close(); db = new SupabaseDatabase(config); auth = new SupabaseAuth(db);
      check((await read(owner))[0].roomKey === home.code && (await auth.projection(owner)).avatar === null, 'Room status and identity isolation survive database reconnect');
      await db.system(c => c.query('update private.room_activation_keys set revoked_at=clock_timestamp() where id=$1', [home.key]));
      const replacement = crypto.randomBytes(24).toString('base64url');
      await db.system(c => c.query('insert into private.room_activation_keys(room_id,code) values($1,$2)', [home.room, replacement]));
      check((await read(owner))[0].roomKey === '' && (await read(resident))[0].roomKey === '', 'Revoked keys and unclaimed replacements are not exposed');
      await db.system(c => c.query("update public.account_contexts set status='pending' where id=$1", [resident.contextId]));
      check((await read(owner)).length === 0, 'Inactive resident disappears from parent active-room status');
      await denied(() => read(resident), 401, 'Inactive resident session is denied');
      await db.system(c => c.query("update public.account_contexts set status='active' where id=$1", [resident.contextId]));
      await db.system(c => c.query('update public.allocations set ended_at=clock_timestamp() where id=$1', [home.allocation]));
      check((await read(owner)).length === 0, 'Ended room no longer appears active');
      await denied(() => read(resident), 401, 'Resident without active allocation is denied');
      await db.system(c => c.query('delete from private.account_sessions where session_id=$1', [owner.sessionId]));
      await denied(() => read(owner), 401, 'Revoked application session cannot read room status');
      check(await digest() === authBefore, 'Real Auth subjects, identities and native session timestamps remain unchanged');
      console.log(JSON.stringify({ success: true, checks, isolated: true, liveWrites: false, genuineAuthPreserved: true }));
    } finally { await db.close(); }
  }, { applicationCheckpoint });
} catch (error: any) {
  console.error(JSON.stringify({ success: false, stage, checks, code: error?.code || null, error: error instanceof assert.AssertionError ? error.message : 'Native verification failed; credentials suppressed.' }));
  process.exitCode = 1;
}
