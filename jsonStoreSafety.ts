import fs from 'node:fs';
import { validatePricingSettings } from './platformSettings.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ACCOUNT_FEATURES } from './accountFeatures.js';

export const JSON_COLLECTIONS = [
  'hostels', 'issueReports', 'activities', 'hostelVerifications', 'managerRegistrationRequests',
  'managerVerifications', 'managerRequests', 'managerProfiles', 'verificationAuditLogs', 'users',
  'notifications', 'boardRequests', 'managerKeyPetitions', 'hostelMedia', 'meetings', 'ratings', 'onboardingPayments', 'paymentTransactions', 'staff',
  'staffAuditLogs', 'staffReviews', 'staffBargains', 'roomKeys', 'retiredRoomKeys', 'keyDispatches',
  'managerRestrictions', 'digitalMarketApplications', 'digitalMarketStores', 'digitalMarketProducts',
  'marketMedia', 'digitalMarketOrders', 'digitalMarketMessages', 'digitalMarketRatings',
  'digitalMarketServiceReviews', 'verificationTeams', 'verificationInspections'
] as const;

export class DatabasePersistenceError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'DatabasePersistenceError'; }
}
const failure = (code: string, message: string): never => { throw new DatabasePersistenceError(code, message); };
const object = (value: any) => value && typeof value === 'object' && !Array.isArray(value);
const digest = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
const LOCAL_FILESYSTEMS = new Set([0xef53, 0x58465342, 0x9123683e, 0x01021994, 0x794c7630, 0x2fc12fc1, 0xf2f52010, 0x858458f6]);

