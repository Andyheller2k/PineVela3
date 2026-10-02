import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { recoverAccountPassword, revokeExposedCredentials } from '../credentialExposure.js';

// Run with the application stopped so an older in-memory snapshot cannot overwrite recovery.
async function hiddenPassword(prompt: string): Promise<string> {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal; passwords must not be supplied as command arguments.');
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const done = (error?: Error) => {
      process.stdin.off('data', read);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stderr.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const read = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003' || char === '\u0004') { done(new Error('Recovery cancelled.')); return; }
        if (char === '\r' || char === '\n') { done(); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    process.stdin.on('data', read);
  });
}

async function main() {
  const [action, identifier, role] = process.argv.slice(2);
  if (!['revoke', 'reset'].includes(action) || (action === 'reset' && (!identifier || !role))) {
    throw new Error('Usage: node --import tsx scripts/credential-recovery.ts revoke | reset <account-email-or-id> <role>. Stop the server first.');
  }
  const storePath = path.join(path.resolve(process.env.PINEVELA_DATA_DIR || 'data'), 'pinevela_store.json');
  const original = fs.readFileSync(storePath, 'utf8');
  const store = JSON.parse(original);
  const containment = revokeExposedCredentials(store);
  if (action === 'reset') {
    const password = await hiddenPassword('New password (hidden): ');
    const confirmation = await hiddenPassword('Confirm password (hidden): ');
    if (password !== confirmation) throw new Error('Passwords do not match. No changes saved.');
    recoverAccountPassword(store, identifier, role, password);
  } else if (!containment.changed) {
    console.log('Credential containment is already applied. No changes needed.');
    return;
  }
  if (fs.readFileSync(storePath, 'utf8') !== original) throw new Error('Database changed during recovery. Stop the server and retry. No changes saved.');
  const temp = `${storePath}.recovery-${process.pid}`;
  try {
    fs.writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600, flag: 'wx' });
    fs.renameSync(temp, storePath);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
  console.log(action === 'reset' ? 'Password changed and account sessions revoked. Restart the server and log in normally.' : `Containment saved: ${containment.lockedRecords} credential records locked; ${containment.revokedSessions} session fields removed.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
