import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AdminGovernance, GovernanceError, initializeAdminGovernance } from '../adminGovernance.js';
import { WipeRecovery } from '../adminWipeRecovery.js';
import { hashCredential, publicAccountData } from '../accountSecurity.js';
import { validateDatabase } from '../jsonStoreSafety.js';
import { publicPlatformSettings, validatePlatformSettings } from '../platformSettings.js';
import { buildWipePlan } from '../adminWipeScope.js';
import { createMaintenanceRecoveryNotice, eligibleMaintenanceNotice, MAINTENANCE_NOTICE_LIFETIME_MS } from '../maintenanceNotice.js';

test('Settings keys are independent, private, actor-bound, limited and recoverable only by other administrators', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pinevela-admin-settings-')); t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const admins = Array.from({ length: 3 }, (_, index) => ({ id: crypto.randomUUID(), role: 'admin', email: `settings-${index}@example.test`, name: `Settings founder ${index}`, password: hashCredential(`Independent-settings-login-${index}!`) }));
  const store: any = { users: admins, platformSettings: { registrationFee: 50, commission: 5, announcement: '', maintenanceMode: false } };
  initializeAdminGovernance(store, admins[0].id); let now = Date.now();
  const governance = new AdminGovernance(() => store, () => { validateDatabase(Buffer.from(JSON.stringify(store))); }, new WipeRecovery(path.join(directory, 'recovery'), path.join(directory, 'uploads')), () => 0, () => now);
  const rejected = (fn: () => unknown, code: number) => assert.throws(fn, (error: any) => error instanceof GovernanceError && error.status === code);
  const wipeKeys: string[] = [], settingsKeys: string[] = [];
  for (let index = 0; index < admins.length; index++) {
    wipeKeys.push((await governance.enroll(admins[index].id, `Independent-settings-login-${index}!`)).privateKey);
    settingsKeys.push((await governance.enrollSettingsKey(admins[index].id, `Independent-settings-login-${index}!`)).settingsKey);
    assert.notEqual(wipeKeys[index], settingsKeys[index]);
  }
  const body = { ...store.platformSettings, announcement: 'Actual configured announcement', settingsKey: settingsKeys[0] };
  rejected(() => governance.updateSettings(admins[0].id, { ...body, settingsKey: wipeKeys[0] }), 403);
  rejected(() => governance.updateSettings(admins[0].id, { ...body, settingsKey: settingsKeys[1] }), 403);
  rejected(() => governance.updateSettings('unrelated', body), 403);
  rejected(() => governance.updateSettings(admins[0].id, { ...body, mainId: admins[1].id }), 400);
  assert.equal(governance.updateSettings(admins[0].id, body).success, true);
  const json = JSON.stringify(governance.view(admins[0].id)); assert(!json.includes('settingsKeyHash') && !json.includes(settingsKeys[0]));
  assert.deepEqual(publicAccountData({ settingsKeyHash: 'private', name: 'Owner' }), { name: 'Owner' });
  await assert.rejects(governance.enrollSettingsKey(admins[0].id, 'Independent-settings-login-0!'), (error: any) => error.status === 409);
  for (let i = 0; i < 5; i++) rejected(() => governance.updateSettings(admins[0].id, { ...body, settingsKey: 'wrong' }), 403);
  rejected(() => governance.updateSettings(admins[0].id, body), 429); now += 15 * 60000 + 1;
  governance.updateSettings(admins[0].id, body);
  rejected(() => governance.requestChange(admins[0].id, admins[0].id, { action: 'reset-settings-key', privateKey: wipeKeys[0], reason: 'Lost settings key' }), 403);
  const change = governance.requestChange(admins[1].id, admins[0].id, { action: 'reset-settings-key', privateKey: wipeKeys[1], reason: 'Lost settings key' });
  rejected(() => governance.decideChange(admins[0].id, change.id, { privateKey: wipeKeys[0], decision: 'approved' }), 403);
  governance.decideChange(admins[2].id, change.id, { privateKey: wipeKeys[2], decision: 'approved' });
  rejected(() => governance.updateSettings(admins[0].id, body), 403);
  const replacement = await governance.enrollSettingsKey(admins[0].id, 'Independent-settings-login-0!'); assert.notEqual(replacement.settingsKey, settingsKeys[0]);
  assert.equal(store.adminGovernance.members[0].keyHash.length, 64, 'Wipe approval key survives settings-key reset');
});