/** Validate before migration or replacement; never include JSON contents in an error. */
export function validateDatabase(bytes: Buffer): any {
  let value: any;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { return failure('INVALID_DATABASE', 'Database JSON is invalid. The existing file is preserved; restore a validated backup offline.'); }
  if (!object(value) || !Array.isArray(value.users) && !Array.isArray(value.hostels)) {
    return failure('INVALID_DATABASE', 'Database must be an object with a users or hostels collection. Existing data is preserved.');
  }
  for (const key of JSON_COLLECTIONS) if (key in value && !Array.isArray(value[key])) {
    return failure('INVALID_DATABASE', `Database collection ${key} must be an array. Existing data is preserved.`);
  }
  for (const key of ['platformSettings', 'managerOperationKeys', 'managerAccountSettings', 'retiredFeatureRecords', 'signupVerification', 'roomKeyAttempts', 'adminGovernance']) {
    if (key in value && !object(value[key])) return failure('INVALID_DATABASE', `Database field ${key} must be an object. Existing data is preserved.`);
  }
  for (const [key, fields] of [['signupVerification', ['pending', 'limits']], ['roomKeyAttempts', ['limits']]] as const) {
    for (const field of fields) if (value[key] && field in value[key] && !Array.isArray(value[key][field])) {
      return failure('INVALID_DATABASE', `Database field ${key}.${field} must be an array. Existing data is preserved.`);
    }
  }
  if (value.retiredFeatureRecords && Object.values(value.retiredFeatureRecords).some(records => !Array.isArray(records))) {
    return failure('INVALID_DATABASE', 'Archived database collections must be arrays. Existing data is preserved.');
  }
  if (value.adminGovernance) {
    const g = value.adminGovernance;
    const validMembers = Array.isArray(g.members) && g.members.length <= 5 && g.members.every((m: any) => object(m) && typeof m.id === 'string' && m.id && Number.isInteger(m.slot) && m.slot >= 1 && m.slot <= 5 && typeof m.active === 'boolean' && (m.keyHash === undefined || /^[a-f0-9]{64}$/.test(m.keyHash)) && (m.settingsKeyHash === undefined || /^[a-f0-9]{64}$/.test(m.settingsKeyHash))) &&
      new Set(g.members.map((m: any) => m.id)).size === g.members.length && new Set(g.members.map((m: any) => m.slot)).size === g.members.length;
    const validArrays = ['proposals', 'invitations', 'changes'].every(key => Array.isArray(g[key]) && g[key].length <= 100 && g[key].every((r: any) => object(r) && /^[a-f0-9-]{36}$/.test(r.id) && Number.isFinite(Date.parse(r.expiresAt))));
    const validPricing = g.pricingProposals === undefined || Array.isArray(g.pricingProposals) && g.pricingProposals.length <= 100 && g.pricingProposals.every((p: any) => {
      if (!object(p)) return false;
      try { validatePricingSettings(p.before); validatePricingSettings(p.prices); } catch { return false; }
      if (!Array.isArray(p.roster) || p.roster.length < 3 || p.roster.length > 5 || !p.roster.every((r: any) => object(r) && typeof r.id === 'string' && r.id && Number.isInteger(r.slot) && r.slot >= 1 && r.slot <= 5 && typeof r.name === 'string')) return false;
      if (new Set(p.roster.map((r: any) => r.id)).size !== p.roster.length || new Set(p.roster.map((r: any) => r.slot)).size !== p.roster.length || !p.roster.some((r: any) => r.id === p.createdBy)) return false;
      if (!Array.isArray(p.votes) || p.votes.length < 1 || p.votes.length > 5 || !p.votes.every((v: any) => object(v) && p.roster.some((r: any) => r.id === v.id && r.slot === v.slot) && typeof v.name === 'string' && ['approved', 'rejected'].includes(v.decision) && Number.isFinite(Date.parse(v.at))) || new Set(p.votes.map((v: any) => v.id)).size !== p.votes.length) return false;
      return /^[a-f0-9-]{36}$/.test(p.id) && typeof p.reason === 'string' && p.reason.length >= 3 && p.reason.length <= 500 && Number.isFinite(Date.parse(p.createdAt)) && Number.isFinite(Date.parse(p.expiresAt)) && Number.isSafeInteger(p.revision) && p.revision >= 1 && ['pending', 'approved', 'rejected', 'invalidated', 'expired', 'applied'].includes(p.status) && (p.status !== 'applied' || p.appliedBy === g.mainId && Number.isFinite(Date.parse(p.appliedAt)) && p.votes.filter((v: any) => v.decision === 'approved').length >= 3);
    });
    const validAccountProposals = g.accountProposals === undefined || Array.isArray(g.accountProposals) && g.accountProposals.length <= 100 && g.accountProposals.every((p: any) =>
      object(p) && /^[a-f0-9-]{36}$/.test(p.id) && typeof p.targetId === 'string' && typeof p.targetRole === 'string' && p.targetRole !== 'admin' &&
      typeof p.reason === 'string' && p.reason.length >= 3 && p.reason.length <= 500 && ['ban', 'restrict', 'restore', 'delete'].includes(p.action) &&
      /^[a-f0-9]{64}$/.test(p.fingerprint) && Number.isSafeInteger(p.revision) && Number.isFinite(Date.parse(p.createdAt)) && Number.isFinite(Date.parse(p.expiresAt)) &&
      ['pending', 'approved', 'rejected', 'expired', 'invalidated', 'applied'].includes(p.status) && Array.isArray(p.features) && p.features.every((f: string) => Object.hasOwn(ACCOUNT_FEATURES, f)) && new Set(p.features).size === p.features.length &&
      (p.action !== 'restrict' || p.features.length > 0) && (p.action !== 'ban' || object(p.duration) && Number.isSafeInteger(p.duration.amount) && p.duration.amount > 0 && ['hours', 'days', 'weeks', 'months', 'years'].includes(p.duration.unit) && Number.isSafeInteger(p.duration.milliseconds) && p.duration.milliseconds > 0 && p.duration.milliseconds <= 100 * 365 * 86400_000) &&
      Array.isArray(p.roster) && p.roster.length === 5 && new Set(p.roster.map((r: any) => r.id)).size === 5 && new Set(p.roster.map((r: any) => r.slot)).size === 5 &&
      p.roster.every((r: any) => object(r) && typeof r.id === 'string' && Number.isInteger(r.slot) && r.slot >= 1 && r.slot <= 5 && typeof r.name === 'string') &&
      Array.isArray(p.votes) && p.votes.length >= 1 && p.votes.length <= 5 && new Set(p.votes.map((v: any) => v.id)).size === p.votes.length &&
      p.votes.every((v: any) => object(v) && p.roster.some((r: any) => r.id === v.id && r.slot === v.slot) && ['approved', 'rejected'].includes(v.decision) && Number.isFinite(Date.parse(v.at))) &&
      (p.status !== 'applied' || p.appliedBy === g.mainId && Number.isFinite(Date.parse(p.appliedAt)) && p.votes.length === 5 && p.votes.every((v: any) => v.decision === 'approved')));
    const validAccountPolicies = g.accountPolicies === undefined || object(g.accountPolicies) && Object.values(g.accountPolicies).every((p: any) => object(p) &&
      Number.isSafeInteger(p.revision) && p.revision >= 1 && typeof p.reason === 'string' && p.reason.length <= 500 && typeof p.proposalId === 'string' &&
      Number.isFinite(Date.parse(p.appliedAt)) && typeof p.appliedBy === 'string' && (!p.banUntil || Number.isFinite(Date.parse(p.banUntil))) &&
      Array.isArray(p.features) && p.features.every((f: string) => Object.hasOwn(ACCOUNT_FEATURES, f)) &&
      (p.deniedSessions === undefined || Array.isArray(p.deniedSessions) && p.deniedSessions.length <= 8 && p.deniedSessions.every((s: any) => object(s) && /^[a-f0-9]{64}$/.test(s.tokenHash) && Number.isFinite(s.expiresAt))));
    const validResidenceProposals = g.residenceProposals === undefined || Array.isArray(g.residenceProposals) && g.residenceProposals.length <= 100 && g.residenceProposals.every((p: any) =>
      object(p) && /^[a-f0-9-]{36}$/.test(p.id) && /^[a-f0-9]{64}$/.test(p.fingerprint) && Number.isSafeInteger(p.revision) && p.revision >= 1 &&
      typeof p.reason === 'string' && p.reason.length >= 3 && p.reason.length <= 1000 && Number.isFinite(Date.parse(p.createdAt)) && Number.isFinite(Date.parse(p.expiresAt)) &&
      object(p.options) && typeof p.options.hostelId === 'string' && p.options.hostelId && p.options.deleteHostel === true && typeof p.options.deleteManager === 'boolean' &&
      object(p.options.ban) && Number.isSafeInteger(p.options.ban.amount) && p.options.ban.amount >= 0 && ['hours', 'days', 'weeks', 'months', 'years'].includes(p.options.ban.unit) &&
      object(p.preview) && object(p.preview.counts) && Array.isArray(p.preview.notes) &&
      ['pending', 'approved', 'rejected', 'expired', 'invalidated', 'executed'].includes(p.status) && Array.isArray(p.votes) && p.votes.length >= 1 && p.votes.length <= 5 && new Set(p.votes.map((v: any) => v.id)).size === p.votes.length &&
      p.votes.every((v: any) => object(v) && typeof v.id === 'string' && v.id && Number.isInteger(v.slot) && v.slot >= 1 && v.slot <= 5 && typeof v.name === 'string' && ['approved', 'rejected'].includes(v.decision) && Number.isFinite(Date.parse(v.at))) &&
      (!['approved', 'executed'].includes(p.status) || p.votes.filter((v: any) => v.decision === 'approved').length >= 2 && p.votes.every((v: any) => v.decision === 'approved')) &&
      (p.status !== 'executed' || p.executedBy === g.mainId && Number.isFinite(Date.parse(p.executedAt)) && p.votes.some((v: any) => v.id === g.mainId)));
    const validRegistrationBans = g.registrationBans === undefined || Array.isArray(g.registrationBans) && g.registrationBans.every((ban: any) => object(ban) && typeof ban.id === 'string' && typeof ban.proposalId === 'string' && typeof ban.accountId === 'string' && ban.accountId &&
      (ban.kind === 'hostel' && ban.accountRole === 'manager' || ban.kind === 'manager_account' && ban.accountRole === 'user') && Number.isFinite(Date.parse(ban.until)) && typeof ban.reason === 'string' && ban.reason.length <= 1000 && typeof ban.appliedBy === 'string');
    if (g.version !== 1 || typeof g.mainId !== 'string' || !Number.isSafeInteger(g.revision) || g.revision < 1 || !validMembers || !validArrays || !validPricing || !validAccountProposals || !validAccountPolicies || !validResidenceProposals || !validRegistrationBans || !object(g.attempts) || (g.mainId && !g.members.some((m: any) => m.id === g.mainId && m.slot === 1))) {
      return failure('INVALID_DATABASE', 'Administrator governance metadata is invalid. Preserve the database and inspect it offline.');
    }
    if (g.invitations.length + g.members.length > 5 || g.proposals.some((p: any) => !Array.isArray(p.scopes) || !p.scopes.length || p.scopes.some((s: string) => !['hostels', 'markets', 'managers', 'residents', 'users', 'total'].includes(s)) || !Array.isArray(p.votes) || !Array.isArray(p.roster) || !object(p.preview) || !/^[a-f0-9]{64}$/.test(p.fingerprint)) || g.changes.some((c: any) => !['remove', 'reset-key', 'reset-settings-key'].includes(c.action) || !Array.isArray(c.votes))) {
      return failure('INVALID_DATABASE', 'Administrator proposal metadata is invalid. Existing data is preserved.');
    }
  }
  return value;
}

