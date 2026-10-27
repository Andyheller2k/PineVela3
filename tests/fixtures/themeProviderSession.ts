/** Controlled promises only: no fetch, credentials, backend or real account writes. */
type Pending = {
  id: number; method: string; context: string | null; body: unknown; settled: boolean; aborted: boolean;
  resolve: (response: Response) => void; reject: (error: Error) => void;
};
const requests: Pending[] = [];
export function sessionFetch(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  if (String(input) !== '/api/auth/appearance') throw new Error('Unexpected provider request');
  return new Promise((resolve, reject) => {
    const request: Pending = { id: requests.length + 1, method: options.method || 'GET',
      context: new Headers(options.headers).get('X-PineVela-Profile-Context'),
      body: options.body ? JSON.parse(String(options.body)) : null, settled: false,
      aborted: !!options.signal?.aborted, resolve, reject };
    // Intentionally permit late resolution after abort to test the provider's guards.
    options.signal?.addEventListener('abort', () => { request.aborted = true; });
    requests.push(request);
  });
}
export function requestSnapshot() { return requests.map(({ resolve, reject, ...request }) => request); }
export function completeRequest(id: number, status: number, body: unknown) {
  const request = requests.find(request => request.id === id);
  if (!request || request.settled) throw new Error('No pending synthetic request');
  request.settled = true; request.resolve(new Response(JSON.stringify(body), { status }));
}
export function failRequest(id: number) {
  const request = requests.find(request => request.id === id);
  if (!request || request.settled) throw new Error('No pending synthetic request');
  request.settled = true; request.reject(new Error('Synthetic network failure'));
}
