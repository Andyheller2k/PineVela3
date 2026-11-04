import assert from 'node:assert/strict';
import test from 'node:test';
import { managerPropertyLockMessage,managerPropertyReviewState } from '../src/components/ManagerPropertyStatusCard';

test('manager status distinguishes setup, pending review, approval, rejection and corrections', () => {
  assert.equal(managerPropertyReviewState({ registrationRequired: true, registrationStatus: 'not_submitted' }).kind, 'setup');
  assert.equal(managerPropertyReviewState({ registrationRequired: false, registrationStatus: 'under_review' }).label, 'Pending');
  assert.equal(managerPropertyReviewState({ registrationRequired: false, registrationStatus: 'approved', isApproved: true }).label, 'Approved');
  assert.equal(managerPropertyReviewState({ registrationRequired: false, registrationStatus: 'rejected' }).label, 'Rejected');
  assert.equal(managerPropertyReviewState({ registrationRequired: false, registrationStatus: 'more_info_required' }).kind, 'corrections');
});

test('locked-tab notice does not claim review before residence submission', () => {
  const setup = { registrationRequired: true, registrationStatus: 'not_submitted' };
  assert.match(managerPropertyLockMessage(setup).detail, /has not been submitted/);
  assert.doesNotMatch(managerPropertyLockMessage(setup).detail, /under review/);
  assert.match(managerPropertyLockMessage({ registrationRequired: false, registrationStatus: 'under_review' }).title, /under review/);
  assert.match(managerPropertyLockMessage({ registrationRequired: false, registrationStatus: 'rejected' }).title, /rejected/);
  assert.match(managerPropertyLockMessage({ registrationRequired: false, registrationStatus: 'more_info_required' }).title, /corrections/);
});
