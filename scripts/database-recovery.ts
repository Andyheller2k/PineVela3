import 'dotenv/config';
import path from 'node:path';
import { JsonStoreWriter } from '../jsonStoreSafety.js';
import { protectStoredCredentials } from '../accountSecurity.js';
import { revokeExposedCredentials } from '../credentialExposure.js';

const writer = new JsonStoreWriter(path.join(path.resolve(process.env.PINEVELA_DATA_DIR || 'data'), 'pinevela_store.json'));
try {
  const [action, ...extra] = process.argv.slice(2);
  if (extra.length || !['check', 'restore'].includes(action)) throw new Error('Usage: node --import tsx scripts/database-recovery.ts check | restore. Stop the server first.');
  if (action === 'check') {
    writer.checkBackup();
    console.log('Backup structure and size are valid. No database records were changed.');
  } else {
    writer.restoreBackup(store => {
      revokeExposedCredentials(store);
      protectStoredCredentials(store);
      const visit = (value: any) => {
        if (!value || typeof value !== 'object') return;
        for (const key of ['session', 'token', 'merchantToken', 'sessionToken']) delete value[key];
        Object.values(value).forEach(visit);
      };
      visit(store);
      if (store.signupVerification) store.signupVerification.pending = [];
      return store;
    });
    console.log('Validated backup restored. Previous database retained in .quarantine; sessions and pending signup challenges revoked. Restart and sign in again.');
  }
} catch (error) {
  console.error((error as Error).message); process.exitCode = 1;
} finally { writer.close(); }
