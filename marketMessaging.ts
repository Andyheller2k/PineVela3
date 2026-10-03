import crypto from 'node:crypto';
import { accountData, accountId, accountRole, normalizeEmail } from './accountSecurity.js';

export function sellerStore(actor: any, store: any) {
  if (actor.role !== 'merchant') return undefined;
  const matches = (store.digitalMarketStores || []).filter((s: any) =>
    actor.merchantStoreId ? s.id === actor.merchantStoreId : normalizeEmail(s.studentEmail) === normalizeEmail(actor.email));
  return matches.length === 1 ? matches[0] : undefined;
}

// Resolve historical item/order messages only when both account identities are unambiguous.
export function messageParticipants(message: any, store: any) {
  const product = (store.digitalMarketProducts || []).find((p: any) => p.id === message.productId);
  const order = (store.digitalMarketOrders || []).find((o: any) => o.id === message.orderId);
  const storeId = message.sellerStoreId || message.storeId || order?.storeId || product?.storeId;
  const candidates = (store.digitalMarketStores || []).filter((s: any) => storeId ? s.id === storeId :
    [message.senderEmail, message.recipientEmail].map(normalizeEmail).includes(normalizeEmail(s.studentEmail)));
  if (candidates.length !== 1) return undefined;
  const seller = candidates[0];
  const direction = message.senderRole || (normalizeEmail(message.senderEmail) === normalizeEmail(seller.studentEmail) ? 'merchant' : 'user');
  if (!['merchant', 'user'].includes(direction)) return undefined;
  if (!(message.buyerId && message.sellerStoreId) && normalizeEmail(direction === 'merchant' ? message.senderEmail : message.recipientEmail) !== normalizeEmail(seller.studentEmail)) return undefined;
  const buyerEmail = normalizeEmail(message.buyerEmail || (direction === 'merchant' ? message.recipientEmail : message.senderEmail));
  const buyers = (store.users || []).filter((u: any) => accountRole(u) === 'user' &&
    (message.buyerId || order?.buyerId ? accountId(u) === (message.buyerId || order?.buyerId) : normalizeEmail(accountData(u).email || u.email) === buyerEmail));
  const ids = new Set(buyers.map(accountId));
  if (ids.size !== 1 || !buyers.length) return undefined;
  return { seller, buyer: accountData(buyers[0]), direction };
}

export function visibleMarketMessage(actor: any, message: any, store: any) {
  const people = messageParticipants(message, store);
  if (!people) return false;
  return actor.role === 'user' ? people.buyer.id === actor.id :
    actor.role === 'merchant' && sellerStore(actor, store)?.id === people.seller.id;
}
export function isMarketMessageNotification(notification: any) {
  return Boolean(notification && (notification.marketChat || /^📩 New message from /.test(notification.title || '')));
}
export function marketNotificationVisible(actor: any, notification: any, store: any) {
  if (notification.marketChat) return notification.targetRole === actor.role && notification.targetAccountId === actor.id;
  // Older message notices used parent email aliases. Resolve the actual recipient only.
  const recipient = normalizeEmail(notification.recipientEmail);
  if (!recipient) return false;
  const sellers = (store.digitalMarketStores || []).filter((s: any) => normalizeEmail(s.studentEmail) === recipient);
  if (sellers.length) return sellers.length === 1 && sellerStore(actor, store)?.id === sellers[0].id;
  return actor.role === 'user' && normalizeEmail(actor.email) === recipient;
}

