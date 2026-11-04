import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { buildSync } from 'esbuild';
import { managerKeyNeeded } from '../supabase/managerKeys';
import { managerAvatarOnlyBody } from '../supabase/profiles';

function compile(entry: string, fetch: typeof globalThis.fetch, timers: Record<string, unknown> = {}) {
  const source = buildSync({ entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { __PINEVELA_NATIVE_PREVIEW__: 'false' } }).outputFiles[0].text;
  const window = new EventTarget();
  const context = { module: { exports: {} as any }, exports: {}, window, fetch, URL, Request, Response, Headers,
    Event, CustomEvent, AbortController, DOMException, TextEncoder, setTimeout, clearTimeout,
    location: { origin: 'https://pinevela.app' }, ...timers };
  vm.runInNewContext(source, context);
  return { api: context.module.exports, window };
}

test('own agreement acceptance does not require a manager operation key; business writes still do', () => {
  for (const path of ['/api/legal/accept', '/api/legal/accept/', '/api/manager/welcome/ensure',
    '/api/manager/welcome/ack', '/api/notifications/read-all', '/api/notifications/read-all/',
    '/api/notifications/00000000-0000-4000-8000-000000000001/read',
    '/api/storage/upload-profile-image', '/api/auth/profile/avatar'])
    assert.equal(managerKeyNeeded({ method: 'POST', path }), false);
  for (const path of ['/api/legal/accept/foreign', '/api/legal/accept-spoof', '/api/hostels', '/api/staff',
    '/api/hostel-verifications/submit', '/api/manager/terms-regression-probe',
    '/api/storage/upload-hostel-image', '/api/auth/profile', '/api/auth/profile/avatar/foreign',
    '/api/notifications/00000000-0000-4000-8000-000000000001/delete',
    '/api/manager/welcome/ensure/foreign'])
    assert.equal(managerKeyNeeded({ method: 'POST', path }), true, path);
});

test('manager avatar-only route cannot change contact details or another profile', () => {
  assert.deepEqual(managerAvatarOnlyBody({ photo: 'preset:pine-classic' }), { photo: 'preset:pine-classic' });
  for (const body of [null, {}, { photo: 42 }, { photo: 'preset:pine-classic', name: 'Forged' },
    { photo: 'preset:pine-classic', profileId: 'another-user' }, { avatar: 'preset:pine-classic' }])
    assert.throws(() => managerAvatarOnlyBody(body), /Only your profile picture/);
});

test('one manager-key action can protect a multi-request submission without retaining its key', async () => {
  const calls: Array<{ path:string; key:string|null }> = [];
  const operationKey = Buffer.alloc(32, 4).toString('base64url');
  const { api, window } = compile('src/lib/session.ts', async (input, options) => {
    calls.push({ path:String(input), key:new Headers(options?.headers).get('X-PineVela-Manager-Key') });
    return Response.json({ success:true });
  });
  let prompts = 0;
  window.addEventListener('pinevela-manager-key', event => {
    prompts++;event.preventDefault();
    const { execute,resolve,reject } = (event as CustomEvent).detail;
    execute(operationKey).then(resolve,reject);
  });
  const result = await api.authorizeManagerAction(async (key:string) => {
    const headers = { 'X-PineVela-Manager-Key':key };
    await api.sessionFetch('/api/storage/upload-hostel-image',{method:'POST',headers});
    return api.sessionFetch('/api/hostels/register',{method:'POST',headers});
  },'submit this residence registration');
  assert.equal(result.status,200);
  assert.equal(prompts,1);
  assert.deepEqual(calls.map(call=>call.key),[operationKey,operationKey]);
  await api.sessionFetch('/api/manager/my-hostel');
  assert.equal(calls[2].key,null);
});

