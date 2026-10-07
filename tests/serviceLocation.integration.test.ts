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
import sharp from 'sharp';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loader = pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href;

test('Service discovery pins: authorized publication, malformed input, ownership isolation and authoritative booking survive restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-service-pins-'));
  const dataDir = path.join(temp, 'data'), uploadDir = path.join(temp, 'uploads'), database = path.join(dataDir, 'pinevela_store.json');
  await fs.mkdir(dataDir);
  const actor = (role: string) => ({ id: crypto.randomUUID(), role, name: `Isolated ${role}`, email: `${crypto.randomUUID()}@example.test`, token: crypto.randomUUID() });
  const owner = actor('user'), buyer = actor('user'), seller = actor('merchant'), foreign = actor('merchant'), admin = actor('admin');
  const market = (merchant: any, primaryId: string) => ({ id: crypto.randomUUID(), userId: primaryId, studentEmail: merchant.email, storeName: `Isolated ${merchant.id}`, status: 'active', setupCompleted: true, subscriptionPlan: 'pro', registrationFeePaid: true });
  const sellerStore = market(seller, owner.id), foreignStore = market(foreign, crypto.randomUUID());
  Object.assign(seller, { merchantStoreId: sellerStore.id, parentUserId: owner.id });
  Object.assign(foreign, { merchantStoreId: foreignStore.id });
  const product = { id: crypto.randomUUID(), storeId: sellerStore.id, sellerEmail: seller.email, title: 'Isolated purchased item', price: 10, stockQuantity: 20, isAvailable: true, imageUrl: '/images/company/about-us.jpg' };
  const completed = { id: crypto.randomUUID(), buyerId: buyer.id, buyerEmail: buyer.email, buyerName: buyer.name, productId: product.id, productTitle: product.title, storeId: sellerStore.id, sellerEmail: seller.email, status: 'Completed & Paid' };
  const ownCompleted = { ...completed, id: crypto.randomUUID(), buyerId: owner.id, buyerEmail: owner.email };
  await fs.writeFile(database, sessionFixtureJson({ accountSecurityVersion: 1, credentialExposureVersion: 1,
    users: [owner, buyer, seller, foreign, admin], ...paidMarketFixture([sellerStore, foreignStore]),
    digitalMarketApplications: [seller, foreign].map(u => ({ id: crypto.randomUUID(), studentEmail: u.email, status: 'approved' })),
    digitalMarketProducts: [product], digitalMarketOrders: [completed, ownCompleted] }));
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port; await new Promise<void>(r => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined;
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    let logs = '';
    child = spawn(process.execPath, ['--import', loader, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: uploadDir }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', d => logs += d); child.stderr?.on('data', d => logs += d);
    for (let i = 0; i < 250; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(r => setTimeout(r, 100)); }
    assert.fail(logs);
  };
  const request = async (route: string, token: string, body?: any, method = body === undefined ? 'GET' : 'POST', expected = 200) => {
    const res = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await res.json(); assert.equal(res.status, expected, data.error || route); return data;
  };
  const uploadRoute = '/api/storage/upload-market-image';
  const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: '#1255cc' } }).jpeg().toBuffer();
  const photo = { fileType: 'image/jpeg', fileData: jpeg.toString('base64') };
  await start();
  const imageUrl = (await request(uploadRoute, seller.token, photo)).imageUrl;
  const serviceBody = { storeId: sellerStore.id, title: 'Mapped service', description: 'Location contract check', category: 'Services', isService: true, price: 20, stockQuantity: 20, imageUrl };
  const mappedBody = { ...serviceBody, title: 'Mapped service', serviceLocationMode: 'fixed', location: 'Provider base', lat: 0, lng: 0 };
  for (const patch of [{ lat: null }, { lng: 181 }, { lat: true }, { lat: undefined, lng: undefined }])
    await request('/api/digital-market/products', seller.token, { ...mappedBody, ...patch }, 'POST', 400);
  await request('/api/digital-market/products', '', mappedBody, 'POST', 401);
  const mapped = (await request('/api/digital-market/products', seller.token, mappedBody, 'POST', 201)).product;
  assert.equal(mapped.lat, 0); assert.equal(mapped.lng, 0);
  for (const [token, expected] of [[foreign.token, 403], [owner.token, 403], ['', 401]] as const)
    await request(`/api/digital-market/products/${mapped.id}`, token, { lat: 1, lng: 1, sellerId: seller.id }, 'PUT', expected);
  const locationBefore = JSON.parse(await fs.readFile(database, 'utf8')).digitalMarketProducts;
  for (const patch of [{ lat: null }, { lng: -181 }, { location: '', meetingLocation: '' }, { lat: 'javascript:alert(1)' }])
    await request(`/api/digital-market/products/${mapped.id}`, seller.token, { title: 'Invalid mutation', ...patch }, 'PUT', 400);
  assert.deepEqual(JSON.parse(await fs.readFile(database, 'utf8')).digitalMarketProducts, locationBefore, 'Invalid pins cannot partially mutate a listing');
  await request(`/api/digital-market/products/${mapped.id}`, seller.token, { serviceLocationMode: 'hybrid', lat: 1, lng: 2 }, 'PUT');
  const validOrder = (await request('/api/digital-market/orders', buyer.token, { productId: mapped.id, quantity: 1, serviceLocationOption: 'seller-location', meetingLocation: 'Forged base', meetingLatitude: 55, meetingLongitude: 66 }, 'POST', 201)).order;
  assert.equal(validOrder.meetingLatitude, 1); assert.equal(validOrder.meetingLongitude, 2); assert.equal(validOrder.meetingLocation, 'Provider base');
  for (const patch of [{ meetingLatitude: 91, meetingLongitude: 0 }, { meetingLatitude: true, meetingLongitude: 0 }, { meetingLatitude: 1 }])
    await request('/api/digital-market/orders', buyer.token, { productId: mapped.id, quantity: 1, serviceLocationOption: 'buyer-location', meetingLocation: 'Buyer meeting point', ...patch }, 'POST', 400);
  await stop(); await start();
  const catalog = await request('/api/digital-market/products', '');
  const restored = catalog.find((p: any) => p.id === mapped.id);
  assert.equal(restored.serviceLocationMode, 'hybrid'); assert.equal(restored.lat, 1); assert.equal(restored.lng, 2);
  const orders = (await request('/api/digital-market/my-orders', buyer.token));
  assert(orders.some((o: any) => o.id === validOrder.id && o.meetingLatitude === 1 && o.meetingLongitude === 2));
});
