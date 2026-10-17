import { sessionFetch } from './session';

export async function supportApi(path: string, accountId: string | undefined, body?: unknown, method = body === undefined ? 'GET' : 'POST', signal?: AbortSignal) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (accountId) headers.set('X-PineVela-Profile-Context', accountId);
  let response: Response;
  try { response = await sessionFetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: signal || AbortSignal.timeout(30000) }); }
  catch { throw Error('Support could not connect. Check your connection and retry. If you were sending a request or reply, retry the same submission to avoid losing it.'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw Error(data?.error || 'The support service could not respond. Try again.');
  if (data === null) throw Error('Support returned an incomplete response. Refresh your conversation before retrying.');
  return data;
}
export function privateSupportCode() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
