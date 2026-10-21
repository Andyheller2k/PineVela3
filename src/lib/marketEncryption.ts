import { base64url,unbase64url,utf8,identityFingerprint,identityRegistrationData,validatePublicIdentity,parseKeyBackup,type ChatKeyBackup,type ChatPublicIdentity,type UnlockedChatIdentity } from '../../marketEncryptionProtocol';

/** Memory only. Neither the recovery phrase, private keys nor plaintext is persisted. */
const vault = new Map<string, UnlockedChatIdentity>();
let vaultGeneration=0;
export function marketEncryptionGeneration():number{return vaultGeneration;}
export function clearMarketEncryptionVault(): void { vaultGeneration++;vault.clear(); if (typeof window !== 'undefined') window.dispatchEvent(new Event('pinevela-chat-locked')); }
export function lockedChatIdentity(contextId: string): UnlockedChatIdentity | undefined { return vault.get(contextId); }
export function lockMarketEncryption(): void { clearMarketEncryptionVault(); }
export function rememberUnlockedIdentity(identity: UnlockedChatIdentity): void { vault.set(identity.contextId, identity); }
export function recoveryPhrase(): string { return 'pv1 ' + [...crypto.getRandomValues(new Uint8Array(32))].map(n => n.toString(16).padStart(2, '0')).join('').match(/.{4}/g)!.join(' '); }
function phraseBytes(phrase: string) { const normalized = phrase.toLowerCase().trim().replace(/^pv1\s+/, '').replace(/[\s-]/g, ''); if (!/^[0-9a-f]{64}$/.test(normalized)) throw new Error('Enter your complete private recovery phrase: pv1 followed by 16 groups.'); return Uint8Array.from(normalized.match(/.{2}/g)!, n => parseInt(n, 16)); }
async function backupKey(phrase: string, contextId: string, identity: ChatPublicIdentity) { const material = phraseBytes(phrase); try { const input = await crypto.subtle.importKey('raw', material, 'HKDF', false, ['deriveKey']); return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: Uint8Array.from(identity.fingerprint.match(/.{2}/g)!, n => parseInt(n, 16)), info: utf8(JSON.stringify(['PineVela private chat recovery v1', contextId])) }, input, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); } finally { material.fill(0); } }
function backupAad(contextId: string, identity: ChatPublicIdentity) { return utf8(JSON.stringify(['PineVela encrypted private identity v1', contextId, identity.fingerprint])); }
export async function createChatIdentity(contextId: string, phrase: string): Promise<{ publicIdentity: ChatPublicIdentity; backup: ChatKeyBackup; proof: string; identity: UnlockedChatIdentity }> {
  if (!crypto?.subtle) throw new Error('Encrypted messages require HTTPS or localhost and a browser with Web Crypto.');
  const [agreement, signing] = await Promise.all([crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])]);
  const publicIdentity: ChatPublicIdentity = { v: 1, agreementKey: base64url(await crypto.subtle.exportKey('raw', agreement.publicKey)), signingKey: base64url(await crypto.subtle.exportKey('raw', signing.publicKey)), fingerprint: '' };
  publicIdentity.fingerprint = await identityFingerprint(publicIdentity);
  const privateData = { contextId, agreement: await crypto.subtle.exportKey('jwk', agreement.privateKey), signing: await crypto.subtle.exportKey('jwk', signing.privateKey) }, plain = utf8(JSON.stringify(privateData));
  try {
    const key = await backupKey(phrase, contextId, publicIdentity), iv = crypto.getRandomValues(new Uint8Array(12));
    const backup: ChatKeyBackup = { v: 1, iv: base64url(iv), ciphertext: base64url(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: backupAad(contextId, publicIdentity), tagLength: 128 }, key, plain)) };
    const proof = base64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing.privateKey, identityRegistrationData(contextId, publicIdentity, backup)));
    const identity = await importIdentity(contextId, publicIdentity, privateData);
    return { publicIdentity, backup, proof, identity };
  } finally { plain.fill(0); privateData.agreement.d = ''; privateData.signing.d = ''; }
}
async function importIdentity(contextId: string, publicIdentity: ChatPublicIdentity, data: any): Promise<UnlockedChatIdentity> {
  if (data?.contextId !== contextId) throw new Error('This recovery phrase belongs to another account.');
  for (const [jwk, raw] of [[data.agreement, publicIdentity.agreementKey], [data.signing, publicIdentity.signingKey]]) {
    if (!jwk || jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d || !jwk.x || !jwk.y || base64url(new Uint8Array([4, ...unbase64url(jwk.x), ...unbase64url(jwk.y)])) !== raw) throw new Error('The recovered private keys do not match this account.');
  }
  const [agreement, signing] = await Promise.all([crypto.subtle.importKey('jwk', data.agreement, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']), crypto.subtle.importKey('jwk', data.signing, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])]);
  const proof = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signing, utf8(contextId));
  const verify = await crypto.subtle.importKey('raw', unbase64url(publicIdentity.signingKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verify, proof, utf8(contextId))) throw new Error('The recovered signing identity is invalid.');
  return { contextId, publicIdentity, agreement, signing };
}
export async function recoverChatIdentity(contextId: string, phrase: string, rawIdentity: unknown, rawBackup: unknown): Promise<UnlockedChatIdentity> {
  const identity = await validatePublicIdentity(rawIdentity), backup = parseKeyBackup(rawBackup), key = await backupKey(phrase, contextId, identity);
  let plain: Uint8Array<ArrayBuffer> | undefined;
  try { plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(backup.iv), additionalData: backupAad(contextId, identity), tagLength: 128 }, key, unbase64url(backup.ciphertext))); const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain)); try { return await importIdentity(contextId, identity, data); } finally { if (data.agreement) data.agreement.d = ''; if (data.signing) data.signing.d = ''; } }
  catch { throw new Error('This recovery phrase could not unlock this account. Check every group and try again.'); }
  finally { plain?.fill(0); }
}
/** Public fingerprints only; the private keys and phrase never enter localStorage. */
export function pinChatFingerprint(ownerContextId: string, peerContextId: string, fingerprint: string): void { const key = `pinevela_chat_fingerprint_v1:${ownerContextId}:${peerContextId}`, saved = localStorage.getItem(key); if (saved && saved !== fingerprint) throw new Error('This account’s encryption fingerprint changed. Sending is blocked. Compare the fingerprint with your contact through another trusted channel.'); localStorage.setItem(key, fingerprint); }
export const readableFingerprint = (fingerprint: string) => fingerprint.match(/.{1,4}/g)?.join(' ') || fingerprint;
