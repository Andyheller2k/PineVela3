import assert from 'node:assert/strict';
import test from 'node:test';
import { nativeSignedInDestination } from '../src/native/signedInDestination';

test('restored native accounts reach their actual portal, including seller setup and support', () => {
  for (const [role, expected] of Object.entries({ user: '/user/dashboard', student: '/resident/dashboard', staff: '/staff/dashboard', manager: '/manager/dashboard', admin: '/admin/dashboard', officer: '/field-officer', field_officer: '/field-officer', verification_team: '/field-officer' })) {
    assert.equal(nativeSignedInDestination({ role }), expected);
  }
  assert.equal(nativeSignedInDestination({ role: 'user', customerService: true }), '/customer-service');
  assert.equal(nativeSignedInDestination({ role: 'user' }, '/digital-market'), '/digital-market');
  assert.equal(nativeSignedInDestination({ role: 'merchant', merchantSetupCompleted: false }), '/digital-market/onboard');
  assert.equal(nativeSignedInDestination({ role: 'merchant', merchantRegistrationFeePaid: true, merchantSetupCompleted: true }), '/digital-market');
  assert.equal(nativeSignedInDestination({ role: 'merchant', targetRedirect: 'https://foreign.invalid' }), '/digital-market/onboard');
});