export function databaseSizeLimit(value = process.env.PINEVELA_JSON_MAX_BYTES): number {
  const maximum = value === undefined || value === '' ? 64 * 1024 * 1024 : Number(value);
  if (!Number.isSafeInteger(maximum) || maximum < 1024 * 1024 || maximum > 256 * 1024 * 1024) {
    return failure('INVALID_LIMIT', 'PINEVELA_JSON_MAX_BYTES must be 1–256 MiB in bytes.');
  }
  return maximum;
}

/** Linux, local filesystem, one process for the lifetime of its in-memory snapshot. */
export class JsonStoreWriter {
  private lockFd?: number;
  private expected?: string;
  private loaded = false;
  readonly backupPath: string;
  readonly quarantinePath: string;
  constructor(readonly storePath: string, private maximumBytes = databaseSizeLimit()) {
    this.backupPath = `${storePath}.bak`;
    this.quarantinePath = `${storePath}.quarantine`;
  }

  acquire(): void {
    if (this.lockFd !== undefined) return this.assertLease();
    fs.mkdirSync(path.dirname(this.storePath), { recursive: true, mode: 0o700 });
    if (process.platform !== 'linux' || !LOCAL_FILESYSTEMS.has(fs.statfsSync(path.dirname(this.storePath)).type >>> 0)) {
      failure('UNSUPPORTED_STORAGE', 'JSON storage requires a supported local Linux filesystem. Use PostgreSQL for network storage or multiple workers.');
    }
    let fd: number | undefined;
    try {
      fd = fs.openSync(`${this.storePath}.lock`, fs.constants.O_CREAT | fs.constants.O_RDWR | fs.constants.O_NOFOLLOW, 0o600);
      if (!fs.fstatSync(fd).isFile()) failure('LOCK_UNAVAILABLE', 'Database lock must be a regular file.');
      // The inherited fd shares the parent's open file description. The kernel lease survives
      // flock's exit while this process holds the descriptor, and releases on crash/SIGKILL.
      const lock = spawnSync('flock', ['--exclusive', '--nonblock', '--conflict-exit-code', '73', '3'],
        { stdio: ['ignore', 'pipe', 'pipe', fd], timeout: 5000 });
      if (lock.status === 73) failure('WRITER_BUSY', 'JSON database is already in use. Stop the other server or recovery command before starting another writer.');
      if (lock.error || lock.status !== 0) failure('LOCK_UNAVAILABLE', 'Cannot obtain the database lock. Linux flock and a local filesystem are required.');
      this.lockFd = fd;
      this.assertLease();
    } catch (error) {
      if (fd !== undefined) fs.closeSync(fd);
      this.lockFd = undefined;
      if (error instanceof DatabasePersistenceError) throw error;
      failure('LOCK_UNAVAILABLE', 'Cannot open the private database writer lock. No data was replaced.');
    }
  }

