/** Synthetic frontend input for ThemeProvider tests; never an authenticated session. */
import { useSyncExternalStore } from 'react';

type State = { user: { id: string; role: string } | null; loading: boolean };
let state: State = { user: null, loading: false };
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function useAuth() { return useSyncExternalStore(subscribe, () => state); }
export function setSyntheticAuth(next: State) { state = next; for (const listener of listeners) listener(); }
