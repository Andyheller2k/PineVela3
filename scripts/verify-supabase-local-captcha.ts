/** Real, isolated PostgreSQL + GoTrue regression for PineVela's replay ledger.
 * Random opaque strings below exercise admission/hash handling only. They are
 * never described as genuine Turnstile solutions: the owned GoTrue instance
 * has CAPTCHA disabled, while actual Cloudflare validation is checked
 * separately with a real browser. No app accounts or product data are seeded. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { createSupabaseApp } from '../supabase/app.js';
import { ApiError, SupabaseDatabase } from '../supabase/db.js';
import { claimCaptchaProof } from '../supabase/captchaProofs.js';
import { passwordAttemptKeys } from '../supabase/loginAttempts.js';
import { runLocalSupabaseVerification, saveLocalFixture, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';

let checks = 0, stage = 'owned native stack verification';
const check = (value: unknown, label: string) => { assert.ok(value, label); checks++; };
const opaque = () => crypto.randomBytes(64).toString('base64url');

async function rejected(work: Promise<unknown>, status: number, code: string, label: string) {
  await assert.rejects(work, (error: unknown) => error instanceof ApiError && error.status === status && error.code === code, label);
  checks++;
}

async function verify(h: LocalSupabaseHarness) {
  await h.assertOwned();
  const before = (await h.db.pool.query(`select (select count(*)::int from auth.users) as users,
    (select count(*)::int from auth.sessions) as sessions,(select count(*)::int from public.profiles) as profiles`)).rows[0];
  check(before.users === 0 && before.sessions === 0 && before.profiles === 0, 'Replay verification begins with no app accounts or sessions');
  const ownProofs: string[] = [], owned = () => { const proof = opaque(); ownProofs.push(proof); return proof; };
  let restarted: { server: http.Server; database: SupabaseDatabase; close: () => Promise<void> } | undefined;

  try {
    stage = 'unrelated API traffic cannot populate the replay ledger';
    const unrelatedProof = owned();
    const rowsBeforeUnrelated = (await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs')).rows[0].count;
    const unrelated = await h.session().json('/api/settings', { captchaToken: unrelatedProof });
    check(unrelated.status === 400 && unrelated.data?.code === 'captcha_required', 'An unrelated API route refuses optional CAPTCHA metadata');
    check((await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs')).rows[0].count === rowsBeforeUnrelated,
      'Rejected unrelated API metadata creates no replay-ledger row');
    await claimCaptchaProof(h.db, unrelatedProof); checks++;

    stage = 'admission lock contention is bounded and recovers';
    const heldProof = owned(), lockHolder = await h.db.pool.connect();
    let lockWaitMilliseconds = 0;
    try {
      await lockHolder.query('begin');
      await lockHolder.query("select pg_advisory_xact_lock(hashtextextended('pinevela-captcha-proof-capacity',0))");
      const lockStarted = performance.now();
      await rejected(claimCaptchaProof(h.db, heldProof), 503, 'captcha_unavailable', 'Real admission-lock contention fails closed with the documented security-capacity response');
      lockWaitMilliseconds = Math.round(performance.now() - lockStarted);
      check(lockWaitMilliseconds >= 1800 && lockWaitMilliseconds < 6000, 'The actual PostgreSQL lock wait ends near the configured two-second timeout');
      const heldHash = crypto.createHash('sha256').update(heldProof).digest('hex');
      check((await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs where proof_hash=$1', [heldHash])).rows[0].count === 0,
        'A timed-out admission commits no replay fingerprint');
    } finally { await lockHolder.query('rollback'); lockHolder.release(); }
    await claimCaptchaProof(h.db, heldProof); checks++;

    stage = 'concurrent global token claim';
    const shared = owned();
    const simultaneous = await Promise.allSettled(Array.from({ length: 8 }, () => claimCaptchaProof(h.db, shared)));
    check(simultaneous.filter(result => result.status === 'fulfilled').length === 1, 'Exactly one concurrent request claims the same opaque proof');
    for (const result of simultaneous.filter(result => result.status === 'rejected'))
      check(result.status === 'rejected' && result.reason instanceof ApiError && result.reason.status === 422 && result.reason.code === 'captcha_failed',
        'Every concurrent duplicate receives the CAPTCHA rejection');
    stage = 'global repeated admission';
    await rejected(claimCaptchaProof(h.db, shared), 422, 'captcha_failed', 'An already claimed proof cannot be admitted again');
    await claimCaptchaProof(h.db, owned()); checks++;

    stage = 'independent database connection and application recreation';
    const target = new URL(h.meta.databaseUrl);
    const database = new SupabaseDatabase({ host: '127.0.0.1', port: Number(target.port),
      database: decodeURIComponent(target.pathname.slice(1)), user: decodeURIComponent(target.username),
      password: decodeURIComponent(target.password), ssl: false, max: 4, connectionTimeoutMillis: 10000,
      statement_timeout: 15000, query_timeout: 30000 });
    const created = createSupabaseApp(database), server = created.app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server.once('listening', resolve));
    restarted = { server, database, close: async () => {
      await created.app.locals.closeSupport?.(); await created.app.locals.closeRealtime?.();
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await database.close();
    } };
    await rejected(claimCaptchaProof(database, shared), 422, 'captcha_failed', 'A recreated Auth/application/database instance retains the previous token claim');

    stage = 'parallel workflow transactions without nested replay-pool starvation';
    const concurrentStarted = performance.now();
    const parallelResends = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      // The fresh native project has no identities. GoTrue handles each
      // unknown-address resend without creating an account or sending mail.
      const response = await fetch(h.origin + '/api/auth/resend-unified', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: `captcha-resend-${index}-${h.meta.runId}@pinevela.invalid`, captchaToken: owned() }),
        signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie().length };
    }));
    const parallelResendMilliseconds = Math.round(performance.now() - concurrentStarted);
    check(parallelResends.every(response => response.status === 202 && response.body?.success === true),
      'Eight distinct simultaneous proof admissions finish their real transaction-held native resend workflow');
    check(parallelResends.every(response => response.cookies === 0), 'Unknown-address resends issue no session cookies');
    const deliveryKeys = Array.from({ length: 8 }, (_, index) => crypto.createHash('sha256')
      .update(`pinevela-signup-email:captcha-resend-${index}-${h.meta.runId}@pinevela.invalid`).digest('hex'));
    check((await h.db.pool.query(`select count(*)::int as count from private.auth_email_delivery_limits
      where bucket_key=any($1::text[]) and send_count=1`, [deliveryKeys])).rows[0].count === 8,
      'All eight actual workflow transactions committed without requesting another replay-ledger pool connection');

    stage = 'actual native password rejection followed by blocked HTTP replay';
    const email = `captcha-${crypto.randomBytes(10).toString('hex')}@pinevela.invalid`, password = opaque() + 'aA1!';
    const pair = passwordAttemptKeys({ email, ip: '127.0.0.1' }), proof = owned();
    const loginBody = { email, password, captchaToken: proof };
    const first = await h.session().json('/api/auth/login', loginBody);
    check(first.status === 401 && first.data?.code === 'invalid_credentials', 'First opaque admission input reaches the actual local GoTrue wrong-credential response');
    check(!first.headers.getSetCookie().length, 'Actual wrong credentials issue no session cookies');
    const failure = (await h.db.pool.query('select failures from private.auth_login_attempts where bucket_key=$1', [pair.pair])).rows[0];
    check(failure?.failures === 1, 'Exactly one real native wrong-password failure was recorded');
    const replay = await h.session().json('/api/auth/login', loginBody);
    check(replay.status === 422 && replay.data?.code === 'captcha_failed', 'HTTP replay is rejected by the persistent guard');
    check(!replay.headers.getSetCookie().length, 'HTTP replay issues no session cookies');
    const newOrigin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    const switched = await fetch(newOrigin + '/api/digital-market/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(loginBody),
      signal: AbortSignal.timeout(15000), redirect: 'error',
    });
    const switchedBody = await switched.json();
    check(switched.status === 422 && switchedBody?.code === 'captcha_failed', 'A recreated application and a different public portal alias reject the same HTTP proof');
    check((await h.db.pool.query('select failures from private.auth_login_attempts where bucket_key=$1', [pair.pair])).rows[0]?.failures === 1,
      'Rejected replays do not reach native password validation or add password failures');
    const unique = await h.session().json('/api/auth/login', { email, password, captchaToken: owned() });
    check(unique.status === 401 && unique.data?.code === 'invalid_credentials', 'A new opaque admission input still reaches actual native credential verification');

    stage = 'required proof validation';
    process.env.AUTH_CAPTCHA_SITE_KEY = '0x4AAAAAAFhbgeiaDBCNBvdK';
    try {
      const missing = await h.session().json('/api/auth/login', { email, password });
      check(missing.status === 400 && missing.data?.code === 'captcha_required', 'A configured widget rejects a missing proof before native Auth');
      for (const captchaToken of ['', ' ', 123, 'x'.repeat(2049)]) {
        const invalid = await h.session().json('/api/auth/login', { email, password, captchaToken });
        check(invalid.status === 400 && invalid.data?.code === 'captcha_required', 'Malformed or overlong proof is rejected before native Auth');
      }
    } finally { delete process.env.AUTH_CAPTCHA_SITE_KEY; }

    stage = 'private migration boundary and digest-only persistence';
    const migrations = fs.readdirSync('supabase/migrations').filter(file => /^\d{14}_[a-z0-9_]+\.sql$/.test(file)).sort();
    const ledger = (await h.db.pool.query('select version,digest from private.schema_migrations order by version')).rows;
    check(migrations.length === 82 && ledger.length === migrations.length, 'The reviewed 82 immutable migrations are installed');
    for (const file of migrations) {
      const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join('supabase/migrations', file))).digest('hex');
      check(ledger.find(row => row.version === file.slice(0, 14))?.digest === digest, 'The immutable local migration digest matches its reviewed source');
    }
    const columns = (await h.db.pool.query(`select column_name from information_schema.columns
      where table_schema='private' and table_name='auth_captcha_proofs' order by ordinal_position`)).rows.map(row => row.column_name);
    check(columns.length > 0 && !columns.some(name => /^(?:token|proof|captcha_token|raw_token|email|ip|user_id|auth_user_id)$/.test(name)),
      'Replay table contains no plaintext proof or account/source identity columns');
    const rows = (await h.db.pool.query('select to_jsonb(p) as row from private.auth_captcha_proofs p')).rows;
    check(rows.length > 0, 'Actual PostgreSQL contains committed replay claims');
    check(!ownProofs.some(token => JSON.stringify(rows).includes(token)), 'No original opaque token is persisted in any replay row');
    const rls = (await h.db.pool.query(`select relrowsecurity from pg_class where oid='private.auth_captcha_proofs'::regclass`)).rows[0];
    check(rls?.relrowsecurity === true, 'Replay table has RLS enabled');
    const publicLeaks = (await h.db.pool.query(`select count(*)::int as count from aclexplode(coalesce(
      (select relacl from pg_class where oid='private.auth_captcha_proofs'::regclass),
      acldefault('r',(select relowner from pg_class where oid='private.auth_captcha_proofs'::regclass)))) where grantee=0`)).rows[0];
    check(publicLeaks.count === 0, 'PUBLIC has no replay-table grants');
    for (const role of ['anon', 'authenticated', 'pinevela_backend', 'pinevela_catalog']) {
      const grants = (await h.db.pool.query(`select has_table_privilege($1,'private.auth_captcha_proofs','SELECT') as can_read,
        has_table_privilege($1,'private.auth_captcha_proofs','INSERT') as can_insert,
        has_table_privilege($1,'private.auth_captcha_proofs','UPDATE') as can_update,
        has_table_privilege($1,'private.auth_captcha_proofs','DELETE') as can_delete`, [role])).rows[0];
      check(!Object.values(grants).some(Boolean), 'Browser and server-selected non-owner roles receive no replay-table privileges');
      await assert.rejects(h.db.system(async client => {
        await client.query('set local role ' + role); await client.query('select * from private.auth_captcha_proofs limit 1');
      }), (error: any) => error?.code === '42501', 'Actual role-selected SQL cannot read the private proof ledger'); checks++;
    }

    stage = 'retention period and bounded cleanup of owned claims';
    const retention = (await h.db.pool.query(`select count(*)::int as count from private.auth_captcha_proofs
      where expires_at<>claimed_at+interval '10 minutes' or not isfinite(claimed_at) or not isfinite(expires_at)`)).rows[0];
    check(retention.count === 0, 'Every actual proof digest has exactly ten minutes of finite replay retention');
    const retained = new Set((await h.db.pool.query('select proof_hash from private.auth_captcha_proofs')).rows.map(row => row.proof_hash));
    for (let index = 0; index < 105; index++) await claimCaptchaProof(h.db, owned());
    const agedHashes = (await h.db.pool.query('select proof_hash from private.auth_captcha_proofs')).rows
      .map(row => row.proof_hash).filter(hash => !retained.has(hash));
    check(agedHashes.length === 105, 'Cleanup targets exactly this isolated run 105 actual guard-generated rows');
    await h.assertOwned();
    const aged = await h.db.system(client => client.query(`update private.auth_captcha_proofs
      set claimed_at=transaction_timestamp()-interval '11 minutes',expires_at=transaction_timestamp()-interval '1 minute'
      where proof_hash=any($1::text[])`, [agedHashes]));
    check(aged.rowCount === 105, 'Only the explicit run-owned proof claims are aged to exercise expiry');
    await claimCaptchaProof(h.db, owned());
    check((await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs where proof_hash=any($1::text[])', [agedHashes])).rows[0].count === 5,
      'One subsequent admission removes at most 100 expired rows');
    await claimCaptchaProof(h.db, owned());
    check((await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs where proof_hash=any($1::text[])', [agedHashes])).rows[0].count === 0,
      'The next admission removes the remaining five expired rows');
    check((await h.db.pool.query('select count(*)::int as count from private.auth_captcha_proofs where proof_hash=any($1::text[])', [[...retained]])).rows[0].count === retained.size,
      'Unexpired replay records remain intact during bounded cleanup');
    stage = 'no app-account or message side effects';
    await h.assertOwned();
    const after = (await h.db.pool.query(`select (select count(*)::int from auth.users) as users,
      (select count(*)::int from auth.sessions) as sessions,(select count(*)::int from public.profiles) as profiles`)).rows[0];
    check(JSON.stringify(after) === JSON.stringify(before), 'Replay verification creates no Auth account, session or profile');
    const captured = await fetch(new URL('/api/v1/messages', h.meta.mailUrl), { signal: AbortSignal.timeout(5000) });
    const mail = await captured.json();
    check(captured.status === 200 && (!mail.messages || mail.messages.length === 0), 'Actual Mailpit received no messages');
    const result = { passed: true, checks, actualNativePostgres: true, actualNativeGoTrue: true,
      unrelatedProofRejectedWithoutWrite: true, lockContentionStatus: 503, lockWaitMilliseconds,
      lockTimeoutRecovery: true,
      actualWrongCredentialRequests: 2, concurrentSameProofClaims: 8, exactlyOneConcurrentClaim: true,
      parallelUnknownAddressResendWorkflows: 8, parallelResendMilliseconds, nestedReplayPoolStarvation: false,
      crossProtectedRouteReplayDenied: true, recreatedApplicationReplayDenied: true,
      malformedProofDenied: true, wrongPasswordCounterUnaffectedByReplay: true, privateRlsAndRoleDenial: true,
      retentionSeconds: 600, cleanupBatchLimitExercised: 100, ownedClaimTimestampsAged: 105,
      capacityLimitRuntimeExercised: false,
      plaintextProofsStored: 0, accountsCreated: 0, sessionsCreated: 0, messagesSent: 0, hostedConnections: 0,
      genuineCloudflareProofsTested: false, nativeLocalCaptchaEnabled: false,
      proofInputs: 'Random technical values test replay admission only; genuine Cloudflare verification is separate.' };
    saveLocalFixture(h, 'captcha-replay-result.json', result); console.log(JSON.stringify(result));
  } finally { await restarted?.close(); }
}

try { await runLocalSupabaseVerification(verify); }
catch (error) {
  console.error(JSON.stringify({ passed: false, stage, checks, error: 'Local native replay verification stopped; inspect private worker diagnostics.' }));
  if (process.argv[2] === '--local-supabase-worker') throw error;
  process.exitCode = 1;
}
