/** Change this version only when approved contractual wording is published.
 * Cosmetic changes to the header do not change the agreement's article hash. */
export const PLATFORM_TERMS = {
  key: 'platform_terms',
  version: '2026-10-27',
  title: 'PineVela Terms of service',
  href: '/legal/terms-2026-10-27.html',
  privacyHref: '/privacy.html',
  sha256: '5221d730f6e4247f43cbf82e8b51e55a37cb075016bde7849a500a66a6e56ada',
} as const;

export type TermsAcceptance = { accepted: true; version: string };
export const termsAcceptance = (accepted: boolean) => ({ accepted, version: PLATFORM_TERMS.version });
