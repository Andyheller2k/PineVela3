/** Launch the built migration server briefly and check its public/privacy surface.
 * No signup, account linking, or data-changing request is sent. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const port = 40000 + Math.floor(Math.random() * 10000);
const child = spawn(process.execPath, ['dist-supabase-backend/supabase-server.mjs'], {
  env: { ...process.env, NODE_ENV: 'production', PINEVELA_MIGRATION_PORT: String(port) }, stdio: ['ignore','pipe','pipe'],
});
let exited = false;
child.once('exit', () => { exited = true; });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let attempt = 0; attempt < 80 && !exited; attempt++) {
    try { ready = (await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for this child only. */ }
    if (ready) break;
    await new Promise(resolve => setTimeout(resolve,250));
  }
  assert.ok(ready,'Built migration server must start against the configured schema.');
  assert.ok((await (await fetch(`${base}/`)).text()).includes('<html'));
  assert.ok(Array.isArray(await (await fetch(`${base}/api/hostels`)).json()));
  assert.equal((await fetch(`${base}/api/auth/me`)).status,401);
  for (const file of ['/supabase-server.mjs','/supabase-server.mjs.map','/%73upabase-server.mjs','/dist-supabase-backend/supabase-server.mjs',
    '/.security/backup.key','/%2esecurity/backup.key','/.security%2fbackup.key','/.env','/%2eenv','/data/pinevela_store.json']) assert.equal((await fetch(`${base}${file}`)).status,404);
  console.log(JSON.stringify({ builtServerStarted: true, publicReadsPassed: true, privateArtifactsDenied: true, cloudRecordsModified: 0 }));
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    await Promise.race([new Promise(resolve => child.once('exit',resolve)),new Promise(resolve => setTimeout(resolve,3000))]);
    if (!exited) child.kill('SIGKILL');
  }
}
