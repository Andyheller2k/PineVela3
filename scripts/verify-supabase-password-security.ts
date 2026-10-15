/** Genuine archived Google identities/sessions; domain relationships and PINs
 * are confined to a disposable local restore. No Auth/JWT/provider is fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { hashPortalPin } from '../supabase/portalAccess.js';
import { passwordFields, newEmailPassword, recoveryEmail, recoveryChallenge, ownManagerPasswordIdentity, requirePasswordIdentity, recordEmailPasswordChange } from '../supabase/passwordSecurity.js';
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
        const foreign: VerifiedActor = { authUserId: foreignPerson.id, sessionId: foreignPerson.sessions[0], kind: 'manager', contextId: (await c.query("insert into public.account_contexts(auth_user_id,primary_owner_id,kind,status) values($1,$2,'manager','active') returning id", [foreignPerson.id, foreignOwnerPerson.id])).rows[0].id };
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

      stage = 'input and recovery boundaries';
      const providerUrl = 'https://' + new URL(process.env.SUPABASE_URL!).hostname;
      const link = providerUrl + '/auth/v1/verify?type=recovery&token=' + crypto.randomBytes(32).toString('hex');
      check('token_hash' in recoveryChallenge(link, providerUrl), 'Unopened configured recovery links parse without being fetched');
      check(recoveryChallenge('123456', providerUrl).type === 'recovery', 'OTP is restricted to recovery');
      for (const bad of [null, [], 'garbage', link.replace('type=recovery','type=signup'), link.replace('type=recovery','type=email'), link.replace('type=recovery','type=invite'), link.replace(providerUrl,'https://example.invalid'), link + '&type=recovery', link + '&token_hash=' + 'a'.repeat(64), link + '#access_token=invalid'])
        await denied(async () => recoveryChallenge(bad, providerUrl), 400, 'Wrong-provider, wrong-flow, malformed or duplicate challenge rejected');
      for (const bad of [null, [], { email: 'x', authUserId: foreign.authUserId }, { email: 'x', role: 'admin' }])
        await denied(async () => passwordFields(bad, ['email']), 400, 'Credential target selectors are rejected');
      for (const bad of [null, 12345678, '', 'short', 'x'.repeat(257)])
        await denied(async () => newEmailPassword(bad), 400, 'Malformed password rejected before provider work');
      for (const bad of [null, [], 'bad@', 'x'.repeat(255)])
        await denied(async () => recoveryEmail(bad), 400, 'Malformed email rejected');
      check(newEmailPassword('a'.repeat(8)).length === 8, 'Minimum password accepted for provider strength checks');
      check(newEmailPassword('a'.repeat(256)).length === 256, 'Maximum password accepted');
      stage = 'native ownership';
      await denied(() => ownManagerPasswordIdentity(db, owner), 403, 'Primary cannot change separate work identity');
      await denied(() => ownManagerPasswordIdentity(db, resident), 403, 'Resident cannot invoke manager password flow');
      await denied(() => ownManagerPasswordIdentity(db, foreign, owner.contextId), 409, 'Stale context header rejected');
      await denied(() => ownManagerPasswordIdentity(db, { ...foreign, contextId: owner.contextId }), 401, 'Foreign context cannot become credential owner');
      await denied(() => ownManagerPasswordIdentity(db, { ...foreign, authUserId: resident.authUserId }), 401, 'Native session owner cannot be forged');
      await denied(() => ownManagerPasswordIdentity(db, foreign), 409, 'Genuine Google-only identity requires recovery, not invented current password');
      await requirePasswordIdentity(db, resident); check(true, 'Actual enrolled verified native identity is eligible');
      await denied(() => requirePasswordIdentity(db, { authUserId: foreign.authUserId, sessionId: resident.sessionId }), 403, 'Recovery session and subject must agree');
      const missing = (await db.pool.query(`select s.user_id as "authUserId",s.id as "sessionId" from auth.sessions s where not exists(select 1 from public.profiles p where p.id=s.user_id) limit 1`)).rows[0];
      check(Boolean(missing), 'Genuine archived identity remains unregistered');
      await denied(() => requirePasswordIdentity(db, missing), 403, 'Recovery cannot create an unregistered PineVela profile');
      for (const role of ['anon','authenticated','pinevela_backend'])
        await denied(() => db.system(async c => { await c.query('set local role ' + role); await c.query('select encrypted_password from auth.users'); }), '42501', 'Browser/scoped role cannot read Auth password hashes');
      const beforeBindings = (await db.pool.query('select session_id,auth_user_id from private.account_sessions order by session_id')).rows;
      const beforePin = (await db.pool.query('select context_id,pin_hash,version from private.portal_access_keys order by context_id')).rows;
      const beforeContexts = (await db.pool.query('select * from public.account_contexts order by id')).rows;
      stage = 'native post-provider lifecycle only';
      const result = await recordEmailPasswordChange(db, resident);
      check(result.success && result.signInRequired, 'Internal lifecycle records completion and requires sign-in');
      check(!(await db.pool.query('select 1 from private.account_sessions where auth_user_id=$1',[resident.authUserId])).rowCount, 'All shared-identity portal bindings ended');
      const remainingBindings = (await db.pool.query('select session_id,auth_user_id from private.account_sessions order by session_id')).rows;
      check(JSON.stringify(remainingBindings) === JSON.stringify(beforeBindings.filter(b => b.auth_user_id !== resident.authUserId)), 'Separate primary and manager bindings stay unchanged');
      check(JSON.stringify((await db.pool.query('select context_id,pin_hash,version from private.portal_access_keys order by context_id')).rows) === JSON.stringify(beforePin), 'Portal PINs and versions unchanged');
      check(JSON.stringify((await db.pool.query('select * from public.account_contexts order by id')).rows) === JSON.stringify(beforeContexts), 'Contexts, ownership and roles unchanged');
      check((await db.pool.query('select 1 from public.allocations where id=$1 and ended_at is null',[fixture.allocation])).rowCount === 1, 'Active room allocation survives password lifecycle');
      const notices = (await db.pool.query('select context_id from public.notification_recipients order by context_id')).rows.map(r => r.context_id);
      check(notices.length === 2 && notices.includes(resident.contextId) && notices.includes(seller.contextId), 'Security notices target only own identity portals');
      check((await db.pool.query("select n.category from public.notifications n join public.notification_recipients r on r.notification_id=n.id where r.context_id=$1",[seller.contextId])).rows[0].category === 'market_account_security', 'Seller inbox includes its security notice');
      const audit = (await db.pool.query("select resource_id,event_data from private.audit_events where event_type='email_password_changed'")).rows;
      check(audit.length === 1 && audit[0].resource_id === resident.authUserId && JSON.stringify(audit[0].event_data) === '{}', 'Audit records subject and no secret/proof contents');
      await denied(() => db.actor(resident, async () => true), 401, 'Resident stale binding cannot perform operations');
      await denied(() => db.actor(seller, async () => true), 401, 'Shared seller stale binding cannot perform operations');
      check(await db.actor(owner, async () => true), 'Separate primary remains authorized');
      check(await db.actor(foreign, async () => true), 'Separate manager remains authorized');
      await db.close(); db = new SupabaseDatabase(config);
      await denied(() => db.actor(resident, async () => true), 401, 'Binding revocation survives reconnect');
      check((await authDigest()) === beforeAuth, 'Lifecycle never edits provider Auth records');
      check((await db.pool.query("select bool_and(relrowsecurity) as enabled from pg_class where oid in ('private.account_sessions'::regclass,'private.portal_access_keys'::regclass)")).rows[0].enabled, 'Private credential/session RLS retained');
      console.log(JSON.stringify({passed:true,checks,isolatedNative:true,genuineArchivedGoogleIdentities:true,authRecordsChanged:false,cloudWrites:false,providerRepliesMocked:false,providerPasswordMutationVerified:false}));
    } finally { await db.close(); }
  }, { applicationCheckpoint });
} catch (error) {
  console.error(JSON.stringify({passed:false,stage,checks,error:error instanceof ApiError ? error.code || error.status : (error as any)?.code || 'Native verification failed',cloudWrites:false}));
  process.exitCode=1;
}
