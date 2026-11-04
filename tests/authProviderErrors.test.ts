/** Fully intercepted provider responses: no accounts, database, mail or network. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { SupabaseAuth } from '../supabase/auth.js';
import { ApiError, type SupabaseDatabase } from '../supabase/db.js';
import { authRequestContext } from '../supabase/authProtection.js';

test('Auth provider errors remain actionable, private and fail closed', async t => {
  const environment = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AUTH_CAPTCHA_SITE_KEY'] as const;
  const saved = environment.map(key => [key, process.env[key]] as const);
  t.after(() => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  process.env.SUPABASE_URL = 'https://intercepted-auth.example.test';
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_fixture_never_valid';
  delete process.env.AUTH_CAPTCHA_SITE_KEY;

  const privateText = 'PRIVATE_EMAIL_PASSWORD_TOKEN_PROVIDER_MESSAGE';
  const requestBody = { email: 'private-recipient@example.test', password: privateText };
  const diagnostics: unknown[][] = [];
  let now = 1_000_000, requests = 0;
  let respond = () => new Response('{}', { status: 400 });
  t.mock.method(Date, 'now', () => now);
  t.mock.method(console, 'warn', (...args: unknown[]) => { diagnostics.push(args); });
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    assert.equal(url.origin, 'https://intercepted-auth.example.test', 'Every fetch must hit the test interceptor');
    assert.equal(init?.redirect, 'error');
    assert.equal(init?.cache, 'no-store');
    requests++;
    return respond();
  });
  const database = new Proxy({} as SupabaseDatabase, {
    get() { assert.fail('Provider mapping tests must never access a database'); },
  });
  const auth = new SupabaseAuth(database);
  function response(status: number, body: unknown, headers: Record<string, string> = {}) {
    now += 61_000; requests = 0; diagnostics.length = 0;
    respond = () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
  }
  async function rejected(route: string, status: number, code?: string, method?: string) {
    let failure: ApiError | undefined;
    await assert.rejects(auth.provider(route, requestBody, undefined, method), error => {
      assert(error instanceof ApiError);
      assert.equal(error.status, status);
      assert.equal(error.code, code);
      failure = error;
      return true;
    });
    assert.equal(requests, 1, 'A failure must not cause a provider retry or email send');
    const exposed = JSON.stringify({ message: failure!.message, code: failure!.code, diagnostics });
    for (const secret of [privateText, requestBody.email, process.env.SUPABASE_ANON_KEY!])
      assert(!exposed.includes(secret), 'Private request/provider data must never appear in errors or logs');
    return failure!;
  }

  await t.test('signup validation and unavailable providers have fixed safe explanations', async () => {
    for (const [providerCode, providerStatus, status, code] of [
      ['weak_password', 422, 400, 'weak_password'],
      ['email_address_invalid', 400, 400, 'email_address_invalid'],
      ['signup_disabled', 403, 503, 'email_signup_unavailable'],
      ['email_provider_disabled', 400, 503, 'email_signup_unavailable'],
    ] as const) {
      response(providerStatus, { error_code: providerCode, msg: privateText, details: requestBody });
      const error = await rejected('/signup', status, code);
      assert.notEqual(error.message, 'Authentication request could not be verified.');
      if (providerCode === 'weak_password') assert.equal(error.message,
        'Use at least 8 characters, including uppercase and lowercase letters, a number and a symbol.');
      assert.deepEqual(diagnostics, [['[Auth provider] Request rejected.', {
        operation: 'signup', status: providerStatus, category: providerCode,
      }]]);
    }
  });

  await t.test('SMTP recipient restrictions use the same private delivery error for every email workflow', async () => {
    for (const [route, operation] of [['/signup', 'signup'], ['/resend', 'resend'], ['/recover', 'recovery']]) {
      response(400, { error_code: 'email_address_not_authorized', msg: privateText });
      const error = await rejected(route, 503, 'email_delivery_unavailable');
      assert.equal(error.message, 'Verification email delivery is temporarily unavailable. Please try again later.');
      assert.deepEqual(diagnostics[0][1], { operation, status: 400, category: 'email_address_not_authorized' });
    }
  });

  await t.test('legacy, versioned and documented header code shapes preserve CAPTCHA failure handling', async () => {
    for (const [body, headers] of [
      [{ error_code: 'captcha_failed', msg: privateText }, {}],
      [{ code: 'captcha_failed', message: privateText }, {}],
      [{ message: privateText }, { 'x-sb-error-code': 'captcha_failed' }],
    ] as const) {
      response(400, body, headers);
      const error = await rejected('/signup', 422, 'captcha_failed');
      assert.equal(error.message, 'Security verification expired or failed. Please complete it again.');
    }
  });

  await t.test('existing login, duplicate signup, verification, throttling and outage boundaries remain intact', async () => {
    for (const [route, providerStatus, providerCode, status, code, message] of [
      ['/token?grant_type=password', 400, 'invalid_credentials', 401, 'invalid_credentials', 'Invalid email or password.'],
      ['/signup', 422, 'user_already_exists', 409, 'email_already_registered', 'This email is already registered. Please sign in.'],
      ['/signup', 422, 'email_exists', 409, 'email_already_registered', 'This email is already registered. Please sign in.'],
      ['/verify', 403, 'otp_expired', 400, undefined, 'The email code or link is invalid or expired. Request a new one.'],
      ['/signup', 429, 'over_email_send_rate_limit', 429, undefined, 'Too many authentication attempts. Please wait.'],
      ['/signup', 500, 'unexpected_failure', 503, undefined, 'Authentication is temporarily unavailable.'],
    ] as const) {
      response(providerStatus, { error_code: providerCode, msg: privateText });
      assert.equal((await rejected(route, status, code)).message, message);
    }
    response(422, { code: 'weak_password', message: privateText });
    assert.equal((await rejected('/user', 400, undefined, 'PUT')).message,
      'Choose a stronger password that meets the email provider requirements.');
  });

  await t.test('unknown malicious bodies and request IDs never enter diagnostics or public errors', async () => {
    response(401, { error_code: privateText, code: privateText, msg: privateText, details: requestBody }, {
      'sb-request-id': 'private-recipient@example.test', 'x-request-id': privateText,
    });
    assert.equal((await rejected('/settings', 400)).message, 'Authentication request could not be verified.');
    assert.deepEqual(diagnostics, [['[Auth provider] Request rejected.', {
      operation: 'settings', status: 401, category: 'unclassified',
    }]]);

    const requestId = '01234567-89ab-4cde-8fab-0123456789ab';
    response(400, { code: 'weak_password', message: privateText }, {
      'sb-request-id': privateText, 'x-request-id': requestId,
    });
    await rejected('/signup', 400, 'weak_password');
    assert.deepEqual(diagnostics[0][1], { operation: 'signup', status: 400, category: 'weak_password', requestId });
  });

  await t.test('diagnostics are limited to one event per fixed operation per minute', async () => {
    response(400, { error_code: 'email_address_not_authorized', msg: privateText });
    await rejected('/resend', 503, 'email_delivery_unavailable');
    assert.equal(diagnostics.length, 1);
    for (let attempt = 0; attempt < 30; attempt++) {
      await assert.rejects(auth.provider('/resend', requestBody), error => error instanceof ApiError && error.status === 503);
    }
    assert.equal(diagnostics.length, 1);
    now += 59_999;
    await assert.rejects(auth.provider('/resend', requestBody));
    assert.equal(diagnostics.length, 1);
    now++;
    await assert.rejects(auth.provider('/resend', requestBody));
    assert.equal(diagnostics.length, 2, 'The bounded diagnostic becomes available after one minute');
  });

  await t.test('success is unchanged and provider transport exceptions never expose private details', async () => {
    const pending = { id: '01234567-89ab-4cde-8fab-0123456789ab', identities: [{ provider: 'email' }] };
    response(200, pending);
    assert.deepEqual(await auth.provider('/signup', requestBody), pending);
    assert.equal(requests, 1);
    assert.deepEqual(diagnostics, []);

    response(400, {});
    respond = () => { throw Error(privateText); };
    assert.equal((await rejected('/signup', 503)).message, 'Authentication is temporarily unavailable.');
    assert.deepEqual(diagnostics, []);

    response(400, {});
    respond = () => new Response(privateText, { status: 403 });
    assert.equal((await rejected('/signup', 400)).message, 'Authentication request could not be verified.');
    assert.deepEqual(diagnostics[0][1], { operation: 'signup', status: 403, category: 'unclassified' });
  });

  await t.test('missing and replayed CAPTCHA proofs fail before any provider call', async () => {
    process.env.AUTH_CAPTCHA_SITE_KEY = 'fixture-site-key';
    requests = 0;
    await assert.rejects(auth.provider('/signup', requestBody), error => error instanceof ApiError && error.code === 'captcha_required');
    assert.equal(requests, 0);
    await authRequestContext.run({ ip: '127.0.0.1', captchaToken: 'fixture-proof', captchaClaimed: true, captchaForwarded: true }, async () => {
      await assert.rejects(auth.provider('/signup', requestBody), error => error instanceof ApiError && error.code === 'captcha_failed');
    });
    assert.equal(requests, 0, 'Error handling must never bypass the CAPTCHA replay guard');
    delete process.env.AUTH_CAPTCHA_SITE_KEY;
  });
});
