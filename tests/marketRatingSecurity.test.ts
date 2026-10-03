import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { MarketRatingError, writePurchaseRating, verifiedMarketRatings, publicMarketRating, ratingSummary } from '../marketRatingSecurity.js';

const fixture = () => {
  const buyer = { id: crypto.randomUUID(), role: 'user', email: `${crypto.randomUUID()}@example.test`, name: 'Isolated buyer' };
  const order = { id: crypto.randomUUID(), buyerId: buyer.id, storeId: crypto.randomUUID(), productId: crypto.randomUUID(), sellerEmail: `${crypto.randomUUID()}@example.test`, status: 'Completed & Paid' };
  const store: any = { digitalMarketOrders: [order], digitalMarketRatings: [], digitalMarketStores: [{ id: order.storeId }], digitalMarketProducts: [{ id: order.productId }] };
  return { buyer, order, store, body: { orderId: order.id, rating: 4, review: '  Purchase feedback  ' } };
};

test('S18: session identity, exact completed receipt and an input allowlist authorize reviews', () => {
  const { buyer, order, store, body } = fixture();
  const rejected = (actor: any, payload: any, status: number, serviceId?: string) => {
    const before = structuredClone(store);
    assert.throws(() => writePurchaseRating(actor, payload, store, serviceId), (error: any) => error instanceof MarketRatingError && error.status === status);
    assert.deepEqual(store, before);
  };
  for (const role of ['admin', 'merchant', 'resident', 'manager', 'staff']) rejected({ ...buyer, role }, body, 403);
  rejected({ ...buyer, id: crypto.randomUUID() }, body, 403);
  for (const key of ['buyerEmail', 'buyerName', 'buyerId', 'storeId', 'sellerEmail', 'id', 'createdAt', 'purchaseVerifiedVersion']) rejected(buyer, { ...body, [key]: order.id }, 400);
  for (const rating of [0, 6, -1, 1.5, '5', null, NaN, Infinity, {}, true]) rejected(buyer, { ...body, rating }, 400);
  for (const review of [null, {}, 1, 'a'.repeat(4001)]) rejected(buyer, { ...body, review }, 400);
  rejected(buyer, { ...body, orderId: crypto.randomUUID() }, 404);
  rejected(buyer, body, 409, crypto.randomUUID());
  for (const status of ['Pending Meetup', 'Awaiting Seller Confirmation', 'Cancelled', 'Location Rejected', 'completed']) {
    order.status = status; rejected(buyer, body, 409);
  }
  order.status = 'Completed & Paid';
  const first = writePurchaseRating(buyer, body, store);
  assert.equal(first.record.buyerId, buyer.id); assert.equal(first.record.buyerName, buyer.name);
  assert.equal(first.record.sellerEmail, order.sellerEmail); assert.equal(first.record.storeId, order.storeId);
  assert.equal(first.record.review, 'Purchase feedback'); assert.equal(first.record.purchaseVerifiedVersion, 1);
  const updated = writePurchaseRating(buyer, { ...body, rating: 2 }, store, order.productId);
  assert.equal(store.digitalMarketRatings.length, 1); assert.equal(updated.record.id, first.record.id);
  assert.equal(updated.record.createdAt, first.record.createdAt);
  assert.deepEqual(updated.summary, { averageRating: 2, ratingCount: 1 });
  assert.equal(store.digitalMarketProducts[0].rating, 2);
});

test('S18: unverified/conflicting reviews stay private, edits fail closed and public fields exclude identity internals', () => {
  const { buyer, order, store, body } = fixture();
  const forged = { ...body, id: crypto.randomUUID(), buyerEmail: buyer.email, storeId: order.storeId, buyerName: 'Unverified legacy name', rating: 5 };
  store.digitalMarketRatings.push(forged);
  assert.deepEqual(verifiedMarketRatings(store), []);
  const { record } = writePurchaseRating(buyer, body, store);
  assert.deepEqual(store.digitalMarketRatings[0], forged); assert.equal(store.digitalMarketRatings.length, 2);
  assert.equal(verifiedMarketRatings(store).length, 1);
  const projection = publicMarketRating(record);
  for (const key of ['buyerId', 'buyerEmail', 'sellerEmail', 'orderId', 'purchaseVerifiedVersion']) assert(!(key in projection));
  assert.equal(projection.verifiedPurchase, true);
  store.digitalMarketRatings.push({ ...record, id: crypto.randomUUID() });
  assert.deepEqual(verifiedMarketRatings(store), []);
  assert.throws(() => writePurchaseRating(buyer, body, store), (error: any) => error.status === 409);
  store.digitalMarketRatings.pop(); record.buyerId = crypto.randomUUID();
  assert.throws(() => writePurchaseRating(buyer, body, store), (error: any) => error.status === 403);
  assert.deepEqual(ratingSummary(verifiedMarketRatings(store)), { averageRating: 0, ratingCount: 0 });
  record.buyerId = buyer.id; record.storeId = crypto.randomUUID();
  assert.throws(() => writePurchaseRating(buyer, body, store), (error: any) => error.status === 409);
});
