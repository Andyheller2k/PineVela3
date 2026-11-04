import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

declare global {
  interface Window {
    PineVelaAnalytics?: { refresh: () => void; preferences: () => void; choice: () => 'granted' | 'denied' | null };
  }
}

/** HashRouter also navigates through pushState, which has no hashchange event.
 * Refresh the shared tag once per route; its own key prevents duplicate views. */
export default function AnalyticsNavigation() {
  const { pathname, search } = useLocation();
  useEffect(() => { window.PineVelaAnalytics?.refresh(); }, [pathname, search]);
  return null;
}
