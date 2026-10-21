import { queryClient } from './queryClient';
import { currentSessionGeneration } from './session';

type Portal = 'primary' | 'seller';
const lifetime = 10 * 60 * 1000;
const key = (portal: Portal, contextId: string, generation: number) => ['dashboardSnapshot', portal, contextId, generation];

/** Only previously successful server reads, held in the existing memory cache.
 * A new login/context cannot reuse another session's dashboard. No persistence. */
export function readDashboardSnapshot<T>(portal: Portal, contextId?: string): T | undefined {
  if (!contextId) return;
  const state = queryClient.getQueryState<T>(key(portal, contextId, currentSessionGeneration()));
  if (!state || Date.now() - state.dataUpdatedAt > lifetime) return;
  return state.data;
}

export function saveDashboardSnapshot<T>(portal: Portal, contextId: string | undefined, generation: number, data: T): void {
  if (!contextId || generation !== currentSessionGeneration()) return;
  queryClient.setQueryData(key(portal, contextId, generation), data);
}
