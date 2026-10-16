import PublicResidenceCatalog from './PublicResidenceCatalog';
import PublicHeader from './PublicHeader';
import PublicMarketCatalog from './PublicMarketCatalog';
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PineLogo from './PineLogo';
import ThemeEnvironment from './ThemeEnvironment';
import { Shield, Landmark, ShoppingBag } from 'lucide-react';
import { useLandingReveal } from '../hooks/useLandingReveal';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import CompanyStory from './CompanyStory';
import type { CompanySection } from './companyStoryContent';
import mountainPeak from '../../assets/pinepeak.jpg';


export default function Page1Public() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  useLandingReveal();
  const scrollToSection = (id: string) => {
    const section = document.getElementById(id);
    section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
  };
  const goToCompanySection = (id: CompanySection['id']) => scrollToSection(`story-${id}`);
  const requestedSection = searchParams.get('section');
  useEffect(() => {
    if (!requestedSection || !['about-us', 'our-vision', 'partner-with-us', 'contact-us'].includes(requestedSection)) return;
    const frame = requestAnimationFrame(() => scrollToSection(`story-${requestedSection}`));
    return () => cancelAnimationFrame(frame);
  }, [requestedSection]);

  useEffect(() => {
    document.documentElement.classList.add('landing-page-scrollbar-hidden');
    return () => document.documentElement.classList.remove('landing-page-scrollbar-hidden');
  }, []);

  return (
    <div className="landing-peak-page public-typography min-h-screen bg-transparent relative overflow-hidden font-sans pb-0">

      {/* Decorative background shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-30 -z-10" />

      <PublicHeader compact searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        onSearch={() => scrollToSection('catalogs-section')}
        onHome={() => scrollToSection('welcome-section')}
        onCompanySection={goToCompanySection} setShowLogoutConfirm={setShowLogoutConfirm} />

        {/* Welcome Section */}
        <section id="welcome-section"
          className="landing-peak-hero relative z-10 w-full scroll-mt-0"
        >
          <ThemeEnvironment embedded />
          <div className="landing-peak-landscape" aria-hidden="true">
            <img src={mountainPeak} alt="" fetchPriority="high" />
          </div>
          <div className="landing-peak-content max-w-7xl mx-auto w-full relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-8 lg:gap-12">
            <div
              className="landing-peak-copy lg:col-span-7 space-y-6"
            >
            <h1
              className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight"
            >
              Welcome to <br />
              <span className="text-blue-900 font-black relative">
                PineVela
                <span className="absolute bottom-1 left-0 w-full h-2 bg-amber-300 -z-10 rounded-sm opacity-60"></span>
              </span>
            </h1>

            <p
              className="text-base sm:text-lg text-slate-700 font-medium max-w-xl leading-relaxed"
            >
              The unified digital ecosystem connecting <strong className="text-blue-900 font-black">Properties</strong>, <strong className="text-blue-900 font-black">People</strong>, and <strong className="text-blue-900 font-black">Services</strong> into one seamless campus platform.
            </p>

            <div
              className="flex flex-wrap gap-4 pt-2"
            >
              <button
                id="btn-login"
                onClick={() => navigate('/login')}
                className="px-10 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-600/35 flex items-center gap-2 text-sm cursor-pointer"
              >
                <span>Login</span>
              </button>
            </div>

            <div className="pt-2" />
          </div>

          <div
            className="landing-peak-brand lg:col-span-5 flex justify-center"
          >
            {/* Visual Pineapple Illustration from Page 1 */}
            <div
              className="relative w-60 h-60 lg:w-80 lg:h-80 flex items-center justify-center p-6"
            >
              <div className="text-center space-y-4">
                <PineLogo size={140} hideText={true} />
                <div className="public-title font-extrabold text-2xl tracking-tight text-slate-900">
                  Pine<span className="text-blue-900">Vela</span>
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-widest font-mono">Premium Residences</div>
              </div>
            </div>
          </div>
          </div>
        </section>

      {/* Main Container */}
      <main className="w-full pt-0 space-y-16">

        <section id="catalogs-section" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-12 w-full mt-4 scroll-mt-32 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0">
          <div id="pinemarket-section" className="min-w-0 lg:pr-8"><PublicMarketCatalog preview searchQuery={searchQuery} /></div>
          <div id="hostels-section" className="min-w-0 border-t lg:border-t-0 lg:border-l border-slate-300/70 pt-8 lg:pt-0 lg:pl-8"><PublicResidenceCatalog preview searchQuery={searchQuery} /></div>
        </section>

        {/* Benefits Badges Section */}
        <section
          id="benefits"
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-16 bg-transparent border-none shadow-none pb-10"
        >
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          <div
            className="landing-benefit bg-transparent p-6 space-y-3"
          >
            <div className="w-10 h-10 flex items-center justify-center text-blue-900">
              <Shield size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Verified Properties</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Every hostel on PineVela is physically inspected for safety, hygiene, and amenity compliance.
            </p>
          </div>

          <div
            className="landing-benefit bg-transparent p-6 space-y-3"
          >
            <div className="w-10 h-10 flex items-center justify-center text-rose-500">
              <Landmark size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Easy Management</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Property owners can track occupancy, maintenance requests, and room access from a single powerful dashboard.
            </p>
          </div>

          <div
            className="landing-benefit bg-transparent p-6 space-y-3"
          >
            <div className="w-10 h-10 flex items-center justify-center text-blue-600">
              <ShoppingBag size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Student Digital Market</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Buy, sell, and trade accredited textbooks, electronics, appliances, dorm accessories, and campus services safely with fellow students on PineVela.
            </p>
          </div>
          </div>
        </section>

        <CompanyStory />
      </main>

      {/* Footer */}
      <footer
        id="footer-section"
        className="border-t border-blue-200/40 bg-blue-50/80 backdrop-blur-lg mt-20 pt-16 pb-12 px-6 md:px-12 w-full"
      >
        <div className="max-w-7xl mx-auto w-full">
          <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-8 pb-12 border-b border-blue-200/20">
            <div className="space-y-4">
              <PineLogo />
              <p className="text-xs text-slate-650 leading-relaxed font-medium">
                Making student trade and Hostel management easier.
              </p>
            </div>
            <div className="space-y-3 md:col-start-3">
              <h5 className="font-extrabold text-slate-900 text-sm tracking-wide">Company</h5>
              <ul className="space-y-2 text-xs text-slate-600 font-semibold">
                <li><button type="button" onClick={() => goToCompanySection('about-us')} className="hover:text-blue-900 transition-colors cursor-pointer">About Us</button></li>
                <li><button type="button" onClick={() => goToCompanySection('our-vision')} className="hover:text-blue-900 transition-colors cursor-pointer">Our Vision</button></li>
                <li><button type="button" onClick={() => goToCompanySection('partner-with-us')} className="hover:text-blue-900 transition-colors cursor-pointer">Partner with Us</button></li>
                <li><button type="button" onClick={() => goToCompanySection('contact-us')} className="hover:text-blue-900 transition-colors cursor-pointer">Contact</button></li>
              </ul>
            </div>


          </div>

          <div className="w-full pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 font-medium gap-4">
            <span>© 2026 PineVela Hosting Solutions. All rights reserved.</span>
            <span>Built for the modern campus.</span>
          </div>
        </div>
      </footer>

      {/* Logout Confirmation Modal */}
      <LogoutConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={async () => {
          if (!await logout()) return;
          setShowLogoutConfirm(false);
        }}
        userRole={user?.role}
        userName={user?.name}
      />
    </div>
  );
}
