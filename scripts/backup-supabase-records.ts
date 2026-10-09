/** Supplemental encrypted export when a full pg_dump is unavailable.
 * Read-only; it is not a substitute for a restorable PostgreSQL backup. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const env = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
const url = new URL(env.DATABASE_URL || env.SUPABASE_DB_URL || '');
const projectRef = new URL(env.SUPABASE_URL || '').hostname.split('.')[0];
const caFile = env.SUPABASE_DB_CA_FILE;
if (!url.hostname.endsWith('.pooler.supabase.com') || decodeURIComponent(url.username) !== `postgres.${projectRef}` ||
    !url.password || !caFile || !fs.statSync(caFile).isFile()) throw new Error('Verified Session pooler configuration is required.');
const pgEnv = {
  ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGUSER: decodeURIComponent(url.username),
  PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
  PGSSLMODE: 'verify-full', PGSSLROOTCERT: path.resolve(caFile), PGCONNECT_TIMEOUT: '15',
};
function query(sql: string): string[] {
  const result = spawnSync('psql', ['-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv, encoding: 'utf8', timeout: 120000, maxBuffer: 128 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error('Read-only PostgreSQL record export failed; no cloud data was modified.');
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
}
const names = JSON.parse(query("SELECT coalesce(json_agg(json_build_object('schema', table_schema, 'name', table_name) ORDER BY table_schema, table_name), '[]'::json) FROM information_schema.tables WHERE table_schema IN ('auth','public','storage') AND table_type='BASE TABLE';")[0]) as { schema: string; name: string }[];
const identifier = (name: string) => `"${name.replace(/"/g, '""')}"`;
const statements = names.map(({ schema, name }) =>
  `SELECT json_build_object('schema', ${sqlLiteral(schema)}, 'name', ${sqlLiteral(name)}, 'rows', coalesce(json_agg(row_to_json(t)), '[]'::json)) FROM ${identifier(schema)}.${identifier(name)} t;`
);
function sqlLiteral(value: string) { return `'${value.replace(/'/g, "''")}'`; }
const lines = query(`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n${statements.join('\n')}\nCOMMIT;`);
if (lines.length !== names.length) throw new Error('Record export did not return every table.');
const tables = lines.map(line => JSON.parse(line));
for (let i = 0; i < names.length; i++) {
  if (tables[i].schema !== names[i].schema || tables[i].name !== names[i].name || !Array.isArray(tables[i].rows)) {
    throw new Error('Record export table mismatch.');
  }
}
const catalog = JSON.parse(query("SELECT json_build_object('columns', (SELECT coalesce(json_agg(row_to_json(c)), '[]'::json) FROM information_schema.columns c WHERE c.table_schema IN ('auth','public','storage')), 'indexes', (SELECT coalesce(json_agg(row_to_json(i)), '[]'::json) FROM pg_indexes i WHERE i.schemaname IN ('auth','public','storage')));")[0]);
const payload = Buffer.from(JSON.stringify({ version: 1, createdAt: new Date().toISOString(), projectRef, tables, catalog }));
const directory = path.resolve('.security/migration-reset');
if (fs.statSync(directory).mode & 0o077) throw new Error('Migration backup directory must be private.');
const id = crypto.randomUUID(), key = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
const encrypted = Buffer.concat([Buffer.from('PVRC1'), nonce, cipher.update(payload), cipher.final(), cipher.getAuthTag()]);
const writePrivate = (name: string, bytes: Buffer) => {
  const fd = fs.openSync(path.join(directory, name), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};
writePrivate(`${id}.key`, key);
writePrivate(`${id}.pvrecords`, encrypted);
const readback = fs.readFileSync(path.join(directory, `${id}.pvrecords`));
const decipher = crypto.createDecipheriv('aes-256-gcm', fs.readFileSync(path.join(directory, `${id}.key`)), readback.subarray(5, 17));
decipher.setAuthTag(readback.subarray(readback.length - 16));
const decoded = Buffer.concat([decipher.update(readback.subarray(17, readback.length - 16)), decipher.final()]);
if (!crypto.timingSafeEqual(crypto.createHash('sha256').update(decoded).digest(), crypto.createHash('sha256').update(payload).digest())) throw new Error('Cloud record export round-trip failed.');
const counts = Object.fromEntries(tables.map(({ schema, name, rows }) => [`${schema}.${name}`, rows.length]));
writePrivate(`${id}.json`, Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), projectRef, counts, archive: path.join(directory, `${id}.pvrecords`), encrypted: true, verified: true, limitation: 'Supplemental record and catalog export. Requires a restorable database backup before account deletion.' }, null, 2) + '\n'));
const dirFd = fs.openSync(directory, fs.constants.O_RDONLY);
try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
console.log(JSON.stringify({ archive: path.join(directory, `${id}.pvrecords`), tableCount: tables.length, accountRows: counts['auth.users'] || 0, encrypted: true, verified: true, noDeletionPerformed: true }));
