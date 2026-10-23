import type { Theme } from '../context/ThemeContext';

/** Fixed public appearances never replace the saved product preference. */
export function getPublicAppearance(pathname: string, search = '', signedIn = false): Theme | null {
  const route = pathname.replace(/\/+$/, '') || '/';
  if (route === '/' || route === '/login') return 'light';
  if (route === '/support-invitation' || route === '/why-us') return 'dark';
  if (route === '/help' || route === '/faq') {
    const from = new URLSearchParams(search).get('from') || '';
    if (!from && signedIn) return null;
    return /^\/(?:user\/dashboard|student\/dashboard|resident\/dashboard|manager\/dashboard|staff\/dashboard|admin\/dashboard|digital-market(?:\/onboard)?|market|customer-service|field-officer|officer\/dashboard|verification-team|verification-portal)$/.test(from) ? null : 'dark';
  }
  if (route === '/pineresidence' || route === '/pinemarket' || /^\/pinemarket\/stores\/[^/]+$/.test(route)) return 'dark';
  return null;
}