export function installMarketMessaging(app: any, requireAuth: any, getStore: () => any, syncStore: () => void) {
  const auth = (roles: string[]) => [requireAuth(roles), (req: any, res: any, next: any) => roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'This account cannot perform this action.' })];
  app.get('/api/digital-market/messages', auth(['user', 'merchant']), (req: any, res: any) => {
    const store = getStore();
    if (req.query.email && normalizeEmail(req.query.email) !== normalizeEmail(req.user.email)) return res.status(403).json({ error: 'You cannot view another account’s messages.' });
    if (req.user.role === 'merchant' && !sellerStore(req.user, store)) return res.status(403).json({ error: 'Sign in with your seller account.' });
    const messages = (store.digitalMarketMessages || []).filter((m: any) => visibleMarketMessage(req.user, m, store) &&
      (!req.query.otherEmail || [m.senderEmail, m.recipientEmail].map(normalizeEmail).includes(normalizeEmail(req.query.otherEmail))) &&
      (!req.query.orderId || m.orderId === req.query.orderId) && (!req.query.productId || m.productId === req.query.productId));
    return res.json(messages.sort((a: any, b: any) => Date.parse(a.createdAt) - Date.parse(b.createdAt)).map((message: any) => {
      const people = messageParticipants(message, store)!;
      return { ...message, buyerId: people.buyer.id, sellerStoreId: people.seller.id, senderRole: people.direction };
    }));
  });
  app.post('/api/digital-market/messages', auth(['user', 'merchant']), (req: any, res: any) => {
    const store = getStore(); const actor = req.user; const body = req.body || {};
    if (body.senderEmail && normalizeEmail(body.senderEmail) !== normalizeEmail(actor.email)) return res.status(403).json({ error: 'You cannot send messages as another account.' });
    if (typeof body.content !== 'string' || !body.content.trim() || body.content.length > 5000) return res.status(400).json({ error: 'Enter a message of 1–5000 characters.' });
    const previous = (store.digitalMarketMessages || []).filter((m: any) => visibleMarketMessage(actor, m, store));
    const order = body.orderId ? (store.digitalMarketOrders || []).find((o: any) => o.id === body.orderId) : undefined;
    const product = body.productId ? (store.digitalMarketProducts || []).find((p: any) => p.id === body.productId) : undefined;
    if (body.orderId && !order || body.productId && !product) return res.status(404).json({ error: 'The referenced item or order was not found.' });
    if (order && product && order.storeId !== product.storeId) return res.status(403).json({ error: 'The item and order belong to different stores.' });
    let seller: any, buyer: any, context: any;
    if (actor.role === 'user') {
      if (order && order.buyerId !== actor.id) return res.status(403).json({ error: 'This order belongs to another buyer.' });
      context = previous.find((m: any) => normalizeEmail(m.recipientEmail) === normalizeEmail(body.recipientEmail) || normalizeEmail(m.senderEmail) === normalizeEmail(body.recipientEmail));
      const people = context && messageParticipants(context, store);
      const selectedId = order?.storeId || product?.storeId || people?.seller.id;
      seller = (store.digitalMarketStores || []).find((s: any) => s.id === selectedId);
      buyer = actor;
      if (!seller || normalizeEmail(body.recipientEmail) !== normalizeEmail(seller.studentEmail)) return res.status(403).json({ error: 'Start a buyer conversation from a seller’s item or order.' });
    } else {
      seller = sellerStore(actor, store);
      if (!seller || order && order.storeId !== seller.id || product && product.storeId !== seller.id) return res.status(403).json({ error: 'This conversation belongs to another seller.' });
      context = previous.find((m: any) => {
        const p = messageParticipants(m, store);
        return p && (body.buyerId ? p.buyer.id === body.buyerId : normalizeEmail(p.buyer.email) === normalizeEmail(body.recipientEmail));
      });
      buyer = context && messageParticipants(context, store)?.buyer;
      if (!buyer && order) buyer = accountData((store.users || []).find((u: any) => accountRole(u) === 'user' && accountId(u) === order.buyerId));
      if (!buyer || normalizeEmail(body.recipientEmail) !== normalizeEmail(buyer.email)) return res.status(403).json({ error: 'Reply to an existing buyer inquiry or order.' });
    }
    if (seller.isBanned || ['disabled', 'banned', 'pending'].includes(seller.status)) return res.status(403).json({ error: 'This seller is unavailable.' });
    const message = {
      id: crypto.randomUUID(), buyerId: buyer.id, buyerEmail: buyer.email,
      sellerStoreId: seller.id, storeId: seller.id, senderRole: actor.role,
      senderId: actor.id, senderEmail: actor.role === 'merchant' ? seller.studentEmail : buyer.email,
      senderName: actor.name, recipientEmail: actor.role === 'merchant' ? buyer.email : seller.studentEmail,
      recipientName: actor.role === 'merchant' ? buyer.name : seller.storeName,
      orderId: order?.id || context?.orderId || '', productId: product?.id || order?.productId || context?.productId || '',
      productTitle: product?.title || order?.productTitle || context?.productTitle || '',
      content: body.content.trim(), createdAt: new Date().toISOString()
    };
    store.digitalMarketMessages ||= []; store.digitalMarketMessages.push(message);
    const application = (store.digitalMarketApplications || []).find((a: any) => normalizeEmail(a.studentEmail) === normalizeEmail(seller.studentEmail));
    const merchant = (store.users || []).find((u: any) => accountRole(u) === 'merchant' && normalizeEmail(accountData(u).email) === normalizeEmail(seller.studentEmail));
    const targetAccountId = actor.role === 'merchant' ? buyer.id : merchant ? accountId(merchant) : `merchant:${application?.id || seller.id}`;
    store.notifications ||= [];
    store.notifications.unshift({ id: crypto.randomUUID(), marketChat: true, messageId: message.id, buyerId: buyer.id, sellerStoreId: seller.id, targetRole: actor.role === 'merchant' ? 'user' : 'merchant', targetAccountId,
      userId: targetAccountId, recipientEmail: message.recipientEmail, title: 'New marketplace message',
      message: `${actor.name}: ${message.content.slice(0, 100)}`, type: 'info', date: message.createdAt, read: false });
    syncStore(); return res.status(201).json({ success: true, message });
  });
}
