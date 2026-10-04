import { buildWipePlan } from '../adminWipeScope.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import crypto from 'node:crypto';
import { PaystackPayments, PaymentError, addMonths, validPaystackSignature, marketAccessPaid, paystackConfig } from '../paystackPayments.js';
import { effectiveMarketPlan, PLAN_LIMITS } from '../marketPlans.js';
import { publicPlatformSettings, validatePlatformSettings } from '../platformSettings.js';
function setup() {
  process.env.NODE_ENV = 'test'; process.env.PAYSTACK_SECRET_KEY = ['sk', 'test', 'isolated'].join('_'); process.env.PINEVELA_PUBLIC_ORIGIN = 'http://localhost:3000';
  const actor = { id: 'isolated-merchant', email: 'merchant@example.test', role: 'merchant', merchantStoreId: 'isolated-store' };
  const seller: any = { id: actor.merchantStoreId, studentEmail: actor.email, status: 'active', setupDetailsSaved: true };
  const store: any = { users: [actor], digitalMarketApplications: [{ id: 'isolated-app', studentEmail: actor.email, status: 'approved' }], digitalMarketStores: [seller], platformSettings: { registrationFee: 51.25, semesterFee: 123, subscriptionPrices: { default: 0, star: 37.5, pro: 71 }, commission: 5, maintenanceMode: false, announcement: '' }, digitalMarketProducts: [] };
  const requests: any[] = []; let now = Date.UTC(2026, 0, 31, 12), evidence: any;
  const payments = new PaystackPayments(() => store, () => {}, async (path, body) => {
    requests.push({ path, body }); if (body) return { authorization_url: 'https://checkout.paystack.com/isolated', reference: body.reference };
    const t = store.paymentTransactions.find((t: any) => path.endsWith(t.reference));
    return evidence || { status: 'success', reference: t.reference, amount: t.amount, currency: t.currency, customer: { email: t.email }, domain: 'test' };
  }, () => now);
  return { actor, seller, store, payments, requests, setEvidence: (value: any) => evidence = value, advance: (value: number) => now = value, now: () => now };
}
test('Prices are validated, configurable for all plans and preserve current values on unrelated saves', () => {
  const f = setup(), prices = publicPlatformSettings(f.store);
  assert.equal(prices.semesterFee, 123); assert.deepEqual(prices.subscriptionPrices, { default: 0, star: 37.5, pro: 71 });
  assert.equal(validatePlatformSettings({ ...prices, announcement: 'Changed', subscriptionPrices: undefined, semesterFee: undefined }, prices).subscriptionPrices.star, 37.5);
  for (const value of [-1, 0.01, 1.234, Infinity, '90', null]) assert.throws(() => validatePlatformSettings({ ...prices, subscriptionPrices: { ...prices.subscriptionPrices, pro: value } }));
  assert.throws(() => validatePlatformSettings({ ...prices, subscriptionPrices: { ...prices.subscriptionPrices, injected: 0 } }));
});
test('All three plans use quoted registration + two-month + monthly prices, verified once with calendar expiry', async () => {
  for (const plan of ['default', 'star', 'pro'] as const) {
    const f = setup(), quote = await f.payments.initialize(f.actor, { purpose: 'activation', plan, amount: 1, paid: true });
    assert.equal(f.requests[0].body.amount, Math.round((51.25 + 123 + f.store.platformSettings.subscriptionPrices[plan]) * 100));
    assert.equal(f.seller.registrationFeePaid, undefined); assert.equal(quote.mode, 'test');
    // A quote retains its price after an administrator updates the next checkout's price.
    f.store.platformSettings.subscriptionPrices[plan] += 5;
    const paid = await f.payments.verify(f.actor, quote.reference); assert.equal(paid.paid, true);
    assert.equal(effectiveMarketPlan(f.seller, f.now()), plan); assert.equal(f.seller.subscriptionExpiresAt, '2026-02-28T12:00:00.000Z'); assert.equal(f.seller.semesterExpiresAt, '2026-03-31T12:00:00.000Z');
    const expiry = f.seller.subscriptionExpiresAt;
    await Promise.all([f.payments.verify(f.actor, quote.reference), f.payments.verify(f.actor, quote.reference)]);
    assert.equal(f.seller.subscriptionExpiresAt, expiry); assert.equal(f.store.paymentTransactions.length, 1);
    assert.equal(effectiveMarketPlan(f.seller, f.now(), true), 'default');
    f.advance(Date.UTC(2026, 3, 1)); assert.equal(effectiveMarketPlan(f.seller, f.now()), 'default'); assert.equal(marketAccessPaid(f.store, f.seller, f.now()), false);
    assert.deepEqual(PLAN_LIMITS[plan], plan === 'default' ? { items: 20, services: 1, inventory: 200 } : plan === 'star' ? { items: 100, services: 5, inventory: 600 } : { items: 200, services: 10, inventory: 900 });
  }
});
test('Anonymous/primary/foreign actors and forged receipts cannot grant access', async () => {
  const f = setup();
  await assert.rejects(f.payments.initialize({ ...f.actor, role: 'user' }, { purpose: 'activation' }), (e: any) => e.status === 403);
  await assert.rejects(f.payments.initialize({ ...f.actor, email: 'foreign@example.test' }, { purpose: 'activation' }), (e: any) => e.status === 403);
  const quote = await f.payments.initialize(f.actor, { purpose: 'activation', plan: 'star' });
  await assert.rejects(f.payments.verify({ ...f.actor, id: 'other' }, quote.reference), (e: any) => e.status === 404);
  const t = f.store.paymentTransactions[0], valid = { status: 'success', reference: t.reference, amount: t.amount, currency: 'GHS', customer: { email: t.email }, domain: 'test' };
  for (const invalid of [{ status: 'pending' }, { status: 'failed' }, { reference: 'wrong' }, { amount: 1 }, { currency: 'NGN' }, { customer: { email: 'foreign@example.test' } }, { domain: 'live' }]) {
    f.setEvidence({ ...valid, ...invalid }); await assert.rejects(f.payments.verify(f.actor, t.reference), (e: any) => e.status === 409); assert(!f.seller.registrationFeePaid); assert.equal(t.status, 'pending');
  }
  f.setEvidence(valid); await f.payments.verify(f.actor, quote.reference);
  await assert.rejects(f.payments.initialize(f.actor, { purpose: 'activation', plan: 'star' }), (e: any) => e.status === 409);
});
test('Monthly renewals, separate two-month fee, free plans and downgrade capacity checks', async () => {
  const f = setup(), initial = await f.payments.initialize(f.actor, { purpose: 'activation', plan: 'star' }); await f.payments.verify(f.actor, initial.reference);
  const term = f.seller.semesterExpiresAt;
  const renewal = await f.payments.initialize(f.actor, { purpose: 'subscription', plan: 'star' }); assert.equal(renewal.amount, 37.5); await f.payments.verify(f.actor, renewal.reference);
  assert.equal(f.seller.semesterExpiresAt, term); assert.equal(f.seller.subscriptionExpiresAt, '2026-03-28T12:00:00.000Z');
  const semester = await f.payments.initialize(f.actor, { purpose: 'semester' }); assert.equal(semester.amount, 123); await f.payments.verify(f.actor, semester.reference); assert.equal(f.seller.semesterExpiresAt, '2026-05-31T12:00:00.000Z');
  f.store.digitalMarketProducts = Array.from({ length: 21 }, (_, i) => ({ id: i, storeId: f.seller.id, stockQuantity: 1 }));
  await assert.rejects(f.payments.initialize(f.actor, { purpose: 'subscription', plan: 'default' }), (e: any) => e.status === 409);
  f.store.digitalMarketProducts = [];
  const free = await f.payments.initialize(f.actor, { purpose: 'subscription', plan: 'default' }); assert.equal(free.paid, true); assert.equal(free.amount, 0); assert.equal(free.mode, 'free');
});
test('Checkout, verification and pending records are bounded; unverified legacy flags are insufficient', async () => {
  const f = setup(); f.seller.registrationFeePaid = true; f.seller.setupCompleted = true; f.seller.semesterExpiresAt = '2099-01-01T00:00:00.000Z';
  assert.equal(marketAccessPaid(f.store, f.seller), false);
  for (let i = 0; i < 5; i++) await f.payments.initialize(f.actor, { purpose: 'activation' });
  await assert.rejects(f.payments.initialize(f.actor, { purpose: 'activation' }), (e: any) => e.status === 429);
  for (let i = 0; i < 15; i++) f.payments.limit('isolated'); assert.throws(() => f.payments.limit('isolated'), (e: any) => e.status === 429);
});
test('Webhook signatures bind exact raw bytes; test credentials fail closed in production', () => {
  setup(); const raw = Buffer.from('{"event":"charge.success"}'), key = 'isolated-signing-key';
  const signature = crypto.createHmac('sha512', key).update(raw).digest('hex');
  assert(validPaystackSignature(raw, signature, key)); assert(!validPaystackSignature(Buffer.from('{ "event":"charge.success"}'), signature, key)); assert(!validPaystackSignature(raw, 'forged', key));
  process.env.NODE_ENV = 'production'; assert.throws(paystackConfig, (e: any) => e instanceof PaymentError && e.status === 503); process.env.NODE_ENV = 'test';
  assert.equal(addMonths(Date.UTC(2024, 0, 31), 1), '2024-02-29T00:00:00.000Z');
});
test('Failed persistence rolls back paid access and leaves a retryable pending quote', async () => {
  const f = setup(); let fail = false;
  const payments = new PaystackPayments(() => f.store, () => { if (fail) throw new Error('Isolated disk failure'); }, async (_path, body) => body ? { reference: body.reference, authorization_url: 'https://checkout.paystack.com/isolated' } : { status: 'success', reference: f.store.paymentTransactions[0].reference, amount: f.store.paymentTransactions[0].amount, currency: 'GHS', customer: { email: f.actor.email }, domain: 'test' });
  const quote = await payments.initialize(f.actor, { purpose: 'activation', plan: 'pro' }); fail = true;
  await assert.rejects(payments.verify(f.actor, quote.reference), /Isolated disk failure/);
  assert.equal(f.seller.registrationFeePaid, undefined); assert.equal(f.store.paymentTransactions[0].status, 'pending');
  fail = false; assert.equal((await payments.verify(f.actor, quote.reference)).paid, true);
});

