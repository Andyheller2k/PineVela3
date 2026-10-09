import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CompanySection } from './companyStoryContent';
import PineLogo from './PineLogo';
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
  const headerRef = useRef<HTMLElement>(null);
  const onNavigate = () => navigate('/login');
  useLayoutEffect(() => {
    const measure = () => document.documentElement.style.setProperty('--pv-public-header-height', `${headerRef.current?.getBoundingClientRect().height || 100}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(headerRef.current!); measure();
    return () => observer.disconnect();
  }, []);
  return (
  <header ref={headerRef}
    id="public-header"
    className={`${compact ? 'public-header-compact public-header-card ' : ''}fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 md:px-12 py-3 bg-transparent backdrop-blur-none border-b border-transparent shadow-none transition-all duration-300`}
  >
    <div className={`max-w-7xl mx-auto w-full flex flex-col ${compact ? 'lg:grid lg:grid-cols-[1fr_minmax(0,390px)_1fr]' : 'lg:flex-row'} items-center justify-between gap-3 lg:gap-4`}>
      <button type="button" aria-label="PineVela home" className="cursor-pointer shrink-0 lg:justify-self-start" onClick={onHome}>
        <PineLogo />
      </button>
      
      {/* Global Search Bar with Search trigger */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          onSearch();
        }}
        className="relative w-full max-w-md flex items-center"
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
              onSearch();
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
          className="absolute right-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center lg:justify-self-end gap-2 text-sm font-medium shrink-0">
        <ThemeToggle className="company-theme-toggle" />
        {user ? (
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="text-xs font-bold text-slate-800 hidden sm:inline">
              {user.name} ({user.role})
            </span>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-extrabold rounded-xl text-xs shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Logout</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login?mode=register', { state: { mode: 'register' } })}
              className="public-header-secondary px-4 py-2 bg-white/90 hover:bg-white text-blue-800 border border-white font-extrabold rounded-xl text-xs shadow-sm backdrop-blur-md transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              Sign Up
            </button>
            <button
              onClick={() => onNavigate()}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              Login
            </button>
          </div>
        )}
        <button
          onClick={() => onCompanySection('about-us')}
          className="public-header-secondary px-3 py-2 bg-white/85 hover:bg-white text-slate-800 border border-white/80 font-semibold rounded-xl text-xs backdrop-blur-md cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          About Us
        </button>
      </div>
    </div>
  </header>
  );
}
