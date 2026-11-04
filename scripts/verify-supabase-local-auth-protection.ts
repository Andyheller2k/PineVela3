import {termsAcceptance} from '../legalPolicy.js';
/** Real isolated GoTrue, SMTP capture, application routes and PostgreSQL.
 * Only this run's own delivery timestamps are aged to exercise hours-long
 * cooldowns without waiting. No provider responses, credentials or JWTs are
 * invented, and no cloud endpoint is admitted by the harness. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createSupabaseApp } from '../supabase/app.js';
import { passwordAttemptKeys } from '../supabase/loginAttempts.js';
import { runLocalSupabaseVerification, saveLocalFixture, type LocalSupabaseHarness } from './lib/local-supabase-harness.js';

let checks = 0, stage = 'isolated native startup', nextMutationAt = 0;
const check = (condition: unknown, label: string) => { assert.ok(condition, label); checks++; };
const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));
type Reply = { status: number; data: any; retryAfter: number; cookies: string[] };

/** Source addresses are real socket bindings, never forged forwarding headers.
 * Every stored cookie originates in the application's actual Set-Cookie. */
class NativeSession {
  private cookies = new Map<string, string>();
  constructor(public origin: string, readonly address = '127.0.0.1') {}
  async request(route: string, body?: unknown, concurrent = false): Promise<Reply> {
    const url = new URL(route, this.origin);
    assert.equal(url.origin, this.origin); assert.ok(url.pathname.startsWith('/api/'));
    if (body !== undefined && !concurrent) {
      const now = Date.now(), wait = Math.max(0, nextMutationAt - now);
      nextMutationAt = Math.max(now, nextMutationAt) + 3200;
      if (wait) await sleep(wait);
    }
    const bytes = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request(url, { method: bytes ? 'POST' : 'GET', localAddress: this.address,
        headers: { origin: process.env.PINEVELA_PUBLIC_ORIGIN || this.origin, ...(bytes ? { 'content-type': 'application/json', 'content-length': bytes.length } : {}),
          ...(this.cookies.size ? { cookie: [...this.cookies].map(([key, value]) => key + '=' + value).join('; ') } : {}) } }, response => {
        const parts: Buffer[] = []; let length = 0;
        response.on('data', (part: Buffer) => { length += part.length; if (length > 1024 * 1024) request.destroy(Error('Bounded local response exceeded.')); else parts.push(part); });
        response.on('error', reject);
        response.on('end', () => {
          const cookies = response.headers['set-cookie'] || [];
          for (const line of cookies) {
            const first = line.split(';', 1)[0], split = first.indexOf('='); if (split < 1) continue;
            const key = first.slice(0, split), value = first.slice(split + 1);
            if (!value || /(?:^|;)\s*max-age=0(?:;|$)/i.test(line)) this.cookies.delete(key); else this.cookies.set(key, value);
          }
          let data: any; try { data = JSON.parse(Buffer.concat(parts).toString()); } catch { data = null; }
          resolve({ status: response.statusCode || 0, data, retryAfter: Number(response.headers['retry-after'] || 0), cookies });
        });
      });
      request.setTimeout(45000, () => request.destroy(Error('Local protection request timed out.')));
      request.on('error', reject); request.end(bytes);
    });
  }
}

