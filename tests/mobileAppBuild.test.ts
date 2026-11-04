import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { PLATFORM_TERMS } from '../legalPolicy';

test('connected native bundle has only public client assets and preserves immutable policies', () => {
  const root = 'dist-mobile';
  const files = fs.readdirSync(root, { recursive: true }).map(String).filter(name => fs.statSync(path.join(root, name)).isFile());
  for (const name of files) assert.ok(!/(?:^|\/)(?:\.env[^/]*|sw\.js|analytics\.(?:js|css)|manifest\.webmanifest|[^/]*\.map|[^/]*\.mjs)$/.test(name), name);
  assert.ok(files.every(name => !/supabase-server|system-wipe-worker|residence-worker/.test(name)));
  const html = fs.readFileSync(root + '/index.html', 'utf8');
  assert.ok(html.includes('data-native-preview="false"'));
  assert.ok(!/https:\/\/pinevela\.app\/.*\.js|serviceWorker|analytics|manifest\.webmanifest/.test(html));
  for (const name of files.filter(name => name.endsWith('.css'))) assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(fs.readFileSync(path.join(root, name), 'utf8')), name);
  const article = (file: string) => fs.readFileSync(file, 'utf8').match(/<article\b[\s\S]*?<\/article>/)?.[0];
  for (const name of ['privacy.html', 'terms.html', 'legal/terms-2026-10-27.html']) assert.equal(article(path.join(root, name)), article(path.join('public', name)), name);
  assert.equal(createHash('sha256').update(article(root + PLATFORM_TERMS.href)!).digest('hex'), PLATFORM_TERMS.sha256);
  assert.equal(files.filter(name => name.startsWith('licenses/fonts/') && name.endsWith('-OFL.txt')).length, 3);
});

test('every bundled Android HTML document contains its viewport inside the native safe area', () => {
  const root = 'dist-mobile';
  const pages = fs.readdirSync(root, { recursive: true }).map(String).filter(name => name.endsWith('.html'));
  assert.ok(pages.includes('index.html') && pages.includes('webview-update-required.html') && pages.includes('privacy.html'));
  for (const name of pages) {
    const html = fs.readFileSync(path.join(root, name), 'utf8');
    const viewport = html.match(/<meta\b[^>]*name=["']viewport["'][^>]*>/i)?.[0];
    assert.match(viewport || '', /viewport-fit=contain/, name);
    assert.doesNotMatch(viewport || '', /viewport-fit=cover/, name);
  }
});
