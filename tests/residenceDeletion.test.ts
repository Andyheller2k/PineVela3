import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AdminGovernance, initializeAdminGovernance } from '../adminGovernance.js';
import { WipeRecovery, decryptWipeBackup } from '../adminWipeRecovery.js';
import { registrationBan } from '../residenceDeletion.js';
import { validateDatabase } from '../jsonStoreSafety.js';

function fixture(t: any, count = 3) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinevela-residence-deletion-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const admins = Array.from({ length: count }, (_, slot) => ({ id: crypto.randomUUID(), name: `Founder ${slot + 1}`, email: `${slot}@example.test`, role: 'admin' }));
  const store: any = { users: [...admins, { id: 'primary', role: 'user', emailVerificationProvider: 'supabase-google' }, { id: 'manager', role: 'manager', parentUserId: 'primary', hostelId: 'home', name: 'Property owner' },
    { id: 'resident', role: 'student', hostelId: 'home', parentUserId: 'primary' }, { id: 'staff', role: 'staff', hostelId: 'home', managerId: 'manager' },
    { id: 'other', role: 'manager', parentUserId: 'primary' }, { id: 'seller', role: 'merchant', parentUserId: 'primary', merchantStoreId: 'market' }],
    hostels: [{ id: 'home', name: 'Selected home', managerId: 'manager' }, { id: 'other-home', name: 'Other home', managerId: 'other' }],
    roomKeys: [{ id: 'room', hostelId: 'home' }], staff: [{ id: 'staff-record', userId: 'staff', hostelId: 'home' }], issueReports: [{ id: 'issue', hostelId: 'home', studentId: 'resident' }],
    notifications: [], digitalMarketStores: [{ id: 'market', userId: 'primary' }], digitalMarketProducts: [{ id: 'product', storeId: 'market' }] };
  initializeAdminGovernance(store, admins[0].id);
  const keys = admins.map(admin => { const key = crypto.randomBytes(32).toString('base64url'); store.adminGovernance.members.find((m: any) => m.id === admin.id).keyHash = crypto.createHash('sha256').update(`${admin.id}:${key}`).digest('hex'); return key; });
  let now = Date.now(), busy = 0, failSave = false;
  const recovery = new WipeRecovery(path.join(temp, 'recovery'), path.join(temp, 'uploads'));
  const service = new AdminGovernance(() => store, () => { if (failSave) throw new Error('Disk unavailable'); validateDatabase(Buffer.from(JSON.stringify(store))); }, recovery, () => busy, () => now);
  const propose = (index = 1, deleteManager = false, amount = 2) => { const options = { hostelId: 'home', deleteHostel: true, deleteManager, ban: { amount, unit: 'days' } }, preview = service.residenceDeletion.preview(options);
    return service.residenceDeletion.propose(admins[index].id, { ...options, fingerprint: preview.fingerprint, reason: 'Reviewed hostel deletion', privateKey: keys[index] }).id; };
  const vote = (id: string, index: number, decision = 'approved') => service.residenceDeletion.vote(admins[index].id, id, { privateKey: keys[index], decision });
  const execute = (id: string, index = 0, privateKey = keys[index]) => service.residenceDeletion.execute(admins[index].id, id, { privateKey, confirmation: 'DELETE APPROVED HOSTEL' });
  return { temp, store, admins, keys, service, recovery, propose, vote, execute, time: () => now, setTime: (time: number) => now = time, setBusy: () => busy = 1, failSave: () => failSave = true };
}
const denied = (fn: () => any, status: number) => assert.throws(fn, (error: any) => error.status === status);

