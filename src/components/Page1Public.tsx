import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Hostel } from '../types';
import PineLogo from './PineLogo';
import { Search, MapPin, Phone, Mail, Star, ArrowRight, X, Sparkles, Shield, User, MessageSquare, Landmark, Layers, ChevronDown, HelpCircle, Navigation, LogOut, ShieldCheck, Wifi, Zap, BedDouble, Building2, CheckCircle2, ChevronLeft, ChevronRight, Maximize2, ImageIcon, Briefcase, FileText, UploadCloud, CheckCircle, AlertCircle, RefreshCw, Home, Wrench, Clock, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import FAQAccordion from './FAQAccordion';
import TestimonialsCarousel from './TestimonialsCarousel';
import { useAuth } from '../context/AuthContext';
import { apiFetch, safeJson } from '../lib/api';
import LogoutConfirmationModal from './LogoutConfirmationModal';
import {
  validateEmail,
  cleanPhoneNumber,
  validatePhone,
  resolveIdConfig
} from '../utils/formValidation';

import welcomeBg from '../../assets/welcome_bg.jpg';
import hostelsBg from '../../assets/hostels_bg.jpg';
import testimonialsBg from '../../assets/testimonials_bg.jpg';
import faqAboutBg from '../../assets/faq_about_bg.jpg';

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
  const [selectedWing, setSelectedWing] = useState<'All' | 'Hostel' | 'Inn' | 'Hotel' | 'Estate'>('All');
  const [scrollPercent, setScrollPercent] = useState(0);
  const [activeSection, setActiveSection] = useState('welcome-section');
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);

  const { user, logout } = useAuth();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Light-box gallery states
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);

  // Staff application modal states
  const [showStaffAppModal, setShowStaffAppModal] = useState(false);
  const [appRole, setAppRole] = useState('Facilities & Maintenance Technician');
  const [appName, setAppName] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appIdType, setAppIdType] = useState('Ghana Card');
  const [appNationalId, setAppNationalId] = useState('');
  const [appCvFileName, setAppCvFileName] = useState('');
  const [appCvData, setAppCvData] = useState('');
  const [appIdFileName, setAppIdFileName] = useState('');
  const [appIdData, setAppIdData] = useState('');
  const [appCover, setAppCover] = useState('');
  const [submittingStaffApp, setSubmittingStaffApp] = useState(false);
  const [staffAppToast, setStaffAppToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Accredited Staff Directory & Job Offers / Reviews Modal States
  const [accreditedStaff, setAccreditedStaff] = useState<any[]>([]);
  const [selectedStaffForOffer, setSelectedStaffForOffer] = useState<any | null>(null);
  const [selectedStaffForReviews, setSelectedStaffForReviews] = useState<any | null>(null);
  const [showAccountRequiredModal, setShowAccountRequiredModal] = useState(false);

  useEffect(() => {
    apiFetch('/api/accredited-staff')
      .then(data => {
        if (Array.isArray(data)) {
          // Client-side deduplication safeguard
          const unique = data.filter((s, idx, self) => 
            self.findIndex(t => 
              (t.email && s.email && t.email.toLowerCase().trim() === s.email.toLowerCase().trim()) || 
              (t.id === s.id)
            ) === idx
          );
          setAccreditedStaff(unique);
        }
      })
      .catch(err => {
        console.warn("Notice loading accredited staff:", err);
        setAccreditedStaff([]);
      });
  }, []);

  // Job Offer Form States & Client Identity Verification
  const [jobRequesterName, setJobRequesterName] = useState(user?.name || '');
  const [jobRequesterCategory, setJobRequesterCategory] = useState('Hostel Resident / Student');
  const [jobRequesterNationalId, setJobRequesterNationalId] = useState('');
  const [jobRequesterOrg, setJobRequesterOrg] = useState('');
  const [jobRequesterPhone, setJobRequesterPhone] = useState(user?.phone || '');
  const [jobRequesterAltPhone, setJobRequesterAltPhone] = useState('');
  const [jobRequesterEmail, setJobRequesterEmail] = useState(user?.email || '');
  const [jobWorkCategory, setJobWorkCategory] = useState('Plumbing & Pipe Fitting');
  const [jobWorkOffered, setJobWorkOffered] = useState('');
  const [jobSchedule, setJobSchedule] = useState('');
  const [jobEstimatedDuration, setJobEstimatedDuration] = useState('2 - 3 Hours');
  const [jobLocation, setJobLocation] = useState('');
  const [jobDigitalAddress, setJobDigitalAddress] = useState('');
  const [jobWage, setJobWage] = useState('');
  const [jobPaymentMethod, setJobPaymentMethod] = useState('Mobile Money (MoMo) on Completion');
  const [jobEquipment, setJobEquipment] = useState('Basic tools available on site');
  const [jobSafetyTermsAccepted, setJobSafetyTermsAccepted] = useState(true);
  const [jobContact, setJobContact] = useState(user?.phone || user?.email || '');
  const [jobLat, setJobLat] = useState(5.6037);
  const [jobLng, setJobLng] = useState(-0.1870);
  const offerMapInstanceRef = React.useRef<any>(null);
  const offerMarkerInstanceRef = React.useRef<any>(null);
  
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerToast, setOfferToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Review Form
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewToast, setReviewToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (user) {
      if (!jobRequesterName) setJobRequesterName(user.name || '');
      if (!jobRequesterEmail) setJobRequesterEmail(user.email || '');
      if (!jobRequesterPhone && user.phone) setJobRequesterPhone(user.phone || '');
    }
  }, [user]);

  useEffect(() => {
    if (selectedStaffForOffer) {
      const timer = setTimeout(() => {
        const container = document.getElementById('job-offer-map-picker');
        if (!container) return;
        const L = (window as any).L;
        if (!L) return;

        if (!offerMapInstanceRef.current) {
          const map = L.map(container).setView([5.6037, -0.1870], 15);
          offerMapInstanceRef.current = map;
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          const marker = L.marker([5.6037, -0.1870], { draggable: true }).addTo(map);
          offerMarkerInstanceRef.current = marker;

          marker.on('dragend', () => {
            const pos = marker.getLatLng();
            setJobLat(pos.lat);
            setJobLng(pos.lng);
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.lat}&lon=${pos.lng}&zoom=18&addressdetails=1`)
              .then(safeJson)
              .then(data => {
                if (data && data.display_name) {
                  setJobLocation(data.display_name);
                }
              }).catch(() => {});
          });

          map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            marker.setLatLng([lat, lng]);
            setJobLat(lat);
            setJobLng(lng);
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`)
              .then(safeJson)
              .then(data => {
                if (data && data.display_name) {
                  setJobLocation(data.display_name);
                }
              }).catch(() => {});
          });
        } else {
          offerMapInstanceRef.current.invalidateSize();
        }
      }, 300);

      return () => {
        clearTimeout(timer);
        if (offerMapInstanceRef.current) {
          offerMapInstanceRef.current.remove();
          offerMapInstanceRef.current = null;
          offerMarkerInstanceRef.current = null;
        }
      };
    }
  }, [selectedStaffForOffer]);

  const handleSendJobOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForOffer) return;

    if (!jobRequesterName.trim() || jobRequesterName.trim().length < 2) {
      setOfferToast({ text: 'Please enter your full legal name.', type: 'error' });
      return;
    }
    if (!jobRequesterPhone.trim()) {
      setOfferToast({ text: 'Please enter your contact phone number.', type: 'error' });
      return;
    }
    if (!jobWorkOffered.trim() || jobWorkOffered.trim().length < 5) {
      setOfferToast({ text: 'Please provide a clear description of the work offered (min 5 chars).', type: 'error' });
      return;
    }
    if (!jobSchedule.trim()) {
      setOfferToast({ text: 'Please specify the proposed time and date schedule.', type: 'error' });
      return;
    }
    if (!jobLocation.trim()) {
      setOfferToast({ text: 'Please specify the physical location or tap on map.', type: 'error' });
      return;
    }
    if (!jobWage.trim()) {
      setOfferToast({ text: 'Please specify the proposed wage or compensation in GHS.', type: 'error' });
      return;
    }
    if (!jobSafetyTermsAccepted) {
      setOfferToast({ text: 'Please confirm the security & fair engagement declaration.', type: 'error' });
      return;
    }

    setSubmittingOffer(true);
    try {
      const activeToken = localStorage.getItem('token') || localStorage.getItem('pinevela_auth_token') || '';
      const res = await fetch('/api/job-offers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeToken}`
        },
        body: JSON.stringify({
          staffId: selectedStaffForOffer.id,
          staffEmail: selectedStaffForOffer.email,
          staffName: selectedStaffForOffer.name,
          workCategory: jobWorkCategory,
          workOffered: jobWorkOffered.trim(),
          timeAndSchedule: jobSchedule.trim(),
          estimatedDuration: jobEstimatedDuration,
          location: jobLocation.trim() || 'Accra, Ghana',
          digitalAddress: jobDigitalAddress.trim(),
          wageSalary: jobWage.trim(),
          paymentMethod: jobPaymentMethod,
          equipmentProvided: jobEquipment,
          contact: jobRequesterPhone.trim() || jobRequesterEmail.trim(),
          requesterName: jobRequesterName.trim(),
          requesterCategory: jobRequesterCategory,
          requesterNationalId: jobRequesterNationalId.trim(),
          requesterOrganization: jobRequesterOrg.trim(),
          requesterContact: jobRequesterPhone.trim(),
          requesterAltPhone: jobRequesterAltPhone.trim(),
          requesterEmail: jobRequesterEmail.trim(),
          safetyDeclarationConfirmed: jobSafetyTermsAccepted,
          lat: jobLat,
          lng: jobLng
        })
      });
      const data = await safeJson(res);
      if (res.ok) {
        setOfferToast({ text: `Job offer sent to ${selectedStaffForOffer.name}! They will review and accept in their staff console.`, type: 'success' });
        setTimeout(() => {
          setOfferToast(null);
          setSelectedStaffForOffer(null);
          setJobWorkOffered('');
          setJobSchedule('');
          setJobLocation('');
          setJobDigitalAddress('');
          setJobWage('');
        }, 2200);
      } else {
        setOfferToast({ text: data.error || 'Failed to send job offer proposal', type: 'error' });
      }
    } catch (err: any) {
      setOfferToast({ text: err.message || 'Failed to send job offer proposal', type: 'error' });
    } finally {
      setSubmittingOffer(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffForReviews) return;
    if (!user) {
      setSelectedStaffForReviews(null);
      setShowAccountRequiredModal(true);
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await fetch('/api/staff-reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token || localStorage.getItem('token') || localStorage.getItem('pinevela_auth_token') || ''}`
        },
        body: JSON.stringify({
          staffId: selectedStaffForReviews.id,
          rating: reviewRating,
          comment: reviewComment
        })
      });
      const data = await safeJson(res);
      if (res.ok) {
        setReviewToast({ text: 'Review submitted successfully!', type: 'success' });
        const updated = await fetch('/api/accredited-staff').then(safeJson);
        if (Array.isArray(updated)) {
          setAccreditedStaff(updated);
          const refreshed = updated.find((s: any) => s.id === selectedStaffForReviews.id);
          if (refreshed) setSelectedStaffForReviews(refreshed);
        }
        setReviewComment('');
        setTimeout(() => setReviewToast(null), 2000);
      } else {
        setReviewToast({ text: data.error || 'Failed to submit review', type: 'error' });
      }
    } catch (err: any) {
      setReviewToast({ text: err.message || 'Failed to submit review', type: 'error' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleStaffAppCvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStaffAppToast({ text: "File size should be less than 5MB", type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAppCvFileName(file.name);
      setAppCvData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStaffAppIdUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setStaffAppToast({ text: "File size should be less than 5MB", type: 'error' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAppIdFileName(file.name);
      setAppIdData(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleStaffAppSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHostel) return;

    if (!appName.trim() || appName.trim().length < 3) {
      setStaffAppToast({ text: "Please enter your full legal name (minimum 3 characters).", type: 'error' });
      return;
    }
    const phoneCheck = validatePhone(appPhone, 'Phone number');
    if (!phoneCheck.isValid) {
      setStaffAppToast({ text: phoneCheck.error!, type: 'error' });
      return;
    }
    if (appEmail.trim()) {
      const emailCheck = validateEmail(appEmail, 'Email address');
      if (!emailCheck.isValid) {
        setStaffAppToast({ text: emailCheck.error!, type: 'error' });
        return;
      }
    }
    if (appNationalId.trim()) {
      const idCfg = resolveIdConfig(appIdType);
      const idCheck = idCfg.validate(appNationalId);
      if (!idCheck.isValid) {
        setStaffAppToast({ text: idCheck.error!, type: 'error' });
        return;
      }
    }
    if (!appCvData) {
      setStaffAppToast({ text: "Please attach your Curriculum Vitae (CV) document.", type: 'error' });
      return;
    }

    setSubmittingStaffApp(true);
    try {
      const res = await fetch('/api/staff-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicantName: appName,
          phone: appPhone,
          email: appEmail || `${appName.toLowerCase().replace(/\s+/g, '')}@applicant.pinevela.com`,
          role: appRole,
          hostelId: selectedHostel.id,
          hostelName: selectedHostel.name,
          nationalId: appNationalId,
          idDocumentUrl: appIdData,
          cvData: appCvData,
          cvFileName: appCvFileName || 'Applicant_CV.pdf',
          coverLetter: appCover
        })
      });

      if (!res.ok) {
        const errJson = await safeJson(res);
        throw new Error(errJson.message || 'Failed to submit application');
      }

      setStaffAppToast({ 
        text: `Application submitted! Your CV & details were delivered directly to the manager of ${selectedHostel.name}.`, 
        type: 'success' 
      });
      setShowStaffAppModal(false);
      setAppName('');
      setAppPhone('');
      setAppEmail('');
      setAppNationalId('');
      setAppCvData('');
      setAppCvFileName('');
      setAppIdData('');
      setAppIdFileName('');
      setAppCover('');
    } catch (err: any) {
      setStaffAppToast({ text: err.message || 'Error submitting application', type: 'error' });
    } finally {
      setSubmittingStaffApp(false);
      setTimeout(() => setStaffAppToast(null), 5000);
    }
  };

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
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const percent = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollPercent(percent);

      const sections = [
        'welcome-section',
        'hostels-section',
        'testimonials-section',
        'faq-about-section',
        'footer-section'
      ];
      let current = 'welcome-section';
      for (const sectionId of sections) {
        const el = document.getElementById(sectionId);
        if (el) {
          const rect = el.getBoundingClientRect();
          // If top of section is within upper half of the screen
          if (rect.top <= window.innerHeight * 0.45) {
            current = sectionId;
          }
        }
      }

      // If we are close to the bottom, force the active section to be footer-section
      const isAtBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
      if (isAtBottom) {
        current = 'footer-section';
      }

      setActiveSection(current);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    // Run once on mount
    setTimeout(handleScroll, 100);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Filter logic
  const filteredHostels = (hostels || []).filter((hostel) => {
    if (!hostel) return false;
    const query = (searchQuery || '').toLowerCase().trim();
    const name = (hostel.name || '').toLowerCase();
    const loc = (hostel.location || '').toLowerCase();
    const matchesSearch = name.includes(query) || loc.includes(query);
    
    if (selectedWing === 'All') return matchesSearch;
    return matchesSearch && hostel.wing === selectedWing;
  });

  return (
    <div className="min-h-screen bg-transparent relative overflow-hidden font-sans pb-0">
      {/* Dynamic Sidebar Scroll Tracker (Floating Indicator) */}
      <motion.div 
        onClick={() => setIsSidebarExpanded(!isSidebarExpanded)}
        animate={{ width: isSidebarExpanded ? 220 : 56 }}
        transition={{ type: "spring", stiffness: 260, damping: 25 }}
        className="fixed right-6 top-1/2 -translate-y-1/2 z-50 hidden xl:flex flex-col items-center gap-5 bg-white/95 backdrop-blur-md p-4 py-6 rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/50 cursor-pointer select-none overflow-hidden"
      >
        <div className="flex items-center gap-2 justify-between w-full border-b border-slate-100 pb-2">
          {isSidebarExpanded ? (
            <span className="text-[9px] font-black uppercase text-blue-900 tracking-wider">Navigation Map</span>
          ) : (
            <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest text-center w-full">Nav</span>
          )}
        </div>

        <div className="relative w-[3px] h-36 bg-slate-100 rounded-full flex flex-col justify-start overflow-hidden shrink-0">
          {/* Dynamic Blue Filled Line */}
          <motion.div 
            className="absolute top-0 left-0 w-full bg-blue-900 rounded-full origin-top"
            style={{ height: `${scrollPercent}%` }}
            transition={{ type: "tween", ease: "linear" }}
          />
        </div>

        {/* Section Dots */}
        <div className="flex flex-col gap-3.5 w-full">
          {[
            { id: 'welcome-section', label: 'Welcome to PineVela' },
            { id: 'hostels-section', label: 'Available Residences' },
            { id: 'testimonials-section', label: 'Hear from Students' },
            { id: 'faq-about-section', label: 'FAQ & About us' },
            { id: 'footer-section', label: 'Footer Section' }
          ].map((sec) => {
            const isActive = activeSection === sec.id;
            return (
              <button
                key={sec.id}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent toggling sidebar width on clicking dot
                  document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                className="group relative flex items-center w-full cursor-pointer focus:outline-none py-1 rounded-lg hover:bg-slate-50 transition-colors"
                title={sec.label}
              >
                {/* Outer pulsing indicator ring */}
                <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border-2 transition-all duration-300 shrink-0 ${
                  isActive 
                    ? 'border-blue-900 bg-white scale-110 shadow-sm shadow-blue-950/20' 
                    : 'border-slate-200 bg-slate-100 group-hover:border-slate-300 group-hover:bg-slate-200'
                }`}>
                  {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-900" />}
                </div>

                {/* Animated Label presentation */}
                <AnimatePresence initial={false}>
                  {isSidebarExpanded ? (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className={`ml-3 text-[10px] font-bold text-left whitespace-nowrap overflow-hidden ${
                        isActive ? 'text-blue-950 font-black' : 'text-slate-500'
                      }`}
                    >
                      {sec.label}
                    </motion.span>
                  ) : (
                    /* Floating tooltip label (only when collapsed) */
                    <span className="absolute right-10 bg-slate-900 text-white text-[10px] font-bold py-1.5 px-3 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap shadow-md z-50">
                      {sec.label}
                    </span>
                  )}
                </AnimatePresence>
              </button>
            );
          })}
        </div>

        {/* Click to expand helper */}
        {!isSidebarExpanded && (
          <span className="text-[8px] font-black text-slate-400 mt-1 uppercase tracking-tighter">Tap</span>
        )}
      </motion.div>

      {/* Decorative background shapes */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute top-1/2 left-0 w-80 h-80 bg-blue-100 rounded-full blur-3xl opacity-30 -z-10" />

      {/* Fixed Header Bar at top with frost/glassmorphism */}
      <header id="public-header" className="fixed top-0 left-0 right-0 z-40 px-4 sm:px-6 md:px-12 py-3 bg-white/85 backdrop-blur-xl border-b border-blue-200/50 shadow-md transition-all">
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
              className="w-full pl-10 pr-20 py-2 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white/95 text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-inner"
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
              <button
                onClick={() => onNavigate('student-login')}
                className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl text-xs shadow-md transition-all cursor-pointer hover:scale-102 active:scale-98"
              >
                Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Top Section Container holding Welcome Section with Welcome Background Image covering entire top */}
      <div className="relative overflow-hidden rounded-b-[4.5rem] w-full border-none shadow-none pt-24 sm:pt-28 md:pt-32">
        {/* Background Image covering entire top section */}
        <div className="absolute inset-0 z-0 w-full h-full">
          <img 
            src={welcomeBg} 
            alt="" 
            className="w-full h-full object-cover opacity-90 saturate-[110%]"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-blue-100/40 via-white/50 to-transparent" />
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
                className="px-8 py-3.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl shadow-lg shadow-blue-900/20 transition-all transform hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-900/35 flex items-center gap-2 text-sm cursor-pointer"
              >
                <span>Login to Portal</span>
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
              <div className="absolute -bottom-4 -right-4 w-48 h-48 bg-blue-100/50 rounded-full -z-10" />
              <div className="absolute -top-4 -left-4 w-24 h-24 bg-amber-100/50 rounded-full -z-10" />
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

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 bg-blue-50/40 backdrop-blur-md p-1.5 rounded-xl border border-blue-200/30 shadow-sm">
                  <button
                    onClick={() => setSelectedWing('All')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedWing === 'All'
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-blue-100/50'
                    }`}
                  >
                    All Properties
                  </button>
                  <button
                    onClick={() => setSelectedWing('Hostel')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedWing === 'Hostel'
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-blue-100/50'
                    }`}
                  >
                    Hostels
                  </button>
                  <button
                    onClick={() => setSelectedWing('Inn')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedWing === 'Inn'
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-blue-100/50'
                    }`}
                  >
                    Inns
                  </button>
                  <button
                    onClick={() => setSelectedWing('Hotel')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedWing === 'Hotel'
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-blue-100/50'
                    }`}
                  >
                    Hotels
                  </button>
                  <button
                    onClick={() => setSelectedWing('Estate')}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      selectedWing === 'Estate'
                        ? 'bg-blue-900 text-white shadow-sm'
                        : 'text-slate-650 hover:bg-blue-100/50'
                    }`}
                  >
                    Estates
                  </button>
                </div>

                {(selectedWing !== 'All' || searchQuery.trim() !== '') && (
                  <button
                    onClick={() => {
                      setSelectedWing('All');
                      setSearchQuery('');
                    }}
                    className="bg-blue-50/40 backdrop-blur-md border border-blue-200/30 text-blue-900 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 shadow-sm hover:bg-blue-50/70 transition-all cursor-pointer"
                  >
                    <X size={14} />
                    <span>Clear filters</span>
                  </button>
                )}
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
                onClick={() => { setSearchQuery(''); setSelectedWing('All'); }} 
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
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <User size={20} />
            </div>
            <h4 className="font-extrabold text-slate-900 text-lg">Direct Communication</h4>
            <p className="text-sm text-slate-700 font-medium leading-relaxed">
              Connect directly with certified property managers for inquiries, viewing requests, and clarifications.
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
              Property owners can track occupancy, maintenance requests, and bookings from a single powerful dashboard.
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

        {/* Testimonials Section with Horizontal Carousel */}
        <motion.section 
          id="testimonials-section" 
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-24 bg-transparent border-none shadow-none"
          initial={{ opacity: 0.3, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.12 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="relative z-10 w-full">
            <TestimonialsCarousel />
          </div>
        </motion.section>

        {/* FAQ & About Us Side-by-Side Section */}
        <motion.section 
          id="faq-about-section" 
          className="relative max-w-7xl mx-auto px-6 md:px-12 w-full mt-28 bg-transparent border-none shadow-none pb-12"
          initial={{ opacity: 0.3, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: false, amount: 0.12 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            {/* Left Column: FAQ Accordion */}
            <div className="lg:col-span-6 space-y-8">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 bg-slate-100 text-slate-800 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  <HelpCircle className="text-blue-900" size={12} />
                  Onboarding Support
                </div>
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                  Frequently Asked Questions
                </h3>
                <p className="text-sm text-slate-500 max-w-xl">
                  Everything you need to know about the modern PineVela booking, management, and student residency experience.
                </p>
              </div>

              <FAQAccordion />
            </div>

            {/* Right Column: About Us */}
            <div className="lg:col-span-6 space-y-8 bg-transparent p-0 border-none shadow-none">
              <div className="space-y-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-extrabold tracking-widest text-blue-900 uppercase">
                  Our Identity & Purpose
                </span>
                <h3 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
                  About PineVela
                </h3>
                <h4 className="text-base md:text-lg font-bold text-blue-950 leading-relaxed border-l-4 border-blue-900 pl-4">
                  Connecting students with verified housing, property owners with smart management, and skilled workers with accredited jobs.
                </h4>
                <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                  PineVela is a unified hostel living, management, and employment platform. We empower students to find safe accommodation, enable property managers to streamline hostel operations, and allow job seekers to discover accredited hostel employment opportunities.
                </p>
                <p className="text-xs md:text-sm text-slate-500 leading-relaxed">
                  We believe finding student accommodation and securing hostel jobs should be seamless, verified, and accessible from a single trusted platform.
                </p>
              </div>

              {/* Mission Card */}
              <div className="bg-blue-50/20 p-6 rounded-2xl border border-blue-200/25 space-y-2 shadow-sm">
                <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block">Our Mission</span>
                <p className="text-xs md:text-sm text-slate-700 leading-relaxed font-medium">
                  To build a trusted digital ecosystem for KNUST students and residences where students can find accommodation, buy and sell items, access services, and connect directly with verified residence managers and staff.
                </p>
              </div>

              {/* Built for Everyone */}
              <div className="space-y-4">
                <h5 className="text-sm font-black text-slate-900 uppercase tracking-wider">Built for Everyone</h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50/20 p-5 rounded-xl border border-blue-200/25 space-y-1.5 shadow-2xs">
                    <span className="text-xs font-black text-blue-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-900" />
                      For Students
                    </span>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed">
                      Discover approved hostels, compare available accommodation, apply for a room, manage payments, track allocations, and communicate with your hostel staff.
                    </p>
                  </div>

                  <div className="bg-blue-50/20 p-5 rounded-xl border border-blue-200/25 space-y-1.5 shadow-2xs">
                    <span className="text-xs font-black text-indigo-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-900" />
                      For Managers
                    </span>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed">
                      Manage blocks, floors, rooms, and beds, handle applications, track allocation history, manage payments, and dispatch maintenance.
                    </p>
                  </div>

                  <div className="bg-blue-50/20 p-5 rounded-xl border border-blue-200/25 space-y-1.5 shadow-2xs">
                    <span className="text-xs font-black text-emerald-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-950" />
                      For Job Seekers & Technicians
                    </span>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed">
                      Easily search and apply for verified hostel management, maintenance, plumbing, electrical, and administrative jobs directly on PineVela.
                    </p>
                  </div>

                  <div className="bg-blue-50/20 p-5 rounded-xl border border-blue-200/25 space-y-1.5 shadow-2xs">
                    <span className="text-xs font-black text-rose-900 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-900" />
                      For Maintenance Staff
                    </span>
                    <p className="text-[11px] md:text-xs text-slate-500 leading-relaxed">
                      Stay organized and respond instantly to daily hostel operations such as maintenance tickets within your assigned property wings.
                    </p>
                  </div>
                </div>
              </div>

              {/* Trust Matters */}
              <div className="space-y-2 border-t border-slate-200/80 pt-6">
                <h5 className="text-xs font-black text-slate-900 uppercase tracking-wider">Trust Matters</h5>
                <p className="text-xs md:text-sm text-slate-600 leading-relaxed">
                  PineVela is designed with security and accountability at its foundation. Hostel approvals, manager verification, accommodation allocations, and financial activity are handled through controlled workflows rather than relying solely on user input.
                </p>
                <p className="text-xs md:text-sm text-blue-900 font-extrabold leading-relaxed">
                  Our goal is to make student living more peaceful — allowing residents to log maintenance issues directly rather than going up and down to report to managers.
                </p>
              </div>

              {/* Vision Card */}
              <div className="bg-blue-950/95 backdrop-blur-sm text-white p-6 rounded-2xl space-y-3 border border-blue-900/50 shadow-xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-200 block">Our Vision</span>
                <p className="text-xs md:text-sm text-slate-200 leading-relaxed">
                  We envision a unified campus future where Properties, People, and Services connect seamlessly — empowering students with verified accommodations and digital marketplace trade, equipping property managers with effortless operational tools, and delivering trusted hiring and payment channels.
                </p>
                <span className="text-xs font-black text-blue-300 block pt-1">
                  PineVela — Properties, People & Services, Connected.
                </span>
              </div>

            </div>

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
                The complete ecosystem for student ease, property management, and verified job finding on PineVela.
              </p>
            </div>
            <div className="space-y-3">
              <h5 className="font-extrabold text-slate-900 text-sm tracking-wide">Company</h5>
              <ul className="space-y-2 text-xs text-slate-600 font-semibold">
                <li><a href="#" className="hover:text-blue-900 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-blue-900 transition-colors">Contact</a></li>
                <li><a href="#" className="hover:text-blue-900 transition-colors">Partner with Us</a></li>
              </ul>
            </div>

            <div className="space-y-3">
              <h5 className="font-extrabold text-slate-900 text-sm tracking-wide">Follow Us</h5>
              <div className="flex gap-4 text-slate-400">
                <span className="p-2 bg-white/60 hover:bg-white/95 rounded-lg cursor-pointer text-slate-650 shadow-xs border border-slate-200/30 transition-colors">🔍</span>
                <span className="p-2 bg-white/60 hover:bg-white/95 rounded-lg cursor-pointer text-slate-650 shadow-xs border border-slate-200/30 transition-colors">🔔</span>
                <span className="p-2 bg-white/60 hover:bg-white/95 rounded-lg cursor-pointer text-slate-650 shadow-xs border border-slate-200/30 transition-colors">❓</span>
              </div>
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

                  {/* Pricing Badge Overlay */}
                  <div className="bg-white/15 backdrop-blur-xl border border-white/30 p-4 rounded-2xl flex flex-col items-start md:items-end shrink-0 shadow-2xl pointer-events-auto">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-200">Annual Academic Fee</span>
                    <span className="text-2xl sm:text-3xl font-black text-amber-300">
                      GHS {(selectedHostel.price || 3500).toLocaleString()}
                    </span>
                    <span className="text-[10px] text-slate-200 font-medium">Includes utility, maintenance & high-speed wifi</span>
                  </div>
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
                  <span className="text-xs text-emerald-900 mt-1 font-bold">Immediate booking ready</span>
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
                      const customBlocks = Array.isArray((selectedHostel as any).blocksList) && (selectedHostel as any).blocksList.length > 0
                        ? (selectedHostel as any).blocksList
                        : Array.isArray(selectedHostel.blocks) && selectedHostel.blocks.length > 0
                        ? selectedHostel.blocks
                        : Array.isArray((selectedHostel as any).roomTypes) && (selectedHostel as any).roomTypes.length > 0
                        ? (selectedHostel as any).roomTypes
                        : null;

                      if (customBlocks && customBlocks.length > 0) {
                        return (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                            {customBlocks.map((blk: any, bIdx: number) => {
                              const blockName = blk.name || blk.title || `Block ${bIdx + 1}`;
                              const blockPrice = Number(blk.pricePerBlock || blk.price || selectedHostel.price || 3500);
                              const bedsCount = blk.bedsPerRoom || blk.capacity || 2;
                              return (
                                <div key={bIdx} className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl text-center space-y-2 shadow-xs relative overflow-hidden">
                                  {bIdx === 0 && (
                                    <span className="absolute top-0 right-0 bg-blue-900 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg">POPULAR</span>
                                  )}
                                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                                    {blk.roomPrefix ? `Prefix ${blk.roomPrefix}` : `Option ${String.fromCharCode(65 + bIdx)}`}
                                  </span>
                                  <h4 className="text-sm font-black text-slate-950">{blockName}</h4>
                                  <p className="text-xs text-blue-900 font-black">
                                    GHS {blockPrice.toLocaleString()} <span className="text-[10px] text-slate-500 font-normal">/ session</span>
                                  </p>
                                  <p className="text-[10px] text-slate-700 font-bold">
                                    {bedsCount === 1 ? '1 Bed / Private Room' : `${bedsCount} Beds per Room`} ({blk.totalRooms || 20} rooms)
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      // Fallback: derive options dynamically from registered base hostel price
                      const basePrice = Number(selectedHostel.price || (selectedHostel as any).defaultFee || 3500);
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                          <div className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl text-center space-y-2 shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Option A</span>
                            <h4 className="text-sm font-black text-slate-950">1-in-a-Room Private</h4>
                            <p className="text-xs text-blue-900 font-black">GHS {Math.round(basePrice * 1.4).toLocaleString()}</p>
                            <p className="text-[10px] text-slate-700 font-bold">Private washroom & study desk</p>
                          </div>

                          <div className="p-4 bg-blue-50/80 backdrop-blur-md border border-blue-200 rounded-2xl text-center space-y-2 relative overflow-hidden shadow-xs">
                            <span className="absolute top-0 right-0 bg-blue-900 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg">POPULAR</span>
                            <span className="text-[10px] font-black uppercase tracking-wider text-blue-800">Option B</span>
                            <h4 className="text-sm font-black text-slate-950">2-in-a-Room Shared</h4>
                            <p className="text-xs text-blue-900 font-black">GHS {basePrice.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-700 font-bold">En-suite washroom & dual wardrobes</p>
                          </div>

                          <div className="p-4 bg-white/80 backdrop-blur-md border border-slate-200/80 rounded-2xl text-center space-y-2 shadow-xs">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Option C</span>
                            <h4 className="text-sm font-black text-slate-950">4-in-a-Room Economy</h4>
                            <p className="text-xs text-blue-900 font-black">GHS {Math.round(basePrice * 0.75).toLocaleString()}</p>
                            <p className="text-[10px] text-slate-700 font-bold">Spacious layout & shared facilities</p>
                          </div>
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

                  {/* Staff Recruitment & Job Openings Card */}
                  {(selectedHostel as any).staffHiringOpen !== false ? (
                    <div className="bg-gradient-to-br from-amber-500/10 via-amber-400/5 to-white/70 backdrop-blur-xl p-6 rounded-3xl border border-amber-300/80 shadow-lg shadow-amber-900/5 space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
                          <Briefcase size={14} className="text-amber-700" />
                          <span>Staff Career Opportunities</span>
                        </h3>
                        <span className="text-[9px] font-black uppercase bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          Hiring Open
                        </span>
                      </div>

                      <p className="text-xs text-slate-700 font-medium">
                        Interested in working at <strong>{selectedHostel.name}</strong>? Submit your application and CV directly to the manager.
                      </p>

                      {/* Needed Staff Roles */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Open Positions Posted:</span>
                        {Array.isArray((selectedHostel as any).openStaffRoles) && (selectedHostel as any).openStaffRoles.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {(selectedHostel as any).openStaffRoles.map((r: any, idx: number) => (
                              <div key={idx} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-200 text-amber-950 rounded-lg text-[10px] font-bold shadow-2xs flex-wrap">
                                <span>{r.role || r}</span>
                                {r.wage && (
                                  <span className="px-1 py-0.2 bg-emerald-50 text-emerald-800 rounded text-[9px] font-black border border-emerald-200">
                                    {r.wage}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-slate-500 font-medium italic bg-amber-50/50 p-2 rounded-lg border border-amber-100">
                            General staff applications welcome. No specific role titles currently specified by management.
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          sessionStorage.setItem('preferred_hostel_id', selectedHostel.id || '');
                          sessionStorage.setItem('preferred_hostel_name', selectedHostel.name || '');
                          navigate('/login?mode=register', { state: { mode: 'register' } });
                        }}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer transform hover:-translate-y-0.5"
                      >
                        <Briefcase size={14} className="text-slate-950" />
                        <span>Apply for Staff Position</span>
                      </button>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                          <Briefcase size={14} className="text-slate-400" />
                          <span>Staff Career Opportunities</span>
                        </h3>
                        <span className="text-[9px] font-black uppercase bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full border border-slate-300">
                          Hiring Paused
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium leading-relaxed">
                        Staff applications for <strong>{selectedHostel.name}</strong> are currently closed. The property manager has paused accepting new staff applications at this time.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </main>

            {/* STAFF APPLICATION MODAL FOR THIS HOSTEL */}
            <AnimatePresence>
              {showStaffAppModal && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 z-60 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
                  onClick={() => setShowStaffAppModal(false)}
                >
                  <motion.div
                    initial={{ scale: 0.95, y: 15 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.95, y: 15 }}
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl border border-blue-200/80 space-y-6 max-h-[90vh] overflow-y-auto"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Briefcase className="w-4 h-4 text-amber-600" />
                          <h3 className="text-base font-black text-slate-900">Apply for Staff Position</h3>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5">Applying to: <strong>{selectedHostel.name}</strong></p>
                      </div>
                      <button
                        onClick={() => setShowStaffAppModal(false)}
                        className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
                      >
                        <X size={16} />
                      </button>
                    </div>

                    <form onSubmit={handleStaffAppSubmit} className="space-y-4">
                      {/* Desired Role */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Role You Want to Apply For *</label>
                        <select
                          value={appRole}
                          onChange={(e) => setAppRole(e.target.value)}
                          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                          required
                        >
                          <option value="Facilities & Maintenance Technician">Facilities & Maintenance Technician</option>
                          <option value="Plumber & Water Systems Lead">Plumber & Water Systems Lead</option>
                          <option value="Electrician & Backup Power Specialist">Electrician & Backup Power Specialist</option>
                          <option value="Head of Security & Gate Operations">Head of Security & Gate Operations</option>
                          <option value="Security Officer">Security Officer</option>
                          <option value="Front Desk & Operations Assistant">Front Desk & Operations Assistant</option>
                          <option value="Housekeeping & Sanitation Staff">Housekeeping & Sanitation Staff</option>
                          <option value="Hostel Warden / Residential Assistant">Hostel Warden / Residential Assistant</option>
                        </select>
                      </div>

                      {/* Name & Phone */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                          <input
                            type="text"
                            value={appName}
                            onChange={(e) => setAppName(e.target.value)}
                            placeholder="e.g. Kwame Mensah"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Phone Number *</label>
                          <input
                            type="tel"
                            value={appPhone}
                            onChange={(e) => setAppPhone(cleanPhoneNumber(e.target.value))}
                            placeholder="024 123 4567 or +233 24 123 4567"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                            required
                          />
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Numbers only (10 digits starting with 0, or international +233)</p>
                        </div>
                      </div>

                      {/* Email & Identity Document Type */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">Email Address (Optional)</label>
                          <input
                            type="email"
                            value={appEmail}
                            onChange={(e) => setAppEmail(e.target.value)}
                            placeholder="kwame@example.com"
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">ID Document Type</label>
                          <select
                            value={appIdType}
                            onChange={(e) => {
                              const newType = e.target.value;
                              setAppIdType(newType);
                              const cfg = resolveIdConfig(newType);
                              setAppNationalId(prev => cfg.formatInput(prev));
                            }}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                          >
                            <option value="Ghana Card">Ghana Card (GHA-XXXXXXXXX-X)</option>
                            <option value="Voter ID">National Voters ID (10 Digits — Numbers Only)</option>
                            <option value="NHIS Card">NHIS Health Card (8 Digits — Numbers Only)</option>
                            <option value="Passport">International Passport (Alphanumeric)</option>
                            <option value="Driver's License">Driver's License (DVLA Alphanumeric)</option>
                          </select>
                        </div>
                      </div>

                      {/* Dynamic ID Number */}
                      {(() => {
                        const cfg = resolveIdConfig(appIdType);
                        return (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-bold text-slate-700">
                                {cfg.name} Number
                              </label>
                              {cfg.numericOnly && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black tracking-wide uppercase">
                                  Numbers Only
                                </span>
                              )}
                            </div>
                            <input
                              type={cfg.numericOnly ? "tel" : "text"}
                              inputMode={cfg.numericOnly ? "numeric" : "text"}
                              maxLength={cfg.maxLength}
                              placeholder={cfg.placeholder}
                              value={appNationalId}
                              onChange={(e) => setAppNationalId(cfg.formatInput(e.target.value))}
                              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white font-mono"
                            />
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {cfg.helperText}
                            </p>
                          </div>
                        );
                      })()}

                      {/* CV File Upload */}
                      <div className="p-4 border-2 border-dashed border-blue-200 bg-blue-50/50 rounded-2xl text-center space-y-2">
                        <FileText className="w-7 h-7 text-blue-600 mx-auto" />
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">Curriculum Vitae (CV) *</span>
                          <span className="text-[10px] text-slate-500">PDF, DOC, or image file (up to 5MB)</span>
                        </div>
                        {appCvFileName ? (
                          <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900 flex items-center justify-between">
                            <span className="truncate max-w-[200px]">{appCvFileName}</span>
                            <span className="text-[9px] bg-emerald-600 text-white px-2 py-0.5 rounded">Ready</span>
                          </div>
                        ) : (
                          <label className="inline-block px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-all">
                            <span>Select CV File</span>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,image/*"
                              onChange={handleStaffAppCvUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* ID Document Upload (Optional) */}
                      <div className="p-3 border border-slate-200 bg-slate-50 rounded-2xl flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900 block">National ID Photo / Scan</span>
                          <span className="text-[10px] text-slate-500">{appIdFileName || 'Optional Ghana Card image'}</span>
                        </div>
                        <label className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 rounded-xl font-bold cursor-pointer transition-colors text-xs">
                          <span>{appIdFileName ? 'Change' : 'Attach ID'}</span>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            onChange={handleStaffAppIdUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Brief Note */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Brief Note / Experience</label>
                        <textarea
                          rows={2}
                          value={appCover}
                          onChange={(e) => setAppCover(e.target.value)}
                          placeholder="Tell the property manager about your past experience in student hostels or technical maintenance."
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                        />
                      </div>

                      <div className="pt-2 border-t flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setShowStaffAppModal(false)}
                          className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={submittingStaffApp || !appCvData}
                          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                        >
                          {submittingStaffApp ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Sending CV to Manager...</span>
                            </>
                          ) : (
                            <>
                              <span>Submit Application & CV</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Staff App Toast */}
            {staffAppToast && (
              <div className="fixed bottom-6 right-6 z-70 animate-bounce">
                <div className={`px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-bold ${
                  staffAppToast.type === 'success' ? 'bg-emerald-700 text-white' : 'bg-rose-700 text-white'
                }`}>
                  {staffAppToast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  <span>{staffAppToast.text}</span>
                </div>
              </div>
            )}

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
      {selectedStaffForOffer && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[92vh] overflow-y-auto"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img src={selectedStaffForOffer.avatar} alt={selectedStaffForOffer.name} className="w-12 h-12 rounded-xl object-cover ring-2 ring-blue-900/10" referrerPolicy="no-referrer" />
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900">Propose One-Time Job Offer</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 text-blue-900 border border-blue-200">
                      Verified Staff
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium">To {selectedStaffForOffer.name} • {selectedStaffForOffer.specialization} ({selectedStaffForOffer.rating || '5.0'} ★)</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStaffForOffer(null)}
                className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSendJobOffer} className="space-y-6 text-xs">
              {/* Section 1: Requester Verified Identity */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <ShieldCheck className="w-4 h-4 text-blue-900" />
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">1. Client Identity & Verification</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Full Legal Name *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Kwame Mensah"
                      value={jobRequesterName}
                      onChange={e => setJobRequesterName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Client Profile Category *</label>
                    <select 
                      value={jobRequesterCategory}
                      onChange={e => setJobRequesterCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-medium text-slate-800"
                    >
                      <option value="Hostel Resident / Student">Hostel Resident / Student</option>
                      <option value="Hostel Property Manager">Hostel Property Manager</option>
                      <option value="Private Homeowner / Landlord">Private Homeowner / Landlord</option>
                      <option value="Commercial Business / Enterprise">Commercial Business / Enterprise</option>
                      <option value="Verified Public Client">Verified Public Client</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Ghana National ID / NIA Card (Optional)</label>
                    <input 
                      type="text" 
                      placeholder="e.g. GHA-712891920-3"
                      value={jobRequesterNationalId}
                      onChange={e => setJobRequesterNationalId(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none uppercase"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Enhances staff trust & safe engagement verification</p>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Property / Organization Name</label>
                    <input 
                      type="text" 
                      placeholder="e.g. PineVela Hall Rm 204 or Private Residence"
                      value={jobRequesterOrg}
                      onChange={e => setJobRequesterOrg(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Primary Phone / WhatsApp *</label>
                    <input 
                      type="tel" 
                      required
                      placeholder="e.g. 024 123 4567"
                      value={jobRequesterPhone}
                      onChange={e => setJobRequesterPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Official Email Address *</label>
                    <input 
                      type="email" 
                      required
                      placeholder="e.g. client@gmail.com"
                      value={jobRequesterEmail}
                      onChange={e => setJobRequesterEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: Work Scope & Specifications */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Briefcase className="w-4 h-4 text-blue-900" />
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">2. Job Scope & Work Category</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Work Category *</label>
                    <select 
                      value={jobWorkCategory}
                      onChange={e => setJobWorkCategory(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-medium text-slate-800"
                    >
                      <option value="Plumbing & Pipe Fitting">Plumbing & Pipe Fitting</option>
                      <option value="Electrical & Wiring Fixes">Electrical & Wiring Fixes</option>
                      <option value="Carpentry & Furniture Assembly">Carpentry & Furniture Assembly</option>
                      <option value="Air Conditioning & Refrigeration">Air Conditioning & Refrigeration</option>
                      <option value="Deep Cleaning & Sanitation">Deep Cleaning & Sanitation</option>
                      <option value="Painting & Wall Treatment">Painting & Wall Treatment</option>
                      <option value="Security & Access Control">Security & Access Control</option>
                      <option value="General Maintenance & Handyman">General Maintenance & Handyman</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Estimated Duration *</label>
                    <select 
                      value={jobEstimatedDuration}
                      onChange={e => setJobEstimatedDuration(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-medium text-slate-800"
                    >
                      <option value="1 - 2 Hours">1 - 2 Hours (Quick fix)</option>
                      <option value="2 - 3 Hours">2 - 3 Hours (Standard job)</option>
                      <option value="Half Day (4 - 5 Hours)">Half Day (4 - 5 Hours)</option>
                      <option value="Full Day (8 Hours)">Full Day (8 Hours)</option>
                      <option value="Multi-day Contract">Multi-day Contract</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Specific Task Scope & Problem Description *</label>
                  <textarea 
                    required
                    rows={3}
                    placeholder="Describe exactly what needs fixing, tools required, and specific expectations..."
                    value={jobWorkOffered}
                    onChange={e => setJobWorkOffered(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* Section 3: Location & Interactive Map Pin */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <MapPin className="w-4 h-4 text-blue-900" />
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">3. Location & GPS Coordinate Pin</h4>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Street Address / Landmark *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Atomic Junction, near Legon Campus, Accra"
                      value={jobLocation}
                      onChange={e => setJobLocation(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-slate-600 mb-1.5 font-bold">Interactive Job Location Pin (Drag pin or click on map):</p>
                  <div id="job-offer-map-picker" className="w-full h-44 rounded-xl border border-slate-300 shadow-inner z-0"></div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500 font-mono">
                    <span>Lat: {jobLat.toFixed(4)}</span>
                    <span>Lng: {jobLng.toFixed(4)}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Schedule, Compensation & Payment */}
              <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
                  <Clock className="w-4 h-4 text-blue-900" />
                  <h4 className="font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">4. Schedule & Compensation</h4>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Date & Time Schedule *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. Tomorrow at 2:00 PM"
                      value={jobSchedule}
                      onChange={e => setJobSchedule(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Offered Compensation / Wage *</label>
                    <input 
                      type="text" 
                      required
                      placeholder="e.g. GHS 300"
                      value={jobWage}
                      onChange={e => setJobWage(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-bold text-blue-900"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Method *</label>
                    <select 
                      value={jobPaymentMethod}
                      onChange={e => setJobPaymentMethod(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none font-medium text-slate-800"
                    >
                      <option value="Mobile Money (MoMo) on Completion">Mobile Money (MoMo) on Completion</option>
                      <option value="Cash on Satisfactory Finish">Cash on Satisfactory Finish</option>
                      <option value="Direct Bank Instant Pay">Direct Bank Instant Pay</option>
                      <option value="PineVela Escrow Deposit">PineVela Escrow Deposit</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Equipment / Site Access Note</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Basic ladder on site; bring multimeter"
                      value={jobEquipment}
                      onChange={e => setJobEquipment(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Section 5: Security Declaration */}
              <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-3">
                <input 
                  type="checkbox" 
                  id="job-safety-check"
                  checked={jobSafetyTermsAccepted}
                  onChange={e => setJobSafetyTermsAccepted(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-blue-900 focus:ring-blue-900"
                />
                <label htmlFor="job-safety-check" className="text-[11px] text-slate-700 font-medium leading-relaxed cursor-pointer">
                  I certify that the above identity and premise details are authentic, and I agree to treat PineVela accredited staff professionally and disburse the agreed compensation upon verified completion of the work.
                </label>
              </div>

              {offerToast && (
                <div className={`p-3.5 rounded-xl font-bold flex items-center gap-2 text-xs ${offerToast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                  {offerToast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                  <span>{offerToast.text}</span>
                </div>
              )}

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedStaffForOffer(null)}
                  className="px-5 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingOffer}
                  className="px-6 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all hover:shadow-lg"
                >
                  {submittingOffer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Briefcase className="w-4 h-4" />}
                  <span>Submit One-Time Job Offer Proposal</span>
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Staff Reviews & Rating Modal */}
      {selectedStaffForReviews && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            className="bg-white rounded-3xl max-w-xl w-full p-8 shadow-2xl border border-slate-200 space-y-6 max-h-[90vh] overflow-y-auto"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <img src={selectedStaffForReviews.avatar} alt={selectedStaffForReviews.name} className="w-12 h-12 rounded-xl object-cover" referrerPolicy="no-referrer" />
                <div>
                  <h3 className="text-lg font-black text-slate-900">{selectedStaffForReviews.name} - Reviews & Ratings</h3>
                  <p className="text-xs text-slate-500">Rating: ★ {selectedStaffForReviews.rating} ({selectedStaffForReviews.reviewCount} total)</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStaffForReviews(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Reviews List */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
              {(!selectedStaffForReviews.reviews || selectedStaffForReviews.reviews.length === 0) ? (
                <p className="text-xs text-slate-500 text-center py-6">No reviews or ratings yet. Be the first manager to review this professional!</p>
              ) : (
                selectedStaffForReviews.reviews.map((rev: any) => (
                  <div key={rev.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">{rev.reviewerName}</span>
                      <div className="flex items-center gap-1 text-amber-600 font-bold">
                        <span>★</span>
                        <span>{rev.rating}.0</span>
                      </div>
                    </div>
                    <p className="text-slate-600">{rev.comment || 'No written comment.'}</p>
                    <span className="text-[10px] text-slate-400 block pt-1">{new Date(rev.createdAt).toLocaleDateString()}</span>
                  </div>
                ))
              )}
            </div>

            {/* Leave a Review Form or Login Prompt */}
            {!user ? (
              <div className="pt-4 border-t border-slate-100 text-center space-y-3">
                <div className="p-4 bg-blue-50/80 rounded-2xl border border-blue-100 text-xs text-blue-900 space-y-2">
                  <div className="font-bold flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-700" />
                    <span>PineVela Account Required to Rate & Review</span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    To maintain verified, authentic artisan and staff reviews, please sign in or create your PineVela account.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStaffForReviews(null);
                    onNavigate('student-login');
                  }}
                  className="w-full py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                >
                  Log In / Sign Up to Rate & Review
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitReview} className="space-y-4 pt-4 border-t border-slate-100 text-xs">
                <h4 className="font-extrabold text-slate-950">Leave a Review & Rating</h4>
                
                <div className="flex items-center gap-4">
                  <label className="font-bold text-slate-700">Rating (1 - 5 stars):</label>
                  <select 
                    value={reviewRating}
                    onChange={e => setReviewRating(Number(e.target.value))}
                    className="px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:outline-none"
                  >
                    <option value={5}>★★★★★ (5 Stars - Exceptional)</option>
                    <option value={4}>★★★★☆ (4 Stars - Very Good)</option>
                    <option value={3}>★★★☆☆ (3 Stars - Good)</option>
                    <option value={2}>★★☆☆☆ (2 Stars - Fair)</option>
                    <option value={1}>★☆☆☆☆ (1 Star - Poor)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Review Comment</label>
                  <textarea 
                    rows={3}
                    placeholder="Share your experience working with this staff member..."
                    value={reviewComment}
                    onChange={e => setReviewComment(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-blue-900 focus:outline-none"
                  />
                </div>

                {reviewToast && (
                  <div className={`p-3 rounded-xl font-bold flex items-center gap-2 ${reviewToast.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                    {reviewToast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{reviewToast.text}</span>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={submittingReview}
                    className="px-6 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-black shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingReview ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Star className="w-4 h-4 text-amber-400" />}
                    <span>Submit Review</span>
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}

      {/* Warm PineVela Account Required Modal Popup */}
      {showAccountRequiredModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div 
            className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-200 space-y-6 text-center"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-900 shadow-sm">
              <ShieldCheck size={32} />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">PineVela Account Required</h3>
              <p className="text-sm text-slate-600 font-medium leading-relaxed">
                To hire accredited property maintenance professionals or submit verified ratings and reviews, you must own or sign into your PineVela user account.
              </p>
            </div>

            <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 font-bold flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>Sign up or log in to start hiring & reviewing!</span>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowAccountRequiredModal(false)}
                className="flex-1 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowAccountRequiredModal(false);
                  onNavigate('student-login');
                }}
                className="flex-1 py-3 rounded-xl bg-blue-900 hover:bg-blue-950 text-white font-black text-xs shadow-md transition-all cursor-pointer"
              >
                Log In / Sign Up
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      <LogoutConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          logout();
          setShowLogoutConfirm(false);
        }}
        userRole={user?.role}
        userName={user?.name}
      />
    </div>
  );
}
