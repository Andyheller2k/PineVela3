/** Executes the compiled mobile transport boundary; no live API or identity. */
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { buildSync } from 'esbuild';
import { PLATFORM_TERMS } from '../legalPolicy';

function compiledSession(preview: boolean, fetch: typeof globalThis.fetch) {
  const source = buildSync({ entryPoints: ['src/lib/session.ts'], bundle: true, write: false, platform: 'node', format: 'cjs',
    define: { __PINEVELA_NATIVE_PREVIEW__: String(preview) } }).outputFiles[0].text;
  const sandbox = { module: { exports: {} as any }, exports: {}, fetch, URL, Request, Response, Headers, TextEncoder,
    location: { origin: 'https://pinevela.app' } };
  vm.runInNewContext(source, sandbox);
  return sandbox.module.exports;
}

test('native preview rejects every API/provider request before any transport runs', async () => {
  let calls = 0;
  const session = compiledSession(true, async () => { calls++; return new Response('{}'); });
  for (const input of ['/api/auth/me', '/api/auth/login', '/api/auth/captcha', '/api/settings',
    'https://pinevela.app/api/auth/google/start', 'https://provider.example.test/']) {
    await assert.rejects(session.sessionFetch(input, { method: 'POST', body: 'synthetic' }), /Android preview/);
  }
  assert.equal(calls, 0, 'No fake session or backend response is generated');
});

test('website build retains same-origin cookie transport and ignores client Authorization', async () => {
  const requests: RequestInit[] = [];
  const session = compiledSession(false, async (_input, init) => { requests.push(init || {}); return new Response('{}'); });
  await session.sessionFetch('/api/auth/me', { headers: { Authorization: 'Bearer synthetic-forbidden' } });
  assert.equal(requests.length, 1);
  const headers = requests[0].headers as Headers;
  assert.equal(requests[0].credentials, 'same-origin');
  assert.equal(headers.get('Authorization'), null);
  assert.equal(headers.get('X-PineVela-Session'), 'cookie');
});

test('native artifact includes local assets and policy articles, excludes website services and private builds', () => {
  const root = 'dist-mobile';
  assert.ok(fs.existsSync(path.join(root, 'index.html')), 'Build mobile before running artifact checks');
  const files = fs.readdirSync(root, { recursive: true }).map(String).filter(name => fs.statSync(path.join(root, name)).isFile());
  for (const name of files) assert.ok(!/(?:^|\/)(?:\.env[^/]*|sw\.js|analytics\.(?:js|css)|manifest\.webmanifest|[^/]*\.map|[^/]*\.mjs)$/.test(name), name);
  assert.ok(files.every(name => !/dist-supabase|supabase-server|system-wipe-worker|residence-worker/.test(name)));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  if(html.includes('data-native-preview="true"'))assert.ok(html.includes("connect-src 'none'"),'Disconnected preview cannot contact any API');
  else{
    const policy=html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1]||'';
    const connections=policy.split(';').find(part=>part.trim().startsWith('connect-src '))?.trim().split(/\s+/).slice(1)||[];
    assert.deepEqual(connections,["'self'",'https://challenges.cloudflare.com','https://nominatim.openstreetmap.org','https://valhalla1.openstreetmap.de'],
      'Connected native build retains only its local transport and fixed CAPTCHA/map service destinations');
    assert.ok(html.includes('data-native-preview="false"'));
  }
  assert.ok(!/analytics|serviceWorker|manifest\.webmanifest/.test(html));
  for (const name of files.filter(name => name.endsWith('.css'))) assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(fs.readFileSync(path.join(root, name), 'utf8')), name);
  const article = (file: string) => fs.readFileSync(file, 'utf8').match(/<article\b[\s\S]*?<\/article>/)?.[0];
  for (const name of ['privacy.html', 'terms.html', 'legal/terms-2026-10-27.html', PLATFORM_TERMS.href.slice(1)]) {
    assert.equal(article(path.join(root, name)), article(path.join('public', name)), name);
    assert.ok(!fs.readFileSync(path.join(root, name), 'utf8').includes('src="/analytics.js"'));
  }
  assert.equal(createHash('sha256').update(article(root + PLATFORM_TERMS.href)!).digest('hex'), PLATFORM_TERMS.sha256);
  assert.equal(files.filter(name => name.startsWith('licenses/fonts/') && name.endsWith('-OFL.txt')).length, 3);
  assert.ok(fs.existsSync(path.join(root, 'webview-update-required.html')));
});
