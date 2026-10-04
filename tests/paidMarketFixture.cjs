// Completed-payment fixtures for tests of unrelated marketplace security boundaries.
// Never imported by runtime code; no provider request or operational data is involved.
const { randomUUID } = require('node:crypto');
exports.paidMarketFixture = stores => ({
  digitalMarketStores: stores.map(store => ({ ...store, semesterExpiresAt: '2099-01-01T00:00:00.000Z', paymentMode: 'live' })),
  paymentTransactions: stores.map(store => ({ id: randomUUID(), storeId: store.id, purpose: 'activation', mode: 'live', amount: 5000, currency: 'GHS', status: 'fulfilled' }))
});
