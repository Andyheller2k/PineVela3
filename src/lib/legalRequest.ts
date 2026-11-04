import { sessionFetch } from './session';

/** A lost response never consents locally or triggers an automatic write retry. */
export async function legalRequest(path: '/api/legal/status' | '/api/legal/accept' | '/api/auth/me', options: RequestInit = {}) {
  const controller = new AbortController(), parent = options.signal;
  const cancel = () => controller.abort(parent?.reason);
  if (parent?.aborted) cancel();
  else parent?.addEventListener('abort', cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
  try {
    const response = await sessionFetch(path, { ...options, signal: controller.signal });
    const data = await response.json();
    return { response, data };
  } catch (error) {
    if (timedOut) throw new Error(path === '/api/legal/accept'
      ? 'Saving your acceptance took too long. It may have been saved. Check your connection, then retry to confirm.'
      : 'Loading your agreement took too long. Check your connection and retry.');
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', cancel);
  }
}
