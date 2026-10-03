import { ownsMarketStore } from './marketOwnership.js';
import crypto from 'node:crypto';
import { normalizeEmail } from './accountSecurity.js';
import { isOrderBuyer } from './marketOrderWorkflow.js';

export class MarketRatingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

/** Only receipts created by this purchase-bound policy contribute to public reputation. */
export function verifiedMarketRatings(store: any): any[] {
  const orders = new Map<string, any>((store.digitalMarketOrders || []).map((o: any) => [o.id, o]));
  const valid = (store.digitalMarketRatings || []).filter((r: any) => {
    if (!r || typeof r !== 'object') return false;
    const order = orders.get(r.orderId);
    const seller = (store.digitalMarketStores || []).find((s: any) => s.id === order?.storeId) || { id: order?.storeId, studentEmail: order?.sellerEmail, userId: order?.sellerId };
    return !ownsMarketStore({ id: order?.buyerId, email: order?.buyerEmail }, seller, store) && r.purchaseVerifiedVersion === 1 && order?.status === 'Completed & Paid' &&
      Boolean(order.buyerId && order.storeId && order.productId) && r.buyerId === order.buyerId &&
      r.storeId === order.storeId && r.productId === order.productId &&
      normalizeEmail(r.sellerEmail) === normalizeEmail(order.sellerEmail) &&
      Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5;
  });
  const counts = new Map<string, number>();
  for (const r of valid) counts.set(r.orderId, (counts.get(r.orderId) || 0) + 1);
  return valid.filter((r: any) => counts.get(r.orderId) === 1);
}

export function ratingSummary(ratings: any[]) {
  const count = ratings.length;
  return { averageRating: count ? Math.round(ratings.reduce((n, r) => n + r.rating, 0) / count * 10) / 10 : 0, ratingCount: count };
}

export function publicMarketRating(record: any) {
  const fields = ['id', 'storeId', 'productId', 'serviceId', 'buyerName', 'rating', 'review', 'createdAt', 'updatedAt'];
  return { ...Object.fromEntries(fields.filter(k => record[k] !== undefined).map(k => [k, record[k]])), verifiedPurchase: true };
}

export function writePurchaseRating(actor: any, body: any, store: any, serviceId?: string) {
  if (actor?.role !== 'user') throw new MarketRatingError('Sign in to your buyer account to review a purchase.', 403);
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).some(k => !['orderId', 'rating', 'review'].includes(k))) throw new MarketRatingError('Only orderId, rating and review may be submitted.');
  if (typeof body.orderId !== 'string' || !body.orderId.trim()) throw new MarketRatingError('A completed purchase order is required.');
  const order = (store.digitalMarketOrders || []).find((o: any) => o.id === body.orderId);
  if (!order) throw new MarketRatingError('Purchase order not found.', 404);
  if (!isOrderBuyer(actor, order)) throw new MarketRatingError('You cannot review another buyer’s order.', 403);
  const seller = (store.digitalMarketStores || []).find((s: any) => s.id === order.storeId) || { id: order.storeId, studentEmail: order.sellerEmail, userId: order.sellerId };
  if (ownsMarketStore(actor, seller, store)) throw new MarketRatingError('You cannot review purchases from your own store.', 403);
  if (order.status !== 'Completed & Paid') throw new MarketRatingError('Complete the purchase before submitting a review.', 409);
  if (!order.storeId || !order.productId || !order.sellerEmail || serviceId && order.productId !== serviceId) throw new MarketRatingError('The order does not belong to this item.', 409);
  if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5) throw new MarketRatingError('Rating must be an integer from 1 to 5.');
  if (body.review !== undefined && (typeof body.review !== 'string' || body.review.length > 4000)) throw new MarketRatingError('Review must contain at most 4,000 characters.');
  const existing = (store.digitalMarketRatings || []).filter((r: any) => r.purchaseVerifiedVersion === 1 && r.orderId === order.id);
  if (existing.length > 1) throw new MarketRatingError('This order has conflicting review records.', 409);
  const previous = existing[0];
  if (previous && previous.buyerId !== actor.id) throw new MarketRatingError('You cannot edit another buyer’s review.', 403);
  if (previous && !verifiedMarketRatings(store).includes(previous)) throw new MarketRatingError('This review has inconsistent purchase ownership.', 409);
  const now = new Date().toISOString();
  const record = {
    id: previous?.id || crypto.randomUUID(), purchaseVerifiedVersion: 1, orderId: order.id,
    buyerId: actor.id, buyerEmail: normalizeEmail(actor.email), buyerName: actor.name,
    sellerEmail: normalizeEmail(order.sellerEmail), storeId: order.storeId, productId: order.productId,
    serviceId: order.productId, rating: body.rating, review: (body.review || '').trim(),
    createdAt: previous?.createdAt || now, updatedAt: now
  };
  store.digitalMarketRatings ||= [];
  if (previous) store.digitalMarketRatings[store.digitalMarketRatings.indexOf(previous)] = record;
  else store.digitalMarketRatings.push(record);
  const verified = verifiedMarketRatings(store);
  const summary = ratingSummary(verified.filter(r => r.storeId === record.storeId));
  const targetStore = (store.digitalMarketStores || []).find((s: any) => s.id === record.storeId);
  if (targetStore) Object.assign(targetStore, { storeRating: summary.averageRating, ratingCount: summary.ratingCount });
  const product = (store.digitalMarketProducts || []).find((p: any) => p.id === record.productId);
  const productSummary = ratingSummary(verified.filter(r => r.productId === record.productId));
  if (product) Object.assign(product, { rating: productSummary.averageRating, reviewCount: productSummary.ratingCount });
  if (!previous || previous.rating !== record.rating || previous.review !== record.review) {
    store.notifications ||= [];
    store.notifications = store.notifications.filter((n: any) => n.marketRatingId !== record.id);
    const title = order.productTitle || product?.title || 'your item';
    store.notifications.unshift({ id: crypto.randomUUID(), marketRatingId: record.id,
      sellerStoreId: record.storeId, targetRole: 'merchant', scope: 'market', category: 'market',
      title: previous ? 'Purchase review updated' : 'New verified purchase review',
      message: `${record.buyerName} rated ${title} ${record.rating}/5.${record.review ? ` Review: ${record.review}` : ''}`,
      buyerName: record.buyerName, productTitle: title, rating: record.rating, review: record.review,
      orderId: order.id, productId: record.productId, read: false, date: now });
  }
  return { record, summary, productSummary };
}

