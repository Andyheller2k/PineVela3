/** Real PostgreSQL and native identities from an isolated encrypted restore.
 * No provider calls, fabricated sessions, hosted writes or sample chat records. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { reserveCompanionTurn, saveCompanionPreferences } from '../supabase/companion.js';
import { COMPANION_ALLOWANCE as quota, reserveCompanionAllowance, settleCompanionAllowance } from '../supabase/companionAllowance.js';
import { DEFAULT_COMPANION_PREFERENCES } from '../companionModel.js';
import { ResourceLimitError } from '../resourceSecurity.js';

const checkpoint = process.argv[2];
assert.equal(process.argv.length, 3); assert.match(checkpoint, /^[a-f0-9-]{36}$/);
const evidence = '.security/companion-allowance';
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
let checks = 0, stage = 'isolated restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string) {
  let error: any; try { await work(); } catch (e) { error = e; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected : error?.code === expected, 'Unauthorized operation is denied');
}
function limited(result: PromiseSettledResult<unknown>) {
  if (result.status !== 'rejected') return false;
  const error = result.reason;
  return error instanceof ResourceLimitError && error.status === 429 && error.retryAfter >= 1 && error.retryAfter <= quota.windowSeconds
    && error.message.includes('five-hour window') && !error.message.includes('Today');
}
try {
  await withIsolatedBackup(checkpoint, async config => {
    let db = new SupabaseDatabase(config);
    try {
      stage = 'immutable migrations';
      const files = fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort();
      await db.system(async c => {
        const ledger = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of files) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8'), version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (ledger.has(version)) assert.equal(ledger.get(version), digest);
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
      });
      check((await db.pool.query('select count(*)::int as n from private.schema_migrations')).rows[0].n === files.length, 'All immutable migrations install');
      const legacyFingerprint = async () => JSON.stringify((await db.pool.query('select * from private.companion_usage order by bucket,usage_day')).rows);
      const legacyBefore = await legacyFingerprint();
      const actors = (await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
        from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
        join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind='primary'
        and (n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
        and private.account_session_allowed(c.id,s.session_id) order by c.auth_user_id,n.created_at desc limit 2`)).rows as VerifiedActor[];
      check(actors.length === 2, 'Two genuine active primary identities are available');
      const [a, b] = actors;
      let auth = new SupabaseAuth(db);
      const reserve = (actor: VerifiedActor) => db.authorizedSystem(actor, ['primary'], c => reserveCompanionAllowance(c, actor.authUserId));
      const clearWindows = () => db.system(c => c.query('delete from private.companion_usage_windows'));
      const usage = () => db.pool.query('select bucket,window_start,requests,tokens from private.companion_usage_windows order by bucket,window_start').then(r => r.rows);

      stage = 'RLS and native session boundaries';
      check((await db.pool.query("select relrowsecurity from pg_class where oid='private.companion_usage_windows'::regclass")).rows[0].relrowsecurity, 'Window ledger keeps RLS');
      for (const role of ['anon', 'authenticated', 'pinevela_catalog', 'pinevela_backend']) for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'])
        check(!(await db.pool.query("select has_table_privilege($1,'private.companion_usage_windows',$2) as allowed", [role, verb])).rows[0].allowed, 'Direct clients cannot read, reset or forge quota');
      await denied(() => db.readActor(a, c => c.query('select * from private.companion_usage_windows')), '42501');
      await denied(() => db.actor(a, c => c.query('delete from private.companion_usage_windows')), '42501');
      await denied(() => reserve({ ...a, contextId: b.contextId }), 401);
      await denied(() => reserve({ ...a, kind: 'admin' }), 401);
      await denied(() => reserveCompanionTurn(auth, a, crypto.randomUUID()), 403);
      check((await usage()).length === 0, 'Missing consent reserves no quota');
      await db.actor(a, c => saveCompanionPreferences(c, a, { ...DEFAULT_COMPANION_PREFERENCES, aiEnabled: true }));
      const admitted = await reserveCompanionTurn(auth, a, crypto.randomUUID());
      check(admitted.allowanceWindow instanceof Date, 'Consenting native user reserves the new ledger');
      await denied(() => reserveCompanionTurn(auth, a, crypto.randomUUID()), 409);
      await db.system(c => c.query('update private.companion_preferences set active_request_id=null,active_until=null where context_id=$1', [a.contextId]));
      await clearWindows();

      stage = 'larger allowance and exact retry boundary';
      for (let i = 0; i < quota.userRequests; i++) {
        const start = await reserve(a);
        await db.authorizedSystem(a, ['primary'], c => settleCompanionAllowance(c, a.authUserId, start, 100));
      }
      const beforeDenied = JSON.stringify(await usage());
      check(limited((await Promise.allSettled([reserve(a)]))[0]), 'Attempt 26 is paused for at most five hours');
      check(JSON.stringify(await usage()) === beforeDenied, 'Rejected user quota rolls back its global reservation');
      for (let i = 0; i < quota.userRequests; i++) {
        const start = await reserve(b);
        await db.authorizedSystem(b, ['primary'], c => settleCompanionAllowance(c, b.authUserId, start, 100));
      }
      check((await usage()).find(r => r.bucket === 'global')?.requests === quota.globalRequests, 'App allowance permits 50 attempts');
      check(limited((await Promise.allSettled([reserve(b)]))[0]), 'Shared exhaustion also uses the five-hour reset');
      const start = (await usage()).find(r => r.bucket === 'global')!.window_start;
      check(start.getTime() % (quota.windowSeconds * 1000) === 0, 'Database uses an aligned five-hour boundary');

      stage = 'concurrent reservations';
      await db.system(c => c.query(`update private.companion_usage_windows set requests=case when bucket='global' then $1::int else $2::int end`, [quota.globalRequests - 1, quota.userRequests - 1]));
      const competing = await Promise.allSettled([reserve(a), reserve(b), reserve(a), reserve(b)]);
      check(competing.filter(r => r.status === 'fulfilled').length === 1 && competing.filter(limited).length === 3, 'Concurrent tabs cannot overspend the last shared attempt');
      check((await usage()).find(r => r.bucket === 'global')?.requests === quota.globalRequests, 'Atomic shared counter never exceeds its limit');

      stage = 'token guard and rollover settlement';
      await clearWindows();
      await reserve(a);
      await db.system(c => c.query('update private.companion_usage_windows set tokens=$2 where bucket=$1', [a.authUserId, quota.userTokens - quota.reservedTokens + 1]));
      const beforeTokens = JSON.stringify(await usage());
      check(limited((await Promise.allSettled([reserve(a)]))[0]), 'Token reservation also stays bounded');
      check(JSON.stringify(await usage()) === beforeTokens, 'Token rejection rolls back both reservations');
      await clearWindows();
      await reserve(a);
      await db.system(c => c.query("update private.companion_usage_windows set window_start=window_start-interval '5 hours'"));
      const oldWindow = (await usage())[0].window_start;
      const newWindow = await reserve(a);
      check(newWindow.getTime() - oldWindow.getTime() === quota.windowSeconds * 1000, 'An expired window automatically restores allowance');
      await db.authorizedSystem(a, ['primary'], c => settleCompanionAllowance(c, a.authUserId, oldWindow, 123));
      const rollover = await usage();
      check(rollover.filter(r => r.window_start.getTime() === oldWindow.getTime()).every(r => r.tokens === 123), 'Late reply settles its original window');
      check(rollover.filter(r => r.window_start.getTime() === newWindow.getTime()).every(r => r.tokens === quota.reservedTokens && r.requests === 1), 'Late settlement cannot reduce the new window');

      stage = 'restart persistence and revocation';
      const persisted = JSON.stringify(await usage());
      await db.close(); db = new SupabaseDatabase(config); auth = new SupabaseAuth(db);
      check(JSON.stringify(await usage()) === persisted, 'Restart retains allowance accounting');
      check(await legacyFingerprint() === legacyBefore, 'Historical daily counters remain untouched');
      await db.system(c => c.query('delete from private.account_sessions where session_id=$1', [a.sessionId]));
      await denied(() => reserveCompanionTurn(auth, a, crypto.randomUUID()), 401);
      check(JSON.stringify(await usage()) === persisted, 'Revoked session cannot consume or reset allowance');
    } finally { await db.close(); }
  });
  const result = { passed: true, checks, allowance: quota, isolatedRestore: true, providerCalls: 0, hostedWrites: 0, fabricatedSessions: 0 };
  fs.writeFileSync(evidence + '/verification.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
} catch (error) {
  fs.writeFileSync(evidence + '/failure.log', String((error as any)?.stack || error), { mode: 0o600 });
  console.error(JSON.stringify({ passed: false, stage, checks, sqlstate: /^[0-9A-Z]{5}$/.test((error as any)?.code || '') ? (error as any).code : undefined }));
  process.exitCode = 1;
}
