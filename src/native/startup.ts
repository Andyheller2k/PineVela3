import { registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { applyBrowserChrome } from '../lib/browserChrome';
import { DEVICE_THEME_KEY, isThemePreference, readSystemTheme, resolveTheme, type Theme, type ThemePreference } from '../lib/themePreference';

interface NativeAppearancePlugin {
  setAppearance(options: { theme: Theme; preference: ThemePreference; bottomNavigation: boolean }): Promise<void>;
}
const NativeAppearance = registerPlugin<NativeAppearancePlugin>('PineVelaAppearance');

/** Start before awaiting secure transport: the HTML loader already exists. */
export function installNativeStartup() {
  const root = document.documentElement;
  let preference: ThemePreference = 'system';
  try {
    const saved = localStorage.getItem(DEVICE_THEME_KEY);
    if (isThemePreference(saved)) preference = saved;
  } catch { /* A storage restriction must not prevent launch. */ }
  root.dataset.themePreference = preference;
  root.dataset.theme = resolveTheme(preference, readSystemTheme());
  root.style.colorScheme = root.dataset.theme;
  applyBrowserChrome(root.dataset.theme as Theme, false);

  let last = '';
  let pending = Promise.resolve();
  const sync = () => {
    const theme = root.dataset.theme === 'dark' ? 'dark' : 'light';
    const choice = isThemePreference(root.dataset.themePreference) ? root.dataset.themePreference : 'system';
    const bottomNavigation = root.dataset.mobileNavigation === 'true';
    const next = `${choice}:${theme}:${bottomNavigation}`;
    if (next === last) return;
    last = next;
    // Paint windowBackground first: Capacitor reads that attribute when setting
    // icons, including later configuration changes. No second safe-area padding.
    pending = pending.catch(() => {}).then(async () => {
      await NativeAppearance.setAppearance({ theme, preference: choice, bottomNavigation });
      await SystemBars.setStyle({ style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light });
    }).catch(() => {});
  };
  sync();
  new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-theme-preference', 'data-mobile-navigation'] });

  const loader = document.getElementById('pv-app-launch');
  const timer = window.setTimeout(() => {
    const recovery = loader?.querySelector<HTMLElement>('.pv-app-launch-recovery');
    if (recovery) recovery.hidden = false;
  }, 20_000);
  loader?.querySelector('button')?.addEventListener('click', () => location.reload());
  window.addEventListener('pinevela:app-ready', () => {
    clearTimeout(timer);
    loader?.remove();
  }, { once: true });
}
