import { isDisabledLegacyCredential } from './legacyCredentialPolicy.js';
import { credentialValues, hashCredential, normalizeEmail, protectStoredCredentials, verifyCredential } from './accountSecurity.js';

export const CREDENTIAL_EXPOSURE_VERSION = 1;
const PASSWORD_FIELDS = ['password', 'plainPassword', 'localPassword', 'userPropPassword'];
const SESSION_FIELDS = ['token', 'merchantToken', 'sessionToken', 'session'];
const LOCKED_PASSWORD = '!LOCKED_GIT_EXPOSURE_RESET_REQUIRED';

/** One-time containment for databases previously distributed in source control. */
export function revokeExposedCredentials(store: any) {
  const result = { changed: false, lockedRecords: 0, revokedSessions: 0 };
  if (store.credentialExposureVersion >= CREDENTIAL_EXPOSURE_VERSION) return result;
  const seen = new Set<object>();
  const visit = (value: any) => {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (!Array.isArray(value)) {
      const passwords = PASSWORD_FIELDS.map(field => value[field]).filter(p => typeof p === 'string' && p && !p.startsWith('!LOCKED_'));
      if (passwords.length) {
        // Retain only protected history so recovery cannot reuse a compromised password.
        value.passwordHistory = [...new Set([...(value.passwordHistory || []), ...passwords])];
        value.password = LOCKED_PASSWORD;
        value.requiresPasswordReset = true;
        result.lockedRecords++;
      }
      for (const field of PASSWORD_FIELDS.slice(1)) delete value[field];
      for (const field of SESSION_FIELDS) {
        if (value[field]) result.revokedSessions++;
        delete value[field];
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(store);
  protectStoredCredentials(store);
  store.credentialExposureVersion = CREDENTIAL_EXPOSURE_VERSION;
  store.credentialsRevokedAt = new Date().toISOString();
  result.changed = true;
  return result;
}

/** Offline recovery requires filesystem access; it never creates or elevates an account. */
export function recoverAccountPassword(store: any, identifier: string, role: string, password: string): number {
  if (store.credentialExposureVersion !== CREDENTIAL_EXPOSURE_VERSION) throw new Error('Run credential containment before recovering an account.');
  if (isDisabledLegacyCredential(password)) throw new Error('This legacy password is disabled. Choose a fresh, unique password.');
  if (password.length < 12 || password.length > 1024 || /^[a-f0-9]{64}$/i.test(password) || password.startsWith('scrypt-sha256$') || password.startsWith('!LOCKED_')) {
    throw new Error('Choose a fresh password of 12–1024 characters, not a stored hash.');
  }
  const matches = (entry: any) => {
    const data = entry.user || entry;
    return normalizeEmail(data.email || entry.email || entry.studentEmail) === normalizeEmail(identifier) || String(data.id || entry.id) === identifier;
  };
  const records = (store.users || []).filter((entry: any) => String(entry.user?.role || entry.role).toLowerCase() === role && matches(entry));
  if (role === 'merchant') records.push(...[...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || [])].filter(matches));
  if (role === 'verification_team') records.push(...(store.verificationTeams || []).filter(matches));
  if (!records.length) throw new Error('No existing account matches this identifier and role.');
  const related = [...(store.users || []), ...(store.digitalMarketApplications || []), ...(store.digitalMarketStores || []), ...(store.verificationTeams || [])].filter(matches);
  if (related.some((entry: any) => credentialValues(entry).some(value => verifyCredential(password, value)))) {
    throw new Error('This password was already used by this account or another account with this identifier. Choose a new password.');
  }
  const hash = hashCredential(password);
  for (const record of records) {
    for (const target of [record, record.user].filter(Boolean)) {
      const previous = credentialValues(target);
      target.passwordHistory = [...new Set([...(target.passwordHistory || []), ...previous])];
      target.password = hash;
      target.requiresPasswordReset = false;
      for (const field of PASSWORD_FIELDS.slice(1)) delete target[field];
      for (const field of SESSION_FIELDS) delete target[field];
    }
  }
  protectStoredCredentials(store);
  return records.length;
}
