/** Browser/status-bar chrome follows the visible page, not the system theme. */
export function browserChromeColor(appearance: 'light' | 'dark', publicAppearance: boolean) {
  return appearance === 'light' && !publicAppearance ? '#ffffff' : '#001d3d';
}

export function applyBrowserChrome(appearance: 'light' | 'dark', publicAppearance: boolean) {
  const color = browserChromeColor(appearance, publicAppearance);
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color);
  // WebKit's fixed-edge sampler reads the opaque color directly when the
  // edge exceeds its 10px thin-border threshold. The entry document provides
  // a 12px minimum edge and matching page backing before React loads.
  document.documentElement.style.setProperty('--pv-chrome-color', color);
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
}
