/** Actual local HTTP/CSP checks and widget document/parent protocol execution.
 * The VM supplies an explicitly synthetic Turnstile SDK: these tests establish
 * message isolation/lifecycle, and never claim a real Cloudflare solve. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import vm from 'node:vm';
import express from 'express';
import { installNativeCaptcha, nativeCaptchaPath } from '../supabase/nativeCaptcha.js';
import { readNativeCaptchaMessage, NATIVE_CAPTCHA_URL } from '../src/native/NativeCaptcha.js';

const channel = 'a'.repeat(43), publicKey = 'public-sitekey-fixture-only';
const parentOrigin = 'https://localhost', hostOrigin = 'https://pinevela.app';
const init = (overrides: Record<string, unknown> = {}) => ({ type: 'pinevela:captcha:init', channel, action: 'login', theme: 'dark', ...overrides });
function widgetVm(html: string) {
  const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
  assert.ok(match, 'The response contains one nonce-protected protocol script');
  const listeners = new Map<string, Set<(event?: any) => void>>();
  const scripts: any[] = [], rendered: any[] = [], removed: string[] = [], messages: any[] = [];
  const parent = { postMessage: (value: any, target: string) => messages.push({ value, target }) };
  const window = {
    turnstile: { render: (_target: any, options: any) => { rendered.push(options); return 'synthetic-widget'; }, remove: (id: string) => removed.push(id) },
    addEventListener: (name: string, fn: (event?: any) => void) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name)!.add(fn); },
    removeEventListener: (name: string, fn: (event?: any) => void) => listeners.get(name)?.delete(fn),
  };
  const document = { documentElement: { style: {}, clientWidth: 280 }, createElement: () => ({}),
    getElementById: () => ({}), head: { appendChild: (script: any) => scripts.push(script) } };
  vm.runInNewContext(match[1], { window, document, parent }, { timeout: 1000 });
  const dispatch = (event: Record<string, unknown>) => { for (const listener of listeners.get('message') || []) listener(event); };
  const initialize = (data: unknown = init()) => dispatch({ source: parent, origin: parentOrigin, data });
  const hide = () => { for (const listener of listeners.get('pagehide') || []) listener(); };
  return { scripts, rendered, removed, messages, parent, dispatch, initialize, hide, listeners };
}

test('hosted native CAPTCHA document restricts its embedding, exposes no credentials and ignores configuration input', async t => {
  const before = process.env.AUTH_CAPTCHA_SITE_KEY;
  process.env.AUTH_CAPTCHA_SITE_KEY = publicKey;
  const app = express(); installNativeCaptcha(app);
  app.use((_req, res) => res.set('X-Frame-Options', 'DENY').status(404).end());
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ error: 'Fixture unavailable' }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    if (before === undefined) delete process.env.AUTH_CAPTCHA_SITE_KEY; else process.env.AUTH_CAPTCHA_SITE_KEY = before; });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = (query = '') => fetch(origin + nativeCaptchaPath + query, { signal: AbortSignal.timeout(5000) });
  const first = await get(), html = await first.text(), second = await get();
  assert.equal(first.status, 200); assert.match(first.headers.get('content-type') || '', /^text\/html/);
  assert.equal(first.headers.get('cache-control'), 'private, no-store');
  assert.equal(first.headers.get('referrer-policy'), 'no-referrer'); assert.equal(first.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(first.headers.get('x-frame-options'), null); assert.equal(first.headers.getSetCookie().length, 0);
  assert.equal(first.headers.get('access-control-allow-origin'), null);
  const policy = first.headers.get('content-security-policy') || '';
  assert.match(policy, /(?:^|; )frame-ancestors https:\/\/localhost(?:;|$)/);
  assert.match(policy, /default-src 'none'/); assert.match(policy, /base-uri 'none'/); assert.match(policy, /form-action 'none'/);
  assert(!policy.includes("script-src 'unsafe-inline'"));
  const nonce = policy.match(/script-src 'nonce-([^']+)'/)?.[1]; assert.ok(nonce);
  assert.match(html, new RegExp(`<script nonce="${nonce!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`));
  assert.notEqual(second.headers.get('content-security-policy'), policy, 'Every public document gets a fresh nonce');
  assert(html.includes(publicKey) && !html.includes('service_role') && !html.includes('pv_sb_'));
  assert(!html.includes('<form') && !html.includes('localStorage') && !html.includes('sessionStorage'));
  assert.equal(new URL(NATIVE_CAPTCHA_URL).pathname, nativeCaptchaPath); assert.equal(new URL(NATIVE_CAPTCHA_URL).search, '');
  for (const query of ['?siteKey=untrusted', '?parent=https%3A%2F%2Fforeign.invalid', '?channel=untrusted'])
    assert.equal((await get(query)).status, 400, 'URL input cannot change the key, parent or proof channel');

  await t.test('child remains idle until one exact localhost parent and valid init', () => {
    const frame = widgetVm(html); assert.equal(frame.scripts.length, 0, 'Opening a document alone starts no widget work');
    for (const event of [
      { source: {}, origin: parentOrigin, data: init() }, { source: frame.parent, origin: 'https://foreign.invalid', data: init() },
      { source: frame.parent, origin: parentOrigin, data: init({ channel: 'short' }) },
      { source: frame.parent, origin: parentOrigin, data: init({ action: 'login<script>' }) },
      { source: frame.parent, origin: parentOrigin, data: init({ theme: 'system' }) },
      { source: frame.parent, origin: parentOrigin, data: init({ unexpected: true }) },
    ]) frame.dispatch(event);
    assert.equal(frame.scripts.length, 0);
    frame.initialize(); assert.equal(frame.scripts.length, 1);
    frame.initialize(init({ channel: 'b'.repeat(43) })); assert.equal(frame.scripts.length, 1, 'A channel cannot be replaced after initialization');
    assert.equal(frame.scripts[0].src, 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit');
    frame.scripts[0].onload(); assert.equal(frame.rendered.length, 1);
    const options = frame.rendered[0];
    assert.equal(options.sitekey, publicKey); assert.equal(options.theme, 'dark'); assert.equal(options.action, 'login');
    assert.equal(options.retry, 'never'); assert.equal(options['refresh-expired'], 'manual'); assert.equal(options['refresh-timeout'], 'manual');
    options.callback('synthetic-shape-only-proof'); options['expired-callback'](); options['error-callback']();
    assert.equal(frame.messages.length, 1, 'Only one result is emitted');
    assert.deepEqual(JSON.parse(JSON.stringify(frame.messages[0])), { target: parentOrigin,
      value: { type: 'pinevela:captcha:complete', channel, token: 'synthetic-shape-only-proof' } });
    frame.hide(); assert.deepEqual(frame.removed, ['synthetic-widget']); assert.equal(frame.listeners.get('message')!.size, 0);
  });
  await t.test('child cancels before SDK load and never reflects malformed proof text', () => {
    const cancelled = widgetVm(html); cancelled.initialize(); cancelled.hide(); cancelled.scripts[0].onload();
    assert.equal(cancelled.rendered.length, 0); assert.equal(cancelled.messages.length, 0);
    for (const value of ['x'.repeat(2049), 'bad\nproof', '\u0000', { token: 'wrong-shape' }]) {
      const frame = widgetVm(html); frame.initialize(); frame.scripts[0].onload(); frame.rendered[0].callback(value);
      assert.equal(frame.messages.length, 1); assert.equal(frame.messages[0].value.type, 'pinevela:captcha:error');
      assert.equal(frame.messages[0].value.token, '', 'Raw SDK failures never cross the boundary');
    }
  });
  delete process.env.AUTH_CAPTCHA_SITE_KEY;
  const disabled = widgetVm(await (await get()).text()); disabled.initialize();
  assert.equal(disabled.scripts.length, 0); assert.equal(disabled.messages[0].value.type, 'pinevela:captcha:error');
  process.env.AUTH_CAPTCHA_SITE_KEY = 'invalid key'; assert.equal((await get()).status, 503, 'Invalid configuration stays closed');
});

test('native parent accepts proof only from its exact hosted iframe, random channel and bounded result shape', () => {
  const source = {} as Window;
  const valid = { type: 'pinevela:captcha:complete', channel, token: 'synthetic-shape-only-proof' };
  const message = (overrides: Record<string, unknown> = {}) => ({ source, origin: hostOrigin, data: valid, ...overrides });
  assert.deepEqual(readNativeCaptchaMessage(message(), source, channel), { type: valid.type, token: valid.token });
  for (const event of [message({ source: {} }), message({ source: null }), message({ origin: hostOrigin + '.foreign.invalid' }),
    message({ origin: 'https://pinevela.app:444' }), message({ origin: 'null' }), message({ data: { ...valid, channel: 'b'.repeat(43) } }),
    message({ data: { ...valid, token: 'x'.repeat(2049) } }), message({ data: { ...valid, token: 'bad\rproof' } }),
    message({ data: { ...valid, extra: 'not-accepted' } }), message({ data: { ...valid, type: 'other' } }),
    message({ data: { ...valid, type: 'pinevela:captcha:error', token: 'raw-error' } }), message({ data: null })])
    assert.equal(readNativeCaptchaMessage(event as MessageEvent, source, channel), null);
  assert.equal(readNativeCaptchaMessage(message(), source, 'short'), null);
  assert.equal(readNativeCaptchaMessage(message(), null, channel), null);
  assert.deepEqual(readNativeCaptchaMessage(message({ data: { ...valid, token: '' } }), source, channel), { type: valid.type, token: '' });
});
