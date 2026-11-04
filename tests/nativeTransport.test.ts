import assert from 'node:assert/strict';
import test from 'node:test';
import { createNativeFetch, nativeApiPath, type NativeTransportPlugin } from '../src/native/transport';

const origin = 'https://localhost';
const encode = (value: string) => Buffer.from(value).toString('base64');
const mock = (request: NativeTransportPlugin['request'], cancel: NativeTransportPlugin['cancel'] = async () => {}) =>
  ({ request, cancel }) as NativeTransportPlugin;

test('native API dispatcher keeps exact local paths and forwards public external fetches without the private plugin', async () => {
  const native: unknown[] = [], external: unknown[] = [];
  const fetch = createNativeFetch(async (...args) => { external.push(args); return new Response('public'); }, origin,
    mock(async options => { native.push(options); return { status: 200, headers: { 'content-type': 'application/json' }, bodyBase64: encode('{"ok":true}') }; }));
  assert.deepEqual(await (await fetch('/api/auth/me')).json(), { ok: true });
  assert.equal((native[0] as any).path, '/api/auth/me');
  assert.equal((native[0] as any).method, 'GET');
  assert.equal(await (await fetch('https://nominatim.openstreetmap.org/search?q=campus')).text(), 'public');
  assert.equal(native.length, 1); assert.equal(external.length, 1);
});

test('request bodies retain their bytes and credential headers never cross the JavaScript interface', async () => {
  let seen: any;
  const fetch = createNativeFetch(globalThis.fetch, origin, mock(async options => {
    seen = options;
    return { status: 201, headers: { 'content-type': 'application/json', 'set-cookie': 'synthetic-must-stay-hidden', authorization: 'synthetic-hidden' }, bodyBase64: encode('{"saved":true}') };
  }));
  const response = await fetch('/api/auth/profile', { method: 'POST', headers: { 'content-type': 'application/json', Cookie: 'forbidden', Authorization: 'forbidden', Origin: 'https://untrusted.test', 'X-PineVela-Profile-Context': 'synthetic-context' }, body: '{"name":"Local test"}' });
  assert.equal(Buffer.from(seen.bodyBase64, 'base64').toString(), '{"name":"Local test"}');
  assert.equal(seen.headers['x-pinevela-profile-context'], 'synthetic-context');
  for (const key of ['cookie', 'authorization', 'origin']) assert.equal(seen.headers[key], undefined);
  assert.equal(response.headers.get('set-cookie'), null); assert.equal(response.headers.get('authorization'), null);
  assert.deepEqual(await response.json(), { saved: true });
});

test('encoded query values stay intact while encoded path separators remain forbidden', async () => {
  let seen = '';
  const fetch = createNativeFetch(globalThis.fetch, origin, mock(async options => {
    seen = options.path;
    return { status: 200, headers: {}, bodyBase64: encode('{}') };
  }));
  const path = '/api/manager/room-key-reset-preview?academicYear=2026%2F2027&note=100%25';
  assert.equal(nativeApiPath(path, origin), path);
  assert.equal((await fetch(path)).status, 200);
  assert.equal(seen, path);
  assert.throws(() => nativeApiPath('/api/manager%2Froom-key-reset-preview?academicYear=2026%2F2027', origin), TypeError);
});

test('binary media and bodyless replies preserve fetch response semantics', async () => {
  const png = Buffer.from([137, 80, 78, 71, 0, 255]);
  const fetch = createNativeFetch(globalThis.fetch, origin, mock(async options => options.method === 'DELETE'
    ? { status: 204, headers: {}, bodyBase64: '' }
    : { status: 200, headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' }, bodyBase64: png.toString('base64') }));
  const image = await fetch('/api/media/00000000-0000-0000-0000-000000000000');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal(image.headers.get('cache-control'), 'private, no-store');
  assert.equal((await fetch('/api/example', { method: 'DELETE' })).status, 204);
});

test('aborted work rejects promptly and asks native to cancel its queued request', async () => {
  const controller = new AbortController();
  let requested = false, cancelled = '';
  const fetch = createNativeFetch(globalThis.fetch, origin, mock(async () => { requested = true; return new Promise(() => {}); }, async ({ requestId }) => { cancelled = requestId; }));
  const waiting = fetch('/api/auth/me', { signal: controller.signal });
  assert.equal(requested, true);
  controller.abort();
  await assert.rejects(waiting, { name: 'AbortError' });
  assert.match(cancelled, /^[a-f0-9-]{36}$/);
  await assert.rejects(fetch('/api/auth/me', { signal: controller.signal }), { name: 'AbortError' });
});

test('ambiguous paths and upload overflows never reach native', async () => {
  let requests = 0;
  const fetch = createNativeFetch(globalThis.fetch, origin, mock(async () => { requests++; throw Error('Should not run'); }));
  for (const path of ['/api/%2e%2e/auth/me', '/api/auth/me#secret', 'https://user:password@localhost/api/me', '/api/%252fadmin']) {
    await assert.rejects(fetch(path), TypeError);
  }
  await assert.rejects(fetch('/api/storage/upload-market-image', { method: 'POST', body: new Uint8Array(28 * 1024 * 1024 + 1) }), RangeError);
  assert.equal(requests, 0);
  assert.equal(nativeApiPath('/api/auth/me?tab=market', origin), '/api/auth/me?tab=market');
});
