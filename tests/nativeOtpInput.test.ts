import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeEmailOtp } from '../emailOtp';
import { formatOtpInput, otpBoxCount } from '../src/native/otpInput';

test('native code input retains leading zeroes and full six-to-ten digit pastes', () => {
  for (const code of ['001234', '0012345', '00123456', '001234567', '0012345678']) {
    assert.equal(formatOtpInput(code), code);
    assert.equal(normalizeEmailOtp(formatOtpInput(code)), code);
    assert.equal(otpBoxCount(code), code.length);
  }
  assert.equal(formatOtpInput('00 123\n45678'), '0012345678');
  assert.equal(formatOtpInput('00123456789'), '0012345678');
});

test('native code input starts with six boxes and does not make partial or nonnumeric entries valid', () => {
  assert.equal(otpBoxCount(''), 6);
  assert.equal(otpBoxCount('001'), 6);
  assert.equal(otpBoxCount('001234567890'), 10);
  assert.equal(formatOtpInput('abc😀١٢'), '');
  assert.equal(normalizeEmailOtp(formatOtpInput('01234')), null);
});
