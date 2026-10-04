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
import { hashCredential } from '../accountSecurity.js';
import { initializeAdminGovernance } from '../adminGovernance.js';
import { sessionFixtureJson } from './sessionFixtures.cjs';

test('Real API: private quorum, six enforced restrictions, ban notices/revocation, scoped deletion and restart', { timeout: 120000 }, async t => {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-account-moderation-api-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir); const db = path.join(dataDir, 'pinevela_store.json');
  const actor = (id: string, role = 'user') => ({ id, name: `Isolated ${id}`, role, email: `${id}@example.test`, token: crypto.randomUUID(), password: hashCredential(`Private-${id}-login!92`), isVerified: true });
  const admins = Array.from({ length: 5 }, (_, i) => actor(`founder${i}`, 'admin')), primary = actor('primary'), independent = { ...actor('independent'), email: primary.email };
  const manager = { ...actor('manager', 'manager'), parentUserId: primary.id, verificationStatus: 'approved' };
  const employee = { ...actor('employee', 'staff'), managerId: manager.id, hostelId: 'home' };
  const seller = { id: 'market', userId: primary.id, studentEmail: 'seller@example.test', token: crypto.randomUUID(), status: 'active', storeName: 'Isolated market', setupCompleted: false };
  const store: any = { credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, primary, independent, manager, employee],
    hostels: [{ id: 'home', name: 'Isolated residence', managerId: manager.id, isApproved: true, approvalStatus: 'Approved', blocks: [{ name: 'North', totalRooms: 1, startNum: 1, roomPrefix: 'N', gender: 'Mixed' }] }],
    staff: [{ id: 'roster', userId: employee.id, managerId: manager.id, hostelId: 'home', status: 'active', email: employee.email }],
    digitalMarketStores: [seller], digitalMarketApplications: [{ id: 'application', userId: primary.id, studentEmail: seller.studentEmail, status: 'approved', password: hashCredential('Seller-private-login!92') }],
    digitalMarketProducts: [{ id: 'product', storeId: seller.id, price: 10, stock: 4, title: 'Isolated product' }], digitalMarketOrders: [{ id: 'order', storeId: seller.id, productId: 'product', buyerId: independent.id }], digitalMarketMessages: [{ id: 'message', orderId: 'order' }] };
  initializeAdminGovernance(store, admins[0].id); const keys = admins.map((a, i) => `disposable-key-${i}`);
  store.adminGovernance.members.forEach((m: any, i: number) => m.keyHash = crypto.createHash('sha256').update(`${m.id}:${keys[i]}`).digest('hex'));
  await fs.writeFile(db, sessionFixtureJson(store));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(r => listener.close(() => r()));
  const base = `http://127.0.0.1:${port}`, root = '/api/admin/governance/accounts'; let child: ChildProcess | undefined, logs = '';
  const stop = async () => { if (child && child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    logs = ''; child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], {
      cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_MAIN_ADMIN_ID: admins[0].id, PINEVELA_WIPE_RECOVERY_DIR: path.join(temp, 'private'), PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PAYSTACK_SECRET_KEY: '', SUPABASE_URL: '', SUPABASE_ANON_KEY: '', PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', b => { logs += b; }); child.stderr?.on('data', b => { logs += b; });
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail('Isolated server exited: ' + logs.slice(-1000)); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not start: ' + logs.slice(-1000));
  };
  const req = async (route: string, actor?: { token: string }, body?: any, expected = 200, method = body === undefined ? 'GET' : 'POST') => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json(); assert.equal(res.status, expected, `${method} ${route}: ${data.error}`); return data;
  };
  const propose = async (action: string, extras: any = {}) => (await req(root, admins[0], { targetId: primary.id, targetRole: 'user', action, reason: 'Isolated policy violation', privateKey: keys[0], duration: { amount: 2, unit: 'hours' }, ...extras })).id;
  const vote = (id: string, n: number, extras = {}) => req(`${root}/${id}/vote`, admins[n], { privateKey: keys[n], decision: 'approved', ...extras });
  const approve = async (id: string) => { for (let n = 1; n < 5; n++) await vote(id, n); };
  const apply = (id: string, deletion = false) => req(`${root}/${id}/apply`, admins[0], { privateKey: keys[0], confirmation: deletion ? 'DELETE APPROVED ACCOUNT' : 'APPLY APPROVED ACTION' });
  await start();
  await req('/api/admin/all-users', undefined, undefined, 401); await req(root, primary, {}, 403); await req(root, undefined, {}, 401);
  const directory = await req('/api/admin/all-users', admins[0]); assert(directory.users.some((u: any) => u.id === primary.id)); assert(directory.users.some((u: any) => u.id === independent.id)); assert(directory.users.some((u: any) => u.id === 'merchant:application')); assert.equal(directory.breakdown.total, directory.users.length);
  const features = ['subaccounts', 'rooms', 'orders', 'publishing', 'messaging', 'maintenance'];
  const restricted = await propose('restrict', { features, createdBy: admins[4].id });
  await req(`${root}/${restricted}/apply`, admins[0], { privateKey: keys[0], confirmation: 'APPLY APPROVED ACTION' }, 409);
  await req(`${root}/${restricted}/vote`, admins[1], { privateKey: keys[0], decision: 'approved' }, 403);
  await approve(restricted);
  await req(`${root}/${restricted}/apply`, admins[1], { privateKey: keys[1], confirmation: 'APPLY APPROVED ACTION' }, 403); await apply(restricted);
  for (const route of ['/api/auth/register-manager-account', '/api/users/register', '/api/digital-market/register', '/api/room-keys/claim', '/api/residents/onboard', '/api/room-keys/verify', '/api/digital-market/orders', '/api/digital-market/messages', '/api/issue-reports']) {
    const denied = await req(route, primary, { userId: independent.id, role: 'admin' }, 403); assert(denied.accountRestricted, route);
  }
  for (const route of ['/api/digital-market/products', '/api/storage/upload-market-image', '/api/digital-market/messages']) assert((await req(route, seller, {}, 403)).accountRestricted);
  assert((await req('/api/digital-market/messages', primary, undefined, 403)).accountRestricted);
  assert.equal((await req('/api/auth/account-access', primary)).restrictions[0].features.length, 6);
  assert.equal((await req('/api/auth/account-access', independent)).restrictions.length, 0);
  await stop(); await start(); assert.equal((await req('/api/auth/account-access', primary)).restrictions.length, 1);
  const restore = await propose('restore'); await approve(restore); await apply(restore);
  const login = await req('/api/auth/login', undefined, { usernameOrEmail: primary.email, password: 'Private-primary-login!92' }); primary.token = login.token; assert(primary.token);
  seller.token = (await req('/api/digital-market/login', undefined, { studentEmail: seller.studentEmail, password: 'Seller-private-login!92' })).token;
  const banned = await propose('ban'); await approve(banned); await apply(banned);
  const notice = await req('/api/auth/me', primary, undefined, 403); assert(notice.accountBanned); assert(notice.accountAccess.remainingSeconds > 0); assert(notice.accountAccess.reason);
  assert((await req('/api/auth/login', undefined, { usernameOrEmail: primary.email, password: 'Private-primary-login!92' }, 403)).accountBanned);
  await req('/api/auth/login', undefined, { usernameOrEmail: primary.email, password: 'incorrect password' }, 401);
  admins[4].token = (await req('/api/auth/login', primary, { usernameOrEmail: admins[4].email, password: 'Private-founder4-login!92' })).token;
  assert(admins[4].token, 'A banned account session cannot prevent another account from signing in');
  assert((await req('/api/auth/me', seller, undefined, 403)).accountBanned); await req('/api/auth/me', independent);
  assert.equal((await req('/api/digital-market/products?includeAll=true')).length, 0, 'Banned seller listings are hidden from public reads');
  await req('/api/digital-market/orders', independent, { productId: 'product', quantity: 1 }, 403);
  await req('/api/admin/digital-market/toggle-ban-store', admins[0], { storeId: seller.id }, 410);
  await req('/api/manager-verifications/manager/block', admins[0], {}, 410, 'PUT');
  await stop(); await start(); assert((await req('/api/auth/me', primary, undefined, 403)).accountBanned);
  const clear = await propose('restore'); await approve(clear); await apply(clear); await req('/api/auth/me', primary, undefined, 401);
  const preview = await req(`${root}/preview`, admins[0], { targetId: manager.id, targetRole: manager.role }); assert(preview.counts.staff);
  const deletion = await propose('delete', { targetId: manager.id, targetRole: manager.role, fingerprint: preview.fingerprint }); await approve(deletion); await apply(deletion, true);
  const final = await req('/api/admin/all-users', admins[0]); assert(!final.users.some((u: any) => [manager.id, employee.id].includes(u.id))); assert(final.users.some((u: any) => u.id === independent.id)); assert(final.users.some((u: any) => u.id === primary.id));
  await stop(); await start(); const persisted = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(persisted.hostels.length, 0); assert.equal(persisted.staff.length, 0); assert.equal(persisted.adminGovernance.accountProposals.find((p: any) => p.id === deletion).status, 'applied');
});
