import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import HelpLink from './HelpLink';
import InstallAppButton from './InstallAppButton';
import { Compass, Search, X, LogOut, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CompanySection } from './companyStoryContent';
import PineLogo from './PineLogo';
import { useInstalledAppMode } from '../lib/appMode';
import ThemeToggle from './ThemeToggle';

interface Props {
  compact?: boolean;
  searchQuery: string; setSearchQuery: (value: string) => void;
  onSearch: () => void; onHome: () => void;
  onCompanySection: (section: CompanySection['id']) => void;
  setShowLogoutConfirm: (show: boolean) => void;
}
export default function PublicHeader({compact = false, searchQuery, setSearchQuery, onSearch, onHome, onCompanySection, setShowLogoutConfirm}: Props) {
  const navigate = useNavigate();
  const {user} = useAuth();
  const installedApp = useInstalledAppMode();
  const headerRef = useRef<HTMLElement>(null);
  const menuToggle = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const onNavigate = () => navigate('/login');
  const measure = () => document.documentElement.style.setProperty('--pv-public-header-height', `${headerRef.current?.getBoundingClientRect().height || 100}px`);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(measure);
    observer.observe(headerRef.current!); measure();
    return () => observer.disconnect();
  }, []);
  useEffect(() => { setMenuOpen(false); }, [location.pathname, location.search]);
  useEffect(() => {
    if (!menuOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setMenuOpen(false); menuToggle.current?.focus();
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !headerRef.current?.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', outside);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', outside);
    };
  }, [menuOpen]);
  useEffect(() => {
    const desktop = matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMenuOpen(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const closeAndRun = (action: () => void) => {
    if (!menuOpen) { action(); return; }
    setMenuOpen(false);
    // Read the collapsed height before a company/search anchor is positioned.
    requestAnimationFrame(() => { measure(); action(); });
  };
  return (
  <header ref={headerRef}
    id="public-header"
    data-menu-open={menuOpen}
    className={`public-header-card ${compact ? 'public-header-compact ' : ''}fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 md:px-12 py-3 bg-transparent border-b border-transparent shadow-none`}
  >
    <div className="public-header-layout max-w-7xl mx-auto w-full">
      <button type="button" aria-label={installedApp ? 'PineVela sign in' : 'PineVela home'} className="public-header-brand cursor-pointer shrink-0" onClick={() => closeAndRun(installedApp ? onNavigate : onHome)}>
        <PineLogo />
      </button>
      
      {/* Global Search Bar with Search trigger */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          closeAndRun(onSearch);
        }}
        className="public-header-search relative w-full flex items-center"
      >
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <Search size={compact ? 14 : 16} />
        </span>
        <input aria-label="Search for residence and items."
          type="text"
          placeholder="Search for residence and items."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              closeAndRun(onSearch);
            }
          }}
          className="w-full pl-10 pr-20 py-2 border border-blue-400/85 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/70 bg-white/20 backdrop-blur-md text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-[0_0_0_1px_rgba(0,119,182,0.16),0_0_18px_rgba(0,119,182,0.12)]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-[4.75rem] text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            aria-label="Clear search"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          className="public-header-link absolute right-1 rounded-lg transition-all"
        >
          Search
        </button>
      </form>

      <div className="public-header-tools">
        <InstallAppButton />
        <button ref={menuToggle} type="button" className="public-header-menu-toggle" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={menuOpen} aria-controls="public-header-panel" onClick={() => setMenuOpen(open => !open)}>
          {menuOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}<span>Menu</span>
        </button>
      </div>
      <div id="public-header-panel" className="public-header-panel">
        <nav aria-label="Main navigation" className="public-header-sections">
          <div className="public-header-discovery">
            {!installedApp && <>
              <NavLink to="/why-us" onClick={() => setMenuOpen(false)} className="public-header-link public-header-whyus"><Compass size={15} aria-hidden="true" />Why Us?</NavLink>
              <button type="button" onClick={() => closeAndRun(() => onCompanySection('about-us'))} className="public-header-link">About Us</button>
              <button type="button" onClick={() => closeAndRun(() => onCompanySection('our-vision'))} className="public-header-link">Our Vision</button>
              <button type="button" onClick={() => closeAndRun(() => onCompanySection('partner-with-us'))} className="public-header-link">Partner with Us</button>
              <button type="button" onClick={() => closeAndRun(() => onCompanySection('contact-us'))} className="public-header-link">Contact</button>
            </>}
          </div>
          <div className="public-header-support">
            <Link to={installedApp ? '/faq?from=/login' : '/faq?from=/'} onClick={() => setMenuOpen(false)} className="public-header-link">FAQ</Link>
            <HelpLink className="public-header-link" />
          </div>
          <ThemeToggle className="public-header-appearance" showSystemDefault={false} />
        </nav>
        {user ? (
          <div className="public-header-account">
            <span className="public-header-account-name" title={`${user.name} (${user.role})`}>
              {user.name} ({user.role})
            </span>
            <button
              type="button"
              onClick={() => closeAndRun(() => setShowLogoutConfirm(true))}
              className="public-header-account-button public-header-secondary"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <div className="public-header-account">
            <Link to="/login" onClick={() => setMenuOpen(false)} className="public-header-account-button public-header-secondary">Login</Link>
            <Link to="/login?mode=register" state={{ mode: 'register' }} onClick={() => setMenuOpen(false)} className="public-header-account-button public-header-primary">Sign Up</Link>
          </div>
        )}
      </div>
    </div>
  </header>
  );
}
