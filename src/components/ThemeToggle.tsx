import { Monitor, Moon, Sun } from 'lucide-react';
import { useId } from 'react';
import { useTheme } from '../context/ThemeContext';

const choices = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System settings', Icon: Monitor },
] as const;

export default function ThemeToggle({ className = '', describedBy }: { className?: string; describedBy?: string }) {
  const name = useId();
  const { preference, publicAppearance, setPreference } = useTheme();
  if (publicAppearance) return null;
  return <div role="radiogroup" aria-label="Appearance theme" aria-describedby={describedBy} className={`theme-preference ${className}`}>
    {choices.map(({ value, label, Icon }) => <label key={value} className="theme-preference-choice">
      <input type="radio" name={name} value={value} checked={preference === value} onChange={() => setPreference(value)} className="theme-preference-input" />
      <span className="theme-preference-content"><Icon size={21} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span></span>
    </label>)}
  </div>;
}
