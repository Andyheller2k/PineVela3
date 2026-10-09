import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountSubmissionNotification, primaryAccountRecipient } from '../accountSubmissionNotifications.js';
import { notificationForActor, notificationReaderKey, notificationVisible } from '../recordAccessSecurity.js';

test('submission notices follow persisted owners across Google, password and secondary accounts', () => {
  const primary = { id: 'primary', role: 'user', email: 'google@example.test', emailVerificationProvider: 'supabase-google' };
  const other = { id: 'other', role: 'user', email: primary.email };
  const manager = { id: 'manager', role: 'manager', email: 'manager@example.test', parentUserId: primary.id };
  const seller = { id: 'merchant:app', role: 'merchant', email: 'seller@edu.test' };
  const resident = { id: 'resident', role: 'student', email: primary.email, parentUserId: primary.id };
  const store = { users: [primary, other, manager, resident], managerVerifications: [{ id: 'verification', managerId: manager.id, parentUserId: primary.id }],
    digitalMarketApplications: [{ id: 'app', studentEmail: seller.email, parentUserEmail: primary.email, userId: primary.id }] };
  const notices = [
    ...['Manager Account Registration Submitted', 'Manager Account Registered - Inspection Pending', 'Manager Account Approved!', 'Manager Account Registration Update', 'Manager Account Application Status: Rejected', 'PineVela Verification Team Dispatched'].map(title => ({ title, userId: manager.id, targetAccountId: manager.id, targetRole: 'manager', read: true })),
    ...['Student Merchant Application Approved! 🎉', 'Digital Market Application Update'].map(title => ({ title, userId: seller.email, recipientEmail: seller.email, targetRole: 'merchant' })),
    { title: 'Resident Account Activated & Room Linked', userId: resident.id }
  ];
  for (const [index, notice] of notices.entries()) {
    const routed = accountSubmissionNotification({ ...notice, id: String(index) }, store);
    assert.equal(routed.targetAccountId, primary.id, notice.title);
    assert(notificationVisible(primary, notice, store));
    for (const actor of [other, manager, seller, resident, { id: 'admin', role: 'admin' }]) assert(!notificationVisible(actor, notice, store), `${notice.title}: ${actor.role}`);
    assert.equal(notificationForActor(routed, primary).read, false);
    assert.equal(notificationForActor({ ...routed, readBy: [notificationReaderKey(primary)] }, primary).read, true);
  }
});

test('foreign IDs, conflicting ownership and missing explicit parents cannot use matching emails', () => {
  const user = { id: 'primary', role: 'user', email: 'shared@example.test' };
  const other = { ...user, id: 'other' };
  const manager = { id: 'manager', role: 'manager', email: user.email, parentUserId: other.id };
  const store = { users: [user, other, manager] };
  const notice = { title: 'Manager Account Approved!', userId: manager.id, parentUserId: user.id, recipientEmail: user.email };
  assert(!notificationVisible(user, notice, store));
  assert(notificationVisible(other, notice, store));
  assert(!notificationVisible(user, { ...notice, userId: 'foreign' }, store));
  for (const parentUserId of ['deleted', undefined]) {
    const ambiguous = { ...store, users: [user, other, { ...manager, parentUserId, parentUserEmail: user.email }] };
    assert(!notificationVisible(user, notice, ambiguous));
  }
  const conflicting = { ...store, managerVerifications: [{ managerId: manager.id, parentUserId: user.id }] };
  assert(!notificationVisible(user, notice, conflicting));
});

test('operational manager/seller alerts and officer/admin dispatches retain their own recipient', () => {
  const notices = [
    { title: 'Maintenance Issue Submitted', targetRole: 'manager', targetAccountId: 'manager' },
    { title: 'New Dispatch: Property', targetRole: 'verification_team', targetAccountId: 'officer' },
    { title: 'Manager Verification Request: Property', targetRole: 'admin' },
    { title: 'New buyer message', marketChat: true, targetRole: 'merchant' },
    { title: 'New order', sellerStoreId: 'store', targetRole: 'merchant' }
  ];
  for (const notice of notices) assert.equal(accountSubmissionNotification(notice, {}), notice);
});

test('removal and re-registration eligibility updates retain a primary recipient after secondary deletion', () => {
  const primary = { id: 'owner', role: 'user', email: 'owner@example.test' };
  const store = { users: [primary, { id: 'other', role: 'user', email: primary.email }] };
  const recipient = primaryAccountRecipient({ id: 'deleted-manager', role: 'manager', parentUserId: primary.id }, store, 'manager');
  assert.equal(recipient.targetAccountId, primary.id);
  assert.deepEqual(primaryAccountRecipient({ parentUserId: 'missing', parentUserEmail: primary.email }, store, 'manager'), {});
  assert.deepEqual(primaryAccountRecipient({ parentUserEmail: primary.email }, store, 'manager'), {});
  assert.equal(primaryAccountRecipient(primary, store, 'resident').targetAccountId, primary.id);
});
