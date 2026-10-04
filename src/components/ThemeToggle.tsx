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
  if (pathname === '/') return null;
  return <div className="theme-dock"><ThemeToggle /></div>;
}
