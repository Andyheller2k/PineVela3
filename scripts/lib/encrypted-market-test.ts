/** Actual cryptography for legacy isolated business regression scripts.
 * Callers enroll these keys through the real registration implementation/API. */
import type {PoolClient} from 'pg';
import {ApiError,UUID,type VerifiedActor} from '../../supabase/db.js';
import {encryptMarketMessage,type UnlockedChatIdentity} from '../../marketEncryptionProtocol.js';
export function encryptedMarketTestRequests(identities:Map<string,UnlockedChatIdentity>){
 const requests=new Map<string,any>();
 return async(c:PoolClient,a:VerifiedActor,body:any)=>{
  // Invalid legacy/plaintext input remains a direct negative API test.
  if(typeof body?.content!=='string'||!body.content.trim()||body.content.length>5000||!UUID.test(body.requestId||''))return body;
  const cache=JSON.stringify([a.contextId,body]);if(requests.has(cache))return requests.get(cache);
  const o=body.orderId&&UUID.test(body.orderId)?(await c.query('select store_id,buyer_context_id from public.market_orders where id=$1',[body.orderId])).rows[0]:null;
  const l=body.productId&&UUID.test(body.productId)?(await c.query('select store_id from public.listings where id=$1',[body.productId])).rows[0]:null;
  const store=(await c.query(a.kind==='seller'?'select * from public.stores where seller_context_id=$1':'select * from public.stores where id=$1',[a.kind==='seller'?a.contextId:o?.store_id||l?.store_id||body.sellerStoreId])).rows[0];
  if(!store)throw new ApiError(404,'Conversation not found.');
  const buyerId=a.kind==='primary'?a.contextId:o?.buyer_context_id||body.buyerId,recipientId=a.kind==='primary'?store.seller_context_id:buyerId;
  const sender=identities.get(a.contextId),recipient=identities.get(recipientId);if(!sender||!recipient)throw Error('Enroll actual participant encryption identities before this isolated business regression.');
  const encrypted=await encryptMarketMessage(sender,recipient.publicIdentity,{requestId:body.requestId,buyerId,storeId:store.id,senderId:a.contextId,recipientId},body.content);
  const {content,...selectors}=body,result={...selectors,encrypted};requests.set(cache,result);return result;
 };
}
