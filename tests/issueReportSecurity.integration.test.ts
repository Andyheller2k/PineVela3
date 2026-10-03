import { sessionFixtureJson } from './sessionFixtures.cjs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Disposable security-test identities use the real HTTP server and persistence;
// no application data, running deployment or authentication handler is mocked.
test('S02: real authenticated PUTs enforce issue ownership and persist only allowed details', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s02-'));
  const dataDir = path.join(temp, 'data');
  const db = path.join(dataDir, 'pinevela_store.json');
  const account = (role: string, email = `${crypto.randomUUID()}@example.test`) => ({ id: crypto.randomUUID(), role, ...(role === 'manager' ? { isVerified: true, verificationStatus: 'approved' } : {}), email, name: crypto.randomUUID(), token: crypto.randomUUID() });
  const owner = account('student');
  const other = account('student', owner.email);
  const primary = account('user');
  const manager = account('manager');
  const foreignManager = account('manager', manager.email);
  const staff = account('staff', owner.email);
  const merchant = account('merchant', owner.email);
  const admin = account('admin');
  const hostel = { id: crypto.randomUUID(), name: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email };
  const issue = {
    id: crypto.randomUUID(), userId: owner.id, parentUserId: primary.id,
    studentId: other.id, studentEmail: owner.email, hostelId: hostel.id,
    hostelName: hostel.name, managerId: foreignManager.id,
    title: crypto.randomUUID(), description: crypto.randomUUID(), photos: [],
    status: 'Pending', managerReviewed: false, assignedStaffId: staff.id,
    staffAccepted: false, staffCompleted: false, studentConfirmed: false,
    studentAcceptedResolved: false, closedByManager: false,
    createdAt: new Date().toISOString(), historyLogs: [{ action: 'Report Submitted' }]
  };
  const primaryIssue = { ...issue, id: crypto.randomUUID(), userId: primary.id, parentUserId: primary.id };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({
    credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [owner, other, primary, manager, foreignManager, staff, merchant, admin],
    staff: [{ id: crypto.randomUUID(), userId: staff.id, hostelId: hostel.id, managerId: manager.id, managerCreated: true, status: "Active" }],
    hostels: [hostel], issueReports: [issue, primaryIssue],
    digitalMarketApplications: [{ id: crypto.randomUUID(), studentEmail: merchant.email, status: 'approved' }],
    digitalMarketStores: [{ id: crypto.randomUUID(), studentEmail: merchant.email, status: 'active' }]
  }), { mode: 0o600 });
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], {
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
  const readIssue = async (id = issue.id) => JSON.parse(await fs.readFile(db, 'utf8')).issueReports.find((entry: any) => entry.id === id);
  const put = async (actor: typeof owner | undefined, body: any, expected: number, id = issue.id) => {
    const response = await fetch(`${base}/api/issue-reports/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, body: JSON.stringify(body)
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  };
  await start();
  const before = await readIssue();
  await put(undefined, { description: crypto.randomUUID() }, 401);
  await put({ ...owner, token: crypto.randomUUID() }, { description: crypto.randomUUID() }, 401);
  // Same email, alternate student ID, parent link and assigned staff are insufficient.
  for (const actor of [other, primary, foreignManager, staff, merchant]) {
    assert.equal((await fetch(`${base}/api/auth/me`, { headers: { Authorization: `Bearer ${actor.token}` } })).status, 200);
    await put(actor, { description: crypto.randomUUID() }, 403);
    await put(actor, { userId: actor.id, status: 'Resolved' }, 403);
    assert.deepEqual(await readIssue(), before);
  }
  const protectedFields = ['id', 'userId', 'creatorId', 'parentUserId', 'parentUserEmail', 'studentId', 'studentName', 'studentEmail', 'hostelId', 'hostelName', 'roomKey', 'roomNumber', 'managerId', 'managerEmail', 'assignedStaffId', 'staffEmail', 'staffName', 'status', 'managerReviewed', 'staffAccepted', 'staffCompleted', 'studentConfirmed', 'studentAcceptedResolved', 'closedByManager', 'createdAt', 'updatedAt', 'closedAt', 'deadline', 'historyLogs', '__proto__', 'constructor', 'arbitraryField'];
  for (const actor of [owner, manager, admin]) {
    for (const field of protectedFields) {
      await put(actor, { description: crypto.randomUUID(), [field]: crypto.randomUUID() }, 400);
      assert.deepEqual(await readIssue(), before);
    }
  }
  for (const body of [{}, [], { photos: [{}] }, { description: {} }]) {
    await put(owner, body, 400);
    assert.deepEqual(await readIssue(), before);
  }
  await put(owner, { title: crypto.randomUUID() }, 404, crypto.randomUUID());
  let expected = before;
  for (const actor of [owner, manager, admin]) {
    const description = crypto.randomUUID();
    const result = await put(actor, { description }, 200);
    expected = { ...expected, description, updatedAt: result.updatedAt, historyLogs: [...expected.historyLogs, result.historyLogs.at(-1)] };
    assert.deepEqual(result, expected);
    assert.deepEqual(await readIssue(), expected);
    assert.equal(result.historyLogs.at(-1).actorId, actor.id);
    assert.equal(result.historyLogs.at(-1).actorRole, actor.role);
  }
  await put(primary, { description: crypto.randomUUID() }, 200, primaryIssue.id);
  await stop(); await start();
  assert.deepEqual(await readIssue(), expected);
  await put(other, { description: crypto.randomUUID() }, 403);
  await put(owner, { studentConfirmed: true, status: 'Resolved' }, 400);
  assert.deepEqual(await readIssue(), expected);
  await put(owner, { contactMethod: 'In-app Notification', visitWindow: '', photos: [] }, 200);
});
