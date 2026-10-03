export class MarketOrderError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function orderQuantity(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new MarketOrderError('Quantity must be a positive integer.');
  }
  return value;
}

function priceCents(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new MarketOrderError('The stored price is invalid. Contact the seller.', 409);
  }
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents)) throw new MarketOrderError('The stored price is too large.', 409);
  return cents;
}

function selector(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) throw new MarketOrderError('Invalid price category.');
  return value.trim();
}

/** Request prices are deliberately ignored; only selectors identify stored categories. */
export function catalogOrderTerms(product: any, body: any) {
  const quantity = orderQuantity(body.quantity);
  const id = selector(body.priceCategoryId);
  const name = selector(body.priceCategoryName ?? body.priceCategory);
  const categories = Array.isArray(product.priceCategories) ? product.priceCategories : [];
  let category: any;
  if (id !== undefined || name !== undefined) {
    const matches = categories.filter((entry: any) => entry && (id !== undefined ? entry.id === id : entry.name === name));
    if (matches.length !== 1 || typeof matches[0].name !== 'string' || !matches[0].name.trim() ||
        (name !== undefined && matches[0].name !== name)) {
      throw new MarketOrderError('The selected price category is unavailable or ambiguous.');
    }
    category = matches[0];
  }
  const cents = priceCents(category ? category.price : product.price);
  const totalCents = cents * quantity;
  if (!Number.isSafeInteger(totalCents)) throw new MarketOrderError('Order total is too large.');
  return { quantity, productPrice: cents / 100, totalAmount: totalCents / 100,
    priceCategory: category?.name, priceCategoryId: category?.id,
    productTitle: category ? `${product.title} (${category.name})` : product.title };
}

export function activeOrderReservation(order: any, now = Date.now()): boolean {
  return order.stockReservationVersion === 1 &&
    ['Awaiting Seller Confirmation', 'Pending Meetup'].includes(order.status) &&
    Number.isFinite(Date.parse(order.stockReservedUntil)) && Date.parse(order.stockReservedUntil) > now;
}

export function checkOrderStock(product: any, quantity: number, orders: any[] = [], excludeId?: string) {
  orderQuantity(quantity);
  const reserved = orders.filter(o => o.productId === product?.id && o.id !== excludeId && activeOrderReservation(o))
    .reduce((sum, o) => sum + orderQuantity(o.quantity), 0);
  if (!product || !Number.isSafeInteger(product.stockQuantity) || product.stockQuantity < 0 ||
      product.isAvailable === false || !Number.isSafeInteger(reserved) || product.stockQuantity - reserved < quantity) {
    throw new MarketOrderError('Requested quantity exceeds available stock or the product is unavailable.', 409);
  }
}

export function terminalMarketOrder(status: unknown): boolean {
  return typeof status === 'string' && ['completed & paid', 'completed', 'cancelled', 'location rejected', 'rejected by seller'].includes(status.trim().toLowerCase());
}

/** Call inside the synchronous completion/save block, with no await before saving. */
export function consumeOrderStock(product: any, order: any, orders: any[] = []) {
  const quantity = orderQuantity(order.quantity); // Also protects orders written by older versions.
  const cents = priceCents(order.productPrice);
  if (!Number.isSafeInteger(cents * quantity) || order.totalAmount !== cents * quantity / 100) {
    throw new MarketOrderError('This order has invalid pricing and must be placed again.', 409);
  }
  if (!activeOrderReservation(order)) throw new MarketOrderError('Stock reservation has expired. Ask the buyer to renew the delivery PIN.', 409);
  checkOrderStock(product, quantity, orders, order.id);
  product.stockQuantity -= quantity;
  if (product.stockQuantity === 0) product.isAvailable = false;
  product.updatedAt = new Date().toISOString();
}
