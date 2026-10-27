import assert from 'node:assert/strict';
import {test} from 'node:test';
import {CompanionSubmission,companionSubmission,confirmedCompanionProviderRejection,releaseRejectedCompanionSubmission} from '../src/lib/companionSubmission.js';
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
const providerRejection={error:'Your companion is temporarily unavailable. Please try again later.',code:'companion_provider_403'};
test('a confirmed provider403 rejection releases only that prompt and permits a different question',()=>{
  const journal=companionSubmission('provider-rejection:1'),first=journal.begin('Tell me a fun fact');
  const rejection=confirmedCompanionProviderRejection(503,providerRejection);
  assert.ok(rejection);
  assert.equal(releaseRejectedCompanionSubmission('provider-rejection:1',journal,first.id,first.text,rejection),true);
  const next=journal.begin('How do I activate my room key?');
  assert.notEqual(next.id,first.id);
  assert.equal(next.text,'How do I activate my room key?');
});
test('unknown, malformed and ambiguous failures preserve the original retry identity',()=>{
  const journal=companionSubmission('ambiguous-failure:1'),first=journal.begin('Tell me a fun fact');
  for(const [status,response] of [
    [0,null],[503,null],[503,'not JSON'],[503,[]],[503,{}],
    [503,{code:'companion_provider_403'}],[503,{...providerRejection,error:''}],
    [503,{...providerRejection,error:'x'.repeat(501)}],
    [503,{...providerRejection,code:'companion_connection'}],
    [504,{...providerRejection,code:'companion_timeout'}],
    [409,providerRejection],[429,providerRejection],[403,providerRejection],
  ] as const){
    assert.equal(confirmedCompanionProviderRejection(status,response),undefined);
    assert.throws(()=>journal.begin('A different question'));
    assert.equal(journal.begin(first.text).id,first.id);
  }
});
test('a rejected response cannot release a different or newer logical request',()=>{
  const scope='late-rejection:1',journal=companionSubmission(scope),first=journal.begin('Tell me a fun fact');
  const rejection=confirmedCompanionProviderRejection(503,providerRejection)!;
  assert.equal(releaseRejectedCompanionSubmission(scope,journal,crypto.randomUUID(),first.text,rejection),false);
  assert.equal(releaseRejectedCompanionSubmission(scope,journal,first.id,'Different text',rejection),false);
  assert.equal(journal.receipt(first.id,first.text),true);
  const next=journal.begin(first.text);
  assert.equal(releaseRejectedCompanionSubmission(scope,journal,first.id,first.text,rejection),false);
  assert.equal(journal.unresolved?.id,next.id);
});
test('an old account or session rejection cannot clear the active journal',()=>{
  const firstScope='account-rejection-a:1',firstJournal=companionSubmission(firstScope),first=firstJournal.begin('Tell me a fun fact');
  const rejection=confirmedCompanionProviderRejection(503,providerRejection)!;
  const second=companionSubmission('account-rejection-b:1'),secondRequest=second.begin(first.text);
  assert.equal(releaseRejectedCompanionSubmission(firstScope,firstJournal,first.id,first.text,rejection),false);
  assert.equal(releaseRejectedCompanionSubmission('account-rejection-b:1',firstJournal,first.id,first.text,rejection),false);
  assert.equal(second.unresolved?.id,secondRequest.id);
  const nextSession=companionSubmission('account-rejection-a:2'),next=nextSession.begin(first.text);
  assert.equal(releaseRejectedCompanionSubmission(firstScope,firstJournal,first.id,first.text,rejection),false);
  assert.equal(nextSession.unresolved?.id,next.id);
});
