import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import {buildInspectionReport,InspectionSubmissionError} from '../inspectionReportSecurity.js';
const officerRecord=()=>({id:crypto.randomUUID(),officerId:crypto.randomUUID(),fullName:'Local report builder case',email:'report-builder@example.test'});
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
