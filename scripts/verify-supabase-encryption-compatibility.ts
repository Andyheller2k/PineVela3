/** Execute the legacy business regression adapter using real enrolled local identities. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {readLocalFixture,runLocalSupabaseVerification,saveLocalFixture,signInLocalAccount} from './lib/local-supabase-harness.js';
import {recoverChatIdentity} from '../src/lib/marketEncryption.js';
import {encryptedMarketTestRequests} from './lib/encrypted-market-test.js';
import type {VerifiedActor} from '../supabase/db.js';
await runLocalSupabaseVerification(async h=>{
 const fixture=readLocalFixture<any>(h,'encrypted-chat-browser.json');assert.ok(fixture,'Actual encrypted API verification is required first');
 const buyer=await signInLocalAccount(h,fixture.buyer),seller=await signInLocalAccount(h,fixture.seller),identities=new Map();let checks=0;
 for(const [account,phrase] of [[buyer,fixture.buyerPhrase],[seller,fixture.sellerPhrase]]){const result=await account.session.request('/api/digital-market/encryption');assert.equal(result.status,200);identities.set(account.user.id,await recoverChatIdentity(account.user.id,phrase,result.data.publicIdentity,result.data.backup));checks++;}
 const row=(await h.db.pool.query(`select c.auth_user_id,c.kind,s.session_id from public.account_contexts c join private.account_sessions s on s.active_context_id=c.id join auth.sessions live on live.id=s.session_id where c.id=$1 order by live.created_at desc limit 1`,[buyer.user.id])).rows[0];
 const actor:VerifiedActor={contextId:buyer.user.id,authUserId:row.auth_user_id,sessionId:row.session_id,kind:row.kind};
 const encrypt=encryptedMarketTestRequests(identities),source={requestId:crypto.randomUUID(),sellerStoreId:fixture.storeId,productId:fixture.listingId,content:'Legacy business regression uses genuine ciphertext.'};
 const build=(body:any)=>h.db.authorizedRead(actor,['primary'],c=>encrypt(c,actor,body));
 const first=await build(source),repeated=await build(source);assert.deepEqual(first,repeated);checks++;
 assert.ok(!('content'in first)&&first.encrypted);checks++;
 const send=await buyer.session.json('/api/digital-market/messages',first);assert.equal(send.status,201);checks++;
 const retry=await buyer.session.json('/api/digital-market/messages',repeated);assert.equal(retry.status,201);assert.equal(retry.data.message.id,send.data.message.id);checks++;
 const changed=await build({...source,content:'Changed legacy retry'});assert.equal((await buyer.session.json('/api/digital-market/messages',changed)).status,409);checks++;
 assert.equal((await buyer.session.json('/api/digital-market/messages',{...await build({...source,requestId:crypto.randomUUID()}),senderId:seller.user.id})).status,400);checks++;
 const invalid=await build({...source,requestId:crypto.randomUUID(),content:''});assert.equal((await buyer.session.json('/api/digital-market/messages',invalid)).status,400);checks++;
 assert.equal((await buyer.session.json('/api/digital-market/messages',await build({...source,requestId:crypto.randomUUID(),sellerStoreId:crypto.randomUUID()}))).status,404);checks++;
 const result={passed:true,checks,actualNativeAuth:true,actualRegressionCiphertext:true,productionRecordsModified:0};saveLocalFixture(h,'encrypted-compatibility-result.json',result);console.log(JSON.stringify(result));
});
