/** Genuine native identities from a privilege-aware local encrypted restore.
 * No provider calls, hosted writes, fabricated accounts or JWTs. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { withIsolatedBackup } from './lib/isolated-postgres.js';
import { ApiError, SupabaseDatabase, type VerifiedActor } from '../supabase/db.js';
import { SupabaseAuth } from '../supabase/auth.js';
import { cleanupFailedCompanionTurn, clearCompanionHistory, reserveCompanionTurn, saveCompanionPreferences } from '../supabase/companion.js';
import { COMPANION_ALLOWANCE } from '../supabase/companionAllowance.js';
import { DEFAULT_COMPANION_PREFERENCES } from '../companionModel.js';

const checkpoint = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(checkpoint, /^[a-f0-9-]{36}$/);
const evidence = '.security/companion-failure-cleanup';
fs.mkdirSync(evidence, { recursive: true, mode: 0o700 });
let checks = 0, stage = 'isolated restore';
function check(value: unknown, label: string) { assert.ok(value, label); checks++; }
async function denied(work: () => Promise<unknown>, expected: number | string, label: string) {
  let error: unknown;
  try { await work(); } catch (caught) { error = caught; }
  check(typeof expected === 'number' ? error instanceof ApiError && error.status === expected
    : (error as { code?: unknown })?.code === expected, label);
}
const rejection = () => new ApiError(503, 'Provider unavailable', 'companion_provider_403');

try {
  await withIsolatedBackup(checkpoint, async config => {
    const db = new SupabaseDatabase(config);
    try {
      stage = 'immutable migrations';
      await db.system(async c => {
        const applied = new Map((await c.query('select version,digest from private.schema_migrations')).rows.map(r => [r.version, r.digest]));
        for (const file of fs.readdirSync('supabase/migrations').filter(f => /^\d{14}_[a-z0-9_]+\.sql$/.test(f)).sort()) {
          const sql = fs.readFileSync('supabase/migrations/' + file, 'utf8');
          const version = file.slice(0, 14), digest = crypto.createHash('sha256').update(sql).digest('hex');
          if (applied.has(version)) assert.equal(applied.get(version), digest, 'Historical migrations remain immutable');
          else { await c.query(sql); await c.query('insert into private.schema_migrations(version,digest) values($1,$2)', [version, digest]); }
        }
      });
      const identityFingerprint = async () => (await db.pool.query(`select md5(jsonb_build_object(
        'users',(select jsonb_agg(to_jsonb(t) order by id) from auth.users t),
        'identities',(select jsonb_agg(to_jsonb(t) order by id) from auth.identities t),
        'sessions',(select jsonb_agg(to_jsonb(t) order by id) from auth.sessions t),
        'profiles',(select jsonb_agg(to_jsonb(t) order by id) from public.profiles t),
        'contexts',(select jsonb_agg(to_jsonb(t) order by id) from public.account_contexts t))::text) as digest`)).rows[0].digest;
      const nativeBefore = await identityFingerprint();
      const originals = (await db.pool.query(`select distinct on(c.auth_user_id) s.auth_user_id as "authUserId",s.session_id as "sessionId",s.active_context_id as "contextId",c.kind
        from private.account_sessions s join auth.sessions n on n.id=s.session_id and n.user_id=s.auth_user_id
        join public.account_contexts c on c.id=s.active_context_id where c.status='active' and c.kind in('primary','admin')
        and (n.not_after is null or n.not_after>now()) and private.portal_session_allowed(c.id,s.portal_pin_version)
        and private.account_session_allowed(c.id,s.session_id) and (c.kind<>'admin' or private.administrator_session_allowed(c.id,s.session_id))
        order by c.auth_user_id,(c.kind='admin') desc,n.created_at desc`)).rows as VerifiedActor[];
      check(originals.length >= 2, 'Two genuine separate native identities and active sessions are available');
      const actors: VerifiedActor[] = [];
      for (const original of originals.slice(0, 2)) {
        const owned = (await db.pool.query("select id from public.account_contexts where auth_user_id=$1 and kind='primary' and status='active'", [original.authUserId])).rows[0];
        check(owned, 'The actual identity owns an existing active primary context');
        // Only this disposable application binding switches to an existing
        // owned context. Native Auth identities and sessions stay untouched.
        const actor = { ...original, contextId: owned.id, kind: 'primary' };
        await db.system(c => c.query('update private.account_sessions set active_context_id=$2 where session_id=$1', [actor.sessionId, actor.contextId]));
        actors.push(actor);
      }
      const [a, b] = actors;
      const auth = new SupabaseAuth(db);
      for (const actor of actors) await db.actor(actor, c => saveCompanionPreferences(c, actor, { ...DEFAULT_COMPANION_PREFERENCES, aiEnabled: true }));
      const reset = async () => db.system(async c => {
        await c.query('update private.companion_preferences set active_request_id=null,active_until=null where context_id=any($1::uuid[])', [actors.map(x => x.contextId)]);
        await c.query('delete from private.companion_usage_windows');
      });
      const ledger = () => db.pool.query('select bucket,window_start,requests,tokens from private.companion_usage_windows order by bucket,window_start').then(result => result.rows);
      const lease = (actor: VerifiedActor) => db.pool.query('select active_request_id,generation from private.companion_preferences where context_id=$1', [actor.contextId]).then(result => result.rows[0]);
      const reserve = async (actor = a, id = crypto.randomUUID()) => {
        const result = await reserveCompanionTurn(auth, actor, id);
        assert.ok(!result.cached && result.allowanceWindow instanceof Date);
        return { id, generation: result.generation as number, allowanceWindow: result.allowanceWindow as Date, used: 0, error: rejection() as unknown };
      };

      stage = 'confirmed rejection and idempotency';
      await reset();
      const first = await reserve();
      check((await ledger()).every(row => row.requests === 1 && row.tokens === COMPANION_ALLOWANCE.reservedTokens), 'Real reservation holds tokens in both user and shared ledgers');
      const released = await cleanupFailedCompanionTurn(auth, a, first);
      check(released.released && released.tokensReleased, 'Exact zero-usage provider rejection releases its lease and token hold');
      check((await ledger()).every(row => row.requests === 1 && row.tokens === 0), 'The attempt still counts while unused reserved tokens are released');
      check((await lease(a)).active_request_id === null, 'Failed request no longer blocks a new turn');
      const fingerprint = JSON.stringify(await ledger());
      const replay = await cleanupFailedCompanionTurn(auth, a, first);
      check(!replay.released && !replay.tokensReleased && JSON.stringify(await ledger()) === fingerprint, 'Repeated cleanup cannot refund twice');
      const competing = await reserve();
      const outcomes = await Promise.all([cleanupFailedCompanionTurn(auth, a, competing), cleanupFailedCompanionTurn(auth, a, competing)]);
      check(outcomes.filter(result => result.tokensReleased).length === 1, 'Concurrent cleanup settles the same hold exactly once');
      check((await ledger()).every(row => row.requests === 2 && row.tokens === 0), 'Concurrent cleanup preserves attempts and cannot over-credit tokens');

      stage = 'ambiguous and partially used requests';
      const unknown = [
        new Error('Unknown failure'),
        new ApiError(503, 'Connection interrupted', 'companion_connection'),
        new ApiError(504, 'Request timed out', 'companion_timeout'),
        new ApiError(503, 'Provider failed', 'companion_provider_500'),
        new ApiError(403, 'Wrong HTTP status', 'companion_provider_403'),
        { status: 503, code: 'companion_provider_403' },
      ];
      for (const error of unknown) {
        await reset();
        const pending = await reserve();
        const result = await cleanupFailedCompanionTurn(auth, a, { ...pending, error });
        check(result.released && !result.tokensReleased && (await ledger()).every(row => row.tokens === COMPANION_ALLOWANCE.reservedTokens && row.requests === 1), 'Unknown, timeout, malformed or mismatched failures retain their token holds');
      }
      await reset();
      const used = await reserve();
      const usedResult = await cleanupFailedCompanionTurn(auth, a, { ...used, used: 123 });
      check(usedResult.released && !usedResult.tokensReleased && (await ledger()).every(row => row.tokens === COMPANION_ALLOWANCE.reservedTokens), 'A later rejection after provider usage cannot release the full reservation');

      stage = 'generation and request binding';
      await reset();
      const old = await reserve();
      await db.actor(a, c => clearCompanionHistory(c, a));
      const current = await reserve(a, old.id);
      check(current.generation !== old.generation, 'Clearing history changes the generation even when a request ID is reused');
      const heldBefore = JSON.stringify(await ledger());
      for (const error of [rejection(), new Error('Unknown old failure')]) {
        const stale = await cleanupFailedCompanionTurn(auth, a, { ...old, error });
        check(!stale.released && !stale.tokensReleased && (await lease(a)).active_request_id === current.id
          && JSON.stringify(await ledger()) === heldBefore, 'Late old-generation failure cannot clear the current lease or settle its tokens');
      }
      const wrongId = await cleanupFailedCompanionTurn(auth, a, { ...current, id: crypto.randomUUID() });
      check(!wrongId.released && !wrongId.tokensReleased && JSON.stringify(await ledger()) === heldBefore, 'A different request ID cannot release the active lease');
      const currentResult = await cleanupFailedCompanionTurn(auth, a, current);
      check(currentResult.tokensReleased && (await ledger()).every(row => row.requests === 2 && row.tokens === COMPANION_ALLOWANCE.reservedTokens), 'Only the new generation settles; the earlier unowned hold remains conservative');

      stage = 'native session and foreign account boundaries';
      await reset();
      const own = await reserve();
      const ownedBefore = JSON.stringify(await ledger());
      const foreign = await cleanupFailedCompanionTurn(auth, b, own);
      check(!foreign.released && !foreign.tokensReleased && (await lease(a)).active_request_id === own.id
        && JSON.stringify(await ledger()) === ownedBefore, 'Another genuine account cannot release the lease or refund the owner');
      await denied(() => cleanupFailedCompanionTurn(auth, { ...b, contextId: a.contextId }, own), 401, 'A foreign context cannot be combined with a native session');
      await denied(() => cleanupFailedCompanionTurn(auth, { ...a, sessionId: crypto.randomUUID() }, own), 401, 'An unbound session cannot perform privileged cleanup');
      check(JSON.stringify(await ledger()) === ownedBefore, 'Denied identities leave all quota accounting unchanged');
      await cleanupFailedCompanionTurn(auth, a, own);

      stage = 'original window settlement';
      await reset();
      const prior = await reserve();
      await db.system(c => c.query("update private.companion_usage_windows set window_start=window_start-interval '5 hours'"));
      const oldWindow = (await ledger())[0].window_start as Date;
      const next = await reserve(b);
      check(next.allowanceWindow.getTime() - oldWindow.getTime() === COMPANION_ALLOWANCE.windowSeconds * 1000, 'The disposable database models an in-flight request crossing a real window boundary');
      const settled = await cleanupFailedCompanionTurn(auth, a, { ...prior, allowanceWindow: oldWindow });
      const afterRollover = await ledger();
      check(settled.tokensReleased && afterRollover.filter(row => row.window_start.getTime() === oldWindow.getTime()).every(row => row.tokens === 0 && row.requests === 1), 'Known rejection settles its originally reserved window');
      check(afterRollover.filter(row => row.window_start.getTime() === next.allowanceWindow.getTime()).every(row => row.tokens === COMPANION_ALLOWANCE.reservedTokens && row.requests === 1), 'Late cleanup cannot reduce the new window token hold');

      stage = 'atomic rollback';
      await reset();
      const atomic = await reserve();
      // A disposable local constraint forces ledger settlement to fail after
      // the lease UPDATE, proving authorizedSystem rolls both writes back.
      await db.system(c => c.query('alter table private.companion_usage_windows add constraint companion_cleanup_atomic_probe check(tokens>0)'));
      try {
        await denied(() => cleanupFailedCompanionTurn(auth, a, atomic), '23514', 'Failed token settlement aborts the atomic cleanup transaction');
        check((await lease(a)).active_request_id === atomic.id && (await ledger()).every(row => row.tokens === COMPANION_ALLOWANCE.reservedTokens), 'A settlement error rolls back lease release as well');
      } finally {
        await db.system(c => c.query('alter table private.companion_usage_windows drop constraint companion_cleanup_atomic_probe'));
      }
      check((await cleanupFailedCompanionTurn(auth, a, atomic)).tokensReleased, 'A valid cleanup succeeds after the isolated fault is removed');
      check(await identityFingerprint() === nativeBefore, 'Genuine native Auth records, profiles and account contexts remain unchanged');
    } finally { await db.close(); }
  });
  const report = { passed: true, checks, isolatedRestore: true, providerCalls: 0, hostedWrites: 0, fabricatedAccounts: 0, fabricatedSessions: 0 };
  fs.writeFileSync(evidence + '/verification.json', JSON.stringify(report, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  fs.writeFileSync(evidence + '/failure.log', String((error as Error)?.stack || error), { mode: 0o600 });
  console.error(JSON.stringify({ passed: false, stage, checks, sqlstate: /^[0-9A-Z]{5}$/.test((error as any)?.code || '') ? (error as any).code : undefined }));
  process.exitCode = 1;
}
