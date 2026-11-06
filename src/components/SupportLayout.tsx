import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CircleHelp } from 'lucide-react';
import PineLogo from './PineLogo';
import { useAuth } from '../context/AuthContext';
import { useInstalledAppMode } from '../lib/appMode';
import ThemeToggle from './ThemeToggle';

export function supportHome(user: any) {
  if (!user) return '/';
  if (user.customerService) return '/customer-service';
  return ({ admin: '/admin/dashboard', manager: '/manager/dashboard', staff: '/staff/dashboard', merchant: '/digital-market', student: '/resident/dashboard', verification_team: '/field-officer' } as Record<string, string>)[user.role] || '/user/dashboard';
}
export default function SupportLayout({ children, publicPage = false }: { children: ReactNode; publicPage?: boolean }) {
  const { user } = useAuth();
  const installedApp = useInstalledAppMode();
  const home = !user && installedApp ? '/login' : supportHome(user);
  const { pathname } = useLocation();
  const currentPage = pathname.replace(/\/+$/, '') || '/';
  return <div className={`support-surface page-canvas min-h-dvh ${publicPage ? 'support-public-page' : ''}`}>
    <a className="public-skip-link" href="#support-main" onClick={event => { event.preventDefault(); document.getElementById('support-main')?.focus(); }}>Skip to content</a>
    <header data-portal-navigation="header" data-support-header className="border-b border-slate-200 px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link to={home} aria-label={!user && installedApp ? 'PineVela sign in' : 'PineVela home'}><PineLogo size={34} /></Link>
        <nav aria-label="Help navigation" className="flex items-center gap-2">
          <Link to={home} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-blue-800"><ArrowLeft size={16} aria-hidden="true" />{user ? 'Dashboard' : installedApp ? 'Sign in' : 'Home'}</Link>
          <Link to={`/faq?from=${publicPage ? '/faq' : encodeURIComponent(supportHome(user))}`} aria-current={currentPage === '/faq' ? 'page' : undefined} className="support-nav-link rounded-xl px-3 py-2 text-xs font-bold text-blue-800">FAQ</Link>
          <Link to={`/help?from=${publicPage ? '/faq' : encodeURIComponent(supportHome(user))}`} aria-current={currentPage === '/help' ? 'page' : undefined} className="support-nav-link inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-blue-800"><CircleHelp size={17} aria-hidden="true" />Help</Link>
        </nav>
        <ThemeToggle showSystemDefault={false} />
      </div>
    </header>
    <main id="support-main" tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">{children}</main>
    <footer className="support-footer mx-auto flex w-full max-w-6xl flex-wrap gap-x-6 gap-y-3 px-4 py-8 text-sm sm:px-8"><span>© {new Date().getFullYear()} PineVela</span><a href="/privacy.html">Privacy policy</a><a href="/terms.html">Terms of service</a><Link to="/notification-settings">Device notifications</Link></footer>
  </div>;
}
