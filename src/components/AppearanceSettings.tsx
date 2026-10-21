import { useId } from 'react';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import HelpLink from './HelpLink';

export default function AppearanceSettings() {
  const headingId = useId();
  const { theme, publicAppearance, savePending } = useTheme();
  if (publicAppearance) return null;
  return <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
    <div><h3 id={headingId} className="text-lg font-bold text-slate-900">Appearance</h3>
      <p className="mt-1 text-sm text-slate-500">Choose your theme for product pages.</p></div>
    <div className="flex items-center justify-between gap-4">
      <div><p className="text-sm font-bold text-slate-900">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</p>
        <p className="mt-1 text-xs text-slate-500" aria-live="polite">{savePending ? 'Saved on this device. Syncing to your account…' : `${theme === 'dark' ? 'Dark' : 'Light'} mode is on.`}</p></div>
      <ThemeToggle />
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Have a question or need to report a problem?</p><HelpLink /></div>
  </section>;
}
