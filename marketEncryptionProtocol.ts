/** Versioned, interoperable Web Crypto protocol. No private identity keys leave a client. */
export const MARKET_ENCRYPTION_ALGORITHM = 'PV-E2EE-P256-A256GCM-v1' as const;
export interface ChatPublicIdentity { v: 1; agreementKey: string; signingKey: string; fingerprint: string }
export interface ChatKeyBackup { v: 1; iv: string; ciphertext: string }
export interface MessageBinding { requestId: string; buyerId: string; storeId: string; senderId: string; recipientId: string }
export interface ChatKeyBox { recipientId: string; ephemeral: string; salt: string; iv: string; ciphertext: string }
export interface EncryptedMarketMessage { v: 1; algorithm: typeof MARKET_ENCRYPTION_ALGORITHM; senderKey: string; recipientKey: string; iv: string; ciphertext: string; boxes: ChatKeyBox[]; signature: string }
export interface UnlockedChatIdentity { contextId: string; publicIdentity: ChatPublicIdentity; agreement: CryptoKey; signing: CryptoKey }
const encoder = new TextEncoder();
export const utf8 = (text: string) => encoder.encode(text);
export function base64url(bytes: ArrayBuffer | Uint8Array): string { return btoa(String.fromCharCode(...new Uint8Array(bytes instanceof Uint8Array ? bytes : bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function unbase64url(value: string): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encrypted data.');
  const result = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)), c => c.charCodeAt(0));
  if (base64url(result) !== value) throw new Error('Noncanonical encrypted data.');
  return result;
}
function record(value: unknown, keys: string[]): asserts value is Record<string, any> { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length || Object.keys(value).some(k => !keys.includes(k))) throw new Error('Unsupported encryption format.'); }
function bytes(value: unknown, length?: number, max = length): string { if (typeof value !== 'string' || value.length > Math.ceil((max || 32768) * 4 / 3) + 2) throw new Error('Invalid encrypted data.'); const decoded = unbase64url(value); if (length !== undefined && decoded.length !== length || max !== undefined && decoded.length > max) throw new Error('Invalid encrypted data length.'); return value; }
function context(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) throw new Error('Invalid encrypted message identity.'); return value; }
function fingerprint(value: unknown): string { if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid key fingerprint.'); return value; }
export function parsePublicIdentity(value: unknown): ChatPublicIdentity { record(value, ['v', 'agreementKey', 'signingKey', 'fingerprint']); if (value.v !== 1) throw new Error('Unsupported encryption version.'); return { v: 1, agreementKey: bytes(value.agreementKey, 65), signingKey: bytes(value.signingKey, 65), fingerprint: fingerprint(value.fingerprint) }; }
export function parseKeyBackup(value: unknown): ChatKeyBackup { record(value, ['v', 'iv', 'ciphertext']); if (value.v !== 1) throw new Error('Unsupported backup version.'); return { v: 1, iv: bytes(value.iv, 12), ciphertext: bytes(value.ciphertext, undefined, 4096) }; }
export function parseEncryptedMessage(value: unknown): EncryptedMarketMessage {
  record(value, ['v', 'algorithm', 'senderKey', 'recipientKey', 'iv', 'ciphertext', 'boxes', 'signature']);
  if (value.v !== 1 || value.algorithm !== MARKET_ENCRYPTION_ALGORITHM || !Array.isArray(value.boxes) || value.boxes.length !== 2) throw new Error('Unsupported encryption format.');
  const boxes = value.boxes.map((box: unknown) => { record(box, ['recipientId', 'ephemeral', 'salt', 'iv', 'ciphertext']); return { recipientId: context(box.recipientId), ephemeral: bytes(box.ephemeral, 65), salt: bytes(box.salt, 32), iv: bytes(box.iv, 12), ciphertext: bytes(box.ciphertext, 48) }; });
  if (boxes[0].recipientId === boxes[1].recipientId) throw new Error('Two distinct conversation participants are required.');
  return { v: 1, algorithm: MARKET_ENCRYPTION_ALGORITHM, senderKey: fingerprint(value.senderKey), recipientKey: fingerprint(value.recipientKey), iv: bytes(value.iv, 12), ciphertext: bytes(value.ciphertext, undefined, 20016), boxes, signature: bytes(value.signature, 64) };
}
export function messageAdditionalData(binding: MessageBinding, encrypted: Pick<EncryptedMarketMessage, 'senderKey' | 'recipientKey'>): Uint8Array<ArrayBuffer> { return utf8(JSON.stringify([MARKET_ENCRYPTION_ALGORITHM, ...['requestId', 'buyerId', 'storeId', 'senderId', 'recipientId'].map(k => context(binding[k as keyof MessageBinding])), fingerprint(encrypted.senderKey), fingerprint(encrypted.recipientKey)])); }
function signedData(binding: MessageBinding, encrypted: Omit<EncryptedMarketMessage, 'signature'>): Uint8Array<ArrayBuffer> { return utf8(JSON.stringify([base64url(messageAdditionalData(binding, encrypted)), encrypted.v, encrypted.algorithm, encrypted.iv, encrypted.ciphertext, encrypted.boxes.map(b => [b.recipientId, b.ephemeral, b.salt, b.iv, b.ciphertext])])); }
export async function identityFingerprint(identity: Pick<ChatPublicIdentity, 'agreementKey' | 'signingKey'>): Promise<string> { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(JSON.stringify([MARKET_ENCRYPTION_ALGORITHM, identity.agreementKey, identity.signingKey]))))].map(n => n.toString(16).padStart(2, '0')).join(''); }
export async function validatePublicIdentity(value: unknown): Promise<ChatPublicIdentity> { const identity = parsePublicIdentity(value); if (identity.fingerprint !== await identityFingerprint(identity)) throw new Error('The encryption fingerprint does not match its keys.'); await Promise.all([crypto.subtle.importKey('raw', unbase64url(identity.agreementKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []), crypto.subtle.importKey('raw', unbase64url(identity.signingKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])]); return identity; }
export async function verifyEncryptedMessage(binding: MessageBinding, raw: unknown, sender: ChatPublicIdentity, recipient: ChatPublicIdentity): Promise<EncryptedMarketMessage> {
  await Promise.all([validatePublicIdentity(sender),validatePublicIdentity(recipient)]);
  const encrypted = parseEncryptedMessage(raw);
  if (encrypted.senderKey !== sender.fingerprint || encrypted.recipientKey !== recipient.fingerprint || encrypted.boxes[0].recipientId !== binding.senderId || encrypted.boxes[1].recipientId !== binding.recipientId) throw new Error('The message encryption keys do not match this conversation.');
  const key = await crypto.subtle.importKey('raw', unbase64url(sender.signingKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, unbase64url(encrypted.signature), signedData(binding, encrypted))) throw new Error('The encrypted message signature is invalid.');
  return encrypted;
}
async function wrappingKey(privateKey: CryptoKey, publicKey: string, salt: string, aad: Uint8Array<ArrayBuffer>, recipientId: string) {
  const peer = await crypto.subtle.importKey('raw', unbase64url(publicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: peer }, privateKey, 256));
  try { const input = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']); return await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: unbase64url(salt), info: utf8(JSON.stringify(['PineVela message key', base64url(aad), recipientId])) }, input, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']); } finally { shared.fill(0); }
}
export async function encryptMarketMessage(identity: UnlockedChatIdentity, recipient: ChatPublicIdentity, binding: MessageBinding, content: string): Promise<EncryptedMarketMessage> {
  if (binding.senderId !== identity.contextId || !content.trim() || content.length > 5000) throw new Error('Enter a message of 1–5000 characters.');
  await validatePublicIdentity(recipient);
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  try {
    const encrypted: EncryptedMarketMessage = { v: 1, algorithm: MARKET_ENCRYPTION_ALGORITHM, senderKey: identity.publicIdentity.fingerprint, recipientKey: recipient.fingerprint, iv: base64url(crypto.getRandomValues(new Uint8Array(12))), ciphertext: '', boxes: [], signature: '' };
    const aad = messageAdditionalData(binding, encrypted), key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['encrypt']);
    encrypted.ciphertext = base64url(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: unbase64url(encrypted.iv), additionalData: aad, tagLength: 128 }, key, utf8(content.trim())));
    for (const [recipientId, publicIdentity] of [[binding.senderId, identity.publicIdentity], [binding.recipientId, recipient]] as const) {
      const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const box: ChatKeyBox = { recipientId, ephemeral: base64url(await crypto.subtle.exportKey('raw', ephemeral.publicKey)), salt: base64url(crypto.getRandomValues(new Uint8Array(32))), iv: base64url(crypto.getRandomValues(new Uint8Array(12))), ciphertext: '' };
      const wrapping = await wrappingKey(ephemeral.privateKey, publicIdentity.agreementKey, box.salt, aad, recipientId);
      box.ciphertext = base64url(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: unbase64url(box.iv), additionalData: aad, tagLength: 128 }, wrapping, keyBytes));
      encrypted.boxes.push(box);
    }
    encrypted.signature = base64url(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identity.signing, signedData(binding, encrypted)));
    return encrypted;
  } finally { keyBytes.fill(0); }
}
export async function decryptMarketMessage(identity: UnlockedChatIdentity, binding: MessageBinding, raw: unknown, sender: ChatPublicIdentity, recipient: ChatPublicIdentity, discloseKey = false): Promise<{ content: string; key?: string }> {
  if (![binding.senderId, binding.recipientId].includes(identity.contextId)) throw new Error('This encrypted message belongs to another account.');
  const encrypted = await verifyEncryptedMessage(binding, raw, sender, recipient), box = encrypted.boxes.find(b => b.recipientId === identity.contextId)!;
  const own = identity.contextId === binding.senderId ? sender : recipient;
  if (own.fingerprint !== identity.publicIdentity.fingerprint) throw new Error('Restore the original encryption identity for this account.');
  const aad = messageAdditionalData(binding, encrypted), wrapping = await wrappingKey(identity.agreement, box.ephemeral, box.salt, aad, identity.contextId);
  const keyBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(box.iv), additionalData: aad, tagLength: 128 }, wrapping, unbase64url(box.ciphertext)));
  try { const content = await decryptWithMessageKey(binding, encrypted, keyBytes); return { content, ...(discloseKey ? { key: base64url(keyBytes) } : {}) }; } finally { keyBytes.fill(0); }
}
async function decryptWithMessageKey(binding: MessageBinding, encrypted: EncryptedMarketMessage, keyBytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, 'AES-GCM', false, ['decrypt']);
  const content = new TextDecoder('utf-8', { fatal: true }).decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unbase64url(encrypted.iv), additionalData: messageAdditionalData(binding, encrypted), tagLength: 128 }, key, unbase64url(encrypted.ciphertext)));
  if (!content.trim() || content.length > 5000) throw new Error('Invalid encrypted message length.'); return content;
}
/** Moderation may decrypt ONLY the exact stored message explicitly disclosed by a participant. */
export async function decryptReportedMessage(row: any, disclosedKey: string): Promise<string> {
  if (row.encryption_version !== 1 || !row.encrypted_payload) throw new Error('This message is not encrypted.');
  const key = unbase64url(bytes(disclosedKey, 32));
  try { return await decryptWithMessageKey({ requestId: row.request_id, buyerId: row.buyer_context_id, storeId: row.store_id, senderId: row.sender_context_id, recipientId: row.recipient_context_id }, parseEncryptedMessage(row.encrypted_payload), key); } finally { key.fill(0); }
}
export function identityRegistrationData(contextId: string, identity: ChatPublicIdentity, backup: ChatKeyBackup): Uint8Array<ArrayBuffer> { return utf8(JSON.stringify(['PineVela encryption identity v1', context(contextId), identity.agreementKey, identity.signingKey, identity.fingerprint, backup.v, backup.iv, backup.ciphertext])); }
