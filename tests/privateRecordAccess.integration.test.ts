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
import { hashCredential } from '../accountSecurity.js';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S08: verification lists are private, officers are assigned, and resident directories are residence-scoped across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s08-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: crypto.randomUUID(), email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID() });
  const admin = actor('admin'), user = actor('user');
  const manager = { ...actor('manager'), isVerified: true, verificationStatus: 'approved' };
  const foreignManager = { ...actor('manager'), email: manager.email, isVerified: true, verificationStatus: 'approved' };
  const pendingManager = { ...actor('manager'), isVerified: false, verificationStatus: 'pending' };
  const officer = () => ({ ...actor('verification_team'), officerId: crypto.randomUUID(), fullName: crypto.randomUUID(), status: 'active' });
  const assigned = officer(), other = officer(), empty = officer(), inactive = { ...officer(), status: 'inactive' }, stale = officer();
  const staleSession = { ...stale, token: crypto.randomUUID() };
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, name: crypto.randomUUID(), isApproved: true };
  const foreignHostel = { ...hostel, id: crypto.randomUUID(), managerId: foreignManager.id, name: crypto.randomUUID() };
  const member = (hostelId: string) => {
    const resident = { ...actor('student'), roomKey: crypto.randomUUID(), hostelId, studentId: crypto.randomUUID() };
    const room = { id: crypto.randomUUID(), roomKey: resident.roomKey, hostelId, isAssigned: true, assignedStudentId: resident.id, assignedStudentEmail: resident.email, studentName: resident.name, roomNumber: crypto.randomUUID(), blockName: crypto.randomUUID() };
    return { resident, room };
  };
  const own = member(hostel.id), foreign = member(foreignHostel.id);
  const unassignedRoom = { ...member(hostel.id).room, isAssigned: false };
  const unallocated = { ...actor('resident'), hostelId: hostel.id };
  const forgedLink = { ...actor('resident'), roomKey: own.resident.roomKey, hostelId: foreignHostel.id };
  const staff = actor('staff');
  const verification = { id: crypto.randomUUID(), managerId: crypto.randomUUID(), managerEmail: manager.email, managerPhone: crypto.randomUUID(), hostelName: hostel.name, assignedOfficerId: assigned.id, inspectionStatus: 'dispatched', status: 'pending' };
  const otherVerification = { ...verification, id: crypto.randomUUID(), assignedOfficerId: other.id };
  const legacy = { ...verification, id: crypto.randomUUID(), assignedOfficerId: assigned.officerId };
  const noAssignment = { ...verification, id: crypto.randomUUID(), assignedOfficerId: undefined, inspectionStatus: 'pending_dispatch', inspectionReport: { officerId: assigned.id } };
  const inspection = { id: crypto.randomUUID(), managerVerificationId: verification.id, managerEmail: manager.email, assignedOfficerId: assigned.id, assignedOfficerEmail: other.email, status: 'approved', report: { officerId: other.id }, password: hashCredential(crypto.randomUUID()) };
  const otherInspection = { ...inspection, id: crypto.randomUUID(), managerVerificationId: otherVerification.id, assignedOfficerId: other.id, assignedOfficerEmail: assigned.email, report: { officerId: assigned.id } };
  const conflict = { ...inspection, id: crypto.randomUUID(), managerVerificationId: otherVerification.id };
  const unassigned = { ...inspection, id: crypto.randomUUID(), managerVerificationId: noAssignment.id, assignedOfficerId: undefined, assignedOfficerEmail: assigned.email, report: { officerId: assigned.id } };
  const hostelVerification = { id: crypto.randomUUID(), hostelId: hostel.id, managerId: manager.id, ownershipDocuments: [crypto.randomUUID()], managerPhone: crypto.randomUUID(), adminNotes: crypto.randomUUID(), token: crypto.randomUUID() };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [admin, user, manager, foreignManager, pendingManager, own.resident, foreign.resident, unallocated, forgedLink, staleSession, staff],
    hostels: [hostel, foreignHostel], roomKeys: [own.room, foreign.room, unassignedRoom],
    staff: [{ id: crypto.randomUUID(), userId: staff.id, managerId: manager.id, hostelId: hostel.id, managerCreated: true, status: 'active' }],
    verificationTeams: [assigned, other, empty, inactive, stale],
    verificationInspections: [inspection, otherInspection, conflict, unassigned],
    managerVerifications: [verification, otherVerification, legacy, noAssignment], hostelVerifications: [hostelVerification]
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
  const routes = ['/api/admin/verification-inspections', '/api/verification-inspections', '/api/verification-team/my-inspections', '/api/hostel-verifications', '/api/registered-residents', '/api/public/registered-residents'];
  const get = async (route: string, token: string | undefined, status: number) => {
    const response = await fetch(`${base}${route}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(response.status, status, `${route}: unexpected HTTP status`);
    if (status === 200) assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const data = await response.json();
    if (status !== 200) assert(!Array.isArray(data), 'Denied requests must not contain record lists');
    return data;
  };
  await start();
  const disk = JSON.parse(await fs.readFile(db, 'utf8'));
  for (const route of routes) {
    await get(route, undefined, 401); await get(route, crypto.randomUUID(), 401);
    for (const actor of [user, own.resident, staff]) await get(route, actor.token, 403);
    await get(route, pendingManager.token, 403);
  }
  for (const route of [routes[0], routes[1], routes[3]]) {
    for (const actor of [manager, foreignManager, assigned]) await get(route, actor.token, 403);
    const records = await get(route, admin.token, 200);
    assert(records.some((record: any) => record.id === (route === routes[3] ? hostelVerification.id : inspection.id)));
    assert(!JSON.stringify(records).includes('"password"')); assert(!JSON.stringify(records).includes('"token"'));
  }
  const officerRoute = routes[2];
  for (const actor of [admin, manager, inactive, staleSession]) await get(officerRoute, actor.token, 403);
  const spoof = `${officerRoute}?officerId=${other.id}&email=${encodeURIComponent(other.email)}`;
  await get(spoof, undefined, 401);
  for (const route of [officerRoute, spoof]) {
    const records = await get(route, assigned.token, 200);
    assert.deepEqual(new Set(records.map((record: any) => record.id)), new Set([inspection.id, `insp-${legacy.id}`]));
    assert(records.every((record: any) => record.assignedOfficerId === assigned.id || record.assignedOfficerId === assigned.officerId));
  }
  assert.deepEqual(await get(officerRoute, empty.token, 200), []);
  assert.deepEqual((await get(officerRoute, other.token, 200)).map((record: any) => record.id), [otherInspection.id]);
  for (const route of routes.slice(4)) {
    const all = await get(route, admin.token, 200);
    assert.deepEqual(new Set(all.map((r: any) => r.id)), new Set([own.resident.id, foreign.resident.id]));
    const mine = await get(`${route}?hostelId=${foreignHostel.id}&managerId=${foreignManager.id}&userId=${admin.id}`, manager.token, 200);
    assert.deepEqual(mine.map((r: any) => r.id), [own.resident.id]);
    assert.deepEqual((await get(route, foreignManager.token, 200)).map((r: any) => r.id), [foreign.resident.id]);
    assert.equal(mine[0].roomNumber, own.room.roomNumber);
    assert(!('email' in mine[0]) && !('roomKey' in mine[0]) && !('password' in mine[0]));
  }
  assert.deepEqual(JSON.parse(await fs.readFile(db, 'utf8')), disk, 'Read routes must not rewrite assignments or operational data');
  await stop(); await start();
  await get(routes[0], undefined, 401);
  assert.deepEqual((await get(officerRoute, assigned.token, 200)).map((r: any) => r.id), [inspection.id, `insp-${legacy.id}`]);
  assert.deepEqual((await get(routes[4], manager.token, 200)).map((r: any) => r.id), [own.resident.id]);
  // A revoked/suspended officer must lose list access even if a copied user token survives.
  await stop();
  const updated = JSON.parse(await fs.readFile(db, 'utf8'));
  updated.users.push({ ...assigned });
  updated.verificationTeams.find((o: any) => o.id === assigned.id).status = 'inactive';
  await fs.writeFile(db, sessionFixtureJson(updated)); await start();
  await get(officerRoute, assigned.token, 403);
});
