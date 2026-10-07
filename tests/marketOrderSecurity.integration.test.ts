import { paidMarketFixture } from './paidMarketFixture.cjs';
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

test('S14/S15: HTTP catalog pricing, strict quantities, legacy orders and concurrent stock consumption survive restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-market-orders-'));
  const dataDir = path.join(temp, 'data'), db = path.join(dataDir, 'pinevela_store.json');
  const buyer = { id: crypto.randomUUID(), role: 'user', email: crypto.randomUUID() + '@example.test', token: crypto.randomUUID() };
  const app = { id: crypto.randomUUID(), userId: crypto.randomUUID(), studentEmail: crypto.randomUUID() + '@example.test', status: 'approved', merchantToken: crypto.randomUUID() };
  const seller = { id: crypto.randomUUID(), userId: app.userId, studentEmail: app.studentEmail, storeName: 'Isolated test store', status: 'active', isBanned: false };
  const otherApp = { ...app, id: crypto.randomUUID(), userId: crypto.randomUUID(), studentEmail: crypto.randomUUID() + '@example.test', merchantToken: crypto.randomUUID() };
  const otherSeller = { ...seller, id: crypto.randomUUID(), userId: otherApp.userId, studentEmail: otherApp.studentEmail };
  const product = { id: crypto.randomUUID(), storeId: seller.id, sellerId: seller.userId, sellerEmail: seller.studentEmail, title: 'Isolated test product', price: 100, stockQuantity: 2, isAvailable: true,
    priceCategories: [{ id: crypto.randomUUID(), name: 'Catalog category', price: 125.25 }] };
  const service = { ...product, id: crypto.randomUUID(), isService: true, serviceLocationMode: 'fixed', location: 'Stored service location', lat: 0, lng: 0, stockQuantity: 99 };
  const corrupt = { id: crypto.randomUUID(), productId: product.id, sellerEmail: seller.studentEmail, storeId: seller.id, quantity: -2, productPrice: 100, totalAmount: -200, status: 'Pending Meetup', otpPin: '1234' };
  await fs.mkdir(dataDir); await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer], digitalMarketApplications: [app, otherApp], ...paidMarketFixture([seller, otherSeller]), digitalMarketProducts: [product, service], digitalMarketOrders: [corrupt] }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d);
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch { /* Starting. */ } if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); }
    assert.fail(logs);
  };
  const request = async (route: string, body: any, token: string = buyer.token) => {
    const res = await fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    return { status: res.status, data: await res.json() };
  };
  const checked = async (route: string, body: any, expected: number, token?: string) => { const result = await request(route, body, token); assert.equal(result.status, expected, result.data.error); return result.data; };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const create = (extra: any = {}) => ({ productId: product.id, quantity: 1, buyerId: buyer.id, buyerEmail: buyer.email, buyerName: 'Isolated buyer', ...extra });
  const update = (id: string) => `/api/digital-market/orders/${id}/update-status`;
  await start();
  const before = await read();
  for (const quantity of [undefined, null, 0, -2, .5, 1.5, '2', '', true, [], {}, 1e100]) await checked('/api/digital-market/orders', create({ quantity }), 400);
  for (const category of [{ priceCategoryId: crypto.randomUUID() }, { priceCategoryName: 'Forged' }, { priceCategoryId: product.priceCategories[0].id, priceCategoryName: 'Forged' }, { priceCategoryName: {} }]) await checked('/api/digital-market/orders', create(category), 400);
  await checked('/api/digital-market/orders', create({ quantity: 3 }), 409);
  await checked(update(corrupt.id), { newStatus: 'completed', inputPin: '1234' }, 409, app.merchantToken);
  const unchanged = await read(); assert.deepEqual(unchanged.digitalMarketOrders, before.digitalMarketOrders); assert.deepEqual(unchanged.digitalMarketProducts, before.digitalMarketProducts);
  for (const price of [0, 1, -1, '0', null, { value: 1 }]) {
    const { order } = await checked('/api/digital-market/orders', create({ price }), 201);
    assert.equal(order.productPrice, 100); assert.equal(order.totalAmount, 100); assert.equal(order.priceCategory, undefined);
    await checked(update(order.id), { newStatus: 'Cancelled' }, 200);
  }
  const { order: cat } = await checked('/api/digital-market/orders', create({ price: 1, priceCategoryId: product.priceCategories[0].id, priceCategoryName: product.priceCategories[0].name }), 201);
  assert.equal(cat.productPrice, 125.25); assert.equal(cat.priceCategoryId, product.priceCategories[0].id); assert.equal(cat.productTitle, `${product.title} (${product.priceCategories[0].name})`);
  await checked(update(cat.id), { newStatus: 'Cancelled' }, 200);
  const named = await checked('/api/digital-market/orders', create({ priceCategory: product.priceCategories[0].name }), 201); assert.equal(named.order.totalAmount, 125.25);
  await checked(update(named.order.id), { newStatus: 'Cancelled' }, 200, buyer.token);
  await checked(update(named.order.id), { action: 'agree-location' }, 409, app.merchantToken);
  const serviceOrder = await checked('/api/digital-market/orders', create({ productId: service.id, serviceLocationOption: 'seller-location', meetingLocation: 'Forged location', meetingLatitude: 90, meetingLongitude: 180, price: 1 }), 201);
  assert.equal(serviceOrder.order.meetingLatitude, 0); assert.equal(serviceOrder.order.meetingLongitude, 0);
  assert.equal(serviceOrder.order.meetingLocation, service.location); assert.equal(serviceOrder.order.productPrice, 100);
  const a = (await checked('/api/digital-market/orders', create({ quantity: 2, price: 1 }), 201)).order;
  await checked('/api/digital-market/orders', create({ quantity: 2 }), 409);
  assert.equal(a.totalAmount, 200);
  await checked(update(a.id), { newStatus: 'completed', inputPin: a.otpPin }, 401, '');
  await checked(update(a.id), { newStatus: 'completed', inputPin: a.otpPin }, 403, otherApp.merchantToken);
  await checked(update(a.id), { action: 'agree-location' }, 403, buyer.token);
  await checked(update(a.id), { action: 'agree-location' }, 200, app.merchantToken);
  await checked(update(a.id), { newStatus: 'completed', inputPin: 'wrong' }, 400, app.merchantToken);
  const results = await Promise.all([a, a].map(o => request(update(o.id), { newStatus: 'completed', inputPin: o.otpPin }, app.merchantToken)));
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const winner = results.find(r => r.status === 200)!.data.order;
  for (const body of [{ action: 'agree-location' }, { action: 'reject-location' },  { newStatus: 'completed', inputPin: winner.otpPin }]) await checked(update(winner.id), body, 409, app.merchantToken);
  await stop(); await start();
  const final = await read(); assert.equal(final.digitalMarketProducts.find((p: any) => p.id === product.id).stockQuantity, 0);
  const savedCategory = final.digitalMarketOrders.find((o: any) => o.id === cat.id);
  assert.equal(savedCategory.productPrice, 125.25); assert.equal(savedCategory.priceCategoryId, product.priceCategories[0].id);
  assert.equal(final.digitalMarketOrders.filter((o: any) => o.productId === product.id && o.status === 'Completed & Paid').length, 1);
  await checked('/api/digital-market/orders', create(), 409);
  await checked(update(winner.id), { action: 'agree-location' }, 409, app.merchantToken);
  await checked(update(winner.id), { newStatus: 'Pending Meetup' }, 400, app.merchantToken);
  await checked(update(serviceOrder.order.id), { action: 'agree-location' }, 200, app.merchantToken);
  // Competing completions of the same order consume only once, independently of item stock.
  const duplicate = await Promise.all([1, 2].map(() => request(update(serviceOrder.order.id), { newStatus: 'completed', inputPin: serviceOrder.order.otpPin }, app.merchantToken)));
  assert.deepEqual(duplicate.map(r => r.status).sort(), [200, 409]);
  assert.equal((await read()).digitalMarketProducts.find((p: any) => p.id === service.id).stockQuantity, 98);
});
