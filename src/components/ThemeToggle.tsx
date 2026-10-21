import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, publicAppearance, toggleTheme, savePending } = useTheme();
  if (publicAppearance) return null;
  const dark = theme === 'dark';
  return <button type="button" role="switch" aria-checked={dark} aria-label="Dark mode" onClick={toggleTheme}
    title={`${dark ? 'Switch to light mode' : 'Switch to dark mode'}${savePending ? ' · preference saved locally, syncing' : ''}`}
    className={`theme-toggle ${className}`} data-dark={dark}>
    <span className="theme-toggle-track" aria-hidden="true">
      <Sun className="theme-toggle-track-sun" size={19} strokeWidth={1.8} />
      <Moon className="theme-toggle-track-moon" size={18} strokeWidth={1.8} />
    </span>
    <span className="theme-toggle-thumb" aria-hidden="true">
      <Sun className="theme-toggle-icon theme-toggle-sun" size={22} strokeWidth={2} />
      <Moon className="theme-toggle-icon theme-toggle-moon" size={21} strokeWidth={2} />
    </span>
  </button>;
}