test('Platform settings reject malformed amounts, coerced flags and arbitrary fields, and preserve zero values', () => {
  const settings = { registrationFee: 0, commission: 0, announcement: '', maintenanceMode: false };
  assert.deepEqual(publicPlatformSettings({ platformSettings: settings }), { ...settings, semesterFee: 300, subscriptionPrices: { default: 0, star: 90, pro: 150 } });
  for (const registrationFee of [-1, Infinity, NaN, '50', null, 0.001, 1000001]) assert.throws(() => validatePlatformSettings({ ...settings, registrationFee }));
  for (const commission of [-1, 101, '5', null, Infinity]) assert.throws(() => validatePlatformSettings({ ...settings, commission }));
  for (const maintenanceMode of ['false', 0, null]) assert.throws(() => validatePlatformSettings({ ...settings, maintenanceMode }));
  assert.throws(() => validatePlatformSettings({ ...settings, announcement: 'a'.repeat(2001) }));
  assert.throws(() => validatePlatformSettings({ ...settings, adminId: 'spoof' }));
});

test('Administrator profile photographs and ownership records survive marketplace and total wipes', () => {
  const photograph = '/uploads/hostels/admin.png';
  const store = { users: [{ id: 'admin', role: 'admin', photo: photograph }], marketMedia: [{ imageUrl: photograph, accountId: 'admin' }], platformSettings: {} };
  for (const scopes of [['markets'], ['total']] as const) {
    const plan = buildWipePlan(store, [...scopes]);
    assert.equal(plan.kept.marketMedia.length, 1); assert.equal(plan.media.length, 0);
  }
});

test('Maintenance recovery notices expire exactly after 24 hours and snapshot non-admin credential identities', () => {
  const now = Date.now(), existing = { id: 'existing', role: 'user', email: 'same@example.test' };
  const store: any = { users: [existing, { id: existing.id, role: 'admin' }, { user: { id: 'manager', role: 'manager' } }],
    verificationTeams: [{ id: 'officer' }], digitalMarketApplications: [{ id: 'application', studentEmail: 'seller@example.test' }],
    digitalMarketStores: [{ id: 'store', applicationId: 'application', studentEmail: 'seller@example.test' }], platformSettings: { maintenanceMode: false } };
  const notice = createMaintenanceRecoveryNotice(store, 'notice', 'Service restored.', now);
  store.platformSettings.maintenanceRecoveryNotice = notice;
  assert.equal(Date.parse(notice.expiresAt!) - Date.parse(notice.createdAt!), MAINTENANCE_NOTICE_LIFETIME_MS);
  for (const account of [existing, { id: 'manager', role: 'manager' }, { id: 'officer', role: 'verification_team' }, { id: 'merchant:application', role: 'merchant' }])
    assert.equal(eligibleMaintenanceNotice(store.platformSettings, account, now)?.id, notice.id);
  assert.equal(eligibleMaintenanceNotice(store.platformSettings, existing, now + MAINTENANCE_NOTICE_LIFETIME_MS - 1)?.id, notice.id);
  assert.equal(eligibleMaintenanceNotice(store.platformSettings, existing, now + MAINTENANCE_NOTICE_LIFETIME_MS), null);
  assert.equal(eligibleMaintenanceNotice(store.platformSettings, existing, now + MAINTENANCE_NOTICE_LIFETIME_MS + 1), null);
  for (const account of [{ ...existing, role: 'admin' }, { ...existing, role: 'staff' }, { id: 'later', role: 'user', email: existing.email, createdAt: new Date(now - 1000).toISOString() }]) {
    store.users.push(account);
    assert.equal(eligibleMaintenanceNotice(store.platformSettings, account, now + 1), null);
  }
  assert.equal(eligibleMaintenanceNotice(structuredClone(store.platformSettings), existing, now + MAINTENANCE_NOTICE_LIFETIME_MS), null, 'Restart does not extend expiry');
  assert.equal(eligibleMaintenanceNotice({ ...store.platformSettings, maintenanceMode: true }, existing, now), null);
  assert.equal(eligibleMaintenanceNotice({ maintenanceRecoveryNotice: { id: 'legacy', message: 'Old message', dismissedBy: [] } }, existing, now), null);
  notice.expiresAt = new Date(now + 2 * MAINTENANCE_NOTICE_LIFETIME_MS).toISOString();
  assert.equal(eligibleMaintenanceNotice(store.platformSettings, existing, now + MAINTENANCE_NOTICE_LIFETIME_MS), null, 'Expiry cannot exceed the lifetime');
});
