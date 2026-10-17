import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/** Keep content and shortcuts above the mobile navigation without adding controls. */
export default function MobileNavigationLayout() {
  const { pathname } = useLocation();
  useLayoutEffect(() => {
    let measured: HTMLElement | null = null;
    const resize = new ResizeObserver(() => measure());
    const measure = () => {
      const visible = [...document.querySelectorAll<HTMLElement>('.mobile-bottom-nav')].find(element => element.getClientRects().length > 0) || null;
      if (visible !== measured) { resize.disconnect(); measured = visible; if (visible) resize.observe(visible); }
      document.documentElement.dataset.mobileNavigation = String(!!visible);
      document.documentElement.style.setProperty('--pv-mobile-nav-height', `${visible?.getBoundingClientRect().height || 0}px`);
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); delete document.documentElement.dataset.mobileNavigation; document.documentElement.style.removeProperty('--pv-mobile-nav-height'); };
  }, [pathname]);
  return null;
}
