import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { uploadReferences, type WipePlan } from './adminWipeScope.js';
import { validateDatabase } from './jsonStoreSafety.js';

const MAX_ARCHIVE_BYTES = 128 * 1024 * 1024;
const within = (root: string, file: string) => file.startsWith(root + path.sep);
function privateDirectory(directory: string) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) throw new Error('Recovery directory must be private (mode 700), and cannot be a symlink.');
  if (fs.realpathSync(directory) !== directory) throw new Error('Recovery directory ancestors cannot be symlinks.');
}
function writePrivate(file: string, bytes: Buffer) {
  const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
  try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const directory = fs.openSync(path.dirname(file), 'r');
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
}
export function decryptWipeBackup(bytes: Buffer, key: Buffer): any {
  if (bytes.subarray(0, 4).toString() !== 'PVW1') throw new Error('Unsupported recovery backup.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(4, 16));
  decipher.setAuthTag(bytes.subarray(16, 32));
  const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(32)), decipher.final()]).toString('utf8'));
  validateDatabase(Buffer.from(JSON.stringify(value.database)));
  if (!Array.isArray(value.files)) throw new Error('Invalid recovery media archive.');
  return value;
}
export class WipeRecovery {
  readonly directory: string;
  readonly uploads: string;
  constructor(directory = process.env.PINEVELA_WIPE_RECOVERY_DIR || path.resolve('.security/wipe-recovery'), uploads = process.env.PINEVELA_UPLOADS_DIR || path.resolve('uploads')) {
    this.directory = path.resolve(directory); this.uploads = path.resolve(uploads);
    if (this.directory === this.uploads || within(this.uploads, this.directory)) throw new Error('Recovery backups must be outside public uploads.');
  }
  isBlocked(): boolean { return fs.existsSync(path.join(this.directory, 'execution-blocked')); }
  unblockExecution() { fs.unlinkSync(path.join(this.directory, 'execution-blocked')); }
  blockExecution() {
    privateDirectory(this.directory);
    if (!this.isBlocked()) writePrivate(path.join(this.directory, 'execution-blocked'), Buffer.from('Inspect database and encrypted backup offline before permitting writes.\n'));
  }
  mediaFiles(store: any, plan: WipePlan): string[] {
    const files = new Set(plan.media);
    const protectedFiles = uploadReferences(plan.kept.users);
    if (plan.scopes.includes('total') && fs.existsSync(this.uploads)) {
      const visit = (dir: string) => {
        for (const child of fs.readdirSync(dir, { withFileTypes: true })) {
          const file = path.join(dir, child.name);
          if (child.isSymbolicLink()) throw new Error('Uploads contain a symlink. Inspect it offline before wiping.');
          if (child.isDirectory()) visit(file);
          else if (child.isFile()) files.add(path.relative(this.uploads, file));
        }
      };
      visit(this.uploads);
    }
    return [...files].filter(f => !protectedFiles.has(f) && fs.existsSync(path.join(this.uploads, f))).sort();
  }
  private readFile(relative: string): Buffer {
    const file = path.resolve(this.uploads, relative);
    if (!within(this.uploads, file)) throw new Error('Unsafe upload reference.');
    for (let p = file; p !== this.uploads; p = path.dirname(p)) if (fs.lstatSync(p).isSymbolicLink()) throw new Error('Media symlinks cannot be wiped.');
    if (fs.lstatSync(this.uploads).isSymbolicLink()) throw new Error('Uploads directory cannot be a symlink.');
    const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const stat = fs.fstatSync(fd);
      if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error('Media exceeds safe recovery limits.');
      return fs.readFileSync(fd);
    } finally { fs.closeSync(fd); }
  }
  manifest(store: any, plan: WipePlan) {
    let size = 0;
    const files = this.mediaFiles(store, plan).map(name => {
      const bytes = this.readFile(name); size += bytes.length;
      if (size > 64 * 1024 * 1024) throw new Error('Selected media exceeds the 64 MiB online wipe limit. Archive offline before wiping.');
      return { name, size: bytes.length, digest: crypto.createHash('sha256').update(bytes).digest('hex') };
    });
    return { files, size, digest: crypto.createHash('sha256').update(JSON.stringify(files)).digest('hex') };
  }
  backup(id: string, store: any, plan: WipePlan): { file: string; stage: () => () => void; cleanup: () => void } {
    privateDirectory(this.directory);
    const keyPath = path.join(this.directory, 'backup.key');
    if (!fs.existsSync(keyPath)) writePrivate(keyPath, crypto.randomBytes(32));
    const keyStat = fs.lstatSync(keyPath);
    if (!keyStat.isFile() || keyStat.isSymbolicLink() || keyStat.mode & 0o077) throw new Error('Recovery encryption key must be a private regular file (mode 600).');
    const key = fs.readFileSync(keyPath); if (key.length !== 32) throw new Error('Invalid recovery encryption key.');
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid recovery proposal identifier.');
    const files = this.mediaFiles(store, plan).map(name => ({ name, bytes: this.readFile(name).toString('base64') }));
    const plaintext = Buffer.from(JSON.stringify({ version: 1, proposalId: id, database: store, files }));
    if (plaintext.length > MAX_ARCHIVE_BYTES) throw new Error('Recovery archive exceeds the 128 MiB online wipe limit.');
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const file = path.join(this.directory, `${id}.pvwipe`);
    writePrivate(file, Buffer.concat([Buffer.from('PVW1'), nonce, cipher.getAuthTag(), ciphertext]));
    const verified = decryptWipeBackup(fs.readFileSync(file), key);
    if (crypto.createHash('sha256').update(JSON.stringify(verified)).digest('hex') !== crypto.createHash('sha256').update(plaintext).digest('hex')) throw new Error('Recovery backup verification failed. Nothing was deleted.');
    // Staging is adjacent to uploads (same filesystem), outside the publicly served directory.
    const quarantine = path.join(path.dirname(this.uploads), `.pinevela-wipe-${id}`);
    const moved: string[] = [];
    const rollback = () => { for (const name of [...moved].reverse()) fs.renameSync(path.join(quarantine, name), path.join(this.uploads, name)); fs.rmSync(quarantine, { recursive: true, force: true }); };
    return { file, stage: () => {
      if (!files.length) return () => {};
      fs.mkdirSync(quarantine, { mode: 0o700 });
      try {
        for (const { name } of files) {
          fs.mkdirSync(path.dirname(path.join(quarantine, name)), { recursive: true, mode: 0o700 });
          fs.renameSync(path.join(this.uploads, name), path.join(quarantine, name)); moved.push(name);
        }
      } catch (error) { rollback(); throw error; }
      return rollback;
    }, cleanup: () => fs.rmSync(quarantine, { recursive: true, force: true }) };
  }
  audit(event: Record<string, unknown>) {
    privateDirectory(this.directory);
    const file = path.join(this.directory, 'audit.jsonl');
    const fd = fs.openSync(file, fs.constants.O_CREAT | fs.constants.O_APPEND | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW, 0o600);
    try {
      if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).mode & 0o077) throw new Error('Wipe audit file must be private.');
      fs.writeSync(fd, JSON.stringify({ ...event, at: new Date().toISOString() }) + '\n'); fs.fsyncSync(fd);
    } finally { fs.closeSync(fd); }
  }
}
