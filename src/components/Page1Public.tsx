import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hostel } from '../types';
import PineLogo from './PineLogo';
import { Search, MapPin, Phone, ArrowRight, X, Sparkles, Shield, User, Landmark, ChevronDown, LogOut, ShieldCheck, Wifi, Zap, BedDouble, Building2, CheckCircle2, ChevronLeft, ChevronRight, Maximize2, ImageIcon, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuth } from '../context/AuthContext';
import { } from '../lib/api';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import CompanyStory from './CompanyStory';
import type { CompanySection } from './companyStoryContent';
import { } from '../utils/formValidation';

import dayImage from '../../assets/pinevela-day.webp';
import nightImage from '../../assets/pinevela-night.webp';
import ThemeToggle from './ThemeToggle';

interface Page1PublicProps {
  hostels: Hostel[];
  onSelectHostel: (hostel: Hostel) => void;
  selectedHostel: Hostel | null;
  onCloseDrawer: () => void;
  onNavigate: (screen: 'student-login' | 'manager-login') => void;
}

export default function Page1Public({
  hostels,
  onSelectHostel,
  selectedHostel,
  onCloseDrawer,
  onNavigate
}: Page1PublicProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [companyStorySection, setCompanyStorySection] = useState<CompanySection['id'] | null>(null);

  // Light-box gallery states
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  useEffect(() => {
    setActiveImageIndex(0);
  }, [selectedHostel]);

  const getGalleryImages = (hostel: any): string[] => {
    if (!hostel) return [];
    
    const list: string[] = [];
    
    // Add primary exterior photo if provided
    const mainImg = hostel.image || hostel.imageUrl || hostel.exteriorPhotoUrl || hostel.imagePreviewUrl;
    if (mainImg && typeof mainImg === 'string' && mainImg.trim()) {
      list.push(mainImg.trim());
    }

    // Add gallery photographs uploaded during manager registration
    if (Array.isArray(hostel.gallery) && hostel.gallery.length > 0) {
      hostel.gallery.forEach((g: string) => {
        if (g && typeof g === 'string' && g.trim() && !list.includes(g.trim())) {
          list.push(g.trim());
        }
      });
    } else if (Array.isArray(hostel.images) && hostel.images.length > 0) {
      hostel.images.forEach((g: string) => {
        if (g && typeof g === 'string' && g.trim() && !list.includes(g.trim())) {
          list.push(g.trim());
        }
      });
    }

    if (list.length > 0) {
      return list;
    }

    // Absolute fallback for mock data only
    if (mainImg) return [mainImg];
    return ['https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80'];
  };


  useEffect(() => {
    document.documentElement.classList.add('landing-page-scrollbar-hidden');
    return () => document.documentElement.classList.remove('landing-page-scrollbar-hidden');
  }, []);

  // Filter logic
  const filteredHostels = (hostels || []).filter((hostel) => {
    if (!hostel) return false;
    const query = (searchQuery || '').toLowerCase().trim();
    const name = (hostel.name || '').toLowerCase();
    const loc = (hostel.location || '').toLowerCase();
    const matchesSearch = name.includes(query) || loc.includes(query);
    
    return matchesSearch;
  });

  return (
    <div className="min-h-screen bg-transparent relative overflow-hidden font-sans pb-0">

      {/* Decorative background shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-30 -z-10" />

      {/* Fixed Header Bar at top with frost/glassmorphism */}
      <header
        id="public-header"
        className="fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 md:px-12 py-3 bg-transparent backdrop-blur-none border-b border-transparent shadow-none transition-all duration-300"
      >
        <div className="max-w-7xl mx-auto w-full flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
          <div className="cursor-pointer shrink-0" onClick={() => {
            document.getElementById('welcome-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>
            <PineLogo />
          </div>
          
          {/* Global Search Bar with Search trigger */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              document.getElementById('hostels-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                  document.getElementById('hostels-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

          <div className="flex items-center gap-3 text-sm font-medium shrink-0">
            <ThemeToggle />
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
                  onClick={() => onNavigate('student-login')}
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
      {companyStorySection && <CompanyStory initialSection={companyStorySection} onClose={() => setCompanyStorySection(null)} />}

      {/* Top Section Container holding Welcome Section with Welcome Background Image covering entire top */}
      <div className="relative overflow-hidden rounded-b-[4.5rem] w-full border-none shadow-none pt-24 sm:pt-28 md:pt-32">
        {/* Background Image covering entire top section */}
        <div className="absolute inset-0 z-0 w-full h-full">
          <img src={dayImage} alt="" fetchPriority="high" className="landing-theme-image landing-day" />
          <img src={nightImage} alt="" className="landing-theme-image landing-night" />
          <div className="landing-theme-shade absolute inset-0" />
        </div>

        {/* Welcome Section */}
        <section 
          id="welcome-section" 
          className="relative z-10 w-full py-8 md:py-16 px-6 md:px-12 scroll-mt-28"
        >
          <div className="max-w-7xl mx-auto w-full relative z-10 grid grid-cols-1 lg:grid-cols-12 items-center gap-12 pb-8">
            <motion.div 
              className="lg:col-span-7 bg-blue-50/80 backdrop-blur-lg p-8 md:p-10 rounded-3xl border border-blue-200/50 shadow-2xl space-y-6"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: {
                    staggerChildren: 0.15
                  }
                }
              }}
            >
            <motion.h1 
              className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-900 leading-tight"
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
              }}
            >
              Welcome to <br />
              <span className="text-blue-900 font-black relative">
                PineVela
                <span className="absolute bottom-1 left-0 w-full h-2 bg-amber-300 -z-10 rounded-sm opacity-60"></span>
              </span>
            </motion.h1>

            <motion.p 
              className="text-base sm:text-lg text-slate-700 font-medium max-w-xl leading-relaxed"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
              }}
            >
              The unified digital ecosystem connecting <strong className="text-blue-900 font-black">Properties</strong>, <strong className="text-blue-900 font-black">People</strong>, and <strong className="text-blue-900 font-black">Services</strong> into one seamless campus platform.
            </motion.p>

            <motion.div 
              className="flex flex-wrap gap-4 pt-2"
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
              }}
            >
              <button
                id="btn-login"
                onClick={() => onNavigate('student-login')}
                className="px-10 py-3.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow-lg shadow-blue-900/20 transition-all transform hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/35 flex items-center gap-2 text-sm cursor-pointer"
              >
                <span>Login</span>
              </button>
            </motion.div>

            <div className="pt-2" />
          </motion.div>

          <motion.div 
            className="lg:col-span-5 flex justify-center"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
            transition={{
              opacity: { duration: 0.8 },
              scale: { duration: 0.8 },
              y: { duration: 6, repeat: Infinity, ease: "easeInOut" }
            }}
          >
            {/* Visual Pineapple Illustration from Page 1 */}
            <motion.div 
              className="relative w-72 h-72 md:w-80 md:h-80 bg-blue-50/80 backdrop-blur-lg rounded-3xl shadow-2xl flex items-center justify-center p-8 border border-blue-200/50 cursor-pointer"
              whileHover={{ 
                scale: 1.05, 
                rotate: 2,
                boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.15)"
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              {/* Abstract decorative circles behind logo */}
              <div className="landing-decoration-blue absolute -bottom-4 -right-4 w-48 h-48 bg-blue-100/50 rounded-full -z-10" />
              <div className="landing-decoration-amber absolute -top-4 -left-4 w-24 h-24 bg-amber-100/50 rounded-full -z-10" />
              <div className="text-center space-y-4">
                <PineLogo size={140} hideText={true} />
                <div className="font-extrabold text-2xl tracking-tight text-slate-900">
                  Pine<span className="text-blue-900">Vela</span>
                </div>
                <div className="text-xs text-slate-500 uppercase tracking-widest font-mono">Premium Residences</div>
              </div>
            </motion.div>
          </motion.div>
          </div>
        </section>
      </div>

      {/* Main Container */}
      <main className="w-full pt-0 space-y-16">

        {/* Available Hostels Section */}
        <motion.section 
          id="hostels-section" 
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-16 bg-transparent border-none shadow-none scroll-mt-28"
          initial={{ opacity: 0.3, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.08 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="relative z-10 space-y-8 w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-200/40">
              <div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Available Residences</h2>
                <p className="text-slate-700 font-medium text-sm mt-1">Browse high-quality student accommodations across all campus zones.</p>
                {/* Status Color Guide */}
                <div className="flex items-center gap-6 text-xs text-slate-600 font-bold mt-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    OPEN
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    FULL
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                    MAINTENANCE
                  </span>
                </div>
              </div>

            </div>

          {/* Grid of Hostels */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {filteredHostels.map((hostel, index) => {
              const isOpen = hostel.status === 'Open' || (hostel.status as any) === 'active';
              const isMaintenance = hostel.status === 'Under Maintenance';
              const isFull = hostel.status === 'Full';

              let statusColor = 'bg-emerald-500 text-white';
              let statusText = 'Open';
              if (isMaintenance) {
                statusColor = 'bg-amber-500 text-white';
                statusText = 'Under Maintenance';
              } else if (isFull) {
                statusColor = 'bg-rose-500 text-white';
                statusText = 'Full';
              }

              return (
                <motion.div
                  key={hostel.id || index}
                  className="bg-white rounded-2xl overflow-hidden border border-slate-100 shadow-sm flex flex-col group cursor-pointer hostel-radiant-glow"
                  onClick={() => onSelectHostel(hostel)}
                  initial={{ opacity: 0, y: 35 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.5, delay: (index % 4) * 0.1 }}
                  whileHover={{ 
                    y: -10, 
                    scale: 1.02,
                    boxShadow: "0 25px 40px -15px rgb(0 0 0 / 0.15)"
                  }}
                >
                  {/* Image and Status Ribbon */}
                  <div className="relative h-44 w-full bg-slate-100 overflow-hidden">
                    <img
                      src={hostel?.image || hostel?.imageUrl || (hostel as any)?.exteriorPhotoUrl || (hostel as any)?.imagePreviewUrl || (hostel as any)?.images?.[0] || 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80'}
                      alt={hostel?.name || 'Hostel'}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=800&q=80';
                      }}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    
                    {/* Status Pill */}
                    <div className="absolute top-3 left-3 flex flex-col gap-1 items-start">
                      <span className={`text-[10px] uppercase tracking-wider font-extrabold px-2.5 py-1 rounded-full ${statusColor}`}>
                        {statusText}
                      </span>
                      <span className="bg-blue-900/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-sm backdrop-blur-sm">
                        {hostel.bedsLeft ?? hostel.availableSpaces ?? hostel.totalCapacity ?? 0} BEDS LEFT
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-base tracking-tight group-hover:text-blue-900 transition-colors">
                        {hostel.name}
                      </h3>
                      <div className="flex items-center gap-1 text-slate-400 text-xs mt-1">
                        <MapPin size={13} className="shrink-0" />
                        <span className="truncate">{hostel.location}</span>
                      </div>
                    </div>

                    {/* Manager Details */}
                    <div className="pt-3 border-t border-slate-100 flex items-center gap-3">
                      {hostel.managerPhoto || (hostel as any).managerAvatar ? (
                        <img
                          src={hostel.managerPhoto || (hostel as any).managerAvatar}
                          alt={hostel.managerName || 'Manager'}
                          className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-xs shrink-0"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-900 overflow-hidden border border-blue-200 shrink-0 flex items-center justify-center font-bold text-xs">
                          {hostel.managerName?.[0] || hostel.name?.[0] || 'M'}
                        </div>
                      )}
                      <div className="text-left text-xs min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-slate-800 truncate">{hostel.managerName || 'Resident Manager'}</p>
                          <span className="text-[9px] font-extrabold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.2 rounded shrink-0">Verified</span>
                        </div>
                        <p className="text-slate-400 text-[10px] font-medium">Hostel Manager</p>
                        <p className="text-slate-500 text-[10px] flex items-center gap-1 mt-0.5">
                          <Phone size={10} className="text-slate-400" />
                          <span>{hostel.managerPhone || '+233 24 123 4567'}</span>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectHostel(hostel);
                      }}
                      className="w-full mt-2 py-2 px-4 rounded-xl border border-slate-200 hover:border-blue-900 hover:bg-blue-50/50 text-slate-700 hover:text-blue-900 text-xs font-bold transition-all flex items-center justify-between"
                    >
                      <span>View Details</span>
                      <ArrowRight size={14} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {filteredHostels.length === 0 && (
            <div className="text-center py-12 bg-blue-50/80 backdrop-blur-lg rounded-3xl border border-blue-200/50 shadow-xl p-8 space-y-3">
              <p className="text-slate-700 font-semibold text-sm">No hostels found matching the filters.</p>
              <button
                onClick={() => setSearchQuery('')}
                className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white text-xs font-extrabold rounded-xl shadow-md transition-all cursor-pointer inline-block"
              >
                Clear filters
              </button>
            </div>
          )}
          </div>
        </motion.section>

        {/* Benefits Badges Section */}
        <motion.section 
          id="benefits" 
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-16 bg-transparent border-none shadow-none pb-10"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: {
                staggerChildren: 0.15
              }
            }
          }}
        >
          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
          <motion.div 
            className="bg-blue-50/20 backdrop-blur-sm p-6 rounded-2xl border border-blue-200/20 shadow-md space-y-3 cursor-pointer"
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
            }}
            whileHover={{ 
              y: -8, 
              scale: 1.02,
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-900">
              <Shield size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Verified Properties</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Every hostel on PineVela is physically inspected for safety, hygiene, and amenity compliance.
            </p>
          </motion.div>

          <motion.div 
            className="bg-blue-50/20 backdrop-blur-sm p-6 rounded-2xl border border-blue-200/20 shadow-md space-y-3 cursor-pointer"
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
            }}
            whileHover={{ 
              y: -8, 
              scale: 1.02,
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500">
              <Landmark size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Easy Management</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Property owners can track occupancy, maintenance requests, and room access from a single powerful dashboard.
            </p>
          </motion.div>

          <motion.div 
            className="bg-blue-50/20 backdrop-blur-sm p-6 rounded-2xl border border-blue-200/20 shadow-md space-y-3 cursor-pointer"
            variants={{
              hidden: { opacity: 0, y: 30 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
            }}
            whileHover={{ 
              y: -8, 
              scale: 1.02,
              boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
            }}
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <ShoppingBag size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Student Digital Market</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Buy, sell, and trade accredited textbooks, electronics, appliances, dorm accessories, and campus services safely with fellow students on PineVela.
            </p>
          </motion.div>
          </div>
        </motion.section>



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
                <li><button type="button" onClick={() => setCompanyStorySection('about-us')} aria-haspopup="dialog" className="hover:text-blue-900 transition-colors cursor-pointer">About Us</button></li>
                <li><button type="button" onClick={() => setCompanyStorySection('our-vision')} aria-haspopup="dialog" className="hover:text-blue-900 transition-colors cursor-pointer">Our Vision</button></li>
                <li><button type="button" onClick={() => setCompanyStorySection('partner-with-us')} aria-haspopup="dialog" className="hover:text-blue-900 transition-colors cursor-pointer">Partner with Us</button></li>
                <li><button type="button" onClick={() => setCompanyStorySection('contact-us')} aria-haspopup="dialog" className="hover:text-blue-900 transition-colors cursor-pointer">Contact</button></li>
              </ul>
            </div>


          </div>

          <div className="w-full pt-6 flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 font-medium gap-4">
            <span>© 2026 PineVela Hosting Solutions. All rights reserved.</span>
            <span>Built for the modern campus.</span>
          </div>
        </div>
      </footer>

      {/* Page 2: Enlarged Full-Screen Hostel Details View */}
      <AnimatePresence>
        {selectedHostel && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-gradient-to-br from-sky-100 via-blue-50 to-indigo-100/95 backdrop-blur-3xl overflow-y-auto flex flex-col"
          >
            {/* Top Full-Width Header Bar */}
            <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-sky-200/80 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-3">
                <button
                  onClick={onCloseDrawer}
                  className="px-3.5 py-2 bg-sky-100/80 hover:bg-sky-200/80 text-sky-950 font-black rounded-xl text-xs transition-colors flex items-center gap-2 cursor-pointer border border-sky-200/60"
                >
                  <ArrowRight className="w-4 h-4 rotate-180" />
                  <span>Back to All Hostels</span>
                </button>
                <div className="hidden sm:flex items-center gap-2 border-l border-sky-200/80 pl-3">
                  <span className="text-sm font-black text-slate-950">{selectedHostel.name}</span>
                  <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-emerald-100 text-emerald-900 rounded-md border border-emerald-200">
                    PineVela Accredited
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={onCloseDrawer}
                  className="w-9 h-9 rounded-full bg-sky-100/80 hover:bg-sky-200 text-sky-900 flex items-center justify-center transition-colors cursor-pointer border border-sky-200/60"
                  title="Close Full Screen View"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-8 text-slate-950">
              {/* Full Screen Banner / Hero Image with Multi-Photo Lightbox Controls */}
              <div className="relative w-full h-[320px] sm:h-[420px] md:h-[480px] rounded-3xl overflow-hidden shadow-2xl border border-white/80 bg-blue-50 group">
                <img
                  src={getGalleryImages(selectedHostel)[activeImageIndex]}
                  alt={`${selectedHostel.name} - View ${activeImageIndex + 1}`}
                  referrerPolicy="no-referrer"
                  onClick={() => setIsLightboxOpen(true)}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80';
                  }}
                  className="w-full h-full object-cover group-hover:scale-102 transition-transform duration-700 cursor-pointer"
                  title="Click to expand full screen lightbox gallery"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-sky-950/80 via-sky-950/25 to-transparent pointer-events-none" />

                {/* Left navigation arrow inside banner */}
                {activeImageIndex > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex(activeImageIndex - 1);
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-md cursor-pointer border border-white/20 z-10"
                    title="Previous Photo"
                  >
                    <ChevronLeft size={20} />
                  </button>
                )}

                {/* Right navigation arrow inside banner */}
                {activeImageIndex < getGalleryImages(selectedHostel).length - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveImageIndex(activeImageIndex + 1);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-900/60 hover:bg-slate-900/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 backdrop-blur-md cursor-pointer border border-white/20 z-10"
                    title="Next Photo"
                  >
                    <ChevronRight size={20} />
                  </button>
                )}

                {/* Lightbox Expand Trigger floating button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsLightboxOpen(true);
                  }}
                  className="absolute top-4 left-4 bg-slate-900/65 hover:bg-slate-900/85 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-lg backdrop-blur-md flex items-center gap-2 cursor-pointer border border-white/20 opacity-90 hover:opacity-100 transition-all z-10"
                >
                  <Maximize2 size={13} />
                  <span>Showcase Gallery ({getGalleryImages(selectedHostel).length})</span>
                </button>

                {/* Badges Floating Top Right */}
                <div className="absolute top-4 right-4 flex flex-wrap gap-2 items-center z-10">
                  <span className="bg-emerald-500/95 text-white text-xs font-black px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck size={14} />
                    <span>{selectedHostel.status || 'Active Accreditation'}</span>
                  </span>
                  <span className="bg-blue-900/95 text-white text-xs font-black px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md uppercase tracking-wider flex items-center gap-1.5">
                    <BedDouble size={14} />
                    <span>{selectedHostel.bedsLeft ?? selectedHostel.availableSpaces ?? selectedHostel.totalCapacity ?? 0} Beds Available</span>
                  </span>
                </div>

                {/* Hero Overlay Details Bottom Left */}
                <div className="absolute bottom-6 left-6 right-6 flex flex-col md:flex-row md:items-end justify-between gap-4 text-white z-10 pointer-events-none">
                  <div className="space-y-2 max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-400 text-slate-950 text-[10px] font-black uppercase px-2.5 py-1 rounded-md tracking-wider">
                        Premium Residence
                      </span>
                      <span className="text-xs font-semibold text-slate-200 flex items-center gap-1">
                        <MapPin size={13} className="text-amber-400" />
                        {selectedHostel.location}
                      </span>
                    </div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-md">
                      {selectedHostel.name}
                    </h1>
                  </div>

                  <div className="bg-white/15 backdrop-blur-xl border border-white/30 p-4 rounded-2xl flex flex-col items-start md:items-end shrink-0 shadow-2xl pointer-events-auto"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">Accredited residence</span><span className="text-sm font-black text-amber-300">Availability confirmed after approval</span></div>
                </div>
              </div>

              {/* Thumbnail Gallery Row */}
              <div className="flex items-center gap-3 bg-white/45 backdrop-blur-md border border-sky-100/60 p-3 rounded-2xl shadow-md overflow-x-auto">
                <div className="flex items-center gap-1 shrink-0 text-sky-950 font-black text-xs mr-2">
                  <ImageIcon size={14} className="text-blue-600 animate-pulse" />
                  <span>Explore Rooms:</span>
                </div>
                {getGalleryImages(selectedHostel).map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveImageIndex(idx)}
                    className={`relative w-20 h-14 rounded-xl overflow-hidden shrink-0 transition-all duration-300 cursor-pointer ${
                      activeImageIndex === idx 
                        ? 'ring-4 ring-blue-600 scale-105 border-transparent shadow-lg' 
                        : 'opacity-70 hover:opacity-100 border border-slate-200'
                    }`}
                  >
                    <img 
                      src={imgUrl} 
                      alt={`Thumbnail ${idx + 1}`} 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=200&q=80';
                      }}
                    />
                  </button>
                ))}
              </div>

              {/* Highlighted Stat Cards Grid (Crystal Glass Tabs) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white/70 backdrop-blur-xl p-5 rounded-2xl border border-white/90 shadow-lg shadow-sky-900/5 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Total Capacity</span>
                  <span className="text-2xl font-black text-slate-950 mt-1">{selectedHostel.totalCapacity ?? 120} Beds</span>
                  <span className="text-xs text-slate-700 mt-1 font-bold">Fully certified beds</span>
                </div>

                <div className="bg-emerald-50/70 backdrop-blur-xl border border-emerald-200/80 p-5 rounded-2xl shadow-lg shadow-emerald-900/5 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">Available Spaces</span>
                  <span className="text-2xl font-black text-emerald-950 mt-1">
                    {selectedHostel.bedsLeft ?? selectedHostel.availableSpaces ?? 0} Beds Left
                  </span>
                  <span className="text-xs text-emerald-900 mt-1 font-bold">Ready for room activation</span>
                </div>

                <div className="bg-blue-50/70 backdrop-blur-xl border border-blue-200/80 p-5 rounded-2xl shadow-lg shadow-blue-900/5 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-900">Verification Status</span>
                  <span className="text-xl font-black text-blue-950 mt-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-5 h-5 text-blue-800" />
                    <span>Verified Hostel</span>
                  </span>
                  <span className="text-xs text-blue-900 mt-1 font-bold">Inspected & Accredited</span>
                </div>

                <div className="bg-amber-50/70 backdrop-blur-xl border border-amber-200/80 p-5 rounded-2xl shadow-lg shadow-amber-900/5 flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-900">Campus Proximity</span>
                  <span className="text-xl font-black text-amber-950 mt-1">
                    {selectedHostel?.campusProximity || (selectedHostel as any)?.campus_proximity || '5-10 Mins Walk'}
                  </span>
                  <span className="text-xs text-amber-900 mt-1 font-bold">
                    {selectedHostel?.campusProximityDetails || (selectedHostel as any)?.campus_proximity_details || 'Shuttle & walking routes'}
                  </span>
                </div>
              </div>

              {/* Two-Column Deep Details Section */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column (8 cols) */}
                <div className="lg:col-span-8 space-y-8">
                  {/* Property Overview Crystal Glass Card */}
                  <div className="bg-white/70 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/90 shadow-lg shadow-sky-900/5 space-y-4">
                    <h2 className="text-xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-blue-900" />
                      <span>About {selectedHostel.name}</span>
                    </h2>
                    <p className="text-sm text-slate-800 leading-relaxed font-semibold">
                      {selectedHostel.description && selectedHostel.description.trim() !== ''
                        ? selectedHostel.description
                        : `${selectedHostel.name} is a certified ${selectedHostel.wing || selectedHostel.hostel_type || 'student accommodation'} located in ${selectedHostel.location || 'Kumasi'}. Featuring ${selectedHostel.totalCapacity || selectedHostel.availableSpaces || 120} total beds across ${selectedHostel.totalBlocks || (Array.isArray(selectedHostel.blocks) ? selectedHostel.blocks.length : 1)} residential block(s), offering modern student amenities and verified campus proximity.`
                      }
                    </p>
                  </div>

                  {/* Highlighted Facilities & Amenities Crystal Glass Card */}
                  <div className="bg-white/70 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/90 shadow-lg shadow-sky-900/5 space-y-6">
                    <h2 className="text-xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                      <Zap className="w-5 h-5 text-amber-500" />
                      <span>Residence Features & Amenities</span>
                    </h2>

                    {(() => {
                      const hostFacilities: string[] = Array.isArray(selectedHostel.facilities) && selectedHostel.facilities.length > 0
                        ? selectedHostel.facilities
                        : Array.isArray(selectedHostel.amenities) && selectedHostel.amenities.length > 0
                        ? selectedHostel.amenities
                        : ['Fiber-Optic Wi-Fi', '24/7 Power Backup', 'CCTV Surveillance', 'Borehole Water Supply'];

                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {hostFacilities.map((facility: string, fIdx: number) => {
                            let IconComp = Zap;
                            let colorClass = 'bg-amber-100 text-amber-900';
                            let desc = 'Configured amenity available for all verified property residents.';

                            const lowerF = facility.toLowerCase();
                            if (lowerF.includes('wifi') || lowerF.includes('internet') || lowerF.includes('fiber')) {
                              IconComp = Wifi;
                              colorClass = 'bg-blue-100 text-blue-900';
                              desc = 'High-speed internet broadband access across rooms & study spaces.';
                            } else if (lowerF.includes('power') || lowerF.includes('generator') || lowerF.includes('plant')) {
                              IconComp = Zap;
                              colorClass = 'bg-amber-100 text-amber-900';
                              desc = 'Automatic standby power source ensuring zero outage during study hours.';
                            } else if (lowerF.includes('security') || lowerF.includes('cctv') || lowerF.includes('guard') || lowerF.includes('gate')) {
                              IconComp = ShieldCheck;
                              colorClass = 'bg-emerald-100 text-emerald-900';
                              desc = 'Secure perimeter with 24-hour security monitoring and ID verification.';
                            } else if (lowerF.includes('water') || lowerF.includes('borehole')) {
                              IconComp = CheckCircle2;
                              colorClass = 'bg-sky-100 text-sky-900';
                              desc = 'Continuous clean water supply supported by mechanized storage tanks.';
                            } else if (lowerF.includes('study') || lowerF.includes('hall') || lowerF.includes('library')) {
                              IconComp = Building2;
                              colorClass = 'bg-indigo-100 text-indigo-900';
                              desc = 'Dedicated quiet zone engineered for study, research, and collaborative work.';
                            } else if (lowerF.includes('air') || lowerF.includes('ac') || lowerF.includes('cooling')) {
                              IconComp = Sparkles;
                              colorClass = 'bg-cyan-100 text-cyan-900';
                              desc = 'Climate-controlled room ventilation and cooling units.';
                            }

                            return (
                              <div key={fIdx} className="p-4 bg-white/80 backdrop-blur-md rounded-2xl border border-sky-100 flex items-start gap-3 shadow-xs">
                                <div className={`w-10 h-10 rounded-xl ${colorClass} flex items-center justify-center font-extrabold shrink-0`}>
                                  <IconComp size={20} />
                                </div>
                                <div>
                                  <h4 className="text-xs font-black text-slate-950">{facility}</h4>
                                  <p className="text-[11px] text-slate-700 font-bold mt-0.5">{desc}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Standard Room Configuration Overview */}
                  <div className="bg-white/70 backdrop-blur-xl p-6 sm:p-8 rounded-3xl border border-white/90 shadow-lg shadow-sky-900/5 space-y-4">
                    <h2 className="text-xl font-black text-slate-950 tracking-tight flex items-center gap-2">
                      <BedDouble className="w-5 h-5 text-blue-900" />
                      <span>Room Configuration Options</span>
                    </h2>

                    {(() => {
                      const registeredBlocks = Array.isArray((selectedHostel as any).blocksList) && (selectedHostel as any).blocksList.length > 0
                        ? (selectedHostel as any).blocksList
                        : Array.isArray(selectedHostel.blocks) ? selectedHostel.blocks : [];
                      const roomOptions = registeredBlocks.length > 0 ? registeredBlocks :
                        Array.isArray((selectedHostel as any).roomTypes) ? (selectedHostel as any).roomTypes : [];
                      if (roomOptions.length === 0) return <p className="text-sm text-slate-600">Room configuration has not been provided.</p>;
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                          {roomOptions.map((block: any, index: number) => (
                            <div key={block.id || index} className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl space-y-3 shadow-xs">
                              <h4 className="text-sm font-black text-slate-950">{block.name || block.blockName || block.typeName || block.type || `Block ${index + 1}`}</h4>
                              {block.gender && <p className="text-xs font-bold text-blue-900">{block.gender} Block</p>}
                              {Array.isArray(block.roomTypes) && block.roomTypes.length > 0 ? block.roomTypes.map((room: any, roomIndex: number) => (
                                <div key={room.id || roomIndex} className="text-xs text-slate-700">
                                  <span className="font-bold">{room.typeName || room.type}</span>
                                  {room.totalRooms != null && <span> · {room.totalRooms} rooms</span>}
                                  {room.bedsPerRoom != null && <span> · {room.bedsPerRoom} beds per room</span>}
                                </div>
                              )) : (
                                <p className="text-xs text-slate-700">
                                  {block.totalRooms != null && <span>{block.totalRooms} rooms</span>}
                                  {block.bedsPerRoom != null && <span> · {block.bedsPerRoom} beds per room</span>}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Column (4 cols) */}
                <div className="lg:col-span-4 space-y-6">
                  {/* Resident Manager Profile Card (Crystal Glass) */}
                  <div className="bg-white/70 backdrop-blur-xl p-6 rounded-3xl border border-white/90 shadow-lg shadow-sky-900/5 space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <User size={14} className="text-blue-900" />
                      <span>Resident Property Manager</span>
                    </h3>

                    <div className="flex items-center gap-4">
                      {selectedHostel.managerPhoto || (selectedHostel as any).managerAvatar ? (
                        <img
                          src={selectedHostel.managerPhoto || (selectedHostel as any).managerAvatar}
                          alt={selectedHostel.managerName || 'Manager'}
                          className="w-14 h-14 rounded-2xl object-cover border-2 border-blue-100 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-2xl bg-blue-900 text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0">
                          {selectedHostel.managerName?.[0] || 'M'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <h4 className="text-base font-black text-slate-950 truncate">
                            {selectedHostel.managerName || 'Anthony Davis'}
                          </h4>
                          <span className="text-[9px] font-black text-emerald-900 bg-emerald-100 px-1.5 py-0.5 rounded shrink-0">
                            Verified
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-bold truncate">{selectedHostel.managerEmail || 'manager@pinevela.com'}</p>
                        <p className="text-xs text-blue-900 font-black mt-1">{selectedHostel.managerPhone || '+233 24 123 4567'}</p>
                      </div>
                    </div>

                    <a
                      href={`tel:${selectedHostel.managerPhone || '+233241234567'}`}
                      className="w-full py-3 bg-blue-900 hover:bg-blue-800 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
                    >
                      <Phone size={14} />
                      <span>Call Property Manager</span>
                    </a>
                  </div>


                </div>
              </div>
            </main>

            {/* STAFF APPLICATION MODAL FOR THIS HOSTEL */}
            <AnimatePresence>

            </AnimatePresence>

            {/* Staff App Toast */}


            {/* LIGHTBOX GALLERY FULL-SCREEN MODAL */}
            <AnimatePresence>
              {isLightboxOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-55 bg-black/95 backdrop-blur-3xl flex flex-col justify-between p-4 md:p-8"
                  onClick={() => setIsLightboxOpen(false)}
                >
                  {/* Top Bar inside Lightbox */}
                  <div className="flex items-center justify-between text-white w-full max-w-7xl mx-auto z-10">
                    <div className="flex flex-col">
                      <span className="text-sm font-black tracking-tight text-slate-300">{selectedHostel.name}</span>
                      <span className="text-[11px] font-bold text-slate-400 mt-0.5">
                        Photo {activeImageIndex + 1} of {getGalleryImages(selectedHostel).length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLightboxOpen(false)}
                      className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer border border-white/10"
                      title="Close Lightbox"
                    >
                      <X size={20} />
                    </button>
                  </div>

                  {/* Middle Area: Active Image & Navigation Arrows */}
                  <div className="flex-1 flex items-center justify-center relative w-full max-w-5xl mx-auto my-4">
                    {/* Left arrow on lightbox */}
                    {activeImageIndex > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex(activeImageIndex - 1);
                        }}
                        className="absolute left-0 md:-left-16 z-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer border border-white/10"
                        title="Previous Photo"
                      >
                        <ChevronLeft size={24} />
                      </button>
                    )}

                    {/* Active Image with slide animation */}
                    <div 
                      className="relative max-h-[65vh] md:max-h-[75vh] w-full flex items-center justify-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <motion.img
                        key={activeImageIndex}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.3 }}
                        src={getGalleryImages(selectedHostel)[activeImageIndex]}
                        alt={`${selectedHostel.name} - Fullscreen ${activeImageIndex + 1}`}
                        className="max-h-[65vh] md:max-h-[75vh] max-w-full object-contain rounded-2xl shadow-2xl border border-white/10"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=1200&q=80';
                        }}
                      />
                    </div>

                    {/* Right arrow on lightbox */}
                    {activeImageIndex < getGalleryImages(selectedHostel).length - 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImageIndex(activeImageIndex + 1);
                        }}
                        className="absolute right-0 md:-right-16 z-20 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all cursor-pointer border border-white/10"
                        title="Next Photo"
                      >
                        <ChevronRight size={24} />
                      </button>
                    )}
                  </div>

                  {/* Bottom Area: Thumbnails row inside lightbox */}
                  <div 
                    className="w-full max-w-3xl mx-auto flex items-center justify-center gap-2 overflow-x-auto pb-4 z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {getGalleryImages(selectedHostel).map((imgUrl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActiveImageIndex(idx)}
                        className={`relative w-16 h-12 rounded-lg overflow-hidden shrink-0 transition-all duration-300 cursor-pointer ${
                          activeImageIndex === idx 
                            ? 'ring-2 ring-white scale-105 border-transparent opacity-100 shadow-lg shadow-white/10' 
                            : 'opacity-40 hover:opacity-80 border border-white/10'
                        }`}
                      >
                        <img 
                          src={imgUrl} 
                          alt={`Lightbox Thumbnail ${idx + 1}`} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=200&q=80';
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Job Offer Proposal Modal */}


      {/* Staff Reviews & Rating Modal */}


      {/* Warm PineVela Account Required Modal Popup */}


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
