import type { PoolClient } from 'pg';
import { ApiError,uuid,type VerifiedActor } from './db.js';
import { buyer } from './orders.js';
import { sellerStore } from './storeSetup.js';
import { validatePublicIdentity,parseKeyBackup,unbase64url,identityRegistrationData } from '../marketEncryptionProtocol.js';

function fields(body: any, allowed: string[]) { if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !allowed.includes(k))) throw new ApiError(400, 'Unsupported encryption fields.'); }
export async function ownEncryptionIdentity(c: PoolClient, a: VerifiedActor) {
  if (a.kind === 'primary') await buyer(c, a); else if (a.kind === 'seller') await sellerStore(c, a); else throw new ApiError(403, 'Buyer or seller account required.');
  const row = (await c.query('select public_identity,encrypted_backup from private.market_chat_keys where context_id=$1', [a.contextId])).rows[0];
  return { contextId: a.contextId, publicIdentity: row?.public_identity || null, backup: row?.encrypted_backup || null };
}
export async function registerEncryptionIdentity(c: PoolClient, a: VerifiedActor, body: any) {
  fields(body, ['publicIdentity', 'backup', 'proof']); await ownEncryptionIdentity(c, a);
  let identity, backup;
  try { identity = await validatePublicIdentity(body.publicIdentity); backup = parseKeyBackup(body.backup);
    if (typeof body.proof !== 'string' || unbase64url(body.proof).length !== 64) throw Error();
    const verification = await crypto.subtle.importKey('raw', unbase64url(identity.signingKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    if (!await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, verification, unbase64url(body.proof), identityRegistrationData(a.contextId, identity, backup))) throw Error();
  } catch { throw new ApiError(400, 'The encryption identity or signed recovery backup is invalid.'); }
  await c.query('select pg_advisory_xact_lock(hashtextextended($1,0))', ['market-chat-key:' + a.contextId]);
  const old = (await c.query('select public_identity,encrypted_backup from private.market_chat_keys where context_id=$1', [a.contextId])).rows[0];
  if (old) {
    if (old.public_identity.fingerprint !== identity.fingerprint || old.encrypted_backup.iv !== backup.iv || old.encrypted_backup.ciphertext !== backup.ciphertext) throw new ApiError(409, 'Encryption is already enabled. Restore it with your original private recovery phrase.');
    return { success: true, idempotent: true, contextId: a.contextId, publicIdentity: identity };
  }
  await c.query('insert into private.market_chat_keys(context_id,public_identity,encrypted_backup) values($1,$2,$3)', [a.contextId, JSON.stringify(identity), JSON.stringify(backup)]);
  await c.query("insert into private.audit_events(actor_context_id,event_type,resource_type,resource_id) values($1,'market_chat_encryption_enabled','market_chat_identity',$1)", [a.contextId]);
  return { success: true, idempotent: false, contextId: a.contextId, publicIdentity: identity };
}
/** Public keys are shared only with an eligible buyer or an actual saved buyer inquiry/order. */
export async function peerEncryptionIdentity(c: PoolClient, a: VerifiedActor, body: any) {
  fields(body, ['sellerStoreId', 'buyerId']);
  const selector = body.sellerStoreId === undefined ? null : uuid(body.sellerStoreId), buyerSelector = body.buyerId === undefined ? null : uuid(body.buyerId);
  let store: any, buyerId: string;
  if (a.kind === 'primary') {
    await buyer(c, a); if (buyerSelector) throw new ApiError(400, 'Buyer identity is derived from your session.');
    if (!selector) throw new ApiError(400, 'Select a store.');
    store = (await c.query('select * from public.stores where id=$1', [selector])).rows[0]; buyerId = a.contextId;
    if (!store || store.primary_owner_id === a.authUserId) throw new ApiError(404, 'Conversation not found.');
    const related = (await c.query('select 1 from public.market_messages where store_id=$1 and buyer_context_id=$2 union all select 1 from public.market_orders where store_id=$1 and buyer_context_id=$2 limit 1', [store.id, buyerId])).rowCount;
    if (!related && !(await c.query('select private.store_is_public($1) as allowed', [store.id])).rows[0].allowed) throw new ApiError(404, 'This store is unavailable for inquiries.');
  } else if (a.kind === 'seller') {
    store = await sellerStore(c, a); buyerId = buyerSelector;
    if (!buyerId || selector && store.id !== selector || !(await c.query('select 1 from public.market_messages where store_id=$1 and buyer_context_id=$2 union all select 1 from public.market_orders where store_id=$1 and buyer_context_id=$2 limit 1', [store.id, buyerId])).rowCount) throw new ApiError(404, 'Reply to an existing buyer inquiry or order.');
  } else throw new ApiError(403, 'Buyer or seller account required.');
  const recipientId = a.kind === 'primary' ? store.seller_context_id : buyerId;
  const identity = (await c.query('select public_identity from private.market_chat_keys where context_id=$1', [recipientId])).rows[0]?.public_identity || null;
  return { buyerId, storeId: store.id, recipientId, publicIdentity: identity };
}