async function verify(h: LocalSupabaseHarness) {
  await h.assertOwned();
  // The development fallback intentionally accepts only 127.0.0.1 peers.
  // Exercise real alternate loopback sources under the normal configured
  // production-origin policy instead of weakening its CSRF/peer checks.
  process.env.PINEVELA_PUBLIC_ORIGIN = 'https://pinevela.app';
  const suffix = h.meta.runId.replaceAll('-', ''), unique = crypto.randomBytes(4).toString('hex');
  const email = `protection-${unique}-${suffix}@pinevela.test`, password = crypto.randomBytes(30).toString('base64url') + 'aA1!';
  const deliveryKey = crypto.createHash('sha256').update('pinevela-signup-email:' + email).digest('hex');
  const pair = passwordAttemptKeys({ email, ip: '127.0.0.1' });
  const guest = new NativeSession(h.origin);
  saveLocalFixture(h, 'auth-protection-credentials.json', { runId: h.meta.runId, email, password });
  let authId = '', latestMailAt = 0, timestampAgingOperations = 0;
  let restarted: { server: http.Server; close: () => Promise<void> } | undefined;

  const delivery = async () => (await h.db.pool.query(`select send_count,next_allowed_at,last_requested_at
    from private.auth_email_delivery_limits where bucket_key=$1`, [deliveryKey])).rows[0];
  const failures = async (key = pair.pair) => (await h.db.pool.query(`select failures,blocked_until,recent_failures,updated_at
    from private.auth_login_attempts where bucket_key=$1`, [key])).rows[0];
  async function mailCount() {
    const response = await fetch(new URL('/api/v1/messages', h.meta.mailUrl), { signal: AbortSignal.timeout(5000) });
    assert.equal(response.status, 200); const body = await response.json();
    return (body.messages || []).filter((message: any) => message.To?.some((to: any) => String(to.Address).toLowerCase() === email)).length;
  }
  async function ageOwnDelivery() {
    await h.assertOwned();
    await h.db.system(async client => {
      const owner = (await client.query(`select id from auth.users where id=$1 and lower(email)=$2
        and email_confirmed_at is null and lower(email) like $3`, [authId, email, '%' + suffix + '@pinevela.test'])).rows[0];
      assert.ok(owner, 'Timestamp aging belongs only to this run unconfirmed identity');
      // Identical transaction_timestamp() values avoid introducing a fictitious
      // direct-provider delivery during the cooldown test's time advance.
      await client.query(`update auth.users set confirmation_sent_at=transaction_timestamp()-interval '3 hours' where id=$1`, [authId]);
      const changed = await client.query(`update private.auth_email_delivery_limits
        set last_requested_at=transaction_timestamp()-interval '3 hours',next_allowed_at=transaction_timestamp()-interval '1 second'
        where bucket_key=$1`, [deliveryKey]);
      assert.equal(changed.rowCount, 1);
    });
    timestampAgingOperations++;
  }
  async function waitForMailCount(expected: number) {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) { if (await mailCount() === expected) return; await sleep(150); }
    assert.equal(await mailCount(), expected, 'Exactly the expected actual captured messages arrived');
  }

  try {
    stage = 'real pending signup and initial five-minute limit'; latestMailAt = Date.now();
    const signup = await guest.request('/api/auth/register-unified', { termsAcceptance: termsAcceptance(true), name: 'Local Auth Protection', email, password });
    check(signup.status === 202 && signup.data?.verificationRequired === true, 'Actual native signup requires email confirmation');
    authId = signup.data.signupId;
    check(typeof authId === 'string' && /^[0-9a-f-]{36}$/.test(authId), 'Actual native signup subject exists');
    check(signup.data.retryAfter === 300, 'Initial native delivery has a five-minute cooldown');
    await h.mail.confirmation(email, latestMailAt); await waitForMailCount(1);
    check((await delivery()).send_count === 1, 'Initial actual delivery persists its first budget');
    let sent = 1;

    stage = 'early resend rejection and CAPTCHA admission';
    const early = await guest.request('/api/auth/resend-unified', { email });
    check(early.status === 429 && early.retryAfter > 0 && early.retryAfter <= 300, 'An early request has a real Retry-After');
    check((await delivery()).send_count === 1, 'Rejected early resend does not advance the delivery penalty');
    check(await mailCount() === 1, 'Rejected early resend produces no captured email');
    await ageOwnDelivery();
    const beforeCaptcha = await delivery();
    process.env.AUTH_CAPTCHA_SITE_KEY = '0x4AAAAAAFhbgeiaDBCNBvdK';
    try {
      const missing = await guest.request('/api/auth/resend-unified', { email });
      check(missing.status === 400 && missing.data?.code === 'captcha_required', 'Configured CAPTCHA requires a proof before delivery');
    } finally { delete process.env.AUTH_CAPTCHA_SITE_KEY; }
    check(JSON.stringify(await delivery()) === JSON.stringify(beforeCaptcha), 'Missing CAPTCHA does not advance the persisted email budget');
    check(await mailCount() === 1, 'Missing CAPTCHA sends no native email');

    stage = 'real resends through the complete escalating schedule';
    const observedDelays = [300];
    for (const expected of [600, 1200, 3600, 7200, 7200]) {
      await ageOwnDelivery(); latestMailAt = Date.now();
      const resend = await guest.request('/api/auth/resend-unified', { email });
      check(resend.status === 202 && resend.data?.retryAfter === expected, 'Actual resend returns its scheduled escalating cooldown');
      observedDelays.push(resend.data.retryAfter); sent++;
      await h.mail.confirmation(email, latestMailAt); await waitForMailCount(sent);
      const saved = await delivery();
      check(saved.send_count === Math.min(5, sent), 'Real delivery advances and caps the persisted send count');
      const duplicate = await guest.request('/api/auth/resend-unified', { email });
      check(duplicate.status === 429 && duplicate.retryAfter > 0 && duplicate.retryAfter <= expected, 'Early request remains denied at the new cooldown');
      check((await delivery()).send_count === saved.send_count && await mailCount() === sent, 'Rejected repeated request does not consume a new send or penalty');
    }

    stage = 'simultaneous real resend requests';
    await ageOwnDelivery(); latestMailAt = Date.now();
    // Both socket requests begin together. PostgreSQL's actual advisory lock,
    // not a substituted provider response, must serialize the native send.
    const parallel = await Promise.all([guest.request('/api/auth/resend-unified', { email }, true),
      new NativeSession(guest.origin).request('/api/auth/resend-unified', { email }, true)]);
    check(parallel.filter(reply => reply.status === 202).length === 1 && parallel.filter(reply => reply.status === 429).length === 1,
      'Exactly one simultaneous resend is admitted');
    sent++; await h.mail.confirmation(email, latestMailAt); await waitForMailCount(sent);
    check((await delivery()).send_count === 5, 'Concurrent attempts retain the capped send count');

    stage = 'real latest-email confirmation and password login';
    const proof = await h.mail.confirmation(email, latestMailAt);
    const verified = await guest.request('/api/auth/verify-unified', { termsAcceptance: termsAcceptance(true), email, signupId: authId, code: h.providerOrigin + proof });
    check(verified.status === 200 && verified.data?.verified === true && verified.data?.user?.role === 'user',
      'Latest genuine captured email still activates the original primary');
    const contextId = verified.data.user.id;
    check(verified.cookies.filter(cookie => cookie.startsWith('pv_sb_') && /httponly/i.test(cookie)).length === 2,
      'Real confirmation returns actual HttpOnly cookies');
    check((await guest.request('/api/auth/logout', {})).status === 200, 'Verified session signs out before incorrect password tests');

    stage = 'five actual incorrect credentials and shared alias budgets';
    const loginPaths = ['/api/auth/login', '/api/digital-market/login', '/api/auth/verification-team-login', '/api/verification-teams/login', '/api/auth/login'];
    for (let index = 0; index < loginPaths.length; index++) {
      const bad = await guest.request(loginPaths[index], { email, password: password + 'wrong' });
      check(bad.status === (index === 4 ? 429 : 401), 'Native wrong-password failures share one counter across login aliases');
      check((await failures()).failures === index + 1, 'Rejected native credentials commit before the HTTP error');
      if (index === 2) {
        stage = 'new app and Auth instance preserve failure and email budgets';
        const created = createSupabaseApp(h.db), server = created.app.listen(0, '127.0.0.1');
        await new Promise<void>(resolve => server.once('listening', resolve));
        restarted = { server, close: async () => {
          await created.app.locals.closeSupport?.(); await created.app.locals.closeRealtime?.();
          server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
        } };
        guest.origin = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
        check((await failures()).failures === 3 && (await delivery()).send_count === 5, 'Recreated application retains the persisted admission state');
      }
      if (index === 4) check(bad.retryAfter === 900 && !bad.cookies.length, 'Fifth failure starts a fifteen-minute cooldown without issuing cookies');
    }
    const blockedBefore = await failures();
    const correctBlocked = await guest.request('/api/auth/login', { email, password });
    check(correctBlocked.status === 429 && correctBlocked.retryAfter > 0, 'Correct password cannot bypass the current source/email pause');
    check(JSON.stringify(await failures()) === JSON.stringify(blockedBefore), 'Blocked requests do not extend or increase the failed-attempt state');

    stage = 'CAPTCHA rejection does not count as incorrect credentials';
    const alternative = new NativeSession(guest.origin, '127.0.0.2');
    const alternativePair = passwordAttemptKeys({ email, ip: alternative.address });
    process.env.AUTH_CAPTCHA_SITE_KEY = '0x4AAAAAAFhbgeiaDBCNBvdK';
    try {
      const missing = await alternative.request('/api/auth/login', { email, password: password + 'wrong' });
      check(missing.status === 400 && missing.data?.code === 'captcha_required', 'Missing CAPTCHA is rejected independently of credentials');
    } finally { delete process.env.AUTH_CAPTCHA_SITE_KEY; }
    check(!await failures(alternativePair.pair), 'A missing CAPTCHA proof creates no credential failure');
    const alternativeLogin = await alternative.request('/api/auth/login', { email, password });
    check(alternativeLogin.status === 200 && alternativeLogin.data?.id === contextId, 'A different real source IP can still sign in to the same victim account');
    check((await alternative.request('/api/auth/me')).data?.id === contextId, 'Alternate source has a genuine working primary session');

    stage = 'success clears the pair while retaining spray protection';
    const spray = new NativeSession(guest.origin, '127.0.0.3'), sprayKeys = passwordAttemptKeys({ email, ip: spray.address });
    check((await spray.request('/api/auth/login', { email, password: password + 'wrong' })).status === 401, 'One incorrect credential creates source-local state');
    check((await failures(sprayKeys.pair)).failures === 1 && (await failures(sprayKeys.ip)).failures === 1, 'Both actual source budgets record the failure');
    check((await spray.request('/api/auth/login', { email, password })).status === 200, 'A valid credential remains admitted below the threshold');
    check(!await failures(sprayKeys.pair) && (await failures(sprayKeys.ip)).failures === 1, 'Success clears only its pair, preserving the IP failure history');

    stage = 'real cross-email spray protection';
    for (let attempt = 2; attempt <= 30; attempt++) {
      const sprayedEmail = `spray-${attempt}-${unique}-${suffix}@pinevela.test`;
      const bad = await spray.request('/api/auth/login', { email: sprayedEmail, password });
      check(bad.status === (attempt === 30 ? 429 : 401), 'Native credential spray accumulates across distinct emails');
    }
    check((await failures(sprayKeys.ip)).failures === 30, 'Thirtieth real source failure persists the IP-wide pause');
    const sprayBlocked = await spray.request('/api/digital-market/login', { email, password });
    check(sprayBlocked.status === 429 && sprayBlocked.retryAfter > 0, 'Source-wide pause covers another portal alias and correct password');
    const stillAvailable = await alternative.request('/api/auth/login', { email, password });
    check(stillAvailable.status === 200 && stillAvailable.data?.id === contextId, 'Spray protection does not globally lock the target account');
    check((await alternative.request('/api/auth/logout', {})).status === 200, 'The unaffected source session can sign out');

    await h.assertOwned();
    const ownCounts = (await h.db.pool.query(`select
      count(*) filter(where lower(email)=$1)::int as registered,
      count(*) filter(where lower(email) like $2)::int as sprayed
      from auth.users`, [email, `spray-%-${unique}-${suffix}@pinevela.test`])).rows[0];
    check(ownCounts.registered === 1 && ownCounts.sprayed === 0,
      'Exactly this test one real identity exists; its sprayed addresses created none');
    const result = { passed: true, checks, actualGoTrue: true, actualCapturedEmail: true, actualHttpCookies: true,
      observedResendDelays: observedDelays, actualCapturedConfirmationEmails: sent, concurrentResendSingleDelivery: true,
      recreatedApplicationPersistence: true, incorrectCredentialsPausedAfter: 5, crossEmailSourcePausedAfter: 30,
      differentRealSocketSourceCanLogin: true, timestampsExplicitlyAgedForTesting: timestampAgingOperations,
      clockAgingScope: 'only this run pending native subject and its hashed delivery row', missingCaptchaDoesNotConsumeBudget: true,
      nativeCaptchaProviderEnabled: false, nativeCaptcha422ExcludedByUnitPolicy: true, configuredPublicOriginPolicy: true,
      fabricatedProviderReplies: 0, signedTokensInvented: 0, cloudRecordsModified: 0, productionConfigModified: 0 };
    saveLocalFixture(h, 'auth-protection-result.json', result); console.log(JSON.stringify(result));
  } finally { delete process.env.AUTH_CAPTCHA_SITE_KEY; delete process.env.PINEVELA_PUBLIC_ORIGIN; await restarted?.close(); }
}

try { await runLocalSupabaseVerification(verify); }
catch (error) {
  console.error(JSON.stringify({ passed: false, stage, checks, error: 'Actual local auth-protection verification stopped; private run diagnostics retained.' }));
  if (process.argv[2] === '--local-supabase-worker') throw error;
  process.exitCode = 1;
}
