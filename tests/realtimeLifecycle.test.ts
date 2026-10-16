/** Native callback/timer lifecycle only: no users, credentials, connections,
 * business records, EventSource substitutes or API replies are fabricated. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { RealtimeLifecycle } from '../src/lib/realtimeLifecycle.js';

test('a mounted scope owns exactly one connection and closes it once', () => {
  let opened = 0, closed = 0;
  const lifecycle = new RealtimeLifecycle(() => { opened++; return () => { closed++; }; });
  lifecycle.start(); lifecycle.start();
  assert.equal(opened, 1);
  lifecycle.stop(); lifecycle.stop(); lifecycle.start();
  assert.equal(opened, 1); assert.equal(closed, 1);
});

test('repeated failures share one reconnect timer', async () => {
  let opened = 0, closed = 0;
  const lifecycle = new RealtimeLifecycle(() => { opened++; return () => { closed++; }; });
  try {
    lifecycle.start(); lifecycle.retryAfter(20); lifecycle.retryAfter(20);
    assert.equal(closed, 1);
    await delay(60);
    assert.equal(opened, 2); assert.equal(closed, 1);
  } finally { lifecycle.stop(); }
  assert.equal(closed, 2);
});

test('unmount or logout cancels pending reconnection', async () => {
  let opened = 0, closed = 0;
  const lifecycle = new RealtimeLifecycle(() => { opened++; return () => { closed++; }; });
  lifecycle.start(); lifecycle.retryAfter(20); lifecycle.stop();
  await delay(60);
  assert.equal(opened, 1); assert.equal(closed, 1);
});

test('late old-scope failures cannot reopen it or close its replacement', async () => {
  let oldOpened = 0, oldClosed = 0, newOpened = 0, newClosed = 0;
  const old = new RealtimeLifecycle(() => { oldOpened++; return () => { oldClosed++; }; });
  const replacement = new RealtimeLifecycle(() => { newOpened++; return () => { newClosed++; }; });
  old.start(); old.stop(); replacement.start();
  old.retryAfter(0); old.stop(); old.start();
  await delay(30);
  assert.equal(oldOpened, 1); assert.equal(oldClosed, 1);
  assert.equal(newOpened, 1); assert.equal(newClosed, 0);
  replacement.stop(); assert.equal(newClosed, 1);
});

test('an opening failure can recover through the actual bounded retry timer', { timeout: 7000 }, async () => {
  let attempted = 0, closed = 0;
  const lifecycle = new RealtimeLifecycle(() => {
    attempted++; if (attempted === 1) throw new Error('Opening failed');
    return () => { closed++; };
  });
  try {
    lifecycle.start();
    assert.equal(attempted, 1);
    await delay(5100);
    assert.equal(attempted, 2); assert.equal(closed, 0);
  } finally { lifecycle.stop(); }
  assert.equal(closed, 1);
});
