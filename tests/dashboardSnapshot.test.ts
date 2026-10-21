/** Cache isolation contracts, using opaque scope/value tokens rather than user records. */
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { queryClient } from '../src/lib/queryClient';
import { readDashboardSnapshot, saveDashboardSnapshot } from '../src/lib/dashboardSnapshot';
import { advanceSessionGeneration, currentSessionGeneration } from '../src/lib/session';

afterEach(() => { queryClient.clear(); advanceSessionGeneration(); });

test('warm reads stay within their account and portal', () => {
  const account = randomUUID(), otherAccount = randomUUID(), value = randomUUID();
  saveDashboardSnapshot('primary', account, currentSessionGeneration(), value);
  assert.equal(readDashboardSnapshot('primary', account), value);
  assert.equal(readDashboardSnapshot('primary', otherAccount), undefined);
  assert.equal(readDashboardSnapshot('seller', account), undefined);
  assert.equal(readDashboardSnapshot('primary'), undefined);
});

test('a new login cannot recover a previous session or accept its late completion', () => {
  const account = randomUUID(), value = randomUUID(), oldGeneration = currentSessionGeneration();
  saveDashboardSnapshot('primary', account, oldGeneration, value);
  advanceSessionGeneration();
  assert.equal(readDashboardSnapshot('primary', account), undefined);
  saveDashboardSnapshot('primary', account, oldGeneration, value);
  assert.equal(readDashboardSnapshot('primary', account), undefined);
  saveDashboardSnapshot('primary', account, currentSessionGeneration(), value);
  assert.equal(readDashboardSnapshot('primary', account), value);
});

test('expired data and a cleared session cache require a fresh read', () => {
  const account = randomUUID(), value = randomUUID();
  saveDashboardSnapshot('seller', account, currentSessionGeneration(), value);
  queryClient.getQueryCache().getAll()[0].setState({ dataUpdatedAt: Date.now() - 11 * 60 * 1000 });
  assert.equal(readDashboardSnapshot('seller', account), undefined);
  saveDashboardSnapshot('seller', account, currentSessionGeneration(), value);
  queryClient.clear();
  assert.equal(readDashboardSnapshot('seller', account), undefined);
});
