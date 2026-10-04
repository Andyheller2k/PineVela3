import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AdminGovernance, GovernanceError, initializeAdminGovernance } from '../adminGovernance.js';
import { WipeRecovery } from '../adminWipeRecovery.js';
import { hashCredential } from '../accountSecurity.js';
import { pricingSettings, publicPlatformSettings } from '../platformSettings.js';
import { validateDatabase, DatabasePersistenceError } from '../jsonStoreSafety.js';

async function setup(t: any, count = 5) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinevela-pricing-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const admins = Array.from({ length: count }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Isolated pricing admin ${i}`, email: `pricing-${i}@example.test`, password: hashCredential(`Isolated-pricing-login-${i}!`) }));
  const store: any = { users: admins, platformSettings: { registrationFee: 50, commission: 5, semesterFee: 300, subscriptionPrices: { default: 0, star: 90, pro: 150 }, announcement: '', maintenanceMode: false, paystackSettlement: { code: 'ACCT_private' } }, paymentTransactions: [{ reference: 'existing-quote', amount: 50000 }] };
  initializeAdminGovernance(store, admins[0].id); let now = Date.now(), failSave = false, persisted: any;
  const save = () => { validateDatabase(Buffer.from(JSON.stringify(store))); if (failSave) throw new Error('Isolated disk failure'); persisted = structuredClone(store); };
  const recovery = new WipeRecovery(path.join(dir, 'recovery'), path.join(dir, 'uploads'));
  let gov = new AdminGovernance(() => store, save, recovery, () => 0, () => now);
  const keys = [];
  for (let i = 0; i < admins.length; i++) keys.push((await gov.enrollSettingsKey(admins[i].id, `Isolated-pricing-login-${i}!`)).settingsKey);
  const prices = { registrationFee: 62.5, commission: 7.5, semesterFee: 222.25, subscriptionPrices: { default: 0, star: 55, pro: 95.5 } };
  return { admins, keys, prices, store, get gov() { return gov; }, persisted: () => persisted, advance: () => now += 24 * 3600_000 + 1, fail: () => failSave = true, reload: () => { Object.assign(store, structuredClone(persisted)); gov = new AdminGovernance(() => store, save, recovery, () => 0, () => now); }, propose: (index = 1) => gov.proposePricing(admins[index].id, { settingsKey: keys[index], prices, reason: 'Reviewed new prices' }).id };
}
const denied = (fn: () => unknown, status: number) => assert.throws(fn, (e: any) => e instanceof GovernanceError && e.status === status);

test('Three approvals leave prices unchanged until main final push; four/five approvals also work', async t => {
  for (const count of [3, 4, 5]) {
    const f = await setup(t), before = pricingSettings(publicPlatformSettings(f.store)), id = f.propose(1);
    denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }), 409);
    const voters = [2, 3, 4, 0].slice(0, count - 1);
    for (const index of voters) f.gov.decidePricing(f.admins[index].id, id, { settingsKey: f.keys[index], decision: 'approved' });
    assert.deepEqual(pricingSettings(publicPlatformSettings(f.store)), before, 'No automatic application at threshold');
    denied(() => f.gov.applyPricing(f.admins[1].id, id, { settingsKey: f.keys[1] }), 403);
    denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0], prices: f.prices }), 400);
    f.reload();
    const result = f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }); assert.equal(result.status, 'applied');
    assert.deepEqual(pricingSettings(result.settings), f.prices); assert.equal(f.store.platformSettings.paystackSettlement.code, 'ACCT_private'); assert.equal(f.store.paymentTransactions[0].amount, 50000);
    const proposal = f.gov.view(f.admins[2].id).pricingProposals[0]; assert.equal(proposal.appliedBy, f.admins[0].id); assert.equal(proposal.votes.length, count);
    assert(!JSON.stringify(proposal).includes(f.keys[0])); denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }), 409);
  }
});

test('Keys, identities, duplicate votes, malformed input and direct settings bypass fail closed', async t => {
  const f = await setup(t);
  denied(() => f.gov.updateSettings(f.admins[0].id, { ...f.prices, settingsKey: f.keys[0] }), 409);
  denied(() => f.gov.updateSettings(f.admins[1].id, { ...f.prices, settingsKey: f.keys[1] }), 409);
  denied(() => f.gov.proposePricing('foreign', { prices: f.prices, reason: 'Spoofing', settingsKey: f.keys[0] }), 403);
  denied(() => f.gov.proposePricing(f.admins[1].id, { prices: f.prices, reason: 'Spoofing', settingsKey: f.keys[0] }), 403);
  const wipe = (await f.gov.enroll(f.admins[1].id, 'Isolated-pricing-login-1!')).privateKey;
  denied(() => f.gov.proposePricing(f.admins[1].id, { prices: f.prices, reason: 'Spoofing', settingsKey: wipe }), 403);
  for (const prices of [{ ...f.prices, registrationFee: '50' }, { ...f.prices, commission: -1 }, { ...f.prices, ownerId: 'spoof' }, { ...f.prices, subscriptionPrices: { default: 0, star: 1 } }]) denied(() => f.gov.proposePricing(f.admins[1].id, { prices, reason: 'Invalid values', settingsKey: f.keys[1] }), 400);
  const id = f.propose();
  denied(() => f.gov.decidePricing(f.admins[1].id, id, { settingsKey: f.keys[1], decision: 'approved' }), 409);
  denied(() => f.gov.decidePricing(f.admins[2].id, id, { settingsKey: f.keys[2], decision: 'approved', adminId: f.admins[3].id }), 400);
  f.gov.decidePricing(f.admins[2].id, id, { settingsKey: f.keys[2], decision: 'approved' });
  denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }), 409);
  f.gov.updateSettings(f.admins[0].id, { announcement: 'Real configured announcement', maintenanceMode: true, settingsKey: f.keys[0] });
  assert.equal(f.store.platformSettings.announcement, 'Real configured announcement'); assert.equal(f.store.platformSettings.registrationFee, 50);
});

test('Three-admin quorum works, fewer admins fail, expiry and stale competing proposals cannot apply', async t => {
  const two = await setup(t, 2); denied(() => two.propose(), 409);
  const f = await setup(t, 3), id = f.propose();
  f.gov.decidePricing(f.admins[0].id, id, { settingsKey: f.keys[0], decision: 'approved' });
  f.gov.decidePricing(f.admins[2].id, id, { settingsKey: f.keys[2], decision: 'approved' });
  f.advance(); denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }), 409);
  assert.equal(f.store.platformSettings.registrationFee, 50);
  const second = f.propose(), competing = f.propose();
  for (const index of [0, 2]) f.gov.decidePricing(f.admins[index].id, second, { settingsKey: f.keys[index], decision: 'approved' });
  f.gov.applyPricing(f.admins[0].id, second, { settingsKey: f.keys[0] });
  denied(() => f.gov.decidePricing(f.admins[2].id, competing, { settingsKey: f.keys[2], decision: 'approved' }), 409);
});

test('Membership changes and impossible quorum invalidate or reject; immutable proposal and save failure preserve live prices', async t => {
  const f = await setup(t), prices = structuredClone(f.prices);
  const id = f.gov.proposePricing(f.admins[1].id, { prices, reason: 'Immutable prices', settingsKey: f.keys[1] }).id;
  prices.registrationFee = 1; assert.equal(f.store.adminGovernance.pricingProposals[0].prices.registrationFee, 62.5);
  const wipe = (await f.gov.enroll(f.admins[0].id, 'Isolated-pricing-login-0!')).privateKey;
  denied(() => f.gov.applyPricing(f.admins[0].id, id, { settingsKey: f.keys[0] }), 409);
  const next = f.propose(); f.gov.setActive(f.admins[0].id, f.admins[4].id, false, wipe);
  denied(() => f.gov.decidePricing(f.admins[2].id, next, { settingsKey: f.keys[2], decision: 'approved' }), 409);
  const rejected = f.propose();
  for (const index of [2, 3]) f.gov.decidePricing(f.admins[index].id, rejected, { settingsKey: f.keys[index], decision: 'rejected' });
  assert.equal(f.store.adminGovernance.pricingProposals.at(-1).status, 'rejected');
  const final = f.propose(); for (const index of [2, 3]) f.gov.decidePricing(f.admins[index].id, final, { settingsKey: f.keys[index], decision: 'approved' });
  f.fail(); denied(() => f.gov.applyPricing(f.admins[0].id, final, { settingsKey: f.keys[0] }), 503); assert.equal(f.store.platformSettings.registrationFee, 50); assert.equal(f.store.adminGovernance.pricingProposals.at(-1).status, 'approved'); assert(f.gov.blocked);
});

test('Pricing metadata is bounded and malformed stored votes/prices fail safe validation', async t => {
  const f = await setup(t, 3);
  for (let i = 0; i < 10; i++) f.propose();
  denied(() => f.propose(), 429);
  const snapshot = structuredClone(f.store);
  for (const mutate of [(p: any) => p.votes.push(null), (p: any) => p.votes.push(p.votes[0]), (p: any) => p.roster.push(null), (p: any) => p.prices.registrationFee = 'ten', (p: any) => p.status = 'applied']) {
    const bad = structuredClone(snapshot); mutate(bad.adminGovernance.pricingProposals[0]);
    assert.throws(() => validateDatabase(Buffer.from(JSON.stringify(bad))), (e: any) => e instanceof DatabasePersistenceError && e.code === 'INVALID_DATABASE');
  }
  assert.equal(validateDatabase(Buffer.from(JSON.stringify(snapshot))).adminGovernance.pricingProposals.length, 10);
});
