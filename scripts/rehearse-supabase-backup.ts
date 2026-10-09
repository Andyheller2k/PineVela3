/** Decrypt and restore an existing private archive into an isolated Unix-socket-only
 * local PostgreSQL instance. Never connects to or modifies the Supabase target. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
const args = process.argv.slice(2);
if (args.length !== 1 || !/^[0-9a-f-]{36}$/.test(args[0])) throw new Error('Pass the backup UUID only.');
const directory = path.resolve('.security/migration-reset');
const metadata = JSON.parse(fs.readFileSync(path.join(directory, `${args[0]}.json`), 'utf8'));
if (!metadata.sourceSchemas?.includes('private')) throw new Error('Create a fresh backup including the private application schema first.');
if (!metadata.accessControlIncluded) throw new Error('Create a fresh backup including database privileges before rehearsing recovery.');
const archive = path.join(directory, `${args[0]}.pvpg`), keyFile = path.join(directory, `${args[0]}.key`);
for (const file of [archive, keyFile]) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.mode & 0o077) throw new Error('Backup and key must be private regular files.');
}
const saved = fs.readFileSync(archive);
if (!saved.subarray(0,5).equals(Buffer.from('PVPG1'))) throw new Error('Invalid encrypted archive.');
const decipher = crypto.createDecipheriv('aes-256-gcm', fs.readFileSync(keyFile), saved.subarray(5,17));
decipher.setAuthTag(saved.subarray(-16));
const decrypted = Buffer.concat([decipher.update(saved.subarray(17,-16)), decipher.final()]);
if (crypto.createHash('sha256').update(decrypted).digest('hex') !== metadata.dumpSha256) throw new Error('Archive integrity check failed.');
let serverPinKeyVerified=false,serverPinKeyDigest='';
if(metadata.serverSecrets){const file=path.join(directory,`${args[0]}.pvsecrets`),stat=fs.lstatSync(file);if(!stat.isFile() || stat.mode&0o077)throw new Error('Private encrypted server key archive required.');
  const bytes=fs.readFileSync(file);if(!bytes.subarray(0,5).equals(Buffer.from('PVSK1')))throw new Error('Invalid server key archive.');
  const d=crypto.createDecipheriv('aes-256-gcm',fs.readFileSync(keyFile),bytes.subarray(5,17));d.setAAD(Buffer.from(`pinevela:market_order_pin:${args[0]}`));d.setAuthTag(bytes.subarray(-16));
  const recovered=Buffer.concat([d.update(bytes.subarray(17,-16)),d.final()]);serverPinKeyDigest=crypto.createHash('sha256').update(recovered).digest('hex');if(recovered.length!==32 || serverPinKeyDigest!==metadata.serverSecrets.sha256)throw new Error('Server key archive integrity failed.');recovered.fill(0);serverPinKeyVerified=true;
}
// Unix socket paths have a short OS limit; use a private, short temporary root.
const rehearsal = path.join('/tmp', `pv-restore-${crypto.randomUUID()}`);
fs.mkdirSync(rehearsal, { mode: 0o700 });
const cluster = path.join(rehearsal, 'postgres'), bin = '/usr/lib/postgresql/18/bin';
function command(name: string, parameters: string[], input?: Buffer | string) {
  const result = spawnSync(path.join(bin, name), parameters, { input, timeout: 60000, maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, PGHOST: rehearsal, PGPORT: '6543', PGDATABASE: 'postgres', PGUSER: 'pv_restore', PGPASSWORD: '', PGSSLMODE: 'disable' } });
  if (result.status !== 0) {
    const failure = path.join(directory, `${args[0]}.restore-failure.log`);
    const serverLog = path.join(rehearsal, 'postgres.log');
    fs.writeFileSync(failure, Buffer.concat([result.stderr || Buffer.from(String(result.error?.name || 'command failed')), fs.existsSync(serverLog) ? fs.readFileSync(serverLog) : Buffer.alloc(0)]), { mode: 0o600 });
    throw new Error(`Local restore rehearsal ${name} failed. Diagnostic saved privately in ${failure}.`);
  }
  return result.stdout;
}
let started = false;
try {
  command('initdb', ['-D', cluster, '--username=pv_restore', '--auth-local=trust', '--auth-host=reject', '--no-instructions']);
  fs.appendFileSync(path.join(cluster, 'postgresql.conf'), `\nlisten_addresses = ''\nunix_socket_directories = '${rehearsal.replace(/'/g,"''")}'\nport = 6543\n`, { mode: 0o600 });
  command('pg_ctl', ['-D', cluster, '-l', path.join(rehearsal, 'postgres.log'), '-w', 'start']); started = true;
  command('psql', ['-X','-v','ON_ERROR_STOP=1'], `create schema extensions;
    create extension if not exists "uuid-ossp" with schema extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists pg_trgm with schema extensions;
    do $$ declare name text; begin foreach name in array array['anon','authenticated','service_role','authenticator','supabase_auth_admin','supabase_storage_admin','postgres','supabase_admin','pinevela_backend','dashboard_user'] loop
      if not exists (select 1 from pg_roles where rolname = name) then execute format('create role %I nologin',name); end if;
    end loop; end $$;
    grant authenticated to pinevela_backend;
    grant pinevela_backend to postgres;`);
  command('pg_restore', ['--dbname=postgres','--clean','--if-exists','--no-owner','--single-transaction'], decrypted);
  const inventory = JSON.parse(command('psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'], `select json_build_object(
    'authUsers',(select count(*) from auth.users),'profiles',(select count(*) from public.profiles),
    'sessions',(select count(*) from auth.sessions),'storageObjects',(select count(*) from storage.objects),
    'orderPins',(select count(*) from private.market_order_pins),
    'orderPinKeyMismatches',(select count(*) from private.market_order_pins p where coalesce(to_jsonb(p)->>'key_id','')<>'${serverPinKeyDigest}'),
    'applicationTables',(select count(*) from pg_tables where schemaname = 'public'),
    'applicationTablesWithoutRLS',(select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
    'migrationVersions',(select count(*) from private.schema_migrations),
    'guestCanReadProfiles',has_table_privilege('anon','public.profiles','select'),
    'guestCanReadCatalog',has_table_privilege('anon','public.residence_catalog','select'),
    'authenticatedCanPromoteContext',has_table_privilege('authenticated','public.account_contexts','update'),
    'backendBypassesRLS',(select rolbypassrls from pg_roles where rolname = 'pinevela_backend'));`).toString());
  if (inventory.applicationTablesWithoutRLS !== 0 || inventory.applicationTables < 1 || inventory.migrationVersions < 6) throw new Error('Restored application schema failed verification.');
  if (inventory.guestCanReadProfiles || !inventory.guestCanReadCatalog || inventory.authenticatedCanPromoteContext || inventory.backendBypassesRLS) throw new Error('Restored access controls failed verification.');
  if(inventory.orderPins && (!serverPinKeyVerified || inventory.orderPinKeyMismatches))throw new Error('Restored delivery challenges require their matching server key.');
  fs.writeFileSync(path.join(directory, `${args[0]}.restore.json`), JSON.stringify({ verifiedAt: new Date().toISOString(), archiveSha256: metadata.dumpSha256, isolatedLocalRestorePassed: true, serverPinKeyVerified, inventory }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ isolatedLocalRestorePassed: true, encryptedArchiveVerified: true,serverPinKeyVerified, ...inventory, cloudRecordsModified: 0 }));
} finally {
  if (started) command('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
  // The encrypted original remains; temporary decrypted PostgreSQL pages are removed.
  decrypted.fill(0);
  fs.rmSync(rehearsal, { recursive: true, force: true });
}
