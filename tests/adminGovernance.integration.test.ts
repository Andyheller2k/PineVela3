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
import { sessionFixtureJson } from './sessionFixtures.cjs';

test('Real Express governance: authenticated quorum, anti-bypass, suspension, private invitations, cascades and durable restart', { timeout: 120000 }, async t => {
  const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-admin-api-'));
  const dataDir = path.join(temp, 'data'), recovery = path.join(temp, 'recovery'); await fs.mkdir(dataDir);
  const db = path.join(dataDir, 'pinevela_store.json');
  const admins = Array.from({ length: 5 }, (_, i) => ({ id: crypto.randomUUID(), role: 'admin', name: `Isolated founder ${i + 1}`, email: `founder${i + 1}@example.test`, password: hashCredential(`Test-login-${i}!independent`), token: crypto.randomUUID(), isVerified: true, verificationStatus: 'approved' }));
  const user = { id: crypto.randomUUID(), email: 'primary@example.test', role: 'user', token: crypto.randomUUID(), isVerified: true };
  const seller = { id: crypto.randomUUID(), role: 'merchant', parentUserId: user.id, email: 'merchant@example.test' };
  const market = { id: crypto.randomUUID(), userId: user.id, studentEmail: seller.email, storeName: 'Isolated market', status: 'active' };
  Object.assign(seller, { merchantStoreId: market.id });
  const home = { id: crypto.randomUUID(), name: 'Preserved isolated residence' };
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...admins, user, seller], hostels: [home],
    digitalMarketStores: [market], digitalMarketApplications: [{ id: crypto.randomUUID(), studentEmail: seller.email, userId: user.id, status: 'approved' }],
    digitalMarketProducts: [{ id: crypto.randomUUID(), storeId: market.id, title: 'Isolated product', price: 10 }], digitalMarketOrders: [{ id: crypto.randomUUID(), storeId: market.id, buyerId: user.id }] }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = (listener.address() as net.AddressInfo).port; await new Promise<void>(r => listener.close(() => r()));
  const base = `http://127.0.0.1:${port}`, root = '/api/admin/governance'; let child: ChildProcess | undefined, logs = '';
  const stop = async () => { if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    logs = '';
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_MAIN_ADMIN_ID: admins[0].id, PINEVELA_WIPE_RECOVERY_DIR: recovery, PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', data => logs += data); child.stderr?.on('data', data => logs += data);
    for (let i = 0; i < 200; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(`Isolated server exited: ${logs}`); await new Promise(r => setTimeout(r, 100)); }
    assert.fail('Isolated server did not start');
  };
  const request = async (method: string, route: string, actor: any, body: any, expected: number | number[] = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor?.token ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert([expected].flat().includes(response.status), `${method} ${route}: expected ${expected}, got ${response.status}; ${result.error || ''}`); return { ...result, httpStatus: response.status };
  };
  const view = (actor = admins[0]) => request('GET', root, actor, undefined);
  const post = (route: string, actor: any, body: any, status: number | number[] = 200) => request('POST', root + route, actor, body, status);
  await start();
  await request('GET', root, undefined, undefined, 401); await request('GET', root, user, undefined, 403);
  await post('/proposals', undefined, { scopes: ['total'] }, 401); await post('/proposals', user, { scopes: ['total'] }, 403);
  await request('POST', '/api/admin/clear-all-registered-accounts', admins[0], { password: 'Test-login-0!independent' }, 410);
  await request('POST', '/api/admin/reset-user-password', admins[0], { email: admins[1].email, role: 'admin', newPassword: 'Attacker-new-password!234' }, 403);
  const keys: string[] = [];
  for (let i = 0; i < 5; i++) keys.push((await post('/keys/enroll', admins[i], { password: `Test-login-${i}!independent` })).privateKey);
  assert(keys.every(k => typeof k === 'string' && k.length >= 43));
  const displayed = await view(); assert.equal(displayed.members.find((m: any) => m.id === admins[0].id).slot, 1);
  assert(!JSON.stringify(displayed).includes('keyHash')); assert(!JSON.stringify(displayed).includes(keys[0]));
  await post('/invitations', admins[0], { privateKey: keys[0], email: 'sixth@example.test', name: 'Isolated sixth founder' }, 409);
  await post('/members/' + admins[0].id + '/status', admins[0], { privateKey: keys[0], active: false }, 403);
  await post('/members/' + admins[2].id + '/status', admins[1], { privateKey: keys[1], active: false }, 403);
  const propose = async (scopes: string[]) => {
    const preview = await post('/preview', admins[0], { scopes }); assert.equal(typeof preview.fingerprint, 'string');
    return (await post('/proposals', admins[0], { scopes, fingerprint: preview.fingerprint, privateKey: keys[0], reason: 'Isolated API verification', createdBy: admins[4].id })).id;
  };
  const cancelled = await propose(['markets']);
  await post('/members/' + admins[4].id + '/status', admins[0], { privateKey: keys[0], active: false });
  await request('GET', '/api/auth/me', admins[4], undefined, 401);
  await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[4].email, password: 'Test-login-4!independent' }, 403);
  assert.equal((await view()).proposals.find((p: any) => p.id === cancelled).status, 'invalidated');
  await post('/members/' + admins[4].id + '/status', admins[0], { privateKey: keys[0], active: true });
  const login = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[4].email, password: 'Test-login-4!independent' }); admins[4].token = login.token || login.user?.token;
  assert(admins[4].token);
  const id = await propose(['markets']);
  await post(`/proposals/${id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'WIPE APPROVED DATA' }, 409);
  await post(`/proposals/${id}/vote`, admins[0], { privateKey: keys[0], decision: 'approved' }, 409);
  await post(`/proposals/${id}/vote`, admins[1], { privateKey: keys[0], decision: 'approved' }, 403);
  for (let i = 1; i < 5; i++) await post(`/proposals/${id}/vote`, admins[i], { privateKey: keys[i], decision: 'approved' });
  assert.equal((await view(admins[3])).proposals.find((p: any) => p.id === id).votes.length, 5);
  let disk = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(disk.digitalMarketStores.length, 1);
  await stop(); await start();
  assert.equal((await view()).proposals.find((p: any) => p.id === id).status, 'approved');
  await post(`/proposals/${id}/execute`, admins[1], { privateKey: keys[1], confirmation: 'WIPE APPROVED DATA' }, 403);
  const results = await Promise.all([post(`/proposals/${id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'WIPE APPROVED DATA' }, [200, 409]), post(`/proposals/${id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'WIPE APPROVED DATA' }, [200, 409])]);
  assert(results.filter(r => r.httpStatus === 200).length <= 1, 'At most one concurrent execution succeeds');
  // Simultaneous execution can be rejected as busy or complete once. Inspect durable state,
  // then execute only if neither request was admitted; no assertion relies on request ordering.
  let current = (await view()).proposals.find((p: any) => p.id === id);
  if (current.status === 'approved') await post(`/proposals/${id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'WIPE APPROVED DATA' });
  current = (await view()).proposals.find((p: any) => p.id === id); assert.equal(current.status, 'executed');
  await post(`/proposals/${id}/execute`, admins[0], { privateKey: keys[0], confirmation: 'WIPE APPROVED DATA' }, 409);
  disk = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(disk.digitalMarketStores.length, 0); assert.equal(disk.digitalMarketOrders.length, 0); assert.equal(disk.hostels.length, 1);
  assert.equal(disk.users.filter((u: any) => (u.user?.role || u.role) === 'admin').length, 5);
  assert(disk.users.some((u: any) => u.id === user.id)); assert(!disk.users.some((u: any) => u.id === seller.id));
  assert((await fs.readdir(recovery)).includes(`${id}.pvwipe`));
  const audit = (await fs.readFile(path.join(recovery, 'audit.jsonl'), 'utf8')).trim().split('\n').map(l => JSON.parse(l));
  assert.equal(audit.filter(e => e.event === 'executed' && e.proposalId === id).length, 1);
  await stop(); await start(); assert.equal((await view()).proposals.find((p: any) => p.id === id).status, 'executed');
  assert(!logs.includes(keys[0])); assert(!logs.includes('Test-login-0!independent'));
  await stop();
  const restored = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'scripts/restore-wipe.ts'), id, '--confirm-restore'], { cwd: temp, env: { ...process.env, PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PINEVELA_WIPE_RECOVERY_DIR: recovery }, stdio: 'ignore' });
  const [code] = await once(restored, 'exit'); assert.equal(code, 0, 'Offline encrypted recovery succeeds');
  disk = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(disk.digitalMarketStores.length, 1); assert.equal(disk.users.filter((u: any) => (u.user?.role || u.role) === 'admin').length, 5);
  assert.equal(disk.adminGovernance.proposals.find((p: any) => p.id === id).status, 'invalidated');
  await start(); await request('GET', '/api/auth/me', admins[0], undefined, 401);
  const freshLogin = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[0].email, password: 'Test-login-0!independent' });
  assert(freshLogin.token || freshLogin.user?.token, 'Preserved administrator logs in after recovery');
  admins[0].token = freshLogin.token || freshLogin.user?.token;
  const secondLogin = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[1].email, password: 'Test-login-1!independent' });
  admins[1].token = secondLogin.token || secondLogin.user?.token;
  for (let i = 2; i < 5; i++) {
    const session = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[i].email, password: `Test-login-${i}!independent` });
    admins[i].token = session.token || session.user?.token;
  }
  const removedSlot = (await view()).members.find((m: any) => m.id === admins[4].id).slot;
  const change = await post(`/members/${admins[4].id}/changes`, admins[0], { privateKey: keys[0], action: 'remove', reason: 'Isolated founder replacement' });
  await post(`/changes/${change.id}/vote`, admins[1], { privateKey: keys[1], decision: 'approved' });
  assert.equal((await view(admins[2])).changes.find((c: any) => c.id === change.id).status, 'pending', 'Two approvals keep voting open');
  assert(!(await view(admins[4])).changes.some((c: any) => c.id === change.id), 'Target is notified only after four approvals');
  await post(`/changes/${change.id}/vote`, admins[4], { privateKey: keys[4], decision: 'approved' }, 403);
  for (let i = 2; i <= 3; i++) await post(`/changes/${change.id}/vote`, admins[i], { privateKey: keys[i], decision: 'approved' });
  await post(`/changes/${change.id}/confirm-removal`, admins[0], { privateKey: keys[0], confirmation: 'REMOVE ADMINISTRATOR' }, 409);
  await post(`/changes/${change.id}/plea`, admins[3], { message: 'Impersonating the targeted administrator', targetId: admins[4].id }, 403);
  await post(`/changes/${change.id}/plea`, undefined, { message: 'Unauthenticated plea' }, 401);
  await stop(); await start();
  assert.equal((await view(admins[4])).changes.find((c: any) => c.id === change.id).status, 'awaiting-plea', 'Plea window persists across restart');
  await post(`/changes/${change.id}/plea`, admins[4], { message: 'Please reconsider my removal.' });
  assert(!(await view(admins[2])).changes.find((c: any) => c.id === change.id).plea, 'Plea text is private to main and target');
  await post(`/changes/${change.id}/plea/decision`, admins[1], { privateKey: keys[1], decision: 'rejected', reason: 'Unauthorized decision' }, 403);
  await post(`/changes/${change.id}/plea/decision`, admins[0], { privateKey: keys[0], decision: 'rejected', reason: 'Replacement remains necessary.' });
  const targetNotices = (await request('GET', '/api/notifications', admins[4], undefined));
  // Notifications are arrays; the request helper adds a status property, retaining numeric entries.
  assert(Object.values(targetNotices).some((n: any) => n?.title === 'Plea rejected' && n.targetAccountId === admins[4].id));
  const otherNotices = await request('GET', '/api/notifications', admins[2], undefined);
  assert(!Object.values(otherNotices).some((n: any) => n?.changeId === change.id), 'Other admins cannot read target or main notifications');
  await post(`/changes/${change.id}/plea/acknowledge`, admins[4], {});
  await post(`/changes/${change.id}/confirm-removal`, admins[1], { privateKey: keys[1], confirmation: 'REMOVE ADMINISTRATOR' }, 403);
  await post(`/changes/${change.id}/confirm-removal`, admins[0], { privateKey: keys[0], confirmation: 'REMOVE ADMINISTRATOR' });
  await request('GET', '/api/auth/me', admins[4], undefined, 401);
  await request('POST', '/api/auth/login', undefined, { usernameOrEmail: admins[4].email, password: 'Test-login-4!independent' }, 401);
  const invite = await post('/invitations', admins[0], { privateKey: keys[0], name: 'New isolated founder', email: 'newfounder@example.test' });
  await request('POST', '/api/auth/admin-invitation/accept', undefined, {}, 400);
  await request('POST', '/api/auth/admin-invitation/accept', undefined, { invitationToken: crypto.randomBytes(32).toString('base64url'), password: 'Distinct-founder-login!123' }, 403);
  const enrolled = await request('POST', '/api/auth/admin-invitation/accept', undefined, { invitationToken: invite.invitationToken, password: 'Distinct-founder-login!123', slot: 1, id: admins[0].id, name: 'Forged name' });
  assert.equal(enrolled.slot, removedSlot); assert.notEqual(enrolled.id, admins[0].id); assert.equal(enrolled.privateKey.length, 43);
  await request('POST', '/api/auth/admin-invitation/accept', undefined, { invitationToken: invite.invitationToken, password: 'Distinct-founder-login!123' }, 403);
  const newLogin = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: enrolled.email, password: 'Distinct-founder-login!123' });
  const enrolledView = await view({ token: newLogin.token || newLogin.user?.token } as any);
  assert.equal(enrolledView.members.length, 5); assert.equal(enrolledView.members.find((m: any) => m.id === enrolled.id).name, 'New isolated founder');

});
