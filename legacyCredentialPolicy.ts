import crypto from 'node:crypto';

export const KNOWN_LEGACY_PASSWORDS = new Set([
  '1782@HellerPine',
  'admin123',
  'HellerPine2k@'
]);
export const KNOWN_LEGACY_HASHES = new Set([
  'bcfcff2f3e5bd8bef762d480c8a8bc4f7da3af64cd059a5da1df0407bc7499f1', // sha256('1782@HellerPine')
  '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // sha256('admin123')
  '4e9dfd0fa367d264f3fb8f15dcf40e947171e5491136b856e408ec2367469a47', // sha256('HellerPine2k@')
]);

/** Shared denylist check for login and offline credential recovery. */
export function isDisabledLegacyCredential(password: string): boolean {
  return KNOWN_LEGACY_PASSWORDS.has(password) || KNOWN_LEGACY_HASHES.has(crypto.createHash('sha256').update(password).digest('hex'));
}
