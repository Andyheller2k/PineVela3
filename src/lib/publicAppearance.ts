const productSource = /^\/(?:user\/dashboard|student\/dashboard|resident\/dashboard|manager\/dashboard|staff\/dashboard|admin\/dashboard|digital-market(?:\/onboard)?|market|customer-service|field-officer|officer\/dashboard|verification-team|verification-portal)$/;

/** Layout classification never overrides the user's or browser's theme. */
export function isPublicAppearance(pathname: string, search = '', signedIn = false): boolean {
  const route = pathname.replace(/\/+$/, '') || '/';
  if (['/', '/login', '/why-us', '/support-invitation', '/pinemarket', '/pineresidence'].includes(route) || /^\/pinemarket\/stores\/[^/]+$/.test(route)) return true;
  if (route === '/help' || route === '/faq') {
    const from = new URLSearchParams(search).get('from') || '';
    return from ? !productSource.test(from) : !signedIn;
  }
  return false;
}
