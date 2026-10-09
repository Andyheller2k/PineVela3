import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePublicContinuation } from '../publicContinuation';
import { filterResidences, residenceImages } from '../src/lib/residenceCatalog';

test('post-login selection accepts only one catalog action and rejects redirect or role manipulation', () => {
  assert.equal(validatePublicContinuation('/user/dashboard?residence=real-id&residenceAction=activate'), '/user/dashboard?residence=real-id&residenceAction=activate');
  assert.equal(validatePublicContinuation('/user/dashboard?residence=real-id'), '/user/dashboard?residence=real-id&residenceAction=view');
  assert.equal(validatePublicContinuation('/user/dashboard?marketItem=real-id&marketPrice=001'), '/user/dashboard?marketItem=real-id&marketPrice=1');
  assert.equal(validatePublicContinuation('/user/dashboard?marketStore=store-id&storeAction=message'), '/user/dashboard?marketStore=store-id&storeAction=message');
  assert.equal(validatePublicContinuation('/user/dashboard?marketStore=store-id&storeAction=edit'), undefined);
  assert.equal(validatePublicContinuation('/user/dashboard?marketStore=store-id&marketItem=other'), undefined);
  for (const value of [null, [], 'https://evil.example', '//evil.example', '/admin/dashboard', '/user/dashboard', '/user/dashboard?residence=', '/user/dashboard?residence=x&residence=x', '/user/dashboard?residence=x&marketItem=y', '/user/dashboard?residence=x&userId=other', '/user/dashboard?marketItem=x&marketPrice=-1', '/user/dashboard?residence=x&residenceAction=delete', '/user/dashboard?residence=x#admin', '/user/dashboard?residence=%0d%0aLocation%3Aevil']) assert.equal(validatePublicContinuation(value), undefined, String(value));
});

test('catalog shows only approved active residences and only their own uploaded images', () => {
  const approved = { id: 'approved', name: 'Registered residence', isApproved: true, image: '/uploads/own.webp', gallery: ['/uploads/own.webp', '/uploads/interior.webp'] };
  assert.deepEqual(residenceImages(approved), ['/uploads/own.webp', '/uploads/interior.webp']);
  assert.deepEqual(residenceImages({ id: 'empty', name: 'No photos' }), []);
  assert.deepEqual(filterResidences([approved, { ...approved, id: 'deleted', isDeleted: true }, { id: 'pending', name: 'Pending registration' }], ''), [approved]);
  assert.deepEqual(filterResidences([approved], 'registered'), [approved]);
});
