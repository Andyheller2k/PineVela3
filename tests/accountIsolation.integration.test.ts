import { sessionFixtureJson } from './sessionFixtures.cjs';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { hashCredential } from '../accountSecurity.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const studentEmail = 'synthetic@st.knust.edu.gh';
const marketPassword = 'Synthetic-market-only!';
const roomPassword = 'Synthetic-room-only!';
const primaryPassword = 'Synthetic-primary-only!';

test('account isolation, password reuse, release, reshuffle and restart persistence', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-security-'));
  const db = path.join(temp, 'data', 'pinevela_store.json');
  let child: ChildProcess | undefined;
  let logs = '';
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const room = (id: string, key: string, assigned = false, hostelId = 'hostel') => ({ id, hostelId, hostelName: 'Synthetic Residence', blockName: 'Block A', roomNumber: id, roomKey: key, isAssigned: assigned, status: assigned ? 'Occupied' : 'Available', ...(assigned ? { assignedStudentEmail: studentEmail, parentUserId: 'primary', parentUserEmail: 'primary@example.test' } : {}) });
  const primary = { id: 'primary', email: 'primary@example.test', role: 'user', name: 'Synthetic Primary', password: hashCredential(primaryPassword), token: 'primary-fixture', registeredAccounts: { residentAccount: { roomKey: 'SYN-AA-100001' }, residentRooms: [{ roomKey: 'SYN-AA-100001' }] } };
  const fixture = {
    credentialExposureVersion: 1,
    accountSecurityVersion: 0,
    users: [primary,
      { id: 'signup-fixture', role: 'user', email: 'signup@example.test', name: 'Isolated Signup Fixture', password: hashCredential('Pending-synthetic-only!') },
      { id: 'resident', role: 'merchant', isDigitalMarketOnly: true, isApprovedMerchant: true, email: studentEmail, name: 'Synthetic Resident', roomKey: 'SYN-AA-100001', hostelId: 'hostel', parentUserId: primary.id, parentUserEmail: primary.email, password: hashCredential(roomPassword), token: 'mixed-old-session' },
      { id: 'primary2', role: 'user', email: 'second@example.test', name: 'Synthetic Second', password: hashCredential('Synthetic-second-only!'), token: 'primary2-fixture' },
      { id: 'manager', role: 'manager', isVerified: true, verificationStatus: 'approved', email: 'manager@example.test', name: 'Synthetic Manager', password: hashCredential('Synthetic-manager-only!'), token: 'manager-fixture' },
      { id: 'foreign', role: 'manager', isVerified: true, verificationStatus: 'approved', email: 'foreign@example.test', password: hashCredential('Synthetic-foreign-only!'), token: 'foreign-fixture' },
      { id: 'admin', role: 'admin', email: 'admin@example.test', password: hashCredential('Synthetic-admin-only!'), token: 'admin-fixture' }
    ],
    hostels: [{ id: 'hostel', name: 'Synthetic Residence', managerId: 'manager', managerEmail: 'manager@example.test' }, { id: 'foreign-hostel', name: 'Other Residence', managerId: 'foreign' }],
    roomKeys: [room('occupied', 'SYN-AA-100001', true), room('free', 'SYN-AA-100002'), room('foreign-room', 'SYN-AA-100003', false, 'foreign-hostel')],
    digitalMarketApplications: [{ id: 'market-app', userId: primary.id, parentUserEmail: primary.email, studentEmail, password: hashCredential(marketPassword), merchantToken: 'mixed-old-session', status: 'approved', fullName: 'Synthetic Merchant', storeName: 'Synthetic Store', registrationFeePaid: true, setupCompleted: true }],
    digitalMarketStores: [{ id: 'market-store', userId: primary.id, parentUserEmail: primary.email, studentEmail, status: 'active', storeName: 'Synthetic Store', registrationFeePaid: true, setupCompleted: true }, { id: 'other-store', studentEmail: 'other@st.knust.edu.gh', status: 'active' }],
    digitalMarketOrders: [{ id: 'order', sellerEmail: studentEmail, buyerEmail: 'buyer@example.test', buyerId: 'buyer', storeId: 'market-store', status: 'Pending', otpPin: '5678' }],
    platformSettings: { registrationFee: 0, commission: 0, announcement: '', maintenanceMode: false }
  };
  await fs.mkdir(path.dirname(db));
  await fs.writeFile(db, sessionFixtureJson(fixture));
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    logs = '';
    child = spawn(path.join(project, 'node_modules', '.bin', 'tsx'), [path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: path.join(temp, 'data') }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => { logs += data; }); child.stderr?.on('data', data => { logs += data; });
    for (let tries = 0; tries < 150; tries++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch { /* Starting */ }
      if (child.exitCode !== null) assert.fail(`Server exited: ${logs}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Server did not start: ${logs}`);
  };
  const request = async (route: string, token?: string, body?: any) => {
    const payload = route === '/api/auth/login' && body ? { ...body, usernameOrEmail: body.email } : body;
    const response = await fetch(`${base}${route}`, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(payload) }) });
    return { status: response.status, data: await response.json() };
  };
  const expect = async (route: string, token: string | undefined, body: any, status: number) => {
    const response = await request(route, token, body);
    assert.equal(response.status, status, `${route}: ${JSON.stringify(response.data)}`);
    return response.data;
  };
  const login = async (email: string, password: string, role: string) => {
    const data = await expect('/api/auth/login', undefined, { email, password }, 200);
    const user = data.user || data;
    assert.equal(user.role, role, JSON.stringify(data));
    assert(data.token || user.token);
    return data.token || user.token;
  };
  await start();
  await expect('/api/auth/me', 'mixed-old-session', undefined, 401);
  const primaryToken = await login(primary.email, primaryPassword, 'user');
  let roomToken = await login(studentEmail, roomPassword, 'student');
  const marketToken = await login(studentEmail, marketPassword, 'merchant');
  await expect('/api/auth/login', undefined, { email: studentEmail, password: 'Wrong-password!' }, 401);
  await expect('/api/digital-market/login', undefined, { studentEmail, password: roomPassword }, 401);
  await expect('/api/digital-market/login', undefined, { studentEmail: 'other@st.knust.edu.gh', password: 'Anything-at-all!' }, 401);
  await expect('/api/digital-market/subscription', roomToken, { storeId: 'market-store', plan: 'basic' }, 403);
  await expect('/api/digital-market/subscription', primaryToken, { storeId: 'market-store', plan: 'basic' }, 403);
  await expect('/api/digital-market/subscription', marketToken, { storeId: 'other-store', plan: 'basic' }, 403);
  await expect('/api/digital-market/subscription', marketToken, { storeId: 'market-store', plan: 'default' }, 200);
  await expect('/api/digital-market/orders/order/update-status', roomToken, { action: 'agree-location' }, 403);
  await expect('/api/digital-market/messages?email=' + studentEmail, roomToken, undefined, 403);
  await expect('/api/digital-market/messages?email=' + studentEmail, primaryToken, undefined, 403);
  await expect('/api/digital-market/messages?email=' + studentEmail, marketToken, undefined, 200);
  await expect('/api/digital-market/messages', primaryToken, { senderEmail: studentEmail, recipientEmail: 'buyer@example.test', content: 'Impersonated seller' }, 403);
  await expect('/api/auth/profile', 'foreign-fixture', { email: 'manager@example.test' }, 400);
  await expect('/api/admin/digital-market/toggle-ban-store', 'admin-fixture', { storeId: 'market-store' }, 200);
  await expect('/api/auth/me', marketToken, undefined, 403);
  await expect('/api/auth/login', undefined, { email: studentEmail, password: marketPassword }, 403);
  roomToken = await login(studentEmail, roomPassword, 'student');
  await expect('/api/admin/digital-market/toggle-ban-store', 'admin-fixture', { storeId: 'market-store' }, 200);
  assert.deepEqual((await expect('/api/digital-market/my-orders?email=' + studentEmail, roomToken, undefined, 200)), []);
  assert.equal((await expect('/api/digital-market/my-orders', marketToken, undefined, 200)).length, 1);
  await expect('/api/digital-market/status?email=' + studentEmail, undefined, undefined, 401);
  await expect('/api/digital-market/status?email=' + studentEmail, roomToken, undefined, 403);
  const status = await expect('/api/digital-market/status?email=' + primary.email, primaryToken, undefined, 200);
  assert(!JSON.stringify(status).includes('scrypt-sha256$'));
  assert(!('merchantToken' in status.application));
  assert(!('token' in status.store));
  const claim = { roomKey: 'SYN-AA-100002', name: 'Synthetic New Resident', email: studentEmail, phone: '0240000000', password: marketPassword };
  await expect('/api/room-keys/claim', primaryToken, claim, 409);
  await expect('/api/room-keys/claim', primaryToken, { ...claim, password: primaryPassword }, 409);
  await expect('/api/room-keys/claim', roomToken, { ...claim, password: 'Distinct-new-password!' }, 403);
  await expect('/api/room-keys/claim', marketToken, { ...claim, password: 'Distinct-new-password!' }, 403);
  await expect('/api/room-keys/claim', undefined, { ...claim, password: 'Distinct-new-password!', userId: 'primary' }, 401);
  await expect('/api/student/add-room', roomToken, { roomKey: claim.roomKey }, 403);
  await expect('/api/digital-market/register', roomToken, { studentEmail, password: 'Distinct-new-password!' }, 403);
  await expect('/api/auth/register-manager-account', marketToken, { email: 'newmanager@example.test', password: 'Distinct-new-password!' }, 403);
  await expect('/api/auth/register-manager-account', undefined, { email: 'newmanager@example.test', password: 'Distinct-new-password!' }, 401);
  await expect('/api/staff', 'manager-fixture', { email: 'newstaff@example.test', password: 'Distinct-new-password!' }, 403);
  await expect('/api/users/register', undefined, { email: 'attacker@example.test', password: 'Distinct-new-password!', role: 'admin' }, 400);
  const reset = { email: studentEmail, role: 'resident', currentPassword: roomPassword, newPassword: marketPassword };
  await expect('/api/users/reset-registered-account-password', primaryToken, reset, 409);
  await expect('/api/users/reset-registered-account-password', 'primary2-fixture', { ...reset, newPassword: 'Room-after-reset!' }, 403);
  await expect('/api/users/reset-registered-account-password', primaryToken, { ...reset, currentPassword: 'Incorrect-current!', newPassword: 'Room-after-reset!' }, 400);
  await expect('/api/users/reset-registered-account-password', primaryToken, { ...reset, newPassword: 'Room-after-reset!' }, 200);
  await expect('/api/auth/me', roomToken, undefined, 401);
  await expect('/api/auth/login', undefined, { email: studentEmail, password: roomPassword }, 401);
  const resetRoomToken = await login(studentEmail, 'Room-after-reset!', 'student');
  await expect('/api/auth/change-password', resetRoomToken, { currentPassword: roomPassword, newPassword: 'Another-new-room-password!' }, 400);
  await expect('/api/users/reset-registered-account-password', primaryToken, { ...reset, currentPassword: roomPassword, newPassword: 'Another-new-room-password!' }, 400);
  await expect('/api/auth/me', marketToken, undefined, 200);
  await expect('/api/auth/change-password', marketToken, { currentPassword: marketPassword, newPassword: roomPassword }, 409);
  await expect('/api/admin/reset-user-password', 'admin-fixture', { email: studentEmail, newPassword: 'Admin-new-distinct!' }, 400);
  await expect('/api/room-keys/occupied/release', 'foreign-fixture', { confirm: true }, 403);
  await expect('/api/room-keys/occupied/release', 'manager-fixture', {}, 400);
  const released = await expect('/api/room-keys/occupied/release', 'manager-fixture', { confirm: true }, 200);
  assert.equal(released.room.isAssigned, false);
  assert.notEqual(released.room.roomKey, 'SYN-AA-100001');
  await expect('/api/auth/me', resetRoomToken, undefined, 401);
  await expect('/api/auth/login', undefined, { email: studentEmail, password: 'Room-after-reset!' }, 401);
  assert.deepEqual((await expect('/api/student/my-rooms', primaryToken, undefined, 200)).rooms, []);
  const links = await expect('/api/users/my-registered-accounts', primaryToken, undefined, 200);
  assert(!links.residentAccount);
  await expect('/api/auth/me', marketToken, undefined, 200);
  await login('signup@example.test', 'Pending-synthetic-only!', 'user');
  const newClaim = await expect('/api/room-keys/claim', primaryToken, { ...claim, password: 'New-room-after-release!' }, 200);
  assert.equal(newClaim.user.role, 'student');
  await expect('/api/room-keys/claim', 'primary2-fixture', { ...claim, email: 'second@st.knust.edu.gh', password: 'Another-distinct-room!' }, 409);
  // Accounts with shared emails must survive the persistent loader, not just work in memory.
  await stop(); await start();
  const persistedRoomToken = await login(studentEmail, 'New-room-after-release!', 'student');
  const persistedMarketToken = await login(studentEmail, marketPassword, 'merchant');
  await expect('/api/hostels/hostel/reshuffle-room-keys', 'foreign-fixture', { confirm: true, academicYear: '2026/2027' }, 403);
  await expect('/api/hostels/hostel/reshuffle-room-keys', 'manager-fixture', { confirm: true, academicYear: '2026/2028' }, 400);
  const reshuffled = await expect('/api/hostels/hostel/reshuffle-room-keys', 'manager-fixture', { confirm: true, academicYear: '2026/2027' }, 200);
  assert.equal(reshuffled.count, 2);
  assert.equal(reshuffled.occupantsRemoved, 1);
  assert.equal(new Set(reshuffled.roomKeys.map((r: any) => r.roomKey)).size, 2);
  assert(reshuffled.roomKeys.every((r: any) => !r.isAssigned && !['SYN-AA-100001', 'SYN-AA-100002', released.room.roomKey].includes(r.roomKey)));
  await expect('/api/auth/me', persistedRoomToken, undefined, 401);
  await expect('/api/auth/me', persistedMarketToken, undefined, 200);
  await stop(); await start();
  await expect('/api/auth/login', undefined, { email: studentEmail, password: 'New-room-after-release!' }, 401);
  await login(studentEmail, marketPassword, 'merchant');
  const disk = JSON.parse(await fs.readFile(db, 'utf8'));
  assert.equal(disk.accountSecurityVersion, 1);
  assert(!disk.users.some((u: any) => (u.roomKey || u.user?.roomKey)));
  assert.deepEqual(disk.users.find((u: any) => u.id === 'primary').registeredAccounts.residentRooms, []);
  assert.equal(disk.roomKeys.find((r: any) => r.id === 'foreign-room').roomKey, 'SYN-AA-100003');
  for (const key of ['SYN-AA-100001', 'SYN-AA-100002', released.room.roomKey]) assert(disk.retiredRoomKeys.includes(key));
  const raw = JSON.stringify(disk);
  for (const password of [primaryPassword, roomPassword, marketPassword, 'Room-after-reset!', 'New-room-after-release!']) assert(!raw.includes(password));
  assert(!raw.includes('plainPassword'));
  assert(!raw.includes(persistedRoomToken));
  assert(!raw.includes('mixed-old-session'));
  const signupToken = await login('signup@example.test', 'Pending-synthetic-only!', 'user');
  const activationKey = disk.roomKeys.find((r: any) => r.id === 'free').roomKey;
  const racing = await Promise.all([
    request('/api/room-keys/claim', 'primary2-fixture', { ...claim, roomKey: activationKey, email: 'second@st.knust.edu.gh', password: 'Concurrent-second-only!' }),
    request('/api/room-keys/claim', signupToken, { ...claim, roomKey: activationKey, email: 'signup@st.knust.edu.gh', password: 'Concurrent-signup-only!' })
  ]);
  assert.deepEqual(racing.map(r => r.status).sort(), [200, 409], JSON.stringify(racing));
  await expect('/api/room-keys/free/release', 'manager-fixture', { confirm: true }, 200);
});
