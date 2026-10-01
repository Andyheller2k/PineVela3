const NAVIGATION_LAYOUT_KEY = 'pinevela_navigation_layout';

export function usesTopNavigation(): boolean {
  try {
    return window.localStorage.getItem(NAVIGATION_LAYOUT_KEY) === 'top';
  } catch {
    return false;
  }
}

export function saveNavigationLayout(useTopNavigation: boolean): void {
  try {
    window.localStorage.setItem(NAVIGATION_LAYOUT_KEY, useTopNavigation ? 'top' : 'sidebar');
  } catch {
    // Navigation remains usable if browser storage is unavailable.
  }
}
