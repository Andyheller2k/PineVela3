/** Only catalog selections are accepted, never an arbitrary post-login redirect. */
export function validatePublicContinuation(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/user/dashboard?')) return undefined;
  const url = new URL(value, 'https://pinevela.invalid');
  if (url.origin !== 'https://pinevela.invalid' || url.pathname !== '/user/dashboard' || url.hash) return undefined;
  const params = url.searchParams;
  const id = params.get('residence') || params.get('marketItem') || params.get('marketStore');
  if (!id || !/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return undefined;
  const residence = params.has('residence');
  const allowed = residence ? ['residence', 'residenceAction'] : params.has('marketStore') ? ['marketStore', 'storeAction'] : ['marketItem', 'marketPrice'];
  if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) return undefined;
  if (residence) {
    const action = params.get('residenceAction') || 'view';
    if (!['view', 'activate'].includes(action)) return undefined;
    return `/user/dashboard?${new URLSearchParams({ residence: id, residenceAction: action })}`;
  }
  if (params.has('marketStore')) {
    const action = params.get('storeAction') || 'view';
    if (!['view', 'message'].includes(action)) return undefined;
    return `/user/dashboard?${new URLSearchParams({ marketStore: id, storeAction: action })}`;
  }
  const price = params.get('marketPrice') || '0';
  if (!/^\d{1,5}$/.test(price)) return undefined;
  return `/user/dashboard?${new URLSearchParams({ marketItem: id, marketPrice: String(Number(price)) })}`;
}
