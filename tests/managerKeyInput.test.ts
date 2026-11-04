import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeManagerKeyInput } from '../src/lib/managerKeyInput';

test('a pasted issued key keeps its exact URL-safe value', () => {
  const issued = Buffer.alloc(32, 1).toString('base64url');
  assert.equal(issued.length, 43);
  assert.equal(normalizeManagerKeyInput(` ${issued} `), issued);
});

test('invalid or Unicode manager keys fail before Headers.set', () => {
  for (const value of ['wrong', '🔑'.repeat(43), 'x'.repeat(42) + '\n' + 'y', 'x'.repeat(44)]) {
    assert.throws(() => normalizeManagerKeyInput(value), /Invalid manager secret key/);
  }
});

test('six-digit manager codes survive normalization without weakening legacy validation', () => {
  assert.equal(normalizeManagerKeyInput(' 123456 '),'123456');
  for(const value of ['12345','1234567','12 3456','１２３４５６','12345\n6','ABC123'])
    assert.throws(()=>normalizeManagerKeyInput(value),/Invalid manager secret key/);
});
