import { sessionFixtureJson } from './sessionFixtures.cjs';
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
import sharp from 'sharp';
import { PLAN_LIMITS, MARKET_PLANS } from '../marketPlans.js';
const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('Real server: zero-priced admin policy activates all plans, enforces publishing quotas and persists payment proof', { timeout: 90000 }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pinevela-paid-market-flow-')), dataDir = path.join(temp, 'data'); await fs.mkdir(dataDir);
  const db = path.join(dataDir, 'pinevela_store.json');
  const actors = MARKET_PLANS.map(plan => ({ id: 'merchant-' + plan, role: 'merchant', email: plan + '@example.test', merchantStoreId: 'store-' + plan, token: crypto.randomUUID(), isDigitalMarketOnly: true, isVerified: true }));
  const stores = actors.map(actor => ({ id: actor.merchantStoreId, studentEmail: actor.email, userId: actor.id, status: 'active' }));
  const apps = actors.map(actor => ({ id: 'app-' + actor.id, studentEmail: actor.email, userId: actor.id, status: 'approved' }));
  const buyer = { id: 'buyer', role: 'user', email: 'buyer@example.test', token: crypto.randomUUID(), isVerified: true };
  const products = MARKET_PLANS.flatMap((plan, index) => {
    const limits = PLAN_LIMITS[plan];
    return [...Array.from({ length: limits.items - 1 }, (_, i) => ({ id: `${plan}-item-${i}`, storeId: stores[index].id, stockQuantity: i === 0 ? limits.inventory - limits.items + 1 : 1, title: 'Isolated inventory', price: 10, sellerId: actors[index].id, sellerEmail: actors[index].email, isAvailable: true })), ...Array.from({ length: limits.services - 1 }, (_, i) => ({ id: `${plan}-service-${i}`, storeId: stores[index].id, stockQuantity: 999, price: 10, isService: true, category: 'Services', serviceLocationMode: 'flexible' }))];
  });
  await fs.writeFile(db, sessionFixtureJson({ credentialExposureVersion: 1, accountSecurityVersion: 1, users: [...actors, buyer], hostels: [], digitalMarketStores: stores, digitalMarketApplications: apps, digitalMarketProducts: products, platformSettings: { registrationFee: 0, semesterFee: 0, subscriptionPrices: { default: 0, star: 0, pro: 0 }, commission: 0, announcement: '', maintenanceMode: false } }));
  const listener = net.createServer(); listener.listen(0, '127.0.0.1'); await once(listener, 'listening'); const port = (listener.address() as any).port; await new Promise<void>(r => listener.close(() => r()));
  const base = `http://127.0.0.1:${port}`; let child: ChildProcess | undefined, logs = '';
  const stop = async () => { if (child && child.exitCode === null) { const done = once(child, 'exit'); child.kill('SIGTERM'); await done; } child = undefined; };
  t.after(async () => { await stop(); await fs.rm(temp, { recursive: true, force: true }); });
  const start = async () => {
    child = spawn(process.execPath, ['--import', pathToFileURL(path.join(project, 'node_modules/tsx/dist/loader.mjs')).href, path.join(project, 'server.ts')], { cwd: temp, env: { ...process.env, NODE_ENV: 'test', PORT: String(port), PINEVELA_DATA_DIR: dataDir, PINEVELA_UPLOADS_DIR: path.join(temp, 'uploads'), PAYSTACK_SECRET_KEY: '', PINEVELA_PUBLIC_ORIGIN: base, PINEVELA_TRUST_PROXY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', chunk => logs += chunk); child.stderr?.on('data', chunk => logs += chunk);
    for (let i = 0; i < 150; i++) { try { if ((await fetch(base + '/api/health')).ok) return; } catch {} if (child.exitCode !== null) assert.fail(logs); await new Promise(resolve => setTimeout(resolve, 100)); } assert.fail('Isolated server did not start');
  };
  const request = async (method: string, route: string, actor: any, body: any, expected = 200) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); const result = await response.json(); assert.equal(response.status, expected, `${method} ${route}: ${result.error || ''}`); return result;
  };
  await start();
  await request('POST', '/api/payments/paystack/initialize', null, { purpose: 'activation' }, 401);
  await request('POST', '/api/hostel-verifications/pay-onboarding-fee', null, { agreedToPay: true }, 401);
  await request('POST', '/api/payments/paystack/initialize', buyer, { purpose: 'activation' }, 403);
  const freshIds = [];
  for (const [index, plan] of MARKET_PLANS.entries()) {
    const actor = actors[index], storeId = stores[index].id;
    const details = { storeName: 'Isolated ' + plan, username: plan, description: 'Test-only fixture', category: 'Electronics', location: 'Isolated campus', deliveryMode: 'Meetup', registrationFeePaid: true };
    const draft = await request('POST', '/api/digital-market/store-setup', actor, details); assert.equal(draft.store.registrationFeePaid, false);
    const raster = await sharp({ create: { width: 24, height: 24, channels: 3, background: '#1259dc' } }).png().toBuffer();
    const image = await request('POST', '/api/storage/upload-market-image', actor, { fileData: 'data:image/png;base64,' + raster.toString('base64'), fileType: 'image/png', fileName: 'isolated-image.png' });
    const item = { imageUrl: image.imageUrl, storeId, userEmail: actor.email, title: 'Isolated new item', description: 'Test fixture item', category: 'Electronics', stockQuantity: 1, price: 20 };
    await request('POST', '/api/digital-market/products', actor, item, 402);
    const paid = await request('POST', '/api/payments/paystack/initialize', actor, { purpose: 'activation', plan, price: 1 }); assert.equal(paid.paid, true); assert.equal(paid.mode, 'free'); assert.equal(paid.store.subscriptionPlan, plan);
    await request('POST', '/api/digital-market/products', actor, { ...item, stockQuantity: 'one' }, 400);
    await request('POST', '/api/digital-market/products', actor, { ...item, stockQuantity: 2 }, 403);
    const published = await request('POST', '/api/digital-market/products', actor, item, 201); freshIds.push(published.product.id);
    await request('POST', '/api/digital-market/products', actor, item, 403);
    const service = { ...item, title: 'Isolated new service', category: 'Services', isService: true, serviceLocationMode: 'flexible' };
    await request('POST', '/api/digital-market/products', actor, service, 201);
    await request('POST', '/api/digital-market/products', actor, service, 403);
    await request('PUT', '/api/digital-market/products/' + published.product.id, actor, { stockQuantity: 20 }, 400);
    await request('POST', '/api/payments/paystack/verify', actors[(index + 1) % 3], { reference: paid.reference }, 404);
  }
  await request('POST', '/api/digital-market/orders', buyer, { productId: freshIds[0], quantity: 1, meetingLocation: 'Isolated meetup' }, 201);
  await stop(); await start();
  for (const [index, plan] of MARKET_PLANS.entries()) { const state = await request('GET', '/api/digital-market/status', actors[index], undefined); assert.equal(state.store.subscriptionPlan, plan); assert.equal(state.store.registrationFeePaid, true); }
  await stop(); const disk = JSON.parse(await fs.readFile(db, 'utf8')); assert.equal(disk.paymentTransactions.filter((t: any) => t.status === 'fulfilled').length, 3);
  for (const seller of disk.digitalMarketStores) seller.semesterExpiresAt = '2020-01-01T00:00:00.000Z';
  await fs.writeFile(db, JSON.stringify(disk)); await start();
  await request('POST', '/api/digital-market/orders', buyer, { productId: freshIds[1], quantity: 1 }, 402);
  const publicItems = await request('GET', '/api/digital-market/products', null, undefined); assert.equal(publicItems.length, 0, 'Expired stores cannot sell publicly');
});
