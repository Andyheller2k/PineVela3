/** Input formatting only. The existing server/provider verifies the complete
 * 6–10 digit string, including any leading zeroes. */
export function formatOtpInput(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, 10);
}

export function otpBoxCount(value: string): number {
  return Math.min(10, Math.max(6, value.length));
}
