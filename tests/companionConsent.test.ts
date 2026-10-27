import assert from 'node:assert/strict';
import test from 'node:test';
import { companionProvider, companionProviderAccepted, companionConsentHeaders } from '../src/lib/companionConsent';

test('legacy state identifies Groq while unknown recipient metadata fails closed', () => {
  assert.equal(companionProvider(undefined), 'groq');
  assert.equal(companionProvider('groq'), 'groq');
  assert.equal(companionProvider('cloudflare'), 'cloudflare');
  for (const value of [null, '', 'other', ['cloudflare'], { provider: 'cloudflare' }])
    assert.equal(companionProvider(value), undefined);
});

test('Cloudflare requires a matching acknowledgment', () => {
  assert.equal(companionProviderAccepted('cloudflare', null), false);
  assert.equal(companionProviderAccepted('cloudflare', 'groq'), false);
  assert.equal(companionProviderAccepted('cloudflare', 'cloudflare'), true);
});

test('a pending confirmation cannot silently add a Cloudflare mutation header', () => {
  assert.deepEqual(companionConsentHeaders('cloudflare', null), {});
  assert.deepEqual(companionConsentHeaders('cloudflare', 'groq'), {});
  assert.deepEqual(companionConsentHeaders('cloudflare', 'cloudflare'), {
    'X-PineVela-AI-Provider': 'cloudflare',
  });
});

test('the explicit enable or settings-save action can authorize its first mutation immediately', () => {
  assert.deepEqual(companionConsentHeaders('cloudflare', null, true), {
    'X-PineVela-AI-Provider': 'cloudflare',
  });
  assert.deepEqual(companionConsentHeaders('cloudflare', 'groq', true), {
    'X-PineVela-AI-Provider': 'cloudflare',
  });
});

test('Groq compatibility remains explicit in headers and invalid recipients never receive them', () => {
  assert.equal(companionProviderAccepted('groq', null), true);
  assert.deepEqual(companionConsentHeaders('groq', null), { 'X-PineVela-AI-Provider': 'groq' });
  assert.equal(companionProviderAccepted(undefined, 'cloudflare'), false);
  assert.deepEqual(companionConsentHeaders(undefined, 'cloudflare', true), {});
});