test('Marketplace wipe removes pending/paid market records, including orphan references, while preserving housing payments', () => {
  const f = setup(); f.store.paymentTransactions = [
    { id: 'market-payment', storeId: f.seller.id, purpose: 'activation' },
    { id: 'orphan-quote', storeId: 'retired-store', purpose: 'subscription' },
    { id: 'housing-payment', hostelId: 'preserved-residence', purpose: 'housing' }
  ];
  const plan = buildWipePlan(f.store, ['markets']);
  assert.deepEqual(plan.removed.paymentTransactions.map(t => t.id).sort(), ['market-payment', 'orphan-quote']);
  assert.deepEqual(plan.kept.paymentTransactions.map(t => t.id), ['housing-payment']);
});

test('Free renewals cannot bank indefinite future access; changed prices honor only the existing period', async () => {
  const f = setup(); f.store.platformSettings.registrationFee = 0; f.store.platformSettings.semesterFee = 0; f.store.platformSettings.subscriptionPrices.pro = 0;
  await f.payments.initialize(f.actor, { purpose: 'activation', plan: 'pro' });
  const planExpiry = f.seller.subscriptionExpiresAt, semesterExpiry = f.seller.semesterExpiresAt;
  for (let i = 0; i < 3; i++) { await f.payments.initialize(f.actor, { purpose: 'subscription', plan: 'pro' }); await f.payments.initialize(f.actor, { purpose: 'semester' }); }
  assert.equal(f.seller.subscriptionExpiresAt, planExpiry); assert.equal(f.seller.semesterExpiresAt, semesterExpiry);
  f.store.platformSettings.subscriptionPrices.pro = 70;
  assert.equal(effectiveMarketPlan(f.seller, f.now()), 'pro');
  assert.equal(effectiveMarketPlan(f.seller, Date.parse(planExpiry) + 1), 'default');
});

