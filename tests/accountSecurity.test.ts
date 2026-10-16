import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {test} from 'node:test';
import {hashCredentialAsync,verifyCredentialAsync,normalizeEmail} from '../accountSecurity.js';
test('native secret hashes use independent salts and verify only the original secret',async()=>{
 const secret=crypto.randomBytes(32).toString('base64url');
 const first=await hashCredentialAsync(secret),second=await hashCredentialAsync(secret);
 assert.match(first,/^scrypt-sha256\$[a-f0-9]{32}\$[a-f0-9]{64}$/);assert.notEqual(first,second);
 assert.equal(await verifyCredentialAsync(secret,first),true);assert.equal(await verifyCredentialAsync(secret,second),true);
 assert.equal(await verifyCredentialAsync(first,first),false);assert.equal(await verifyCredentialAsync(secret+'wrong',first),false);
});
test('native secret verification rejects plaintext, unsalted digests and malformed storage',async()=>{
 const secret=crypto.randomBytes(24).toString('base64url'),digest=crypto.createHash('sha256').update(secret).digest('hex');
 for(const stored of [undefined,null,'','!LOCKED_RESET',secret,digest,'scrypt-sha256$bad$bad','scrypt-sha256$'+'a'.repeat(32)+'$bad'])assert.equal(await verifyCredentialAsync(secret,stored),false);
});
test('mailbox normalization trims and lowercases strings without coercing other input',()=>{
 assert.equal(normalizeEmail(' Name@Example.TEST '),'name@example.test');
 for(const value of [undefined,null,12,{},[]])assert.equal(normalizeEmail(value),'');
});
