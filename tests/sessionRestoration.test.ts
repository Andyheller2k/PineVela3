/** Native async coordination only: no fabricated accounts, tokens or API replies. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { SessionRestoration, SessionCheckUnavailable } from '../src/lib/sessionRestoration.js';

function completion<T>() {
  let finish!: (value: T) => void;
  const promise = new Promise<T>(resolve => { finish = resolve; });
  return { promise, finish };
}

test('StrictMode subscribers share one pending check without cancellation', async () => {
  const restoration = new SessionRestoration<symbol>(), pending = completion<symbol>();
  let calls = 0;
  const check = async () => { calls++; return pending.promise; };
  const first = restoration.run(check), second = restoration.run(check);
  assert.equal(first, second);
  await nextTurn();
  assert.equal(calls, 1);
  const completed = Symbol();
  pending.finish(completed);
  assert.deepEqual(await second, { kind: 'restored', user: completed });
});

test('a temporary failure retries before publishing a result', async () => {
  const restoration = new SessionRestoration<symbol>(), completed = Symbol();
  let calls = 0;
  const result = await restoration.run(async () => {
    calls++;
    if (calls === 1) throw new SessionCheckUnavailable('Connection interrupted');
    return completed;
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, { kind: 'restored', user: completed });
});

test('exhausted temporary failures stay unavailable, never signed out', async () => {
  const restoration = new SessionRestoration<symbol>();
  let calls = 0;
  const result = await restoration.run(async () => { calls++; throw new SessionCheckUnavailable('Connection interrupted'); });
  assert.equal(calls, 3);
  assert.deepEqual(result, { kind: 'unavailable' });
  assert.deepEqual(await restoration.run(async () => null), { kind: 'signed-out' }, 'Manual retry can check again');
});

test('a confirmed signed-out result finishes without retries', async () => {
  const restoration = new SessionRestoration<symbol>();
  let calls = 0;
  assert.deepEqual(await restoration.run(async () => { calls++; return null; }), { kind: 'signed-out' });
  assert.equal(calls, 1);
});

test('malformed or unexpected failures expose retry rather than a guessed identity', async () => {
  const restoration = new SessionRestoration<symbol>();
  let calls = 0;
  assert.deepEqual(await restoration.run(async () => { calls++; throw new Error('Unverified result'); }), { kind: 'unavailable' });
  assert.equal(calls, 1);
});

test('logout or an account change suppresses delayed restoration', async () => {
  const restoration = new SessionRestoration<symbol>(), pending = completion<symbol>();
  const first = restoration.run(() => pending.promise);
  await nextTurn();
  restoration.invalidate();
  pending.finish(Symbol());
  assert.deepEqual(await first, { kind: 'superseded' });
});

test('replacement checks wait for old cookie responses before starting', async () => {
  const restoration = new SessionRestoration<symbol>(), old = completion<symbol>(), current = Symbol();
  const first = restoration.run(() => old.promise);
  await nextTurn();
  restoration.invalidate();
  let calls = 0;
  const replacement = restoration.run(async () => { calls++; return current; });
  await nextTurn();
  assert.equal(calls, 0);
  old.finish(Symbol());
  assert.deepEqual(await first, { kind: 'superseded' });
  assert.deepEqual(await replacement, { kind: 'restored', user: current });
  assert.equal(calls, 1);
});

test('sign-in can wait for restoration to drain without aborting it', async () => {
  const restoration = new SessionRestoration<symbol>(), pending = completion<symbol>();
  const first = restoration.run(() => pending.promise);
  await nextTurn();
  restoration.invalidate();
  let drained = false;
  const barrier = restoration.settled().then(() => { drained = true; });
  await nextTurn();
  assert.equal(drained, false);
  pending.finish(Symbol());
  await barrier;
  assert.equal(drained, true);
  assert.deepEqual(await first, { kind: 'superseded' });
});

test('invalidation before work starts avoids unnecessary requests', async () => {
  const restoration = new SessionRestoration<symbol>();
  let calls = 0;
  const first = restoration.run(async () => { calls++; return null; });
  restoration.invalidate();
  assert.deepEqual(await first, { kind: 'superseded' });
  assert.equal(calls, 0);
});
