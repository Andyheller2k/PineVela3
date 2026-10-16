/** Native TanStack observer/timer coordination only. The query returns the
 * monotonic clock; no accounts, keys, business records or API replies are made up. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { governanceRefreshInterval } from '../src/lib/governanceRefresh.js';

test('background metadata uses the slower cadence while active panels stay fresh', () => {
  assert.equal(governanceRefreshInterval(true), 30000);
  assert.equal(governanceRefreshInterval(false), 8000);
});

test('inactive panels do not accelerate polling; active panels pause hidden and recover on focus', { timeout: 40000 }, async () => {
  // Query Core disables browser polling in Node. Provide the native EventTarget
  // it subscribes to; focus changes below use the library's actual focus manager.
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  const { QueryClient, QueryObserver, focusManager } = await import('@tanstack/query-core');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const disposers: Array<() => void> = [];
  let reads = 0;
  const options = {
    queryKey: ['governance-refresh-coordination'],
    queryFn: async () => { reads++; return performance.now(); },
    refetchOnWindowFocus: true,
  };
  const waitForReads = async (count: number, deadline: number) => {
    const expires = performance.now() + deadline;
    while (reads < count && performance.now() < expires) await delay(25);
    assert.equal(reads, count);
    while (client.isFetching()) await delay(5);
  };
  try {
    focusManager.setFocused(true);
    client.mount();
    const metadata = new QueryObserver(client, { ...options, refetchInterval: governanceRefreshInterval(true) });
    disposers.push(metadata.subscribe(() => {}));
    await waitForReads(1, 1000);
    const hiddenPanel = new QueryObserver(client, { ...options, enabled: false, refetchInterval: governanceRefreshInterval(false) });
    disposers.push(hiddenPanel.subscribe(() => {}));
    await delay(8500);
    assert.equal(reads, 1, 'A CSS-hidden disabled panel must not trigger the active eight-second cadence');

    const activePanel = new QueryObserver(client, { ...options, refetchInterval: governanceRefreshInterval(false) });
    disposers.push(activePanel.subscribe(() => {}));
    await waitForReads(2, 1000);
    await waitForReads(3, 9000);

    focusManager.setFocused(false);
    await delay(8500);
    assert.equal(reads, 3, 'No background polling while the tab is hidden');
    focusManager.setFocused(true);
    await waitForReads(4, 1000);
    assert.equal(reads, 4, 'Both active observers share one immediate focus refresh');
  } finally {
    disposers.forEach(dispose => dispose());
    client.unmount(); client.clear(); focusManager.setFocused(undefined);
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});
