import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { AdminGovernance, GovernanceError, initializeAdminGovernance } from '../adminGovernance.js';
import { WipeRecovery, decryptWipeBackup } from '../adminWipeRecovery.js';
import { buildWipePlan, parseWipeScopes } from '../adminWipeScope.js';
import { hashCredential } from '../accountSecurity.js';
import { validateDatabase } from '../jsonStoreSafety.js';

function fixture(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pinevela-governance-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const admins = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Test founder ${i + 1}`, email: `founder${i + 1}@example.test`, password: hashCredential(`Independent-login-${i}!`) }));
  const users = [{ id: 'primary', role: 'user', email: 'user@example.test' }, { id: 'manager', role: 'manager', parentUserId: 'primary' }, { id: 'employee', role: 'staff', hostelId: 'home', managerId: 'manager' }, { id: 'resident', role: 'student', parentUserId: 'other-primary', hostelId: 'home' }, { id: 'other-primary', role: 'user' }, { id: 'seller', role: 'merchant', parentUserId: 'primary', merchantStoreId: 'market', email: 'seller@example.test' }];
  const store: any = { users: [...admins, ...users], hostels: [{ id: 'home', managerId: 'manager', imageUrl: '/uploads/hostels/home.jpg' }], staff: [{ id: 'roster', userId: 'employee', managerId: 'manager', hostelId: 'home' }],
    roomKeys: [{ id: 'room', hostelId: 'home', studentId: 'resident', roomKey: 'PRIVATE-ACTIVATION-KEY' }], issueReports: [{ id: 'issue', hostelId: 'home', assignedStaffId: 'roster', studentId: 'resident' }],
    staffReviews: [{ id: 'review', staffId: 'roster' }], meetings: [{ id: 'meeting', managerId: 'manager' }], notifications: [{ id: 'issue-notice', issueId: 'issue' }],
    digitalMarketStores: [{ id: 'market', userId: 'primary', studentEmail: 'seller@example.test' }], digitalMarketProducts: [{ id: 'item', storeId: 'market', imageUrl: '/uploads/hostels/item.jpg' }],
    digitalMarketOrders: [{ id: 'order', productId: 'item', storeId: 'market', buyerId: 'other-primary' }], digitalMarketMessages: [{ id: 'message', orderId: 'order' }], digitalMarketRatings: [{ id: 'rating', orderId: 'order' }],
    onboardingPayments: [{ id: 'payment', managerId: 'manager' }], managerAccountSettings: { manager: { preference: true } }, retiredFeatureRecords: { retiredChats: [{ id: 'old-chat', hostelId: 'home' }] },
    signupVerification: { pending: [{ id: 'signup' }], limits: [] }, roomKeyAttempts: { limits: [] }, platformSettings: { commission: 5, registrationFee: 1, announcement: 'Test announcement', maintenanceMode: false } };
  initializeAdminGovernance(store, admins[0].id);
  const uploads = path.join(directory, 'uploads'); fs.mkdirSync(path.join(uploads, 'hostels'), { recursive: true });
  fs.writeFileSync(path.join(uploads, 'hostels/home.jpg'), 'Test binary home photograph'); fs.writeFileSync(path.join(uploads, 'hostels/item.jpg'), 'Test binary product photograph');
  let now = Date.now(), saves = 0, inFlight = 0, failSave = false;
  const recovery = new WipeRecovery(path.join(directory, 'private'), uploads);
  const service = new AdminGovernance(() => store, () => { if (failSave) throw new Error('Isolated disk failure'); validateDatabase(Buffer.from(JSON.stringify(store))); saves++; }, recovery, () => inFlight, () => now);
  const enroll = async () => { const keys: string[] = []; for (let i = 0; i < 5; i++) keys.push((await service.enroll(admins[i].id, `Independent-login-${i}!`)).privateKey); return keys; };
  const propose = (keys: string[], scopes = ['markets']) => {
    const preview = service.preview(admins[0].id, scopes);
    return service.propose(admins[0].id, { scopes, fingerprint: preview.fingerprint, reason: 'Isolated test deletion', privateKey: keys[0], createdBy: admins[4].id }).id;
  };
  const vote = (id: string, keys: string[], i: number, decision = 'approved') => service.decide(admins[i].id, id, { privateKey: keys[i], decision });
  const execute = (id: string, key: string) => service.execute(admins[0].id, id, { privateKey: key, confirmation: 'WIPE APPROVED DATA' });
  return { directory, store, admins, service, recovery, uploads, enroll, propose, vote, execute, get saves() { return saves; }, setNow: (v: number) => now = v, setBusy: () => inFlight = 1, setFail: () => failSave = true };
}
function denied(action: () => any, status: number) { assert.throws(action, (e: any) => e instanceof GovernanceError && e.status === status); }

test('Private enrollment, exact quorum, immutable preview, bounded key attempts and proposal expiry', async t => {
  const f = fixture(t), { service, admins } = f;
  await assert.rejects(service.enroll(admins[0].id, 'incorrect password'), (e: any) => e.status === 403);
  const keys = await f.enroll();
  assert.equal(new Set(keys).size, 5); assert(keys.every(k => k.length >= 43));
  assert(!JSON.stringify(service.view(admins[0].id)).includes('keyHash'));
  for (const k of keys) assert(!JSON.stringify(f.store).includes(k));
  await assert.rejects(service.enroll(admins[0].id, 'Independent-login-0!'), (e: any) => e.status === 409);
  for (const input of [[], ['total', 'users'], ['hostels', 'hostels'], ['unknown'], 'markets']) assert.throws(() => parseWipeScopes(input));
  const id = f.propose(keys); assert.equal(service.view(admins[0].id).proposals[0].createdBy, admins[0].id);
  denied(() => f.execute(id, keys[0]), 409);
  denied(() => f.vote(id, keys, 0), 409);
  denied(() => service.decide(admins[1].id, id, { privateKey: keys[0], decision: 'approved' }), 403);
  for (let i = 1; i < 4; i++) f.vote(id, keys, i);
  denied(() => f.execute(id, keys[0]), 409);
  f.vote(id, keys, 4); assert.equal(service.view(admins[0].id).proposals[0].status, 'approved');
  f.store.digitalMarketProducts[0].price = 123;
  denied(() => f.execute(id, keys[0]), 409); assert.equal(service.view(admins[0].id).proposals[0].status, 'invalidated');
  const rejected = f.propose(keys); f.vote(rejected, keys, 1, 'rejected'); denied(() => f.vote(rejected, keys, 2), 409);
  const expired = f.propose(keys); f.setNow(Date.now() + 25 * 3600_000); denied(() => f.vote(expired, keys, 1), 409);
  for (let i = 0; i < 5; i++) denied(() => service.setActive(admins[0].id, admins[1].id, false, 'wrong-key'), 403);
  denied(() => service.setActive(admins[0].id, admins[1].id, false, keys[0]), 429);
});

test('Scoped market wipe preserves housing and administrators; backup verifies and replay cannot wipe twice', async t => {
  const f = fixture(t), keys = await f.enroll(), id = f.propose(keys);
  for (let i = 1; i < 5; i++) f.vote(id, keys, i);
  assert.equal(f.store.digitalMarketOrders.length, 1, 'Approval alone never executes');
  assert.equal(f.execute(id, keys[0]).status, 'executed');
  assert.equal(f.store.digitalMarketStores.length, 0); assert.equal(f.store.digitalMarketOrders.length, 0); assert.equal(f.store.digitalMarketMessages.length, 0); assert.equal(f.store.digitalMarketRatings.length, 0);
  assert(!f.store.users.some((u: any) => u.id === 'seller')); assert(f.store.users.some((u: any) => u.id === 'primary'));
  assert.equal(f.store.hostels.length, 1); assert.equal(f.store.issueReports.length, 1); assert.equal(f.store.staff.length, 1);
  assert.equal(f.store.users.filter((u: any) => u.role === 'admin').length, 5);
  assert(!fs.existsSync(path.join(f.uploads, 'hostels/item.jpg'))); assert(fs.existsSync(path.join(f.uploads, 'hostels/home.jpg')));
  const bytes = fs.readFileSync(path.join(f.recovery.directory, `${id}.pvwipe`)), key = fs.readFileSync(path.join(f.recovery.directory, 'backup.key'));
  const restored = decryptWipeBackup(bytes, key); assert.equal(restored.database.digitalMarketOrders.length, 1); assert.equal(restored.files.length, 1);
  assert.equal(Buffer.from(restored.files[0].bytes, 'base64').toString(), 'Test binary product photograph');
  assert.throws(() => decryptWipeBackup(bytes, crypto.randomBytes(32)));
  denied(() => f.execute(id, keys[0]), 409); assert(!f.recovery.isBlocked());
  assert.equal(fs.statSync(path.join(f.recovery.directory, 'backup.key')).mode & 0o777, 0o600);
});

test('Manager and user cascades remove dependent staff and rooms without deleting unrelated primary identities', t => {
  const f = fixture(t);
  const plan = buildWipePlan(f.store, ['managers']);
  assert.deepEqual(plan.removed.users.map(u => u.id).sort(), ['employee', 'manager', 'resident']);
  assert.equal(plan.removed.hostels.length, 1); assert.equal(plan.removed.staffReviews.length, 1); assert.equal(plan.removed.roomKeys.length, 1);
  assert.equal(plan.removed.notifications.length, 1, 'Notifications linked only through a deleted issue cascade');
  assert.equal(plan.kept.digitalMarketStores.length, 1); assert(plan.kept.users.some(u => u.id === 'other-primary'));
  const homes = buildWipePlan(f.store, ['hostels']); assert(homes.kept.users.some(u => u.id === 'manager')); assert.equal(homes.removed.roomKeys.length, 1);
  const allUsers = buildWipePlan(f.store, ['users']); assert.equal(allUsers.kept.users.length, 5); assert.equal(allUsers.removed.digitalMarketOrders.length, 1);
  f.store.users.find((u: any) => u.id === 'manager').email = 'legacy-manager@example.test';
  f.store.hostels.push({ id: 'legacy-home', managerEmail: 'legacy-manager@example.test' });
  f.store.users.push({ id: 'legacy-resident', role: 'student', email: 'legacy-resident@example.test', roomKey: 'LEGACY-ROOM' });
  f.store.roomKeys.push({ id: 'legacy-key', hostelId: 'legacy-home', roomKey: 'LEGACY-ROOM', assignedStudentEmail: 'legacy-resident@example.test' });
  const legacy = buildWipePlan(f.store, ['managers']); assert.equal(legacy.removed.hostels.length, 2); assert(legacy.removed.users.some(u => u.id === 'legacy-resident'));
});

test('Total wipe clears all operational collections, preserves admin credentials, and restores uploaded backup bytes', async t => {
  const f = fixture(t), keys = await f.enroll();
  fs.writeFileSync(path.join(f.uploads, 'orphan.jpg'), 'Orphaned test image');
  const hashes = f.store.users.filter((u: any) => u.role === 'admin').map((u: any) => u.password);
  const id = f.propose(keys, ['total']); for (let i = 1; i < 5; i++) f.vote(id, keys, i); f.execute(id, keys[0]);
  assert.deepEqual(f.store.users.map((u: any) => u.password), hashes);
  for (const [key, value] of Object.entries(f.store)) if (Array.isArray(value) && key !== 'users') assert.equal(value.length, 0, key);
  assert.equal(f.store.signupVerification.pending.length, 0); assert.deepEqual(f.store.managerAccountSettings, {}); assert.deepEqual(f.store.retiredFeatureRecords.retiredChats, []);
  assert.deepEqual(f.store.platformSettings, { commission: 0, registrationFee: 0, announcement: '', maintenanceMode: false });
  assert.equal(fs.readdirSync(f.uploads).filter(p => p.endsWith('.jpg')).length, 0);
  const restarted = new AdminGovernance(() => JSON.parse(JSON.stringify(f.store)), () => {}, f.recovery);
  assert.equal(restarted.view(f.admins[0].id).proposals[0].status, 'executed');
});

test('Membership changes invalidate approvals; main is protected; removal and reset require independent approval', async t => {
  const f = fixture(t), keys = await f.enroll(), { service, admins } = f;
  const id = f.propose(keys);
  denied(() => service.setActive(admins[1].id, admins[2].id, false, keys[1]), 403);
  denied(() => service.setActive(admins[0].id, admins[0].id, false, keys[0]), 403);
  service.setActive(admins[0].id, admins[4].id, false, keys[0]);
  assert.equal(service.view(admins[0].id).proposals[0].status, 'invalidated'); denied(() => service.view(admins[4].id), 403);
  denied(() => f.propose(keys), 409); service.setActive(admins[0].id, admins[4].id, true, keys[0]);
  denied(() => service.requestChange(admins[0].id, admins[0].id, { action: 'remove', privateKey: keys[0], reason: 'Invalid main removal' }), 403);
  const removedSlot = service.view(admins[0].id).members.find(m => m.id === admins[4].id)!.slot;
  const change = service.requestChange(admins[0].id, admins[4].id, { action: 'remove', privateKey: keys[0], reason: 'Test replacement' });
  denied(() => service.decideChange(admins[0].id, change.id, { privateKey: keys[0], decision: 'approved' }), 403);
  denied(() => service.decideChange(admins[4].id, change.id, { privateKey: keys[4], decision: 'approved' }), 403);
  for (let i = 1; i <= 3; i++) service.decideChange(admins[i].id, change.id, { privateKey: keys[i], decision: 'approved' });
  assert.equal(f.store.users.filter((u: any) => u.role === 'admin').length, 5);
  service.submitRemovalPlea(admins[4].id, change.id, { message: 'Please reconsider replacement.' });
  service.decideRemovalPlea(admins[0].id, change.id, { privateKey: keys[0], decision: 'rejected', reason: 'Replacement remains necessary.' });
  service.confirmRemoval(admins[0].id, change.id, { privateKey: keys[0], confirmation: 'REMOVE ADMINISTRATOR' });
  assert.equal(f.store.users.filter((u: any) => u.role === 'admin').length, 4);
  const invitation = service.invite(admins[0].id, { email: 'replacement@example.test', name: 'Test replacement founder', privateKey: keys[0] }); assert.equal(invitation.slot, removedSlot);
  denied(() => service.invite(admins[0].id, { email: 'sixth@example.test', name: 'Sixth administrator', privateKey: keys[0] }), 409);
  const accepted = await service.acceptInvitation({ invitationToken: invitation.invitationToken, password: 'Independent-new-login!123' }); assert.equal(accepted.slot, removedSlot);
  await assert.rejects(service.acceptInvitation({ invitationToken: invitation.invitationToken, password: 'Independent-new-login!123' }), (e: any) => e.status === 403);
  const reset = service.requestChange(admins[1].id, admins[0].id, { action: 'reset-key', privateKey: keys[1], reason: 'Main lost key recovery' });
  service.decideChange(admins[2].id, reset.id, { privateKey: keys[2], decision: 'approved' });
  assert(!service.view(admins[1].id).members.find(m => m.slot === 1)?.keyEnrolled);
  const recovered = await service.enroll(admins[0].id, 'Independent-login-0!'); assert.notEqual(recovered.privateKey, keys[0]);
});

test('In-flight operations and disk commit failures fail closed and preserve encrypted recovery data', async t => {
  const f = fixture(t), keys = await f.enroll(), id = f.propose(keys);
  for (let i = 1; i < 5; i++) f.vote(id, keys, i);
  f.setBusy(); denied(() => f.execute(id, keys[0]), 409);
  const g = fixture(t), otherKeys = await g.enroll(), other = g.propose(otherKeys);
  for (let i = 1; i < 5; i++) g.vote(other, otherKeys, i);
  g.setFail(); denied(() => g.execute(other, otherKeys[0]), 503);
  assert(g.service.blocked); assert(g.recovery.isBlocked());
  assert(fs.existsSync(path.join(g.uploads, 'hostels/item.jpg')));
  assert(fs.existsSync(path.join(g.recovery.directory, `${other}.pvwipe`)));
  const restarted = new AdminGovernance(() => g.store, () => {}, g.recovery); assert(restarted.blocked);
});

test('Removal keeps voting after two approvals, excludes target, accepts a private plea and revokes all votes', async t => {
  const f = fixture(t), keys = await f.enroll(), { service: s, admins: a } = f;
  const change = s.requestChange(a[0].id, a[4].id, { action: 'remove', privateKey: keys[0], reason: 'Review account removal' });
  const vote = (i: number) => s.decideChange(a[i].id, change.id, { privateKey: keys[i], decision: 'approved' });
  const view = (i: number) => s.view(a[i].id).changes.find(c => c.id === change.id)!;
  vote(1); assert.equal(view(2).status, 'pending'); assert.equal(view(2).votes.length, 2);
  assert.equal(view(4), undefined); denied(() => vote(4), 403); denied(() => vote(1), 403);
  denied(() => s.requestChange(a[1].id, a[4].id, { action: 'remove', privateKey: keys[1], reason: 'Unauthorized removal' }), 403);
  vote(2); vote(3); assert.equal(view(4).status, 'awaiting-plea'); assert.equal(f.store.users.filter((u: any) => u.role === 'admin').length, 5);
  const deadline = view(4).pleaUntil!; assert.equal(Date.parse(deadline)-Date.parse(view(4).votes[3].at),24*3600_000);
  denied(() => s.confirmRemoval(a[0].id, change.id, { privateKey: keys[0], confirmation: 'REMOVE ADMINISTRATOR' }), 409);
  denied(() => s.submitRemovalPlea(a[1].id, change.id, { message: 'Impersonated plea', targetId: a[4].id }), 403);
  s.submitRemovalPlea(a[4].id, change.id, { message: 'Private explanation only for main.' });
  assert.equal(view(0).plea?.message, 'Private explanation only for main.'); assert.equal(view(2).plea, undefined);
  denied(() => s.submitRemovalPlea(a[4].id, change.id, { message: 'Duplicate plea' }), 409);
  denied(() => s.decideRemovalPlea(a[2].id, change.id, { privateKey: keys[2], decision: 'accepted', reason: 'Unauthorized override' }), 403);
  s.decideRemovalPlea(a[0].id, change.id, { privateKey: keys[0], decision: 'accepted', reason: 'Explanation accepted.' });
  assert.equal(view(4).status, 'revoked'); assert.equal(view(4).votes.length, 0);
  assert(f.store.notifications.some((n: any) => n.title === 'Plea accepted' && n.targetAccountId === a[4].id && n.targetRole === 'admin'));
  denied(() => s.acknowledgeRemovalPlea(a[1].id, change.id), 403);
  s.setActive(a[0].id, a[2].id, false, keys[0]); // Historical decision prompts remain dismissible after roster changes.
  s.acknowledgeRemovalPlea(a[4].id, change.id); assert(view(4).plea?.acknowledgedAt);
  f.setNow(Date.parse(deadline)+1); denied(() => s.confirmRemoval(a[0].id, change.id, { privateKey: keys[0], confirmation: 'REMOVE ADMINISTRATOR' }), 409);
  assert(f.store.users.some((u: any) => u.id === a[4].id));
});

test('After 24 hours no response permits main-only explicit removal; roster changes invalidate approval', async t => {
  const f = fixture(t), keys = await f.enroll(), { service: s, admins: a } = f;
  const propose = () => s.requestChange(a[0].id, a[4].id, { action: 'remove', privateKey: keys[0], reason: 'Review membership' }).id;
  const approve = (id: string) => { for (let i=1;i<=3;i++) s.decideChange(a[i].id,id,{privateKey:keys[i],decision:'approved'}); };
  const first = propose(); approve(first); s.setActive(a[0].id,a[2].id,false,keys[0]);
  denied(() => s.submitRemovalPlea(a[4].id,first,{message:'Stale proposal plea'}),409);
  assert.equal(s.view(a[0].id).changes.find(c=>c.id===first)?.status,'invalidated');
  denied(() => propose(),409); s.setActive(a[0].id,a[2].id,true,keys[0]);
  const id=propose(); approve(id); const until=s.view(a[0].id).changes.find(c=>c.id===id)!.pleaUntil!;
  f.setNow(Date.parse(until)-1); denied(()=>s.confirmRemoval(a[0].id,id,{privateKey:keys[0],confirmation:'REMOVE ADMINISTRATOR'}),409);
  f.setNow(Date.parse(until)); denied(()=>s.submitRemovalPlea(a[4].id,id,{message:'Too late'}),409);
  denied(()=>s.confirmRemoval(a[1].id,id,{privateKey:keys[1],confirmation:'REMOVE ADMINISTRATOR'}),403);
  denied(()=>s.confirmRemoval(a[0].id,id,{privateKey:keys[0],confirmation:'yes'}),400);
  assert.equal(s.confirmRemoval(a[0].id,id,{privateKey:keys[0],confirmation:'REMOVE ADMINISTRATOR'}).status,'executed');
  denied(()=>s.confirmRemoval(a[0].id,id,{privateKey:keys[0],confirmation:'REMOVE ADMINISTRATOR'}),409);
  assert(!f.store.users.some((u:any)=>u.id===a[4].id)); assert.equal(f.store.users.filter((u:any)=>u.role==='admin').length,4);
});
