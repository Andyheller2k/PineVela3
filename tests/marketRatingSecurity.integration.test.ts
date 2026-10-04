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

test('S18: live purchase-bound ratings, alias protection, reputation isolation and restart persistence', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-ratings-'));
  const dataDir = path.join(temp, 'data'), db = path.join(dataDir, 'pinevela_store.json');
  const actor = (role: string, email = `${crypto.randomUUID()}@example.test`) => ({ id: crypto.randomUUID(), role, email, name: `Isolated ${role}`, token: crypto.randomUUID() });
  const buyer = actor('user'), otherBuyer = actor('user', buyer.email), admin = actor('admin'), resident = actor('resident'), seller = actor('merchant');
  const merchantStore = { id: crypto.randomUUID(), studentEmail: seller.email, userId: seller.id, storeName: 'Isolated store', status: 'active', isBanned: false, storeRating: 5, ratingCount: 100 };
  Object.assign(seller, { merchantStoreId: merchantStore.id });
  const application = { id: crypto.randomUUID(), userId: seller.id, studentEmail: seller.email, status: 'approved' };
  const product = { id: crypto.randomUUID(), storeId: merchantStore.id, sellerId: seller.id, sellerEmail: seller.email, title: 'Isolated purchase', price: 100, stockQuantity: 10, isAvailable: true, isService: true, rating: 5, reviewCount: 100 };
  const secondProduct = { ...product, id: crypto.randomUUID() };
  // Same seller email cannot combine reputation across independent stores.
  const secondStore = { ...merchantStore, id: crypto.randomUUID() };
  const separateProduct = { ...product, id: crypto.randomUUID(), storeId: secondStore.id };
  const completed = { id: crypto.randomUUID(), productId: product.id, buyerId: buyer.id, buyerEmail: buyer.email, buyerName: buyer.name, sellerEmail: seller.email, storeId: merchantStore.id, status: 'Completed & Paid', quantity: 1, productPrice: 100, totalAmount: 100 };
  const another = { ...completed, id: crypto.randomUUID() };
  const otherItem = { ...completed, id: crypto.randomUUID(), productId: secondProduct.id };
  const separateStoreOrder = { ...completed, id: crypto.randomUUID(), productId: separateProduct.id, storeId: secondStore.id };
  const foreign = { ...completed, id: crypto.randomUUID(), buyerId: otherBuyer.id };
  const pending = { ...completed, id: crypto.randomUUID(), status: 'Pending Meetup' };
  const cancelled = { ...completed, id: crypto.randomUUID(), status: 'Cancelled' };
  const legacy = { id: crypto.randomUUID(), orderId: completed.id, buyerEmail: buyer.email, buyerName: 'Legacy impersonation', sellerEmail: seller.email, storeId: merchantStore.id, productId: product.id, rating: 5, review: 'Unverified legacy review' };
  const oldServiceReview = { ...legacy, id: crypto.randomUUID(), serviceId: product.id };
  await fs.mkdir(dataDir);
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [buyer, otherBuyer, admin, resident, seller], digitalMarketApplications: [application], ...paidMarketFixture([merchantStore, secondStore]), digitalMarketProducts: [product, secondProduct, separateProduct], digitalMarketOrders: [completed, another, otherItem, separateStoreOrder, foreign, pending, cancelled], digitalMarketRatings: [legacy], digitalMarketServiceReviews: [oldServiceReview] }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d);
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); }
    assert.fail(logs);
  };
  const request = async (route: string, body?: any, token = '') => {
    const res = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: res.status, data: await res.json(), cache: res.headers.get('cache-control') };
  };
  const checked = async (route: string, body: any, expected: number, token = buyer.token) => { const result = await request(route, body, token); assert.equal(result.status, expected, result.data.error); if (body !== undefined) assert.equal(result.cache, 'private, no-store'); return result.data; };
  const read = async () => JSON.parse(await fs.readFile(db, 'utf8'));
  const endpoint = '/api/digital-market/ratings', alias = `/api/digital-market/services/${product.id}/reviews`;
  const body = { orderId: completed.id, rating: 4, review: 'Verified purchase review' };
  const publicFields = (row: any) => { for (const key of ['buyerEmail', 'buyerId', 'sellerEmail', 'orderId', 'purchaseVerifiedVersion']) assert(!(key in row), `Private field ${key}`); assert.equal(row.verifiedPurchase, true); };
  await start();
  assert.deepEqual((await checked(`${endpoint}?storeId=${merchantStore.id}`, undefined, 200)).ratings, []);
  assert.equal((await checked(alias, undefined, 200)).reviewCount, 0);
  const before = await read();
  for (const route of [endpoint, alias]) {
    for (const token of ['', crypto.randomUUID()]) assert.equal((await request(route, body, token)).status, 401);
    for (const actor of [admin, seller, resident]) assert.equal((await request(route, body, actor.token)).status, 403);
    await checked(route, body, 403, otherBuyer.token);
    await checked(route, { ...body, orderId: foreign.id }, 403);
    for (const order of [pending, cancelled]) await checked(route, { ...body, orderId: order.id }, 409);
    await checked(route, { rating: 5, review: 'No receipt' }, 400);
    await checked(route, { ...body, orderId: crypto.randomUUID() }, 404);
    for (const field of ['buyerEmail', 'buyerName', 'buyerId', 'sellerEmail', 'storeId', 'purchaseVerifiedVersion']) await checked(route, { ...body, [field]: foreign.id }, 400);
    for (const rating of [0, 6, 2.5, '5', null, false]) await checked(route, { ...body, rating }, 400);
    for (const review of [{}, null, 'a'.repeat(4001)]) await checked(route, { ...body, review }, 400);
  }
  await checked(`/api/digital-market/services/${secondProduct.id}/reviews`, body, 409);
  assert.deepEqual((await read()).digitalMarketRatings, before.digitalMarketRatings);
  assert.deepEqual((await read()).digitalMarketStores, before.digitalMarketStores);
  const created = await checked(endpoint, body, 200);
  assert.equal(created.averageRating, 4); assert.equal(created.ratingCount, 1);
  const stored = (await read()).digitalMarketRatings.find((r: any) => r.purchaseVerifiedVersion === 1);
  assert.equal(stored.buyerId, buyer.id); assert.equal(stored.buyerName, buyer.name); assert.equal(stored.buyerEmail, buyer.email);
  assert.equal(stored.storeId, merchantStore.id); assert.equal(stored.productId, product.id); assert.equal(stored.sellerEmail, seller.email);
  const edited = await checked(alias, { ...body, rating: 2, review: 'Edited own receipt' }, 201);
  assert.equal(edited.ratingRecord.id, created.ratingRecord.id); assert.equal(edited.ratingRecord.createdAt, created.ratingRecord.createdAt);
  assert.equal(edited.averageRating, 2); assert.equal(edited.reviewCount, 1);
  await checked(endpoint, { ...body, rating: 1 }, 403, otherBuyer.token);
  // Separate receipts by the same buyer/store must never overwrite one another.
  await checked(endpoint, { ...body, orderId: another.id, rating: 4 }, 200);
  await checked(endpoint, { ...body, orderId: otherItem.id, rating: 5 }, 200);
  await checked(endpoint, { ...body, orderId: separateStoreOrder.id, rating: 1 }, 200);
  const listed = await checked(`${endpoint}?storeId=${merchantStore.id}`, undefined, 200);
  assert.equal(listed.ratingCount, 3); assert.equal(listed.averageRating, 3.7); listed.ratings.forEach(publicFields);
  const serviceList = await checked(alias, undefined, 200);
  assert.equal(serviceList.averageRating, 3); assert.equal(serviceList.reviewCount, 2); serviceList.reviews.forEach(publicFields);
  // Alias returns item statistics rather than the aggregate of unrelated items in the store.
  const aliasEdit = await checked(alias, { ...body, rating: 2 }, 201); assert.equal(aliasEdit.averageRating, 3); assert.equal(aliasEdit.reviewCount, 2);
  const catalog = await checked(`/api/digital-market/products?storeId=${merchantStore.id}`, undefined, 200);
  assert.equal(catalog.find((p: any) => p.id === product.id).rating, 3);
  assert.equal(catalog.find((p: any) => p.id === product.id).reviewCount, 2);
  assert.equal(catalog.find((p: any) => p.id === product.id).storeRating, 3.7);
  assert.equal(catalog.find((p: any) => p.id === secondProduct.id).rating, 5);
  const separateCatalog = await checked(`/api/digital-market/products?storeId=${secondStore.id}`, undefined, 200);
  assert.equal(separateCatalog[0].storeRating, 1); assert.equal(separateCatalog[0].ratingCount, 1);
  const status = await checked(`/api/digital-market/status?email=${encodeURIComponent(seller.email)}`, undefined, 200, seller.token);
  assert.equal(status.store.storeRating, 3.7); assert.equal(status.store.ratingCount, 3);
  const ownOrders = await checked('/api/digital-market/my-orders', undefined, 200);
  assert.equal(ownOrders.find((o: any) => o.id === completed.id).userRating.rating, 2);
  assert.equal(ownOrders.find((o: any) => o.id === another.id).userRating.rating, 4);
  assert.equal(ownOrders.find((o: any) => o.id === pending.id).userRating, null);
  assert(!JSON.stringify(listed).includes('Legacy impersonation'));
  // Concurrent first writes are serialized to a single review for that purchase.
  const raced = await Promise.all([3, 5].map(rating => request(endpoint, { orderId: foreign.id, rating }, otherBuyer.token)));
  assert.deepEqual(raced.map(r => r.status), [200, 200]);
  assert.equal((await read()).digitalMarketRatings.filter((r: any) => r.orderId === foreign.id && r.purchaseVerifiedVersion === 1).length, 1);
  await stop(); await start();
  const persisted = await read();
  assert.deepEqual(persisted.digitalMarketRatings.find((r: any) => r.id === legacy.id), legacy);
  assert.deepEqual(persisted.digitalMarketServiceReviews, [oldServiceReview]);
  assert.equal((await checked(alias, undefined, 200)).reviewCount, 3);
  await checked(endpoint, { ...body, rating: 5 }, 403, otherBuyer.token);
  await checked(endpoint, { ...body, rating: 1 }, 200);
  assert.equal((await checked('/api/digital-market/my-orders', undefined, 200)).find((o: any) => o.id === completed.id).userRating.rating, 1);
});
