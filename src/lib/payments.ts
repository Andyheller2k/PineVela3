/** Hosted checkout is initialized by the server; no Paystack key belongs in the browser. */
import {usesSupabasePersistence} from './persistence';
const key=(account?:string)=>usesSupabasePersistence?`pinevela.pendingPayment.${account || 'signed-out'}`:'pinevela.pendingPayment';
export const pendingPaymentReference=(account?:string)=>sessionStorage.getItem(key(account));
export const clearPendingPayment=(account?:string)=>sessionStorage.removeItem(key(account));
export function openPaymentCheckout(result: any,account?:string) {
  if (!result?.paymentRequired) return false;
  if(typeof result.reference!=='string' || !/^PV-[a-f0-9]{48}$/.test(result.reference))throw new Error('Invalid payment reference.');
  if(result.mobileMoney || result.initializationUncertain){
    sessionStorage.setItem(key(account),result.reference);
    window.location.assign(`/#/payments/return?reference=${encodeURIComponent(result.reference)}`);
    return true;
  }
  const url = new URL(result.authorizationUrl || '');
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.username || url.password) throw new Error('Invalid secure checkout address.');
  sessionStorage.setItem(key(account), result.reference);
  window.location.assign(url.href);
  return true;
}
