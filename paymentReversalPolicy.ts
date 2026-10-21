/** Monetary policy only; no provider payload, identifiers or network dependencies. */
export function paymentReversalPolicy(amountMinor:number,refundedMinor:number,status:unknown,manualAccess:unknown='default') {
  if(!Number.isSafeInteger(amountMinor)||amountMinor<=0||!Number.isSafeInteger(refundedMinor)||refundedMinor<0||refundedMinor>amountMinor
    ||!['success','reversed'].includes(status as string)||!['default','retain','revoke'].includes(manualAccess as string))
    throw new Error('Invalid verified payment reconciliation.');
  // A processed partial refund can also label its transaction "reversed".
  // Preserve its exact amount; a reversal with no refund rows is a chargeback.
  const reversed=refundedMinor===amountMinor||(status==='reversed'&&refundedMinor===0);
  return {reversed,accessGranted:!reversed&&manualAccess!=='revoke',netMinor:reversed?0:amountMinor-refundedMinor};
}
