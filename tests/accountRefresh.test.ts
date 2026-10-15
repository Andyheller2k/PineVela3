/** Native promise/AbortSignal scheduling tests. No users, API responses,
 * credentials, or database records are fabricated. */
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {AccountRefreshGate} from '../src/lib/accountRefresh.js';

function completion() {
  let finish!: () => void;
  const promise = new Promise<void>(resolve => { finish = resolve; });
  return {promise, finish};
}

test('poll, focus and event refreshes share one pending operation', async () => {
  const gate = new AccountRefreshGate(), pending = completion();
  let requests = 0;
  const work = async () => { requests++; await pending.promise; };
  const first = gate.run('notifications', 1, work);
  const focus = gate.run('notifications', 1, work);
  const event = gate.run('notifications', 1, work);
  assert.equal(first, focus);
  assert.equal(first, event);
  await nextTurn();
  assert.equal(requests, 1);
  pending.finish();
  await Promise.all([first, focus, event]);
  await gate.run('notifications', 1, async () => { requests++; });
  assert.equal(requests, 2, 'The next completed poll can fetch fresh state');
});

test('a changed generation aborts old work without releasing newer work', async () => {
  const gate = new AccountRefreshGate(), old = completion(), current = completion();
  let oldSignal!: AbortSignal;
  const first = gate.run('notifications', 1, async signal => { oldSignal = signal; await old.promise; });
  await nextTurn();
  const next = gate.run('notifications', 2, () => current.promise);
  assert.equal(oldSignal.aborted, true);
  old.finish();
  await first;
  assert.equal(gate.run('notifications', 2, () => { throw new Error('Duplicate refresh'); }), next);
  current.finish();
  await next;
});

test('a changed account scope cancels the old signal', async () => {
  const gate = new AccountRefreshGate(), pending = completion();
  let oldSignal!: AbortSignal;
  const first = gate.run('notifications:current', 1, async signal => { oldSignal = signal; await pending.promise; });
  await nextTurn();
  await gate.run('notifications:switched', 1, async signal => { assert.equal(signal.aborted, false); });
  assert.equal(oldSignal.aborted, true);
  pending.finish();
  await first;
});

test('logout or unmount cancels requests before they start', async () => {
  const gate = new AccountRefreshGate();
  let requests = 0;
  const first = gate.run('notifications', 1, async () => { requests++; });
  gate.cancel();
  await first;
  assert.equal(requests, 0);
});

test('a failed refresh does not block the next successful refresh', async () => {
  const gate = new AccountRefreshGate();
  await assert.rejects(gate.run('notifications', 1, async () => { throw new Error('Connection interrupted'); }));
  let completed = false;
  await gate.run('notifications', 1, async () => { completed = true; });
  assert.equal(completed, true);
});
