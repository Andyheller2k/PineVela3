import crypto from 'node:crypto';
import { credentialWork, WorkPool } from './resourceSecurity.js';

const DIGEST = /^[a-f0-9]{64}$/i;
const PASSWORD_FIELDS = ['password', 'plainPassword', 'localPassword', 'userPropPassword'];
const SCRYPT_OPTIONS = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export const normalizeEmail = (value: unknown): string => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const accountData = (entry: any): any => entry?.user || entry;
export const accountRole = (entry: any): string => String(accountData(entry)?.role || entry?.role || '').toLowerCase();
export const accountId = (entry: any): string => String(accountData(entry)?.id || entry?.id || '');
export const accountKey = (entry: any): string => `${accountId(entry)}:${accountRole(entry)}:${normalizeEmail(accountData(entry)?.email || entry?.email)}:${String(accountData(entry)?.roomKey || entry?.roomKey || '').toUpperCase()}`;

function digestPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function hashDigest(digest: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = credentialWork(`hash:${digest}:${salt}`, () => crypto.scryptSync(digest, salt, 32, SCRYPT_OPTIONS).toString('hex'));
  return `scrypt-sha256$${salt}$${derived}`;
}

export function hashCredential(password: string): string {
  return hashDigest(digestPassword(password));
}

/** Legacy SHA-256 hashes are verified using the submitted password, never as bearer credentials. */
export function verifyCredential(password: string, stored: unknown): boolean {
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored || stored.startsWith('!LOCKED_')) return false;
  if (stored.startsWith('scrypt-sha256$')) {
    const [, salt, expected] = stored.split('$');
    if (!/^[a-f0-9]{32}$/.test(salt || '') || !DIGEST.test(expected || '')) return false;
    const digest = digestPassword(password);
    return equal(credentialWork(`verify:${digest}:${stored}`, () => crypto.scryptSync(digest, salt, 32, SCRYPT_OPTIONS).toString('hex')), expected);
  }
  return DIGEST.test(stored) ? equal(digestPassword(password), stored.toLowerCase()) : equal(password, stored);
}

const passwordWorkers = new WorkPool(2, 8);
function deriveAsync(digest: string, salt: string): Promise<string> {
  return passwordWorkers.run(() => new Promise((resolve, reject) => {
    crypto.scrypt(digest, salt, 32, SCRYPT_OPTIONS, (error, derived) => error ? reject(error) : resolve(derived.toString('hex')));
  }));
}
export async function hashCredentialAsync(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex'), digest = digestPassword(password);
  const derived = await credentialWork(`hash:${digest}:${salt}`, () => deriveAsync(digest, salt));
  return `scrypt-sha256$${salt}$${derived}`;
}
export async function verifyCredentialAsync(password: string, stored: unknown): Promise<boolean> {
  if (typeof password !== 'string' || !password || typeof stored !== 'string' || !stored || stored.startsWith('!LOCKED_')) return false;
  if (!stored.startsWith('scrypt-sha256$')) return verifyCredential(password, stored);
  const [, salt, expected] = stored.split('$');
  if (!/^[a-f0-9]{32}$/.test(salt || '') || !DIGEST.test(expected || '')) return false;
  const digest = digestPassword(password);
  return equal(await credentialWork(`verify-async:${digest}:${stored}`, () => deriveAsync(digest, salt)), expected);
}
export async function findAsync<T>(values: T[], predicate: (value: T) => Promise<boolean>): Promise<T | undefined> {
  for (const value of values) if (await predicate(value)) return value;
}

export function credentialValues(entry: any, includeHistory = true): string[] {
  const values = new Set<string>();
  for (const target of [entry, entry?.user]) {
    if (!target) continue;
    for (const field of PASSWORD_FIELDS) if (typeof target[field] === 'string' && target[field]) values.add(target[field]);
    if (includeHistory) for (const value of target.passwordHistory || []) if (typeof value === 'string') values.add(value);
  }
  return [...values];
}

/** Test a proposed password against the hashes of this person's existing identities. */
export function passwordIsReused(password: string, records: any[], email: string, actor?: any): boolean {
  return relatedCredentials(records, email, actor).some(value => verifyCredential(password, value));
}
export async function passwordIsReusedAsync(password: string, records: any[], email: string, actor?: any): Promise<boolean> {
  return Boolean(await findAsync(relatedCredentials(records, email, actor), value => verifyCredentialAsync(password, value)));
}
function relatedCredentials(records: any[], email: string, actor?: any): string[] {
  const emails = new Set([normalizeEmail(email), normalizeEmail(actor?.email), normalizeEmail(actor?.parentUserEmail)].filter(Boolean));
  const ids = new Set([actor?.id, actor?.parentUserId].filter(Boolean).map(String));
  const related = new Set<any>();
  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const entry of records) {
      const data = accountData(entry);
      if (!data || related.has(entry)) continue;
      const recordEmails = [data.email, data.studentEmail, data.managerEmail, data.staffEmail, data.parentUserEmail, entry.email].map(normalizeEmail).filter(Boolean);
      const recordIds = [data.id, data.userId, data.parentUserId, entry.id].filter(Boolean).map(String);
      if (!recordEmails.some(e => emails.has(e)) && !recordIds.some(id => ids.has(id))) continue;
      related.add(entry);
      recordEmails.forEach(e => emails.add(e));
      recordIds.forEach(id => ids.add(id));
      expanded = true;
    }
  }
  const tested = new Set<string>();
  for (const record of related) {
    for (const value of credentialValues(record)) {
      if (tested.has(value)) continue;
      tested.add(value);
    }
  }
  return [...tested];
}

