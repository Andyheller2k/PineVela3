/** Read-only encrypted PostgreSQL snapshot for a reviewed Supabase reset.
 * Requires the Session pooler URI and the project's trusted CA certificate. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';

const env = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
let orderPinKey:Buffer|undefined;
if(env.MARKET_ORDER_PIN_KEY_FILE){const stat=fs.lstatSync(env.MARKET_ORDER_PIN_KEY_FILE);if(!stat.isFile() || stat.mode&0o077 || stat.size!==32)throw new Error('Private delivery PIN key is required for a recoverable backup.');const fd=fs.openSync(env.MARKET_ORDER_PIN_KEY_FILE,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{orderPinKey=fs.readFileSync(fd);}finally{fs.closeSync(fd);}}
const databaseUrl = env.DATABASE_URL || env.SUPABASE_DB_URL;
const caFile = env.SUPABASE_DB_CA_FILE;
if (!databaseUrl || !env.SUPABASE_URL || !caFile) throw new Error('DATABASE_URL, SUPABASE_URL and SUPABASE_DB_CA_FILE are required.');
const database = new URL(databaseUrl);
const api = new URL(env.SUPABASE_URL);
const projectRef = api.hostname.split('.')[0];
const databaseUser = decodeURIComponent(database.username);
if (!['postgres:', 'postgresql:'].includes(database.protocol) ||
    !database.hostname.endsWith('.pooler.supabase.com') || (database.port || '5432') !== '5432' ||
    !databaseUser.endsWith(`.${projectRef}`) || !database.password) {
  throw new Error('Use this project\'s Session pooler URI on port 5432.');
}
const caStat = fs.statSync(caFile);
if (!caStat.isFile() || caStat.size > 1024 * 1024) throw new Error('Supabase CA must be a regular certificate file.');
const directory = path.resolve('.security/migration-reset');
if (!fs.statSync(directory).isDirectory() || fs.statSync(directory).mode & 0o077) throw new Error('Private migration directory is missing or accessible to others.');
const pgEnv = {
  ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432', PGUSER: databaseUser,
  PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: decodeURIComponent(database.pathname.slice(1)),
  PGSSLMODE: 'verify-full', PGSSLROOTCERT: path.resolve(caFile), PGCONNECT_TIMEOUT: '15',
};
const clientDirectory = fs.existsSync('/usr/lib/postgresql/18/bin/pg_dump') ? '/usr/lib/postgresql/18/bin' : '';
const dumpCommand = clientDirectory ? path.join(clientDirectory, 'pg_dump') : 'pg_dump';
const restoreCommand = clientDirectory ? path.join(clientDirectory, 'pg_restore') : 'pg_restore';
const keyId=orderPinKey?crypto.createHash('sha256').update(orderPinKey).digest('hex'):'';
const pinInventory=spawnSync(clientDirectory?path.join(clientDirectory,'psql'):'psql',['-X','-q','-t','-A','-v','ON_ERROR_STOP=1'],{env:pgEnv,encoding:'utf8',timeout:30000,
  input:`select json_build_object('pins',count(*),'wrongKey',count(*) filter(where coalesce(to_jsonb(p)->>'key_id','')<>'${keyId}')) from private.market_order_pins p;`});
if(pinInventory.status!==0)throw new Error('Delivery PIN backup inventory failed.');
const pinCounts=JSON.parse(pinInventory.stdout);if(pinCounts.pins && (!orderPinKey || pinCounts.wrongKey))throw new Error('The current delivery PIN key is required to recover existing challenges.');
// Full schema extraction performs many metadata round trips on a remote
// connection. Bound the whole dump without truncating its recovery coverage.
const dumpTimeoutMs=20*60_000;
const dump = spawnSync(dumpCommand, [
  '--format=custom', '--no-owner', '--verbose', '--lock-wait-timeout=10s', '--schema=auth', '--schema=public', '--schema=private', '--schema=storage',
], { env: pgEnv, encoding: 'buffer', timeout: dumpTimeoutMs, maxBuffer: 256 * 1024 * 1024 });
if (dump.status !== 0 || !dump.stdout?.subarray(0, 5).equals(Buffer.from('PGDMP'))) {
  // libpq error text may include a host or connection string; keep it private.
  const diagnostic=path.join(directory,crypto.randomUUID()+'.backup-failure.log');
  const fd=fs.openSync(diagnostic,fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);
  try{fs.writeFileSync(fd,dump.stderr || Buffer.from(String(dump.error?.name || 'backup failed')));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
  throw new Error(`PostgreSQL backup failed (exit ${dump.status ?? 'timeout'}); diagnostics saved privately in ${diagnostic}.`);
}
const listing = spawnSync(restoreCommand, ['--list'], { input: dump.stdout, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
if (listing.status !== 0 || !listing.stdout.includes('TABLE DATA')) throw new Error('PostgreSQL archive listing failed.');
const id = crypto.randomUUID();
const sha256 = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const key = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
const encrypted = Buffer.concat([Buffer.from('PVPG1'), nonce, cipher.update(dump.stdout), cipher.final(), cipher.getAuthTag()]);
const writePrivate = (file: string, bytes: Buffer) => {
  const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};
const archive = path.join(directory, `${id}.pvpg`);
const keyFile = path.join(directory, `${id}.key`);
writePrivate(keyFile, key);
writePrivate(archive, encrypted);
const saved = fs.readFileSync(archive);
const decipher = crypto.createDecipheriv('aes-256-gcm', fs.readFileSync(keyFile), saved.subarray(5, 17));
decipher.setAuthTag(saved.subarray(saved.length - 16));
const restored = Buffer.concat([decipher.update(saved.subarray(17, saved.length - 16)), decipher.final()]);
if (sha256(restored) !== sha256(dump.stdout)) throw new Error('Encrypted PostgreSQL backup failed round-trip verification.');
let serverSecrets:{file:string;sha256:string;encrypted:boolean;roundTripVerified:boolean;purpose:string}|undefined;
if(orderPinKey){const secretNonce=crypto.randomBytes(12),secretCipher=crypto.createCipheriv('aes-256-gcm',key,secretNonce);secretCipher.setAAD(Buffer.from(`pinevela:market_order_pin:${id}`));
  const file=path.join(directory,`${id}.pvsecrets`);writePrivate(file,Buffer.concat([Buffer.from('PVSK1'),secretNonce,secretCipher.update(orderPinKey),secretCipher.final(),secretCipher.getAuthTag()]));
  const bytes=fs.readFileSync(file),secretDecipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(5,17));secretDecipher.setAAD(Buffer.from(`pinevela:market_order_pin:${id}`));secretDecipher.setAuthTag(bytes.subarray(-16));
  const recovered=Buffer.concat([secretDecipher.update(bytes.subarray(17,-16)),secretDecipher.final()]);if(!recovered.equals(orderPinKey))throw new Error('Delivery PIN key backup failed verification.');
  serverSecrets={file,sha256:sha256(recovered),encrypted:true,roundTripVerified:true,purpose:'market_order_pin'};recovered.fill(0);orderPinKey.fill(0);
}
const metadata = {
  createdAt: new Date().toISOString(), projectRef, archive, keyFile, sourceSchemas: ['auth', 'public', 'private', 'storage'],
  encrypted: true, dumpSha256: sha256(restored), bytes: restored.length,
  accessControlIncluded: true,
  serverSecrets,
  archiveListingVerified: true, decryptedRoundTripVerified: true,
  note: 'Preparation only. A stopped-writer fresh backup and full restore test are required at cutover. Supabase Storage object bytes require separate backup when objects exist.',
};
writePrivate(path.join(directory, `${id}.json`), Buffer.from(JSON.stringify(metadata, null, 2) + '\n'));
const dirFd = fs.openSync(directory, fs.constants.O_RDONLY);
try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
console.log(JSON.stringify({ archive, bytes: restored.length, encrypted: true, archiveListingVerified: true, decryptedRoundTripVerified: true,serverPinKeyIncluded:!!serverSecrets, noDeletionPerformed: true }));
