import { storeProfileFields, StoreProfileError } from './marketStoreProfile.js';
import { marketStoreBranding } from './marketBranding.js';
import crypto from 'node:crypto';
import { accountData, canManageHostel, normalizeEmail } from './accountSecurity.js';
import { publicPlatformSettings } from './platformSettings.js';
import { effectiveMarketPlan, PLAN_LIMITS, validPlan, type MarketPlan } from './marketPlans.js';
import { GovernanceError } from './adminGovernance.js';

type Purpose = 'activation' | 'subscription' | 'semester' | 'housing';
import {PaymentError,paystackConfig,paymentOrigin,validPaystackSignature,addMonths,paystackRequest} from './paystackProvider.js';
export {PaymentError,paystackConfig,paymentOrigin,validPaystackSignature,addMonths,paystackRequest} from './paystackProvider.js';
export function hasVerifiedRegistration(store: any, seller: any) {
  return (store.paymentTransactions || []).some((t: any) => t.storeId === seller.id && t.purpose === 'activation' && t.status === 'fulfilled' && (process.env.NODE_ENV !== 'production' || t.mode !== 'test'));
}
export function marketAccessPaid(store: any, seller: any, now = Date.now()) {
  const plan = effectiveMarketPlan(seller, now, process.env.NODE_ENV === 'production');
  const paidDefaultRequired = plan === 'default' && publicPlatformSettings(store).subscriptionPrices.default > 0;
  const defaultPaid = seller.subscriptionPlan === 'default' && ['active', 'test_active', 'free'].includes(seller.subscriptionStatus) && Date.parse(seller.subscriptionExpiresAt) > now;
  return hasVerifiedRegistration(store, seller) && Date.parse(seller.semesterExpiresAt) > now && (!paidDefaultRequired || defaultPaid) && (process.env.NODE_ENV !== 'production' || seller.paymentMode !== 'test');
}
export function publicPaidStore(seller: any, database?: any) {
  return seller ? { ...seller, ...marketStoreBranding(seller, process.env.NODE_ENV === 'production'), ...(database ? { registrationFeePaid: hasVerifiedRegistration(database, seller), setupCompleted: Boolean(seller.setupCompleted && hasVerifiedRegistration(database, seller)) } : {}), subscriptionPlan: effectiveMarketPlan(seller, Date.now(), process.env.NODE_ENV === 'production') } : seller;
}

