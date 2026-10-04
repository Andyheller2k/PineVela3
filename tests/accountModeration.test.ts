import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdminGovernance, initializeAdminGovernance } from '../adminGovernance.js';
import { WipeRecovery } from '../adminWipeRecovery.js';
import { accountAccess, moderationAccounts, restrictedFeaturesForRequest } from '../accountModeration.js';
import { setRecordSession, sessionMatches } from '../sessionSecurity.js';
import { validateDatabase } from '../jsonStoreSafety.js';

function fixture(t: any) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinevela-account-policy-')); t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const admins = Array.from({ length: 5 }, (_, n) => ({ id: `founder-${n}`, role: 'admin', name: `Founder ${n}`, email: `founder${n}@example.test` }));
  const primary = { id: 'primary', role: 'user', name: 'Account holder', email: 'shared@example.test' };
  const other = { id: 'other', role: 'user', name: 'Independent account', email: primary.email };
  const manager = { id: 'manager', role: 'manager', parentUserId: primary.id, email: 'manager@example.test' };
  const staff = { id: 'staff-account', role: 'staff', managerId: manager.id, hostelId: 'home' };
  const resident = { id: 'resident', role: 'student', parentUserId: other.id, hostelId: 'home' };
  const store: any = { users: [...admins, primary, other, manager, staff, resident], hostels: [{ id: 'home', managerId: manager.id }],
    staff: [{ id: 'roster', userId: staff.id, managerId: manager.id, hostelId: 'home' }], roomKeys: [{ id: 'key', hostelId: 'home', assignedStudentId: resident.id }],
    issueReports: [{ id: 'issue', hostelId: 'home', studentId: resident.id }], notifications: [{ id: 'notification', issueId: 'issue' }],
    digitalMarketStores: [{ id: 'market', userId: primary.id, studentEmail: 'seller@example.test' }], digitalMarketApplications: [{ id: 'application', userId: primary.id, studentEmail: 'seller@example.test' }],
    digitalMarketProducts: [{ id: 'item', storeId: 'market' }], digitalMarketOrders: [{ id: 'order', storeId: 'market', buyerId: other.id }], digitalMarketMessages: [{ id: 'message', orderId: 'order' }],
    verificationTeams: [{ id: 'officer', officerId: 'PV-123', fullName: 'Officer', email: 'officer@example.test' }], verificationInspections: [{ id: 'inspection', assignedOfficerId: 'officer' }],
    platformSettings: {}, retiredFeatureRecords: {}, managerAccountSettings: {} };
  initializeAdminGovernance(store, admins[0].id);
  const keys = admins.map((a, n) => `isolated-approval-key-${n}`);
  store.adminGovernance.members.forEach((m: any, n: number) => { m.keyHash = crypto.createHash('sha256').update(`${m.id}:${keys[n]}`).digest('hex'); });
  let now = Date.now(), busy = false, failSave = false;
  const service = new AdminGovernance(() => store, () => { if (failSave) throw new Error('Disk failure'); validateDatabase(Buffer.from(JSON.stringify(store))); }, new WipeRecovery(path.join(temp, 'private'), path.join(temp, 'uploads')), () => busy ? 1 : 0, () => now);
  const propose = (action = 'ban', extras = {}) => service.moderation.propose(admins[0].id, { privateKey: keys[0], targetId: primary.id, targetRole: primary.role, action, reason: 'Verified policy violation', duration: { amount: 2, unit: 'hours' }, ...extras }).id;
  const vote = (id: string, n: number, decision = 'approved') => service.moderation.vote(admins[n].id, id, { privateKey: keys[n], decision });
  const approve = (id: string) => { for (let n = 1; n < 5; n++) vote(id, n); };
  const apply = (id: string, n = 0, deletion = false) => service.moderation.apply(admins[n].id, id, { privateKey: keys[n], confirmation: deletion ? 'DELETE APPROVED ACCOUNT' : 'APPLY APPROVED ACTION' });
  return { store, primary, other, manager, staff, resident, admins, keys, service, propose, vote, approve, apply, now: () => now, advance: (n: number) => { now += n; }, busy: () => { busy = true; }, fail: () => { failSave = true; } };
}
const denied = (fn: () => any, status: number) => assert.throws(fn, (e: any) => e.status === status);
test('Five distinct approvals, key ownership and main final verdict are mandatory', t => {
  const f = fixture(t), id = f.propose();
  denied(() => f.apply(id), 409); denied(() => f.vote(id, 0), 409);
  denied(() => f.service.moderation.vote(f.admins[1].id, id, { privateKey: f.keys[0], decision: 'approved' }), 403);
  for (let n = 1; n < 4; n++) f.vote(id, n); denied(() => f.apply(id), 409);
  assert(!accountAccess(f.store, f.primary.id, f.primary.role).banned);
  f.vote(id, 4); denied(() => f.apply(id, 1), 403); f.apply(id);
  assert(accountAccess(f.store, f.primary.id, f.primary.role, f.now()).banned); denied(() => f.apply(id), 409);
  assert(!JSON.stringify(f.service.view(f.admins[0].id)).includes('keyHash'));
});
test('Ban revokes parent/child/staff/seller sessions, preserves independent shared-email accounts and expires', t => {
  const f = fixture(t), token = 'disposable-session';
  for (const a of moderationAccounts(f.store)) for (const record of a.records) setRecordSession(record, token, f.now());
  const id = f.propose(); f.approve(id); f.apply(id);
  for (const target of [f.primary, f.manager, f.staff]) { assert(accountAccess(f.store, target.id, target.role, f.now()).banned); assert(!sessionMatches(target, token, f.now())); }
  assert(accountAccess(f.store, 'merchant:application', 'merchant', f.now()).banned);
  assert(!accountAccess(f.store, f.other.id, f.other.role, f.now()).banned); assert(sessionMatches(f.other, token, f.now()));
  f.advance(2 * 3600_000 + 1); assert(!accountAccess(f.store, f.primary.id, f.primary.role, f.now()).banned); assert(!sessionMatches(f.primary, token, f.now()));
  validateDatabase(Buffer.from(JSON.stringify(f.store)));
});
test('Duration/features reject malformed input; restrictions cover all six aliases and restore uses quorum', t => {
  const f = fixture(t);
  for (const duration of [{ amount: '2', unit: 'hours' }, { amount: -1, unit: 'hours' }, { amount: 1.5, unit: 'years' }, { amount: Infinity, unit: 'hours' }, { amount: 101, unit: 'years' }, { amount: 2, unit: '__proto__' }]) denied(() => f.propose('ban', { duration }), 400);
  for (const features of [[], ['orders', 'orders'], ['admin'], ['__proto__']]) denied(() => f.propose('restrict', { features }), 400);
  const features = ['subaccounts', 'rooms', 'orders', 'publishing', 'messaging', 'maintenance'];
  const id = f.propose('restrict', { features }); f.approve(id); f.apply(id);
  assert.deepEqual(accountAccess(f.store, f.primary.id, f.primary.role).restrictions[0].features, features);
  assert(accountAccess(f.store, f.manager.id, f.manager.role).restrictions[0].inherited);
  for (const [path, expected] of [['/api/auth/register-manager-account', 'subaccounts'], ['/api/residents/onboard', 'rooms'], ['/api/digital-market/orders', 'orders'], ['/api/digital-market/products', 'publishing'], ['/api/digital-market/messages', 'messaging'], ['/api/issue-reports', 'maintenance']]) assert(restrictedFeaturesForRequest('POST', path).includes(expected as any));
  assert.deepEqual(restrictedFeaturesForRequest('GET', '/api/digital-market/orders'), []);
  const restore = f.propose('restore'); f.approve(restore); f.apply(restore); assert.equal(accountAccess(f.store, f.primary.id, f.primary.role).restrictions.length, 0);
});
test('Rejected, expired, changed-roster and busy proposals cannot execute; administrators remain protected', t => {
  const f = fixture(t), rejected = f.propose(); f.vote(rejected, 1, 'rejected'); denied(() => f.vote(rejected, 2), 409);
  const expired = f.propose(); f.advance(86400_001); denied(() => f.vote(expired, 1), 409);
  denied(() => f.propose('delete', { targetId: f.admins[1].id, targetRole: 'admin' }), 403);
  const id = f.propose('delete', { fingerprint: f.service.moderation.preview(f.primary.id, f.primary.role).fingerprint }); f.approve(id); f.busy(); denied(() => f.apply(id, 0, true), 409);
  f.store.adminGovernance.revision++; denied(() => f.apply(id, 0, true), 409);
});
test('Targeted deletion cascades staff, housing, markets and records, retains other primary identity and admin accounts', t => {
  const f = fixture(t), preview = f.service.moderation.preview(f.primary.id, f.primary.role);
  denied(() => f.propose('delete', { fingerprint: 'forged' }), 409);
  const id = f.propose('delete', { fingerprint: preview.fingerprint }); f.approve(id); f.apply(id, 0, true);
  assert.deepEqual(f.store.users.map((u: any) => u.id).sort(), [...f.admins.map(a => a.id), f.other.id].sort());
  for (const collection of ['hostels', 'staff', 'roomKeys', 'issueReports', 'notifications', 'digitalMarketStores', 'digitalMarketApplications', 'digitalMarketProducts', 'digitalMarketOrders', 'digitalMarketMessages']) assert.equal(f.store[collection].length, 0, collection);
  assert.equal(f.store.verificationTeams.length, 1); validateDatabase(Buffer.from(JSON.stringify(f.store)));
  const p = f.store.adminGovernance.accountProposals[0]; assert.equal(p.targetName, 'Deleted account'); denied(() => f.apply(id, 0, true), 409);
});
test('Officer deletion removes credentials/assignments and stale deletion previews fail closed', t => {
  const f = fixture(t), preview = f.service.moderation.preview('officer', 'verification_team');
  const id = f.propose('delete', { targetId: 'officer', targetRole: 'verification_team', fingerprint: preview.fingerprint });
  f.store.verificationInspections[0].status = 'updated'; denied(() => f.vote(id, 1), 409);
  const next = f.propose('delete', { targetId: 'officer', targetRole: 'verification_team', fingerprint: f.service.moderation.preview('officer', 'verification_team').fingerprint });
  f.approve(next); f.apply(next, 0, true); assert.equal(f.store.verificationTeams.length, 0); assert.equal(f.store.verificationInspections.length, 0);
});
test('Missing founders and failed persistence never bypass quorum or silently apply', t => {
  const f = fixture(t); f.store.adminGovernance.members.pop(); denied(() => f.propose(), 409);
  const g = fixture(t), id = g.propose(); g.approve(id); g.fail(); denied(() => g.apply(id), 503); assert(g.service.blocked);
});
test('The main administrator can reject the final verdict after all five approvals', t => {
  const f = fixture(t), id = f.propose(); f.approve(id);
  denied(() => f.service.moderation.rejectFinal(f.admins[1].id, id, { privateKey: f.keys[1], reason: 'Wrong administrator' }), 403);
  f.service.moderation.rejectFinal(f.admins[0].id, id, { privateKey: f.keys[0], reason: 'Further evidence is required' });
  assert(!accountAccess(f.store, f.primary.id, f.primary.role).banned); denied(() => f.apply(id), 409);
  assert.equal(f.store.adminGovernance.accountProposals[0].finalRejectedBy, f.admins[0].id);
});
test('Deleting a sub-account clears cached credentials and only affected room summaries on a kept primary account', t => {
  const f = fixture(t);
  Object.assign(f.primary, { registeredAccounts: { managerAccount: { id: f.manager.id, email: f.manager.email, password: 'isolated-cached-credential' }, residentRooms: [{ hostelId: 'home', roomNumber: '1' }, { hostelId: 'unrelated-home', roomNumber: '2' }] } });
  const preview = f.service.moderation.preview(f.manager.id, f.manager.role);
  assert.equal(preview.counts.cachedAccountRecords, 2);
  const id = f.propose('delete', { targetId: f.manager.id, targetRole: f.manager.role, fingerprint: preview.fingerprint }); f.approve(id); f.apply(id, 0, true);
  const parent = f.store.users.find((u: any) => u.id === f.primary.id);
  assert(parent); assert(!parent.registeredAccounts.managerAccount); assert.deepEqual(parent.registeredAccounts.residentRooms, [{ hostelId: 'unrelated-home', roomNumber: '2' }]);
  assert(!JSON.stringify(f.store).includes('isolated-cached-credential'));
});
