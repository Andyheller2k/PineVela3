/** Same-origin API authentication lives in an HttpOnly cookie, never browser storage. */
import {clearCompanionSubmission} from './companionSubmission';
import { clearMarketEncryptionVault } from './marketEncryption';
import { NATIVE_PREVIEW, nativePreviewUnavailable } from '../native/environment';
import { normalizeManagerKeyInput } from './managerKeyInput';

let sessionGeneration = 0;
export function currentSessionGeneration(): number { return sessionGeneration; }
export function advanceSessionGeneration(): void { sessionGeneration++;clearCompanionSubmission();clearMarketEncryptionVault(); }

export function clearLegacySessionStorage(): void {
  for (const key of ['pinevela_session_token', 'token', 'pinevela_auth_token', 'pinevela_token', 'pinevela_user', 'pinevela_officer_session']) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
}

/** Keep a manager key in the scope of one explicitly confirmed action. A form
 * with several protected requests can use the same proof without queuing a
 * separate dialog for every upload and the final submission. */
export function authorizeManagerAction(execute: (key: string) => Promise<Response>, label: string): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const challenge = new CustomEvent('pinevela-manager-key', {
      cancelable: true,
      detail: { resolve, reject, execute, label }
    });
    window.dispatchEvent(challenge);
    if (!challenge.defaultPrevented) reject(new Error('Manager authorization is unavailable. Reload your manager dashboard and try again.'));
  });
}

export async function sessionFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  if (NATIVE_PREVIEW) nativePreviewUnavailable();
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
      const challenge = new CustomEvent('pinevela-manager-key', { cancelable: true, detail: { resolve, reject, execute: (key: string) => {
        const keyed = new Headers(headers); keyed.set('X-PineVela-Manager-Key', normalizeManagerKeyInput(key));
        return globalThis.fetch(retryInput instanceof Request ? retryInput.clone() : retryInput, { ...options, headers: keyed, credentials: 'same-origin' });
      } } });
      window.dispatchEvent(challenge);
      // A boundary can hide the key prompt. Return the original denial rather
      // than wait for a handler that is not mounted; never retry without a key.
      if (!challenge.defaultPrevented) resolve(response);
    });
  }
  if (generation === sessionGeneration && response.status === 403) {
    const body = await response.clone().json().catch(() => null);
    if (generation === sessionGeneration && body?.code === 'terms_acceptance_required') window.dispatchEvent(new Event('pinevela-terms-required'));
    if (generation === sessionGeneration && (body?.accountBanned || body?.accountRestricted)) {
      if (body.accountBanned || !['GET', 'HEAD'].includes((options.method || (input instanceof Request ? input.method : 'GET')).toUpperCase())) window.dispatchEvent(new CustomEvent('pinevela-account-access', { detail: body }));
      if (body.accountBanned) window.dispatchEvent(new Event('pinevela-session-expired'));
    }
  }
  if (generation === sessionGeneration && response.status === 503) {
    const body = await response.clone().json().catch(() => null);
    if (generation === sessionGeneration && body?.maintenanceMode === true) window.dispatchEvent(new Event('pinevela-maintenance'));
  }
  if (generation === sessionGeneration && response.status === 401) {
    const body = await response.clone().json().catch(() => null);
    // A failed password/code proof for another invited identity is not expiry
    // of this account. Only the server's current-session guard sets this flag.
    if (generation === sessionGeneration && body?.sessionExpired === true) window.dispatchEvent(new Event('pinevela-session-expired'));
  }
  return response;
}
