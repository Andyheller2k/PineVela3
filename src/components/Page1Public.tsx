import PublicResidenceCatalog from './PublicResidenceCatalog';
import PublicHeader from './PublicHeader';
import PublicMarketCatalog from './PublicMarketCatalog';
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import PineLogo, { PineWordmark } from './PineLogo';
import { ArrowUpRight, Shield, Landmark, ShoppingBag } from 'lucide-react';
import welcomeArtwork from '../../assets/landing-welcome-transparent.png';
import { useLandingReveal } from '../hooks/useLandingReveal';
import { useMotionActivity } from '../hooks/useMotionActivity';
import ArtworkLayers from './ArtworkLayers';
import { useAuth } from '../context/AuthContext';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import CompanyStory from './CompanyStory';
import type { CompanySection } from './companyStoryContent';
import '../landingMotion.css';
import '../whyUs.css';


export default function Page1Public() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const hero = useRef<HTMLElement>(null);
  const glassCard = useRef<HTMLDivElement>(null);
  useMotionActivity(hero);
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

  useEffect(() => {
    const scene = glassCard.current;
    if (!scene) return;
    const pointerMotion = window.matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)');
    const forcedColors = window.matchMedia('(forced-colors: active)');
    let bounds: DOMRect | undefined;
    const reset = () => {
      bounds = undefined;
      scene.style.removeProperty('--landing-art-rotate-x');
      scene.style.removeProperty('--landing-art-rotate-y');
      scene.removeAttribute('data-pointer-engaged');
    };
    const move = (event: PointerEvent) => {
      if (!pointerMotion.matches || forcedColors.matches || document.hidden || event.pointerType === 'touch') { reset(); return; }
      bounds ||= scene.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      const x = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1));
      const y = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1));
      scene.style.setProperty('--landing-art-rotate-x', `${(-y * 1.5).toFixed(2)}deg`);
      scene.style.setProperty('--landing-art-rotate-y', `${(x * 1.8).toFixed(2)}deg`);
      scene.setAttribute('data-pointer-engaged', 'true');
    };
    scene.addEventListener('pointermove', move, { passive: true });
    scene.addEventListener('pointerleave', reset);
    scene.addEventListener('pointercancel', reset);
    window.addEventListener('resize', reset, { passive: true });
    document.addEventListener('visibilitychange', reset);
    pointerMotion.addEventListener('change', reset);
    forcedColors.addEventListener('change', reset);
    return () => {
      reset();
      scene.removeEventListener('pointermove', move);
      scene.removeEventListener('pointerleave', reset);
      scene.removeEventListener('pointercancel', reset);
      window.removeEventListener('resize', reset);
      document.removeEventListener('visibilitychange', reset);
      pointerMotion.removeEventListener('change', reset);
      forcedColors.removeEventListener('change', reset);
    };
  }, []);

  return (
    <div className="landing-peak-page public-typography min-h-screen bg-transparent relative overflow-hidden font-sans pb-0">
      <a className="public-skip-link" href="#landing-main" onClick={event => { event.preventDefault(); document.getElementById('landing-main')?.focus(); }}>Skip to content</a>

      <PublicHeader compact searchQuery={searchQuery} setSearchQuery={setSearchQuery}
        onSearch={() => scrollToSection('catalogs-section')}
        onHome={() => scrollToSection('welcome-section')}
        onCompanySection={goToCompanySection} setShowLogoutConfirm={setShowLogoutConfirm} />

      <main id="landing-main" tabIndex={-1}>
        <section id="welcome-section" ref={hero}
          className="landing-peak-hero relative z-10 w-full scroll-mt-0"
          aria-labelledby="welcome-title"
        >
          <div className="landing-peak-content">
            <div className="landing-peak-copy">
              <h1 id="welcome-title">
                <span className="landing-peak-greeting">Welcome to</span>
                <PineWordmark />
              </h1>
              <p>
                Find your place. Discover campus sellers. Bring <strong>properties</strong>, <strong>people</strong> and <strong>services</strong> together with PineVela.
              </p>
              <button id="btn-login" type="button" className="landing-peak-cta"
                onClick={() => navigate('/login?mode=register', { state: { mode: 'register' } })}>
                <span>Create your free account</span>
                <ArrowUpRight size={19} aria-hidden="true" />
              </button>
              <nav className="landing-peak-shortcuts" aria-label="Explore PineVela">
                <button type="button" onClick={() => scrollToSection('pinemarket-section')}>
                  <ShoppingBag size={16} aria-hidden="true" /> PineMarket
                </button>
                <span aria-hidden="true" />
                <button type="button" onClick={() => scrollToSection('hostels-section')}>
                  <Landmark size={16} aria-hidden="true" /> PineResidence
                </button>
              </nav>
            </div>
            <div className="landing-peak-artwork">
              <img className="landing-peak-image" src={welcomeArtwork}
                width={1448} height={1086} fetchPriority="high" decoding="async"
                alt="A student connecting with campus life through shopping, conversations, and property management." />
              <ArtworkLayers variant="landing" />
              <div className="landing-peak-brand">
                <div className="landing-peak-brand-card" ref={glassCard}>
                  <PineLogo size={76} hideText />
                  <PineWordmark />
                  <span className="landing-peak-brand-caption">Premium Residences</span>
                </div>
              </div>
            </div>
          </div>
        </section>

      {/* Main Container */}
      <div className="landing-sections w-full pt-0 space-y-16">

        <section id="catalogs-section" className="relative max-w-7xl mx-auto px-4 sm:px-6 md:px-12 w-full mt-4 scroll-mt-32 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0">
          <div id="pinemarket-section" className="min-w-0 lg:pr-8"><PublicMarketCatalog preview searchQuery={searchQuery} /></div>
          <div id="hostels-section" className="min-w-0 border-t lg:border-t-0 lg:border-l border-slate-300/70 pt-8 lg:pt-0 lg:pl-8"><PublicResidenceCatalog preview searchQuery={searchQuery} /></div>
        </section>

        {/* Benefits Badges Section */}
        <section
          id="benefits"
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-16 pb-10"
        >
          <div className="landing-section-intro"><p className="company-eyebrow">A little less effort. A lot more campus life.</p><h2>Everything feels closer.</h2></div>
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-5 w-full">
          <div
            className="landing-benefit bg-transparent p-6 space-y-3"
          >
            <div className="w-10 h-10 flex items-center justify-center text-blue-900">
              <Shield size={20} />
            </div>
            <h3 className="font-extrabold text-slate-900 text-lg">Verified Properties</h3>
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
            <h3 className="font-extrabold text-slate-900 text-lg">Easy Management</h3>
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
            <h3 className="font-extrabold text-slate-900 text-lg">Student Digital Market</h3>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Buy, sell, and trade accredited textbooks, electronics, appliances, dorm accessories, and campus services safely with fellow students on PineVela.
            </p>
          </div>
          </div>
        </section>

        <CompanyStory />
        <section className="why-us-preview" aria-labelledby="why-us-preview-title">
          <div><p className="why-us-eyebrow">Built around your student day</p>
            <h2 id="why-us-preview-title">Why choose PineVela?</h2>
            <p>Less chasing. More student life. See how PineVela brings clearer buying, selling and hostel living to campus.</p>
          </div>
          <Link to="/why-us" className="why-us-primary">See the difference<ArrowUpRight size={18} aria-hidden="true" /></Link>
        </section>
      </div>
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
                <li><Link to="/why-us" className="hover:text-blue-900 transition-colors">Why Us?</Link></li>
                <li><button type="button" onClick={() => goToCompanySection('about-us')} className="hover:text-blue-900 transition-colors cursor-pointer">About Us</button></li>
                <li><button type="button" onClick={() => goToCompanySection('our-vision')} className="hover:text-blue-900 transition-colors cursor-pointer">Our Vision</button></li>
                <li><button type="button" onClick={() => goToCompanySection('partner-with-us')} className="hover:text-blue-900 transition-colors cursor-pointer">Partner with Us</button></li>
                <li><button type="button" onClick={() => goToCompanySection('contact-us')} className="hover:text-blue-900 transition-colors cursor-pointer">Contact</button></li>
                <li><a href="/privacy.html" className="hover:text-blue-900 transition-colors">Privacy policy</a></li>
                <li><a href="/terms.html" className="hover:text-blue-900 transition-colors">Terms of service</a></li>
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
