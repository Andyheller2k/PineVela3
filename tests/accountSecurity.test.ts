import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { hashCredential, verifyCredential, passwordIsReused, protectStoredCredentials, publicAccountData, releaseRoom, hasActiveRoom, canManageHostel } from '../accountSecurity.js';

test('salted hashes verify passwords, not stored digests; legacy hashes upgrade safely', () => {
  const password = 'Synthetic-only-password!';
  const a = hashCredential(password), b = hashCredential(password);
  assert.notEqual(a, b);
  assert(verifyCredential(password, a));
  assert(!verifyCredential(a, a));
  assert(!verifyCredential('incorrect', a));
  assert(!verifyCredential(password, ''));
  assert(!verifyCredential(password, '!LOCKED_RESET'));
  const legacy = crypto.createHash('sha256').update(password).digest('hex');
  const data = [{ password: legacy }, { plainPassword: password }, { password: a, user: { password: legacy, plainPassword: password } }];
  protectStoredCredentials(data);
  for (const record of data) {
    assert(verifyCredential(password, record.password));
    assert(!('plainPassword' in record));
  }
  assert(verifyCredential(password, data[2].user.password));
  assert(!verifyCredential(legacy, data[0].password));
});

test('reuse checks traverse parent and sibling identities, including password history', () => {
  const records = [
    { id: 'primary', email: 'primary@example.test', password: hashCredential('Primary-only!') },
    { id: 'room', parentUserId: 'primary', email: 'student@st.knust.edu.gh', password: hashCredential('Room-only!') },
    { id: 'market', userId: 'primary', studentEmail: 'student@st.knust.edu.gh', password: hashCredential('Market-only!'), passwordHistory: [hashCredential('Previous-only!')] },
    { id: 'other', email: 'other@example.test', password: hashCredential('Unrelated-only!') }
  ];
  for (const password of ['Primary-only!', 'Room-only!', 'Market-only!', 'Previous-only!']) assert(passwordIsReused(password, records, 'student@st.knust.edu.gh'));
  assert(!passwordIsReused('Unrelated-only!', records, 'student@st.knust.edu.gh'));
  assert(passwordIsReused('Room-only!', records, 'different@student.test', records[0]));
});

test('public responses recursively hide credentials, history and sessions', () => {
  const data = { password: 'secret', plainPassword: 'secret', passwordHistory: ['secret'], token: 'private', nested: [{ merchantToken: 'private', sessionToken: 'private', name: 'Visible' }] };
  assert.deepEqual(publicAccountData(data), { nested: [{ name: 'Visible' }] });
  assert.equal(publicAccountData(data, true).token, 'private');
  assert(!('merchantToken' in publicAccountData(data, true).nested[0]));
  assert(!('password' in publicAccountData(data, true)));
});

test('release removes room identities and caches but preserves market and primary accounts', () => {
  const room = { id: 'r1', hostelId: 'h1', roomKey: 'OLDKEY', isAssigned: true, assignedStudentEmail: 'student@st.knust.edu.gh', parentUserId: 'p1' };
  const primary = { id: 'p1', role: 'user', email: 'primary@example.test', registeredAccounts: { residentAccount: { roomKey: 'OLDKEY' }, residentRooms: [{ roomKey: 'OLDKEY' }] } };
  const resident = { id: 's1', role: 'student', email: 'student@st.knust.edu.gh', roomKey: 'OLDKEY', token: 'obsolete', password: hashCredential('Room-only!') };
  const market = { id: 'm1', role: 'merchant', email: resident.email, password: hashCredential('Market-only!') };
  const users = [primary, resident, market];
  const store = { users, roomKeys: [room], keyDispatches: [{ roomKey: 'OLDKEY' }] };
  assert(hasActiveRoom(resident, store.roomKeys));
  assert(canManageHostel({ id: 'manager', role: 'manager' }, { managerId: 'manager' }));
  assert(!canManageHostel({ id: 'intruder', role: 'manager' }, { managerId: 'manager' }));
  releaseRoom(store, room, [users, users], 'NEWKEY');
  assert.deepEqual(users, [primary, market]);
  assert.equal(room.roomKey, 'NEWKEY');
  assert.equal(room.isAssigned, false);
  assert(!hasActiveRoom(resident, store.roomKeys));
  assert.deepEqual(primary.registeredAccounts.residentRooms, []);
  assert.equal(primary.registeredAccounts.residentAccount, null);
  assert.deepEqual(store.keyDispatches, []);
});
