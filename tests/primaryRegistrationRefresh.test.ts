/** Actual Query Core observer/cache coordination using native clocks and
 * promises; no accounts, business records or API replies are fabricated. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { QueryClient, QueryObserver } from '@tanstack/query-core';

test('the primary page and its background reader share one pending and fresh query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: false, gcTime: Infinity } } });
  let complete!: () => void, reads = 0;
  const pending = new Promise<void>(resolve => { complete = resolve; });
  const options = { queryKey: ['userData', 'registration', 'coordination-scope'],
    queryFn: async () => { reads++; await pending; return performance.now(); } };
  const observer = new QueryObserver(client, options), detach = observer.subscribe(() => {});
  try {
    const background = client.fetchQuery(options);
    await nextTurn(); assert.equal(reads, 1);
    complete(); const value = await background;
    assert.equal(observer.getCurrentResult().data, value);
    assert.equal(await client.fetchQuery(options), value);
    assert.equal(reads, 1, 'A second visible consumer reuses the fresh saved result');
    await client.invalidateQueries({ queryKey: options.queryKey });
    assert.equal(reads, 2, 'A real invalidation still refreshes the active query');
  } finally { detach(); client.clear(); }
});

test('different context keys never share another account cache result', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 5000, retry: false, gcTime: Infinity } } });
  let reads = 0;
  const queryFn = async () => { reads++; return performance.now(); };
  try {
    await client.fetchQuery({ queryKey: ['userData', 'registration', 'first-scope'], queryFn });
    await client.fetchQuery({ queryKey: ['userData', 'registration', 'second-scope'], queryFn });
    assert.equal(reads, 2);
    assert.equal(client.getQueryCache().getAll().length, 2);
  } finally { client.clear(); }
});
