import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggleTheme, savePending } = useTheme();
  const dark = theme === 'dark';
  return <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggleTheme}
    title={`${dark ? 'Switch to light mode' : 'Switch to dark mode'}${savePending ? ' · preference saved locally, syncing' : ''}`}
    className={`theme-toggle ${className}`} data-dark={dark}>
    <span className="theme-toggle-cloud cloud-one" aria-hidden="true" />
    <span className="theme-toggle-cloud cloud-two" aria-hidden="true" />
    <span className="theme-toggle-stars" aria-hidden="true">✦ · ✧</span>
    <span className="theme-toggle-orb" aria-hidden="true"><i /><i /><i /></span>
  </button>;
}

/** Public header has its own switch; other routes share this unobtrusive account control. */
export function ThemeDock() {
  const { pathname } = useLocation();
  const [bar, setBar] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    let measured: HTMLElement | null = null;
    const resize = new ResizeObserver(() => measure());
    const measure = () => {
      const visible = [...document.querySelectorAll<HTMLElement>('.mobile-bottom-nav')].find(element => element.getClientRects().length > 0) || null;
      if (visible !== measured) { resize.disconnect(); measured = visible; if (visible) resize.observe(visible); }
      document.documentElement.dataset.mobileNavigation = String(!!visible);
      document.documentElement.style.setProperty('--pv-mobile-nav-height', `${visible?.getBoundingClientRect().height || 0}px`);
      setBar(visible?.querySelector<HTMLElement>('[data-mobile-nav-items]') || visible);
    };
    const observer = new MutationObserver(measure);
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', measure); delete document.documentElement.dataset.mobileNavigation; };
  }, [pathname]);
  if (bar) return createPortal(<div className="mobile-nav-theme flex shrink-0 flex-col items-center justify-center gap-1 px-2"><ThemeToggle /><span className="text-[9px] font-bold text-slate-500">Theme</span></div>, bar);
  if (pathname === '/' || pathname === '/pinemarket') return null;
  return <div className="theme-dock"><ThemeToggle /></div>;
}
