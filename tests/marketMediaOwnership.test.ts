import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ownsMarketStore } from '../marketOwnership.js';
import { marketMediaFields, MarketMediaError } from '../marketMediaSecurity.js';
import { writePurchaseRating, verifiedMarketRatings } from '../marketRatingSecurity.js';
import { marketNoticeKind } from '../src/lib/marketNotifications.js';

test('Own-store purchases/reviews resolve persisted primary, merchant and application relationships', () => {
  const buyer = { id: 'primary', role: 'user', email: 'owner@example.test', name: 'Owner' };
  const seller = { id: 'store', studentEmail: 'seller@example.test' };
  assert(ownsMarketStore(buyer, { ...seller, userId: buyer.id }, {}));
  assert(ownsMarketStore(buyer, { ...seller, parentUserEmail: buyer.email.toUpperCase() }, {}));
  assert(ownsMarketStore(buyer, seller, { users: [{ role: 'merchant', merchantStoreId: seller.id, parentUserId: buyer.id }] }));
  assert(ownsMarketStore(buyer, seller, { digitalMarketApplications: [{ studentEmail: seller.studentEmail, userId: buyer.id }] }));
  assert(!ownsMarketStore(buyer, seller, { users: [{ role: 'merchant', merchantStoreId: 'foreign', parentUserId: buyer.id }] }));
  const order = { id: 'receipt', buyerId: buyer.id, buyerEmail: buyer.email, storeId: seller.id, productId: 'product', sellerEmail: seller.studentEmail, status: 'Completed & Paid' };
  const store: any = { digitalMarketStores: [{ ...seller, userId: buyer.id }], digitalMarketOrders: [order] };
  assert.throws(() => writePurchaseRating(buyer, { orderId: order.id, rating: 5 }, store), (e: any) => e.status === 403);
  store.digitalMarketRatings = [{ ...order, orderId: order.id, purchaseVerifiedVersion: 1, rating: 5 }];
  assert.deepEqual(verifiedMarketRatings(store), [], 'Previously created own-store ratings must not contribute');
});

test('New media accepts owned uploads only and bounds distinct photos and price options', () => {
  const actor = { id: 'seller', role: 'merchant' }, imageUrl = '/uploads/hostels/owned.png';
  const store = { marketMedia: [{ imageUrl, accountId: actor.id }] };
  const category = { id: 'option', name: 'Option', price: 15, imageUrl };
  assert.deepEqual(marketMediaFields({ additionalImages: [imageUrl], priceCategories: [category] }, actor, store), { additionalImages: [imageUrl], priceCategories: [category] });
  assert.deepEqual(marketMediaFields({ priceCategories: [{ id: 'plain', name: 'Plain', price: 0 }] }, actor, store).priceCategories[0], { id: 'plain', name: 'Plain', price: 0 });
  const invalid = [
    { additionalImages: Array(4).fill(imageUrl) }, { additionalImages: [imageUrl, imageUrl] },
    { additionalImages: ['data:image/svg+xml;base64,AAAA'] }, { additionalImages: ['https://foreign.test/image.png'] },
    { priceCategories: Array(5).fill(category) }, { priceCategories: [category, category] },
    ...['15', NaN, Infinity, -1, {}, null].map(price => ({ priceCategories: [{ ...category, price }] })),
    { priceCategories: [{ ...category, imageUrl: '/uploads/hostels/foreign.png' }] }
  ];
  for (const body of invalid) assert.throws(() => marketMediaFields(body, actor, store), MarketMediaError);
  assert.throws(() => marketMediaFields({ additionalImages: [imageUrl] }, { id: 'other', role: 'merchant' }, store), MarketMediaError);
});

test('Review notifications contain purchase details, remain seller-scoped and avoid repeated-submit spam', () => {
  const buyer = { id: 'buyer', role: 'user', name: 'Buyer', email: 'buyer@example.test' };
  const order = { id: 'order', buyerId: buyer.id, buyerEmail: buyer.email, storeId: 'store', productId: 'product', productTitle: 'Purchased service · Option', sellerEmail: 'seller@example.test', status: 'Completed & Paid' };
  const store: any = { digitalMarketOrders: [order], digitalMarketStores: [{ id: 'store', userId: 'owner' }] };
  writePurchaseRating(buyer, { orderId: 'order', rating: 4, review: 'Good work' }, store);
  const notice = store.notifications[0];
  assert.equal(notice.sellerStoreId, 'store'); assert.equal(notice.targetRole, 'merchant');
  assert.match(notice.message, /Buyer.*Purchased service · Option.*4\/5.*Good work/);
  writePurchaseRating(buyer, { orderId: 'order', rating: 4, review: 'Good work' }, store);
  assert.equal(store.notifications.length, 1); assert.equal(store.notifications[0].id, notice.id);
  writePurchaseRating(buyer, { orderId: 'order', rating: 3 }, store);
  assert.equal(store.notifications.length, 1); assert.notEqual(store.notifications[0].id, notice.id);
  assert.equal(store.digitalMarketRatings.length, 1);
});

test('Badge categories distinguish chat, order tracking and merchant status notices', () => {
  assert.equal(marketNoticeKind({ id: 'a', marketChat: true, title: 'Message', message: 'New message' }), 'chat');
  assert.equal(marketNoticeKind({ id: 'b', orderId: 'order', title: 'Update', message: 'Meetup confirmed' }), 'order');
  assert.equal(marketNoticeKind({ id: 'c', scope: 'market', title: 'Merchant approved', message: 'Store approved' }), 'vendor');
  assert.equal(marketNoticeKind({ id: 'd', title: 'Maintenance', message: 'Repair complete' }), null);
});
