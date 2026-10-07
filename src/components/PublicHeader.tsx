import { useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, LogOut, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { CompanySection } from './companyStoryContent';
import PineLogo from './PineLogo';
import ThemeToggle from './ThemeToggle';

interface Props {
  searchQuery: string; setSearchQuery: (value: string) => void;
  onSearch: () => void; onHome: () => void;
  setCompanyStorySection: (section: CompanySection['id']) => void;
  setShowLogoutConfirm: (show: boolean) => void;
}
export default function PublicHeader({searchQuery, setSearchQuery, onSearch, onHome, setCompanyStorySection, setShowLogoutConfirm}: Props) {
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
    className="fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 md:px-12 py-3 bg-transparent backdrop-blur-none border-b border-transparent shadow-none transition-all duration-300"
  >
    <div className="max-w-7xl mx-auto w-full flex flex-col lg:flex-row items-center justify-between gap-3 lg:gap-4">
      <button type="button" aria-label="PineVela home" className="cursor-pointer shrink-0" onClick={onHome}>
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
          <Search size={16} />
        </span>
        <input
          type="text"
          placeholder="Search for hostels, locations, or staff names..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onSearch();
            }
          }}
          className="w-full pl-10 pr-20 py-2 border border-blue-400/85 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/70 bg-white/20 backdrop-blur-md text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-[0_0_0_1px_rgba(59,130,246,0.28),0_0_18px_rgba(59,130,246,0.32)]"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-14 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
        <button
          type="submit"
          className="absolute right-1 px-3 py-1 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-xs"
        >
          Search
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-medium shrink-0">
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
              className="px-4 py-2 bg-white/90 hover:bg-white text-blue-800 border border-white font-extrabold rounded-xl text-xs shadow-sm backdrop-blur-md transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              Sign Up
            </button>
            <button
              onClick={() => onNavigate()}
              className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer hover:scale-102 active:scale-98"
            >
              Login
            </button>
          </div>
        )}
        <button
          onClick={() => setCompanyStorySection('about-us')}
          aria-haspopup="dialog"
          className="px-3 py-2 bg-white/85 hover:bg-white text-slate-800 border border-white/80 font-semibold rounded-xl text-xs backdrop-blur-md cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
        >
          About Us <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
    </div>
  </header>
  );
}
