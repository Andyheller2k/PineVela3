import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { buildIssueDetailsUpdate, canEditIssueDetails, IssueEditValidationError } from '../issueReportSecurity.js';

test('ownership uses the creator account, without shared-email or alternate-ID bypasses', () => {
  const owner = { id: crypto.randomUUID(), role: 'student', email: `${crypto.randomUUID()}@example.test` };
  const other = { ...owner, id: crypto.randomUUID() };
  const issue = { userId: owner.id, studentId: other.id, parentUserId: other.id, studentEmail: other.email };
  assert.equal(canEditIssueDetails(owner, issue, []), true);
  assert.equal(canEditIssueDetails(other, issue, []), false);
  for (const role of ['staff', 'merchant', 'verification_team']) {
    assert.equal(canEditIssueDetails({ ...owner, role }, issue, []), false);
  }
  assert.equal(canEditIssueDetails(owner, { studentEmail: owner.email }, []), false);
  assert.equal(canEditIssueDetails(owner, { creatorId: owner.id }, []), true);
  assert.equal(canEditIssueDetails(owner, { parentUserId: owner.id }, []), true);
  assert.equal(canEditIssueDetails({ role: 'admin' }, issue, []), false);
});

test('manager authority comes from the current hostel assignment, not report aliases', () => {
  const manager = { id: crypto.randomUUID(), role: 'manager', email: `${crypto.randomUUID()}@example.test` };
  const other = { ...manager, id: crypto.randomUUID() };
  const hostel = { id: crypto.randomUUID(), name: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email };
  assert.equal(canEditIssueDetails(manager, { hostelId: hostel.id }, [hostel]), true);
  assert.equal(canEditIssueDetails(other, { hostelId: hostel.id, managerId: other.id }, [hostel]), false);
  assert.equal(canEditIssueDetails(manager, { hostelId: crypto.randomUUID(), hostelName: hostel.name, managerId: manager.id }, [hostel]), false);
  assert.equal(canEditIssueDetails(manager, { hostelName: hostel.name }, [hostel]), true);
  assert.equal(canEditIssueDetails(manager, { hostelName: hostel.name }, [hostel, { ...hostel, id: crypto.randomUUID() }]), false);
  assert.equal(canEditIssueDetails(manager, {}, [hostel]), false);
  assert.equal(canEditIssueDetails({ id: crypto.randomUUID(), role: 'admin' }, {}, []), true);
});

test('protected keys and invalid values reject the entire patch without modifying the issue', () => {
  const issue = { id: crypto.randomUUID(), historyLogs: [{ action: 'Report Submitted' }] };
  const before = structuredClone(issue);
  const actor = { id: crypto.randomUUID(), role: 'user' };
  for (const key of ['id', 'userId', 'parentUserId', 'studentId', 'studentEmail', 'hostelId', 'roomKey', 'managerId', 'assignedStaffId', 'staffEmail', 'status', 'staffAccepted', 'staffCompleted', 'managerReviewed', 'studentConfirmed', 'studentAcceptedResolved', 'closedByManager', 'createdAt', 'updatedAt', 'closedAt', 'historyLogs', 'constructor', 'prototype', '__proto__', 'unknown']) {
    const body = JSON.parse(JSON.stringify({ description: crypto.randomUUID(), [key]: crypto.randomUUID() }));
    assert.throws(() => buildIssueDetailsUpdate(body, issue, actor), IssueEditValidationError, key);
    assert.deepEqual(issue, before);
  }
  for (const body of [null, [], {}, 'invalid', { description: null }, { title: {} }, { photos: 'invalid' }, { photos: [{}] }]) {
    assert.throws(() => buildIssueDetailsUpdate(body, issue, actor), IssueEditValidationError);
  }
});

test('detail edits append a server-owned audit entry while preserving workflow fields', () => {
  const issue = { id: crypto.randomUUID(), status: 'Pending', historyLogs: [{ action: 'Report Submitted' }] };
  const actor = { id: crypto.randomUUID(), role: 'user', name: crypto.randomUUID() };
  const body = { title: crypto.randomUUID(), description: crypto.randomUUID(), photos: [] as string[], category: 'Plumbing', urgency: 'High', visitWindow: '', subArea: '', locationTag: '', contactPhone: '', contactMethod: 'In-app Notification' };
  const patch = buildIssueDetailsUpdate(body, issue, actor);
  const history = patch.historyLogs as any[];
  assert.equal(patch.title, body.title);
  assert.equal('status' in patch, false);
  assert.equal('userId' in patch, false);
  assert.deepEqual(history[0], issue.historyLogs[0]);
  assert.equal(history[1].actorId, actor.id);
  assert.equal(history[1].actorRole, actor.role);
  assert.equal(history[1].timestamp, patch.updatedAt);
  assert.equal(Number.isNaN(Date.parse(patch.updatedAt as string)), false);
  assert.equal(issue.historyLogs.length, 1);
  assert.notEqual(patch.photos, body.photos);
});
