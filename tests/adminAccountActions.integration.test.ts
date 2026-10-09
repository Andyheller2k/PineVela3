import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { managerKeyHash } from '../residenceRequests.js';
import { sessionFixtureJson } from './sessionFixtures.cjs';

test('real HTTP: isolated gateway delivery, camera complaints, keyed hostel deletion and durable registration bans', { timeout: 120000 }, async t => {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-admin-actions-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir); const db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: `Isolated ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const admins = Array.from({ length: 3 }, () => actor('admin')), keys = admins.map(() => crypto.randomBytes(32).toString('base64url'));
  const primary = { ...actor('user'), emailVerificationProvider: 'supabase-google', supabaseUserId: crypto.randomUUID() }, other = actor('user');
  const manager = { ...actor('manager'), parentUserId: primary.id }, foreign = { ...actor('manager'), parentUserId: other.id, password: crypto.createHash('sha256').update('Retained-manager-login!234').digest('hex') };
  const managerKeys: Record<string, string> = { [manager.id]: crypto.randomBytes(32).toString('base64url'), [foreign.id]: crypto.randomBytes(32).toString('base64url') };
  const homes = [1, 2, 3].map((i) => ({ id: crypto.randomUUID(), name: `Isolated property ${i}`, managerId: i < 3 ? manager.id : foreign.id, managerEmail: i < 3 ? manager.email : foreign.email, isApproved: true, status: 'Approved' }));
  const resident = { ...actor('student'), roomKey: crypto.randomUUID(), hostelId: homes[0].id, parentUserId: primary.id }, second = { ...actor('resident'), email: primary.email, roomKey: crypto.randomUUID(), hostelId: homes[1].id, parentUserId: primary.id };
  const room = (u: any) => ({ id: crypto.randomUUID(), roomKey: u.roomKey, hostelId: u.hostelId, hostelName: homes.find(h => h.id === u.hostelId)?.name, isAssigned: true, assignedStudentId: u.id, assignedStudentEmail: u.email, studentEmail: u.email, studentId: u.id, roomNumber: '4', blockName: 'C' });
  const staff = actor('staff'), app = { id: crypto.randomUUID(), studentEmail: 'actual-seller@example.test', userId: primary.id, status: 'approved' };
  const seller = { ...actor('merchant'), id: `merchant:${app.id}`, email: app.studentEmail }, market = { id: crypto.randomUUID(), studentEmail: app.studentEmail, userId: primary.id, status: 'active', subscriptionExpiry: '2099-01-01' };
  const governance = { version: 1, mainId: admins[0].id, revision: 1, members: admins.map((admin, i) => ({ id: admin.id, slot: i + 1, active: true, keyHash: crypto.createHash('sha256').update(`${admin.id}:${keys[i]}`).digest('hex') })), proposals: [], changes: [], invitations: [], attempts: {} };
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, other, manager, foreign, resident, second, staff, seller], hostels: homes,
    roomKeys: [room(resident), room(second)], staff: [{ id: crypto.randomUUID(), userId: staff.id, hostelId: homes[0].id, managerId: manager.id, status: 'active', managerCreated: true }],
    managerOperationKeys: Object.fromEntries(Object.entries(managerKeys).map(([id, key]) => [id, { hash: managerKeyHash(id, key) }])), digitalMarketApplications: [app], digitalMarketStores: [market], adminGovernance: governance }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`, root = '/api/admin/governance/residences'; let child: ChildProcess | undefined, logs = '';
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_MAIN_ADMIN_ID: admins[0].id, PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'recovery'), PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let i = 0; i < 300; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); } assert.fail(logs);
  };
  const request = async (method: string, route: string, who: any, body?: any, status = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${who.token}`, ...(who.role === 'manager' ? { 'X-PineVela-Manager-Key': managerKeys[who.id] } : {}) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert.equal(response.status, status, `${method} ${route}: ${result.error}`); return result;
  };
  const post = (route: string, who: any, body: any, status = 200) => request('POST', route, who, body, status), inbox = (who: any) => request('GET', '/api/notifications', who), popups = (who: any) => request('GET', '/api/admin-messages/pending', who);
  const disk = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  await start();
  await request('GET', '/api/admin/messages/accounts', undefined, undefined, 401); await request('GET', '/api/admin/messages/accounts', primary, undefined, 403);
  const directory = await request('GET', '/api/admin/messages/accounts', admins[0]);
  assert(directory.some((a: any) => a.id === seller.id)); assert(!JSON.stringify(directory).includes('tokenHash')); assert(!directory.some((a: any) => a.role === 'admin'));
  const managerSelection = { groups: ['managers'], accounts: [{ role: 'manager', id: manager.id }] };
  const delivery = await post('/api/admin/messages/preview', admins[0], managerSelection); assert.equal(delivery.count, 2);
  await post('/api/admin/messages', undefined, {}, 401); await post('/api/admin/messages', primary, {}, 403);
  await post('/api/admin/messages/preview', admins[0], { groups: ['admin'], accounts: [] }, 400);
  await post('/api/admin/messages/preview', admins[0], { groups: [], accounts: [{ role: 'manager', id: primary.id }] }, 400);
  const message = { ...managerSelection, fingerprint: delivery.fingerprint, title: 'Manager Account Approved!', message: 'Gateway targets must stay independent of submission notices.', type: 'info' };
  await post('/api/admin/messages', admins[0], { ...message, fingerprint: crypto.randomBytes(32).toString('hex') }, 409);
  const receipt = await post('/api/admin/messages', admins[0], message); assert.equal(receipt.count, 2);
  const notices = (await inbox(manager)).filter((n: any) => n.batchId === receipt.batchId); assert.equal(notices.length, 1); const notice = notices[0];
  for (const who of [primary, resident, second, staff, seller, other]) assert(!(await inbox(who)).some((n: any) => n.batchId === receipt.batchId));
  assert((await popups(manager)).some((n: any) => n.id === notice.id));
  await post(`/api/admin-messages/${notice.id}/ack`, primary, {}, 404);
  await post(`/api/admin-messages/${notice.id}/ack`, manager, {}); assert(!(await popups(manager)).some((n: any) => n.id === notice.id));
  assert((await inbox(manager)).some((n: any) => n.id === notice.id));
  for (const [group, recipients] of [['users', [primary, other]], ['residents', [resident, second]], ['staff', [staff]], ['marketers', [seller]]] as const) {
    const selection = { groups: [group], accounts: [] }, preview = await post('/api/admin/messages/preview', admins[1], selection);
    const sent = await post('/api/admin/messages', admins[1], { ...selection, fingerprint: preview.fingerprint, title: `Announcement for ${group}`, message: 'Actual isolated account delivery.', type: 'success' });
    assert.equal(sent.count, recipients.length);
    for (const who of [primary, other, manager, foreign, resident, second, staff, seller]) assert.equal((await inbox(who)).some((n: any) => n.batchId === sent.batchId), (recipients as readonly any[]).includes(who), `${group}: ${who.role}`);
  }
  // Camera mini-form uses only details; all identity and location are resolved by the server.
  await post('/api/issue-reports', undefined, { title: 'No session' }, 401);
  await post('/api/issue-reports', other, { title: 'No activated room', hostelId: homes[0].id }, 403);
  await post('/api/issue-reports', resident, { title: 'Wrong property', hostelId: homes[2].id }, 403);
  await post('/api/issue-reports', foreign, { title: 'Wrong manager', hostelId: homes[0].id }, 403);
  const photograph = (await fs.readFile(path.join(project, 'assets/pinevela-day.webp'))).toString('base64');
  const complaint = await post('/api/issue-reports', resident, { title: 'Captured maintenance issue', photos: [`data:image/webp;base64,${photograph}`], studentId: other.id, studentName: 'Spoofed', userId: other.id }, 201);
  assert.equal(complaint.description, ''); assert.equal(complaint.studentId, resident.id); assert.equal(complaint.userId, resident.id); assert.equal(complaint.hostelId, homes[0].id); assert.equal(complaint.roomNumber, '4');
  assert((await inbox(manager)).some((n: any) => n.title.includes('Captured maintenance issue')));
  assert(!(await inbox(foreign)).some((n: any) => n.title.includes('Captured maintenance issue')));
  await post('/api/issue-reports', resident, { title: 'Second active issue' }, 400);
  const secondComplaint = await post('/api/issue-reports', second, { title: 'Other activated room issue', photos: [] }, 201); assert.equal(secondComplaint.userId, second.id);
  // Legacy single-admin delete is retired even when body claims a quorum.
  await request('DELETE', `/api/hostels/${homes[0].id}`, admins[0], { privateKey: keys[0], approvedBy: admins.map(a => a.id) }, 410);
  const propose = async (home: any, deleteManager: boolean, owner = 1) => {
    const options = { hostelId: home.id, deleteHostel: true, deleteManager, ban: { amount: 3, unit: 'days' } }, preview = await post(root + '/preview', admins[owner], options);
    assert(preview.counts.hostels >= 1); return post(root, admins[owner], { ...options, fingerprint: preview.fingerprint, privateKey: keys[owner], reason: 'Reviewed isolated hostel removal', createdBy: admins[0].id });
  };
  await post(root + '/preview', primary, {}, 403); await post(root, undefined, {}, 401);
  const p = await propose(homes[0], false);
  await post(`${root}/${p.id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'DELETE APPROVED HOSTEL' }, 409);
  await post(`${root}/${p.id}/vote`, admins[1], { privateKey: keys[1], decision: 'approved' }, 409);
  await post(`${root}/${p.id}/vote`, admins[2], { privateKey: keys[1], decision: 'approved' }, 403);
  await post(`${root}/${p.id}/vote`, admins[2], { privateKey: keys[2], decision: 'approved', adminId: admins[0].id });
  assert((await disk()).hostels.some((h: any) => h.id === homes[0].id));
  await stop(); await start(); assert(!(await popups(manager)).some((n: any) => n.id === notice.id));
  await post(`${root}/${p.id}/execute`, admins[2], { privateKey: keys[2], confirmation: 'DELETE APPROVED HOSTEL' }, 403);
  await post(`${root}/${p.id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'wrong' }, 400);
  await post(`${root}/${p.id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'DELETE APPROVED HOSTEL' });
  const saved = await disk(); assert(!saved.hostels.some((h: any) => h.id === homes[0].id)); assert(saved.hostels.some((h: any) => h.id === homes[1].id)); assert(saved.hostels.some((h: any) => h.id === homes[2].id));
  await request('GET', '/api/auth/me', manager); await request('GET', '/api/auth/me', resident, undefined, 401); await request('GET', '/api/auth/me', staff, undefined, 401);
  const deletionNotice = (await inbox(primary)).find((n: any) => n.title === 'Hostel Deleted'); assert(deletionNotice && deletionNotice.targetAccountId === primary.id);
  assert((await popups(primary)).some((n: any) => n.id === deletionNotice.id)); await post(`/api/admin-messages/${deletionNotice.id}/ack`, other, {}, 404); await post(`/api/admin-messages/${deletionNotice.id}/ack`, primary, {});
  const blocked = await post('/api/hostels/register', manager, { managerId: foreign.id }, 403); assert(blocked.registrationBanned);
  const both = await propose(homes[1], true, 0); await post(`${root}/${both.id}/vote`, admins[1], { privateKey: keys[1], decision: 'approved' }); await post(`${root}/${both.id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'DELETE APPROVED HOSTEL' });
  await request('GET', '/api/auth/me', manager, undefined, 401); await request('GET', '/api/auth/me', primary); await request('GET', '/api/auth/me', foreign); await request('GET', '/api/auth/me', seller);
  for (const route of ['/api/auth/register-manager', '/api/auth/register-manager-account', '/api/users/register', '/api/manager-verifications/submit']) assert((await post(route, primary, { role: 'manager', parentUserId: other.id }, 403)).registrationBanned);
  await stop(); await start();
  assert(!(await popups(primary)).some((n: any) => n.id === deletionNotice.id));
  assert((await popups(primary)).some((n: any) => n.title === 'Hostel Deleted'));
  assert((await post('/api/auth/register-manager-account', primary, {}, 403)).registrationBanned);
  assert.equal((await disk()).hostels.length, 1); assert((await fs.readdir(path.join(temp, 'recovery'))).includes(`${both.id}.pvwipe`));
  const last = await propose(homes[2], false, 0); await post(`${root}/${last.id}/vote`, admins[1], { privateKey: keys[1], decision: 'approved' }); await post(`${root}/${last.id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'DELETE APPROVED HOSTEL' });
  await request('GET', '/api/auth/me', foreign);
  const login = await post('/api/auth/login', undefined, { usernameOrEmail: foreign.email, password: 'Retained-manager-login!234' }); assert.equal(login.user?.id || login.id, foreign.id);
  assert.equal((await disk()).hostels.length, 0); assert((await disk()).users.some((u: any) => u.id === foreign.id));
  assert(!keys.some(key => logs.includes(key)));
});
