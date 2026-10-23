import { useSyncExternalStore } from 'react';

const installedDisplayMode = '(display-mode: standalone)';
type AppWindow = Pick<Window, 'matchMedia'> & {
  navigator: Navigator & { standalone?: boolean };
};

/** A phone browser remains the website; only a launched installed app skips marketing. */
export function isInstalledAppMode(appWindow: AppWindow | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  if (!appWindow) return false;
  return appWindow.navigator.standalone === true
    || (typeof appWindow.matchMedia === 'function' && appWindow.matchMedia(installedDisplayMode).matches);
}

function subscribeToAppMode(onChange: () => void) {
  if (typeof window === 'undefined') return () => {};
  const displayMode = typeof window.matchMedia === 'function' ? window.matchMedia(installedDisplayMode) : undefined;
  if (displayMode?.addEventListener) displayMode.addEventListener('change', onChange);
  else displayMode?.addListener(onChange);
  window.addEventListener('pageshow', onChange);
  return () => {
    if (displayMode?.removeEventListener) displayMode.removeEventListener('change', onChange);
    else displayMode?.removeListener(onChange);
    window.removeEventListener('pageshow', onChange);
  };
}

export function useInstalledAppMode() {
  return useSyncExternalStore(subscribeToAppMode, isInstalledAppMode, () => false);
}

/** Catalogs, support, account recovery and protected product routes remain available. */
export function installedAppRedirect(pathname: string): '/login' | undefined {
  let route = pathname;
  try { route = decodeURIComponent(route); } catch { /* The router handles malformed paths. */ }
  route = route.replace(/\/+$/, '').toLowerCase() || '/';
  return route === '/' || route === '/why-us' ? '/login' : undefined;
}
