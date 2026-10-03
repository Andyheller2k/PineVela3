import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSessionToken, setRecordSession, sessionMatches, clearRecordSession, removeRawSessions, revokeMatchingSessions, tokenDigest, requestSessionToken, sessionOriginGuard } from '../sessionSecurity.js';
import { publicAccountData } from '../accountSecurity.js';

test('S21: opaque hashed sessions expire absolutely and legacy/raw/digest credentials fail closed', () => {
  const token = createSessionToken(), now = Date.now();
  const account: any = { id: 'isolated', token: 'old', user: { token: 'old' } };
  setRecordSession(account, token, now, 1000);
  assert(!JSON.stringify(account).includes(token)); assert(!account.token && !account.user.token);
  assert.equal(account.session.tokenHash, tokenDigest(token));
  assert(sessionMatches(account, token, now)); assert(sessionMatches(account, token, now + 999));
  assert(!sessionMatches(account, token, now + 1000)); assert(!sessionMatches(account, token, now - 1));
  assert(!sessionMatches(account, account.session.tokenHash, now));
  assert(!sessionMatches({ token }, token));
  for (const expiresAt of [undefined, null, Infinity, 'tomorrow', now - 1, now + 8 * 86400000]) assert(!sessionMatches({ session: { ...account.session, expiresAt } }, token, now));
  assert(!('session' in publicAccountData(account, true))); assert(!('session' in publicAccountData(account, true).user));
  const other = {}, otherToken = createSessionToken(); setRecordSession(other, otherToken, now, 1000);
  const duplicate = structuredClone(account);
  assert.equal(revokeMatchingSessions([account, duplicate, other], token), 2);
  assert(!sessionMatches(account, token)); assert(!sessionMatches(duplicate, token)); assert(sessionMatches(other, otherToken, now));
  clearRecordSession(other); assert(!sessionMatches(other, otherToken));
  const legacy = { users: [{ token, merchantToken: token, sessionToken: token, password: 'unchanged' }] };
  assert(removeRawSessions(legacy)); assert.deepEqual(legacy, { users: [{ password: 'unchanged' }] }); assert(!removeRawSessions(legacy));
});

test('S21: explicit bearer credentials do not fall back to a cookie, and cookie writes enforce origin', () => {
  const req = (headers: any, method = 'POST') => ({ headers, method, get: () => 'localhost:3000' });
  assert.equal(requestSessionToken(req({ cookie: 'pv_auth_token=secret' })), 'secret');
  assert.equal(requestSessionToken(req({ authorization: 'Bearer explicit', cookie: 'pv_auth_token=secret' })), 'explicit');
  assert.equal(requestSessionToken(req({ authorization: 'Basic invalid', cookie: 'pv_auth_token=secret' })), '');
  assert.equal(requestSessionToken(req({ cookie: 'pv_auth_token=a; pv_auth_token=b' })), '');
  const check = (headers: any, expected: number, method = 'POST') => {
    let status = 200, next = false;
    const res: any = { status: (value: number) => { status = value; return res; }, json: () => {} };
    sessionOriginGuard(req(headers, method), res, () => next = true);
    assert.equal(status, expected); assert.equal(next, expected === 200);
  };
  check({ cookie: 'pv_auth_token=a' }, 403);
  check({ cookie: 'pv_auth_token=a', origin: 'https://foreign.example.test' }, 403);
  check({ cookie: 'pv_auth_token=a', origin: 'http://localhost:3000' }, 200);
  check({ cookie: 'pv_auth_token=a', 'sec-fetch-site': 'cross-site' }, 403);
  check({ cookie: 'pv_auth_token=a' }, 200, 'GET');
  check({ authorization: 'Bearer cli' }, 200);
});
