import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogOrderTerms, orderQuantity, consumeOrderStock, MarketOrderError } from '../marketOrderSecurity.js';

test('S14: stored prices and unambiguous stored category metadata determine totals', () => {
  const product = { title: 'Catalog item', price: 100, priceCategories: [{ id: 'a', name: 'Basic', price: 30.25 }] };
  assert.equal(catalogOrderTerms(product, { quantity: 2, price: 0 }).totalAmount, 200);
  const category = catalogOrderTerms(product, { quantity: 3, price: 1, priceCategoryId: 'a', priceCategoryName: 'Basic' });
  assert.equal(category.totalAmount, 90.75); assert.equal(category.priceCategory, 'Basic');
  for (const body of [{ priceCategoryId: 'missing' }, { priceCategoryName: 'Forged' }, { priceCategoryId: 'a', priceCategoryName: 'Forged' }, { priceCategoryName: {} }]) {
    assert.throws(() => catalogOrderTerms(product, { quantity: 1, ...body }), MarketOrderError);
  }
  assert.throws(() => catalogOrderTerms({ ...product, priceCategories: [...product.priceCategories, ...product.priceCategories] }, { quantity: 1, priceCategoryName: 'Basic' }), MarketOrderError);
  for (const price of [-1, NaN, Infinity, '100', Number.MAX_VALUE]) assert.throws(() => catalogOrderTerms({ ...product, price }, { quantity: 1 }), MarketOrderError);
  assert.equal(catalogOrderTerms({ ...product, price: 0 }, { quantity: 1 }).totalAmount, 0);
  assert.equal(catalogOrderTerms({ ...product, price: .1 }, { quantity: 3 }).totalAmount, .3);
});

test('S15: quantities cannot coerce and legacy corrupt orders cannot mutate stock', () => {
  for (const quantity of [undefined, null, 0, -2, .5, 1.5, '2', '', true, [], {}, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => orderQuantity(quantity), MarketOrderError);
  const product = { stockQuantity: 2, isAvailable: true };
  for (const quantity of [-2, 0, .5, '1']) {
    assert.throws(() => consumeOrderStock(product, { quantity, productPrice: 100, totalAmount: 100 * Number(quantity) }), MarketOrderError);
    assert.equal(product.stockQuantity, 2);
  }
  assert.throws(() => consumeOrderStock(product, { quantity: 1, productPrice: 100, totalAmount: -100 }), MarketOrderError);
  consumeOrderStock(product, { quantity: 2, productPrice: 100, totalAmount: 200, status: 'Pending Meetup', stockReservationVersion: 1, stockReservedUntil: new Date(Date.now() + 60000).toISOString() });
  assert.equal(product.stockQuantity, 0); assert.equal(product.isAvailable, false);
  assert.throws(() => consumeOrderStock(product, { quantity: 1, productPrice: 100, totalAmount: 100 }), MarketOrderError);
});
