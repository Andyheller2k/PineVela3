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
import { accountData, accountId, hashCredential } from '../accountSecurity.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;
test('S06: all manager registration paths require admin approval; stale sessions, sibling approval and property self-approval are blocked across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-manager-approval-'));
  const dataDir = path.join(temp, 'data'); const db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: crypto.randomUUID(), token: crypto.randomUUID(), password: hashCredential(crypto.randomUUID()) });
  const primary = actor('user'); const admin = actor('admin');
  const stale = { ...actor('manager'), parentUserId: primary.id, parentUserEmail: primary.email, isVerified: true, verificationStatus: 'approved' };
  const sibling = { ...actor('manager'), parentUserId: primary.id, parentUserEmail: primary.email, isVerified: false, verificationStatus: 'pending' };
  const pending = { id: crypto.randomUUID(), managerId: stale.id, managerEmail: stale.email, managerName: stale.name, parentUserId: primary.id, parentUserEmail: primary.email, status: 'pending', propertyName: 'Isolated pending property' };
  const siblingRecord = { ...pending, id: crypto.randomUUID(), managerId: sibling.id, managerEmail: sibling.email };
  const unrelatedHostel = { id: crypto.randomUUID(), name: 'Isolated pending property', managerId: sibling.id, managerEmail: sibling.email, isApproved: false, approvalStatus: 'Pending Approval', subscriptionPaid: false };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [primary, admin, stale, sibling], hostels: [unrelatedHostel], managerRegistrationRequests: [pending, siblingRecord], managerVerifications: [{ ...pending, id: crypto.randomUUID() }, { ...siblingRecord, id: crypto.randomUUID() }] }));
  let child: ChildProcess | undefined;
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let i = 0; i < 150; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
      if (child.exitCode !== null) assert.fail(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Server failed to start: ${logs}`);
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const request = async (method: string, route: string, token: string | undefined, body: any, status: number) => {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, status, `${route}: ${data.error || 'Unexpected status'}`); return data;
  };
  await start();
  const initial = await read();
  await request('POST', '/api/hostels/register', stale.token, { name: 'Unauthorized' }, 403);
  await request('PUT', `/api/hostels/${unrelatedHostel.id}`, stale.token, { name: 'Unauthorized' }, 403);
  await request('GET', '/api/manager/account-settings', stale.token, undefined, 403);
  await request('POST', '/api/manager-requests', undefined, { propertyName: 'Unauthorized', status: 'approved' }, 401);
  // A primary account cannot borrow manager authority through an approved matching email dossier.
  await request('POST', '/api/hostels/register', primary.token, { name: 'Unauthorized' }, 403);
  const ownRequests = await request('GET', '/api/manager-requests', stale.token, undefined, 200);
  assert(ownRequests.every((r: any) => r.managerId === stale.id));
  assert.deepEqual((await read()).hostels, initial.hostels);
  const registrations: { email: string; password: string; id: string; verificationId: string }[] = [];
  for (const [index, route] of ['/api/auth/register-manager', '/api/users/register', '/api/auth/register-manager-account', '/api/manager-verifications/submit'].entries()) {
    const email = `manager-${index}-${crypto.randomUUID()}@residence.example.test`;
    const password = `Isolated-manager-${index}-${crypto.randomUUID()}!`;
    const body = { role: 'manager', managerName: 'Isolated Manager', name: 'Isolated Manager', managerEmail: email, email, password, managerPhone: '+233240000001', phone: '+233240000001', hostelName: 'Isolated pending property', location: 'Kumasi KNUST Ayeduase', address: 'Kumasi KNUST Ayeduase', knustAccreditedConfirmed: true, totalCapacity: 12, nationalId: crypto.randomUUID(), parentUserId: sibling.id, isApproved: true, approvalStatus: 'Approved', subscriptionPaid: true, isVerified: true, documentsVerified: { idFront: 'verified', idBack: 'verified', operatingCertificate: 'verified' } };
    await request('POST', route, undefined, body, 401);
    const created = await request('POST', route, primary.token, body, 201);
    assert.equal(created.user.role, 'manager'); assert.equal(created.user.isVerified, false);
    assert.equal(created.user.verificationStatus, 'pending'); assert(!created.token && !created.user.token && !created.hostel);
    assert.equal(created.user.parentUserId, primary.id);
    const disk = await read(); assert.deepEqual(disk.hostels, initial.hostels);
    const record = disk.managerVerifications.find((v: any) => v.managerId === created.user.id);
    assert.equal(record.status, 'pending');
    const stored = disk.users.find((u: any) => accountId(u) === created.user.id);
    assert(!stored.token && !accountData(stored).token);
    await request('POST', '/api/auth/login', undefined, { usernameOrEmail: email, password }, 403);
    assert(!accountData((await read()).users.find((u: any) => accountId(u) === created.user.id)).token);
    registrations.push({ email, password, id: created.user.id, verificationId: record.id });
  }
  // The existing manager's primary owner can submit more information without changing its ID.
  const first = registrations[0];
  const resubmitted = await request('POST', '/api/manager-verifications/submit', primary.token, { managerName: 'Isolated Manager', managerEmail: first.email, managerPhone: '+233240000001', location: 'Kumasi KNUST Ayeduase', hostelName: 'Isolated pending property', knustAccreditedConfirmed: true }, 201);
  assert.equal(resubmitted.user.id, first.id); assert(!resubmitted.user.token);
  const stranger = registrations[1];
  await request('PUT', `/api/manager-verifications/${first.verificationId}/approve`, primary.token, {}, 403);
  await request('PUT', `/api/manager-requests/${pending.id}/approve`, undefined, {}, 401);
  const approved = await request('PUT', `/api/manager-verifications/${first.verificationId}/approve`, admin.token, {}, 200);
  assert(approved.success);
  let disk = await read();
  assert.equal(accountData(disk.users.find((u: any) => accountId(u) === primary.id)).role, 'user');
  assert.equal(accountData(disk.users.find((u: any) => accountId(u) === stranger.id)).isVerified, false);
  assert.equal(disk.managerVerifications.find((v: any) => v.managerId === stranger.id).status, 'pending');
  assert.deepEqual(disk.hostels, initial.hostels);
  await request('POST', '/api/auth/login', undefined, { usernameOrEmail: stranger.email, password: stranger.password }, 403);
  let login = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: first.email, password: first.password }, 200);
  let managerToken = (login.user || login).token;
  await request('GET', '/api/manager/account-settings', managerToken, undefined, 200);
  const propertyBody = { name: 'Isolated new property', location: 'Kumasi KNUST Ayeduase', totalCapacity: 12, isApproved: true, approvalStatus: 'Approved', subscriptionPaid: true, managerId: sibling.id, managerEmail: sibling.email, status: 'Open' };
  await request('POST', '/api/hostels/register', managerToken, { ...propertyBody, id: unrelatedHostel.id }, 409);
  const property = await request('POST', '/api/hostels/register', managerToken, propertyBody, 201);
  assert.equal(property.hostel.managerId, first.id); assert.equal(property.hostel.isApproved, false);
  assert.equal(property.hostel.approvalStatus, 'Pending Approval'); assert.equal(property.hostel.subscriptionPaid, false);
  disk = await read(); assert.equal(disk.hostels.find((h: any) => h.id === unrelatedHostel.id).isApproved, false);
  assert(disk.hostelVerifications.filter((v: any) => v.hostelId === property.hostel.id).every((v: any) => v.paymentStatus !== 'paid'));
  await stop(); await start();
  login = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: first.email, password: first.password }, 200);
  managerToken = (login.user || login).token;
  await request('GET', '/api/manager/account-settings', managerToken, undefined, 200);
  await request('POST', '/api/hostels/register', stale.token, propertyBody, 403);
  // Existing session loses manager operation access immediately after administrative blocking.
  await request('PUT', `/api/manager-verifications/${first.verificationId}/block`, admin.token, { reason: 'Isolated revocation test' }, 200);
  await request('GET', '/api/manager/account-settings', managerToken, undefined, 403);
  await stop(); await start();
  await request('GET', '/api/manager/account-settings', managerToken, undefined, 403);
});
