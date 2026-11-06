/** Change this version only when approved contractual wording is published.
 * Cosmetic changes to the header do not change the agreement's article hash. */
export const PLATFORM_TERMS = {
  key: 'platform_terms',
  version: '2026-11-05',
  title: 'PineVela Terms of service',
  href: '/legal/terms-2026-11-05.html',
  privacyHref: '/privacy.html',
  sha256: 'ae27c932e6b9b3706d359b2842179afb6b3dfaf9020924b6622ac21c47f4fa3f',
} as const;

export type TermsAcceptance = { accepted: true; version: string };
export const termsAcceptance = (accepted: boolean) => ({ accepted, version: PLATFORM_TERMS.version });
