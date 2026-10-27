import { appearanceBrowser, listenToAppearanceQuery, type AppearanceEnvironment } from './themePreference';

/** Viewport styling only. Auth theme selection uses the saved app preference. */
export const PHONE_AUTH_MEDIA = '(max-width: 639px), (pointer: coarse) and (max-width: 1023px) and (max-height: 500px)';
export const isAuthPage = (pathname: string) => (pathname.replace(/\/+$/, '') || '/') === '/login';

export function isPhoneAuth(pathname: string, environment = appearanceBrowser()): boolean {
  if (!isAuthPage(pathname)) return false;
  try { return environment?.matchMedia?.(PHONE_AUTH_MEDIA).matches ?? false; }
  catch { return false; }
}

export function subscribePhoneAuthViewport(pathname: string, notify: () => void, environment: AppearanceEnvironment | undefined = appearanceBrowser()) {
  if (!isAuthPage(pathname)) return () => {};
  try {
    const query = environment?.matchMedia?.(PHONE_AUTH_MEDIA);
    return query ? listenToAppearanceQuery(query, notify) : () => {};
  } catch { return () => {}; }
}
