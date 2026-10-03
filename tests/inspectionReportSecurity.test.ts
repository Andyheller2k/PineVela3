import { setRecordSession } from '../sessionSecurity.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { buildInspectionReport, currentReportOfficer, inspectionSubmissionTarget, officerIsAssigned, InspectionSubmissionError } from '../inspectionReportSecurity.js';

const officerRecord = () => {
  const token = crypto.randomUUID(), holder = {};
  setRecordSession(holder, token);
  return { id: crypto.randomUUID(), officerId: crypto.randomUUID(), fullName: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.test`, token, ...holder, status: 'active', role: 'verification_team' };
};

test('S04: only a current active officer token and exact session identity can submit', () => {
  const officer = officerRecord();
  assert.equal(currentReportOfficer(officer, [officer]), officer);
  for (const role of ['admin', 'manager', 'user', 'student', 'staff', 'merchant']) assert.equal(currentReportOfficer({ ...officer, role }, [officer]), undefined);
  assert.equal(currentReportOfficer({ ...officer, token: crypto.randomUUID() }, [officer]), undefined);
  assert.equal(currentReportOfficer({ ...officer, id: crypto.randomUUID() }, [officer]), undefined);
  assert.equal(currentReportOfficer(officer, []), undefined);
  assert.equal(currentReportOfficer(officer, [officer, { ...officer }]), undefined);
  for (const status of ['inactive', 'suspended', undefined]) assert.equal(currentReportOfficer(officer, [{ ...officer, status }]), undefined);
});

test('S04: assignment requires the officer account ID or registered officer code', () => {
  const officer = officerRecord();
  assert.equal(officerIsAssigned(officer, { assignedOfficerId: officer.id }), true);
  assert.equal(officerIsAssigned(officer, { assignedOfficerId: officer.officerId }), true);
  assert.equal(officerIsAssigned(officer, { assignedOfficerId: crypto.randomUUID(), assignedOfficerEmail: officer.email, assignedOfficerName: officer.fullName }), false);
  assert.equal(officerIsAssigned(officer, { assignedOfficerEmail: officer.email }), false);
  assert.equal(officerIsAssigned(officer, {}), false);
});

test('S04: stored target aliases support dispatched records while rejecting missing, conflicting or final assignments', () => {
  const officer = officerRecord();
  const verification = { id: crypto.randomUUID(), assignedOfficerId: officer.id, inspectionStatus: 'dispatched' };
  const inspection = { id: crypto.randomUUID(), managerVerificationId: verification.id, assignedOfficerId: officer.officerId, status: 'dispatched' };
  for (const id of [inspection.id, verification.id, `insp-${verification.id}`]) {
    assert.equal(inspectionSubmissionTarget(id, [inspection], [verification], officer).inspection.id, inspection.id);
  }
  assert.equal(inspectionSubmissionTarget(verification.id, [], [verification], officer).inspection.assignedOfficerId, officer.id);
  for (const action of [
    () => inspectionSubmissionTarget(crypto.randomUUID(), [], [], officer),
    () => inspectionSubmissionTarget(verification.id, [], [{ ...verification, assignedOfficerId: undefined }], officer),
    () => inspectionSubmissionTarget(inspection.id, [inspection], [{ ...verification, assignedOfficerId: crypto.randomUUID() }], officer),
    () => inspectionSubmissionTarget(verification.id, [inspection, { ...inspection, id: crypto.randomUUID() }], [verification], officer),
    () => inspectionSubmissionTarget(inspection.id, [{ ...inspection, status: 'approved' }], [verification], officer),
    () => inspectionSubmissionTarget(inspection.id, [inspection], [{ ...verification, inspectionStatus: 'rejected' }], officer)
  ]) assert.throws(action, InspectionSubmissionError);
});

test('S04: reports stamp the registered author, signature and time instead of client identities', () => {
  const officer = officerRecord();
  const body = { observations: crypto.randomUUID(), recommendation: 'recommend_rejection', officerId: crypto.randomUUID(), officerName: crypto.randomUUID(), officerEmail: crypto.randomUUID(), inspectorSignature: crypto.randomUUID(), timestamp: '1970-01-01', submittedAt: '1970-01-01', gpsCoordinates: undefined };
  const report = buildInspectionReport(body, officer);
  assert.equal(report.officerId, officer.id);
  assert.equal(report.officerName, officer.fullName);
  assert.equal(report.officerEmail, officer.email);
  assert.equal(report.inspectorSignature, `${officer.fullName} (${officer.officerId})`);
  assert.notEqual(report.timestamp, body.timestamp);
  assert.equal(report.submittedAt, report.timestamp);
  assert.equal(report.gpsCoordinates, null);
  assert.equal(report.recommendation, body.recommendation);
  for (const invalid of [null, [], { ...body, observations: {} }, { ...body, observations: '' }, { ...body, recommendation: 'approved' }, { ...body, gpsCoordinates: { lat: 91, lng: 0 } }, { ...body, checklist: [] }, { ...body, checklist: { residenceExists: 'true' } }, { ...body, propertyDetails: { estimatedBeds: -1 } }, { ...body, photos: [{}] }]) {
    assert.throws(() => buildInspectionReport(invalid, officer), InspectionSubmissionError);
  }
});

test('S04: a shared manager email cannot select another verification record', () => {
  const officer = officerRecord();
  const managerEmail = `${crypto.randomUUID()}@example.test`;
  const verification = { id: crypto.randomUUID(), managerEmail, assignedOfficerId: officer.id };
  const unrelated = { ...verification, id: crypto.randomUUID(), assignedOfficerId: crypto.randomUUID() };
  const inspection = { id: crypto.randomUUID(), managerVerificationId: verification.id, assignedOfficerId: officer.id };
  assert.equal(inspectionSubmissionTarget(inspection.id, [inspection], [unrelated, verification], officer).verification, verification);
  assert.throws(() => inspectionSubmissionTarget(unrelated.id, [inspection], [unrelated, verification], officer), InspectionSubmissionError);
});