test('Mobile money validates numbers/networks, uses server quotes and still requires independent verification', async () => {
  const f = setup(); let body: any, evidence: any;
  const payments = new PaystackPayments(() => f.store, () => {}, async (route, payload) => {
    if (payload) { assert.equal(route, '/charge'); body = payload; return { reference: payload.reference, status: 'pay_offline', display_text: 'Provider private response' }; }
    return evidence;
  });
  for (const mobileMoney of [{ phone: 'one', provider: 'vod' }, { phone: '0500000000', provider: 'unknown' }, { phone: 500000000, provider: 'vod' }, { phone: '0500000000', provider: 'vod', pin: '1234' }]) await assert.rejects(payments.initialize(f.actor, { purpose: 'activation', mobileMoney }), (e: any) => e.status === 400);
  const quote: any = await payments.initialize(f.actor, { purpose: 'activation', plan: 'star', amount: 1, mobileMoney: { phone: '0500000000', provider: 'vod' } });
  assert.equal(body.amount, 21175); assert.equal(body.mobile_money.provider, 'vod'); assert.equal(body.transaction_charge, undefined);
  assert.equal(quote.providerStatus, 'pay_offline'); assert(!JSON.stringify(quote).includes('0500000000')); assert(!JSON.stringify(f.store.paymentTransactions).includes('0500000000'));
  evidence = { status: 'failed', reference: quote.reference, amount: body.amount, currency: 'GHS', domain: 'test', customer: { email: f.actor.email } };
  await assert.rejects(payments.verify(f.actor, quote.reference), (e: any) => e.status === 409); assert(!f.seller.registrationFeePaid);
  evidence.status = 'success'; assert.equal((await payments.verify(f.actor, quote.reference)).paid, true);
});

