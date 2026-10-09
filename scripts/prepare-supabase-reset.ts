/** Operator preparation only: creates a private preview and encrypted local backup.
 * Never imports the live database writer or executes a wipe. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { accountData, accountId, accountRole } from '../accountSecurity.js';
import { WipeRecovery, decryptWipeBackup } from '../adminWipeRecovery.js';
import type { WipePlan } from '../adminWipeScope.js';
import { validateDatabase } from '../jsonStoreSafety.js';
import {SupabaseDatabase,databaseConfig} from '../supabase/db.js';
import {googleRetentionInventory,classifyLocalAccounts} from './lib/google-retention.js';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--main-admin-email' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])) {
  throw new Error('Usage: node --import tsx scripts/prepare-supabase-reset.ts --main-admin-email EMAIL');
}
const mainAdminEmail = args[1].trim().toLowerCase();
const env = { ...(fs.existsSync('.env') ? dotenv.parse(fs.readFileSync('.env')) : {}), ...process.env };
const source = path.resolve(env.PINEVELA_DATA_DIR || 'data', 'pinevela_store.json');
const uploads = path.resolve(env.PINEVELA_UPLOADS_DIR || 'uploads');
const sha256 = (bytes: Buffer | string) => crypto.createHash('sha256').update(bytes).digest('hex');
const readSource = () => {
  const fd = fs.openSync(source, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    if (!fs.fstatSync(fd).isFile()) throw new Error('Source database must be a regular file.');
    return fs.readFileSync(fd);
  } finally { fs.closeSync(fd); }
};
const sourceBytes = readSource();
const store = validateDatabase(sourceBytes);
// No fallback to an unverified local provider label if cloud verification fails.
const db = new SupabaseDatabase(databaseConfig(env));
let cloud:Awaited<ReturnType<typeof googleRetentionInventory>>;
try {cloud=await db.system(async client=>{await client.query('set transaction read only');return googleRetentionInventory(client);});} finally {await db.close();}
const snapshotId = crypto.randomUUID();
const directory = path.resolve('.security/migration-reset', snapshotId);
fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
for (let current = directory; current !== path.dirname(current); current = path.dirname(current)) {
  if (fs.lstatSync(current).isSymbolicLink()) throw new Error('Backup ancestors cannot be symlinks.');
}
if (fs.statSync(directory).mode & 0o077) throw new Error('Backup directory must have mode 700.');
const writePrivate = (name: string, bytes: Buffer | string) => {
  const fd = fs.openSync(path.join(directory, name), fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
};

// This selects every upload for BACKUP, including admin avatars and orphaned files.
// It is deliberately independent of buildWipePlan('total'), which preserves admins.
const selection: WipePlan = {
  scopes: ['total'], counts: {}, fingerprint: sha256(sourceBytes),
  removed: {}, kept: { users: [] }, retired: {}, settings: {}, media: [], notes: [], managerKeys: {},
};
const recovery = new WipeRecovery(directory, uploads);
const before = recovery.manifest(store, selection);
const archive = recovery.backup(snapshotId, store, selection);
// Never call archive.stage() or archive.cleanup(): original files must remain intact.
const restored = decryptWipeBackup(fs.readFileSync(archive.file), fs.readFileSync(path.join(directory, 'backup.key')));
if (sha256(JSON.stringify(restored.database)) !== sha256(JSON.stringify(store))) throw new Error('Database backup did not round-trip.');
const recoveredMedia = restored.files.map((file: { name: string; bytes: string }) => {
  const bytes = Buffer.from(file.bytes, 'base64');
  return { name: file.name, size: bytes.length, digest: sha256(bytes) };
});
if (sha256(JSON.stringify(recoveredMedia)) !== before.digest) throw new Error('Media backup did not round-trip.');
const after = recovery.manifest(store, selection);
if (sha256(readSource()) !== sha256(sourceBytes) || after.digest !== before.digest) {
  throw new Error('Live data changed during backup. Archive retained; rerun preparation for a current preview.');
}

const identity = (entry: any) => {
  const account = accountData(entry);
  return {
    id: accountId(entry), role: accountRole(entry), name: String(account?.name || entry?.name || ''),
    email: String(account?.email || entry?.email || ''),
    supabaseUserId: String(account?.supabaseUserId || entry?.supabaseUserId || ''),
  };
};
// Record locations plus IDs identify the exact candidates without copying credentials.
const collections = Object.entries(store).filter(([, value]) => Array.isArray(value)).map(([name, value]) => ({
  name, count: (value as any[]).length,
  records: (value as any[]).map((record, index) => ({ index, id: typeof record?.id === 'string' ? record.id : null })),
}));
const users:ReturnType<typeof identity>[] = store.users.map(identity);
const classification=classifyLocalAccounts(users,cloud.retained);
const roleCounts: Record<string, number> = {};
for (const user of users) roleCounts[user.role] = (roleCounts[user.role] || 0) + 1;
const preview = {
  status: 'PREPARATION_ONLY_NO_DELETION', snapshotId, createdAt: new Date().toISOString(),
  newMainAdmin: { email: mainAdminEmail, provider: 'google', status: 'Requested; not provisioned' },
  source, sourceSha256: sha256(sourceBytes), users, roleCounts, collections,
  retention:{...cloud,local:classification,authority:'Saved Supabase Google identity, verified matching email and exact Auth UUID; no email-only adoption.',
    dependenciesReviewed:false,executionBlocked:true},
  separateAccountRegistries: Object.fromEntries(['verificationTeams', 'digitalMarketApplications', 'digitalMarketStores', 'staff'].map(name => [name, (store[name] || []).map(identity)])),
  privateAccountStateToReset: ['adminGovernance', 'managerOperationKeys', 'managerAccountSettings', 'signupVerification', 'roomKeyAttempts', 'retiredFeatureRecords'],
  governanceRecordCounts: Object.fromEntries(Object.entries(store.adminGovernance || {}).filter(([, value]) => Array.isArray(value)).map(([name, value]) => [name, (value as any[]).length])),
  uploads: { directory: uploads, ...before, disposition: 'All files are backed up. Retained-account dependencies and exact removal set still require review; this is not a deletion manifest.' },
  backup: { file: archive.file, databaseRoundTripVerified: true, mediaRoundTripVerified: true, sourceUnchangedDuringPreparation: true, encrypted: true },
  keep: ['Only accounts with a saved verified Google identity; preserve exact UUID/email links and review domain dependencies', 'Platform fee/contact/subscription configuration, with stale account references reviewed before import', 'Repository code and bundled assets', 'Private recovery archives and audit history', 'Request rate-limit defenses'],
  remote: { authInventoryVerified: true, databaseInventoryVerified: false, storageInventoryVerified: false, note: 'Fresh stopped-writer classification and linked-record review are required. Never wipe an unrelated/shared Supabase project.' },
  connection: { urlConfigured: !!env.SUPABASE_URL, serverKeyConfigured: !!(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY), databaseConnectionConfigured: !!(env.DATABASE_URL || env.SUPABASE_DB_URL) },
  executionPrerequisites: [
    'Review this exact candidate set and cloud inventory before approving the destructive reset.',
    'Retain only currently verified Google identities and exact local bindings; resolve ambiguous bindings and all linked-record/media dependencies before producing a deletion manifest.',
    'Do not restore disposable accounts from full backups into production; restore rehearsals stay isolated. Retained identities do not inherit old admin roles, keys or sessions.',
    'Verify Supabase schema, RLS, positive and negative API flows, and rollback before removing the JSON data.',
    'Provision the trusted Google main administrator through server-only authorization; ordinary signup cannot assign roles.',
    'Disable the old local password-admin bootstrap and invalidate old governance roles, invitations, keys and sessions at cutover.',
    'Stop/drain writers and create a fresh verified backup immediately before execution.',
    'Back up scoped cloud Auth/application/Storage data before deleting it; handle remaining JWT/session access during cutover.',
  ],
};
writePrivate('preview.json', JSON.stringify(preview, null, 2) + '\n');
const cell = (value: string) => value.replace(/[\r\n|]/g, ' ');
const markdown = [
  '# Supabase reset preview — no deletion performed', '',
  `New main administrator requested: **${mainAdminEmail}**, using verified Google sign-in. This is a setup requirement, not an active admin grant.`, '',
  `Snapshot: ${snapshotId}. This is a local preparation snapshot; a fresh backup is required after draining writers at cutover.`, '',
  `Verified-Google-only policy: **${classification.retained.length}** local accounts qualify for retention, **${classification.removalCandidates.length}** are removal candidates. Cloud Auth has **${cloud.retained.length}** qualifying identities and **${cloud.removalCandidates.length}** removal candidates. All **${before.files.length}** runtime files are backed up (${before.size} bytes); none are proposed for deletion until dependency review.`, '',
  '## Retained local accounts', '', '| Role | Name | Email | ID |', '| --- | --- | --- | --- |',
  ...classification.retained.map(user=>`| ${cell(user.role)} | ${cell(user.name)} | ${cell(user.email)} | ${cell(user.id)} |`), '',
  '## Local removal candidates', '', '| Role | Name | Email | ID |', '| --- | --- | --- | --- |',
  ...classification.removalCandidates.map(user=>`| ${cell(user.role)} | ${cell(user.name)} | ${cell(user.email)} | ${cell(user.id)} |`), '',
  '## Linked collection inventory requiring dependency review', '', '| Collection | Records |', '| --- | ---: |',
  ...collections.map(collection => `| ${collection.name} | ${collection.count} |`), '',
  'Separate officer, store/application and staff registries are included, even where they do not correspond to a users entry. Exact IDs and media filenames are in preview.json; no passwords, session tokens or keys appear in that preview.', '',
  'Old admin membership, invitations, approval/settings keys and account sessions must become inactive. Historical governance and payments remain recoverable in the encrypted backup. Platform configuration, code, bundled assets, recovery history and request defenses are retained; old account references in configuration need review.', '',
  '## Backup verification', '',
  `Archive: ${path.basename(archive.file)}. AES-256-GCM encrypted; database and every upload decrypted and compared successfully. Source database and upload manifest were unchanged during preparation. The separate backup.key is private and must be retained securely with the archive for recovery.`, '',
  '## Before execution', '', ...preview.executionPrerequisites.map(item => `- ${item}`), '',
  'Cloud Auth retention classification was verified read-only. Linked database and Storage dependencies are still unreviewed; this preview cannot execute a reset. No cloud or local account has been deleted or restored by this preparation.', '',
];
writePrivate('preview.md', markdown.join('\n'));
const dirFd = fs.openSync(directory, fs.constants.O_RDONLY);
try { fs.fsyncSync(dirFd); } finally { fs.closeSync(dirFd); }
console.log(JSON.stringify({ preview: path.join(directory, 'preview.md'), archive: archive.file, accounts: users.length, retainedLocal:classification.retained.length, removalCandidatesLocal:classification.removalCandidates.length, retainedCloud:cloud.retained.length, removalCandidatesCloud:cloud.removalCandidates.length, ambiguousBindings:classification.ambiguousBindings.length, uploads: before.files.length, backupVerified: true, noDeletionPerformed: true,executionBlocked:true }, null, 2));
