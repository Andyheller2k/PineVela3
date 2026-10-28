import { useId } from 'react';
import { useTheme } from '../context/ThemeContext';
import ThemeToggle from './ThemeToggle';
import HelpLink from './HelpLink';

export default function AppearanceSettings() {
  const headingId = useId();
  const statusId = useId();
  const { theme, preference, publicAppearance, savePending } = useTheme();
  const themeLabel = theme === 'dark' ? 'Dark' : 'Light';
  if (publicAppearance) return null;
  return <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4">
    <div><h3 id={headingId} className="text-lg font-bold text-slate-900">Appearance</h3>
      <p className="mt-1 text-sm text-slate-500">Choose a theme for login and product pages.</p></div>
    <div className="space-y-3">
      <ThemeToggle describedBy={statusId} />
      <p id={statusId} className="text-xs text-slate-500" role="status" aria-live="polite">{savePending
        ? 'Saved on this device. Syncing to your account…'
        : preference === 'system' ? `Following system default. ${themeLabel} mode is on.` : `${themeLabel} mode is on.`}</p>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4"><p className="text-sm text-slate-500">Have a question or need to report a problem?</p><HelpLink /></div>
  </section>;
}
