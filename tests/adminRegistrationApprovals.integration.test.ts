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
test('Registration approvals require actor-owned approval keys on every route and persist without storing keys', { timeout: 180000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-registration-approval-')), dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: `Isolated ${role}`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const admins = [actor('admin'), actor('admin')], primary = actor('user'), manager = { ...actor('manager'), parentUserId: primary.id };
  const keys = admins.map(() => crypto.randomBytes(32).toString('base64url')), settingsKey = crypto.randomBytes(32).toString('base64url');
  const hostel = { id: crypto.randomUUID(), name: 'Isolated registration residence', managerId: manager.id, managerEmail: manager.email, isApproved: false, approvalStatus: 'Pending Approval', status: 'Pending Approval', totalCapacity: 4, bedsLeft: 4 };
  const app = { id: crypto.randomUUID(), userId: primary.id, parentUserId: primary.id, studentEmail: primary.email, fullName: primary.name, storeName: 'Isolated registration market', status: 'pending' };
  const dossier = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, managerName: manager.name, parentUserId: primary.id, status: 'pending', propertyName: hostel.name, hostelId: hostel.id };
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((admin, index) => ({ id: admin.id, slot: index + 1, active: true, keyHash: crypto.createHash('sha256').update(`${admin.id}:${keys[index]}`).digest('hex'), settingsKeyHash: crypto.createHash('sha256').update(`settings:${admin.id}:${settingsKey}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} };
  const db = path.join(dataDir, 'pinevela_store.json');
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, manager], hostels: [hostel], digitalMarketApplications: [app], managerRegistrationRequests: [dossier], managerVerifications: [dossier], hostelVerifications: [{ id: crypto.randomUUID(), hostelId: hostel.id, status: 'under_admin_review' }], adminGovernance: governance }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined, logs = '';
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_MAIN_ADMIN_ID: admins[0].id }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', value => logs += value); child.stderr?.on('data', value => logs += value);
    for (let i = 0; i < 600; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(resolve => setTimeout(resolve, 100)); } assert.fail(logs);
  };
  const request = async (method: string, route: string, actor: any, body: any, status: number) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); const result = await response.json(); assert.equal(response.status, status, `${method} ${route}: ${result.error}`); return result;
  };
  await start();
  const before = JSON.parse(await fs.readFile(db, 'utf8'));
  const routes: [string, string, any][] = [
    ['PUT', `/api/manager-requests/${dossier.id}/approve`, {}], ['PUT', `/api/manager-verifications/${dossier.id}/approve`, {}],
    ['POST', '/api/admin/digital-market/approve-application', { id: app.id }], ['PUT', `/api/hostels/${hostel.id}/verify`, {}],
    ['PUT', `/api/hostel-verifications/${before.hostelVerifications[0].id}/approve`, {}], ['PUT', `/api/hostels/${hostel.id}`, { isApproved: true }],
    ['POST', '/api/hostels', { id: hostel.id }], ['PUT', `/API/hostels/${hostel.id}/verify/`, { status: 'rejected' }],
  ];
  for (const [method, route, body] of routes) { await request(method, route, null, body, 401); await request(method, route, primary, body, 403); }
  await request('POST', '/api/admin/digital-market/approve-application', manager, { id: app.id, privateKey: keys[0] }, 403);
  await request('POST', '/api/admin/digital-market/approve-application', admins[0], { id: app.id }, 403);
  await request('PUT', `/api/hostels/${hostel.id}/verify`, admins[0], { privateKey: keys[1], adminId: admins[1].id }, 403);
  await request('PUT', `/api/manager-requests/${dossier.id}/approve`, admins[0], { privateKey: settingsKey }, 403);
  const unchanged = JSON.parse(await fs.readFile(db, 'utf8')); assert.deepEqual(unchanged.hostels, before.hostels); assert.equal(unchanged.digitalMarketApplications[0].status, 'pending'); assert.equal(unchanged.managerRegistrationRequests[0].status, 'pending');
  await request('PUT', `/api/manager-requests/${dossier.id}/approve`, admins[0], { privateKey: keys[0], force: true }, 200);
  await request('POST', '/api/admin/digital-market/approve-application', admins[0], { id: app.id, privateKey: keys[0] }, 200);
  await request('PUT', `/api/hostels/${hostel.id}/verify`, admins[0], { privateKey: keys[0], status: 'Approved', isApproved: true }, 200);
  await stop(); await start();
  const saved = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(saved.digitalMarketApplications[0].status, 'approved'); assert.equal(saved.hostels.find((record: any) => record.id === hostel.id).isApproved, true);
  const directory = await request('GET', '/api/admin/all-users', admins[0], undefined, 200); assert.equal(directory.users.find((record: any) => record.id === manager.id).primaryAccountId, primary.id); assert.equal(directory.users.find((record: any) => record.role === 'merchant').primaryAccountId, primary.id);
  for (const key of [...keys, settingsKey]) { assert(!JSON.stringify(saved).includes(key)); assert(!logs.includes(key)); }
});
