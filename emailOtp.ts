export const EMAIL_CODE_RESEND_SECONDS = 5 * 60;
export const EMAIL_CODE_RESEND_DELAYS = [300, 600, 1200, 3600, 7200] as const;
export function emailResendDelay(sendCount: number): number {
  return EMAIL_CODE_RESEND_DELAYS[Math.min(EMAIL_CODE_RESEND_DELAYS.length - 1, Math.max(0, sendCount - 1))];
}

/** Preserve OTPs as strings, including leading zeroes. Only whitespace from
 * copying an email is ignored; the provider must still verify the full code. */
export function normalizeEmailOtp(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4096) return null;
  const code = value.replace(/\s+/gu, '');
  return /^[0-9]{6,10}$/.test(code) ? code : null;
}
