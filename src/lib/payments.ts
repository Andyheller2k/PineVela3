/** Hosted checkout is initialized by the server; no Paystack key belongs in the browser. */
export function openPaymentCheckout(result: any) {
  if (!result?.paymentRequired) return false;
  const url = new URL(result.authorizationUrl || '');
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com' || url.username || url.password) throw new Error('Invalid secure checkout address.');
  sessionStorage.setItem('pinevela.pendingPayment', result.reference);
  window.location.assign(url.href);
  return true;
}
