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

// Real authentication, HTTP handlers and storage in a disposable private database.
test('S03: hostel takeover and self-approval are blocked; legitimate edits and transfers persist', { timeout: 180000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s03-'));
  const dataDir = path.join(temp, 'data');
  const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const email = `${crypto.randomUUID()}@example.test`;
  const account = (role: string) => ({ id: crypto.randomUUID(), role, ...(role === 'manager' ? { isVerified: true, verificationStatus: 'approved' } : {}), email, name: crypto.randomUUID(), token: crypto.randomUUID() });
  const manager = account('manager');
  const foreign = { ...account('manager'), name: manager.name };
  const primary = account('user');
  const staff = account('staff');
  const student = account('student');
  const merchant = account('merchant');
  const admin = account('admin');
  const privateKey = crypto.randomBytes(32).toString('base64url');
  const hostel = { id: crypto.randomUUID(), name: crypto.randomUUID(), description: crypto.randomUUID(), managerId: manager.id, assignedManagerId: manager.id, managerEmail: email, managerName: manager.name, isApproved: false, approvalStatus: 'Pending Approval', status: 'Pending Approval', price: 1200, totalCapacity: 20, bedsLeft: 20, availableSpaces: 20, blocksList: [], facilities: [], registrationDate: new Date().toISOString() };
  const otherHostel = { ...hostel, id: crypto.randomUUID(), name: crypto.randomUUID(), managerId: foreign.id, assignedManagerId: foreign.id };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({
    credentialExposureVersion: 1, accountSecurityVersion: 1,
    adminGovernance: { version: 1, mainId: admin.id, revision: 1, members: [{ id: admin.id, slot: 1, active: true, keyHash: crypto.createHash('sha256').update(`${admin.id}:${privateKey}`).digest('hex') }], proposals: [], invitations: [], changes: [], attempts: {} }, users: [manager, foreign, primary, staff, student, merchant, admin],
    staff: [{ id: crypto.randomUUID(), userId: staff.id, hostelId: hostel.id, managerId: manager.id, managerCreated: true, status: "Active" }],
    hostels: [hostel, otherHostel],
    managerVerifications: [manager, foreign].map(u => ({ id: crypto.randomUUID(), managerId: u.id, managerEmail: email, status: 'approved' })),
    digitalMarketApplications: [{ id: crypto.randomUUID(), studentEmail: email, status: 'approved' }],
    digitalMarketStores: [{ id: crypto.randomUUID(), studentEmail: email, status: 'active' }]
  }), { mode: 0o600 });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], {
      cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe']
    });
    child.stdout?.on('data', data => { logs += data; });
    child.stderr?.on('data', data => { logs += data; });
    for (let attempt = 0; attempt < 150; attempt++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting. */ }
      if (child.exitCode !== null) assert.fail(`Test server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Test server failed to start: ${logs}`);
  };
  const readHostels = async () => JSON.parse(await fs.readFile(db, 'utf8')).hostels;
  const put = async (actor: typeof manager | undefined, body: any, status: number, id = hostel.id, suffix = '') => {
    const response = await fetch(`${base}/api/hostels/${id}${suffix}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: JSON.stringify(body)
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  };
  await start();
  const before = await readHostels();
  await put(undefined, { description: crypto.randomUUID() }, 401);
  await put({ ...manager, token: crypto.randomUUID() }, { description: crypto.randomUUID() }, 401);
  for (const actor of [foreign, primary, staff, student, merchant]) {
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${actor.token}` } })).status, 200);
    await put(actor, { description: crypto.randomUUID() }, 403);
    await put(actor, { managerId: actor.id, assignedManagerId: actor.id, isApproved: true, approvalStatus: 'Approved' }, 403);
    assert.deepEqual(await readHostels(), before);
  }
  const protectedFields = ['managerId', 'assignedManagerId', 'managerEmail', 'managerName', 'managerPhone', 'managerPhoto', 'ownerId', 'ownerEmail', 'isApproved', 'approvalStatus', 'status', 'isLive', 'isBlocked', 'isDeleted', 'subscriptionPaid', 'rating', 'registrationDate', 'verifiedAt', 'adminNotes', 'updatedAt', 'constructor', '__proto__', 'arbitraryField'];
  for (const field of protectedFields) {
    await put(manager, { description: crypto.randomUUID(), [field]: crypto.randomUUID() }, 400);
    assert.deepEqual(await readHostels(), before);
  }
  for (const actor of [manager, admin]) {
    await put(actor, { id: crypto.randomUUID(), name: crypto.randomUUID() }, 400);
    await put(actor, { name: crypto.randomUUID() }, 404, crypto.randomUUID());
    assert.deepEqual(await readHostels(), before);
  }
  for (const body of [{}, [], { price: -1 }, { latitude: 91 }, { facilities: [{}] }, { rules: [] }]) {
    await put(manager, body, 400);
    assert.deepEqual(await readHostels(), before);
  }
  const patch = { description: crypto.randomUUID(), price: 1400, facilities: ['Wi-Fi'], blocksList: [], rules: { curfew: '' }, latitude: null };
  const edited = await put(manager, patch, 200);
  assert.deepEqual(edited, { ...before[0], ...patch, updatedAt: edited.updatedAt });
  assert.deepEqual((await readHostels())[0], edited);
  assert.deepEqual((await readHostels())[1], before[1]);
  await put(manager, { status: 'Approved', isApproved: true }, 403, hostel.id, '/verify');
  // Preserve the administrator editor's full-record save flow, including approval.
  const approved = await put(admin, { ...edited, privateKey, isApproved: true, approvalStatus: 'Approved', status: 'Open' }, 200);
  assert.equal(approved.isApproved, true);
  assert.equal(approved.id, hostel.id);
  assert.deepEqual((await readHostels())[0], approved);
  // Dedicated administrator verification remains functional.
  await put(admin, { status: 'Approved', isApproved: true, privateKey }, 200, hostel.id, '/verify');
  const transferred = await put(admin, { managerId: foreign.id }, 200);
  assert.equal(transferred.managerId, foreign.id);
  assert.equal(transferred.assignedManagerId, foreign.id);
  await put(manager, { description: crypto.randomUUID() }, 403);
  assert.deepEqual((await readHostels())[0], transferred);
  await put(foreign, { description: crypto.randomUUID() }, 200);
  const persisted = await readHostels();
  await stop(); await start();
  assert.deepEqual(await readHostels(), persisted);
  await put(manager, { isApproved: true }, 403);
  await put(foreign, { approvalStatus: 'Approved' }, 403);
  assert.deepEqual(await readHostels(), persisted);
  await put(foreign, { description: crypto.randomUUID() }, 200);
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
