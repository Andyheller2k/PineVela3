/** Signup policy checks only; no provider, accounts, email or database access. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { signupPasswordError } from '../signupPassword.js';

const policyMessage = 'Use at least 8 characters, including uppercase and lowercase letters, a number and a symbol.';

test('signup requires every character class even when the password is long enough', () => {
  for (const password of ['lowercase1!', 'UPPERCASE1!', 'NoDigitsHere!', 'NoSymbols123'])
    assert.equal(signupPasswordError(password), policyMessage);
  assert.equal(signupPasswordError('GoodPassword1!'), undefined);
});

test('signup accepts the minimum and maximum length boundaries and rejects adjacent lengths', () => {
  assert.equal(typeof signupPasswordError('Aa1!aaa'), 'string');
  assert.equal(signupPasswordError('Aa1!aaaa'), undefined);
  assert.equal(signupPasswordError('Aa1!' + 'a'.repeat(252)), undefined);
  assert.equal(typeof signupPasswordError('Aa1!' + 'a'.repeat(253)), 'string');
  assert.equal(typeof signupPasswordError(''), 'string');
});

test('every symbol allowed by the hosted Auth policy satisfies the symbol requirement', () => {
  const symbols = ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '_', '+', '-', '=',
    '[', ']', '{', '}', ';', "'", ':', '"', '\\', '|', '<', '>', '?', ',', '.', '/', '`', '~'];
  for (const symbol of symbols)
    assert.equal(signupPasswordError('GoodPass1' + symbol), undefined, `The provider accepts symbol ${symbol}`);
});

test('spaces, other whitespace, Unicode punctuation and emoji cannot satisfy the symbol requirement', () => {
  for (const value of [' ', '\t', '\n', '\u00a0', '£', '€', '—', '😀'])
    assert.equal(signupPasswordError('GoodPass1' + value), policyMessage);
});

test('required letters and numbers use the provider ASCII classes', () => {
  for (const password of ['lowercaseÉ1!', 'UPPERCASEé1!', 'GoodPassword١!', 'GoodPassword１!'])
    assert.equal(signupPasswordError(password), policyMessage);
  assert.equal(signupPasswordError('GoodPassword1!😀'), undefined,
    'Extra Unicode characters do not replace or invalidate satisfied ASCII requirements');
});

test('non-string signup passwords fail safely without coercion or exceptions', () => {
  for (const value of [undefined, null, 123, true, {}, [], ['GoodPassword1!'], new String('GoodPassword1!')])
    assert.equal(typeof signupPasswordError(value), 'string');
});
