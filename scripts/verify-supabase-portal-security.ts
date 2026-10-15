/** Genuine archived Google identities/sessions; domain relationships and PINs
 * are confined to a disposable local restore. No Auth/JWT/provider is fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashPortalPin, checkPortalPin } from '../supabase/portalAccess.js';
import { ownPortalSecurity, changeOwnPortalPin } from '../supabase/portalSecurity.js';
dotenv.config({ quiet: true });
const [checkpoint, applicationCheckpoint] = process.argv.slice(2);
if (process.argv.length !== 4 || [checkpoint, applicationCheckpoint].some(v => !/^[a-f0-9-]{36}$/.test(v || ''))) throw new Error('Pass genuine Auth and pre-enrollment checkpoint UUIDs.');
let checks = 0, stage = 'restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: any; try { await work(); } catch (e) { error = e; }
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
        const foreign: VerifiedActor = { authUserId: foreignPerson.id, sessionId: foreignPerson.sessions[0], kind: 'seller', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'seller','active') returning id", [foreignPerson.id, foreignOwnerPerson.id])).rows[0].id };
        const home = (await c.query("insert into public.residences(primary_owner_id,name,status) values($1,$2,'approved') returning id", [ownerPerson.id, ownerPerson.name])).rows[0].id;
        const block = (await c.query('insert into public.blocks(residence_id,name) values($1,$2) returning id', [home, student.name])).rows[0].id;
        const floor = (await c.query('insert into public.floors(block_id,floor_number) values($1,0) returning id', [block])).rows[0].id;
        const room = (await c.query("insert into public.rooms(floor_id,room_number) values($1,'1') returning id", [floor])).rows[0].id;
        const bed = (await c.query('insert into public.beds(room_id,bed_number) values($1,1) returning id', [room])).rows[0].id;
        const allocation = (await c.query('insert into public.allocations(resident_context_id,room_id,bed_id) values($1,$2,$3) returning id', [resident.contextId, room, bed])).rows[0].id;
        for (const [actor, pin] of [[resident, currentPin], [seller, sellerPin]] as const)
          await c.query('insert into private.portal_access_keys(context_id,pin_hash) values($1,$2)', [actor.contextId, await hashPortalPin(pin)]);
        for (const a of [...ownerActors, resident, seller, foreign])
          await c.query('insert into private.account_sessions(session_id,auth_user_id,active_context_id,portal_pin_version) values($1,$2,$3,$4)', [a.sessionId, a.authUserId, a.contextId, ['resident', 'seller'].includes(a.kind) && a !== foreign ? 1 : null]);
        const applied = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (applied.has(version)) assert.equal(applied.get(version), digest);
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
        return { owner: ownerActors[0], resident, seller, foreign, allocation };
      });
      const { owner, resident, seller, foreign } = fixture;
      stage = 'ownership and validation';
      check((await ownPortalSecurity(db, resident)).portalPinEnabled, 'Resident reads only its own PIN status');
      check((await ownPortalSecurity(db, seller)).sharedEmailIdentity, 'Companion portal shares genuine identity');
      check(!(await ownPortalSecurity(db, foreign)).portalPinEnabled, 'Separate identity has no invented PIN');
      await denied(() => ownPortalSecurity(db, owner), 403, 'Primary owner cannot read child PIN state');
      await denied(() => changeOwnPortalPin(db, owner, { currentPin, newPin: nextPin }), 403, 'Primary owner cannot change child credentials');
      await denied(() => changeOwnPortalPin(db, resident, { currentPin, newPin: nextPin, contextId: foreign.contextId }), 400, 'Client target selector rejected');
      await denied(() => changeOwnPortalPin(db, resident, { currentPin, newPin: nextPin }, foreign.contextId), 409, 'Stale context header denied');
      await denied(() => changeOwnPortalPin(db, { ...resident, contextId: foreign.contextId }, { currentPin, newPin: nextPin }), 401, 'Cross-identity context spoof denied');
      await denied(() => changeOwnPortalPin(db, { ...resident, authUserId: owner.authUserId }, { currentPin, newPin: nextPin }), 401, 'Forged session owner denied');
      await denied(() => changeOwnPortalPin(db, { ...resident, contextId: seller.contextId, kind: 'seller' }, { currentPin: sellerPin, newPin: nextPin }), 401, 'Same-email portal spoof requires a real switch');
      await denied(() => changeOwnPortalPin(db, foreign, { currentPin, newPin: nextPin }), 409, 'Rotation cannot invent a PIN for an independent identity');
      for (const input of [null, [], { currentPin, newPin: '-1' }, { currentPin, newPin: 123456 }, { currentPin, newPin: currentPin }])
        await denied(() => changeOwnPortalPin(db, resident, input), 400, 'Malformed/reused PIN rejected');
      for (const role of ['anon', 'authenticated', 'pinevela_backend'])
        await denied(() => db.system(async c => { await c.query('set local role ' + role); await c.query('select pin_hash from private.portal_access_keys'); }), '42501', 'Browser/scoped roles cannot read private hashes');
      await denied(() => db.system(async c => { await c.query('set local role pinevela_backend'); await c.query('update private.portal_access_keys set version=version+1 where context_id=$1', [resident.contextId]); }), '42501', 'Scoped role cannot bypass credential rotation');
      stage = 'rotation and sibling isolation';
      await denied(() => changeOwnPortalPin(db, resident, { currentPin: sellerPin, newPin: nextPin }), 403, 'Companion PIN cannot change resident PIN');
      check((await db.pool.query('select failed_attempts from private.portal_access_keys where context_id=$1', [resident.contextId])).rows[0].failed_attempts === 1, 'Wrong guess persists after denial');
      const result = await changeOwnPortalPin(db, resident, { currentPin, newPin: nextPin });
      check(result.success && result.signInRequired, 'Correct current PIN rotates its own portal');
      const keys = (await db.pool.query('select context_id,version,failed_attempts from private.portal_access_keys order by context_id')).rows;
      check(String(keys.find(k => k.context_id === resident.contextId).version) === '2', 'Existing native trigger increments the PIN version');
      check(keys.find(k => k.context_id === resident.contextId).failed_attempts === 0, 'Successful rotation resets guess counters');
      check(String(keys.find(k => k.context_id === seller.contextId).version) === '1', 'Other portal version is unchanged');
      await denied(() => ownPortalSecurity(db, resident), 401, 'Old binding is denied after rotation');
      await denied(() => changeOwnPortalPin(db, resident, { currentPin: nextPin, newPin: currentPin }), 401, 'Old binding cannot rotate again');
      check((await ownPortalSecurity(db, seller)).portalPinEnabled, 'Companion native session stays valid');
      const notices = (await db.pool.query('select context_id from public.notification_recipients')).rows.map(r => r.context_id);
      check(notices.length === 2 && notices.includes(resident.contextId) && notices.includes(owner.contextId), 'Notice reaches own portal and saved primary owner only');
      const publicOutput = JSON.stringify((await db.pool.query('select title,message from public.notifications')).rows) + JSON.stringify((await db.pool.query('select event_type,resource_type,event_data from private.audit_events')).rows);
      check(![currentPin, nextPin, sellerPin].some(pin => publicOutput.includes(pin)), 'Audit and notifications contain no PINs');
      check((await db.pool.query('select id from public.allocations where id=$1 and ended_at is null', [fixture.allocation])).rowCount === 1, 'Room allocation survives credential change');
      check(!(await db.system(c => checkPortalPin(c, resident.contextId, currentPin))).allowed, 'Old PIN no longer validates');
      check((await db.system(c => checkPortalPin(c, resident.contextId, nextPin))).allowed, 'New PIN validates');
      const fresh = await new SupabaseAuth(db).switchContext(seller, resident.contextId, nextPin);
      check((await ownPortalSecurity(db, fresh)).portalPinEnabled, 'Valid companion session can legitimately switch using the new PIN');
      await db.close(); db = new SupabaseDatabase(config);
      check((await ownPortalSecurity(db, fresh)).portalPinEnabled, 'Saved binding and PIN version survive reconnect');
      stage = 'guess limit';
      for (let i = 0; i < 5; i++) await denied(() => changeOwnPortalPin(db, fresh, { currentPin, newPin: sellerPin }), 403, 'Wrong guesses are denied');
      const locked = (await db.pool.query('select failed_attempts,locked_until>clock_timestamp() as locked from private.portal_access_keys where context_id=$1', [resident.contextId])).rows[0];
      check(locked.failed_attempts === 5 && locked.locked, 'Five committed guesses lock the portal for real database time');
      await denied(() => changeOwnPortalPin(db, fresh, { currentPin: nextPin, newPin: sellerPin }), 403, 'Lockout also blocks the correct PIN');
      const sibling = (await db.pool.query('select failed_attempts,locked_until from private.portal_access_keys where context_id=$1', [seller.contextId])).rows[0];
      check(sibling.failed_attempts === 0 && sibling.locked_until === null, 'Sibling lockout counters remain unchanged');
      stage = 'concurrent rotation';
      const activeSeller = await new SupabaseAuth(db).switchContext(fresh, seller.contextId, sellerPin);
      const race = await Promise.allSettled([
        changeOwnPortalPin(db, activeSeller, { currentPin: sellerPin, newPin: currentPin }),
        changeOwnPortalPin(db, activeSeller, { currentPin: sellerPin, newPin: nextPin }),
      ]);
      check(race.filter(r => r.status === 'fulfilled').length === 1, 'Concurrent changes produce one successful rotation');
      check(race.some(r => r.status === 'rejected' && r.reason instanceof ApiError && r.reason.status === 401), 'Concurrent obsolete binding is denied');
      check((await db.pool.query("select count(*) from private.audit_events where event_type='portal_pin_changed'")).rows[0].count === '2', 'Only successful changes produce an audit event');
      check((await authDigest()) === beforeAuth, 'Auth users, passwords, identities and native sessions are unchanged');
      check((await db.pool.query("select relrowsecurity from pg_class where oid='private.portal_access_keys'::regclass")).rows[0].relrowsecurity, 'Private key RLS remains enabled');
      console.log(JSON.stringify({ passed: true, checks, isolatedNative: true, genuineArchivedGoogleIdentities: true, authRecordsChanged: false, cloudWrites: false, providerRepliesMocked: false }));
    } finally { await db.close(); }
  }, { applicationCheckpoint });
} catch (error) {
  console.error(JSON.stringify({ passed: false, stage, checks, error: error instanceof ApiError ? error.code || error.status : (error as any)?.code || 'Native verification failed', cloudWrites: false }));
  process.exitCode = 1;
}
