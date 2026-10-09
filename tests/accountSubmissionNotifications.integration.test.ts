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
test('Primary submission inbox and Google profile isolation enforce ownership and persist across restart', { timeout: 180000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-registration-approval-')), dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, email: `${crypto.randomUUID()}@example.test`, name: `Isolated ${role}`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const admins = [actor('admin'), actor('admin')], primary = { ...actor('user'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() }, second = { ...actor('user'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() }, passwordUser = actor('user'), manager = { ...actor('manager'), parentUserId: primary.id };
  const keys = admins.map(() => crypto.randomBytes(32).toString('base64url')), settingsKey = crypto.randomBytes(32).toString('base64url');
  const hostel = { id: crypto.randomUUID(), name: 'Isolated registration residence', managerId: manager.id, managerEmail: manager.email, isApproved: false, approvalStatus: 'Pending Approval', status: 'Pending Approval', totalCapacity: 4, bedsLeft: 4 };
  const app = { id: crypto.randomUUID(), userId: primary.id, parentUserId: primary.id, studentEmail: primary.email, fullName: primary.name, storeName: 'Isolated registration market', status: 'pending' };
  const dossier = { id: crypto.randomUUID(), managerId: manager.id, managerEmail: manager.email, managerName: manager.name, parentUserId: primary.id, status: 'pending', propertyName: hostel.name, hostelId: hostel.id };
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((admin, index) => ({ id: admin.id, slot: index + 1, active: true, keyHash: crypto.createHash('sha256').update(`${admin.id}:${keys[index]}`).digest('hex'), settingsKeyHash: crypto.createHash('sha256').update(`settings:${admin.id}:${settingsKey}`).digest('hex') })), proposals: [], invitations: [], changes: [], attempts: {} };
  const db = path.join(dataDir, 'pinevela_store.json');
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, second, passwordUser, manager], hostels: [hostel], digitalMarketApplications: [app], managerRegistrationRequests: [dossier], managerVerifications: [dossier], hostelVerifications: [{ id: crypto.randomUUID(), hostelId: hostel.id, status: 'under_admin_review' }], adminGovernance: governance, managerRestrictions: [{ id: 'primary-restriction', parentUserId: primary.id, userEmail: manager.email, deletedManagerEmail: manager.email }], notifications: [
    { id: 'old-manager-submission', userId: manager.id, title: 'Manager Account Registered - Inspection Pending', message: 'Submission received', read: true },
    { id: 'old-dispatch', targetRole: 'manager', targetAccountId: manager.id, userId: manager.id, adminMessage: true, title: 'PineVela Verification Team Dispatched', message: 'Inspection dispatched', read: false },
    { id: 'manager-operation', targetRole: 'manager', targetAccountId: manager.id, title: 'Maintenance Issue Submitted', message: 'Operational alert' }
  ] }));
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
  const inbox = (who: any) => request('GET', '/api/notifications', who, undefined, 200);
  await request('GET', '/api/notifications', null, undefined, 401);
  await request('PUT', '/api/auth/profile', null, { avatar: 'preset:pine-classic' }, 401);
  const old = await inbox(primary);
  assert.deepEqual(old.map((n: any) => n.id).sort(), ['old-dispatch', 'old-manager-submission']);
  assert(old.every((n: any) => n.targetRole === 'user' && n.targetAccountId === primary.id && !n.read));
  assert.deepEqual(await inbox(second), []);
  await request('GET', '/api/notifications', manager, undefined, 403);
  await request('PUT', '/api/notifications/old-dispatch/read', second, {}, 403);
  await request('PUT', '/api/notifications/old-dispatch/read', manager, {}, 403);
  await request('POST', '/api/admin-messages/old-dispatch/ack', manager, {}, 403);
  assert((await request('GET', '/api/admin-messages/pending', primary, undefined, 200)).some((n: any) => n.id === 'old-dispatch'));
  await request('POST', '/api/admin-messages/old-dispatch/ack', primary, {}, 200);
  assert(!(await request('GET', '/api/admin-messages/pending', primary, undefined, 200)).some((n: any) => n.id === 'old-dispatch'));
  await request('PUT', '/api/notifications/old-dispatch/read', primary, {}, 200);
  assert((await inbox(primary)).find((n: any) => n.id === 'old-dispatch').read);

  // Real profile endpoints: body identity fields cannot update a different Google account.
  await request('PUT', '/api/auth/profile', primary, { avatar: 'preset:pine-forest', userId: second.id }, 200);
  assert.equal((await request('GET', '/api/auth/me', primary, undefined, 200)).avatar, 'preset:pine-forest');
  assert(!(await request('GET', '/api/auth/me', second, undefined, 200)).avatar);
  await request('PUT', '/api/auth/profile', second, { avatar: 'preset:pine-classic', userId: primary.id, profileId: primary.id }, 200);
  assert.equal((await request('GET', '/api/auth/me', primary, undefined, 200)).avatar, 'preset:pine-forest');
  await request('PUT', '/api/auth/profile', passwordUser, { avatar: 'preset:pine-classic' }, 200);

  // Exercise actual producers, including a campus seller email different from Google email.
  await request('PUT', `/api/manager-requests/${dossier.id}/approve`, admins[0], { privateKey: keys[0] }, 200);
  await request('POST', '/api/admin/digital-market/approve-application', admins[0], { id: app.id, privateKey: keys[0] }, 200);
  assert.deepEqual((await inbox(manager)).map((n: any) => n.id), ['manager-operation']);
  const own = await inbox(primary);
  for (const title of ['Manager Account Approved!', 'Student Merchant Application Approved! 🎉']) {
    const notice = own.find((n: any) => n.title === title); assert(notice, title);
    assert.equal(notice.targetAccountId, primary.id); assert.equal(notice.targetRole, 'user');
    await request('PUT', `/api/notifications/${notice.id}/read`, second, {}, 403);
    await request('PUT', `/api/notifications/${notice.id}/read`, manager, {}, 403);
  }
  const submission = await request('POST', '/api/digital-market/register', second, {
    fullName: second.name, university: 'Isolated institution', studentEmail: `${crypto.randomUUID()}@st.knust.edu.gh`,
    categoryToSell: 'Electronics', idNumber: 'ISOLATED-2026', password: 'Separate-campus-password!123', userId: primary.id, parentUserEmail: primary.email
  }, 201);
  assert.equal(submission.application.userId, second.id);
  const submitted = (await inbox(second)).find((n: any) => n.title === 'Digital Market Application Submitted');
  assert(submitted); assert.equal(submitted.targetAccountId, second.id);
  await request('POST', '/api/admin/digital-market/reject-application', admins[0], { id: submission.application.id, adminNotes: 'Update documents', privateKey: keys[0] }, 200);
  assert((await inbox(second)).some((n: any) => n.title === 'Digital Market Application Update'));
  assert(!(await inbox(primary)).some((n: any) => n.registrationId === submission.application.id));
  for (const [action, title] of [['reject', 'Manager Bypass Rejected'], ['approve', 'Manager Restriction Bypassed']]) {
    await request('POST', `/api/admin/manager-restrictions/primary-restriction/${action}`, admins[0], { adminNotes: 'Eligibility review' }, 200);
    const notice = (await inbox(primary)).find((n: any) => n.title === title);
    assert(notice, title); assert.equal(notice.targetAccountId, primary.id);
    await request('PUT', `/api/notifications/${notice.id}/read`, second, {}, 403);
    await request('PUT', `/api/notifications/${notice.id}/read`, manager, {}, 403);
  }
  await request('PUT', '/api/notifications/read-all', primary, {}, 200);
  assert((await inbox(primary)).every((n: any) => n.read));
  assert((await inbox(second)).every((n: any) => !n.read));
  await stop(); await start();
  assert((await inbox(primary)).every((n: any) => n.read));
  assert((await inbox(second)).every((n: any) => !n.read));
  assert.equal((await request('GET', '/api/auth/me', primary, undefined, 200)).avatar, 'preset:pine-forest');
  assert.equal((await request('GET', '/api/auth/me', second, undefined, 200)).avatar, 'preset:pine-classic');
  assert(!(await request('GET', '/api/admin-messages/pending', primary, undefined, 200)).some((n: any) => n.id === 'old-dispatch'));
});