/** Immutable server quotes, provider verification and synchronous, idempotent fulfillment. */
export class PaystackPayments {
  private flights = new Map<string, Promise<any>>();
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private store: () => any, private save: () => void, private provider = paystackRequest, private now = Date.now, private saveSettlement: () => void = save) {}
  async settlementOptions(actor: any) {
    if (actor?.role !== 'admin') throw new PaymentError('Administrator access required.', 403);
    this.limit(`settlement:${actor.id}`);
    const { mode } = paystackConfig();
    const data = await this.provider('/subaccount?perPage=100');
    if (!Array.isArray(data)) throw new PaymentError('Paystack returned invalid receiving accounts.', 502);
    return { mode, selected: this.store().platformSettings?.paystackSettlement?.code || '', accounts: data.filter(a => a.domain === mode && a.currency === 'GHS' && a.active === true && a.is_verified === true && /^ACCT_[A-Za-z0-9]+$/.test(a.subaccount_code)).map(a => ({ code: a.subaccount_code, name: a.business_name, bank: a.settlement_bank, last4: String(a.account_number || '').slice(-4) })), possiblyMore: data.length === 100 };
  }
  async setSettlement(actor: any, code: unknown, authorize: () => void) {
    if (actor?.role !== 'admin') throw new PaymentError('Administrator access required.', 403);
    authorize(); this.limit(`settlement:${actor.id}`);
    if (typeof code !== 'string' || code !== '' && !/^ACCT_[A-Za-z0-9]{1,80}$/.test(code)) throw new PaymentError('Choose a Paystack receiving account.');
    const { mode } = paystackConfig();
    if (code) {
      const account = await this.provider(`/subaccount/${code}`);
      if (account.subaccount_code !== code || account.domain !== mode || account.currency !== 'GHS' || account.active !== true || account.is_verified !== true) throw new PaymentError('The receiving account must be active, verified and in this Paystack GHS environment.', 409);
    }
    // Recheck membership/key after the provider request, before changing private configuration.
    authorize();
    const current = this.store(); current.platformSettings ||= {};
    const previous = current.platformSettings.paystackSettlement;
    current.platformSettings.paystackSettlement = { code, mode, updatedBy: actor.id, updatedAt: new Date(this.now()).toISOString() };
    try { this.saveSettlement(); } catch (error) { if (previous === undefined) delete current.platformSettings.paystackSettlement; else current.platformSettings.paystackSettlement = previous; throw error; }
    return { success: true, selected: code, mode };
  }
  limit(id: string) {
    const now = this.now(), previous = this.attempts.get(id);
    if (previous && previous.until > now && previous.count >= 15) throw new PaymentError('Too many payment attempts. Wait one minute.', 429);
    if (this.attempts.size >= 4000) for (const [key, entry] of this.attempts) if (entry.until <= now) this.attempts.delete(key);
    if (!previous && this.attempts.size >= 4000) throw new PaymentError('Checkout is busy. Try again shortly.', 429);
    this.attempts.set(id, previous && previous.until > now ? { ...previous, count: previous.count + 1 } : { count: 1, until: now + 60_000 });
  }
  private seller(actor: any) {
    if (actor?.role !== 'merchant') throw new PaymentError('Sign in with your seller account to manage marketplace payments.', 403);
    const store = this.store(), email = normalizeEmail(actor.email);
    const application = (store.digitalMarketApplications || []).find((a: any) => normalizeEmail(a.studentEmail) === email && a.status === 'approved');
    const seller = (store.digitalMarketStores || []).find((s: any) => normalizeEmail(s.studentEmail) === email && (!actor.merchantStoreId || s.id === actor.merchantStoreId));
    if (!seller || !application || seller.isBanned) throw new PaymentError('An approved seller application and store are required.', 403);
    return { store, seller, application };
  }
  draft(actor: any, body: any) {
    const { seller, application } = this.seller(actor);
    Object.assign(seller, storeProfileFields(body, actor, this.store(), seller, true));
    seller.setupDetailsSaved = true;
    // Draft saves never attest payment, approval or paid access.
    seller.registrationFeePaid = hasVerifiedRegistration(this.store(), seller);
    seller.setupCompleted = seller.registrationFeePaid;
    application.registrationFeePaid = seller.registrationFeePaid;
    application.setupCompleted = seller.setupCompleted;
    this.save(); return { success: true, store: publicPaidStore(seller, this.store()), paymentRequired: !marketAccessPaid(this.store(), seller, this.now()) };
  }
  async initialize(actor: any, body: any, req?: any) {
    const mobileMoney = body?.mobileMoney;
    if (mobileMoney !== undefined && (!mobileMoney || typeof mobileMoney !== 'object' || Array.isArray(mobileMoney) || Object.keys(mobileMoney).some(key => !['phone', 'provider'].includes(key)) || typeof mobileMoney.phone !== 'string' || !/^(?:0|\+233)[235]\d{8}$/.test(mobileMoney.phone) || !['mtn', 'vod', 'atl'].includes(mobileMoney.provider))) throw new PaymentError('Enter a valid Ghana mobile-money number and network.');
    this.limit(`checkout:${actor.id}`);
    const purpose: Purpose = body?.purpose;
    if (!['activation', 'subscription', 'semester', 'housing'].includes(purpose)) throw new PaymentError('Choose a valid payment purpose.');
    const current = this.store(), prices = publicPlatformSettings(current);
    let seller: any, application: any, hostel: any;
    let plan: MarketPlan = 'default';
    if (purpose === 'housing') {
      hostel = (current.hostels || []).find((h: any) => h.id === body.hostelId);
      if (actor.role !== 'manager' || !hostel || !canManageHostel(actor, hostel)) throw new PaymentError('You may only pay onboarding for your own residence.', 403);
      if ((current.paymentTransactions || []).some((t: any) => t.hostelId === hostel.id && t.status === 'fulfilled' && t.purpose === 'housing' && (process.env.NODE_ENV !== 'production' || t.mode !== 'test'))) return { success: true, paid: true };
    } else {
      ({ seller, application } = this.seller(actor));
      if (!seller.setupDetailsSaved && !seller.setupCompleted) throw new PaymentError('Save your store details before checkout.');
      if (!validPlan(body.plan ?? 'default')) throw new PaymentError('Invalid subscription plan.');
      plan = body.plan ?? 'default';
      if (purpose === 'activation' && hasVerifiedRegistration(current, seller)) throw new PaymentError('Registration has already been paid. Renew your plan or two-month fee instead.', 409);
      if (purpose !== 'activation' && !hasVerifiedRegistration(current, seller)) throw new PaymentError('Complete verified market registration first.', 403);
      if (purpose === 'subscription' || purpose === 'activation') this.checkPlanCapacity(seller, plan);
    }
    const lines = purpose === 'activation' ? [{ kind: 'registration', amount: prices.registrationFee }, { kind: 'semester', amount: prices.semesterFee }, { kind: 'subscription', amount: prices.subscriptionPrices[plan] }] : [{ kind: purpose, amount: purpose === 'housing' ? 50 : purpose === 'semester' ? prices.semesterFee : prices.subscriptionPrices[plan] }];
    const amount = lines.reduce((sum, line) => sum + Math.round(line.amount * 100), 0);
    const mode = amount ? paystackConfig().mode : 'free';
    const settlement = current.platformSettings?.paystackSettlement;
    if (amount && settlement?.code && (settlement.mode !== mode || !/^ACCT_[A-Za-z0-9]{1,80}$/.test(settlement.code))) throw new PaymentError('The payment receiving account requires administrator configuration for this environment.', 503);
    const origin = amount ? paymentOrigin(req) : undefined;
    const ledger = current.paymentTransactions ||= [];
    const pending = ledger.filter((t: any) => t.actorId === actor.id && t.status === 'pending' && Date.parse(t.createdAt) > this.now() - 86_400_000);
    if (amount && pending.length >= 5) throw new PaymentError('You have unfinished checkouts. Finish or verify an existing checkout before starting another.', 429);
    const transaction = { id: crypto.randomUUID(), reference: `PV-${crypto.randomBytes(24).toString('hex')}`, actorId: actor.id, email: normalizeEmail(actor.email), storeId: seller?.id, applicationId: application?.id, hostelId: hostel?.id, purpose, plan, amount, currency: 'GHS', lines, mode, status: 'pending', createdAt: new Date(this.now()).toISOString(), ...(settlement?.code && amount ? { settlementCode: settlement.code } : {}) };
    ledger.push(transaction); this.save();
    if (!amount) return this.fulfill(transaction, { reference: transaction.reference, status: 'success', amount: 0, currency: 'GHS', customer: { email: transaction.email }, domain: 'free' });
    const payload = { email: transaction.email, amount, currency: 'GHS', reference: transaction.reference, metadata: { transactionId: transaction.id }, ...(transaction.settlementCode ? { subaccount: transaction.settlementCode, transaction_charge: 0, bearer: 'subaccount' } : {}) };
    let data: any; try { data = await this.provider(mobileMoney ? '/charge' : '/transaction/initialize', mobileMoney ? { ...payload, mobile_money: mobileMoney } : { ...payload, callback_url: `${origin}/api/payments/paystack/callback` }); } catch (error) { transaction.status = 'initialization_failed'; this.save(); throw error; }
    if (mobileMoney) {
      if (data.reference !== transaction.reference) throw new PaymentError('Paystack returned an invalid charge reference.', 502);
      // Never trust a charge response as payment proof, even if it says success.
      return { success: true, paymentRequired: true, reference: transaction.reference, amount: amount / 100, currency: 'GHS', mode, lines, mobileMoney: true, providerStatus: data.status, message: 'Approve the payment on your phone, then verify it in PineVela. Never enter your wallet PIN here.' };
    }
    const url = new URL(data.authorization_url || '');
    if (data.reference !== transaction.reference || url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.username || url.password) throw new PaymentError('Paystack returned an invalid checkout.', 502);
    return { success: true, paymentRequired: true, reference: transaction.reference, authorizationUrl: url.href, amount: amount / 100, currency: 'GHS', mode, lines };
  }
  private checkPlanCapacity(seller: any, plan: MarketPlan) {
    const products = (this.store().digitalMarketProducts || []).filter((p: any) => p.storeId === seller.id), limits = PLAN_LIMITS[plan];
    const items = products.filter((p: any) => !(p.isService || String(p.category).toLowerCase().includes('service')));
    if (items.length > limits.items || products.length - items.length > limits.services || items.reduce((sum: number, p: any) => sum + Math.max(0, Number(p.stockQuantity) || 0), 0) > limits.inventory) throw new PaymentError('Reduce your listings and inventory to this plan’s limits before switching.', 409);
  }
  async verify(actor: any, reference: any) {
    if (typeof reference !== 'string' || !/^PV-[a-f0-9]{48}$/.test(reference)) throw new PaymentError('Invalid payment reference.');
    const t = (this.store().paymentTransactions || []).find((t: any) => t.reference === reference);
    if (!t || actor && (t.actorId !== actor.id || t.email !== normalizeEmail(actor.email))) throw new PaymentError('Payment not found for this account.', 404);
    if (actor) this.limit(`verify:${actor.id}`);
    if (process.env.NODE_ENV === 'production' && t.mode === 'test') throw new PaymentError('Test payments cannot activate production accounts.', 403);
    if (t.status === 'fulfilled') return this.result(t);
    if (t.mode === 'free' && t.amount === 0) return this.fulfill(t, { reference: t.reference, status: 'success', amount: 0, currency: 'GHS', customer: { email: t.email }, domain: 'free' });
    if (paystackConfig().mode !== t.mode) throw new PaymentError('The payment environment changed. Contact support.', 409);
    if (this.flights.has(reference)) return this.flights.get(reference);
    if (this.flights.size >= 16) throw new PaymentError('Payment verification is busy. Try again shortly.', 429);
    const flight = (async () => { const evidence = await this.provider(`/transaction/verify/${reference}`); return this.fulfill(t, evidence); })();
    this.flights.set(reference, flight); try { return await flight; } finally { this.flights.delete(reference); }
  }
  private result(t: any) {
    const seller = (this.store().digitalMarketStores || []).find((s: any) => s.id === t.storeId);
    return { success: true, paid: true, paymentRequired: false, reference: t.reference, purpose: t.purpose, mode: t.mode, amount: t.amount / 100, store: publicPaidStore(seller, this.store()) };
  }
  private fulfill(t: any, evidence: any) {
    const current = this.store();
    if (!(current.paymentTransactions || []).includes(t)) throw new PaymentError('This payment is no longer available.', 409);
    if (t.status === 'fulfilled') return this.result(t);
    if (evidence.status !== 'success') throw new PaymentError('Payment has not succeeded. Finish checkout before verifying.', 409);
    if (evidence.reference !== t.reference || evidence.amount !== t.amount || evidence.currency !== 'GHS' || normalizeEmail(evidence.customer?.email) !== t.email || evidence.domain !== t.mode) throw new PaymentError('Payment details do not match the server quote. Contact support.', 409);
    if (t.settlementCode && evidence.subaccount?.subaccount_code !== t.settlementCode) throw new PaymentError('Payment receiving account does not match the server quote. Contact support.', 409);
    const seller = (current.digitalMarketStores || []).find((s: any) => s.id === t.storeId);
    const application = (current.digitalMarketApplications || []).find((a: any) => a.id === t.applicationId);
    const now = this.now(), paidAt = new Date(now).toISOString();
    const changedRecords = [t, seller, application,
      ...(current.users || []).map(accountData).filter((u: any) => u.role === 'merchant' && normalizeEmail(u.email) === t.email),
      ...(current.hostels || []).filter((h: any) => t.purpose === 'housing' && h.id === t.hostelId),
      ...(current.hostelVerifications || []).filter((v: any) => t.purpose === 'housing' && v.hostelId === t.hostelId)
    ].filter(Boolean).map(record => ({ record, previous: structuredClone(record) }));
    const oldPayments = current.onboardingPayments?.slice();
    try {
      if (t.purpose !== 'housing') {
        if (!seller || !application || seller.isBanned || application.status !== 'approved' || normalizeEmail(seller.studentEmail) !== t.email) throw new PaymentError('The store is no longer eligible. Contact support about your payment.', 409);
        if (t.purpose === 'activation' || t.purpose === 'subscription') this.checkPlanCapacity(seller, t.plan);
        if (t.purpose === 'activation') {
          if (hasVerifiedRegistration(current, seller)) throw new PaymentError('Registration was already fulfilled by another payment. Contact support.', 409);
          seller.setupCompleted = application.setupCompleted = true;
          seller.registrationFeePaid = application.registrationFeePaid = true;
          seller.registrationFeeAmount = application.registrationFeeAmount = t.lines.find((l: any) => l.kind === 'registration').amount;
          seller.status = 'active'; seller.paymentTransactionRef = application.paymentTransactionRef = t.reference;
          seller.paidAt = application.paidAt = paidAt;
        }
        if (t.purpose === 'activation' || t.purpose === 'semester') {
          seller.semesterFeeAmount = t.lines.find((l: any) => l.kind === 'semester').amount;
          seller.semesterExpiresAt = seller.semesterFeeAmount === 0 ? new Date(Math.max(Date.parse(addMonths(now, 2)), Date.parse(seller.semesterExpiresAt) || 0)).toISOString() : addMonths(Math.max(now, Date.parse(seller.semesterExpiresAt) || 0), 2);
        }
        if (t.purpose === 'activation' || t.purpose === 'subscription') {
          const renewing = seller.subscriptionPlan === t.plan;
          seller.subscriptionPlan = t.plan; seller.subscriptionStatus = t.mode === 'test' ? 'test_active' : t.mode === 'free' ? 'free' : 'active';
          const previousExpiry = renewing ? Math.max(now, Date.parse(seller.subscriptionExpiresAt) || 0) : now;
          const planAmount = t.lines.find((line: any) => line.kind === 'subscription').amount;
          seller.subscriptionExpiresAt = planAmount === 0 ? new Date(Math.max(previousExpiry, Date.parse(addMonths(now, 1)))).toISOString() : addMonths(previousExpiry, 1);
          seller.subscriptionUpdatedAt = paidAt;
        }
        if (t.purpose === 'activation' || t.purpose === 'semester') seller.paymentMode = t.mode;
        for (const entry of current.users || []) { const u = accountData(entry); if (u.role === 'merchant' && normalizeEmail(u.email) === t.email) { u.merchantSetupCompleted = seller.setupCompleted; u.merchantRegistrationFeePaid = seller.registrationFeePaid; } }
      } else {
        const hostel = (current.hostels || []).find((h: any) => h.id === t.hostelId);
        const actor = (current.users || []).map(accountData).find((u: any) => u.id === t.actorId);
        if (!hostel || !actor || !canManageHostel(actor, hostel)) throw new PaymentError('The residence relationship changed. Contact support about your payment.', 409);
        hostel.onboardingFeePaid = true; hostel.onboardingPaymentReference = t.reference;
        current.onboardingPayments ||= [];
        current.onboardingPayments.push({ id: t.id, hostelId: hostel.id, hostelName: hostel.name, managerId: actor.id, managerName: actor.name, amount: t.amount / 100, currency: 'GHS', status: 'paid', verified: true, mode: t.mode, reference: t.reference, paymentMethod: 'Paystack', paidAt });
        for (const v of current.hostelVerifications || []) if (v.hostelId === hostel.id) { v.paymentStatus = 'paid'; v.paymentReference = t.reference; v.paymentDate = paidAt; }
      }
      t.status = 'fulfilled'; t.fulfilledAt = paidAt; this.save(); return this.result(t);
    } catch (error) {
      for (const { record, previous } of changedRecords) { for (const key of Object.keys(record)) delete record[key]; Object.assign(record, previous); }
      if (oldPayments) current.onboardingPayments = oldPayments; else delete current.onboardingPayments;
      throw error;
    }
  }
}

