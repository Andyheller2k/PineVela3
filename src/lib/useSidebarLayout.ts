import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { saveNavigationLayout, usesCompactSidebar } from './navigationLayout';

/** Remember the device layout and keep keyboard focus on the replacement toggle. */
export function useSidebarLayout(sidebarId: string) {
  const [compact, setCompact] = useState(usesCompactSidebar);
  const restoreFocus = useRef(false);
  const change = useCallback((next: boolean) => {
    restoreFocus.current = true;
    setCompact(next);
  }, []);
  useEffect(() => { saveNavigationLayout(compact); }, [compact]);
  useLayoutEffect(() => {
    if (!restoreFocus.current) return;
    restoreFocus.current = false;
    document.getElementById(sidebarId)?.querySelector<HTMLElement>('[data-sidebar-toggle]')?.focus({ preventScroll: true });
  }, [compact, sidebarId]);
  return [compact, change] as const;
}
