/** Actual configured provider/database. Denials only: no recovery emails or
 * credential/account mutations, no provider replies or sessions fabricated. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';
import { createSupabaseApp } from '../supabase/app.js';
dotenv.config({ quiet: true });
const db = new SupabaseDatabase(), { app } = createSupabaseApp(db);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
let checks = 0;
try {
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const email = 'andyheller2k@gmail.com';
  const cases: [string, unknown, number, Record<string, string>][] = [
    ['/api/auth/change-password', {}, 401, {}],
    ['/api/auth/change-password', {}, 403, { origin: 'https://cross-site.invalid' }],
    ['/api/auth/recover', {}, 400, {}],
    ['/api/auth/recover', { email: 'invalid' }, 400, {}],
    ['/api/auth/recover', { email, role: 'admin' }, 400, {}],
    ['/api/auth/recover?userId=wrong', { email }, 400, {}],
    ['/api/auth/recover', { email }, 403, { 'sec-fetch-site': 'cross-site' }],
    ['/api/auth/recover/complete', {}, 400, {}],
    ['/api/auth/recover/complete', { email, code: 'invalid', newPassword: 'a'.repeat(32) }, 400, {}],
    ['/api/auth/recover/complete', { email, code: 'invalid', newPassword: 'short' }, 400, {}],
    ['/api/auth/recover/complete', { email, code: 'invalid', newPassword: 'a'.repeat(32) }, 403, { origin: 'https://cross-site.invalid' }],
  ];
  for (const [path, body, status, extra] of cases) {
    const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...extra },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get('set-cookie'), null); checks++;
  }
  const response = await fetch(base + '/api/auth/recover/complete', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, code: process.env.SUPABASE_URL + '/auth/v1/verify?type=recovery&token=' + crypto.randomBytes(32).toString('hex'),
      newPassword: crypto.randomBytes(32).toString('hex') }), signal: AbortSignal.timeout(45000) });
  assert.equal(response.status, 400);
  const data = await response.json(); assert.ok(data.error.includes('invalid or expired'));
  assert.equal(response.headers.get('set-cookie'), null); checks++;
  const result = { passed: true, checks, realHttp: true, realProviderInvalidRecoveryDenied: true,
    emailsSent: 0, passwordChanges: 0, providerRepliesMocked: false };
  const directory = '.security/migration-reset/browser-acceptance-20261012';
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.writeFileSync(directory + '/password-security-http.json', JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(result));
} finally {
  await app.locals.closeRealtime();
  await new Promise<void>(resolve => server.close(() => resolve()));
  await db.close();
}