  private assertLease(): void {
    if (this.lockFd === undefined) failure('LOCK_UNAVAILABLE', 'No database writer lease.');
    try {
      const held = fs.fstatSync(this.lockFd), current = fs.lstatSync(`${this.storePath}.lock`);
      if (!current.isFile() || held.ino !== current.ino || held.dev !== current.dev) {
        failure('LOCK_REPLACED', 'Database lock was removed or replaced. Refusing stale writes; stop all writers before recovery.');
      }
    } catch (error) {
      if (error instanceof DatabasePersistenceError) throw error;
      failure('LOCK_REPLACED', 'Database lock is unavailable. Refusing stale writes.');
    }
  }

  private readBytes(file: string, allowMissing = false): Buffer | undefined {
    let fd: number | undefined;
    try {
      fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      const info = fs.fstatSync(fd);
      if (!info.isFile()) failure('UNREADABLE_DATABASE', 'Database and backup paths must be regular files. Existing data is preserved.');
      if (info.size > this.maximumBytes) failure('DATABASE_SIZE_LIMIT', 'Database exceeds the configured JSON size limit. Existing data is preserved; migrate or recover offline.');
      const bytes = fs.readFileSync(fd);
      if (bytes.length > this.maximumBytes) failure('DATABASE_SIZE_LIMIT', 'Database exceeds the configured JSON size limit. Existing data is preserved.');
      return bytes;
    } catch (error) {
      if (error instanceof DatabasePersistenceError) throw error;
      if (allowMissing && (error as any)?.code === 'ENOENT') return undefined;
      failure('UNREADABLE_DATABASE', 'Database or backup cannot be read. Existing data is preserved; check permissions and restore offline.');
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }

  load(requireExisting = false): any | undefined {
    this.acquire();
    const bytes = this.readBytes(this.storePath, true);
    if (!bytes && requireExisting) return failure('MISSING_DATABASE', 'An existing database is required. No empty database was created.');
    // An existing backup is evidence of a prior database, not a fresh install.
    if (!bytes && (fs.existsSync(this.backupPath) || fs.existsSync(this.quarantinePath))) {
      return failure('MISSING_DATABASE', 'Database is missing but recovery files exist. Refusing empty initialization; restore the backup offline.');
    }
    const value = bytes ? validateDatabase(bytes) : undefined;
    this.expected = bytes ? digest(bytes) : undefined;
    this.loaded = true;
    return value;
  }

  private atomicWrite(file: string, bytes: Buffer): void {
    const temporary = `${file}.tmp.${process.pid}.${crypto.randomUUID()}`;
    let fd: number | undefined;
    try {
      fd = fs.openSync(temporary, 'wx', 0o600);
      fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); fs.closeSync(fd); fd = undefined;
      fs.renameSync(temporary, file);
      const directory = fs.openSync(path.dirname(file), 'r');
      try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
      try { fs.unlinkSync(temporary); } catch (error) { if ((error as any).code !== 'ENOENT') throw error; }
    }
  }

