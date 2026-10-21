import { useLayoutEffect, useRef, type RefObject } from 'react';

/** Remember each view without retaining another account's scroll state. */
export function useDashboardScroll(container: RefObject<HTMLElement | null>, accountId: string | undefined, view: string, ready: boolean) {
  const saved = useRef({ accountId, positions: new Map<string, number>() });
  useLayoutEffect(() => {
    if (saved.current.accountId !== accountId) saved.current = { accountId, positions: new Map() };
    const element = container.current;
    if (!ready || !element) return;
    element.scrollTo({ top: saved.current.positions.get(view) || 0, behavior: 'instant' });
    const remember = () => { saved.current.positions.set(view, element.scrollTop); };
    element.addEventListener('scroll', remember, { passive: true });
    return () => element.removeEventListener('scroll', remember);
  }, [container, accountId, view, ready]);
}
