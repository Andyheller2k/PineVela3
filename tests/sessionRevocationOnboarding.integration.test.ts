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
import { accountData, accountId, hashCredential } from '../accountSecurity.js';
import { sessionFixtureJson } from './sessionFixtures.cjs';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('S22/S26: current officer and employment status revoke sessions permanently; onboarding binds approved actors and owned residences across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-s22-s26-'));
  const dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: `Disposable ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID(), password: hashCredential(`Disposable-${role}-2026!`), isVerified: true, verificationStatus: 'approved' });
  const admin = actor('admin'), primary = actor('user'), manager = actor('manager');
  const otherManager = { ...actor('manager'), email: manager.email };
  const pendingManager = { ...actor('manager'), isVerified: false, verificationStatus: 'pending' };
  const officer = { ...actor('verification_team'), fullName: 'Disposable officer', officerId: crypto.randomUUID(), status: 'active' };
  const siblingOfficer = { ...actor('verification_team'), fullName: officer.fullName, officerId: crypto.randomUUID(), status: 'active' };
  const inactiveOfficer = { ...actor('verification_team'), fullName: 'Inactive officer', officerId: crypto.randomUUID(), status: 'inactive' };
  const staff = actor('staff'), resigning = actor('staff'), quitting = actor('staff'), directQuitter = actor('staff'), legacyDismissed = actor('staff');
  const hostel = { id: crypto.randomUUID(), name: 'Disposable residence', managerId: manager.id, managerEmail: manager.email, location: 'Kumasi', isApproved: true };
  const pendingHostel = { ...hostel, id: crypto.randomUUID(), name: 'Pending residence', isApproved: false, totalCapacity: 20, totalRooms: 10, totalBlocks: 1, pricePerYear: 3000 };
  const foreignHostel = { ...pendingHostel, id: crypto.randomUUID(), managerId: otherManager.id };
  const member = (user: any, status = 'Active') => ({ id: crypto.randomUUID(), userId: user.id, name: user.name, email: user.email, hostelId: hostel.id, managerId: manager.id, managerCreated: true, status });
  const roster = member(staff), resignation = member(resigning), quittingMember = member(quitting), dismissed = member(legacyDismissed, 'Dismissed');
  const foreignRequest = { id: crypto.randomUUID(), managerId: otherManager.id, managerEmail: manager.email, status: 'approved' };
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1,
    users: [admin, primary, manager, otherManager, pendingManager, officer, siblingOfficer, { ...inactiveOfficer, status: 'active' }, staff, resigning, quitting, directQuitter, legacyDismissed],
    staff: [roster, resignation, quittingMember, member(directQuitter), dismissed], hostels: [hostel, pendingHostel, foreignHostel],
    verificationTeams: [officer, siblingOfficer, inactiveOfficer], managerRegistrationRequests: [foreignRequest],
    managerVerifications: [{ id: crypto.randomUUID(), managerId: otherManager.id, status: 'approved', documentsVerified: { idFront: 'verified', idBack: 'verified' } }]
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
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json(); assert([expected].flat().includes(response.status), `${method} ${route}: expected ${expected}, got ${response.status}; ${result.error || ''}`); return result;
  };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const noSession = (entry: any) => { assert(!entry?.session && !entry?.token && !entry?.user?.session && !entry?.user?.token); };
  await start();
  for (const route of ['/api/auth/me', '/api/verification-team/me', '/api/verification-team/my-inspections']) {
    await request('GET', route, officer.token, undefined, 200);
    await request('GET', route, inactiveOfficer.token, undefined, 403);
  }
  await request('GET', '/api/auth/me', legacyDismissed.token, undefined, 403);
  const statusRoute = `/api/verification-teams/${officer.id}/status`;
  await request('PUT', statusRoute, undefined, { status: 'suspended' }, 401);
  await request('PUT', statusRoute, manager.token, { status: 'suspended' }, 403);
  for (const status of [null, {}, 'anything', 'Active', 1]) await request('PUT', statusRoute, admin.token, { status }, 400);
  await request('PUT', statusRoute, admin.token, { status: 'suspended', id: siblingOfficer.id }, 400);
  await request('PUT', statusRoute, admin.token, { status: 'suspended' }, 200);
  let disk = await read(); noSession(disk.verificationTeams.find((o: any) => o.id === officer.id)); noSession(disk.users.find((u: any) => accountId(u) === officer.id));
  await request('GET', '/api/auth/me', siblingOfficer.token, undefined, 200);
  for (const route of ['/api/auth/me', '/api/verification-team/me']) await request('GET', route, officer.token, undefined, [401,403]);
  const staleCookie = await fetch(base + '/api/verification-team/me', { headers: { Cookie: `pv_auth_token=${officer.token}`, 'X-PineVela-Session': 'cookie' } });
  assert([401,403].includes(staleCookie.status)); await staleCookie.arrayBuffer();
  await request('POST', '/api/auth/login', undefined, { usernameOrEmail: officer.id, password: 'Disposable-verification_team-2026!' }, 403);
  await request('POST', '/api/verification-teams/login', undefined, { officerId: officer.officerId, password: 'Disposable-verification_team-2026!' }, 403);
  await stop(); await start();
  await request('GET', '/api/auth/me', officer.token, undefined, [401,403]);
  await request('PUT', statusRoute, admin.token, { status: 'active' }, 200);
  await request('GET', '/api/auth/me', officer.token, undefined, [401,403]);
  const freshOfficer = await request('POST', '/api/verification-teams/login', undefined, { officerId: officer.officerId, password: 'Disposable-verification_team-2026!' }, 200);
  await request('GET', '/api/verification-team/me', freshOfficer.token || freshOfficer.user?.token, undefined, 200);
  await request('PUT', statusRoute, admin.token, { status: 'inactive' }, 200);
  await request('GET', '/api/auth/me', freshOfficer.token || freshOfficer.user?.token, undefined, [401,403]);
  await request('PUT', `/api/staff/${roster.id}`, otherManager.token, { status: 'Suspended' }, 403);
  for (const status of ['', 'unknown', {}]) await request('PUT', `/api/staff/${roster.id}`, manager.token, { status }, 400);
  await request('PUT', `/api/staff/${roster.id}`, manager.token, { status: 'Suspended' }, 200);
  await request('GET', '/api/auth/me', staff.token, undefined, [401,403]);
  noSession((await read()).users.find((u: any) => accountId(u) === staff.id));
  await request('PUT', `/api/staff/${roster.id}`, manager.token, { status: 'Active' }, 200);
  await request('GET', '/api/auth/me', staff.token, undefined, [401,403]);
  const staffLogin = await request('POST', '/api/auth/login', undefined, { usernameOrEmail: staff.email, password: 'Disposable-staff-2026!' }, 200);
  const staffToken = staffLogin.token || staffLogin.user?.token;
  await stop(); await start();
  await request('GET', '/api/auth/me', staffToken, undefined, 200);
  await request('DELETE', `/api/staff/${roster.id}`, otherManager.token, {}, 403);
  await request('DELETE', `/api/staff/${roster.id}`, manager.token, {}, 200);
  await request('GET', '/api/auth/me', staffToken, undefined, [401,403]);
  await request('POST', '/api/staff/resign', resigning.token, { reason: 'Ending disposable employment' }, 200);
  await request('GET', '/api/auth/me', resigning.token, undefined, [401,403]);
  noSession((await read()).users.find((u: any) => accountId(u) === resigning.id));
  const bargain = (await request('POST', '/api/staff-bargains', quitting.token, { reasonToQuit: 'Leaving disposable employment', isBargain: true, bargainProposal: { proposedTerms: 'Change the shift schedule' } }, 200)).bargain;
  await request('POST', `/api/staff-bargains/${bargain.id}/manager-response`, manager.token, { action: 'reject' }, 200);
  await request('POST', `/api/staff-bargains/${bargain.id}/staff-decision`, quitting.token, { decision: 'quit' }, 200);
  await request('GET', '/api/auth/me', quitting.token, undefined, [401,403]);
  noSession((await read()).users.find((u: any) => accountId(u) === quitting.id));
  await request('POST', '/api/staff-bargains', directQuitter.token, { reasonToQuit: 'Ending disposable contract', isBargain: false }, 200);
  await request('GET', '/api/auth/me', directQuitter.token, undefined, [401,403]);
  noSession((await read()).users.find((u: any) => accountId(u) === directQuitter.id));

  const submit = '/api/hostel-verifications/submit';
  const body = { hostelId: pendingHostel.id, hostelName: pendingHostel.name, digitalAddress: 'AK-123-1234', proofOfOwnershipUrl: '/private-document-reference', managerId: otherManager.id, managerEmail: 'forged@example.test', managerName: 'Forged author', status: 'approved', managerApproved: false, identityVerified: true, validationPassed: true, systemValidation: { identityVerified: true }, paymentStatus: 'paid' };
  const before = await read();
  await request('POST', submit, undefined, body, 401);
  for (const token of [primary.token, admin.token, pendingManager.token]) await request('POST', submit, token, body, 403);
  await request('POST', submit, otherManager.token, body, 403);
  await request('POST', submit, manager.token, { ...body, hostelId: 'missing' }, 403);
  await request('POST', submit, manager.token, { ...body, hostelId: {} }, 400);
  await request('POST', submit, manager.token, { ...body, hostelId: hostel.id }, 409);
  await request('POST', submit, manager.token, { ...body, digitalAddress: {} }, 400);
  assert.deepEqual((await read()).hostelVerifications, before.hostelVerifications);
  const submitted = (await request('POST', submit, manager.token, body, 201)).verification;
  assert.equal(submitted.managerId, manager.id); assert.equal(submitted.managerEmail, manager.email); assert.equal(submitted.managerName, manager.name);
  assert.equal(submitted.systemValidation.identityVerified, false); assert.equal(submitted.validationPassed, false); assert.equal(submitted.status, 'under_admin_review'); assert.equal(submitted.paymentStatus, 'unpaid');
  assert.deepEqual((await read()).hostels, before.hostels);
  assert.equal((await read()).hostelVerifications.filter((v: any) => v.id === submitted.id).length, 1);
  await request('POST', submit, manager.token, body, 409);
  const verifiedIdentity = (await request('POST', submit, otherManager.token, { ...body, hostelId: foreignHostel.id, hostelName: foreignHostel.name }, 201)).verification;
  assert.equal(verifiedIdentity.systemValidation.identityVerified, true);
  await request('POST', '/api/manager-requests', undefined, { propertyName: 'Spoofed' }, 401);
  for (const token of [primary.token, admin.token]) await request('POST', '/api/manager-requests', token, { propertyName: 'Spoofed' }, 403);
  await request('POST', '/api/manager-requests', manager.token, { propertyName: {} }, 400);
  const own = await request('POST', '/api/manager-requests', manager.token, { propertyName: 'Own request', managerId: otherManager.id, managerEmail: 'forged@example.test', managerName: 'Forged', status: 'approved' }, 201);
  assert.equal(own.request.managerId, manager.id); assert.equal(own.request.managerEmail, manager.email); assert.equal(own.request.status, 'pending'); assert.notEqual(own.request.id, foreignRequest.id);
  await request('POST', '/api/staff-applications', undefined, {}, 404);
  await stop(); await start();
  disk = await read(); assert.equal(disk.hostelVerifications.find((v: any) => v.id === submitted.id).managerId, manager.id);
  await request('GET', '/api/auth/me', staffToken, undefined, [401,403]);
  await request('GET', '/api/auth/me', freshOfficer.token || freshOfficer.user?.token, undefined, [401,403]);
  await request('GET', '/api/auth/me', siblingOfficer.token, undefined, 200);
  assert.equal(accountData(disk.users.find((u: any) => accountId(u) === primary.id)).role, 'user');
});
