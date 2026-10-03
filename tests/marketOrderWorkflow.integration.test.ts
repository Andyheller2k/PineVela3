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
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('S16/S17: private PINs, expiry, persistent lockouts, closed transitions and atomic reservations', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-market-orders-'));
  const dataDir = path.join(temp, 'data'), db = path.join(dataDir, 'pinevela_store.json');
  const buyer = { id: crypto.randomUUID(), role: 'user', email: crypto.randomUUID() + '@example.test', token: crypto.randomUUID() };
  const app = { id: crypto.randomUUID(), userId: crypto.randomUUID(), studentEmail: crypto.randomUUID() + '@example.test', status: 'approved', merchantToken: crypto.randomUUID() };
  const seller = { id: crypto.randomUUID(), userId: app.userId, studentEmail: app.studentEmail, storeName: 'Isolated test store', status: 'active', isBanned: false };
  const otherApp = { ...app, id: crypto.randomUUID(), userId: crypto.randomUUID(), studentEmail: crypto.randomUUID() + '@example.test', merchantToken: crypto.randomUUID() };
  const otherSeller = { ...seller, id: crypto.randomUUID(), userId: otherApp.userId, studentEmail: otherApp.studentEmail };
  const otherBuyer = { ...buyer, id: crypto.randomUUID(), token: crypto.randomUUID() };
  const admin = { ...buyer, id: crypto.randomUUID(), role: 'admin', email: crypto.randomUUID() + '@example.test', token: crypto.randomUUID() };
  const parent = { ...buyer, id: app.userId, email: app.studentEmail, token: crypto.randomUUID() };
  const product = { id: crypto.randomUUID(), storeId: seller.id, sellerId: seller.userId, sellerEmail: seller.studentEmail, title: 'Isolated test product', price: 100, stockQuantity: 30, isAvailable: true,
    priceCategories: [{ id: crypto.randomUUID(), name: 'Catalog category', price: 125.25 }] };
  const service = { ...product, id: crypto.randomUUID(), isService: true, serviceLocationMode: 'fixed', location: 'Stored service location', stockQuantity: 99 };
  const race = { ...product, id: crypto.randomUUID(), stockQuantity: 2 };
  const corrupt = { id: crypto.randomUUID(), productId: product.id, sellerEmail: seller.studentEmail, storeId: seller.id, quantity: -2, productPrice: 100, totalAmount: -200, status: 'Pending Meetup', otpPin: '1234' };
  await fs.mkdir(dataDir); await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, otherBuyer, admin, parent], digitalMarketApplications: [app, otherApp], digitalMarketStores: [seller, otherSeller], digitalMarketProducts: [product, service, race], digitalMarketOrders: [corrupt] }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined; let serverErrors = '';
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => { logs += d; serverErrors += d; });
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch { /* Starting. */ } if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); }
    assert.fail(logs);
  };
  const request = async (route: string, body: any, token: string = buyer.token) => {
    const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const checked = async (route: string, body: any, expected: number, token?: string) => { const result = await request(route, body, token); assert.equal(result.status, expected, result.data.error + (result.status === 500 ? serverErrors : '')); return result.data; };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const create = (extra: any = {}) => ({ productId: product.id, quantity: 1, buyerId: buyer.id, buyerEmail: buyer.email, buyerName: 'Isolated buyer', ...extra });
  const update = (id: string) => `/api/digital-market/orders/${id}/update-status`;
  const renew = (id: string) => `/api/digital-market/orders/${id}/renew-pin`;
  const list = async (token: string, expected = 200) => {
    const res = await fetch(base + '/api/digital-market/my-orders', { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    assert.equal(res.status, expected);
    if (res.ok) assert.equal(res.headers.get('cache-control'), 'private, no-store');
    return res.json();
  };
  const privateFields = (value: any): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      assert(!/^(otpPin|deliveryPin|stockReserv)/.test(key), `Private field exposed: ${key}`);
      privateFields(child);
    }
  };
  await start();
  await list('', 401); await list(crypto.randomUUID(), 401);
  await checked('/api/digital-market/orders', create(), 401, '');
  await checked('/api/digital-market/orders', create(), 403, app.merchantToken);
  await checked('/api/digital-market/orders', create(), 403, admin.token);
  const placed = await checked('/api/digital-market/orders', create({ buyerId: otherBuyer.id, buyerEmail: otherBuyer.email, buyerName: 'Forged identity' }), 201);
  const order = placed.order;
  assert.match(order.otpPin, /^\d{6}$/); assert.equal(order.buyerId, buyer.id); assert.equal(order.buyerEmail, buyer.email);
  assert.notEqual(order.buyerName, 'Forged identity');
  assert.equal(order.deliveryPinState, 'active');
  assert.equal((await list(buyer.token)).find((o: any) => o.id === order.id).otpPin, order.otpPin);
  assert(!(await list(otherBuyer.token)).some((o: any) => o.id === order.id));
  assert.deepEqual(await list(parent.token), []);
  privateFields(await list(app.merchantToken)); privateFields(await list(admin.token));
  await checked(update(order.id), { newStatus: 'Completed & Paid', inputPin: order.otpPin }, 409, app.merchantToken);
  await checked(update(order.id), { action: 'agree-location' }, 401, '');
  for (const actor of [buyer, otherBuyer, admin]) await checked(update(order.id), { action: 'agree-location' }, 403, actor.token);
  await checked(update(order.id), { action: 'agree-location' }, 403, otherApp.merchantToken);
  const unchanged = await read();
  for (const body of [{ status: 'Inspected & Met' }, { status: 'Pending Meetup' }, { status: 'anything' }, {}, { status: 1 }, { action: 'agree-location', newStatus: 'Cancelled' }, { action: 'agree-location', buyerId: otherBuyer.id }, { status: 'completed', inputPin: order.otpPin, otpPin: '000000' }]) {
    await checked(update(order.id), body, 400, app.merchantToken);
  }
  assert.deepEqual((await read()).digitalMarketOrders, unchanged.digitalMarketOrders);
  privateFields(await checked(update(order.id), { action: 'agree-location' }, 200, app.merchantToken));
  await checked(update(order.id), { action: 'agree-location' }, 409, app.merchantToken);
  await checked(update(order.id), { action: 'reject-location' }, 409, app.merchantToken);
  await checked(update(order.id), { status: 'completed', inputPin: order.otpPin }, 403, buyer.token);
  await checked(update(order.id), { status: 'completed', inputPin: order.otpPin }, 403, admin.token);
  const wrong = order.otpPin === '100000' ? '100001' : '100000';
  for (const inputPin of [wrong, 123456, { pin: order.otpPin }]) await checked(update(order.id), { status: 'completed', inputPin }, 400, app.merchantToken);
  assert.equal((await read()).digitalMarketOrders.find((o: any) => o.id === order.id).deliveryPinAttempts, 3);
  await stop(); await start();
  await checked(update(order.id), { status: 'completed', inputPin: wrong }, 400, app.merchantToken);
  await checked(update(order.id), { status: 'completed', inputPin: wrong }, 429, app.merchantToken);
  await checked(update(order.id), { status: 'completed', inputPin: order.otpPin }, 429, app.merchantToken);
  assert.equal((await read()).digitalMarketProducts.find((p: any) => p.id === product.id).stockQuantity, 30);
  const locked = (await list(buyer.token)).find((o: any) => o.id === order.id);
  assert.equal(locked.deliveryPinState, 'locked'); assert.equal(locked.otpPin, undefined);
  for (const token of [otherBuyer.token, parent.token, admin.token, app.merchantToken]) await checked(renew(order.id), {}, 403, token);
  await checked(renew(order.id), {}, 401, '');
  await checked(renew(order.id), { otpPin: '123456' }, 400);
  await checked(renew(order.id), {}, 429); // Immediate issuance is throttled, even for the buyer.
  await stop();
  const state = await read();
  const storedOrder = state.digitalMarketOrders.find((o: any) => o.id === order.id);
  storedOrder.deliveryPinIssuedAt = new Date(Date.now() - 120000).toISOString();
  const expired = { ...storedOrder, id: crypto.randomUUID(), status: 'Awaiting Seller Confirmation', sellerConfirmed: false, sellerAgreedLocation: false,
    deliveryPinAttempts: 0, deliveryPinExpiresAt: new Date(Date.now() - 1).toISOString(), stockReservedUntil: new Date(Date.now() - 1).toISOString() };
  const expiredPending = { ...expired, id: crypto.randomUUID(), status: 'Pending Meetup', sellerConfirmed: true, sellerAgreedLocation: true };
  const legacy = { ...expired, id: crypto.randomUUID(), otpPin: '1234', deliveryPinVersion: undefined, stockReservationVersion: undefined };
  state.digitalMarketOrders.push(expired, expiredPending, legacy);
  await fs.writeFile(db, sessionFixtureJson(state)); await start();
  const buyerList = await list(buyer.token);
  assert.equal(buyerList.find((o: any) => o.id === expired.id).deliveryPinState, 'expired');
  assert.equal(buyerList.find((o: any) => o.id === expired.id).otpPin, undefined);
  assert.equal(buyerList.find((o: any) => o.id === legacy.id).otpPin, undefined);
  privateFields(await list(app.merchantToken));
  await checked(update(expired.id), { action: 'agree-location' }, 409, app.merchantToken);
  await checked(update(expiredPending.id), { status: 'completed', inputPin: expiredPending.otpPin }, 409, app.merchantToken);
  const renewed = (await checked(renew(order.id), {}, 200)).order;
  assert.notEqual(renewed.otpPin, order.otpPin);
  assert.equal(renewed.deliveryPinState, 'active'); assert.match(renewed.otpPin, /^\d{6}$/);
  assert.equal((await read()).digitalMarketOrders.find((o: any) => o.id === order.id).deliveryPinAttempts, 0);
  const completed = await checked(update(order.id), { status: 'completed', inputPin: renewed.otpPin, notes: `PIN (${renewed.otpPin})` }, 200, app.merchantToken);
  privateFields(completed); assert(!JSON.stringify(completed).includes(renewed.otpPin));
  assert.equal((await read()).digitalMarketProducts.find((p: any) => p.id === product.id).stockQuantity, 29);
  for (const body of [{ action: 'agree-location' }, { action: 'reject-location' }, { status: 'Cancelled' }, { status: 'completed', inputPin: renewed.otpPin }]) await checked(update(order.id), body, 409, app.merchantToken);
  await checked(renew(order.id), {}, 409);
  const legacyRenewed = (await checked(renew(legacy.id), {}, 200)).order;
  assert.match(legacyRenewed.otpPin, /^\d{6}$/); assert.notEqual(legacyRenewed.otpPin, '1234');
  await checked(update(legacy.id), { action: 'agree-location' }, 200, app.merchantToken);
  await checked(update(legacy.id), { status: 'completed', inputPin: '1234' }, 400, app.merchantToken);
  assert.equal((await checked(update(legacy.id), { action: 'Cancelled' }, 200)).order.otpPin, undefined);
  // Competing creation requests cannot reserve the same final units.
  const attempts = await Promise.all([1, 2].map(() => request('/api/digital-market/orders', create({ productId: race.id, quantity: 2 }))));
  assert.deepEqual(attempts.map(r => r.status).sort(), [201, 409]);
  const reserved = attempts.find(r => r.status === 201)!.data.order;
  await stop(); await start();
  await checked('/api/digital-market/orders', create({ productId: race.id, quantity: 1 }), 409);
  await checked(update(reserved.id), { status: 'Cancelled' }, 200);
  const rejected = (await checked('/api/digital-market/orders', create({ productId: race.id, quantity: 2 }), 201)).order;
  privateFields(await checked(update(rejected.id), { action: 'reject-location' }, 200, app.merchantToken));
  await checked(update(rejected.id), { action: 'agree-location' }, 409, app.merchantToken);
  const expiredReservation = (await checked('/api/digital-market/orders', create({ productId: race.id, quantity: 2 }), 201)).order;
  await stop(); const expiryState = await read();
  const expiring = expiryState.digitalMarketOrders.find((o: any) => o.id === expiredReservation.id);
  expiring.stockReservedUntil = new Date(Date.now() - 1).toISOString(); expiring.deliveryPinExpiresAt = expiring.stockReservedUntil;
  expiring.deliveryPinIssuedAt = new Date(Date.now() - 120000).toISOString();
  await fs.writeFile(db, sessionFixtureJson(expiryState)); await start();
  // Expired reservations release capacity without a destructive data migration or scheduler.
  const replacements = await Promise.all([1, 2].map(() => checked('/api/digital-market/orders', create({ productId: race.id, quantity: 1 }), 201)));
  await checked(renew(expiredReservation.id), {}, 409);
  for (const replacement of replacements) privateFields(await checked(update(replacement.order.id), { action: 'agree-location' }, 200, app.merchantToken));
  const results = await Promise.all(replacements.map(r => request(update(r.order.id), { status: 'completed', inputPin: r.order.otpPin }, app.merchantToken)));
  assert.deepEqual(results.map(r => r.status), [200, 200]); results.forEach(r => privateFields(r.data));
  assert.equal((await read()).digitalMarketProducts.find((p: any) => p.id === race.id).stockQuantity, 0);
  for (const r of replacements) await checked(update(r.order.id), { status: 'completed', inputPin: r.order.otpPin }, 409, app.merchantToken);
  await stop(); await start();
  assert.equal((await read()).digitalMarketProducts.find((p: any) => p.id === race.id).stockQuantity, 0);
  assert.equal((await list(buyer.token)).find((o: any) => o.id === order.id).otpPin, undefined);
  privateFields(await list(app.merchantToken)); privateFields(await list(admin.token));
  const concurrentPin = (await checked('/api/digital-market/orders', create(), 201)).order;
  await checked(update(concurrentPin.id), { action: 'agree-location' }, 200, app.merchantToken);
  const wrongPin = concurrentPin.otpPin === '100000' ? '100001' : '100000';
  const guesses = await Promise.all([1, 2, 3, 4, 5].map(() => request(update(concurrentPin.id), { status: 'completed', inputPin: wrongPin }, app.merchantToken)));
  assert.deepEqual(guesses.map(r => r.status).sort(), [400, 400, 400, 400, 429]);
  assert.equal((await read()).digitalMarketOrders.find((o: any) => o.id === concurrentPin.id).deliveryPinAttempts, 5);
  await checked(update(concurrentPin.id), { status: 'completed', inputPin: concurrentPin.otpPin }, 429, app.merchantToken);
});
