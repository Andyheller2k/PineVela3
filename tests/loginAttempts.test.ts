/** Pure policy tests. Runtime admission and persisted counters are verified
 * separately against real PostgreSQL; no provider responses are synthesized. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { ApiError } from '../supabase/db.js';
import { ResourceLimitError } from '../resourceSecurity.js';
import { isPasswordCredentialFailure, nextPasswordFailure, passwordAttemptKeys, passwordFailureState,
  PASSWORD_EMAIL_FAILURE_LIMIT, PASSWORD_FAILURE_COOLDOWN_SECONDS, PASSWORD_IP_FAILURE_LIMIT,
  type PasswordFailureState } from '../supabase/loginAttempts.js';

const base = new Date('2026-10-22T12:00:00.000Z');
const after = (seconds: number) => new Date(base.getTime() + seconds * 1000);

test('password budgets normalize emails and IP spellings without storing raw selectors', () => {
  const keys = passwordAttemptKeys({ email: '  Student@Example.test  ', ip: '192.0.2.1' });
  assert.deepEqual(keys, passwordAttemptKeys({ email: 'student@example.test', ip: '::ffff:192.0.2.1' }));
  assert.deepEqual(keys, passwordAttemptKeys({ email: 'student@example.test', ip: '::ffff:c000:201' }));
  assert.deepEqual(passwordAttemptKeys({ email: 'student@example.test', ip: '2001:db8::1' }),
    passwordAttemptKeys({ email: 'student@example.test', ip: '2001:0DB8:0:0:0:0:0:1' }));
  assert.match(keys.ip, /^[a-f0-9]{64}$/); assert.match(keys.pair, /^[a-f0-9]{64}$/);
  assert.notEqual(keys.ip, keys.pair);
  const otherEmail = passwordAttemptKeys({ email: 'other@example.test', ip: '192.0.2.1' });
  assert.equal(keys.ip, otherEmail.ip); assert.notEqual(keys.pair, otherEmail.pair);
  const otherIp = passwordAttemptKeys({ email: 'student@example.test', ip: '192.0.2.2' });
  assert.notEqual(keys.ip, otherIp.ip); assert.notEqual(keys.pair, otherIp.pair);
});

test('missing or caller-style IP selectors fail closed instead of disabling admission', () => {
  for (const ip of [undefined, null, '', {}, '192.0.2.1, 192.0.2.2', 'untrusted', '192.0.2.999', 'fe80::1%eth0', ' '.repeat(1000)])
    assert.throws(() => passwordAttemptKeys({ email: 'student@example.test', ip }), (e: any) => e.status === 503);
  assert.throws(() => passwordAttemptKeys({ email: {}, ip: '192.0.2.1' }), (e: any) => e.status === 400);
});

test('only native incorrect-password proofs count, not provider, CAPTCHA or portal errors', () => {
  assert.equal(isPasswordCredentialFailure(new ApiError(401, 'Invalid credentials.', 'invalid_credentials')), true);
  for (const error of [new ApiError(401, 'Unconfirmed account.', 'email_not_confirmed'),
    new ApiError(401, 'Session ended.'), new ApiError(422, 'Challenge failed.', 'captcha_failed'),
    new ApiError(503, 'Provider unavailable.'), new ApiError(403, 'Wrong portal PIN.', 'portal_pin_required'),
    new ResourceLimitError(429, 30), { status: 401, code: 'invalid_credentials' }, new Error('network')])
    assert.equal(isPasswordCredentialFailure(error), false);
});

test('fifth email/IP failure starts a fifteen-minute pause and attempts cannot extend it', () => {
  let state: PasswordFailureState | undefined;
  for (let attempt = 1; attempt <= PASSWORD_EMAIL_FAILURE_LIMIT; attempt++) {
    state = nextPasswordFailure(state, after(attempt), PASSWORD_EMAIL_FAILURE_LIMIT);
    assert.equal(state.recent_failures.length, attempt);
    assert.equal(state.blocked_until !== null, attempt === PASSWORD_EMAIL_FAILURE_LIMIT);
  }
  assert.equal(PASSWORD_FAILURE_COOLDOWN_SECONDS, 900);
  assert.equal(passwordFailureState(state, after(5)).retryAfter, 900);
  assert.equal(passwordFailureState(state, after(5.001)).retryAfter, 900);
  assert.equal(passwordFailureState(state, after(904.999)).retryAfter, 1);
  assert.throws(() => nextPasswordFailure(state, after(10), PASSWORD_EMAIL_FAILURE_LIMIT),
    (e: any) => e.status === 429 && e.retryAfter === 895);
  assert.equal(passwordFailureState(state, after(905)).retryAfter, 0);
  assert.equal(nextPasswordFailure(state, after(905), PASSWORD_EMAIL_FAILURE_LIMIT).recent_failures.length, 1);
});

test('IP-wide budget allows thirty failures and covers guesses across different emails', () => {
  let state: PasswordFailureState | undefined;
  for (let attempt = 1; attempt <= PASSWORD_IP_FAILURE_LIMIT; attempt++) {
    state = nextPasswordFailure(state, after(attempt), PASSWORD_IP_FAILURE_LIMIT);
    assert.equal(state.blocked_until !== null, attempt === PASSWORD_IP_FAILURE_LIMIT);
  }
  assert.equal(state!.recent_failures.length, 30);
  assert.equal(passwordFailureState(state, after(31)).retryAfter, 899);
});

test('rolling window ages individual failures without a fixed-window reset gap', () => {
  const state: PasswordFailureState = { recent_failures: [after(0), after(300), after(600), after(899)], blocked_until: null };
  const next = nextPasswordFailure(state, after(901), PASSWORD_EMAIL_FAILURE_LIMIT);
  assert.equal(next.recent_failures.length, 4);
  assert.equal(next.blocked_until, null);
  const fifth = nextPasswordFailure(next, after(902), PASSWORD_EMAIL_FAILURE_LIMIT);
  assert.equal(fifth.recent_failures.length, 5);
  assert.equal(passwordFailureState(fifth, after(902)).retryAfter, 900);
});

test('corrupt, unbounded or future database state cannot silently waive sign-in protection', () => {
  assert.deepEqual(passwordFailureState(undefined, base), { recent: [], retryAfter: 0 });
  for (const state of [
    { recent_failures: Array(31).fill(base), blocked_until: null },
    { recent_failures: [new Date(NaN)], blocked_until: null },
    { recent_failures: [after(1)], blocked_until: null },
    { recent_failures: [], blocked_until: new Date(NaN) },
    { recent_failures: ['2026-10-22T12:00:00Z'], blocked_until: null },
  ]) assert.throws(() => passwordFailureState(state as PasswordFailureState, base), (e: any) => e.status === 503);
  assert.throws(() => passwordFailureState(undefined, new Date(NaN)), (e: any) => e.status === 503);
  assert.throws(() => nextPasswordFailure(undefined, base, 100), (e: any) => e.status === 503);
});
