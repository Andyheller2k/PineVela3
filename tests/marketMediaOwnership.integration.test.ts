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

test('Live marketplace media, ownership, purchase images and scoped notifications persist across restart', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-market-media-'));
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
  const jpeg = await sharp({ create: { width: 2400, height: 1200, channels: 3, background: '#1255cc' } }).jpeg().toBuffer();
  const photo = { fileType: 'image/jpeg', fileData: jpeg.toString('base64') };
  await start();
  await request(uploadRoute, '', photo, 'POST', 401);
  await request(uploadRoute, buyer.token, photo, 'POST', 403);
  await request('/api/storage/upload-hostel-image', seller.token, photo, 'POST', 403);
  for (const bad of [
    { fileType: 'image/png', fileData: Buffer.from('<html>not a raster image</html>').toString('base64') },
    { fileType: 'image/svg+xml', fileData: Buffer.from('<svg/>').toString('base64') },
    { fileType: 'image/png', fileData: jpeg.toString('base64') }
  ]) await request(uploadRoute, seller.token, bad, 'POST', 415);
  const images = [];
  for (let i = 0; i < 4; i++) images.push((await request(uploadRoute, seller.token, photo)).imageUrl);
  const foreignImage = (await request(uploadRoute, foreign.token, photo)).imageUrl;
  const image = await fetch(base + images[0]);
  assert.equal(image.headers.get('content-type'), 'image/png'); assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.match(image.headers.get('content-security-policy') || '', /sandbox/);
  const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  assert.equal(metadata.width, 1600); assert.equal(metadata.height, 800); assert(!metadata.exif);
  const publishing = { storeId: sellerStore.id, title: 'Isolated gallery item', description: 'Detailed item', price: 20, stockQuantity: 4, imageUrl: images[0], additionalImages: images.slice(1), category: 'Electronics' };
  await request('/api/digital-market/products', buyer.token, publishing, 'POST', 403);
  await request('/api/digital-market/products', seller.token, { ...publishing, additionalImages: images }, 'POST', 400);
  await request('/api/digital-market/products', seller.token, { ...publishing, additionalImages: [foreignImage] }, 'POST', 400);
  const item = (await request('/api/digital-market/products', seller.token, publishing, 'POST', 201)).product;
  assert.deepEqual(item.additionalImages, images.slice(1));
  const categories = images.map((imageUrl, i) => ({ id: crypto.randomUUID(), name: `Option ${i + 1}`, price: 25 + i, imageUrl }));
  const serviceBody = { ...publishing, title: 'Isolated service', category: 'Services', isService: true, serviceLocationMode: 'flexible', additionalImages: [], priceCategories: categories };
  await request('/api/digital-market/products', seller.token, { ...serviceBody, priceCategories: [...categories, { ...categories[0], id: crypto.randomUUID() }] }, 'POST', 400);
  const service = (await request('/api/digital-market/products', seller.token, serviceBody, 'POST', 201)).product;
  for (const p of [item, service]) await request('/api/digital-market/orders', owner.token, { productId: p.id, quantity: 1, meetingLocation: 'Isolated location' }, 'POST', 403);
  const order = (await request('/api/digital-market/orders', buyer.token, { productId: service.id, quantity: 1, meetingLocation: 'Isolated location', priceCategoryId: categories[2].id, price: 1 }, 'POST', 201)).order;
  assert.equal(order.productPrice, categories[2].price); assert.equal(order.productImage, categories[2].imageUrl);
  await request(`/api/digital-market/orders/${order.id}/update-status`, seller.token, { action: 'agree-location' });
  await request(`/api/digital-market/orders/${order.id}/update-status`, seller.token, { newStatus: 'completed', inputPin: order.otpPin });
  const completion = (await request('/api/notifications', buyer.token)).find((n: any) => n.orderId === order.id && n.title === 'Purchase completed');
  assert(completion && completion.targetAccountId === buyer.id && !completion.read);
  assert(!(await request('/api/notifications', owner.token)).some((n: any) => n.id === completion.id));
  const cancellable = (await request('/api/digital-market/orders', buyer.token, { productId: item.id, quantity: 1 }, 'POST', 201)).order;
  await request(`/api/digital-market/orders/${cancellable.id}/update-status`, buyer.token, { newStatus: 'Cancelled' });
  assert((await request('/api/notifications', seller.token)).some((n: any) => n.orderId === cancellable.id && n.title === 'Order cancelled'));
  await request('/api/admin/digital-market/toggle-ban-store', admin.token, { storeId: sellerStore.id, banReason: 'Isolated status check' });
  assert((await request('/api/notifications', owner.token)).some((n: any) => n.title === 'Merchant platform disabled' && n.targetAccountId === owner.id));
  assert(!(await request('/api/notifications', buyer.token)).some((n: any) => n.title === 'Merchant platform disabled'));
  await request(uploadRoute, seller.token, photo, 'POST', 403);

  await request('/api/admin/digital-market/toggle-ban-store', admin.token, { storeId: sellerStore.id });
  assert((await request('/api/notifications', owner.token)).some((n: any) => n.title === 'Merchant platform restored'));

  const before = JSON.parse(await fs.readFile(database, 'utf8')).digitalMarketProducts;
  await request(`/api/digital-market/products/${service.id}`, seller.token, { title: 'Must not persist', priceCategories: [{ ...categories[0], price: 'not-a-number' }] }, 'PUT', 400);
  assert.deepEqual(JSON.parse(await fs.readFile(database, 'utf8')).digitalMarketProducts, before);
  await request('/api/digital-market/ratings', owner.token, { orderId: ownCompleted.id, rating: 5 }, 'POST', 403);
  await request('/api/digital-market/ratings', buyer.token, { orderId: completed.id, rating: 4, review: 'Very helpful' });
  const sellerNotices = await request('/api/notifications?scope=market', seller.token);
  const rating = sellerNotices.find((n: any) => n.marketRatingId);
  assert(rating); assert.match(rating.message, /Isolated user.*Isolated purchased item.*4\/5.*Very helpful/);
  for (const account of [owner, buyer, foreign]) assert(!(await request('/api/notifications', account.token)).some((n: any) => n.id === rating.id));
  await request('/api/digital-market/messages', buyer.token, { productId: product.id, recipientEmail: seller.email, content: 'Item inquiry' }, 'POST', 201);
  const chat = (await request('/api/notifications?scope=market', seller.token)).find((n: any) => n.marketChat);
  assert(chat?.messageId); assert.equal(chat.buyerId, buyer.id);
  assert(!(await request('/api/notifications', owner.token)).some((n: any) => n.marketChat));
  await request(`/api/notifications/${chat.id}/read`, seller.token, {}, 'PUT');
  assert.equal((await request('/api/notifications', seller.token)).find((n: any) => n.id === chat.id).read, true);
  await request('/api/digital-market/messages', seller.token, { recipientEmail: buyer.email, buyerId: buyer.id, content: 'Seller reply' }, 'POST', 201);
  assert((await request('/api/notifications', buyer.token)).some((n: any) => n.marketChat && !n.read));
  await stop(); await start();
  const persisted = JSON.parse(await fs.readFile(database, 'utf8'));
  assert.equal(persisted.marketMedia.length, 5);
  await request(`/api/digital-market/products/${service.id}`, seller.token, { priceCategories: [{ id: 'price-only', name: 'Price only', price: 9 }] }, 'PUT');
  await request(`/api/digital-market/products/${item.id}`, seller.token, { additionalImages: images.slice(1) }, 'PUT');
  assert.equal((await fetch(base + images[0])).status, 200);
  await request('/api/digital-market/orders', owner.token, { productId: item.id, quantity: 1 }, 'POST', 403);
});
