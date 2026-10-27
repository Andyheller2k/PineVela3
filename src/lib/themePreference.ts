export type Theme = 'light' | 'dark';
export type ThemePreference = Theme | 'system';

export const DEVICE_THEME_KEY = 'pinevela:appearance';
export const SYSTEM_THEME_MEDIA = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function resolveTheme(preference: ThemePreference, systemTheme: Theme): Theme {
  return preference === 'system' ? systemTheme : preference;
}

export type MediaQuery = {
  readonly matches: boolean;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
  addListener?: (listener: () => void) => void;
  removeListener?: (listener: () => void) => void;
};
export type AppearanceEnvironment = { matchMedia?: (query: string) => MediaQuery };
export const appearanceBrowser = (): AppearanceEnvironment | undefined => typeof window === 'undefined' ? undefined : window;

export function readSystemTheme(environment = appearanceBrowser()): Theme {
  try { return environment?.matchMedia?.(SYSTEM_THEME_MEDIA).matches ? 'dark' : 'light'; }
  catch { return 'light'; }
}

export function listenToAppearanceQuery(query: MediaQuery, listener: () => void) {
  if (query.addEventListener && query.removeEventListener) {
    query.addEventListener('change', listener);
    return () => query.removeEventListener!('change', listener);
  }
  if (query.addListener && query.removeListener) {
    query.addListener(listener);
    return () => query.removeListener!(listener);
  }
  return () => {};
}

export function subscribeSystemTheme(listener: () => void, environment = appearanceBrowser()) {
  try {
    const query = environment?.matchMedia?.(SYSTEM_THEME_MEDIA);
    return query ? listenToAppearanceQuery(query, listener) : () => {};
  } catch { return () => {}; }
}
