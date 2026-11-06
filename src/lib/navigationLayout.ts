const NAVIGATION_LAYOUT_KEY = 'pinevela_navigation_layout';

export function usesCompactSidebar(): boolean {
  try {
    const saved = window.localStorage.getItem(NAVIGATION_LAYOUT_KEY);
    // Preserve the user's compact preference from the retired top-bar layout.
    return saved === 'compact' || saved === 'top';
  } catch {
    return false;
  }
}

export function saveNavigationLayout(compact: boolean): void {
  try {
    window.localStorage.setItem(NAVIGATION_LAYOUT_KEY, compact ? 'compact' : 'sidebar');
  } catch {
    // Navigation remains usable if browser storage is unavailable.
  }
}
