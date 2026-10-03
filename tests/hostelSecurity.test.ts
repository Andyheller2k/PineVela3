import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { buildHostelUpdate, canUpdateHostel, HostelUpdateValidationError } from '../hostelSecurity.js';

test('S03: current manager IDs override shared email and display-name matches', () => {
  const manager = { id: crypto.randomUUID(), role: 'manager', email: `${crypto.randomUUID()}@example.test`, name: crypto.randomUUID() };
  const foreign = { ...manager, id: crypto.randomUUID() };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, managerName: manager.name };
  assert.equal(canUpdateHostel(manager, hostel), true);
  assert.equal(canUpdateHostel(foreign, hostel), false);
  assert.equal(canUpdateHostel(manager, { ...hostel, managerId: undefined, assignedManagerId: manager.id }), true);
  assert.equal(canUpdateHostel(manager, { ...hostel, managerId: undefined }), true);
  for (const role of ['user', 'student', 'resident', 'staff', 'merchant', 'verification_team']) {
    assert.equal(canUpdateHostel({ ...manager, role }, hostel), false);
  }
  assert.equal(canUpdateHostel({ id: crypto.randomUUID(), role: 'admin' }, hostel), true);
  assert.equal(canUpdateHostel(manager, { id: crypto.randomUUID() }), false);
  assert.equal(canUpdateHostel(manager, { id: crypto.randomUUID(), email: manager.email, managerName: manager.name }), false);
  assert.equal(canUpdateHostel({ role: 'admin' }, hostel), false);
});

test('S03: manager patches reject ownership, approval, lifecycle and unknown fields atomically', () => {
  const manager = { id: crypto.randomUUID(), role: 'manager' };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, isApproved: false, approvalStatus: 'Pending Approval', description: crypto.randomUUID() };
  const before = structuredClone(hostel);
  for (const field of ['managerId', 'assignedManagerId', 'managerEmail', 'managerName', 'managerPhoto', 'managerPhone', 'ownerId', 'isApproved', 'approvalStatus', 'status', 'isLive', 'isBlocked', 'isDeleted', 'subscriptionPaid', 'rating', 'registrationDate', 'verifiedAt', 'adminNotes', 'updatedAt', 'constructor', '__proto__', 'arbitraryField']) {
    assert.throws(() => buildHostelUpdate({ description: crypto.randomUUID(), [field]: crypto.randomUUID() }, manager, hostel), HostelUpdateValidationError, field);
    assert.deepEqual(hostel, before);
  }
  for (const body of [null, [], {}, { id: crypto.randomUUID() }, { price: -1 }, { totalCapacity: '100' }, { facilities: [{}] }, { latitude: 91 }, { longitude: -181 }, { rules: [] }]) {
    assert.throws(() => buildHostelUpdate(body, manager, hostel), HostelUpdateValidationError);
  }
});

test('S03: managers can edit typed property details while leaving protected state untouched', () => {
  const hostel = { id: crypto.randomUUID(), status: 'Pending Approval', isApproved: false };
  const body = { name: crypto.randomUUID(), description: crypto.randomUUID(), price: 1200, totalCapacity: 20, facilities: ['Wi-Fi'], blocksList: [], latitude: null, longitude: 0, rules: { curfew: '' }, pricing: { defaultFee: 1200 } };
  const patch = buildHostelUpdate(body, { role: 'manager' }, hostel);
  assert.deepEqual({ ...patch, updatedAt: undefined }, { ...body, updatedAt: undefined });
  assert.equal('status' in patch, false);
  assert.equal('isApproved' in patch, false);
  assert.equal(Number.isNaN(Date.parse(patch.updatedAt as string)), false);
});

test('S03: administrator full-record saves preserve the ID and support approval', () => {
  const hostel = { id: crypto.randomUUID(), managerId: crypto.randomUUID(), name: crypto.randomUUID(), registrationDate: new Date().toISOString(), isApproved: false, approvalStatus: 'Pending Approval', status: 'Pending Approval' };
  const patch = buildHostelUpdate({ ...hostel, isApproved: true, approvalStatus: 'Approved', status: 'Open' }, { role: 'admin' }, hostel);
  assert.equal('id' in patch, false);
  assert.equal(patch.managerId, hostel.managerId);
  assert.equal(patch.assignedManagerId, hostel.managerId);
  assert.equal(patch.isApproved, true);
  assert.throws(() => buildHostelUpdate({ id: crypto.randomUUID(), name: hostel.name }, { role: 'admin' }, hostel), HostelUpdateValidationError);
  assert.throws(() => buildHostelUpdate(JSON.parse('{"__proto__":{}}'), { role: 'admin' }, hostel), HostelUpdateValidationError);
  assert.throws(() => buildHostelUpdate({ name: hostel.name }, { role: 'user' }, hostel), HostelUpdateValidationError);
});

test('S03: administrator transfers synchronize both assignment aliases and unassignment clears email fallback', () => {
  const managerId = crypto.randomUUID();
  const hostel = { id: crypto.randomUUID(), managerId: crypto.randomUUID(), assignedManagerId: crypto.randomUUID(), managerEmail: `${crypto.randomUUID()}@example.test` };
  for (const field of ['managerId', 'assignedManagerId']) {
    const patch = buildHostelUpdate({ [field]: managerId }, { role: 'admin' }, hostel);
    assert.equal(patch.managerId, managerId);
    assert.equal(patch.assignedManagerId, managerId);
  }
  assert.throws(() => buildHostelUpdate({ managerId, assignedManagerId: crypto.randomUUID() }, { role: 'admin' }, hostel), HostelUpdateValidationError);
  const cleared = buildHostelUpdate({ managerId: null }, { role: 'admin' }, hostel);
  assert.equal(cleared.assignedManagerId, null);
  assert.equal(cleared.managerEmail, '');
  assert.equal(canUpdateHostel({ id: crypto.randomUUID(), role: 'manager', email: hostel.managerEmail }, { ...hostel, ...cleared, email: hostel.managerEmail }), false);
});
