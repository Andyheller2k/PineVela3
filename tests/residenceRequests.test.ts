import { buildWipePlan, applyWipePlan } from '../adminWipeScope.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { ResidenceRequests, ResidenceRequestError, residenceFields } from '../residenceRequests.js';

function setup() {
  let time = Date.now(); const manager = { id: crypto.randomUUID(), role: 'manager', name: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.test` }, admin = { id: crypto.randomUUID(), role: 'admin' };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, name: crypto.randomUUID(), managerName: manager.name, managerPhone: '+233241234567', blocksList: [{ id: crypto.randomUUID(), name: crypto.randomUUID(), floors: 1, totalRooms: 1 }] };
  const store: any = { hostels: [hostel], users: [manager], notifications: [] };
  const service = new ResidenceRequests(() => store, () => {}, { verifyApprovalKey: (_: any, k: any) => { if (k !== 'approval') throw new ResidenceRequestError(403, 'Approval key required'); }, verifySettingsKey: (_: any, k: any) => { if (k !== 'settings') throw new ResidenceRequestError(403, 'Settings key required'); } }, () => time);
  return { service, store, manager, admin, hostel, tick: (ms: number) => time += ms };
}
const status = (code: number) => (error: any) => error instanceof ResidenceRequestError && error.status === code;
test('Cooldown boundary, rejection and stale reviews preserve the property', () => {
  const { service, store, manager, admin, hostel, tick } = setup();
  const body = { hostelId: hostel.id, changes: { name: crypto.randomUUID() } };
  const r = service.submit(manager, body), review = service.review(admin, r.id);
  assert.throws(() => service.submit(manager, body), status(429));
  assert.throws(() => service.decision(admin, r.id, { decision: 'reject', approvalKey: 'approval', reviewToken: review.reviewToken }), status(400));
  service.decision(admin, r.id, { decision: 'reject', approvalKey: 'approval', reviewToken: review.reviewToken, reason: 'Information needs correction' });
  assert.notEqual(hostel.name, body.changes.name); assert.equal(store.notifications[0].type, 'error');
  tick(30 * 86400000 - 1); assert.throws(() => service.submit(manager, body), status(429)); tick(1);
  const next = service.submit(manager, body), nextReview = service.review(admin, next.id); tick(30 * 60_000);
  assert.throws(() => service.decision(admin, next.id, { decision: 'approve', approvalKey: 'approval', reviewToken: nextReview.reviewToken }), status(409));
  const refreshed = service.review(admin, next.id); hostel.managerName = crypto.randomUUID();
  assert.throws(() => service.decision(admin, next.id, { decision: 'approve', approvalKey: 'approval', reviewToken: refreshed.reviewToken }), status(409));
});
test('Key guessing is rate-limited and bootstrap exceptions cannot authorize unrelated operations', () => {
  const { service, manager, tick } = setup(); const { key } = service.issue(manager);
  for (let n = 0; n < 5; n++) assert.throws(() => service.verify(manager, 'wrong'), status(403));
  assert.throws(() => service.verify(manager, key), status(429)); tick(15 * 60_000); service.verify(manager, key);
  const unassigned = { ...manager, id: crypto.randomUUID() };
  assert.throws(() => service.gate({ user: unassigned, method: 'POST', path: '/api/staff', get: () => '' }), status(403));
  service.gate({ user: unassigned, method: 'POST', path: '/api/hostels/register', get: () => '' });
});
test('Unsafe block removals, unknown fields and fabricated images cannot enter the approval queue', () => {
  const { service, manager, hostel } = setup();
  for (const changes of [{ managerId: crypto.randomUUID() }, { amenities: [] }, { rules: {} }, { blocks: [{ name: 'Replacement' }] }, { cover: 'https://example.test/photo' }, { blocks: [{ id: hostel.blocksList[0].id, name: 'Block', totalRooms: 400 }] }]) assert.throws(() => service.submit(manager, { hostelId: hostel.id, changes }), (e: any) => [400, 409].includes(e.status));
});

test('Uploaded photos must match a strict hostel path, configured media origin and exact manager ownership', () => {
  const old = process.env.PINEVELA_MEDIA_ORIGIN; process.env.PINEVELA_MEDIA_ORIGIN = 'https://media.example.test';
  try {
    const { service, store, manager, hostel } = setup();
    for (const url of ['https://attacker.example.test/uploads/hostels/valid.webp', '/uploads/hostels/../../private.webp', '/uploads/hostels/image.svg', '/uploads/hostels/image.webp?x=1']) {
      store.hostelMedia = [{ managerId: manager.id, imageUrl: url }];
      assert.throws(() => service.submit(manager, { hostelId: hostel.id, changes: { cover: url } }), status(400));
    }
    const valid = 'https://media.example.test/uploads/hostels/verified.webp';
    store.hostelMedia = [{ managerId: manager.id, imageUrl: valid }];
    assert.equal(service.submit(manager, { hostelId: hostel.id, changes: { cover: valid } }).after.cover, valid);
  } finally { if (old === undefined) delete process.env.PINEVELA_MEDIA_ORIGIN; else process.env.PINEVELA_MEDIA_ORIGIN = old; }
});

test('Ambiguous legacy manager emails never grant sibling accounts request authority', () => {
  const { service, store, manager, hostel } = setup();
  manager.email = 'shared@example.test'; delete hostel.managerId; hostel.managerEmail = manager.email;
  assert.equal(service.ownHostels(manager).length, 1);
  store.users.push({ ...manager, id: crypto.randomUUID() });
  assert.equal(service.ownHostels(manager).length, 0);
});


test('Existing governed account removal includes manager keys, recovery petitions and owned uploads', () => {
  const { service, store, manager } = setup(); service.issue(manager);
  store.managerKeyPetitions = [{ id: crypto.randomUUID(), managerId: manager.id, reason: 'Lost key', status: 'Pending' }];
  store.hostelMedia = [{ managerId: manager.id, imageUrl: '/uploads/hostels/owned.webp' }];
  const plan = buildWipePlan(store, ['managers']); assert.equal(plan.counts.managerOperationKeys, 1);
  applyWipePlan(store, plan); assert.deepEqual(store.managerOperationKeys, {}); assert.deepEqual(store.managerKeyPetitions, []); assert.deepEqual(store.hostelMedia, []);
});

test('Name and block requests preserve legacy room structure and stable room keys', () => {
  const { service, store, manager, admin, hostel } = setup();
  hostel.blocksList = [{ blockName: 'First legacy block', floors: 1, totalRooms: 1 }, { blockName: 'Second legacy block', floors: 2, totalRooms: 2 }] as any;
  const room = { id: crypto.randomUUID(), hostelId: hostel.id, blockName: 'Second legacy block', roomKey: crypto.randomUUID(), isAssigned: true, assignedStudentId: crypto.randomUUID() }; store.roomKeys = [room];
  const originalRoom = structuredClone(room);
  const blocks = residenceFields(hostel).blocks.map((b, i) => ({ ...b, name: `Renamed block ${i + 1}` }));
  const name = crypto.randomUUID(); const r = service.submit(manager, { hostelId: hostel.id, changes: { name, blocks } }), review = service.review(admin, r.id);
  service.decision(admin, r.id, { decision: 'approve', approvalKey: 'approval', reviewToken: review.reviewToken });
  assert.equal(hostel.name, name); assert.deepEqual(hostel.blocksList.map(b => b.totalRooms), [1, 2]); assert.deepEqual(hostel.blocksList.map(b => b.floors), [1, 2]);
  assert.equal(new Set(hostel.blocksList.map(b => b.id)).size, 2); assert.equal(store.roomKeys[0].roomKey, originalRoom.roomKey); assert.equal(store.roomKeys[0].assignedStudentId, originalRoom.assignedStudentId);
  assert.equal(store.roomKeys[0].blockName, 'Renamed block 2');
});
