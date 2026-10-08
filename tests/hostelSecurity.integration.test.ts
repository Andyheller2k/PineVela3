import { sessionFixtureJson } from './sessionFixtures.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

// Real HTTP handlers and authentication in a disposable private database.
test('Residence changes require manager keys, scoped requests and reviewed admin decisions, and survive restart', { timeout: 180000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-residence-approval-')), dataDir = path.join(temp, 'data'), db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const email = `${crypto.randomUUID()}@example.test`;
  const account = (role: string) => ({ id: crypto.randomUUID(), role, email, name: crypto.randomUUID(), token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const manager = account('manager'), foreign = account('manager'), primary = account('user'), admin = account('admin'), admin2 = account('admin');
  const approvalKey = crypto.randomBytes(32).toString('base64url'), approvalKey2 = crypto.randomBytes(32).toString('base64url'), settingsKey = crypto.randomBytes(32).toString('base64url');
  const hostel = { id: crypto.randomUUID(), name: crypto.randomUUID(), imageUrl: '/uploads/existing-cover.webp', gallery: ['/uploads/existing-interior.webp'], managerId: manager.id, assignedManagerId: manager.id, managerEmail: email, managerName: manager.name, managerPhone: '+233241234567', isApproved: true, approvalStatus: 'Approved', status: 'Open', totalCapacity: 3, bedsLeft: 3, availableSpaces: 3, blocksList: [{ id: crypto.randomUUID(), name: crypto.randomUUID(), floors: 1, totalRooms: 1, bedsPerRoom: 3 }], facilities: ['Archived facility'], rules: { curfew: 'Archived rule' } };
  const other = { ...hostel, id: crypto.randomUUID(), managerId: foreign.id, assignedManagerId: foreign.id, name: crypto.randomUUID() };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [manager, foreign, primary, admin, admin2], hostels: [hostel, other], managerVerifications: [manager, foreign].map(u => ({ id: crypto.randomUUID(), managerId: u.id, managerEmail: email, status: 'approved' })), adminGovernance: { version: 1, mainId: admin.id, revision: 1, members: [admin, admin2].map((u, i) => ({ id: u.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${u.id}:${i ? approvalKey2 : approvalKey}`).digest('hex'), settingsKeyHash: crypto.createHash('sha256').update(`settings:${u.id}:${settingsKey}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} } }), { mode: 0o600 });
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve())); const base = `http://127.0.0.1:${port}`;
  const start = async () => { let logs = ''; child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_MAIN_ADMIN_ID: admin.id }, stdio: ['ignore', 'pipe', 'pipe'] }); child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d); for (let n = 0; n < 200; n++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); } assert.fail(logs); };
  const request = async (method: string, route: string, actor: any, body: any, expected: number, key?: string) => { const r = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}), ...(key ? { 'X-PineVela-Manager-Key': key } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const result = await r.json(); assert.equal(r.status, expected, `${method} ${route}: ${result.error}`); return result; };
  const saved = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  await start();
  for (const viewer of [undefined, primary]) {
    const properties = await request('GET', '/api/hostels', viewer, undefined, 200);
    const publicHostel = properties.find((h: any) => h.id === hostel.id); assert.equal(publicHostel.facilities, undefined); assert.equal(publicHostel.totalCapacity, undefined); assert.equal(publicHostel.availableSpaces, undefined); assert.equal(publicHostel.blocksList[0].bedsPerRoom, undefined);
  }
  const managed = await request('GET', '/api/hostels', manager, undefined, 200); assert.equal(managed.find((h: any) => h.id === hostel.id).totalCapacity, 3); assert.equal(managed.find((h: any) => h.id === other.id).totalCapacity, undefined);
  assert.equal((await request('GET', '/api/hostels', admin, undefined, 200))[0].totalCapacity, 3);
  await request('POST', '/api/board-requests', undefined, {}, 401);
  await request('GET', '/api/manager/secret-key', primary, undefined, 403);
  const issued = await request('POST', '/api/manager/secret-key/issue', manager, undefined, 200), key = issued.key;
  const foreignKey = (await request('POST', '/api/manager/secret-key/issue', foreign, undefined, 200)).key;
  assert(key.length >= 40); assert(!(await fs.readFile(db, 'utf8')).includes(key));
  await request('POST', '/api/manager/secret-key/issue', manager, undefined, 409);
  await request('PUT', `/api/hostels/${hostel.id}`, admin, { name: 'Unrequested edit' }, 403);
  await request('PUT', `/api/hostels/${hostel.id}`, manager, { name: 'Direct edit' }, 403, key);
  await request('POST', '/api/hostels', admin, { id: hostel.id, name: 'Upsert bypass' }, 410);
  await request('POST', '/api/hostel-managers/assign', admin, { hostelId: hostel.id, managerId: manager.id }, 410);
  const change = { hostelId: hostel.id, changes: { name: crypto.randomUUID() } };
  assert((await request('POST', '/api/board-requests', manager, change, 403)).managerKeyRequired);
  await request('POST', '/api/board-requests', manager, change, 403, foreignKey);
  await request('POST', '/api/board-requests', foreign, change, 403, foreignKey);
  await request('POST', '/api/board-requests', admin, change, 403);
  for (const changes of [{ totalCapacity: 400 }, { managerId: foreign.id }, { price: 100 }, { facilities: [] }, { rules: [] }, { managerPhone: '+12025550123', managerPhoneCountry: 'GH' }, { cover: '/uploads/foreign.webp' }, { blocks: [{ id: other.id, name: 'Foreign block' }] }]) await request('POST', '/api/board-requests', manager, { hostelId: hostel.id, changes }, 400, key);
  const imageData = (await fs.readFile(path.join(project, 'src/assets/images/hostels_bg_1789053809472.jpg'))).toString('base64');
  await request('POST', '/api/storage/upload-hostel-image', manager, { fileType: 'image/jpeg', fileData: imageData }, 403);
  const uploaded = await request('POST', '/api/storage/upload-hostel-image', manager, { fileType: 'image/jpeg', fileData: imageData }, 200, key);
  await request('POST', '/api/board-requests', foreign, { hostelId: other.id, changes: { cover: uploaded.imageUrl } }, 400, foreignKey);
  const before = (await saved()).hostels;
  const submitted = await request('POST', '/api/board-requests', manager, { hostelId: hostel.id, changes: { cover: uploaded.imageUrl, gallery: [uploaded.imageUrl], name: change.changes.name, managerName: crypto.randomUUID(), managerPhone: '0302123456', managerPhoneCountry: 'GH', blocks: [{ id: hostel.blocksList[0].id, name: crypto.randomUUID() }, { name: crypto.randomUUID() }] } }, 200, key);
  assert.deepEqual((await saved()).hostels, before);
  assert.equal((await request('GET', '/api/board-requests', foreign, undefined, 200)).length, 0);
  await request('POST', '/api/board-requests', manager, change, 429, key);
  await request('POST', `/api/board-requests/${submitted.id}/decision`, admin, { decision: 'approve', approvalKey }, 409);
  await request('GET', `/api/board-requests/${submitted.id}/review`, manager, undefined, 403);
  const review = await request('GET', `/api/board-requests/${submitted.id}/review`, admin, undefined, 200);
  await request('POST', `/api/board-requests/${submitted.id}/decision`, admin, { decision: 'approve', approvalKey: settingsKey, reviewToken: review.reviewToken }, 403);
  await request('POST', `/api/board-requests/${submitted.id}/decision`, admin2, { decision: 'approve', approvalKey: approvalKey2, reviewToken: review.reviewToken }, 409);
  await request('POST', `/api/board-requests/${submitted.id}/decision`, admin, { decision: 'approve', approvalKey, reviewToken: review.reviewToken }, 200);
  const after = (await saved()).hostels.find((h: any) => h.id === hostel.id);
  assert.equal(after.imageUrl, uploaded.imageUrl); assert.deepEqual(after.gallery, [uploaded.imageUrl]); assert.equal(after.name, change.changes.name); assert.equal(after.managerPhone, '+233302123456'); assert.equal(after.totalCapacity, hostel.totalCapacity); assert.equal(after.availableSpaces, hostel.availableSpaces); assert.equal(after.managerId, manager.id); assert.equal(after.blocksList[0].totalRooms, 1); assert.equal(after.blocksList[1].totalRooms, 0); assert.deepEqual(after.facilities, hostel.facilities); assert.deepEqual(after.rules, hostel.rules);
  await request('POST', `/api/board-requests/${submitted.id}/decision`, admin, { decision: 'approve', approvalKey, reviewToken: review.reviewToken }, 409);
  const pending = await request('GET', '/api/admin-messages/pending', manager, undefined, 200); assert.equal(pending.length, 1); assert.equal(pending[0].type, 'success');
  await request('POST', `/api/admin-messages/${pending[0].id}/ack`, foreign, undefined, 404);
  await request('POST', `/api/admin-messages/${pending[0].id}/ack`, manager, undefined, 200);
  assert.equal((await request('GET', '/api/admin-messages/pending', manager, undefined, 200)).length, 0);
  assert((await request('GET', '/api/notifications', manager, undefined, 200)).some((n: any) => n.id === pending[0].id));
  const otherRequest = await request('POST', '/api/board-requests', foreign, { hostelId: other.id, changes: { name: crypto.randomUUID() } }, 200, foreignKey);
  const otherReview = await request('GET', `/api/board-requests/${otherRequest.id}/review`, admin, undefined, 200);
  await request('POST', `/api/board-requests/${otherRequest.id}/decision`, admin, { decision: 'reject', reason: '', approvalKey, reviewToken: otherReview.reviewToken }, 400);
  await request('POST', `/api/board-requests/${otherRequest.id}/decision`, admin, { decision: 'reject', reason: 'Incorrect information', approvalKey, reviewToken: otherReview.reviewToken }, 200);
  assert.equal((await saved()).hostels.find((h: any) => h.id === other.id).name, other.name);
  assert.equal((await request('GET', '/api/admin-messages/pending', foreign, undefined, 200))[0].type, 'error');
  // Both staff creation and room operations require the secret independently of UI controls.
  const staffBody = { name: crypto.randomUUID(), phone: '+233241234567', email: `${crypto.randomUUID()}@example.test`, password: crypto.randomBytes(20).toString('base64url'), hostelId: hostel.id };
  await request('POST', '/api/staff', manager, staffBody, 403);
  await request('POST', '/api/staff', foreign, staffBody, 403, foreignKey);
  await request('POST', '/api/staff', manager, staffBody, 201, key);
  await request('POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager, {}, 403);
  const rooms = await request('POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager, {}, 200, key); assert.equal(rooms.count, 1);
  const petition = await request('POST', '/api/manager/secret-key/petition', manager, { reason: 'Lost saved key' }, 200);
  await request('POST', '/api/manager/secret-key/petition', manager, { reason: 'Duplicate' }, 409);
  await request('POST', `/api/admin/managers/${manager.id}/reset-request-key`, admin, { settingsKey: approvalKey }, 403);
  await request('POST', `/api/admin/managers/${manager.id}/reset-request-key`, primary, { settingsKey }, 403);
  await request('POST', `/api/admin/managers/${manager.id}/reset-request-key`, admin, { settingsKey }, 200);
  await request('POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager, {}, 403, key);
  const replacement = (await request('POST', '/api/manager/secret-key/issue', manager, undefined, 200)).key; assert.notEqual(replacement, key);
  await stop(); await start();
  await request('POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager, {}, 403, key);
  assert.equal((await request('POST', `/api/hostels/${hostel.id}/generate-room-keys`, manager, {}, 200, replacement)).count, 0);
  await request('POST', '/api/board-requests', manager, change, 429, replacement);
  assert.equal((await saved()).managerKeyPetitions.find((p: any) => p.id === petition.id).status, 'Approved');
  assert(!(await fs.readFile(db, 'utf8')).includes(replacement));
});

test('S03: database updates cannot insert missing hostels or replace an existing ID', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s03-db-'));
  t.after(async () => { await fs.rm(temp, { recursive: true, force: true }); });
  const moduleUrl = pathToFileURL(path.join(project, 'localDb.ts')).href;
  const script = `
    import assert from 'node:assert/strict';
    import crypto from 'node:crypto';
    const { dbUpdateHostel, dbCreateHostel, dbGetHostels } = await import(${JSON.stringify(moduleUrl)});
    const missing = crypto.randomUUID();
    assert.equal(await dbUpdateHostel(missing, { name: crypto.randomUUID() }), null);
    assert.deepEqual(await dbGetHostels(), []);
    const hostel = await dbCreateHostel({ name: crypto.randomUUID() });
    const updated = await dbUpdateHostel(hostel.id, { id: crypto.randomUUID(), description: crypto.randomUUID() });
    assert.equal(updated.id, hostel.id);
    assert.equal((await dbGetHostels()).length, 1);
  `;
  await promisify(execFile)(process.execPath, ['--import', loader, '--input-type=module', '--eval', script], {
    cwd: temp, env: { ...process.env, NODE_ENV: 'test', PINEVELA_DATA_DIR: path.join(temp, 'data') }
  });
});
