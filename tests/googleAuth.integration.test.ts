import 'dotenv/config';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import http from 'node:http';
import { installGoogleAuth } from '../googleAuth.js';
import { signupProviderConfig } from '../supabaseSignup.js';

// Uses the configured real Supabase/Google provider. No accounts or sessions are created.
test('Local production Google flow reaches the real provider and validates callback cookie/state', { timeout: 60000 }, async t => {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) return t.skip('Real Supabase public credentials are required.');
  const savedMode = process.env.NODE_ENV, savedOrigin = process.env.PINEVELA_PUBLIC_ORIGIN;
  process.env.NODE_ENV = 'production'; delete process.env.PINEVELA_PUBLIC_ORIGIN;
  const app = express(); app.set('trust proxy', true); app.use(express.json());
  installGoogleAuth(app, async () => { assert.fail('Cancelled flows must never create an account.'); }, () => { assert.fail('Cancelled flows must never issue a session.'); });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (savedMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = savedMode;
    if (savedOrigin === undefined) delete process.env.PINEVELA_PUBLIC_ORIGIN; else process.env.PINEVELA_PUBLIC_ORIGIN = savedOrigin;
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const start = (headers: Record<string, string>, mode = 'login') => new Promise<{ status: number; cookie: string; body: any }>((resolve, reject) => {
    const request = http.request(base + '/api/auth/google/start', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' } }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk);
      response.on('end', () => { try { resolve({ status: response.statusCode!, cookie: response.headers['set-cookie']?.[0] || '', body: JSON.parse(body) }); } catch (error) { reject(error); } });
      response.on('error', reject);
    });
    request.on('error', reject); request.end(JSON.stringify({ mode }));
  });
  for (const mode of ['login', 'signup']) {
    const response = await start({ Host: 'localhost:3000' }, mode);
    const body = response.body; assert.equal(response.status, 200, body.error);
    const provider = new URL(body.url), config = signupProviderConfig();
    assert.equal(provider.origin, config.url); assert.equal(provider.searchParams.get('provider'), 'google');
    assert.equal(provider.searchParams.get('code_challenge_method'), 's256');
    const callback = new URL(provider.searchParams.get('redirect_to')!);
    assert.equal(callback.origin, 'http://localhost:3000'); assert.equal(callback.pathname, '/api/auth/google/callback');
    const cookie = response.cookie;
    assert(cookie.includes('HttpOnly') && cookie.includes('Secure') && cookie.includes('SameSite=Lax'));
    const realProvider = await fetch(provider, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
    assert.equal(realProvider.status, 302); assert.equal(new URL(realProvider.headers.get('location')!).hostname, 'accounts.google.com');
    const localCallback = base + callback.pathname + callback.search + '&error=access_denied';
    const missing = await fetch(localCallback, { redirect: 'manual' });
    assert.equal(missing.headers.get('location'), '/#/login?google_error=expired');
    const cancelled = await fetch(localCallback, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' });
    assert.equal(cancelled.status, 303); assert.equal(new URL(cancelled.headers.get('location')!).search, '');
    assert(cancelled.headers.get('location')!.includes('google_error=cancelled'));
    const replay = await fetch(localCallback, { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' });
    assert.equal(replay.headers.get('location'), '/#/login?google_error=expired');
  }
  for (const headers of [{ Host: 'evil.example' }, { Host: 'evil.example', 'X-Forwarded-Host': 'localhost:3000' }]) {
    const response = await start(headers);
    assert.equal(response.status, 503, 'A forwarded loopback hostname cannot bypass deployment origin configuration');
  }
});
