/** Actual React ThemeProvider with synthetic frontend edges; no app backend. */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import AppearanceSettings from '../../src/components/AppearanceSettings';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import { setSyntheticAuth } from './themeProviderAuth';
import { completeRequest, failRequest, requestSnapshot } from './themeProviderSession';

type Preference = 'light' | 'dark' | 'system';
type Context = { theme: 'light' | 'dark'; preference: Preference; publicAppearance: boolean;
  savePending: boolean; setPreference: (value: Preference) => void; toggleTheme: () => void };

declare global {
  interface Window {
    themeProviderHarness: {
      ready: boolean; state: () => Record<string, unknown>; choose: (value: Preference) => void;
      toggle: () => void; account: (id: string | null, loading?: boolean) => void;
      navigate: (path: string) => void; requests: typeof requestSnapshot;
      complete: typeof completeRequest; fail: typeof failRequest; unmount: () => void;
      trace: () => Array<string | null>; startTrace: () => void;
    };
    __themeInitialAuth?: { user: { id: string; role: string } | null; loading: boolean };
    __themePrepaint?: Record<string, string>;
  }
}
setSyntheticAuth(window.__themeInitialAuth || { user: null, loading: false });
let latest: Context;
let path = '';
let navigateTo: (path: string) => void;
let trace: Array<string | null> = [];
const root = createRoot(document.getElementById('root')!);
const observer = new MutationObserver(records => {
  for (const record of records) trace.push(record.oldValue);
  trace.push(document.documentElement.dataset.theme || null);
});
function Probe() {
  latest = useTheme() as unknown as Context;
  path = useLocation().pathname; navigateTo = useNavigate();
  window.themeProviderHarness.ready = true;
  return <><AppearanceSettings /><output data-testid="theme-state">{JSON.stringify({ preference: latest.preference, theme: latest.theme, path })}</output></>;
}
window.themeProviderHarness = {
  ready: false,
  state: () => ({ preference: latest?.preference, theme: latest?.theme, savePending: latest?.savePending,
    publicAppearance: latest?.publicAppearance, path, dataset: { ...document.documentElement.dataset },
    prepaint: window.__themePrepaint, storage: Object.fromEntries(Object.entries(localStorage)) }),
  choose: preference => latest.setPreference(preference), toggle: () => latest.toggleTheme(),
  account: (id, loading = false) => setSyntheticAuth({ user: id ? { id, role: 'user' } : null, loading }),
  navigate: destination => navigateTo(destination), requests: requestSnapshot,
  complete: completeRequest, fail: failRequest,
  unmount: () => { root.unmount(); observer.disconnect(); },
  trace: () => trace,
  startTrace: () => { trace = []; observer.disconnect(); observer.observe(document.documentElement,
    { attributes: true, attributeOldValue: true, attributeFilter: ['data-theme'] }); },
};
root.render(<MemoryRouter initialEntries={[location.hash.slice(1) || '/user/dashboard']}>
  <ThemeProvider><Probe /></ThemeProvider>
</MemoryRouter>);
