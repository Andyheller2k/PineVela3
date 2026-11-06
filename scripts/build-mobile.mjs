import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist-mobile');
process.chdir(root);
await build({ configFile: path.join(root, 'vite.mobile.config.ts') });
await fs.rename(path.join(output, 'mobile/index.html'), path.join(output, 'index.html'));
await fs.rmdir(path.join(output, 'mobile'));

const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";
const preview = process.env.PINEVELA_NATIVE_PREVIEW === '1';
if (preview) {
  const file = path.join(output, 'index.html');
  const html = await fs.readFile(file, 'utf8');
  await fs.writeFile(file, html.replace('data-native-preview="false"', 'data-native-preview="true"')
    .replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, `<meta http-equiv="Content-Security-Policy" content="${csp}">`));
}
const article = html => html.match(/<article\b[\s\S]*?<\/article>/)?.[0];
const digest = value => createHash('sha256').update(value).digest('hex');
const copy = async (source, destination) => {
  await fs.mkdir(path.dirname(path.join(output, destination)), { recursive: true });
  await fs.copyFile(path.join(root, source), path.join(output, destination));
};

// Every copied file is named here. New website files are excluded by default.
for (const name of ['icons/pinevela-192.png', 'store-covers/pinevela-logo.svg', 'store-covers/campus-blue.svg', 'store-covers/midnight-campus.svg', 'store-covers/forest-glass.svg', 'store-covers/golden-pine.svg', 'brand.css', 'brand/caviar-dreams-bold.ttf', 'legal.css', 'legal-appearance.js']) {
  await copy(`public/${name}`, name);
}
await copy('src/native/policy.js', 'native-policy.js');
await copy('src/native/preview.css', 'native-preview.css');
await copy('mobile/webview-update-required.html', 'webview-update-required.html');
for (const name of ['outfit-OFL.txt', 'plus-jakarta-sans-OFL.txt', 'jetbrains-mono-OFL.txt']) {
  await copy(`assets/fonts/native/${name}`, `licenses/fonts/${name}`);
}
await copy('assets/fonts/Childer-LICENSE.txt', 'licenses/fonts/Childer-LICENSE.txt');

for (const name of ['privacy.html', 'terms.html', 'legal/terms-2026-10-27.html', 'legal/terms-2026-11-05.html']) {
  const original = await fs.readFile(path.join(root, 'public', name), 'utf8');
  const originalArticle = article(original);
  if (!originalArticle) throw new Error(`Missing published article in ${name}`);
  const adaptChrome = value => value
    .replace(/\s*<script\b[^>]*src=["']\/analytics\.js["'][^>]*><\/script>/g, '')
    .replace(/(<meta\b(?=[^>]*\bname=["']viewport["'])[^>]*\bcontent=["'])([^"']*)/gi,
      (_tag, prefix, content) => prefix + content.replace(/(?:^|,)\s*viewport-fit\s*=\s*[^,]*/gi, '') + ', viewport-fit=contain')
    .replaceAll('href="https://pinevela.app/"', 'href="/#/login"');
  const start = original.indexOf(originalArticle);
  let adapted = adaptChrome(original.slice(0, start)) + originalArticle + adaptChrome(original.slice(start + originalArticle.length));
  adapted = adapted.replace('<html', `<html data-native-preview="${preview}"`);
  adapted = adapted.replace('<head>', `<head>\n  <meta http-equiv="Content-Security-Policy" content="${csp}">\n  <link rel="stylesheet" href="/native-preview.css">\n  <script defer src="/native-policy.js"></script>`);
  if (digest(article(adapted)) !== digest(originalArticle)) throw new Error(`Published article changed in ${name}`);
  await fs.mkdir(path.dirname(path.join(output, name)), { recursive: true });
  await fs.writeFile(path.join(output, name), adapted);
}
console.log(`Native ${preview ? 'disconnected preview' : 'application'} built in dist-mobile with local assets and unchanged policy articles.`);
