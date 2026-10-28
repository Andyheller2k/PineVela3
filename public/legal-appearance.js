/* Static policy pages share the app's device preference without loading the
   application, accessing a session or making API requests. */
(() => {
  'use strict';
  const key = 'pinevela:appearance';
  let media;
  try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch { /* Light is the fallback. */ }
  const apply = () => {
    let preference = 'system';
    try {
      const saved = localStorage.getItem(key);
      if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
    } catch { /* Still follow the browser if storage is unavailable. */ }
    const theme = preference === 'system' ? media?.matches ? 'dark' : 'light' : preference;
    const root = document.documentElement;
    root.dataset.themePreference = preference;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#001d3d');
  };
  apply();
  if (media?.addEventListener) media.addEventListener('change', apply);
  else if (media?.addListener) media.addListener(apply);
  window.addEventListener('storage', event => { if (event.key === key || event.key === null) apply(); });
  window.addEventListener('pageshow', apply);
})();
