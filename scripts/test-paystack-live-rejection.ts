/** Explicitly opt-in live provider test; never changes the operational seller database. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { PaystackPayments, PaymentError, paystackConfig, marketAccessPaid } from '../paystackPayments.js';
import { publicPlatformSettings } from '../platformSettings.js';

const args = process.argv.slice(2);
function arg(name: string) { const index = args.indexOf(name); return index < 0 ? '' : args[index + 1]; }
const polls = Number(arg('--max-polls') || 11);
if (!Number.isInteger(polls) || polls < 1 || polls > 11) throw new Error('--max-polls must be an integer from 1 to 11.');
if (!args.includes('--authorize-live-rejection') || !arg('--email') || !arg('--phone') || !['mtn', 'vod', 'atl'].includes(arg('--network')) || !arg('--max-total-ghs')) throw new Error('Requires --authorize-live-rejection --email <owned inbox> --phone <owned wallet> --network mtn|vod|atl --max-total-ghs <authorized ceiling>.');
Object.assign(process.env, dotenv.parse(fs.readFileSync('.env')));
if (paystackConfig().mode !== 'live') throw new Error('This explicitly authorized test requires a live key.');
const dataDir = path.resolve(process.env.PINEVELA_DATA_DIR || 'data');
const current = JSON.parse(fs.readFileSync(path.join(dataDir, 'pinevela_store.json'), 'utf8'));
const settings = publicPlatformSettings(current);
const total = ['default', 'star', 'pro'].reduce((sum, plan) => sum + settings.registrationFee + settings.semesterFee + settings.subscriptionPrices[plan], 0);
if (!Number.isFinite(Number(arg('--max-total-ghs'))) || total > Number(arg('--max-total-ghs'))) throw new Error('Current quoted prices exceed the authorized test ceiling.');
const id = crypto.randomUUID();
// Disposable component-test identity, not a forged session or an operational account.
const dir = path.join(dataDir, 'live-payment-tests'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
const file = arg('--resume-ledger') ? path.resolve(arg('--resume-ledger')) : path.join(dir, `${id}.json`);
if (path.dirname(file) !== dir || !/^[a-f0-9-]{36}\.json$/.test(path.basename(file))) throw new Error('Resume file must be an isolated live-test ledger.');
const store: any = arg('--resume-ledger') ? JSON.parse(fs.readFileSync(file, 'utf8')) : { users: [{ id, role: 'merchant', email: arg('--email'), merchantStoreId: id }], digitalMarketStores: [{ id, studentEmail: arg('--email'), setupDetailsSaved: true, status: 'active' }], digitalMarketApplications: [{ id, studentEmail: arg('--email'), status: 'approved' }], platformSettings: { ...settings, ...(current.platformSettings?.paystackSettlement ? { paystackSettlement: current.platformSettings.paystackSettlement } : {}) }, paymentTransactions: [] };
const actor = store.users[0], seller = store.digitalMarketStores[0];
if (actor.email !== arg('--email')) throw new Error('Resume ledger email does not match the authorized inbox.');
const save = () => fs.writeFileSync(file, JSON.stringify(store, null, 2), { mode: 0o600 });
const results: any[] = [];
const provider = async (route: string, body?: any) => {
  const { key } = paystackConfig();
  let response: Response;
  try { response = await fetch(`https://api.paystack.co${route}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) }); }
  catch { throw new PaymentError('Provider status unavailable due to a network error. No paid access granted.', 502); }
  const result: any = await response.json();
  if (!response.ok || result.status !== true || !result.data) {
    const message = String(result.message || '').slice(0, 500).replace(/sk_(?:live|test)_[A-Za-z0-9]+/g, '[redacted]').replaceAll(arg('--phone'), '[wallet]').replaceAll(arg('--email'), '[email]');
    console.log(JSON.stringify({ providerRefusal: { httpStatus: response.status, message } }));
    throw new PaymentError('Provider refused initialization or verification.', 502);
  }
  return result.data;
};
const payments = new PaystackPayments(() => store, save, provider);
for (const plan of ['default', 'star', 'pro']) {
  console.log(`Starting LIVE ${plan} activation rejection test: GHS ${settings.registrationFee + settings.semesterFee + settings.subscriptionPrices[plan]}. Reject the phone prompt; do not authorize it.`);
  let quote: any = store.paymentTransactions.find((t: any) => t.plan === plan && t.purpose === 'activation');
  if (quote) quote = { ...quote, amount: quote.amount / 100, providerStatus: 'resume-existing-reference' };
  else {
    try { quote = await payments.initialize(actor, { purpose: 'activation', plan, mobileMoney: { phone: arg('--phone'), provider: arg('--network') } }); }
    catch (error) { const created = store.paymentTransactions.at(-1); if (!(error instanceof PaymentError) || !created || created.plan !== plan) throw error; quote = { ...created, amount: created.amount / 100, providerStatus: 'initialization-refused' }; }
  }
  console.log(JSON.stringify({ plan, amount: quote.amount, providerStatus: quote.providerStatus, reference: quote.reference }));
  let paid = false, providerStatus = quote.providerStatus;
  for (let attempt = 0; attempt < polls; attempt++) {
    if (attempt) await new Promise(resolve => setTimeout(resolve, 20000));
    // Read actual provider state; do not convert failure into a success fixture.
    let evidence: any;
    try { evidence = await provider(`/charge/${quote.reference}`); }
    catch (error) { if (!(error instanceof PaymentError)) throw error; providerStatus = 'unavailable'; break; }
    providerStatus = evidence.status;
    if (providerStatus === 'success') { paid = true; break; }
    if (['failed', 'abandoned', 'reversed'].includes(providerStatus)) break;
  }
  try { await payments.verify(actor, quote.reference); paid = true; }
  catch (error) { if (!(error instanceof PaymentError) || ![409, 502].includes(error.status)) throw error; }
  results.push({ plan, amount: quote.amount, providerStatus, paid, accessGranted: marketAccessPaid(store, seller) });
  fs.writeFileSync(file.replace(/\.json$/, '-results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(results[results.length - 1]));
  if (paid) { console.log('Payment unexpectedly succeeded. Stopping further charge attempts.'); break; }
}
if (!seller.registrationFeePaid) for (const plan of ['default', 'star', 'pro']) {
  try { await payments.initialize(actor, { purpose: 'subscription', plan }); throw new Error('Renewal unexpectedly allowed before registration.'); }
  catch (error) { if (!(error instanceof PaymentError) || error.status !== 403) throw error; results.push({ purpose: 'subscription', plan, blockedUntilPaidRegistration: true }); }
}
if (!seller.registrationFeePaid) {
  try { await payments.initialize(actor, { purpose: 'semester' }); throw new Error('Semester renewal unexpectedly allowed before registration.'); }
  catch (error) { if (!(error instanceof PaymentError) || error.status !== 403) throw error; results.push({ purpose: 'semester', blockedUntilPaidRegistration: true }); }
}
fs.writeFileSync(file.replace(/\.json$/, '-results.json'), JSON.stringify(results, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ results, operationalDatabaseChanged: false, ledgerFile: file }));
