import assert from 'node:assert/strict';
import { test } from 'node:test';
import { meetingVisible, notificationVisible, notificationForActor, notificationReaderKey } from '../recordAccessSecurity.js';

const manager = { id: 'manager-a', role: 'manager', email: 'shared@example.test' };
const other = { id: 'manager-b', role: 'manager', email: manager.email };
const primary = { id: 'primary', role: 'user', email: manager.email };
const hostel = { id: 'home-a', name: 'Same name', managerId: manager.id, managerEmail: manager.email };
const foreignHostel = { ...hostel, id: 'home-b', managerId: other.id };
const store = { users: [manager, other, primary], hostels: [hostel, foreignHostel] };

test('S28: meeting access follows current residence IDs, never foreign contact/name or orphan records', () => {
  for (const own of [{ hostelId: hostel.id }, { managerId: manager.id }]) assert(meetingVisible(manager, own, store));
  for (const foreign of [
    {}, { hostelName: hostel.name }, { managerEmail: manager.email },
    { managerId: other.id, managerEmail: manager.email },
    { hostelId: foreignHostel.id, managerId: manager.id, hostelName: hostel.name },
    { hostelId: 'missing', managerId: manager.id }
  ]) assert(!meetingVisible(manager, foreign, store));
  assert(meetingVisible({ id: 'admin', role: 'admin' }, {}, store));
  assert(!meetingVisible(primary, { managerId: manager.id, managerEmail: primary.email }, store));
  assert(!meetingVisible(primary, { requesterId: other.id, requesterEmail: primary.email }, store));
  assert(meetingVisible(primary, { requesterId: primary.id }, store));
});

test('S29: explicit recipient IDs and roles override fallback contacts, and shared read state is account-specific', () => {
  const notice = { id: 'n', userId: manager.id, recipientEmail: manager.email, targetRole: 'manager' };
  assert(notificationVisible(manager, notice, store));
  for (const actor of [other, primary, { id: 'admin', role: 'admin' }]) assert(!notificationVisible(actor, notice, store));
  assert(!notificationVisible(primary, { recipientEmail: primary.email }, store));
  assert(notificationVisible(primary, { recipientEmail: primary.email, targetRole: 'user' }, store));
  assert(!notificationVisible(primary, { hostelId: hostel.id }, store));
  assert(notificationVisible(manager, { hostelId: hostel.id, targetRole: 'manager' }, store));
  assert(!notificationVisible(other, { hostelId: hostel.id, managerEmail: other.email }, store));
  assert(!notificationVisible(manager, { targetAccountId: other.id, recipientEmail: manager.email }, store));
  const staffActor = { id: 'staff-account', role: 'staff', email: primary.email };
  const staffStore = { ...store, staff: [{ id: 'staff-roster', userId: staffActor.id, managerId: manager.id,
    hostelId: hostel.id, managerCreated: true, status: 'Active' }] };
  assert(notificationVisible(staffActor, { userId: 'staff-roster' }, staffStore));
  assert(!notificationVisible(primary, { userId: 'staff-roster', staffEmail: primary.email }, staffStore));
  assert(!notificationVisible(staffActor, { userId: 'foreign-staff-roster', staffEmail: staffActor.email }, staffStore));
  const shared = { read: false, readBy: [notificationReaderKey(manager)] };
  assert.equal(notificationForActor(shared, manager).read, true);
  assert.equal(notificationForActor(shared, other).read, false);
  assert(!('readBy' in notificationForActor(shared, manager)));
  assert.equal(notificationForActor({ read: true }, manager).read, true);
});

test('S29: legacy email notices preserve merchant sessions stored on a store, without granting primary access', () => {
  const merchant = { id: 'merchant:application', role: 'merchant', email: primary.email, merchantStoreId: 'market' };
  const legacyStore = { ...store, digitalMarketStores: [{ id: 'market', studentEmail: primary.email }] };
  const notice = { userId: primary.email, recipientEmail: primary.email, targetRole: 'merchant' };
  assert(notificationVisible(merchant, notice, legacyStore));
  assert(!notificationVisible(primary, notice, legacyStore));
  assert(!notificationVisible(merchant, { ...notice, userId: primary.id }, legacyStore));
});