  save(value: any): void {
    this.acquire();
    if (!this.loaded) failure('STORE_NOT_LOADED', 'Read and validate the database before saving.');
    const current = this.readBytes(this.storePath, true);
    if ((current ? digest(current) : undefined) !== this.expected) failure('STALE_DATABASE', 'Database changed outside this writer. Refusing to overwrite it; stop the server and inspect the file.');
    if (current) validateDatabase(current);
    const bytes = Buffer.from(JSON.stringify(value, null, 2));
    if (bytes.length > this.maximumBytes) failure('DATABASE_SIZE_LIMIT', 'Save exceeds the configured JSON size limit. Existing database and backup are preserved.');
    validateDatabase(bytes);
    try {
      if (current) this.atomicWrite(this.backupPath, current);
      this.atomicWrite(this.storePath, bytes);
      this.expected = digest(bytes);
    } catch {
      failure('DATABASE_WRITE_FAILED', 'Database save failed. Stop the server and inspect the database/backup before restarting.');
    }
  }

  checkBackup(): any {
    this.acquire();
    return validateDatabase(this.readBytes(this.backupPath)!);
  }

  restoreBackup(transform: (value: any) => any): void {
    const backup = this.checkBackup();
    const bytes = Buffer.from(JSON.stringify(transform(backup), null, 2));
    if (bytes.length > this.maximumBytes) failure('DATABASE_SIZE_LIMIT', 'Recovered database exceeds the configured JSON size limit.');
    validateDatabase(bytes);
    this.assertLease();
    if (fs.existsSync(this.quarantinePath)) failure('QUARANTINE_EXISTS', 'A quarantine copy already exists. Archive it securely before another restore; it will not be overwritten.');
    const current = this.readBytes(this.storePath, true);
    try {
      if (current) this.atomicWrite(this.quarantinePath, current);
      this.atomicWrite(this.storePath, bytes);
      this.expected = digest(bytes); this.loaded = true;
    } catch { failure('RESTORE_FAILED', 'Recovery write failed. Database, backup and quarantine must be inspected offline.'); }
  }

  /** Offline disaster recovery from a separately authenticated encrypted wipe archive. */
  restoreValidatedSnapshot(value: any): void {
    this.acquire();
    const bytes = Buffer.from(JSON.stringify(value, null, 2));
    if (bytes.length > this.maximumBytes) failure('DATABASE_SIZE_LIMIT', 'Recovery snapshot exceeds the configured JSON size limit.');
    validateDatabase(bytes);
    if (fs.existsSync(this.quarantinePath)) failure('QUARANTINE_EXISTS', 'Archive the existing quarantine securely before restoring another snapshot.');
    const current = this.readBytes(this.storePath, true);
    try {
      if (current) this.atomicWrite(this.quarantinePath, current);
      this.atomicWrite(this.storePath, bytes);
      this.expected = digest(bytes); this.loaded = true;
    } catch { failure('RESTORE_FAILED', 'Recovery could not finish. Inspect the database, encrypted archive and quarantine offline.'); }
  }

  close(): void {
    if (this.lockFd !== undefined) fs.closeSync(this.lockFd);
    this.lockFd = undefined; this.loaded = false; this.expected = undefined;
    // Never unlink the lock inode: racing writers must always lock the same file.
  }
}