/** Scrub old plaintext aliases and upgrade legacy hashes before any database write. */
export function protectStoredCredentials(value: any, seen = new Set<any>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach(item => protectStoredCredentials(item, seen));
    return;
  }
  const plain = [value.plainPassword, value.localPassword, value.userPropPassword].find(p => typeof p === 'string' && p && !DIGEST.test(p) && !p.startsWith('scrypt-sha256$'));
  const stored = plain || value.password || value.plainPassword || value.localPassword || value.userPropPassword;
  if (typeof stored === 'string' && stored && !stored.startsWith('!LOCKED_')) {
    value.password = stored.startsWith('scrypt-sha256$') ? stored : DIGEST.test(stored) ? hashDigest(stored.toLowerCase()) : hashCredential(stored);
  }
  delete value.plainPassword;
  delete value.localPassword;
  delete value.userPropPassword;
  if (Array.isArray(value.passwordHistory)) value.passwordHistory = value.passwordHistory.map((hash: string) => typeof hash !== 'string' || hash.startsWith('scrypt-sha256$') || hash.startsWith('!LOCKED_') ? hash : DIGEST.test(hash) ? hashDigest(hash.toLowerCase()) : hashCredential(hash));
  Object.values(value).forEach(item => protectStoredCredentials(item, seen));
}

export function publicAccountData(value: any, includeSession = false): any {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(child => publicAccountData(child));
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PASSWORD_FIELDS.includes(key) && key !== 'passwordHistory' && key !== 'session' && (!['token', 'merchantToken', 'sessionToken'].includes(key) || (includeSession && key === 'token'))).map(([key, child]) => [key, publicAccountData(child, includeSession && key === 'user')]));
}

export function canManageHostel(actor: any, hostel: any): boolean {
  if (actor?.role === 'admin') return true;
  if (actor?.role !== 'manager' || !hostel) return false;
  const managerIds = [hostel.managerId, hostel.assignedManagerId].filter(Boolean);
  if (managerIds.length) return Boolean(actor.id && managerIds.includes(actor.id));
  const email = normalizeEmail(actor.email);
  return Boolean(email && [hostel.managerEmail, hostel.email].map(normalizeEmail).includes(email));
}

export function hasActiveRoom(entry: any, roomKeys: any[]): boolean {
  const data = accountData(entry);
  const key = String(data?.roomKey || entry?.roomKey || '').toUpperCase();
  return Boolean(key && roomKeys.some(room => room.isAssigned && String(room.roomKey).toUpperCase() === key && normalizeEmail(room.assignedStudentEmail || room.studentEmail) === normalizeEmail(data.email || entry.email)));
}

/** Delete only the room identity and every cached link to it, preserving primary and market accounts. */
export function releaseRoom(store: any, room: any, userLists: any[][], newKey: string): number {
  const oldKey = String(room.roomKey).toUpperCase();
  let removed = 0;
  for (const users of new Set(userLists)) {
    for (let index = users.length - 1; index >= 0; index--) {
      const entry = users[index], data = accountData(entry);
      if (!data) continue;
      const key = String(data.roomKey || entry.roomKey || '').toUpperCase();
      if (key === oldKey && accountRole(entry) !== 'user') {
        users.splice(index, 1);
        removed++;
        continue;
      }
      for (const target of [entry, entry.user].filter(Boolean)) {
        if (target.registeredAccounts) {
          const accounts = target.registeredAccounts;
          accounts.residentRooms = (accounts.residentRooms || []).filter((r: any) => String(r.roomKey || r.id).toUpperCase() !== oldKey);
          if (String(accounts.residentAccount?.roomKey || accounts.residentAccount?.id || '').toUpperCase() === oldKey) accounts.residentAccount = accounts.residentRooms[0] || null;
        }
        if (String(target.roomKey || '').toUpperCase() === oldKey) {
          for (const field of ['roomKey', 'roomNumber', 'blockName', 'hostelId', 'hostelName', 'studentId', 'residentId']) delete target[field];
        }
      }
    }
  }
  // Old keys are never generated again, including after a restart.
  store.retiredRoomKeys = [...new Set([...(store.retiredRoomKeys || []), oldKey])];
  for (const field of Object.keys(room)) {
    if (/^(assigned|student|resident|parentUser|claimed|lastDispatched|password|plainPassword|token|merchantToken)/i.test(field)) delete room[field];
  }
  room.roomKey = newKey;
  room.isAssigned = false;
  room.isClaimed = false;
  room.status = 'Available';
  room.rotatedAt = new Date().toISOString();
  store.keyDispatches = (store.keyDispatches || []).filter((dispatch: any) => String(dispatch.roomKey).toUpperCase() !== oldKey);
  return removed;
}
