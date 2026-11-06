import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {test} from 'node:test';
import {wrapResidentPassword,unwrapResidentPassword,recoverableResidentPassword,recoverResidentPassword} from '../supabase/residentPinCrypto.js';

test('PIN wrapping is authenticated, random and bound to the exact owner/enrollment',async()=>{
  const owner=crypto.randomUUID(),id=crypto.randomUUID(),secret=crypto.randomBytes(48).toString('base64url');
  const wrapped=await wrapResidentPassword(secret,'123456',id,owner),second=await wrapResidentPassword(secret,'123456',id,owner);
  assert.notDeepEqual(wrapped,second);assert(!JSON.stringify(wrapped).includes(secret));
  assert.equal(await unwrapResidentPassword(wrapped,'123456',id,owner),secret);
  for(const [pin,enrollment,subject] of [['123457',id,owner],['123456',crypto.randomUUID(),owner],['123456',id,crypto.randomUUID()]])
    await assert.rejects(unwrapResidentPassword(wrapped,pin,enrollment,subject));
  await assert.rejects(unwrapResidentPassword({...wrapped,tag:'0'.repeat(32)},'123456',id,owner));
  const rotated=await wrapResidentPassword(secret,'654321',id,owner);
  await assert.rejects(unwrapResidentPassword(rotated,'123456',id,owner));assert.equal(await unwrapResidentPassword(rotated,'654321',id,owner),secret);
});

test('primary recovery needs the private domain-separated key and correct owner binding',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'pv-room-key-test-')),file=path.join(root,'key'),before=process.env.MARKET_ORDER_PIN_KEY_FILE;
  const key=crypto.randomBytes(32),owner=crypto.randomUUID(),id=crypto.randomUUID(),secret=crypto.randomBytes(48).toString('base64url');
  fs.writeFileSync(file,key,{mode:0o600});process.env.MARKET_ORDER_PIN_KEY_FILE=file;
  try{
    const envelope=recoverableResidentPassword(secret,id,owner);
    assert(!JSON.stringify(envelope).includes(secret));assert.equal(recoverResidentPassword(envelope,id,owner),secret);
    assert.throws(()=>recoverResidentPassword(envelope,id,crypto.randomUUID()));
    assert.throws(()=>recoverResidentPassword(envelope,crypto.randomUUID(),owner));
    fs.writeFileSync(file,crypto.randomBytes(32));assert.throws(()=>recoverResidentPassword(envelope,id,owner));
    fs.writeFileSync(file,key);fs.chmodSync(file,0o644);assert.throws(()=>recoverResidentPassword(envelope,id,owner));
  }finally{if(before===undefined)delete process.env.MARKET_ORDER_PIN_KEY_FILE;else process.env.MARKET_ORDER_PIN_KEY_FILE=before;key.fill(0);fs.rmSync(root,{recursive:true,force:true});}
});
