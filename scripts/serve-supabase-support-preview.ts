/** Serve the actual built app only on the already verified owned support stack. */
import assert from 'node:assert/strict';
import { readLocalFixture, runLocalSupabaseVerification, saveLocalFixture } from './lib/local-supabase-harness.js';
await runLocalSupabaseVerification(async h => {
  await h.assertOwned();
  const actors = readLocalFixture(h, 'support-browser.json');
  assert.ok(actors, 'Complete genuine support API verification first');
  process.env.SUPPORT_MAILPIT_URL = h.meta.mailUrl;
  saveLocalFixture(h, 'support-browser-runtime.json', { version: 1, runId: h.meta.runId, root: h.meta.root, origin: h.origin, metadataPath: process.argv[3], actors });
  console.log(JSON.stringify({ supportPreviewReady: true, origin: h.origin, fixture: h.meta.root + '/pinevela-harness/support-browser-runtime.json', cloudRecordsModified: 0 }));
  await new Promise<void>(resolve => { process.once('SIGINT', resolve); process.once('SIGTERM', resolve); });
}, { staticFrontend: true });
