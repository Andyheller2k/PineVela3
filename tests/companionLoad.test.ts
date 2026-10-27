import assert from 'node:assert/strict';
import test from 'node:test';
import { CompanionLoadGate } from '../src/lib/companionLoad';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

// Async orchestration only: no profile, account, catalog or API fixtures.
function observer() {
  const state: { loading: boolean; value?: number; error?: unknown; settled: number } = { loading: false, settled: 0 };
  const callbacks = {
    start: () => { state.loading = true; state.error = undefined; },
    success: (value: number) => { state.value = value; },
    failure: (error: unknown) => { state.error = error; },
    settled: () => { state.loading = false; state.settled++; },
  };
  return { state, callbacks };
}

test('a completed current read delivers its result and ends loading', async () => {
  const gate = new CompanionLoadGate(), read = deferred<number>(), result = observer();
  const task = gate.run(() => read.promise, result.callbacks);
  assert.equal(result.state.loading, true);
  read.resolve(1);
  await task;
  assert.equal(result.state.value, 1);
  assert.equal(result.state.loading, false);
  assert.equal(result.state.settled, 1);
});

test('a failed initial read exposes its error and stops the opening spinner; retry can recover', async () => {
  const gate = new CompanionLoadGate(), read = deferred<number>(), result = observer();
  const task = gate.run(() => read.promise, result.callbacks);
  const error = new Error('Read failed');
  read.reject(error);
  await task;
  assert.equal(result.state.error, error);
  assert.equal(result.state.loading, false);
  assert.equal(result.state.settled, 1);
  await gate.run(async () => 2, result.callbacks);
  assert.equal(result.state.error, undefined);
  assert.equal(result.state.value, 2);
  assert.equal(result.state.loading, false);
});

test('a newer read aborts its predecessor and ignores a late old result', async () => {
  const gate = new CompanionLoadGate(), first = deferred<number>(), second = deferred<number>(), result = observer();
  let oldSignal!: AbortSignal;
  const firstTask = gate.run(signal => { oldSignal = signal; return first.promise; }, result.callbacks);
  const secondTask = gate.run(() => second.promise, result.callbacks);
  assert.equal(oldSignal.aborted, true);
  second.resolve(2);
  await secondTask;
  first.resolve(1); // Simulate a transport that finishes despite cancellation.
  await firstTask;
  assert.equal(result.state.value, 2);
  assert.equal(result.state.settled, 1);
});

test('a stale failure cannot overwrite a newer request or stop its spinner', async () => {
  const gate = new CompanionLoadGate(), first = deferred<number>(), second = deferred<number>(), result = observer();
  const firstTask = gate.run(() => first.promise, result.callbacks);
  const secondTask = gate.run(() => second.promise, result.callbacks);
  first.reject(new Error('Old failure'));
  await firstTask;
  assert.equal(result.state.error, undefined);
  assert.equal(result.state.loading, true);
  assert.equal(result.state.settled, 0);
  second.resolve(2);
  await secondTask;
  assert.equal(result.state.value, 2);
  assert.equal(result.state.loading, false);
});

test('mutation invalidation preserves the newer local value when an older read completes', async () => {
  const gate = new CompanionLoadGate(), read = deferred<number>(), result = observer();
  let signal!: AbortSignal;
  const task = gate.run(value => { signal = value; return read.promise; }, result.callbacks);
  gate.invalidate();
  result.state.loading = false;
  result.state.value = 3;
  read.resolve(1);
  await task;
  assert.equal(signal.aborted, true);
  assert.equal(result.state.value, 3);
  assert.equal(result.state.error, undefined);
  assert.equal(result.state.settled, 0);
});

test('unmount invalidation suppresses callbacks and a later mounted session is independent', async () => {
  const oldGate = new CompanionLoadGate(), read = deferred<number>(), oldResult = observer(), nextResult = observer();
  const oldTask = oldGate.run(() => read.promise, oldResult.callbacks);
  oldGate.invalidate();
  const nextGate = new CompanionLoadGate();
  await nextGate.run(async () => 4, nextResult.callbacks);
  read.reject(new Error('Old session ended'));
  await oldTask;
  assert.equal(oldResult.state.error, undefined);
  assert.equal(oldResult.state.settled, 0);
  assert.equal(nextResult.state.value, 4);
  assert.equal(nextResult.state.loading, false);
});

test('cleanup followed by a new effect can reuse its gate without old callbacks winning', async () => {
  const gate = new CompanionLoadGate(), first = deferred<number>(), result = observer();
  const oldTask = gate.run(() => first.promise, result.callbacks);
  gate.invalidate();
  await gate.run(async () => 5, result.callbacks);
  first.resolve(1);
  await oldTask;
  assert.equal(result.state.value, 5);
  assert.equal(result.state.settled, 1);
});
