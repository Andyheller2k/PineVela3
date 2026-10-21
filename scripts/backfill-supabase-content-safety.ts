import dotenv from 'dotenv';
import path from 'node:path';
import { SupabaseDatabase } from '../supabase/db.js';
import { captureExistingSafety, applyExistingSafety } from './lib/content-safety-backfill.js';
dotenv.config({ quiet: true });
const [action, file] = process.argv.slice(2);
if (!['capture','apply'].includes(action) || !file || !path.isAbsolute(file) || !file.startsWith(path.resolve('.security/nsfw-moderation') + '/')) throw Error('Use capture|apply with an absolute private moderation evidence path.');
const db = new SupabaseDatabase();
try { console.log(JSON.stringify({ passed: true, action, ...(action === 'capture' ? await captureExistingSafety(db, file) : await applyExistingSafety(db, file)) })); }
catch (error) {
  const code = typeof (error as any)?.code === 'string' && /^[A-Za-z0-9_]{3,80}$/.test((error as any).code) ? (error as any).code : undefined;
  const ownMessage = error instanceof Error && /^(?:Private (?:evidence directory|scan checkpoint) required\.|Unsupported scan checkpoint\.|Content changed since its scan checkpoint\.|Existing content changed during the scan; review the checkpoint\.|Existing-content audit contains \d+ flagged submissions\.)/.test(error.message) ? error.message : undefined;
  console.error(JSON.stringify({ passed: false, action, type: error?.constructor?.name, code, ...(ownMessage ? { detail: ownMessage } : {}), message: 'Content audit did not complete. Inspect the private evidence and current schema before retrying.' })); process.exitCode = 1;
}
finally { await db.close(); }
