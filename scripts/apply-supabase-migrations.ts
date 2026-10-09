/** Apply the reviewed PineVela SQL migrations to the configured Supabase project.
 * All pending files commit atomically. --dry-run rolls everything back. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const dryRun = process.argv.slice(2).join(' ') === '--dry-run';
if (process.argv.length > 2 && !dryRun) throw new Error('Only --dry-run is accepted.');
const env = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
const database = new URL(env.DATABASE_URL || env.SUPABASE_DB_URL || '');
const api = new URL(env.SUPABASE_URL || '');
const ref = api.hostname.split('.')[0], username = decodeURIComponent(database.username);
if (!database.hostname.endsWith('.pooler.supabase.com') || (database.port || '5432') !== '5432' ||
    username !== `postgres.${ref}` || !database.password || !env.SUPABASE_DB_CA_FILE ||
    !fs.statSync(env.SUPABASE_DB_CA_FILE).isFile()) throw new Error('A matching Session pooler URI and Supabase CA are required.');
const pgEnv = {
  ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432', PGUSER: username,
  PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
  PGSSLMODE: 'verify-full', PGSSLROOTCERT: path.resolve(env.SUPABASE_DB_CA_FILE), PGCONNECT_TIMEOUT: '15',
};
function psql(sql: string) {
  return spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'], {
    input: sql, env: pgEnv, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
  });
}
const directory = path.resolve('supabase/migrations');
const files = fs.readdirSync(directory).filter(name => /^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
if (!files.length) throw new Error('No Supabase migrations found.');
const ledgerCheck = psql("SELECT to_regclass('private.schema_migrations') IS NOT NULL;");
if (ledgerCheck.status !== 0) throw new Error('Could not inspect the Supabase migration ledger.');
const existing = ledgerCheck.stdout.trim() === 't'
  ? psql("SELECT coalesce(json_object_agg(version, digest), '{}'::json) FROM private.schema_migrations;")
  : null;
if (existing && existing.status !== 0) throw new Error('Could not read the Supabase migration ledger.');
const applied = JSON.parse(existing?.stdout.trim() || '{}') as Record<string, string>;
const sqlLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
const pending: { version: string; digest: string; content: string }[] = [];
for (const name of files) {
  const content = fs.readFileSync(path.join(directory, name), 'utf8');
  const version = name.slice(0, 14), digest = crypto.createHash('sha256').update(content).digest('hex');
  if (applied[version]) {
    if (applied[version] !== digest) throw new Error(`Applied migration ${version} changed on disk.`);
  } else pending.push({ version, digest, content });
}
if (!pending.length) {
  console.log(JSON.stringify({ projectRef: ref, pending: 0, applied: files.length, noChange: true }));
  process.exit(0);
}
if (!Object.keys(applied).length) {
  const inventory = psql("SELECT count(*) FROM pg_tables WHERE schemaname = 'public';");
  if (inventory.status !== 0 || inventory.stdout.trim() !== '0') throw new Error('Target public schema is not empty; reconcile it before migration.');
}
const ledger = "CREATE SCHEMA IF NOT EXISTS private; CREATE TABLE IF NOT EXISTS private.schema_migrations (version text primary key, digest text not null, applied_at timestamptz not null default now()); ALTER TABLE private.schema_migrations ENABLE ROW LEVEL SECURITY; REVOKE ALL ON private.schema_migrations FROM anon, authenticated;";
const transaction = [
  "BEGIN; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '30s';", ledger,
  ...pending.flatMap(file => [file.content, `INSERT INTO private.schema_migrations(version, digest) VALUES (${sqlLiteral(file.version)}, ${sqlLiteral(file.digest)});`]),
  dryRun ? 'ROLLBACK;' : 'COMMIT;',
].join('\n');
const result = psql(transaction);
if (result.status !== 0) {
  // Never print libpq stderr: it may contain connection details. A lost COMMIT
  // response is ambiguous, so inspect the immutable ledger before retrying.
  const state = result.stderr.match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];
  throw new Error(`Supabase migration ${dryRun ? 'dry run' : 'application'} failed (exit ${result.status ?? 'timeout'}${state ? `, SQLSTATE ${state}` : ''}). Check the ledger before retrying; no cutover has occurred.`);
}
console.log(JSON.stringify({ projectRef: ref, pending: pending.length, dryRun, committed: !dryRun, migrationVersions: pending.map(file => file.version) }));
