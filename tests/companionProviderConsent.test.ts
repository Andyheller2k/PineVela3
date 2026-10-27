import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCompanionProviderConsent, companionProviderDisclosure } from '../supabase/companionConsent';
import { ApiError } from '../supabase/db';

test('public recipient disclosure contains no credential or account information', () => {
  const env = { COMPANION_AI_PROVIDER: 'cloudflare', CLOUDFLARE_API_TOKEN: 'private-token-marker', CLOUDFLARE_ACCOUNT_ID: 'private-account-marker' };
  assert.deepEqual(companionProviderDisclosure(env), { provider: 'cloudflare', providerName: 'Cloudflare Workers AI' });
  assert.deepEqual(companionProviderDisclosure({}), { provider: 'groq', providerName: 'Groq' });
});

test('Cloudflare requires an explicit acknowledgment of the new recipient', () => {
  const env = { COMPANION_AI_PROVIDER: 'cloudflare' };
  assert.doesNotThrow(() => assertCompanionProviderConsent('cloudflare', env));
  for (const value of [undefined, null, '', 'groq', ['cloudflare'], 'cloudflare,groq', 'Cloudflare']) {
    assert.throws(() => assertCompanionProviderConsent(value, env), error => error instanceof ApiError
      && error.status === 409 && error.code === 'companion_provider_consent');
  }
});

test('legacy Groq remains compatible while stale Cloudflare acknowledgments are refused', () => {
  assert.doesNotThrow(() => assertCompanionProviderConsent(undefined, {}));
  assert.doesNotThrow(() => assertCompanionProviderConsent('groq', {}));
  assert.throws(() => assertCompanionProviderConsent('cloudflare', {}), error => error instanceof ApiError && error.status === 409);
});

test('invalid provider configuration never grants recipient consent', () => {
  for (const provider of ['', 'openrouter', 'https://outside.invalid']) {
    assert.equal(companionProviderDisclosure({ COMPANION_AI_PROVIDER: provider }).provider, undefined);
    assert.throws(() => assertCompanionProviderConsent(provider, { COMPANION_AI_PROVIDER: provider }), ApiError);
  }
});
