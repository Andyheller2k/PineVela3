import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CompanionSubmission,companionSubmission} from '../src/lib/companionSubmission.js';
test('an ambiguous retry preserves its request identity until a matching receipt',()=>{
  const journal=new CompanionSubmission(),first=journal.begin('How does buying work?');
  assert.equal(journal.begin(' How does buying work? ').id,first.id);
  assert.throws(()=>journal.begin('Check my submissions'));
  assert.equal(journal.receipt(crypto.randomUUID(),first.text),false);
  assert.equal(journal.receipt(first.id,'A different question'),false);
  assert.equal(journal.begin(first.text).id,first.id);
  assert.equal(journal.receipt(first.id,first.text),true);
  assert.notEqual(journal.begin(first.text).id,first.id);
});
test('remounts preserve a pending send; account/session changes cannot reuse it',()=>{
  const first=companionSubmission('account-a:1'),request=first.begin('How does buying work?');
  assert.equal(companionSubmission('account-a:1').begin(request.text).id,request.id);
  assert.equal(companionSubmission('account-b:1').unresolved,undefined);
  assert.equal(companionSubmission('account-a:2').unresolved,undefined);
});
