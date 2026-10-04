import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { sessionFetch } from '../lib/session';

export type Theme = 'light' | 'dark';
const DEVICE_KEY = 'pinevela:appearance';
const valid = (value: unknown): value is Theme => value === 'light' || value === 'dark';
const read = (key: string): Theme | null => { try { const value = localStorage.getItem(key); return valid(value) ? value : null; } catch { return null; } };
const cache = (key: string, value: Theme) => { try { localStorage.setItem(key, value); } catch { /* Appearance remains usable with storage disabled. */ } };
const remove = (key: string) => { try { localStorage.removeItem(key); } catch {} };
const initialTheme = (): Theme => read(DEVICE_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void; savePending: boolean } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const identity = user ? `${user.role}:${user.id}` : null;
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [savePending, setSavePending] = useState(false);
  const current = useRef(theme);
  const account = useRef(identity);
  const revision = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pending = useRef<{ identity: string; theme: Theme; revision: number } | null>(null);
  const writing = useRef(false);
  account.current = identity;

  const apply = useCallback((next: Theme, animate = true) => {
    const root = document.documentElement;
    clearTimeout(timer.current);
    if (animate && current.current !== next) {
      root.classList.add('theme-changing');
      timer.current = setTimeout(() => root.classList.remove('theme-changing'), 1100);
    }
    root.dataset.theme = next;
    root.style.colorScheme = next;
    current.current = next;
    setTheme(next);
    cache(DEVICE_KEY, next);
  }, []);

  // Serialise writes so rapid toggles cannot leave an older preference on the server.
  const flush = useCallback(async () => {
    if (writing.current || !pending.current) return;
    const change = pending.current;
    if (account.current !== change.identity) { pending.current = null; return; }
    writing.current = true;
    try {
      const response = await sessionFetch('/api/auth/appearance', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: change.theme }),
      });
      if (response.ok && pending.current?.revision === change.revision) {
        pending.current = null;
        remove(`${DEVICE_KEY}:${change.identity}:unsynced`);
        if (account.current === change.identity) setSavePending(false);
      }
    } catch { /* Keep the local preference and retry on reconnect. */ }
    finally {
      writing.current = false;
      if (pending.current && pending.current.revision !== change.revision) void flush();
    }
  }, []);

  useLayoutEffect(() => {
    if (loading) return;
    revision.current++;
    pending.current = null;
    setSavePending(false);
    if (!identity) return; // Public pages retain the last mode used on this device.
    const key = `${DEVICE_KEY}:${identity}`;
    const unsynced = read(`${key}:unsynced`);
    const cached = read(key);
    if (cached) apply(cached, false);
    if (unsynced) {
      apply(unsynced, false);
      pending.current = { identity, theme: unsynced, revision: revision.current };
      setSavePending(true);
      void flush();
      return;
    }
    const version = revision.current;
    const controller = new AbortController();
    void sessionFetch('/api/auth/appearance', { signal: controller.signal }).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (controller.signal.aborted || account.current !== identity || revision.current !== version) return;
      if (valid(data.theme)) { cache(key, data.theme); apply(data.theme, false); }
      else {
        // A new account inherits this device's current mode once; other accounts are untouched.
        pending.current = { identity, theme: current.current, revision: ++revision.current };
        setSavePending(true);
        cache(key, current.current);
        cache(`${key}:unsynced`, current.current);
        void flush();
      }
    }).catch(() => {});
    return () => controller.abort();
  }, [identity, loading, apply, flush]);

  useEffect(() => {
    const reconnect = () => void flush();
    const sync = (event: StorageEvent) => {
      const key = account.current ? `${DEVICE_KEY}:${account.current}` : DEVICE_KEY;
      if (event.key === key && valid(event.newValue)) apply(event.newValue);
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener('online', reconnect); window.removeEventListener('storage', sync); clearTimeout(timer.current); };
  }, [apply, flush]);

  const toggleTheme = useCallback(() => {
    const next = current.current === 'light' ? 'dark' : 'light';
    apply(next);
    const version = ++revision.current;
    if (account.current) {
      cache(`${DEVICE_KEY}:${account.current}`, next);
      cache(`${DEVICE_KEY}:${account.current}:unsynced`, next);
      pending.current = { identity: account.current, theme: next, revision: version };
      setSavePending(true);
      void flush();
    }
  }, [apply, flush]);

  return <ThemeContext.Provider value={{ theme, toggleTheme, savePending }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme requires ThemeProvider');
  return context;
}