test('Receiving account changes validate provider state, remain private, bind quotes, and roll back failed saves', async () => {
  const f = setup(), admin = { id: 'admin', role: 'admin' };
  let authorizations = 0, failSave = false;
  const account: any = { subaccount_code: 'ACCT_verified', domain: 'test', currency: 'GHS', active: true, is_verified: true, account_number: '1234567890', business_name: 'Isolated receiver', settlement_bank: 'Isolated bank' };
  let evidence: any;
  const requests: any[] = [];
  const payments = new PaystackPayments(() => f.store, () => { if (failSave) throw new Error('Disk failed'); }, async (route, body) => {
    requests.push({ route, body });
    if (route.startsWith('/subaccount?')) return [account, { ...account, is_verified: false }];
    if (route.startsWith('/subaccount/')) return account;
    if (body) return { reference: body.reference, authorization_url: 'https://checkout.paystack.com/isolated' };
    return evidence;
  });
  const authorize = () => { authorizations++; };
  await assert.rejects(payments.settlementOptions(f.actor), (e: any) => e.status === 403);
  await assert.rejects(payments.setSettlement(f.actor, account.subaccount_code, authorize), (e: any) => e.status === 403);
  await assert.rejects(payments.setSettlement(admin, 'ACCT_verified', () => { throw new PaymentError('Invalid key', 403); }), (e: any) => e.status === 403); assert.equal(requests.length, 0);
  const options = await payments.settlementOptions(admin); assert.equal(options.accounts.length, 1); assert.equal(options.accounts[0].last4, '7890'); assert(!JSON.stringify(options).includes('1234567890'));
  for (const patch of [{ active: false }, { is_verified: false }, { currency: 'NGN' }, { domain: 'live' }]) {
    const valid = { ...account }; Object.assign(account, patch);
    await assert.rejects(payments.setSettlement(admin, 'ACCT_verified', authorize), (e: any) => e.status === 409); Object.assign(account, valid);
  }
  await payments.setSettlement(admin, 'ACCT_verified', authorize); assert(authorizations >= 2);
  assert(!('paystackSettlement' in publicPlatformSettings(f.store)));
  const quote = await payments.initialize(f.actor, { purpose: 'activation', plan: 'star', subaccount: 'ACCT_attacker' });
  const body = requests.find(r => r.body)?.body; assert.equal(body.subaccount, 'ACCT_verified'); assert.equal(body.transaction_charge, 0); assert.equal(body.bearer, 'subaccount');
  assert(!JSON.stringify(quote).includes('ACCT_verified'));
  await payments.setSettlement(admin, '', authorize); assert.equal(f.store.paymentTransactions[0].settlementCode, 'ACCT_verified');
  evidence = { status: 'success', reference: quote.reference, amount: body.amount, currency: 'GHS', domain: 'test', customer: { email: f.actor.email }, subaccount: { subaccount_code: 'ACCT_attacker' } };
  await assert.rejects(payments.verify(f.actor, quote.reference), (e: any) => e.status === 409); assert(!f.seller.registrationFeePaid);
  evidence.subaccount.subaccount_code = 'ACCT_verified'; await payments.verify(f.actor, quote.reference);
  failSave = true; await assert.rejects(payments.setSettlement(admin, 'ACCT_verified', authorize), /Disk failed/); assert.equal(f.store.platformSettings.paystackSettlement.code, '');
  failSave = false; f.store.platformSettings.paystackSettlement = { code: 'ACCT_verified', mode: 'live' };
  await assert.rejects(payments.initialize(f.actor, { purpose: 'semester' }), (e: any) => e.status === 503);
});