export function installPaystackPayments(app: any, auth: any, payments: PaystackPayments, getStore: () => any, authorizeSettings?: (id: string, key: unknown) => void) {
  const action = (fn: any) => async (req: any, res: any) => { res.set('Cache-Control', 'no-store'); try { res.json(await fn(req)); } catch (error) { if (error instanceof PaymentError || error instanceof GovernanceError || error instanceof StoreProfileError) return res.status(error.status).json({ error: error.message }); throw error; } };
  app.get('/api/admin/payments/receiving-account', auth(['admin']), action((req: any) => payments.settlementOptions(req.user)));
  app.post('/api/admin/payments/receiving-account', auth(['admin']), action((req: any) => {
    if (!authorizeSettings) throw new PaymentError('Administrator settings authorization is unavailable.', 503);
    if (Object.keys(req.body || {}).some(key => !['code', 'settingsKey'].includes(key))) throw new PaymentError('Only the receiving account and your settings key may be supplied.');
    return payments.setSettlement(req.user, req.body?.code, () => authorizeSettings(req.user.id, req.body?.settingsKey));
  }));
  for (const route of ['store-setup', 'create-store']) app.post(`/api/digital-market/${route}`, auth(['merchant']), action((req: any) => payments.draft(req.user, req.body)));
  app.post('/api/digital-market/subscription', auth(['merchant']), action((req: any) => payments.initialize(req.user, { purpose: 'subscription', plan: req.body.plan }, req)));
  app.post('/api/payments/paystack/initialize', auth(['merchant', 'manager']), action((req: any) => payments.initialize(req.user, req.body, req)));
  app.post('/api/hostel-verifications/pay-onboarding-fee', auth(['manager']), action((req: any) => payments.initialize(req.user, { purpose: 'housing', hostelId: req.body.hostelId }, req)));
  app.post('/api/payments/paystack/verify', auth(['merchant', 'manager']), action((req: any) => payments.verify(req.user, req.body.reference)));
  app.get('/api/payments/paystack/callback', (req: any, res: any) => {
    if (typeof req.query.reference !== 'string' || !/^PV-[a-f0-9]{48}$/.test(req.query.reference)) return res.status(400).send('Invalid payment reference.');
    try { res.set('Cache-Control', 'no-store').redirect(`${paymentOrigin(req)}/#/payments/return?reference=${encodeURIComponent(req.query.reference)}`); }
    catch (error) { res.status(503).send('Payment return is not configured. Return to PineVela to verify your payment.'); }
  });
  app.post('/api/payments/paystack/webhook', async (req: any, res: any) => {
    try {
      const { key } = paystackConfig();
      if (!req.paystackRawBody || !validPaystackSignature(req.paystackRawBody, req.headers['x-paystack-signature'], key)) return res.status(401).json({ error: 'Invalid payment signature.' });
      if (req.body?.event === 'charge.success' && (getStore().paymentTransactions || []).some((t: any) => t.reference === req.body.data?.reference)) await payments.verify(null, req.body.data.reference);
      return res.sendStatus(200);
    } catch (error) { if (error instanceof PaymentError) return res.status(error.status).json({ error: error.message }); throw error; }
  });
  app.get('/api/admin/payments', auth(['admin']), (req: any, res: any) => res.json((getStore().paymentTransactions || []).filter((t: any) => t.status === 'fulfilled').map((t: any) => ({ id: t.id, storeId: t.storeId, purpose: t.purpose, amount: t.amount / 100, currency: t.currency, mode: t.mode, paidAt: t.fulfilledAt }))));
}
