import assert from 'node:assert/strict';
import { test } from 'node:test';
import { developmentSignupRuntime, isDevelopmentSignup } from '../developmentSignup.js';
import { SignupGuard, SIGNUP_WINDOW_MS, type SignupState } from '../signupSecurity.js';

test('temporary signup codes require an opt-in source development server', () => {
  assert(developmentSignupRuntime({ PINEVELA_DEV_SIGNUP_CODES: 'true', NODE_ENV: 'development' }, '/project/server.ts'));
  assert(developmentSignupRuntime({ PINEVELA_DEV_SIGNUP_CODES: 'true' }, '/project/server.ts'));
  for (const env of [{ PINEVELA_DEV_SIGNUP_CODES: 'false' }, { PINEVELA_DEV_SIGNUP_CODES: 'true', NODE_ENV: 'production' }, { PINEVELA_DEV_SIGNUP_CODES: 'true', NODE_ENV: 'test' }]) assert(!developmentSignupRuntime(env, '/project/server.ts'));
  assert(!developmentSignupRuntime({ PINEVELA_DEV_SIGNUP_CODES: 'true', NODE_ENV: 'development' }, '/project/dist/server.cjs'));
  assert(isDevelopmentSignup({ user: { emailVerificationProvider: 'development' } }));
  assert(!isDevelopmentSignup({ user: { emailVerificationProvider: 'supabase' } }));
  const root = { id: 'dev-parent', role: 'user', emailVerificationProvider: 'development' };
  assert(isDevelopmentSignup({ id: 'child', parentUserId: root.id }, [root]));
});

test('development challenges are random, hashed, bound to signup and require the signup password', () => {
  const state: SignupState = { pending: [], limits: [] };
  const guard = new SignupGuard(state, () => {});
  const input = { name: 'Isolated Development Test', email: 'dev@example.test', password: 'Isolated-dev-password!' };
  const { pending, code } = guard.rememberDevelopment(input);
  assert.match(code, /^\d{6}$/); assert(!JSON.stringify(state).includes(`"${code}"`));
  assert(!JSON.stringify(state).includes(input.password));
  assert(!pending.supabaseUserId && !pending.providerUrl);
  const body = { email: input.email, password: input.password, signupId: pending.id, code };
  assert.equal(guard.verification(body, 'local'), pending); guard.confirmDevelopment(pending, code);
  assert.throws(() => guard.verification({ ...body, password: 'Wrong-password!' }, 'local'));
  assert.throws(() => guard.verification({ ...body, signupId: 'unrelated' }, 'local'));
  const wrong = code === '000000' ? '000001' : '000000';
  assert.throws(() => guard.confirmDevelopment(pending, wrong));
});

test('development challenges expire and cannot be used after activation', () => {
  let now = Date.now(); const state: SignupState = { pending: [], limits: [] };
  const guard = new SignupGuard(state, () => {}, () => now);
  const input = { name: 'Isolated Test', email: 'expired@example.test', password: 'Isolated-dev-password!' };
  const { pending, code } = guard.rememberDevelopment(input);
  now += SIGNUP_WINDOW_MS; guard.cleanup();
  assert.throws(() => guard.verification({ ...input, code, signupId: pending.id }, 'local'));
  assert.equal(state.pending.length, 0);
});
