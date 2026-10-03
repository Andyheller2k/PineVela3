import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomKeyAttemptGuard, RoomKeyAttemptLimit, ROOM_KEY_WINDOW_MS } from '../roomKeySecurity.js';

test('room-key attempt budgets are shared, bounded, expire and retain no raw identities', () => {
  let now = 1000, writes = 0;
  const state = { limits: [] as { key: string; count: number; expiresAt: number }[] };
  const guard = new RoomKeyAttemptGuard(state, () => writes++, () => now);
  for (let i = 0; i < 20; i++) guard.reserve('account', 'address');
  assert.throws(() => guard.reserve('account', 'address'), RoomKeyAttemptLimit);
  assert.equal(state.limits.length, 2); assert.equal(writes, 20);
  assert(state.limits.every(limit => /^[a-f0-9]{64}$/.test(limit.key)));
  const restored = new RoomKeyAttemptGuard(state, () => writes++, () => now);
  assert.throws(() => restored.reserve('account', 'another-address'), RoomKeyAttemptLimit);
  for (let i = 0; i < 40; i++) guard.reserve(`other-${i}`, 'address');
  assert.throws(() => guard.reserve('new-account', 'address'), RoomKeyAttemptLimit);
  now += ROOM_KEY_WINDOW_MS;
  guard.reserve('account', 'address'); assert.equal(state.limits.length, 2);
  assert(state.limits.every(limit => limit.count === 1));
});