export function installMarketRatings(app: any, auth: any, getStore: () => any, save: () => void) {
  const submit = (serviceAlias: boolean) => (req: any, res: any) => {
    res.set('Cache-Control', 'private, no-store');
    try {
      // No await between ownership check, lookup, upsert, aggregate calculation and save.
      const result = writePurchaseRating(req.user, req.body, getStore(), serviceAlias ? req.params.id : undefined);
      save();
      const projection = { ...publicMarketRating(result.record), orderId: result.record.orderId };
      return res.status(serviceAlias ? 201 : 200).json({ success: true, ratingRecord: projection,
        ...(serviceAlias ? { review: projection, reviewCount: result.productSummary.ratingCount } : {}),
        ...(serviceAlias ? result.productSummary : result.summary), message: 'Your verified purchase review has been saved.' });
    } catch (error) {
      if (error instanceof MarketRatingError) return res.status(error.status).json({ error: error.message });
      return res.status(500).json({ error: 'Failed to save purchase review.' });
    }
  };
  app.post('/api/digital-market/ratings', auth(['user']), submit(false));
  app.post('/api/digital-market/services/:id/reviews', auth(['user']), submit(true));
  const list = (serviceAlias: boolean) => (req: any, res: any) => {
    const { storeId, sellerEmail, serviceId, productId } = req.query;
    const selectedProduct = serviceAlias ? req.params.id : serviceId || productId;
    if ([storeId, sellerEmail, selectedProduct].some(v => v !== undefined && (typeof v !== 'string' || !v.trim())) ||
        serviceId && productId && serviceId !== productId) return res.status(400).json({ error: 'Invalid review filter.' });
    const matches = (selectedProduct || storeId || sellerEmail ? verifiedMarketRatings(getStore()) : []).filter(r =>
      (!selectedProduct || r.productId === selectedProduct) && (!storeId || r.storeId === storeId) &&
      (!sellerEmail || r.sellerEmail === normalizeEmail(sellerEmail)));
    const summary = ratingSummary(matches);
    const ratings = matches.map(publicMarketRating);
    return res.json({ ...summary, ...(serviceAlias ? { serviceId: selectedProduct, reviewCount: summary.ratingCount, reviews: ratings } : { ratings }) });
  };
  app.get('/api/digital-market/ratings', list(false));
  app.get('/api/digital-market/services/:id/reviews', list(true));
}
