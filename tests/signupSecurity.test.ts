import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SignupGuard, SIGNUP_WINDOW_MS, signupInput, type SignupState } from '../signupSecurity.js';
import { confirmedSignupIdentity, requireConfirmationSettings, signupChallenge } from '../supabaseSignup.js';

const input = { name: 'Security Test', email: 'security@example.test', password: 'Isolated-test-password!' };
function setup() {
  let now = 100000;
  let saved: SignupState = { pending: [], limits: [] };
  const state: SignupState = { pending: [], limits: [] };
  const guard = new SignupGuard(state, () => { saved = structuredClone(state); }, () => now);
  return { guard, state, advance: (ms: number) => now += ms, saved: () => saved, now: () => now };
}

test('S05: validate signup types and never keep plaintext passwords or verification codes', () => {
  assert.equal(signupInput({ ...input, email: '  SECURITY@EXAMPLE.TEST ' }).email, input.email);
  for (const body of [{}, { ...input, name: {} }, { ...input, email: 'invalid' }, { ...input, password: {} }, { ...input, password: 'short' }]) assert.throws(() => signupInput(body));
  const f = setup();
  const pending = f.guard.remember(input, 'provider-user', 'https://project.supabase.co');
  assert(!JSON.stringify(f.state).includes(input.password));
  assert(!('code' in pending));
  assert.match(pending.passwordHash, /^scrypt-sha256\$/);
  assert.notEqual(pending.id, f.guard.remember(input, 'provider-user', pending.providerUrl).id);
});

test('S05: verification requires bound signup, password, six-digit code and expires automatically', () => {
  const f = setup(); const pending = f.guard.remember(input, 'provider-user', 'https://project.supabase.co');
  const body = { email: input.email, password: input.password, code: '123456', signupId: pending.id };
  for (const patch of [{ signupId: 'other' }, { password: 'Wrong-password!' }, { code: 'ABCDEF' }, { signupId: undefined }]) assert.throws(() => f.guard.verification({ ...body, ...patch }, 'local'));
  assert.equal(f.guard.verification(body, 'local'), pending);
  f.advance(SIGNUP_WINDOW_MS); f.guard.cleanup();
  assert.equal(f.state.pending.length, 0);
  assert.throws(() => f.guard.verification(body, 'local'));
});

test('S05: send cooldown and five-attempt limits survive restart and are not reset by resend', () => {
  const f = setup(); f.guard.reserveSend(input.email, 'local');
  assert.throws(() => f.guard.reserveSend(input.email, 'local'), (error: any) => error.status === 429);
  const pending = f.guard.remember(input, 'provider-user', 'https://project.supabase.co');
  const body = { email: input.email, password: 'Wrong-password!', code: '123456', signupId: pending.id };
  for (let i = 0; i < 5; i++) assert.throws(() => f.guard.verification(body, 'local'), (error: any) => error.status === 400);
  f.advance(61000); f.guard.reserveSend(input.email, 'local');
  const replaced = f.guard.remember(input, 'provider-user', pending.providerUrl);
  const saved = f.saved(); const restarted = new SignupGuard(saved, () => {}, f.now);
  assert.throws(() => restarted.verification({ ...body, password: input.password, signupId: replaced.id }, 'local'), (error: any) => error.status === 429);
  f.advance(SIGNUP_WINDOW_MS); restarted.cleanup(); assert.equal(saved.pending.length, 0); assert.equal(saved.limits.length, 0);
});

test('S05: concurrent requests for one signup are serialized', async () => {
  const f = setup(); let finish: () => void;
  const first = f.guard.exclusive(input.email, () => new Promise<void>(resolve => finish = resolve));
  await assert.rejects(f.guard.exclusive(input.email, async () => {}), (error: any) => error.status === 429);
  finish!(); await first; await f.guard.exclusive(input.email, async () => {});
});

test('S05: only confirmed provider identities and enforced confirmation settings are accepted', () => {
  const expected = { email: input.email, supabaseUserId: 'provider-user' };
  const user = { id: expected.supabaseUserId, email: input.email, email_confirmed_at: new Date().toISOString() };
  assert.equal(confirmedSignupIdentity(user, expected).id, expected.supabaseUserId);
  for (const patch of [{ id: 'different' }, { email: 'other@example.test' }, { email_confirmed_at: null }, { email_confirmed_at: 'invalid' }, { is_anonymous: true }]) assert.throws(() => confirmedSignupIdentity({ ...user, ...patch }, expected));
  requireConfirmationSettings({ mailer_autoconfirm: false, external: { email: true }, disable_signup: false });
  for (const config of [{}, { mailer_autoconfirm: true }, { mailer_autoconfirm: false, external: { email: false }, disable_signup: false }]) assert.throws(() => requireConfirmationSettings(config));
});

test('S05: built-in signup links are restricted to the configured project and resolved as token hashes', () => {
  const provider = 'https://project.supabase.co';
  const link = `${provider}/auth/v1/verify?token=${'a'.repeat(56)}&type=signup&redirect_to=https://unrelated.example.test`;
  assert.deepEqual(signupChallenge(link, provider), { token_hash: 'a'.repeat(56), type: 'email' });
  for (const bad of [link.replace(provider, 'https://other.supabase.co'), link.replace('/auth/v1/verify', '/arbitrary'), link.replace('type=signup', 'type=recovery'), link.replace('token=', 'access_token='), 'javascript:alert(1)']) assert.throws(() => signupChallenge(bad, provider));
  const f = setup(); const pending = f.guard.remember(input, 'provider-user', provider);
  // The long, one-time link secret plus signup binding supplies the inbox proof; no new password is accepted.
  assert.equal(f.guard.verification({ email: input.email, signupId: pending.id, code: link }, 'local'), pending);
  assert.equal(pending.passwordHash, f.state.pending[0].passwordHash);
});
