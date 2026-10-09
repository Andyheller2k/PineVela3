import crypto from 'node:crypto';
import {WorkPool} from './resourceSecurity.js';
const requests=new WorkPool(6,24);
export class PaymentError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function paystackConfig() {
  const key = process.env.PAYSTACK_SECRET_KEY || '';
  if (!/^sk_(test|live)_[A-Za-z0-9]+$/.test(key)) throw new PaymentError('Paystack is not configured. Ask an administrator to configure secure checkout.', 503);
  const mode = key.startsWith('sk_test_') ? 'test' : 'live';
  if (mode === 'test' && process.env.NODE_ENV === 'production') throw new PaymentError('Paystack test payments cannot activate production accounts.', 503);
  return { key, mode };
}
export function paymentOrigin(req?: any) {
  const configured = process.env.PINEVELA_PUBLIC_ORIGIN?.trim();
  const peerIsLocal = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req?.socket?.remoteAddress || '');
  const host = req?.get('host');
  // Production bundles also run locally. Never derive remote callbacks from forwarded headers.
  const origin = configured || (req && peerIsLocal && host ? `http://${host}` : !req && process.env.NODE_ENV !== 'production' ? `http://localhost:${process.env.PORT || 3000}` : '');
  let url: URL; try { url = new URL(origin); } catch { throw new PaymentError('Set PINEVELA_PUBLIC_ORIGIN before accepting payments.', 503); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    (process.env.NODE_ENV !== 'production' || peerIsLocal && typeof host === 'string' && url.host === host.toLowerCase());
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !(url.protocol === 'https:' || localHttp)) throw new PaymentError('Configure a valid, trusted payment return origin.', 503);
  return url.origin;
}
export function validPaystackSignature(raw: Buffer, signature: unknown, key: string) {
  if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = crypto.createHmac('sha512', key).update(raw).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function addMonths(timestamp: number, count: number) {
  const date = new Date(timestamp), day = date.getUTCDate();
  date.setUTCDate(1); date.setUTCMonth(date.getUTCMonth() + count);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last)); return date.toISOString();
}
export async function paystackRequest(path: string, body?: any) {
  const { key } = paystackConfig();
  let response: Response;
  try { response = await requests.run(() => fetch(`https://api.paystack.co${path}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000), redirect:'error', cache:'no-store' })); }
  catch { throw new PaymentError('Paystack could not be reached. Check your connection and try again. No paid access was granted.', 502); }
  const result: any = await response.json().catch(() => null);
  if (!response.ok || result?.status !== true || !result.data) throw new PaymentError('Paystack could not complete this request. No paid access was granted.', 502);
  return result.data;
}