test('two other admins cannot bypass founder; hostel-only removes dependents and retains manager sign-in', t => {
  const f = fixture(t), id = f.propose();
  denied(() => f.execute(id), 409); denied(() => f.vote(id, 1), 409);
  denied(() => f.service.residenceDeletion.vote(f.admins[2].id, id, { privateKey: f.keys[1], decision: 'approved' }), 403);
  f.vote(id, 2); assert.equal(f.store.hostels.length, 2);
  denied(() => f.execute(id, 1), 403); denied(() => f.execute(id, 0, 'wrong-key'), 403);
  f.execute(id); assert.deepEqual(f.store.hostels.map((h: any) => h.id), ['other-home']);
  assert(f.store.users.some((u: any) => u.id === 'manager')); assert(!f.store.users.find((u: any) => u.id === 'manager').hostelId);
  for (const id of ['primary', 'other', 'seller']) assert(f.store.users.some((u: any) => u.id === id));
  for (const id of ['staff', 'resident']) assert(!f.store.users.some((u: any) => u.id === id));
  assert.equal(f.store.issueReports.length, 0); assert.equal(f.store.digitalMarketProducts.length, 1);
  assert(f.store.notifications.some((n: any) => n.targetRole === 'user' && n.targetAccountId === 'primary' && n.adminMessage));
  assert(registrationBan(f.store, { id: 'manager', role: 'manager' }, 'hostel', f.time()));
  assert(!registrationBan(f.store, { id: 'primary', role: 'user' }, 'manager_account', f.time()));
  const archive = decryptWipeBackup(fs.readFileSync(path.join(f.temp, 'recovery', `${id}.pvwipe`)), fs.readFileSync(path.join(f.temp, 'recovery', 'backup.key'))); assert(archive.database.hostels.some((h: any) => h.id === 'home'));
  denied(() => f.execute(id), 409);
});

test('two admins including founder suffice; both deletion bans saved primary identity across restart', t => {
  const f = fixture(t, 2), id = f.propose(0, true);
  f.vote(id, 1); f.execute(id);
  assert(!f.store.users.some((u: any) => u.id === 'manager'));
  assert(f.store.users.some((u: any) => u.id === 'primary'));
  const saved = validateDatabase(Buffer.from(JSON.stringify(f.store)));
  assert(registrationBan(saved, { id: 'primary', role: 'user' }, 'manager_account', f.time()));
  assert(!registrationBan(saved, { id: 'other', role: 'user' }, 'manager_account', f.time()));
  assert(!registrationBan(saved, { id: 'primary', role: 'manager' }, 'manager_account', f.time()));
  assert(!registrationBan(saved, { id: 'primary', role: 'user' }, 'manager_account', f.time() + 2 * 86400_000));
  assert.equal(saved.adminGovernance.residenceProposals[0].votes.length, 2);
});

test('changed scope, stale ownership, expired proposals and rejected votes never delete', t => {
  const f = fixture(t);
  const options = { hostelId: 'home', deleteHostel: true, deleteManager: false, ban: { amount: 0, unit: 'days' } };
  const preview = f.service.residenceDeletion.preview(options);
  denied(() => f.service.residenceDeletion.propose(f.admins[0].id, { ...options, deleteManager: true, fingerprint: preview.fingerprint, reason: 'Changed selection', privateKey: f.keys[0] }), 409);
  const id = f.propose(); f.store.hostels[0].managerId = 'other'; denied(() => f.vote(id, 2), 409);
  assert.equal(f.store.adminGovernance.residenceProposals[0].status, 'invalidated'); f.store.hostels[0].managerId = 'manager';
  const rejected = f.propose(); f.vote(rejected, 2, 'rejected'); denied(() => f.execute(rejected), 409);
  const expired = f.propose(); f.setTime(f.time() + 86400_000); denied(() => f.vote(expired, 2), 409);
  assert.equal(f.store.hostels.length, 2);
});

test('founder final rejection, busy writes and malformed persisted consent fail closed', t => {
  const f = fixture(t), id = f.propose(0); f.vote(id, 1);
  denied(() => f.service.residenceDeletion.rejectFinal(f.admins[1].id, id, { privateKey: f.keys[1], reason: 'Do not delete' }), 403);
  f.service.residenceDeletion.rejectFinal(f.admins[0].id, id, { privateKey: f.keys[0], reason: 'Keep this hostel' });
  denied(() => f.execute(id), 409); assert.equal(f.store.hostels.length, 2);
  const busy = f.propose(0); f.vote(busy, 1); f.setBusy(); denied(() => f.execute(busy), 409);
  const corrupt = structuredClone(f.store); corrupt.adminGovernance.residenceProposals[1].votes[1] = corrupt.adminGovernance.residenceProposals[1].votes[0];
  assert.throws(() => validateDatabase(Buffer.from(JSON.stringify(corrupt))));
});

test('failed persistence blocks further writes and preserves encrypted recovery', t => {
  const f = fixture(t), id = f.propose(0); f.vote(id, 1); f.failSave(); denied(() => f.execute(id), 503);
  assert(f.service.blocked); assert(f.recovery.isBlocked()); assert(fs.existsSync(path.join(f.temp, 'recovery', `${id}.pvwipe`)));
  denied(() => f.execute(id), 503);
});
