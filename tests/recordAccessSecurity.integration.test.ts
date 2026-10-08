import { managerKeyHash } from '../residenceRequests.js';
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
import { sessionFixtureJson } from './sessionFixtures.cjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('S28/S29: meetings and notification reads enforce account boundaries and persist across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s28-s29-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: `Isolated ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' });
  const manager = actor('manager'), other = { ...actor('manager'), email: manager.email };
  const user = { ...actor('user'), email: manager.email }, buyer = actor('user');
  const admin = actor('admin'), admin2 = actor('admin'), employee = actor('staff'), seller = { ...actor('merchant'), email: user.email };
  const home = { id: crypto.randomUUID(), name: 'Isolated residence', managerId: manager.id, managerEmail: manager.email, isApproved: true };
  const foreign = { ...home, id: crypto.randomUUID(), managerId: other.id };
  const market = { id: crypto.randomUUID(), studentEmail: seller.email, userId: user.id, status: 'active', setupCompleted: true };
  Object.assign(seller, { merchantStoreId: market.id, parentUserId: user.id });
  const ownMeeting = { id: crypto.randomUUID(), hostelId: home.id, requesterId: buyer.id, topic: 'Own meeting' };
  const foreignMeeting = { id: crypto.randomUUID(), hostelId: foreign.id, managerId: other.id, managerEmail: manager.email, hostelName: home.name, topic: 'Foreign meeting' };
  const orphan = { id: crypto.randomUUID(), topic: 'Unassigned meeting' };
  const direct = { id: crypto.randomUUID(), managerId: manager.id, topic: 'Direct meeting' };
  const spoofed = { ...foreignMeeting, id: crypto.randomUUID(), managerId: manager.id };
  const emailOnly = { id: crypto.randomUUID(), managerEmail: manager.email, topic: 'Ambiguous legacy meeting' };
  const notice = (id: string, fields: any) => ({ id, title: id, message: id, date: '2026-10-03', read: false, ...fields });
  const own = notice('manager-notice', { userId: manager.id, managerEmail: manager.email, targetRole: 'manager' });
  const foreignNotice = notice('foreign-notice', { userId: other.id, recipientEmail: manager.email, targetRole: 'manager' });
  const primaryNotice = notice('primary-notice', { targetAccountId: user.id, userId: user.id, targetRole: 'user', recipientEmail: user.email });
  const hostelNotice = notice('hostel-notice', { hostelId: home.id, targetRole: 'manager' });
  const buyerNotice = notice('buyer-notice', { studentId: buyer.id });
  const chat = notice('seller-chat', { marketChat: true, messageId: crypto.randomUUID(), targetAccountId: seller.id, targetRole: 'merchant', sellerStoreId: market.id });
  const rating = notice('seller-rating', { sellerStoreId: market.id, targetRole: 'merchant', scope: 'market' });
  const shared = notice('shared-admin', { targetRole: 'admin' });
  const retired = notice('retired', { userId: user.id, type: 'general_chat' });
  const roster = { id: crypto.randomUUID(), userId: employee.id, email: employee.email, hostelId: home.id, managerId: manager.id, managerCreated: true, status: 'Active' };
  const staffNotice = notice('staff-notice', { userId: roster.id, recipientEmail: employee.email });
  const keyedManagers = [manager, other];
  const managerSecrets = new Map(keyedManagers.map(actor => [actor.id, crypto.randomBytes(32).toString('base64url')]));
  const managerOperationKeys = Object.fromEntries(keyedManagers.map(actor => [actor.id, { hash: managerKeyHash(actor.id, managerSecrets.get(actor.id)!) }]));
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, managerOperationKeys,
    users: [manager, other, user, buyer, admin, admin2, employee, seller], hostels: [home, foreign],
    staff: [roster],
    digitalMarketStores: [market], digitalMarketApplications: [{ id: crypto.randomUUID(), studentEmail: seller.email, status: 'approved' }],
    meetings: [ownMeeting, foreignMeeting, orphan, direct, spoofed, emailOnly],
    notifications: [own, foreignNotice, primaryNotice, hostelNotice, buyerNotice, chat, rating, shared, retired, staffNotice]
  }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(resolve => listener.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_TRUST_PROXY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail('Isolated server exited'); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not start');
  };
  const request = async (method: string, route: string, token: string | undefined, body: any, expected: number | number[]) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}`, ...(keyedManagers.some(actor => actor.token === token) ? { 'X-PineVela-Manager-Key': managerSecrets.get(keyedManagers.find(actor => actor.token === token)!.id)! } : {}) } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert([expected].flat().includes(response.status), `${method} ${route}: expected ${expected}, got ${response.status}; ${result.error || ''}`); return result;
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const list = async (route: string, who: any) => request('GET', route, who.token, undefined, 200);
  const mark = async (id: string, who: any, expected = 200) => request('PUT', `/api/notifications/${id}/read`, who?.token, {}, expected);
  await start();
  for (const route of ['/api/meetings', '/api/notifications']) await request('GET', route, undefined, undefined, 401);
  await request('DELETE', `/api/meetings/${foreignMeeting.id}`, undefined, {}, 401);
  await mark(own.id, undefined, 401);
  assert.deepEqual((await list('/api/meetings', manager)).map((m: any) => m.id).sort(), [ownMeeting.id, direct.id].sort());
  assert((await list('/api/meetings', employee)).some((m: any) => m.id === ownMeeting.id));
  assert(!(await list('/api/meetings', employee)).some((m: any) => m.id === foreignMeeting.id));
  assert((await list('/api/meetings', buyer)).some((m: any) => m.id === ownMeeting.id));
  for (const meeting of [foreignMeeting, orphan, spoofed, emailOnly]) {
    await request('PUT', `/api/meetings/${meeting.id}`, manager.token, { status: 'Cancelled' }, 403);
    await request('DELETE', `/api/meetings/${meeting.id}`, manager.token, {}, 403);
  }
  await request('PUT', `/api/meetings/${foreignMeeting.id}`, employee.token, { status: 'Cancelled' }, 403);
  await request('DELETE', `/api/meetings/${ownMeeting.id}`, user.token, {}, 403);
  await request('DELETE', `/api/meetings/${ownMeeting.id}`, employee.token, {}, 403);
  await request('DELETE', '/api/meetings/does-not-exist', manager.token, {}, 404);
  await request('PUT', `/api/meetings/${ownMeeting.id}`, manager.token, { status: 'Approved' }, 200);
  await request('PUT', `/api/meetings/${ownMeeting.id}`, employee.token, { managerResponseNotes: 'Assigned staff update' }, 200);
  await request('DELETE', `/api/meetings/${direct.id}`, manager.token, {}, 200);
  await request('DELETE', `/api/meetings/${orphan.id}`, admin.token, {}, 200);
  let disk = await read();
  assert.equal(disk.meetings.find((m: any) => m.id === ownMeeting.id).status, 'Approved');
  assert(disk.meetings.some((m: any) => m.id === foreignMeeting.id));
  assert(!disk.meetings.some((m: any) => [direct.id, orphan.id].includes(m.id)));
  assert(!(await list('/api/notifications', manager)).some((n: any) => [foreignNotice.id, primaryNotice.id, chat.id, rating.id].includes(n.id)));
  for (const who of [user, other, admin, seller]) await mark(own.id, who, 403);
  await mark(foreignNotice.id, manager, 403);
  for (const n of [chat, rating, primaryNotice, staffNotice]) await mark(n.id, manager, 403);
  for (const n of [chat, rating]) await mark(n.id, user, 403);
  await mark('missing', user, 404); await mark(retired.id, user, 404);
  disk = await read();
  assert(disk.notifications.every((n: any) => !n.read && !n.isRead && !n.readBy));
  await mark(staffNotice.id, employee);
  assert((await list('/api/notifications', employee)).find((n: any) => n.id === staffNotice.id).read);
  await mark(own.id, manager);
  await mark(shared.id, admin);
  assert((await list('/api/notifications', admin)).find((n: any) => n.id === shared.id).read);
  assert.equal((await list('/api/notifications', admin2)).find((n: any) => n.id === shared.id).read, false);
  await request('PUT', '/api/notifications/read-all', undefined, {}, 401);
  await request('PUT', '/api/notifications/read-all', manager.token, {}, 200);
  assert((await list('/api/notifications', manager)).every((n: any) => n.read));
  assert.equal((await list('/api/notifications', other)).find((n: any) => n.id === foreignNotice.id).read, false);
  assert.equal((await list('/api/notifications', user)).find((n: any) => n.id === primaryNotice.id).read, false);
  await request('PUT', '/api/notifications/read-all', seller.token, {}, 200);
  const marketNotices = await list('/api/notifications?scope=market', seller);
  assert(marketNotices.find((n: any) => n.id === chat.id).read);
  assert(marketNotices.find((n: any) => n.id === rating.id).read);
  assert.equal((await list('/api/notifications', user)).find((n: any) => n.id === primaryNotice.id).read, false);
  await mark(primaryNotice.id, user);
  await stop(); await start();
  assert(!(await list('/api/meetings', manager)).some((m: any) => m.id === direct.id));
  assert((await list('/api/meetings', other)).some((m: any) => m.id === foreignMeeting.id));
  await request('DELETE', `/api/meetings/${foreignMeeting.id}`, manager.token, {}, 403);
  await request('DELETE', `/api/meetings/${foreignMeeting.id}`, other.token, {}, 200);
  assert((await list('/api/notifications', manager)).every((n: any) => n.read));
  assert((await list('/api/notifications', seller)).every((n: any) => n.read));
  assert((await list('/api/notifications', employee)).find((n: any) => n.id === staffNotice.id).read);
  assert.equal((await list('/api/notifications', admin2)).find((n: any) => n.id === shared.id).read, false);
  assert.equal((await list('/api/notifications', other)).find((n: any) => n.id === foreignNotice.id).read, false);
  await mark(foreignNotice.id, manager, 403);
  await mark(foreignNotice.id, other);
});
