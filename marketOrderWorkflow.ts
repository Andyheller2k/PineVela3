import crypto from 'node:crypto';
import { MarketOrderError, terminalMarketOrder } from './marketOrderSecurity.js';
import { sellerStore } from './marketMessaging.js';

export const DELIVERY_PIN_TTL_MS = 24 * 60 * 60 * 1000;
export const DELIVERY_PIN_MAX_ATTEMPTS = 5;
export const isOrderBuyer = (actor: any, order: any) => actor?.role === 'user' && Boolean(order.buyerId) && order.buyerId === actor.id;
export function isOrderSeller(actor: any, order: any, store: any): boolean {
  const seller = sellerStore(actor, store);
  return Boolean(seller && !seller.isBanned && seller.status === 'active' && seller.id === order.storeId);
}

export function issueDeliveryPin(order: any, now = Date.now()) {
  let pin: string;
  do { pin = String(crypto.randomInt(100000, 1000000)); } while (pin === order.otpPin);
  order.otpPin = pin;
  order.deliveryPinVersion = 1;
  order.deliveryPinIssuedAt = new Date(now).toISOString();
  order.deliveryPinExpiresAt = new Date(now + DELIVERY_PIN_TTL_MS).toISOString();
  order.deliveryPinAttempts = 0;
  order.stockReservationVersion = 1;
  order.stockReservedUntil = order.deliveryPinExpiresAt;
}

export function deliveryPinState(order: any, now = Date.now()) {
  if (terminalMarketOrder(order.status) || order.deliveryPinVersion !== 1 ||
      typeof order.otpPin !== 'string' || !/^\d{6}$/.test(order.otpPin) ||
      !Number.isInteger(order.deliveryPinAttempts) || order.deliveryPinAttempts < 0 ||
      !Number.isFinite(Date.parse(order.deliveryPinExpiresAt))) return 'unavailable';
  if (order.deliveryPinAttempts >= DELIVERY_PIN_MAX_ATTEMPTS) return 'locked';
  if (Date.parse(order.deliveryPinExpiresAt) <= now) return 'expired';
  return 'active';
}

/** Returns the error after updating counters, so the handler can persist before responding. */
export function checkDeliveryPin(order: any, submitted: unknown): MarketOrderError | undefined {
  const state = deliveryPinState(order);
  if (state === 'locked') return new MarketOrderError('Delivery PIN is locked. Ask the buyer to renew it.', 429);
  if (state !== 'active') return new MarketOrderError('Delivery PIN is expired or unavailable. Ask the buyer to renew it.', 409);
  if (submitted === undefined || submitted === '') return new MarketOrderError('Enter the six-digit delivery PIN supplied by the buyer.');
  const submittedHash = crypto.createHash('sha256').update(typeof submitted === 'string' ? submitted.trim() : '').digest();
  const storedHash = crypto.createHash('sha256').update(order.otpPin).digest();
  if (typeof submitted === 'string' && /^\d{6}$/.test(submitted.trim()) && crypto.timingSafeEqual(submittedHash, storedHash)) return;
  order.deliveryPinAttempts++;
  return order.deliveryPinAttempts >= DELIVERY_PIN_MAX_ATTEMPTS
    ? new MarketOrderError('Delivery PIN is locked. Ask the buyer to renew it.', 429)
    : new MarketOrderError('Invalid delivery PIN. Confirm it with the buyer.');
}

const PUBLIC_ORDER_FIELDS = ['id', 'productId', 'productTitle', 'productPrice', 'priceCategory', 'priceCategoryId', 'productImage',
  'quantity', 'totalAmount', 'buyerId', 'buyerEmail', 'buyerName', 'buyerPhone', 'sellerId', 'sellerEmail', 'storeId', 'storeName',
  'university', 'meetingLocation', 'meetingLatitude', 'meetingLongitude', 'serviceLocationOption', 'sellerConfirmed',
  'sellerAgreedLocation', 'sellerAgreedAt', 'status', 'paymentMethod', 'createdAt', 'updatedAt'];
