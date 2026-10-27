import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { sessionFetch } from '../lib/session';
import { getPublicAppearance } from '../lib/publicAppearance';
import { applyBrowserChrome } from '../lib/browserChrome';
import { isAuthPage, isPhoneAuth, subscribePhoneAuthViewport } from '../lib/mobileAuthAppearance';
import { DEVICE_THEME_KEY, isThemePreference, readSystemTheme, resolveTheme, subscribeSystemTheme, type Theme, type ThemePreference } from '../lib/themePreference';

export type { Theme, ThemePreference } from '../lib/themePreference';
const read = (key: string): ThemePreference | null => { try { const value = localStorage.getItem(key); return isThemePreference(value) ? value : null; } catch { return null; } };
const cache = (key: string, value: ThemePreference) => { try { localStorage.setItem(key, value); } catch { /* Theme selection still works when storage is unavailable. */ } };
const remove = (key: string) => { try { localStorage.removeItem(key); } catch {} };
const initialPreference = (): ThemePreference => read(DEVICE_THEME_KEY) ?? 'system';
type Change = { identity: string; contextId: string; theme: ThemePreference; revision: number };
const sameChange = (a: Change | null, b: Change) => a?.identity === b.identity && a.contextId === b.contextId && a.revision === b.revision;
const ThemeContext = createContext<{
  theme: Theme; preference: ThemePreference; publicAppearance: boolean;
  setPreference: (next: ThemePreference) => void; toggleTheme: () => void; savePending: boolean;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation();
  const { user, loading } = useAuth();
  const fixedAppearance = getPublicAppearance(pathname, search, !!user);
  const authPage = isAuthPage(pathname);
  const publicAppearance = authPage || fixedAppearance !== null;
  const [preference, updatePreference] = useState<ThemePreference>(initialPreference);
  const systemTheme = useSyncExternalStore(
    useCallback(notify => preference === 'system' ? subscribeSystemTheme(notify) : () => {}, [preference]),
    readSystemTheme,
    () => 'light' as Theme,
  );
  const theme = resolveTheme(preference, systemTheme);
  const mobileAuth = useSyncExternalStore(
    useCallback(notify => subscribePhoneAuthViewport(pathname, notify), [pathname]),
    useCallback(() => isPhoneAuth(pathname), [pathname]),
    () => false,
  );
  const contextId = user ? String(user.id) : null;
  const identity = user ? `${user.role}:${user.id}` : null;
  const [savePending, setSavePending] = useState(false);
  const current = useRef(preference);
  const paintFrame = useRef(0);
  const account = useRef(identity);
  const revision = useRef(0);
  const pending = useRef<Change | null>(null);
  const writing = useRef<Change | null>(null);
  const mounted = useRef(false);
  account.current = identity;

  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const apply = useCallback((next: ThemePreference) => {
    current.current = next;
    updatePreference(next);
    cache(DEVICE_THEME_KEY, next);
  }, []);

  // Marketing retains its fixed appearance. Product and auth routes resolve the
  // same saved choice; OS changes never overwrite a saved System preference.
  useLayoutEffect(() => {
    const appearance = fixedAppearance ?? theme;
    const root = document.documentElement;
    cancelAnimationFrame(paintFrame.current);
    root.classList.add('theme-changing');
    paintFrame.current = requestAnimationFrame(() => {
      paintFrame.current = requestAnimationFrame(() => root.classList.remove('theme-changing'));
    });
    root.dataset.appearance = publicAppearance ? 'public' : 'product';
    root.dataset.authPage = String(authPage);
    root.dataset.mobileAuth = String(mobileAuth);
    root.dataset.themePreference = preference;
    root.dataset.theme = appearance;
    root.style.colorScheme = appearance;
    applyBrowserChrome(appearance, publicAppearance);
  }, [fixedAppearance, publicAppearance, authPage, mobileAuth, preference, theme]);

  // Only one write is active. A response may acknowledge its own account and
  // revision, never clear a newer account's pending selection.
  const flush = useCallback(async () => {
    if (!mounted.current || writing.current || !pending.current) return;
    const change = pending.current;
    if (account.current !== change.identity) { pending.current = null; return; }
    writing.current = change;
    try {
      const response = await sessionFetch('/api/auth/appearance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-PineVela-Profile-Context': change.contextId }, body: JSON.stringify({ theme: change.theme }),
      });
      if (mounted.current && response.ok && account.current === change.identity && sameChange(pending.current, change)) {
        pending.current = null;
        remove(`${DEVICE_THEME_KEY}:${change.identity}:unsynced`);
        setSavePending(false);
      }
    } catch { /* Preserve the choice locally and retry after reconnecting. */ }
    finally {
      writing.current = null;
      if (mounted.current && pending.current && !sameChange(pending.current, change)) void flush();
    }
  }, []);

  const remember = useCallback((next: ThemePreference, fromStorage = false) => {
    apply(next);
    const version = ++revision.current;
    if (account.current && contextId) {
      const key = `${DEVICE_THEME_KEY}:${account.current}`;
      if (!fromStorage) cache(key, next);
      cache(`${key}:unsynced`, next);
      pending.current = { identity: account.current, contextId, theme: next, revision: version };
      setSavePending(true);
      void flush();
    }
  }, [apply, contextId, flush]);

  useLayoutEffect(() => {
    if (loading) return;
    revision.current++;
    pending.current = null;
    setSavePending(false);
    if (!identity || !contextId) return; // Logout retains the last device choice for login/signup.
    const key = `${DEVICE_THEME_KEY}:${identity}`;
    const unsynced = read(`${key}:unsynced`);
    const cached = read(key);
    if (cached) apply(cached);
    if (unsynced) {
      apply(unsynced);
      pending.current = { identity, contextId, theme: unsynced, revision: revision.current };
      setSavePending(true);
      void flush();
      return;
    }
    const version = revision.current;
    const controller = new AbortController();
    void sessionFetch('/api/auth/appearance', { signal: controller.signal, headers: { 'X-PineVela-Profile-Context': contextId } }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!mounted.current || controller.signal.aborted || account.current !== identity || revision.current !== version) return;
      if (isThemePreference(data.theme)) { cache(key, data.theme); apply(data.theme); }
      else {
        // New portals inherit this device's choice once, including System.
        pending.current = { identity, contextId, theme: current.current, revision: ++revision.current };
        setSavePending(true);
        cache(key, current.current);
        cache(`${key}:unsynced`, current.current);
        void flush();
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [identity, contextId, loading, apply, flush]);

  useEffect(() => {
    const reconnect = () => void flush();
    const sync = (event: StorageEvent) => {
      const key = account.current ? `${DEVICE_THEME_KEY}:${account.current}` : DEVICE_THEME_KEY;
      if (event.key === key && isThemePreference(event.newValue)) remember(event.newValue, true);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('storage', sync); cancelAnimationFrame(paintFrame.current); document.documentElement.classList.remove('theme-changing'); };
  }, [remember, flush]);

  const setPreference = useCallback((next: ThemePreference) => {
    if (publicAppearance || !isThemePreference(next) || current.current === next) return;
    remember(next);
  }, [publicAppearance, remember]);
  const toggleTheme = useCallback(() => {
    setPreference(theme === 'light' ? 'dark' : 'light');
  }, [setPreference, theme]);

  return <ThemeContext.Provider value={{ theme, preference, publicAppearance, setPreference, toggleTheme, savePending }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider');
  return context;
}
