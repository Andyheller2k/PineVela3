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

test('S09: room keys are residence-scoped and verification/activation attempts are private and limited across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s09-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  let child: ChildProcess | undefined;
  const stop = async () => {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    child = undefined;
  };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: crypto.randomUUID(), token: crypto.randomUUID() });
  const manager = { ...actor('manager'), isVerified: true, verificationStatus: 'approved' };
  const other = { ...actor('manager'), email: manager.email, isVerified: true, verificationStatus: 'approved' };
  const empty = { ...actor('manager'), isVerified: true, verificationStatus: 'approved' };
  const admin = actor('admin'), staff = { ...actor('staff'), hostelId: crypto.randomUUID() }, primary = actor('user');
  const rateUser = actor('user');
  const hostel = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, name: crypto.randomUUID(), isApproved: true, blocks: [{ name: 'A', totalRooms: 1, startNum: 101 }] };
  const foreign = { ...hostel, id: crypto.randomUUID(), managerId: other.id, name: hostel.name };
  const noKeys = { ...foreign, id: crypto.randomUUID(), name: crypto.randomUUID() };
  const room = { id: crypto.randomUUID(), hostelId: hostel.id, hostelName: hostel.name, blockName: 'A', roomNumber: 'A-101', roomKey: 'OWN-A-' + crypto.randomInt(100000, 1000000), isAssigned: false, status: 'Available', assignedStudentName: crypto.randomUUID(), assignedStudentEmail: 'private@example.test' };
  const foreignRoom = { ...room, id: crypto.randomUUID(), hostelId: foreign.id, roomKey: 'OTHER-A-' + crypto.randomInt(100000, 1000000) };
  const occupied = { ...room, id: crypto.randomUUID(), roomNumber: 'A-102', roomKey: 'USED-A-' + crypto.randomInt(100000, 1000000), isAssigned: true, status: 'Occupied' };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [manager, other, empty, admin, staff, primary, rateUser], hostels: [hostel, foreign, noKeys],
    roomKeys: [room, foreignRoom, occupied], staff: [{ id: crypto.randomUUID(), userId: staff.id, hostelId: hostel.id, managerId: manager.id, managerCreated: true, status: 'active' }]
  }));
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
  const request = async (method: string, route: string, token: string | undefined, body: any, status: number) => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    assert.equal(response.status, status, `${route}: expected ${status}`);
    if (status === 200 || status === 429) assert.equal(response.headers.get('cache-control'), 'private, no-store');
    if (status === 429) assert(Number(response.headers.get('retry-after')) > 0);
    return response.json();
  };
  const list = (actor: any, suffix = '', status = 200) => request('GET', '/api/room-keys' + suffix, actor?.token, undefined, status);
  const verify = (actor: any, key: any, status: number) => request('POST', '/api/room-keys/verify', actor?.token, { roomKey: key }, status);
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  await start();
  await list(undefined, '', 401); await list({ token: crypto.randomUUID() }, '', 401); await list(primary, '', 403);
  const before = await read();
  assert.deepEqual(await list(empty), []);
  await list(empty, `?hostelId=${hostel.id}`, 403);
  await list(manager, `?hostelId=${foreign.id}`, 403);
  await list(staff, `?hostelId=${foreign.id}`, 403);
  await list(staff, `?hostelId=${noKeys.id}`, 403);
  await list(manager, '?hostelId=', 400);
  const keys = await list(manager); assert.deepEqual(new Set(keys.map((r: any) => r.id)), new Set([room.id, occupied.id]));
  const staffKeys = await list(staff); assert.deepEqual(new Set(staffKeys.map((r: any) => r.id)), new Set([room.id, occupied.id]));
  assert((await list(staff, `?hostelId=${hostel.id}`)).every((r: any) => r.hostelId === hostel.id));
  assert.deepEqual((await read()).roomKeys, before.roomKeys, 'No cross-residence generation or mutation');
  await verify(undefined, room.roomKey, 401);
  for (const actor of [manager, staff, admin]) await verify(actor, room.roomKey, 403);
  const preview = await verify(primary, room.roomKey.toLowerCase(), 200);
  assert.equal(preview.roomKey, room.roomKey); assert.equal(preview.roomNumber, room.roomNumber);
  assert(!['managerId', 'managerEmail', 'managerPhone', 'assignedStudentName', 'assignedStudentEmail', 'assignedStudentId', 'id'].some(key => key in preview));
  const invalid = await verify(primary, 'WRONG-A-000000', 400);
  assert.deepEqual(await verify(primary, occupied.roomKey, 400), invalid);
  await verify(primary, {}, 400);
  assert.deepEqual((await read()).roomKeys, before.roomKeys, 'Verification reads do not generate foreign keys');
  for (let i = 0; i < 20; i++) await verify(rateUser, 'WRONG-A-000000', 400);
  await verify(rateUser, room.roomKey, 429);
  for (const route of ['/api/room-keys/claim', '/api/residents/onboard']) await request('POST', route, rateUser.token, { roomKey: room.roomKey }, 429);
  await stop(); await start();
  await verify(rateUser, room.roomKey, 429); assert.deepEqual(await list(empty), []);
  assert((await list(manager)).every((r: any) => r.hostelId === hostel.id));
  const all = await list(admin); assert(all.some((r: any) => r.hostelId === foreign.id));
  assert(all.some((r: any) => r.hostelId === noKeys.id));
  assert((await list(admin, `?hostelId=${foreign.id}`)).every((r: any) => r.hostelId === foreign.id));
  await stop();
  const inactive = await read(); inactive.staff[0].status = 'Suspended'; await fs.writeFile(db, sessionFixtureJson(inactive)); await start();
  await list(staff, '', 403);
});
