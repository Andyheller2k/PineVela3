import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeGoogleCompleted, NATIVE_AUTH_DESTINATIONS } from '../src/native/transport';

test('native Google completion permits only the token-free confirmed native result', () => {
  for (const redirectTo of NATIVE_AUTH_DESTINATIONS)
    assert(nativeGoogleCompleted({ pending: false, authenticated: true, redirectTo }));
  for (const value of [null, [], true, {}, { pending: true },
    { pending: true, authenticated: true, redirectTo: '/user/dashboard' },
    { pending: false, authenticated: false, redirectTo: '/user/dashboard' },
    { pending: false, authenticated: true, redirectTo: '/user/dashboard', idToken: 'forbidden' }])
    assert.equal(nativeGoogleCompleted(value), false);
});

test('native Google result cannot redirect into a browser, script or arbitrary app route', () => {
  for (const redirectTo of ['https://pinevela.app/#/user/dashboard', '//pinevela.app', 'javascript:alert(1)',
    '/user/dashboard?token=forbidden', '/user/dashboard#extra', '/login', '/untrusted', '', 1])
    assert.equal(nativeGoogleCompleted({ pending: false, authenticated: true, redirectTo }), false);
});
