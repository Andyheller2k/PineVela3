import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { canRequestResidence } from '../hostelSecurity.js';

test('S03: current manager IDs override shared email and display-name matches', () => {
  const manager = { id: crypto.randomUUID(), role: 'manager', email: `${crypto.randomUUID()}@example.test`, name: crypto.randomUUID() };
  const foreign = { ...manager, id: crypto.randomUUID() };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, managerName: manager.name };
  assert.equal(canRequestResidence(manager, hostel), true);
  assert.equal(canRequestResidence(foreign, hostel), false);
  assert.equal(canRequestResidence(manager, { ...hostel, managerId: undefined, assignedManagerId: manager.id }), true);
  assert.equal(canRequestResidence(manager, { ...hostel, managerId: undefined }), true);
  for (const role of ['user', 'student', 'resident', 'staff', 'merchant', 'verification_team']) {
    assert.equal(canRequestResidence({ ...manager, role }, hostel), false);
  }
  assert.equal(canRequestResidence({ id: crypto.randomUUID(), role: 'admin' }, hostel), true);
  assert.equal(canRequestResidence(manager, { id: crypto.randomUUID() }), false);
  assert.equal(canRequestResidence(manager, { id: crypto.randomUUID(), email: manager.email, managerName: manager.name }), false);
  assert.equal(canRequestResidence({ role: 'admin' }, hostel), false);
});
