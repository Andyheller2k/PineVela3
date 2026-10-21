/** Read-only live schema, route and secret-exposure checks. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import { SupabaseDatabase } from '../supabase/db.js';
dotenv.config({ quiet: true });
const db = new SupabaseDatabase(); let checks = 0;
const check = (v: unknown, label: string) => { assert.ok(v, label); checks++; };
try {
  await db.system(async c => {
    await c.query('set transaction read only');
    check((await c.query("select count(*)::int as n from private.schema_migrations where version='20261018140812'")).rows[0].n === 1, 'Companion migration is installed');
    check((await c.query("select count(*)::int as n from private.schema_migrations where version='20261019123832'")).rows[0].n === 1, 'Five-hour allowance migration is installed');
    const tables = ['private.companion_preferences', 'private.companion_turns', 'private.companion_usage', 'private.companion_usage_windows'];
    for (const table of tables) {
      check((await c.query('select relrowsecurity from pg_class where oid=$1::regclass', [table])).rows[0].relrowsecurity, 'Live companion table enables RLS');
      for (const role of table.endsWith('companion_usage_windows') ? ['anon', 'authenticated', 'pinevela_catalog', 'pinevela_backend'] : ['anon', 'authenticated', 'pinevela_catalog'])
        check(!(await c.query("select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as allowed", [role, table])).rows[0].allowed, 'Browser/catalog roles have no direct access');
    }
  });
  for (const [method, route] of [['GET', '/api/companion'], ['PUT', '/api/companion/preferences'], ['DELETE', '/api/companion/history'], ['POST', '/api/companion/turns']]) {
    const r = await fetch('http://127.0.0.1:3001' + route, { method, signal: AbortSignal.timeout(15000) });
    check(r.status === 401, 'Live companion route requires authentication'); await r.body?.cancel();
  }
  const csrf = await fetch('http://127.0.0.1:3001/api/companion/turns', { method: 'POST', headers: { origin: 'https://cross-site.invalid' }, signal: AbortSignal.timeout(10000) });
  check(csrf.status === 403, 'Live cross-site inference is refused'); await csrf.body?.cancel();
  for (const route of ['/.env', '/.security/companion/verification.json', '/dist-supabase-backend/supabase-server.mjs']) {
    const r = await fetch('http://127.0.0.1:3001' + route, { signal: AbortSignal.timeout(10000) });
    check(r.status === 404, 'Private config, evidence and backend build remain inaccessible'); await r.body?.cancel();
  }
  const html = await fetch('http://127.0.0.1:3001/').then(r => r.text());
  check(html === fs.readFileSync('dist-supabase/index.html', 'utf8'), 'Live app serves the new frontend entry point');
  const files = fs.readdirSync('dist-supabase/assets').filter(f => f.endsWith('.js'));
  const bundle = files.map(f => fs.readFileSync('dist-supabase/assets/' + f, 'utf8')).join('\n');
  check(bundle.includes('Make it yours.') && bundle.includes('Nova') && bundle.includes('Mabel') && bundle.includes('Axel') && bundle.includes('Ziggy'), 'Released frontend includes all four companions');
  for (const name of ['GROQ_API_KEY', 'OPENAI_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']) {
    const value = process.env[name]; check(!value || !bundle.includes(value), 'Provider/server secrets are absent from frontend assets');
  }
  const result = { passed: true, checks, readOnly: true, privateRoutesRequireAuth: true, clientSecretsFound: 0 };
  fs.writeFileSync('.security/companion/installation.json', JSON.stringify(result, null, 2), { mode: 0o600 }); console.log(JSON.stringify(result));
} finally { await db.close(); }
