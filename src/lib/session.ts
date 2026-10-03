/** Same-origin API authentication lives in an HttpOnly cookie, never browser storage. */
export function clearLegacySessionStorage(): void {
  for (const key of ['pinevela_session_token', 'token', 'pinevela_auth_token', 'pinevela_token', 'pinevela_user', 'pinevela_officer_session']) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export async function sessionFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return globalThis.fetch(input, options);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  headers.delete('Authorization');
  headers.set('X-PineVela-Session', 'cookie');
  const response = await globalThis.fetch(input, { ...options, headers, credentials: 'same-origin' });
  if (response.status === 401 && !/\/(?:login|verification-team-login)$/.test(url.pathname)) window.dispatchEvent(new Event('pinevela-session-expired'));
  return response;
}
