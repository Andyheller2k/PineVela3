import assert from 'node:assert/strict';
import { test } from 'node:test';
import { issueDeliveryPin, deliveryPinState, checkDeliveryPin, publicMarketOrder, orderAction } from '../marketOrderWorkflow.js';
import { activeOrderReservation, checkOrderStock, MarketOrderError } from '../marketOrderSecurity.js';

test('S16: challenges are cryptographic six-digit values, expire, lock, and never project to sellers/admins', () => {
  const now = Date.now(), order: any = { id: 'order', buyerId: 'buyer', status: 'Pending Meetup', quantity: 1 };
  issueDeliveryPin(order, now);
  assert.match(order.otpPin, /^\d{6}$/); assert.equal(deliveryPinState(order, now), 'active');
  assert.equal(deliveryPinState(order, now + 24 * 60 * 60 * 1000), 'expired');
  order.timeline = [{ status: 'Pending Meetup', title: 'PIN', notes: `PIN (${order.otpPin}) was entered`, timestamp: new Date(now).toISOString(), secret: order.otpPin }];
  for (const actor of [{ id: 'buyer', role: 'merchant' }, { id: 'buyer', role: 'admin' }, { id: 'other', role: 'user' }]) {
    const result = publicMarketOrder(order, actor);
    assert(!Object.keys(result).some(k => /otpPin|deliveryPin|stockReserv/.test(k)));
    assert(!JSON.stringify(result).includes(order.otpPin));
  }
  assert.equal(publicMarketOrder(order, { id: 'buyer', role: 'user' }).otpPin, order.otpPin);
  const wrong = order.otpPin === '100000' ? '100001' : '100000';
  assert.equal(checkDeliveryPin(order, order.otpPin), undefined);
  for (let i = 0; i < 4; i++) assert.equal(checkDeliveryPin(order, wrong)?.status, 400);
  assert.equal(checkDeliveryPin(order, wrong)?.status, 429);
  assert.equal(checkDeliveryPin(order, order.otpPin)?.status, 429);
  assert.equal(order.deliveryPinAttempts, 5);
  assert.equal(publicMarketOrder(order, { id: 'buyer', role: 'user' }).otpPin, undefined);
  const legacy = { ...order, otpPin: '1234', deliveryPinVersion: undefined };
  assert.equal(checkDeliveryPin(legacy, '1234')?.status, 409);
});

test('S17: actions are a closed set and reservations expire or release in terminal states', () => {
  for (const payload of [{}, { status: 'Pending Meetup' }, { status: 'Inspected & Met' }, { status: 'anything' }, { action: 'agree-location', status: 'Cancelled' }, { status: 'completed', quantity: -1 }, { status: 123 }, { status: 'cancelled', inputPin: '123456' }]) assert.throws(() => orderAction(payload), MarketOrderError);
  assert.equal(orderAction({ status: 'Completed & Paid', newStatus: 'completed' }), 'complete');
  const product = { id: 'product', stockQuantity: 2, isAvailable: true };
  const order = { id: 'order', productId: product.id, quantity: 2, status: 'Awaiting Seller Confirmation' };
  issueDeliveryPin(order);
  assert(activeOrderReservation(order)); assert.throws(() => checkOrderStock(product, 1, [order]), MarketOrderError);
  assert.doesNotThrow(() => checkOrderStock(product, 2, [order], order.id));
  assert(!activeOrderReservation(order, Date.now() + 24 * 60 * 60 * 1000 + 1));
  for (const status of ['Cancelled', 'Location Rejected', 'Completed & Paid']) assert.doesNotThrow(() => checkOrderStock(product, 2, [{ ...order, status }]));
});
