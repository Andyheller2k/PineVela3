import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '', describedBy, showSystemDefault = true }: { className?: string; describedBy?: string; showSystemDefault?: boolean }) {
  const { theme, preference, appearanceLocked, setPreference, toggleTheme } = useTheme();
  if (appearanceLocked) return null;
  const dark = theme === 'dark';
  return <div role="group" aria-label="Appearance theme" aria-describedby={describedBy} className={`theme-preference ${className}`}>
    <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggleTheme}
      className="theme-toggle" data-dark={dark} data-system={preference === 'system'}
      title={`${dark ? 'Switch to light mode' : 'Switch to dark mode'}${preference === 'system' ? ' · following system default' : ''}`}>
      <span className="theme-toggle-track" aria-hidden="true">
        <Sun className="theme-toggle-track-sun" size={19} strokeWidth={1.8} />
        <Moon className="theme-toggle-track-moon" size={18} strokeWidth={1.8} />
      </span>
      <span className="theme-toggle-thumb" aria-hidden="true">
        <Sun className="theme-toggle-icon theme-toggle-sun" size={22} strokeWidth={2} />
        <Moon className="theme-toggle-icon theme-toggle-moon" size={21} strokeWidth={2} />
      </span>
    </button>
    {showSystemDefault && <button type="button" aria-pressed={preference === 'system'} onClick={() => setPreference('system')} className="theme-preference-choice theme-system-choice">
      <span className="theme-preference-content"><Monitor size={18} strokeWidth={1.8} aria-hidden="true" /><span>System default</span></span>
    </button>}
  </div>;
}
