import assert from 'node:assert/strict';
import { test } from 'node:test';
import { googleIdentity, googlePublicOrigin, googleCallbackFailure, googleRequestLogUrl } from '../googleAuth.js';
import type { Request } from 'express';

// Security input-contract cases; no provider requests or UI data are emulated.
const identity = { id: 'verified-provider-subject', email: 'identity@example.test', name: 'Identity', verifiedAt: '2026-10-01T10:00:00Z' };
test('Provider failures after consent are not labelled cancellation and sensitive callback parameters never enter request logs', () => {
  assert.equal(googleCallbackFailure({ error: 'server_error', error_code: 'unexpected_failure', error_description: 'Unable to exchange external code: secret' }), 'provider_exchange');
  assert.equal(googleCallbackFailure({ error: 'server_error', error_code: 'unexpected_failure', error_description: 'Database error saving new user' }), 'provider_failed');
  assert.equal(googleCallbackFailure({ error: 'access_denied', error_code: 'signup_disabled' }), 'signup_disabled');
  assert.equal(googleCallbackFailure({ error: 'access_denied', error_code: 'user_banned' }), 'blocked');
  assert.equal(googleCallbackFailure({ error: 'access_denied', error_code: 'provider_email_needs_verification' }), 'email_unverified');
  assert.equal(googleCallbackFailure({ error: 'access_denied' }), 'cancelled');
  assert.equal(googleCallbackFailure({ code: 'valid-code' }), undefined);
  for (const path of ['/api/auth/google/callback', '/API/auth/Google/callback/']) {
    assert.equal(googleRequestLogUrl(path + '?code=private&state=private&error_description=private'), path);
  }
  assert.equal(googleRequestLogUrl('/api/health'), '/api/health');
});
test('Google identity requires a verified Google provider identity and confirmed matching email', () => {
  const user = { id: identity.id, email: identity.email, email_confirmed_at: identity.verifiedAt, identities: [{ provider: 'google', identity_data: { email: identity.email, email_verified: true, full_name: identity.name } }] };
  assert.deepEqual(googleIdentity(user), identity);
  for (const changed of [{ identities: [] }, { is_anonymous: true }, { email_confirmed_at: null }, { email: 'different@example.test' }, { identities: [{ provider: 'email', identity_data: { email: identity.email, email_verified: true } }] }, { identities: [{ provider: 'google', identity_data: { email: identity.email, email_verified: false } }] }]) assert.throws(() => googleIdentity({ ...user, ...changed }));
});
test('Production-build localhost OAuth requires a real loopback host and peer; deployed origins remain HTTPS-only', () => {
  const savedOrigin = process.env.PINEVELA_PUBLIC_ORIGIN, savedMode = process.env.NODE_ENV;
  const request = (host: string, peer = '127.0.0.1', forwardedHostname = host) => ({ get: () => host, hostname: forwardedHostname, socket: { remoteAddress: peer } }) as unknown as Request;
  try {
    process.env.NODE_ENV = 'production'; delete process.env.PINEVELA_PUBLIC_ORIGIN;
    for (const host of ['localhost:3000', '127.0.0.1:3000', '[::1]:3000']) for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1'])
      assert.equal(googlePublicOrigin(request(host, peer)), `http://${host}`);
    for (const host of ['evil.example', 'localhost.evil.example', '127.0.0.1.evil.example', 'user@localhost:3000', 'localhost:3000/path', 'localhost:3000?redirect=evil', 'localhost:3000#evil'])
      assert.throws(() => googlePublicOrigin(request(host)));
    assert.throws(() => googlePublicOrigin(request('localhost:3000', '203.0.113.10')));
    assert.throws(() => googlePublicOrigin(request('evil.example', '127.0.0.1', 'localhost')));
    process.env.PINEVELA_PUBLIC_ORIGIN = 'https://pinevela.example';
    assert.equal(googlePublicOrigin(request('internal-proxy:3000', '203.0.113.10')), 'https://pinevela.example');
    for (const origin of ['http://pinevela.example', 'http://localhost:3000', 'https://user:password@pinevela.example', 'https://pinevela.example/path', 'https://pinevela.example?redirect=evil', 'https://pinevela.example#evil']) {
      process.env.PINEVELA_PUBLIC_ORIGIN = origin; assert.throws(() => googlePublicOrigin(request('localhost:3000')));
    }
  } finally {
    if (savedOrigin === undefined) delete process.env.PINEVELA_PUBLIC_ORIGIN; else process.env.PINEVELA_PUBLIC_ORIGIN = savedOrigin;
    if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
  }
});
