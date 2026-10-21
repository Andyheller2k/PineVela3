/** Actual HTTP and actual built bytes only; no test API, account or response stubs. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { gunzipSync, brotliDecompressSync } = require('node:zlib');
const { createHash } = require('node:crypto');

(async () => {
  const origin = new URL(process.argv[2]), label = process.argv[3];
  assert(process.argv.length === 4 && origin.protocol === 'http:' && origin.hostname === '127.0.0.1' && origin.port && !origin.username && !origin.password && origin.pathname === '/');
  assert(['after-preview', 'after-main'].includes(label));
  let checks = 0;
  const check = (value, message) => { assert(value, message); checks++; };
  const request = (route, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(new URL(route, origin), { headers, method }, response => {
      const parts = [];
      response.on('data', part => parts.push(part)); response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(parts) }));
    });
    req.setTimeout(15000, () => req.destroy(Error('Read-only HTTP verification timed out')));
    req.on('error', reject); req.end();
  });
  const health = await request('/api/health');
  check(health.status === 200 && JSON.parse(health.body).persistence === 'supabase', 'Actual native Supabase app serves this origin');
  const html = await fs.readFile('dist-supabase/index.html', 'utf8');
  const assets = [html.match(/src="(\/assets\/index-[^"]+\.js)"/)[1], html.match(/href="(\/assets\/index-[^"]+\.css)"/)[1]];
  const metrics = [];
  for (const asset of assets) {
    const actual = await fs.readFile(path.join('dist-supabase', asset));
    const identity = await request(asset, { 'Accept-Encoding': 'identity' });
    check(identity.status === 200 && identity.body.equals(actual), 'Identity delivery matches actual built bytes');
    check(!identity.headers['content-encoding'], 'Identity remains supported');
    check(/max-age=31536000/.test(identity.headers['cache-control']) && /immutable/.test(identity.headers['cache-control']), 'Hashed frontend assets have immutable browser caching');
    for (const encoding of ['gzip', 'br']) {
      const compressed = await request(asset, { 'Accept-Encoding': encoding });
      check(compressed.status === 200 && compressed.headers['content-encoding'] === encoding, 'Requested encoding is negotiated');
      check(/accept-encoding/i.test(compressed.headers.vary || ''), 'Encoded variants vary by Accept-Encoding');
      const decoded = encoding === 'gzip' ? gunzipSync(compressed.body) : brotliDecompressSync(compressed.body);
      check(decoded.equals(actual), 'Compression is byte-for-byte lossless');
      check(compressed.body.length < actual.length, 'Actual frontend transfer is smaller');
      metrics.push({ asset, encoding, rawBytes: actual.length, encodedBytes: compressed.body.length,
        savedPercent: Math.round((1 - compressed.body.length / actual.length) * 100), sha256: createHash('sha256').update(decoded).digest('hex') });
    }
    const uncompressed = await request(asset, { 'Accept-Encoding': 'gzip;q=0, br;q=0, identity;q=1' });
    check(!uncompressed.headers['content-encoding'] && uncompressed.body.equals(actual), 'Explicitly forbidden compression is respected');
    const cached = await request(asset, { 'If-None-Match': identity.headers.etag, 'Accept-Encoding': 'identity' });
    check(cached.status === 304 && cached.body.length === 0, 'A validator avoids retransferring an unchanged asset');
    const head = await request(asset, { 'Accept-Encoding': 'gzip' }, 'HEAD');
    check(head.status === 200 && head.body.length === 0, 'HEAD remains body-free');
    const range = await request(asset, { 'Accept-Encoding': 'identity', Range: 'bytes=0-127' });
    check(range.status === 206 && range.body.equals(actual.subarray(0, 128)), 'Native byte-range delivery remains correct');
  }
  const page = await request('/');
  check(page.status === 200 && page.headers['cache-control'] === 'no-cache', 'HTML revalidates so releases receive current asset hashes');
  const api = await request('/api/notifications', { 'Accept-Encoding': 'br, gzip' });
  check(api.status === 401 && /no-store/.test(api.headers['cache-control']) && !api.headers['content-encoding'], 'Private APIs retain authentication and no-store policies outside static compression');
  for (const denied of ['/.env', '/.security/performance-audit/static-baseline.json', '/data/pinevela_store.json', '/dist-supabase-backend/supabase-server.mjs.map']) {
    check((await request(denied)).status === 404, 'Private runtime and evidence paths remain inaccessible');
  }
  const result = { passed: true, checks, label, metrics, schemaChanges: 0, productionRecordsModified: 0 };
  await fs.mkdir('.security/performance-audit', { recursive: true, mode: 0o700 });
  await fs.writeFile(`.security/performance-audit/static-${label}.json`, JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch(error => { console.error(JSON.stringify({ passed: false, error: error.message })); process.exitCode = 1; });
