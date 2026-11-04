import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { TermsAcceptance } from '../../legalPolicy';

export interface NativeReply { status: number; headers: Record<string, string>; bodyBase64: string }
export interface NativeTransportPlugin {
  request(options: { path: string; method: string; headers: Record<string, string>; bodyBase64?: string; requestId: string }): Promise<NativeReply>;
  cancel(options: { requestId: string }): Promise<void>;
  beginAuth(options: { mode: 'login' | 'signup'; provider?: 'google'; termsAcceptance?: TermsAcceptance }): Promise<{ pending: boolean; authenticated?: boolean; redirectTo?: string }>;
  resumeAuth(options?: { acknowledge: boolean }): Promise<{ pending?: boolean }>;
  getStatus(): Promise<{ pending: boolean }>;
  openExternal(options: { url: string }): Promise<void>;
  addListener(event: 'authComplete', callback: (result: { redirectTo?: string }) => void): Promise<PluginListenerHandle>;
  addListener(event: 'authError', callback: (result: { code: string }) => void): Promise<PluginListenerHandle>;
}
export const NativeTransport = registerPlugin<NativeTransportPlugin>('PineVelaTransport');

export const NATIVE_AUTH_DESTINATIONS = new Set([
  '/user/dashboard', '/student/dashboard', '/digital-market', '/digital-market/onboard',
  '/admin/dashboard', '/manager/dashboard', '/staff/dashboard', '/field-officer', '/customer-service',
]);

/** A native Google button must complete on-device, never fall back to a browser. */
export function nativeGoogleCompleted(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reply = value as Record<string, unknown>;
  return Object.keys(reply).every(key => ['pending', 'authenticated', 'redirectTo'].includes(key))
    && reply.pending === false && reply.authenticated === true
    && typeof reply.redirectTo === 'string' && NATIVE_AUTH_DESTINATIONS.has(reply.redirectTo);
}

export function nativeApiPath(input: RequestInfo | URL, localOrigin: string): string | null {
  const url = new URL(input instanceof Request ? input.url : String(input), localOrigin);
  if (url.origin !== localOrigin) return null;
  if (!url.pathname.startsWith('/api/')) return null;
  // Reject normalization tricks before handing a path to the native allowlist.
  const raw = input instanceof Request ? input.url : String(input);
  const rawPath = raw.split(/[?#]/, 1)[0];
  if (/%(?:2e|2f|5c|00|25)|\\/i.test(rawPath) || /[\u0000-\u001f\u007f]/.test(raw) || url.hash || url.username || url.password) throw new TypeError('Invalid application API path.');
  return url.pathname + url.search;
}

function base64(bytes: Uint8Array): string {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) text += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  return btoa(text);
}

/** Native owns TLS, the fixed API destination and its private encrypted jar.
 * This adapter receives response bodies, never credentials or cookie headers. */
export function createNativeFetch(original: typeof fetch, origin: string, plugin: NativeTransportPlugin = NativeTransport): typeof fetch {
  return async (input, init = {}) => {
    const path = nativeApiPath(input, origin);
    if (!path) return original(input, init);
    const request = new Request(input instanceof Request ? input : new URL(String(input), origin), init);
    if (request.signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
    const headers: Record<string, string> = {};
    request.headers.forEach((value, name) => {
      if (!/^(?:cookie|set-cookie|authorization|origin|host|referer|sec-fetch-.+|proxy-.+)$/i.test(name)) headers[name] = value;
    });
    let bodyBase64: string | undefined;
    if (!['GET', 'HEAD'].includes(request.method)) {
      const data = await request.arrayBuffer();
      if (data.byteLength > 28 * 1024 * 1024) throw new RangeError('This upload is too large for the app.');
      bodyBase64 = base64(new Uint8Array(data));
    }
    if (request.signal.aborted) throw new DOMException('The request was cancelled.', 'AbortError');
    const requestId = crypto.randomUUID();
    const reply = await new Promise<NativeReply>((resolve, reject) => {
      const abort = () => {
        void plugin.cancel({ requestId }).catch(() => {});
        reject(new DOMException('The request was cancelled.', 'AbortError'));
      };
      request.signal.addEventListener('abort', abort, { once: true });
      plugin.request({ path, method: request.method, headers, bodyBase64, requestId }).then(resolve, reject)
        .finally(() => request.signal.removeEventListener('abort', abort));
    });
    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(reply.headers || {})) {
      if (!/^(?:cookie|set-cookie|authorization|proxy-authenticate)$/i.test(key)) responseHeaders.set(key, value);
    }
    const bytes = Uint8Array.from(atob(reply.bodyBase64 || ''), character => character.charCodeAt(0));
    return new Response(request.method === 'HEAD' || [204, 205, 304].includes(reply.status) ? null : bytes, {
      status: reply.status, headers: responseHeaders,
    });
  };
}
