/** Same-origin API authentication lives in an HttpOnly cookie, never browser storage. */
let sessionGeneration = 0;
export function advanceSessionGeneration(): void { sessionGeneration++; }

export function clearLegacySessionStorage(): void {
  for (const key of ['pinevela_session_token', 'token', 'pinevela_auth_token', 'pinevela_token', 'pinevela_user', 'pinevela_officer_session']) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

export async function sessionFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const generation = sessionGeneration;
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return globalThis.fetch(input, options);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  headers.delete('Authorization');
  headers.set('X-PineVela-Session', 'cookie');
  const retryInput = input instanceof Request ? input.clone() : input;
  let response = await globalThis.fetch(input, { ...options, headers, credentials: 'same-origin' });
  if (generation === sessionGeneration && response.status === 403 && !headers.has('X-PineVela-Manager-Key')) {
    const body = await response.clone().json().catch(() => null);
    if (generation === sessionGeneration && body?.managerKeyRequired) response = await new Promise<Response>((resolve, reject) => {
      window.dispatchEvent(new CustomEvent('pinevela-manager-key', { detail: { resolve, reject, execute: (key: string) => {
        const keyed = new Headers(headers); keyed.set('X-PineVela-Manager-Key', key);
        return globalThis.fetch(retryInput instanceof Request ? retryInput.clone() : retryInput, { ...options, headers: keyed, credentials: 'same-origin' });
      } } }));
    });
  }
  if (generation === sessionGeneration && response.status === 403) {
    const body = await response.clone().json().catch(() => null);
    if (generation === sessionGeneration && (body?.accountBanned || body?.accountRestricted)) {
      if (body.accountBanned || !['GET', 'HEAD'].includes((options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase())) window.dispatchEvent(new CustomEvent('pinevela-account-access', { detail: body }));
      if (body.accountBanned) window.dispatchEvent(new Event('pinevela-session-expired'));
    }
  }
  if (generation === sessionGeneration && response.status === 503) {
    const body = await response.clone().json().catch(() => null);
    if (generation === sessionGeneration && body?.maintenanceMode === true) window.dispatchEvent(new Event('pinevela-maintenance'));
  }
  if (generation === sessionGeneration && response.status === 401 && !/\/(?:login|verification-team-login)$/.test(url.pathname)) window.dispatchEvent(new Event('pinevela-session-expired'));
  return response;
}
