import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountDirectoryRelations } from '../accountModeration.js';
import { needsApprovalKey } from '../adminApprovalSecurity.js';

test('Directory families use explicit IDs, include staff via managers and do not combine same-email accounts', () => {
  const primary = { id: 'primary', role: 'user', email: 'shared@example.test' }, independent = { ...primary, id: 'independent' };
  const manager = { id: 'manager', role: 'manager', parentUserId: primary.id }, resident = { id: 'room', role: 'resident', parentUserId: primary.id }, staff = { id: 'staff', role: 'staff', managerId: manager.id }, orphan = { id: 'orphan', role: 'manager', email: primary.email };
  const relations = accountDirectoryRelations({ users: [primary, independent, manager, resident, staff, orphan], digitalMarketApplications: [{ id: 'app', userId: primary.id, studentEmail: primary.email }] });
  for (const role of ['manager', 'resident', 'staff', 'merchant']) assert.equal(relations.find(record => record.account.role === role)?.primaryAccountId, primary.id);
  assert.equal(relations.find(record => record.account.id === staff.id)?.parentRole, 'manager');
  assert.equal(relations.find(record => record.account.id === orphan.id)?.primaryAccountId, undefined);
  assert.equal(relations.find(record => record.account.id === independent.id)?.primaryAccountId, independent.id);
});

test('Approval aliases and generic writes cannot bypass keys; exact rejection and ordinary edits remain available', () => {
  for (const route of ['/api/manager-requests/id/approve', '/api/manager-verifications/id/approve', '/API/hostel-verifications/id/approve/', '/api/admin/digital-market/approve-application', '/api/hostels/id/verify', '/api/hostels']) assert(needsApprovalKey('POST', route, {}));
  for (const body of [{ isApproved: true }, { status: 'Approved' }, { approvalStatus: 'Approved' }]) assert(needsApprovalKey('PUT', '/api/hostels/id', body));
  assert(needsApprovalKey('PUT', '/api/hostels/id/verify', { status: 'rejected' }));
  assert(!needsApprovalKey('PUT', '/api/hostels/id/verify', { status: 'Rejected' }));
  assert(!needsApprovalKey('PUT', '/api/hostels/id', { name: 'Authorized edit' }));
  assert(!needsApprovalKey('POST', '/api/hostels/register', { isApproved: true }));
  assert(!needsApprovalKey('GET', '/api/hostels/id/verify', {}));
});
