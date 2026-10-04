import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { WipeRecovery, decryptWipeBackup } from '../adminWipeRecovery.js';
import { JsonStoreWriter } from '../jsonStoreSafety.js';
import { clearRecordSession, removeRawSessions } from '../sessionSecurity.js';

const id = process.argv[2];
if (!id || !/^[a-f0-9-]{36}$/.test(id) || process.argv[3] !== '--confirm-restore') {
  console.error('Stop the server, then run: npm run admin:restore-wipe -- <proposal-id> --confirm-restore'); process.exitCode = 1;
} else {
  const recovery = new WipeRecovery(), writer = new JsonStoreWriter(path.join(process.env.PINEVELA_DATA_DIR || 'data', 'pinevela_store.json'));
  try {
    writer.acquire(); // Refuses recovery while the application holds its writer lease.
    const archivePath = path.join(recovery.directory, `${id}.pvwipe`), keyPath = path.join(recovery.directory, 'backup.key');
    for (const file of [archivePath, keyPath]) {
      const stat = fs.lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077 || stat.size > 128 * 1024 * 1024 + 64) throw new Error('Recovery files must be private regular files within the size limit.');
    }
    const snapshot = decryptWipeBackup(fs.readFileSync(archivePath), fs.readFileSync(keyPath));
    if (snapshot.proposalId !== id) throw new Error('The recovery proposal ID does not match the archive.');
    const pending: { target: string; bytes: Buffer }[] = [];
    for (const file of snapshot.files) {
      if (typeof file.name !== 'string' || file.name.includes('\\') || file.name.split('/').some((part: string) => !part || part === '.' || part === '..') || typeof file.bytes !== 'string') throw new Error('Unsafe recovery media path.');
      const target = path.resolve(recovery.uploads, file.name);
      if (!target.startsWith(recovery.uploads + path.sep)) throw new Error('Recovery file escapes the upload directory.');
      const bytes = Buffer.from(file.bytes, 'base64');
      for (let directory = path.dirname(target); directory.startsWith(recovery.uploads); directory = path.dirname(directory)) {
        if (fs.existsSync(directory) && fs.lstatSync(directory).isSymbolicLink()) throw new Error('Recovery media directories cannot be symlinks.');
      }
      if (fs.existsSync(target)) {
        if (!fs.lstatSync(target).isFile() || fs.lstatSync(target).isSymbolicLink() || !crypto.timingSafeEqual(crypto.createHash('sha256').update(fs.readFileSync(target)).digest(), crypto.createHash('sha256').update(bytes).digest())) throw new Error('A changed media file occupies a recovery path. Archive it securely before retrying.');
      } else pending.push({ target, bytes });
    }
    removeRawSessions(snapshot.database);
    for (const list of Object.values(snapshot.database)) if (Array.isArray(list)) for (const record of list) if (record && typeof record === 'object') clearRecordSession(record);
    if (snapshot.database.signupVerification) snapshot.database.signupVerification.pending = [];
    const governance = snapshot.database.adminGovernance;
    if (governance) {
      governance.revision++; governance.invitations = [];
      for (const proposal of governance.proposals) if (['pending', 'approved'].includes(proposal.status)) proposal.status = 'invalidated';
      for (const proposal of governance.pricingProposals || []) if (['pending', 'approved'].includes(proposal.status)) proposal.status = 'invalidated';
      for (const change of governance.changes) if (change.status === 'pending') change.status = 'invalidated';
    }
    recovery.blockExecution();
    for (const { target, bytes } of pending) { fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 }); const fd = fs.openSync(target, 'wx', 0o600); try { fs.writeFileSync(fd, bytes); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
    writer.restoreValidatedSnapshot(snapshot.database);
    recovery.audit({ event: 'restored-offline', proposalId: id }); recovery.unblockExecution();
    console.log('Verified wipe backup restored. All sessions revoked and pending approvals invalidated. Restart the server and sign in normally.');
  } catch (error) { console.error(error instanceof Error ? error.message : 'Recovery failed. Existing archive is preserved.'); process.exitCode = 1; }
  finally { writer.close(); }
}