function redactPinText(value: unknown, pin: unknown) {
  if (typeof value !== 'string') return undefined;
  let text = value.replace(/PIN\s*\(\s*\d{4,6}\s*\)/gi, 'PIN (redacted)');
  if (typeof pin === 'string' && /^\d{4,6}$/.test(pin)) text = text.split(pin).join('[redacted]');
  return text;
}
/** An allowlist keeps present and future server-only PIN fields out of every response. */
export function publicMarketOrder(order: any, actor: any) {
  const result: any = Object.fromEntries(PUBLIC_ORDER_FIELDS.filter(k => order[k] !== undefined).map(k => [k, order[k]]));
  result.timeline = (Array.isArray(order.timeline) ? order.timeline : []).map((event: any) => ({
    status: redactPinText(event.status, order.otpPin), title: redactPinText(event.title, order.otpPin),
    timestamp: event.timestamp, notes: redactPinText(event.notes, order.otpPin)
  }));
  if (isOrderBuyer(actor, order)) {
    result.deliveryPinState = deliveryPinState(order);
    if (result.deliveryPinState === 'active') result.otpPin = order.otpPin;
    if (order.deliveryPinVersion === 1) result.deliveryPinExpiresAt = order.deliveryPinExpiresAt;
  }
  return result;
}

export type OrderAction = 'confirm' | 'reject' | 'cancel' | 'complete';
export function orderAction(body: any): OrderAction {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new MarketOrderError('Invalid order action.');
  const allowed = ['action', 'newStatus', 'status', 'inputPin', 'otpPin', 'notes'];
  if (Object.keys(body).some(k => !allowed.includes(k))) throw new MarketOrderError('Unsupported order fields.');
  const parse = (value: unknown): OrderAction | undefined => {
    if (value === undefined) return undefined;
    if (typeof value !== 'string') throw new MarketOrderError('Invalid order action.');
    const choices: Record<string, OrderAction> = { 'agree-location': 'confirm', 'confirm-location': 'confirm',
      'reject-location': 'reject', 'location rejected': 'reject', 'rejected by seller': 'reject',
      'cancelled': 'cancel', 'completed & paid': 'complete', 'completed': 'complete' };
    const action = choices[value.trim().toLowerCase()];
    if (!action) throw new MarketOrderError('Unsupported order transition.');
    return action;
  };
  const actions = [body.action, body.newStatus, body.status].map(parse).filter(Boolean);
  if (!actions.length || new Set(actions).size !== 1) throw new MarketOrderError('Missing or conflicting order actions.');
  if (body.notes !== undefined && (typeof body.notes !== 'string' || body.notes.length > 2000)) throw new MarketOrderError('Invalid order notes.');
  if (body.inputPin !== undefined && body.otpPin !== undefined && body.inputPin !== body.otpPin) throw new MarketOrderError('Conflicting delivery PIN fields.');
  if (actions[0] !== 'complete' && (body.inputPin !== undefined || body.otpPin !== undefined)) throw new MarketOrderError('Delivery PIN is only used for completion.');
  return actions[0]!;
}

export function authorizeOrderAction(actor: any, order: any, store: any, action: OrderAction) {
  if (!(isOrderSeller(actor, order, store) || action === 'cancel' && isOrderBuyer(actor, order))) {
    throw new MarketOrderError('Only the assigned seller can manage this order. Buyers may cancel their own order.', 403);
  }
  if (terminalMarketOrder(order.status)) throw new MarketOrderError('Terminal orders cannot be updated.', 409);
  const allowed: Record<OrderAction, string[]> = { confirm: ['Awaiting Seller Confirmation'], reject: ['Awaiting Seller Confirmation'],
    cancel: ['Awaiting Seller Confirmation', 'Pending Meetup'], complete: ['Pending Meetup'] };
  if (!allowed[action].includes(order.status) || action === 'complete' && (order.sellerConfirmed !== true || order.sellerAgreedLocation !== true)) {
    throw new MarketOrderError('This action is not allowed in the current order state.', 409);
  }
}
