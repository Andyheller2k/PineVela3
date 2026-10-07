import assert from 'node:assert/strict';
import { test } from 'node:test';
import { managerRegistrationStatus, merchantRegistrationStatus } from '../src/lib/registrationStatus';
import type { DigitalMarketApplication, DigitalMarketStore } from '../src/types';

test('merchant approval is distinct from activation, and restrictions override active flags', () => {
  const application = { status: 'pending' } as DigitalMarketApplication;
  const store = { status: 'pending_setup', setupCompleted: false, registrationFeePaid: false } as DigitalMarketStore;
  assert.equal(merchantRegistrationStatus(null, null), 'unregistered');
  assert.equal(merchantRegistrationStatus(application, null), 'pending');
  application.status = 'approved';
  assert.equal(merchantRegistrationStatus(application, store), 'approved');
  store.status = 'active'; store.setupCompleted = true;
  assert.equal(merchantRegistrationStatus(application, store), 'approved', 'Approval cannot claim paid activation');
  store.registrationFeePaid = true;
  assert.equal(merchantRegistrationStatus(application, store), 'active');
  store.accountStatus = 'restricted';
  assert.equal(merchantRegistrationStatus(application, store), 'restricted');
  store.isBanned = true;
  assert.equal(merchantRegistrationStatus(application, store), 'disabled');
  store.isBanned = false; store.accountStatus = undefined; store.status = 'disabled';
  assert.equal(merchantRegistrationStatus(application, store), 'disabled');
  application.status = 'rejected';
  assert.equal(merchantRegistrationStatus(application, null), 'rejected');
  application.accountStatus = 'disabled';
  assert.equal(merchantRegistrationStatus(application, null), 'disabled', 'Governed ban applies before store setup');
  assert.equal(merchantRegistrationStatus(null, null), 'unregistered', 'Deleted server records restore registration access');
});

test('manager review and restriction states override stale verification flags', () => {
  const account = { isVerified: true, status: 'approved' };
  assert.equal(managerRegistrationStatus(null), 'unregistered');
  assert.equal(managerRegistrationStatus({ status: 'pending' }), 'pending');
  assert.equal(managerRegistrationStatus(account), 'approved');
  for (const [status, expected] of [['blocked', 'disabled'], ['suspended', 'suspended'], ['rejected', 'rejected'], ['more_info_required', 'more_info_required'], ['deleted', 'unregistered']]) {
    assert.equal(managerRegistrationStatus({ ...account, status }), expected);
  }
  assert.equal(managerRegistrationStatus({ ...account, isRestricted: true }), 'restricted');
  assert.equal(managerRegistrationStatus({ ...account, isBlocked: true }), 'disabled');
});
