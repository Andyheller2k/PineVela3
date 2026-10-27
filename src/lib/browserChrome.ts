/** Browser/status-bar chrome follows the visible page, not the system theme. */
export function browserChromeColor(appearance: 'light' | 'dark', publicAppearance: boolean, authPage = false) {
  return appearance === 'light' && (!publicAppearance || authPage) ? '#ffffff' : '#001d3d';
}

export function applyBrowserChrome(appearance: 'light' | 'dark', publicAppearance: boolean) {
  const color = browserChromeColor(appearance, publicAppearance,
    document.documentElement.dataset?.authPage === 'true' || document.documentElement.dataset?.mobileAuth === 'true');
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color);
  // WebKit's fixed-edge sampler reads the opaque color directly when the
  // edge exceeds its 10px thin-border threshold and is above the full-screen
  // shell. Mobile installed headers reserve the same edge height so that its
  // opaque tint never covers controls. The entry document paints it at startup.
  document.documentElement.style.setProperty('--pv-chrome-color', color);
  document.documentElement.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
}
