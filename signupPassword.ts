/** Baseline matches the hosted Supabase signup policy checked on 29 October 2026.
 * Supabase remains authoritative, including any leaked-password checks.
 * Never use this validator for sign-in: existing credentials must still work.
 */
export const SIGNUP_PASSWORD_REQUIREMENTS = 'Use at least 8 characters, including uppercase and lowercase letters, a number and a symbol.';
const symbols = new Set('!@#$%^&*()_+-=[]{};\'\\:"|<>?,./`~');

export function signupPasswordError(value: unknown): string | undefined {
  if (typeof value !== 'string') return SIGNUP_PASSWORD_REQUIREMENTS;
  if (value.length > 256) return 'Password must be 256 characters or fewer.';
  if (value.length < 8 || !/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/[0-9]/.test(value) ||
      ![...value].some(character => symbols.has(character))) return SIGNUP_PASSWORD_REQUIREMENTS;
  return undefined;
}
