import { validatePublicContinuation } from '../../publicContinuation';
export { validatePublicContinuation };
const storageKey = 'pinevela_public_continuation';

export function publicLoginPath(next: string | undefined, mode: 'login' | 'register') {
  const params = new URLSearchParams();
  if (mode === 'register') params.set('mode', 'register');
  const valid = validatePublicContinuation(next);
  if (valid) {
    params.set('next', valid);
    try { sessionStorage.setItem(storageKey, JSON.stringify({ next: valid, expires: Date.now() + 30 * 60_000 })); } catch { /* The URL also preserves the selection. */ }
  }
  return `/login${params.size ? `?${params}` : ''}`;
}

export function loginContinuation(search: string) {
  const params = new URLSearchParams(search);
  const direct = validatePublicContinuation(params.get('next'));
  if (direct || !params.has('google_error')) return direct;
  // An expired OAuth exchange cannot recover its server-side state. Preserve
  // only this tab's catalog selection; ordinary logins still open the default page.
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    return saved?.expires > Date.now() ? validatePublicContinuation(saved.next) : undefined;
  } catch { return undefined; }
}
