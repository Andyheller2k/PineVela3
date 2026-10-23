/** Pure validation/proof checks: no accounts, sends or hosted database writes. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { EMAIL_CODE_RESEND_SECONDS, normalizeEmailOtp } from '../emailOtp.js';
import { confirmedSignupIdentity, requireConfirmationSettings, signupChallenge } from '../supabaseSignup.js';
import { signupEmail, signupEmailWait, signupResendEmail, signupVerificationId } from '../supabase/signupEmails.js';

const provider = 'https://bivajljcdeofyxzmplxm.supabase.co';

test('signup accepts the full provider OTP range and preserves leading zeroes', () => {
  for (let length = 6; length <= 10; length++) {
    const token = '0' + '7'.repeat(length - 1);
    assert.deepEqual(signupChallenge(token, provider), { token, type: 'email' });
  }
  assert.deepEqual(signupChallenge(' \n0123\u00a04567\t', provider), { token: '01234567', type: 'email' });
});

test('numeric code input rejects malformed, overlong and nonnumeric proofs', () => {
  for (const value of [undefined, null, 12345678, {}, [], '', '12345', '12345678901',
    '1234-5678', 'code: 12345678', '1234567a', '１２３４５６７８', '1234\u200b5678', ' '.repeat(4097) + '12345678']) {
    assert.equal(normalizeEmailOtp(value), null);
    assert.throws(() => signupChallenge(value, provider), (error: any) => error.status === 400);
  }
  assert.equal(normalizeEmailOtp(`${provider}/auth/v1/verify`), null);
});

test('retained signup link support stays bound to the configured project and flow', () => {
  const hash = 'a'.repeat(64);
  assert.deepEqual(signupChallenge(`${provider}/auth/v1/verify?token=${hash}&type=signup`, provider), { token_hash: hash, type: 'email' });
  for (const link of [
    `https://other.supabase.co/auth/v1/verify?token=${hash}&type=signup`,
    `${provider}/auth/v1/verify?token=${hash}&type=recovery`,
    `${provider}/other?token=${hash}&type=signup`,
    `${provider.replace('https://', 'https://name:secret@')}/auth/v1/verify?token=${hash}&type=signup`,
  ]) assert.throws(() => signupChallenge(link, provider), (error: any) => error.status === 400);
});

test('a parsable code does not bypass required email confirmation or identity binding', () => {
  const settings = { mailer_autoconfirm: false, external: { email: true }, disable_signup: false };
  requireConfirmationSettings(settings);
  for (const changes of [{ mailer_autoconfirm: true }, { external: { email: false } }, { disable_signup: true }]) {
    assert.throws(() => requireConfirmationSettings({ ...settings, ...changes }), (error: any) => error.status === 503);
  }
  const id = randomUUID(), email = 'identity@example.test', verifiedAt = new Date().toISOString();
  const expected = { email, supabaseUserId: id };
  const identity = { id, email, email_confirmed_at: verifiedAt, is_anonymous: false };
  assert.deepEqual(confirmedSignupIdentity(identity, expected), { id, email, verifiedAt });
  for (const changes of [{ id: randomUUID() }, { email: 'other@example.test' }, { email_confirmed_at: null }, { is_anonymous: true }]) {
    assert.throws(() => confirmedSignupIdentity({ ...identity, ...changes }, expected), (error: any) => error.status === 400);
  }
});

test('signup and resend share normalized, bounded email delivery selectors', () => {
  assert.equal(signupEmail('  Name@Example.TEST  '), 'name@example.test');
  assert.equal(signupResendEmail({ email: 'NAME@example.test' }), 'name@example.test');
  for (const email of [undefined, null, {}, [], 123, '', 'name', 'name@example', 'name @example.test',
    'name@example.test\nBcc: other@example.test', 'a'.repeat(255) + '@example.test']) {
    assert.throws(() => signupEmail(email), (e: any) => e.status === 400);
  }
});

test('resend rejects identity, role, redirect and provider-operation injection', () => {
  for (const field of ['userId', 'signupId', 'profileId', 'role', 'password', 'type', 'redirectTo', 'emailRedirectTo', '__proto__']) {
    const body = Object.fromEntries([['email', 'name@example.test'], [field, 'untrusted']]);
    assert.throws(() => signupResendEmail(body), (e: any) => e.status === 400);
  }
  for (const body of [undefined, null, [], {}, 'name@example.test', Object.create({ email: 'name@example.test' })])
    assert.throws(() => signupResendEmail(body), (e: any) => e.status === 400);
});

test('the persisted delivery cooldown is five minutes and opens exactly at expiry', () => {
  assert.equal(EMAIL_CODE_RESEND_SECONDS, 300);
  const sent = new Date('2026-10-22T12:00:00.000Z');
  assert.equal(signupEmailWait(null, sent), 0);
  assert.equal(signupEmailWait(sent, sent), 300);
  assert.equal(signupEmailWait(sent, new Date(sent.getTime() + 1000)), 299);
  assert.equal(signupEmailWait(sent, new Date(sent.getTime() + 299999)), 1);
  assert.equal(signupEmailWait(sent, new Date(sent.getTime() + 300000)), 0);
  assert.equal(signupEmailWait(sent, new Date(sent.getTime() + 600000)), 0);
  assert.throws(() => signupEmailWait(new Date(NaN), sent), (e: any) => e.status === 503);
  assert.throws(() => signupEmailWait(sent, new Date(NaN)), (e: any) => e.status === 503);
});

test('only an actual pending signup response starts email verification', () => {
  const id = randomUUID(), email = 'identity@example.test';
  const pending = { id, email, email_confirmed_at: null, identities: [{ provider: 'email', user_id: id }] };
  assert.equal(signupVerificationId(pending, email), id);
  assert.equal(signupVerificationId({ user: pending, session: null }, email), id);
  for (const response of [{ ...pending, identities: [] }, { ...pending, email_confirmed_at: new Date().toISOString() }]) {
    assert.throws(() => signupVerificationId(response, email), (error: any) =>
      error.status === 409 && error.code === 'email_already_registered');
  }
});

test('malformed, mismatched and session-bearing signup replies cannot activate verification', () => {
  const id = randomUUID(), email = 'identity@example.test';
  const pending = { id, email, identities: [{ provider: 'email', user_id: id }] };
  for (const response of [null, {}, { ...pending, id: 'invalid' }, { ...pending, id: [id] },
    { ...pending, email: 'other@example.test' }, { ...pending, identities: null }, { ...pending, identities: undefined },
    { ...pending, access_token: 'unexpected' }, { user: pending, session: { access_token: 'unexpected' } }]) {
    assert.throws(() => signupVerificationId(response, email), (error: any) => error.status === 503);
  }
});