test('a missing manager-key prompt returns the denial instead of an unresolved request', async () => {
  let requests = 0;
  const { api } = compile('src/lib/session.ts', async () => {
    requests++; return Response.json({ error: 'Manager key required', managerKeyRequired: true }, { status: 403 });
  });
  const response = await Promise.race([api.sessionFetch('/api/legal/accept', { method: 'POST' }),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Request never settled')), 250))]) as Response;
  assert.equal(response.status, 403); assert.equal(requests, 1);
});

test('mounted manager prompt retries only with the explicit key and preserves cookie/CSRF transport', async () => {
  const requests: RequestInit[] = [];
  const operationKey = Buffer.alloc(32, 7).toString('base64url');
  const { api, window } = compile('src/lib/session.ts', async (_url, options) => {
    requests.push(options!);
    return requests.length === 1 ? Response.json({ managerKeyRequired: true }, { status: 403 }) : Response.json({ saved: true });
  });
  window.addEventListener('pinevela-manager-key', event => {
    event.preventDefault();
    const { execute, resolve, reject } = (event as CustomEvent).detail;
    execute(operationKey).then(resolve, reject);
  });
  const response = await api.sessionFetch('/api/hostels', { method: 'POST', body: '{}', headers: { Authorization: 'untrusted' } });
  assert.equal(response.status, 200); assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.credentials, 'same-origin'); assert.equal(request.method, 'POST'); assert.equal(request.body, '{}');
    assert.equal(new Headers(request.headers).get('Authorization'), null);
  }
  assert.equal(new Headers(requests[0].headers).get('X-PineVela-Manager-Key'), null);
  assert.equal(new Headers(requests[1].headers).get('X-PineVela-Manager-Key'), operationKey);
});

test('malformed manager key never reaches a request header or mutation retry', async () => {
  let requests = 0;
  const { api, window } = compile('src/lib/session.ts', async () => {
    requests++; return Response.json({ managerKeyRequired: true }, { status: 403 });
  });
  window.addEventListener('pinevela-manager-key', event => {
    event.preventDefault();
    const { execute, reject } = (event as CustomEvent).detail;
    try { void execute('🔑wrong-key'); }
    catch (error) { reject(error); }
  });
  await assert.rejects(api.sessionFetch('/api/hostels', { method: 'POST' }), /Invalid manager secret key/);
  assert.equal(requests, 1);
});

test('cancelling a claimed manager prompt fails without a mutation retry', async () => {
  let requests = 0;
  const { api, window } = compile('src/lib/session.ts', async () => {
    requests++; return Response.json({ managerKeyRequired: true }, { status: 403 });
  });
  window.addEventListener('pinevela-manager-key', event => { event.preventDefault(); (event as CustomEvent).detail.reject(new Error('Cancelled')); });
  await assert.rejects(api.sessionFetch('/api/staff', { method: 'POST' }), /Cancelled/);
  assert.equal(requests, 1);
});

test('agreement save timeout aborts the request, reports uncertainty, and never retries automatically', async () => {
  let fire = () => {}, deadline = 0, requests = 0, cleared = false;
  const { api } = compile('src/lib/legalRequest.ts', async (_url, options) => {
    requests++; return new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  }, { setTimeout: (callback: () => void, milliseconds: number) => { fire = callback; deadline = milliseconds; return 17; }, clearTimeout: (id: number) => { cleared = id === 17; } });
  const result = api.legalRequest('/api/legal/accept', { method: 'POST', body: '{}' });
  assert.equal(deadline, 20_000); fire();
  await assert.rejects(result, /It may have been saved.*retry to confirm/);
  assert.equal(requests, 1); assert(cleared);
});

test('agreement deadline also covers a response body that stops arriving', async () => {
  let fire = () => {};
  const { api } = compile('src/lib/legalRequest.ts', async (_url, options) => ({
    json: () => new Promise<Response>((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))),
  } as Response), { setTimeout: (callback: () => void) => { fire = callback; return 1; }, clearTimeout: () => {} });
  const result = api.legalRequest('/api/legal/status'); await new Promise(resolve => setImmediate(resolve)); fire();
  await assert.rejects(result, /Loading your agreement took too long/);
});

test('agreement requests preserve server errors and stop on account-screen cancellation', async () => {
  const { api } = compile('src/lib/legalRequest.ts', async () => Response.json({ error: 'Current version required' }, { status: 409 }));
  const reply = await api.legalRequest('/api/legal/accept', { method: 'POST' });
  assert.equal(reply.response.status, 409); assert.equal(reply.data.error, 'Current version required');
  let aborted = false;
  const pending = compile('src/lib/legalRequest.ts', async (_url, options) => new Promise<Response>((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('Cancelled', 'AbortError')); });
  }));
  const controller = new AbortController(), request = pending.api.legalRequest('/api/legal/status', { signal: controller.signal });
  controller.abort(); await assert.rejects(request, /Cancelled/); assert(aborted);
});
