import assert from 'node:assert/strict';
import { test } from 'node:test';
import { managerIsApproved, managerRecordMatches, managerForDossier, managerOnboardingRequest } from '../managerApprovalSecurity.js';

const manager = { id: 'manager', role: 'manager', email: 'shared@example.test', parentUserId: 'primary', isVerified: true, verificationStatus: 'approved' };
const other = { ...manager, id: 'other' };
const primary = { id: 'primary', role: 'user', email: manager.email };

test('S06: approval belongs to the actual manager ID, never a sibling or primary identity', () => {
  const users = [manager, other, primary];
  const record = { managerId: manager.id, managerEmail: other.email, parentUserId: primary.id, status: 'approved' };
  assert(managerRecordMatches(record, manager, users));
  assert(!managerRecordMatches(record, other, users)); assert(!managerRecordMatches(record, primary, users));
  assert.equal(managerForDossier(record, users), manager);
  assert(!managerForDossier({ managerId: primary.id, managerEmail: manager.email }, users));
  assert(!managerForDossier({ managerEmail: manager.email }, users));
});

test('S06: canonical pending/rejected/blocked records override stale verified account flags', () => {
  for (const value of ['pending', 'rejected', 'blocked', 'suspended', 'dispatched', 'report_submitted']) {
    assert(!managerIsApproved(manager, { users: [manager], managerVerifications: [{ managerId: manager.id, status: value }] }));
  }
  assert(!managerIsApproved(manager, { users: [manager], managerVerifications: [{ managerId: manager.id, status: 'approved', isBlocked: true }] }));
  assert(!managerIsApproved(manager, { users: [manager], managerVerifications: [{ managerId: manager.id, status: 'approved' }], managerRegistrationRequests: [{ managerId: manager.id, status: 'pending' }] }));
});

test('S06: explicit canonical approval works and role/email defaults cannot grant approval', () => {
  assert(managerIsApproved(manager, { users: [manager] }));
  assert(managerIsApproved({ ...manager, isVerified: false }, { users: [manager], managerVerifications: [{ managerId: manager.id, status: 'APPROVED' }] }));
  assert(!managerIsApproved(primary, { users: [manager, primary], managerVerifications: [{ managerId: primary.id, status: 'approved' }] }));
  assert(!managerIsApproved({ role: 'manager', id: 'missing' }, { users: [manager] }));
  for (const email of ['manager@pinevela.com', 'sarah.j@pinevela.com']) {
    const missing = { id: 'legacy', role: 'manager', email };
    assert(!managerIsApproved(missing, { users: [missing] }));
  }
});

test('S06: revocation applies immediately and legacy email matching must be unique', () => {
  const store = { users: [structuredClone(manager)], managerVerifications: [{ managerId: manager.id, status: 'approved' }] };
  assert(managerIsApproved(manager, store)); store.managerVerifications[0].status = 'suspended'; assert(!managerIsApproved(manager, store));
  assert(managerRecordMatches({ managerEmail: manager.email }, manager, [manager]));
  assert(!managerRecordMatches({ managerEmail: manager.email }, manager, [manager, other]));
});

test('S06: pending sessions can only access narrowly defined onboarding endpoints', () => {
  assert(managerOnboardingRequest('GET', '/api/auth/me'));
  assert(managerOnboardingRequest('GET', '/api/manager-verifications'));
  assert(managerOnboardingRequest('POST', '/api/manager-verifications/submit'));
  for (const [method, route] of [['PUT', '/api/hostels/hostel'], ['POST', '/api/hostels/register'], ['GET', '/api/manager/account-settings'], ['PUT', '/api/issue-reports/issue'], ['PUT', '/api/manager-requests/request/approve']]) assert(!managerOnboardingRequest(method, route));
});
