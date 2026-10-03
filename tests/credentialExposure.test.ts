import { KNOWN_LEGACY_PASSWORDS } from '../legacyCredentialPolicy.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { hashCredential, verifyCredential } from '../accountSecurity.js';
import { CREDENTIAL_EXPOSURE_VERSION, recoverAccountPassword, revokeExposedCredentials } from '../credentialExposure.js';

test('containment locks all credential copies and revokes every supported session field without deleting records', () => {
  const password = crypto.randomBytes(24).toString('base64url');
  const oldHash = hashCredential(password);
  const user = { id: crypto.randomUUID(), role: 'admin', password: oldHash, token: crypto.randomUUID(), user: { plainPassword: password, sessionToken: crypto.randomUUID() } };
  const store: any = { users: [user], digitalMarketApplications: [{ password: oldHash, merchantToken: crypto.randomUUID() }], verificationTeams: [{ password: oldHash, token: crypto.randomUUID() }], hostels: [{ id: crypto.randomUUID() }] };
  const preservedId = store.hostels[0].id;
  const result = revokeExposedCredentials(store);
  assert.equal(result.lockedRecords, 4);
  assert.equal(result.revokedSessions, 4);
  assert.equal(store.users.length, 1);
  assert.equal(store.hostels[0].id, preservedId);
  for (const entry of [user, user.user, ...store.digitalMarketApplications, ...store.verificationTeams] as any[]) {
    assert.equal(verifyCredential(password, entry.password), false);
    assert.equal(entry.requiresPasswordReset, true);
    for (const key of ['plainPassword', 'localPassword', 'userPropPassword', 'token', 'sessionToken', 'merchantToken']) assert.equal(key in entry, false);
    assert.ok(entry.passwordHistory.every((hash: string) => hash.startsWith('scrypt-sha256$')));
  }
  assert.equal(store.credentialExposureVersion, CREDENTIAL_EXPOSURE_VERSION);
  assert.equal(revokeExposedCredentials(store).changed, false);
});

test('offline recovery rejects compromised passwords, preserves role, and stays valid after another migration check', () => {
  const password = crypto.randomBytes(24).toString('base64url');
  const replacement = crypto.randomBytes(24).toString('base64url');
  const id = crypto.randomUUID();
  const store: any = { users: [{ id, role: 'admin', password: hashCredential(password) }] };
  revokeExposedCredentials(store);
  assert.throws(() => recoverAccountPassword(store, id, 'user', replacement), /No existing account/);
  assert.throws(() => recoverAccountPassword(store, id, 'admin', password), /already used/);
  assert.equal(recoverAccountPassword(store, id, 'admin', replacement), 1);
  assert.equal(store.users[0].role, 'admin');
  assert.equal(store.users[0].requiresPasswordReset, false);
  assert.equal(verifyCredential(replacement, store.users[0].password), true);
  assert.equal(verifyCredential(password, store.users[0].password), false);
  assert.equal('token' in store.users[0], false);
  assert.equal(revokeExposedCredentials(store).changed, false);
  assert.equal(verifyCredential(replacement, store.users[0].password), true);
});

test('offline recovery rejects every disabled legacy password without changing the account', () => {
  const store: any = { credentialExposureVersion: 1, users: [{ id: crypto.randomUUID(), role: 'admin', password: hashCredential(crypto.randomUUID()), token: crypto.randomUUID() }] };
  const before = JSON.stringify(store);
  for (const password of KNOWN_LEGACY_PASSWORDS) {
    assert.throws(() => recoverAccountPassword(store, store.users[0].id, 'admin', password), /legacy password is disabled/);
    assert.equal(JSON.stringify(store), before);
  }
});
