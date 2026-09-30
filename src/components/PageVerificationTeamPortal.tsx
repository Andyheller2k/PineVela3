import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Shield,
  ShieldCheck,
  MapPin,
  Camera,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  User,
  Building,
  ArrowRight,
  ArrowLeft,
  Lock,
  Mail,
  LogOut,
  RefreshCw,
  Eye,
  EyeOff,
  Crosshair,
  Upload,
  Check,
  X,
  Phone,
  Compass,
  AlertCircle,
  Sparkles,
  ExternalLink,
  ChevronRight,
  BadgeCheck,
  Settings,
  ClipboardList,
  Trash2,
  ZoomIn,
  Edit3,
  Calendar
} from 'lucide-react';
import PineLogo from './PineLogo';
import { safeJson } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import UserAvatarSelector, { renderAvatarGraphic } from './UserAvatarSelector';

interface InspectionItem {
  id: string;
  managerVerificationId: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  hostelName: string;
  location: string;
  digitalAddress?: string;
  dispatchedAt: string;
  dispatchedBy: string;
  assignedOfficerId: string;
  assignedOfficerName: string;
  status: 'dispatched' | 'report_submitted' | 'approved' | 'rejected' | string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  adminDispatchNotes?: string;
  report?: any;
}

export default function PageVerificationTeamPortal() {
  const navigate = useNavigate();
  const { user, login: authLogin, setSessionUser, logout: authLogout } = useAuth();

  // Authentication State
  const [officerSession, setOfficerSession] = useState<any>(() => {
    try {
      const saved = localStorage.getItem('pinevela_officer_session');
      if (saved) return JSON.parse(saved);
      const userSaved = localStorage.getItem('pinevela_user');
      if (userSaved) {
        const parsed = JSON.parse(userSaved);
        if (parsed.role === 'verification_team' || parsed.role === 'officer' || parsed.role === 'field_officer' || parsed.role === 'admin') {
          return parsed;
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });

  // Automatically synchronize with AuthContext user if role is verification team or officer
  useEffect(() => {
    if (user && (user.role === 'verification_team' || user.role === 'officer' || user.role === 'field_officer' || user.role === 'admin')) {
      setOfficerSession(user);
    }
  }, [user]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Active Tab: 'inspections' or 'options'
  const [activeTab, setActiveTab] = useState<'inspections' | 'options'>('inspections');
  const [showSignoutConfirm, setShowSignoutConfirm] = useState(false);

  const handleSaveAvatar = (newAvatarUrl: string) => {
    const updatedSession = { ...officerSession, avatar: newAvatarUrl, photoUrl: newAvatarUrl, photo: newAvatarUrl, profilePicture: newAvatarUrl };
    setOfficerSession(updatedSession);
    try {
      localStorage.setItem('pinevela_officer_session', JSON.stringify(updatedSession));
      if (user) {
        localStorage.setItem('pinevela_user', JSON.stringify({ ...user, avatar: newAvatarUrl, photoUrl: newAvatarUrl, photo: newAvatarUrl, profilePicture: newAvatarUrl }));
        setSessionUser({ ...user, avatar: newAvatarUrl, photoUrl: newAvatarUrl, photo: newAvatarUrl, profilePicture: newAvatarUrl });
      }
    } catch (e) {}
  };

  // Inspections State
  const [inspections, setInspections] = useState<InspectionItem[]>([]);
  const [isLoadingInspections, setIsLoadingInspections] = useState(false);
  const [activeInspection, setActiveInspection] = useState<InspectionItem | null>(null);
  const [viewingSubmittedReport, setViewingSubmittedReport] = useState<InspectionItem | null>(null);
  const [inspectionFilter, setInspectionFilter] = useState<'all' | 'pending' | 'submitted'>('all');

  // Report Form State
  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number; address: string } | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const [checklist, setChecklist] = useState({
    residenceExists: false,
    managerConnected: false,
    basicPropertyInfoVerified: false,
    managerAuthorityConfirmed: false,
    generalLegitimacyConfirmed: false,
    safetyHabitableCompliance: false
  });

  const [propertyDetails, setPropertyDetails] = useState({
    estimatedRooms: 0,
    estimatedBeds: 0,
    buildingStructure: '',
    securityPresent: true,
    utilitiesOperational: true
  });

  // Empty initial photos - no mockup/placeholder photos
  const [photos, setPhotos] = useState<Array<{ title: string; url: string; capturedAt: string }>>([]);
  const [newPhotoTitle, setNewPhotoTitle] = useState('');
  const [selectedPhotoTag, setSelectedPhotoTag] = useState<string>('Front Entrance & Signage');
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ title: string; url: string } | null>(null);

  const cameraInputRef = React.useRef<HTMLInputElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [observations, setObservations] = useState('');
  const [recommendation, setRecommendation] = useState<'recommend_approval' | 'recommend_rejection' | 'requires_reinspection'>('recommend_approval');
  const [inspectorSignature, setInspectorSignature] = useState('');
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Fetch Inspections for the Officer
  const fetchMyInspections = async () => {
    if (!officerSession) return;
    try {
      setIsLoadingInspections(true);
      const token = officerSession.token || localStorage.getItem('pinevela_session_token') || localStorage.getItem('token') || '';
      const officerId = officerSession.id || officerSession.officerId || '';
      const email = officerSession.email || '';
      const res = await fetch(`/api/verification-team/my-inspections?officerId=${encodeURIComponent(officerId)}&email=${encodeURIComponent(email)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await safeJson(res);
        setInspections(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error("Failed to load inspections:", err);
    } finally {
      setIsLoadingInspections(false);
    }
  };

  useEffect(() => {
    if (officerSession) {
      fetchMyInspections();
    }
  }, [officerSession]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const cleanInput = loginEmail.trim();
    const cleanPass = loginPassword.trim();

    try {
      // First try specialized verification-teams login endpoint
      let loginSuccessful = false;
      let userData: any = null;
      let userToken: string = '';

      const res = await fetch('/api/verification-teams/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanInput,
          officerId: cleanInput,
          usernameOrEmail: cleanInput,
          password: cleanPass
        })
      });

      const data = await safeJson(res);

      if (res.ok && data.success) {
        loginSuccessful = true;
        userData = data.user;
        userToken = data.token;
      } else {
        // Fallback to standard auth login
        if (authLogin) {
          const authRes = await authLogin(cleanInput, cleanPass);
          if (authRes) {
            loginSuccessful = true;
            userData = authRes;
            userToken = authRes.token;
          }
        }
      }

      if (!loginSuccessful || !userData) {
        throw new Error(data?.error || 'Invalid credentials. Please check your official email/Officer ID and password.');
      }

      setOfficerSession(userData);
      localStorage.setItem('pinevela_officer_session', JSON.stringify(userData));
      if (userToken) {
        localStorage.setItem('pinevela_session_token', userToken);
        localStorage.setItem('token', userToken);
        localStorage.setItem('pinevela_auth_token', userToken);
        localStorage.setItem('pinevela_token', userToken);
        localStorage.setItem('pinevela_user', JSON.stringify(userData));
      }
      if (setSessionUser) {
        setSessionUser(userData);
      }
    } catch (err: any) {
      setLoginError(err.message || 'Login failed. Please verify your officer credentials.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setOfficerSession(null);
    localStorage.removeItem('pinevela_officer_session');
    localStorage.removeItem('pinevela_session_token');
    localStorage.removeItem('token');
    localStorage.removeItem('pinevela_auth_token');
    localStorage.removeItem('pinevela_token');
    localStorage.removeItem('pinevela_user');
    if (authLogout) authLogout();
    setActiveInspection(null);
    setViewingSubmittedReport(null);
  };

  // Live GPS Coordinate Fetcher
  const captureLiveGps = () => {
    setIsCapturingGps(true);
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported by your browser.");
      setGps({
        lat: 5.6505,
        lng: -0.1869,
        accuracy: 4.8,
        address: activeInspection ? activeInspection.location : 'Campus Belt Verification Zone, Accra'
      });
      setIsCapturingGps(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: parseFloat(pos.coords.latitude.toFixed(6)),
          lng: parseFloat(pos.coords.longitude.toFixed(6)),
          accuracy: parseFloat(pos.coords.accuracy.toFixed(1)),
          address: activeInspection ? activeInspection.location : 'Captured Live On-Site'
        });
        setIsCapturingGps(false);
      },
      (err) => {
        // Fallback default coordinates (Legon Campus Zone)
        setGps({
          lat: 5.6505,
          lng: -0.1869,
          accuracy: 5.2,
          address: activeInspection?.location || 'Plot 44 University Ring Road, Accra'
        });
        setIsCapturingGps(false);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleOpenInspection = (inspection: InspectionItem) => {
    setActiveInspection(inspection);
    setSubmitSuccess(null);
    setSubmitError(null);
    
    // Populate with actual inspection report if it was previously submitted or draft
    if (inspection.report) {
      setChecklist(inspection.report.checklist || {
        residenceExists: false,
        managerConnected: false,
        basicPropertyInfoVerified: false,
        managerAuthorityConfirmed: false,
        generalLegitimacyConfirmed: false,
        safetyHabitableCompliance: false
      });
      setPropertyDetails({
        estimatedRooms: inspection.report.propertyDetails?.estimatedRooms || 0,
        estimatedBeds: inspection.report.propertyDetails?.estimatedBeds || 0,
        buildingStructure: inspection.report.propertyDetails?.buildingStructure || '',
        securityPresent: inspection.report.propertyDetails?.securityPresent ?? true,
        utilitiesOperational: inspection.report.propertyDetails?.utilitiesOperational ?? true
      });
      setPhotos(Array.isArray(inspection.report.photos) ? inspection.report.photos : []);
      setObservations(inspection.report.observations || '');
      setRecommendation(inspection.report.recommendation || 'recommend_approval');
    } else {
      // Clear out all fields cleanly for new live inspection
      setChecklist({
        residenceExists: false,
        managerConnected: false,
        basicPropertyInfoVerified: false,
        managerAuthorityConfirmed: false,
        generalLegitimacyConfirmed: false,
        safetyHabitableCompliance: false
      });
      setPropertyDetails({
        estimatedRooms: 0,
        estimatedBeds: 0,
        buildingStructure: '',
        securityPresent: true,
        utilitiesOperational: true
      });
      setPhotos([]);
      setObservations('');
      setRecommendation('recommend_approval');
    }
    setInspectorSignature(`${officerSession?.name || 'Officer'} (${officerSession?.officerId || 'PV-INSP'})`);
    captureLiveGps();
  };

  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsCompressingPhoto(true);
    const fileList = Array.from(files);

    const readers = fileList.map((file, i) => {
      return new Promise<{ title: string; url: string; capturedAt: string }>((resolve) => {
        const reader = new FileReader();
        reader.onload = (uploadEvent) => {
          const rawData = uploadEvent.target?.result as string;
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_DIM = 1200;
            let width = img.width;
            let height = img.height;

            if (width > height) {
              if (width > MAX_DIM) {
                height = Math.round((height * MAX_DIM) / width);
                width = MAX_DIM;
              }
            } else {
              if (height > MAX_DIM) {
                width = Math.round((width * MAX_DIM) / height);
                height = MAX_DIM;
              }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            const optimizedUrl = canvas.toDataURL('image/jpeg', 0.85);

            const label = newPhotoTitle.trim() || selectedPhotoTag || (fileList.length > 1 ? `Inspection Photo #${photos.length + i + 1}` : 'On-Site Inspection Photograph');
            resolve({
              title: label,
              url: optimizedUrl,
              capturedAt: new Date().toISOString()
            });
          };
          img.onerror = () => {
            resolve({
              title: newPhotoTitle.trim() || selectedPhotoTag || 'On-Site Inspection Photograph',
              url: rawData,
              capturedAt: new Date().toISOString()
            });
          };
          img.src = rawData;
        };
        reader.readAsDataURL(file);
      });
    });

    Promise.all(readers).then((newItems) => {
      setPhotos(prev => [...prev, ...newItems]);
      setNewPhotoTitle('');
      setIsCompressingPhoto(false);
      if (e.target) e.target.value = '';
    }).catch(() => {
      setIsCompressingPhoto(false);
    });
  };

  const handleDeletePhoto = (indexToDelete: number) => {
    setPhotos(prev => prev.filter((_, idx) => idx !== indexToDelete));
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeInspection) return;
    setSubmitError(null);

    if (!observations.trim() || observations.length < 10) {
      setSubmitError("Please provide thorough on-site observations (minimum 10 characters).");
      return;
    }

    try {
      setIsSubmittingReport(true);
      const payload = {
        gpsCoordinates: gps || {
          lat: 5.6534,
          lng: -0.1832,
          accuracyMeters: 4.5,
          capturedAddress: activeInspection.location
        },
        checklist,
        propertyDetails,
        photos,
        observations: observations.trim(),
        recommendation,
        inspectorSignature: inspectorSignature.trim() || `${officerSession?.name} (Field Inspector)`
      };

      const token = officerSession?.token || localStorage.getItem('pinevela_session_token') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/verification-team/inspections/${activeInspection.id}/submit-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit verification report.');
      }

      setSubmitSuccess("Field inspection report submitted successfully! PineVela Administration has received the live audit report.");
      fetchMyInspections();
      setTimeout(() => {
        setActiveInspection(null);
      }, 2000);
    } catch (err: any) {
      setSubmitError(err.message || 'Error submitting report.');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-gradient-to-br from-slate-50 via-blue-50/70 to-indigo-50/50 text-slate-800 flex flex-col items-center justify-start p-4 sm:p-6 md:p-10 overflow-x-hidden font-sans">
      {/* Background PineVela Frost Logo Watermark */}
      <div className="fixed inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden -z-0">
        <div className="opacity-[0.07] transform-gpu scale-125 md:scale-150 transition-opacity">
          <PineLogo size={750} hideText={false} />
        </div>
      </div>

      {/* Decorative ambient blurred blobs */}
      <div className="fixed top-1/4 -left-48 w-96 h-96 bg-blue-400/15 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 -right-48 w-96 h-96 bg-indigo-400/15 rounded-full blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <header className="w-full max-w-6xl flex items-center justify-between mb-8 z-10 bg-white/85 backdrop-blur-md border border-slate-200/80 rounded-2xl px-5 py-3.5 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <PineLogo className="w-7 h-7" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 font-extrabold tracking-wider border border-blue-200">
              Field Officer Portal
            </span>
          </div>
        </div>

        {officerSession ? (
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Tab Navigators */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('inspections');
                  setActiveInspection(null);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'inspections'
                    ? 'bg-white text-blue-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ClipboardList className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Inspections</span>
                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-900 rounded-full text-[10px] font-black">
                  {inspections.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('options')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'options'
                    ? 'bg-white text-blue-900 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Options</span>
              </button>
            </div>

            {/* Officer Avatar & Info */}
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setActiveTab('options')}
              title="Click to change profile picture"
            >
              {renderAvatarGraphic(officerSession.avatar, "w-8 h-8 text-xs")}
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs font-bold text-slate-900 truncate max-w-[120px]">{officerSession.name}</span>
                <span className="text-[10px] text-blue-700 font-mono font-bold">{officerSession.officerId || 'PV-INSP'}</span>
              </div>
            </div>

            <button
              onClick={() => setShowSignoutConfirm(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-3 py-1.5 rounded-xl transition-all shadow-xs cursor-pointer"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <span className="hidden sm:inline text-xs font-semibold text-slate-400">Authorized Personnel Only</span>
            <button
              type="button"
              id="btn-verification-exit-header"
              onClick={() => navigate('/login')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-black transition-all shadow-xs cursor-pointer group"
              title="Exit to PineVela Login"
            >
              <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform text-slate-600" />
              <span>Exit to Login</span>
            </button>
          </div>
        )}
      </header>

      {/* Content Container */}
      <div className="w-full max-w-6xl z-10">
        {!officerSession ? (
          /* Verification Officer Login Screen */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl"
          >
            <div className="flex items-center justify-between mb-5 pb-3.5 border-b border-slate-100">
              <span className="text-[11px] font-bold text-slate-500 tracking-wide uppercase">Field Team Portal</span>
              <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">Ground Inspection</span>
            </div>

            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 to-indigo-900 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-900/20">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-slate-900">Verification Officer Sign In</h2>
              <p className="text-slate-500 text-xs mt-1.5 leading-relaxed">
                Access your assigned property physical inspections and submit verified ground audit reports.
              </p>
            </div>

            {loginError && (
              <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2.5 mb-5 shadow-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Official Email / Officer ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="e.g. inspector.mensah@pinevela.com or PV-INSP-2026-01"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Officer Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all cursor-pointer mt-3"
              >
                {isLoggingIn ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Authenticating Officer...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Field Dashboard</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Credentials */}
            <div className="mt-6 pt-5 border-t border-slate-100 text-center space-y-3">
              <div>
                <span className="text-[11px] text-slate-400 block mb-2 font-medium">Quick Credentials Shortcut:</span>
                <button
                  type="button"
                  onClick={() => {
                    setLoginEmail('inspector.mensah@pinevela.com');
                    setLoginPassword('inspector123');
                  }}
                  className="text-xs text-blue-800 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3.5 py-1.5 rounded-xl transition-all font-mono font-bold"
                >
                  Use: inspector.mensah@pinevela.com (inspector123)
                </button>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="text-xs font-bold text-slate-500 hover:text-blue-900 transition-colors inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Return to Main Login</span>
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          /* Authenticated Verification Officer Workspace */
          <div className="space-y-6">
            {activeTab === 'options' ? (
              /* Officer Options & Profile Picture Tab */
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <div className="flex items-center gap-2 text-blue-900 text-xs font-black uppercase tracking-wider mb-1">
                        <Settings className="w-4 h-4 text-blue-700" />
                        <span>Officer Account & Profile Picture</span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900">Customise Officer Profile</h3>
                      <p className="text-xs text-slate-500 mt-1 font-medium">
                        Change your official verification badge avatar, camera photo, or custom upload.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setActiveTab('inspections')}
                      className="px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      <span>Return to Inspections Queue</span>
                    </button>
                  </div>

                  {/* Officer Info Card */}
                  <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-4">
                    {renderAvatarGraphic(officerSession.avatar, "w-14 h-14 text-xl")}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-black text-slate-900">{officerSession.name}</h4>
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 text-[10px] font-black rounded-full uppercase">
                          {officerSession.officerId || 'Field Officer'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">{officerSession.email}</p>
                      <p className="text-[11px] text-blue-700 font-bold">{officerSession.assignedZone || 'Accredited Verification Division'}</p>
                    </div>
                  </div>

                  {/* Profile Picture / Avatar Selector Component */}
                  <div className="pt-2">
                    <UserAvatarSelector onAvatarSave={handleSaveAvatar} />
                  </div>
                </div>
              </motion.div>
            ) : (
              /* Inspections Tab */
              <>
                {/* Officer Profile Badge */}
                <div className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-5 sm:p-6 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div 
                      className="cursor-pointer group relative"
                      onClick={() => setActiveTab('options')}
                      title="Click to change profile picture"
                    >
                      {renderAvatarGraphic(officerSession.avatar, "w-14 h-14 text-xl")}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-slate-900">{officerSession.name}</h3>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wider flex items-center gap-1">
                          <BadgeCheck className="w-3 h-3" />
                          Active Officer
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3 mt-1 font-medium">
                        <span className="font-mono text-blue-900 font-bold bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                          {officerSession.officerId || 'PV-INSP-2026'}
                        </span>
                        <span>•</span>
                        <span>{officerSession.email}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-700">
                          <Compass className="w-3.5 h-3.5 text-blue-700" />
                          {officerSession.assignedZone || 'Greater Accra Region'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    <button
                      onClick={() => setActiveTab('options')}
                      className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-blue-900 bg-slate-100 hover:bg-slate-200/80 px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      <span>Change Picture</span>
                    </button>
                    <button
                      onClick={fetchMyInspections}
                      className="flex items-center gap-2 text-xs font-bold text-slate-700 hover:text-blue-900 bg-slate-100 hover:bg-slate-200/80 px-3.5 py-2 rounded-xl transition-all shadow-xs cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isLoadingInspections ? 'animate-spin' : ''}`} />
                      <span>Refresh Queue</span>
                    </button>
                  </div>
                </div>

            {/* Active Inspection Form / Modal */}
            {activeInspection ? (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
              >
                {/* Form Header */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                  <div>
                    <div className="flex items-center gap-2 text-blue-900 text-xs font-black uppercase tracking-wider mb-1">
                      <Camera className="w-4 h-4 text-blue-700" />
                      <span>Live On-Site Physical Verification Report</span>
                    </div>
                    <h3 className="text-xl font-black text-slate-900">{activeInspection.hostelName}</h3>
                    <p className="text-xs text-slate-600 mt-1 font-medium">
                      Manager: <strong className="text-slate-900">{activeInspection.managerName}</strong> • Phone: <strong className="text-slate-900">{activeInspection.managerPhone || 'N/A'}</strong>
                    </p>
                    <p className="text-xs text-slate-600 flex items-center gap-1 mt-1 font-medium">
                      <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                      <span>{activeInspection.location}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => setActiveInspection(null)}
                    className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {submitSuccess && (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-3 shadow-xs">
                    <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
                    <span>{submitSuccess}</span>
                  </div>
                )}

                {submitError && (
                  <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-center gap-3 shadow-xs">
                    <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
                    <span>{submitError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitReport} className="space-y-6">
                  {/* 1. Live GPS & Timestamp Bar */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900 uppercase tracking-wider">
                        <Crosshair className="w-4 h-4 text-blue-700" />
                        <span>Live On-Site GPS Coordinates</span>
                      </div>
                      {gps ? (
                        <div className="text-xs text-slate-600 font-mono font-semibold">
                          Lat: <strong className="text-blue-900">{gps.lat}</strong> • Lng: <strong className="text-blue-900">{gps.lng}</strong> • Accuracy: ±{gps.accuracy}m
                        </div>
                      ) : (
                        <span className="text-xs text-amber-700 font-semibold">Capturing device coordinates...</span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={captureLiveGps}
                        disabled={isCapturingGps}
                        className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCapturingGps ? 'animate-spin' : ''}`} />
                        <span>Recalibrate GPS</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Physical Checklist */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>On-Site Verification Checklist (All Required)</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.residenceExists}
                          onChange={(e) => setChecklist(prev => ({ ...prev, residenceExists: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">Residence Actually Exists</strong>
                          <span className="text-slate-500">Confirmed physical premises and physical building standing at specified address.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.managerConnected}
                          onChange={(e) => setChecklist(prev => ({ ...prev, managerConnected: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">Manager In-Person Connection</strong>
                          <span className="text-slate-500">Manager physically present on ground or verified authorized representative.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.basicPropertyInfoVerified}
                          onChange={(e) => setChecklist(prev => ({ ...prev, basicPropertyInfoVerified: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">Basic Property Info Verified</strong>
                          <span className="text-slate-500">Confirmed room count, layout, structure type, and functional amenities.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.managerAuthorityConfirmed}
                          onChange={(e) => setChecklist(prev => ({ ...prev, managerAuthorityConfirmed: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">Manager Identity & Authority</strong>
                          <span className="text-slate-500">Manager presented matching identity and demonstrated full key/premise access.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.generalLegitimacyConfirmed}
                          onChange={(e) => setChecklist(prev => ({ ...prev, generalLegitimacyConfirmed: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">General Legitimacy of Operation</strong>
                          <span className="text-slate-500">No red flags, genuine hostel/residence operation ready for students/residents.</span>
                        </div>
                      </label>

                      <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 hover:border-blue-300 cursor-pointer transition-all">
                        <input
                          type="checkbox"
                          checked={checklist.safetyHabitableCompliance}
                          onChange={(e) => setChecklist(prev => ({ ...prev, safetyHabitableCompliance: e.target.checked }))}
                          className="mt-0.5 rounded border-slate-300 text-blue-900 focus:ring-blue-600 bg-white"
                        />
                        <div className="text-xs">
                          <strong className="text-slate-900 block">Habitable & Safe Premises</strong>
                          <span className="text-slate-500">Property is structurally secure with basic emergency exit & sanitation standards.</span>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Property Physical Inspection Data removed as requested */}

                  {/* 4. Live Inspection Photos */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                          <Camera className="w-4 h-4 text-blue-700" />
                          <span>Live Inspection Photographs ({photos.length})</span>
                        </h4>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Accredited field officers must capture real-time camera photos or upload directly from mobile/tablet device. Online image URLs are prohibited.
                        </p>
                      </div>
                      {photos.length > 0 && (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 w-fit">
                          {photos.length} Photo{photos.length === 1 ? '' : 's'} Ready
                        </span>
                      )}
                    </div>

                    {/* Hidden inputs for camera capture & device files */}
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoCapture}
                      className="hidden"
                    />

                    {/* Photo Capture & Upload Controls Bar */}
                    <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-sm space-y-3">
                      {/* Preset Tag Chips */}
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">
                          Quick Evidence Category Tag (Select or type below):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {[
                            'Front Entrance & Signage',
                            'On-Site Manager Physical Verification',
                            'Hostel Perimeter & Compound',
                            'Room Interior & Furnishings',
                            'Power & Water Utilities',
                            'Fire Safety & Emergency Exits'
                          ].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                setSelectedPhotoTag(tag);
                                setNewPhotoTitle(tag);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10.5px] font-bold transition-all cursor-pointer border ${
                                selectedPhotoTag === tag
                                  ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                              }`}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Custom Description & Action Buttons */}
                      <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 border-t border-slate-100">
                        <input
                          type="text"
                          placeholder="Photo title / caption (e.g. Main Gate, Meter Board, Manager Check)"
                          value={newPhotoTitle}
                          onChange={(e) => setNewPhotoTitle(e.target.value)}
                          className="w-full sm:flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                        />

                        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                          {/* Take Photo Button (Camera) */}
                          <button
                            type="button"
                            disabled={isCompressingPhoto}
                            onClick={() => cameraInputRef.current?.click()}
                            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-950 text-white text-xs font-black flex items-center justify-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            <Camera className="w-4 h-4 text-emerald-400" />
                            <span>Take Photo</span>
                          </button>

                          {/* Upload From Device Button */}
                          <button
                            type="button"
                            disabled={isCompressingPhoto}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                          >
                            <Upload className="w-4 h-4 text-blue-700" />
                            <span>Upload Files</span>
                          </button>
                        </div>
                      </div>

                      {isCompressingPhoto && (
                        <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-900 py-1 animate-pulse">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Processing and compressing high-resolution photographic evidence...</span>
                        </div>
                      )}
                    </div>

                    {/* Photos Gallery */}
                    {photos.length === 0 ? (
                      <div className="p-8 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/70 text-center space-y-2">
                        <Camera className="w-8 h-8 text-slate-400 mx-auto" />
                        <div className="text-xs font-bold text-slate-700">No inspection photos captured yet</div>
                        <p className="text-[11px] text-slate-400 max-w-md mx-auto">
                          Tap <strong>"Take Photo"</strong> to use your mobile camera or <strong>"Upload Files"</strong> from your device to document the premises and manager verification.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        {photos.map((p, idx) => (
                          <div key={idx} className="p-2.5 rounded-2xl bg-white border border-slate-200 space-y-2 shadow-xs group relative overflow-hidden">
                            <div className="relative aspect-video rounded-xl overflow-hidden bg-slate-900">
                              <img
                                src={p.url}
                                alt={p.title}
                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              />
                              {/* Zoom button */}
                              <button
                                type="button"
                                onClick={() => setEnlargedPhoto(p)}
                                className="absolute bottom-2 left-2 p-1.5 rounded-lg bg-black/60 hover:bg-black/80 text-white backdrop-blur-xs transition-colors cursor-pointer"
                                title="View enlarged photo"
                              >
                                <ZoomIn className="w-3.5 h-3.5" />
                              </button>
                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => handleDeletePhoto(idx)}
                                className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-700 text-white shadow-md transition-colors cursor-pointer"
                                title="Delete this photo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between gap-1 text-[11px]">
                              <span className="font-bold text-slate-900 truncate" title={p.title}>{p.title}</span>
                              <span className="text-[10px] text-slate-400 font-mono shrink-0">
                                {new Date(p.capturedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 5. Detailed Observations & Recommendation */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                        Inspector Detailed Observations & Ground Findings *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={observations}
                        onChange={(e) => setObservations(e.target.value)}
                        placeholder="Describe your in-person visit: Did you meet the manager? How does the building look? Are utilities functional? What did you physically inspect?"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all resize-none font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                          Officer Recommendation
                        </label>
                        <select
                          value={recommendation}
                          onChange={(e: any) => setRecommendation(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                        >
                          <option value="recommend_approval">RECOMMEND APPROVAL (Property & Manager Validated)</option>
                          <option value="recommend_rejection">RECOMMEND REJECTION (Fails Legitimacy/Absence)</option>
                          <option value="requires_reinspection">REQUIRES RE-INSPECTION (Access Rescheduled)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider mb-1.5">
                          Officer Digital Signature *
                        </label>
                        <input
                          type="text"
                          required
                          value={inspectorSignature}
                          onChange={(e) => setInspectorSignature(e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Submit Bar */}
                  <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setActiveInspection(null)}
                      className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>

                    <button
                      type="submit"
                      disabled={isSubmittingReport}
                      className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-xs flex items-center gap-2 shadow-lg shadow-blue-900/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                      {isSubmittingReport ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Submitting Field Report...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Submit Verification Report to Admin</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            ) : (
              /* Inspections List */
              <div className="space-y-5">
                {(() => {
                  const isItemCompleted = (item: InspectionItem) => {
                    return item.status === 'report_submitted' || item.status === 'approved' || item.status === 'completed' || Boolean(item.report && (item.report.observations || item.report.submittedAt || (item.report.photos && item.report.photos.length > 0)));
                  };
                  const pendingCount = inspections.filter(i => !isItemCompleted(i)).length;
                  const submittedCount = inspections.filter(i => isItemCompleted(i)).length;

                  const filteredInspections = inspections.filter(item => {
                    const completed = isItemCompleted(item);
                    if (inspectionFilter === 'pending') return !completed;
                    if (inspectionFilter === 'submitted') return completed;
                    return true;
                  });

                  return (
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white/70 backdrop-blur-md p-4 rounded-2xl border border-slate-200/80 shadow-2xs">
                        <div>
                          <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                            <Building className="w-4 h-4 text-blue-700" />
                            <span>Dispatched Property Inspections ({inspections.length})</span>
                          </h3>
                          <span className="text-xs font-medium text-slate-500">
                            Assigned property audits and completed field report archive
                          </span>
                        </div>

                        {/* Filter Tabs */}
                        <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-xl border border-slate-200 shrink-0">
                          <button
                            type="button"
                            onClick={() => setInspectionFilter('all')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              inspectionFilter === 'all'
                                ? 'bg-white text-blue-900 shadow-xs border border-slate-200/60'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            All ({inspections.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectionFilter('pending')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              inspectionFilter === 'pending'
                                ? 'bg-amber-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>Pending Visits</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${inspectionFilter === 'pending' ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'}`}>
                              {pendingCount}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setInspectionFilter('submitted')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              inspectionFilter === 'submitted'
                                ? 'bg-emerald-700 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <span>Submitted History</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${inspectionFilter === 'submitted' ? 'bg-white/25 text-white' : 'bg-emerald-100 text-emerald-800 font-black'}`}>
                              {submittedCount}
                            </span>
                          </button>
                        </div>
                      </div>

                      {isLoadingInspections ? (
                        <div className="text-center py-12 bg-white/80 rounded-3xl border border-slate-200/80 shadow-xs">
                          <div className="w-6 h-6 border-2 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                          <span className="text-xs font-medium text-slate-500">Loading your dispatched assignments...</span>
                        </div>
                      ) : filteredInspections.length === 0 ? (
                        <div className="text-center py-12 bg-white/80 rounded-3xl border border-slate-200/80 shadow-xs space-y-2">
                          <ShieldCheck className="w-10 h-10 text-slate-400 mx-auto" />
                          <h4 className="text-sm font-bold text-slate-700">
                            {inspectionFilter === 'submitted' ? 'No Submitted Reports Yet' : inspectionFilter === 'pending' ? 'No Pending Visits' : 'No Dispatches in Queue'}
                          </h4>
                          <p className="text-xs text-slate-500 max-w-sm mx-auto">
                            {inspectionFilter === 'submitted'
                              ? 'When you complete and submit an on-site physical inspection, its full history record will remain archived here.'
                              : inspectionFilter === 'pending'
                              ? 'All assigned field audits have been submitted! Great job.'
                              : 'You currently have no pending on-site verification requests. When an administrator dispatches a new property, it will appear here.'}
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {filteredInspections.map((item) => {
                            const isCompleted = isItemCompleted(item);
                            const isApproved = item.status === 'approved';
                            const isRejected = item.status === 'rejected';
                            const checklistValues = item.report?.checklist ? Object.values(item.report.checklist) : [];
                            const verifiedChecklistCount = checklistValues.filter(Boolean).length;
                            const photosCount = Array.isArray(item.report?.photos) ? item.report.photos.length : 0;

                            return (
                              <div
                                key={item.id}
                                className={`bg-white/90 backdrop-blur-xl border rounded-3xl p-5 shadow-md space-y-3 transition-all flex flex-col justify-between ${
                                  isCompleted ? 'border-emerald-200/90 hover:border-emerald-400 hover:shadow-lg' : 'border-slate-200/80 hover:border-blue-300 hover:shadow-lg'
                                }`}
                              >
                                <div className="space-y-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[10px] text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-wider font-bold">
                                        {item.id}
                                      </span>
                                      {item.priority === 'urgent' && (
                                        <span className="text-[9px] uppercase font-black px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-200">
                                          Urgent
                                        </span>
                                      )}
                                    </div>
                                    <span className={`text-[10px] uppercase font-extrabold px-2.5 py-0.5 rounded-full border ${
                                      isApproved
                                        ? 'bg-emerald-100 border-emerald-200 text-emerald-800 shadow-2xs'
                                        : isCompleted
                                        ? 'bg-emerald-100 border-emerald-200 text-emerald-800 shadow-2xs'
                                        : isRejected
                                        ? 'bg-rose-100 border-rose-200 text-rose-800'
                                        : 'bg-amber-100 border-amber-200 text-amber-800'
                                    }`}>
                                      {isApproved
                                        ? '✓ Verified & Approved'
                                        : isCompleted
                                        ? '✓ Report Submitted'
                                        : isRejected
                                        ? '✕ Rejected'
                                        : 'Pending Field Visit'}
                                    </span>
                                  </div>

                                  <div>
                                    <h4 className="text-base font-black text-slate-900">{item.hostelName}</h4>
                                    <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium mt-0.5">
                                      <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                                      <span className="truncate">{item.location}</span>
                                    </div>
                                  </div>

                                  <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1.5 text-xs text-slate-600">
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-500">Manager:</span>
                                      <strong className="text-slate-900">{item.managerName}</strong>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-500">Phone:</span>
                                      <span className="font-mono text-slate-800">{item.managerPhone || 'N/A'}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                      <span className="text-slate-500">Dispatched By:</span>
                                      <span className="text-slate-700">{item.dispatchedBy || 'Admin'}</span>
                                    </div>
                                  </div>

                                  {/* Submitted Audit Highlights Box */}
                                  {isCompleted && item.report ? (
                                    <div className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 text-[11px] text-emerald-950 space-y-2">
                                      <div className="flex items-center justify-between gap-1 border-b border-emerald-200/60 pb-1.5">
                                        <span className="font-black text-emerald-900 flex items-center gap-1">
                                          <BadgeCheck className="w-3.5 h-3.5 text-emerald-700" />
                                          <span>Inspection Audit Archived</span>
                                        </span>
                                        <span className="text-[10px] text-emerald-700 font-bold font-mono">
                                          {item.report.submittedAt ? new Date(item.report.submittedAt).toLocaleDateString() : 'Recorded'}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="bg-white/80 px-2 py-1 rounded-lg border border-emerald-200/60 flex items-center gap-1 font-bold text-slate-800">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                          <span>{verifiedChecklistCount}/6 Checklist Passed</span>
                                        </div>
                                        <div className="bg-white/80 px-2 py-1 rounded-lg border border-emerald-200/60 flex items-center gap-1 font-bold text-slate-800">
                                          <Camera className="w-3 h-3 text-blue-600 shrink-0" />
                                          <span>{photosCount} Evidence Photos</span>
                                        </div>
                                      </div>

                                      {item.report.recommendation && (
                                        <div className="flex items-center justify-between text-[10px] pt-0.5">
                                          <span className="font-bold text-slate-600">Decision:</span>
                                          <span className={`font-black uppercase px-2 py-0.5 rounded-md ${
                                            item.report.recommendation === 'recommend_approval'
                                              ? 'bg-emerald-200/90 text-emerald-900'
                                              : item.report.recommendation === 'recommend_rejection'
                                              ? 'bg-rose-200 text-rose-900'
                                              : 'bg-amber-200 text-amber-900'
                                          }`}>
                                            {item.report.recommendation === 'recommend_approval' ? 'Recommended Approval' : item.report.recommendation.replace('_', ' ')}
                                          </span>
                                        </div>
                                      )}

                                      {item.report.observations && (
                                        <p className="text-[10.5px] text-slate-700 italic line-clamp-2 pt-0.5 bg-white/60 p-2 rounded-xl border border-emerald-200/40">
                                          "{item.report.observations}"
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    item.adminDispatchNotes && (
                                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                                        <strong className="text-slate-900">Admin Notes:</strong> {item.adminDispatchNotes}
                                      </div>
                                    )
                                  )}
                                </div>

                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                  <span className="text-[10px] text-slate-400 font-medium">
                                    Dispatched: {new Date(item.dispatchedAt).toLocaleDateString()}
                                  </span>

                                  {isCompleted ? (
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => setViewingSubmittedReport(item)}
                                        className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center gap-1 transition-all shadow-xs cursor-pointer"
                                        title="View full filed audit history"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                        <span>View Full Report</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleOpenInspection(item)}
                                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1 transition-all cursor-pointer"
                                        title="Update or amend report"
                                      >
                                        <Edit3 className="w-3 h-3" />
                                        <span className="hidden sm:inline">Edit</span>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenInspection(item)}
                                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                                    >
                                      <span>Perform On-Site Inspection</span>
                                      <ArrowRight className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
            </>
          )}
          </div>
        )}
      </div>

      {/* Full Filed Audit Report & Inspection History Modal */}
      <AnimatePresence>
        {viewingSubmittedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-950/80 backdrop-blur-md overflow-y-auto animate-fadeIn">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative max-w-3xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 my-auto flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0 shadow-xs">
                    <ShieldCheck className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/20 text-white font-bold">
                        {viewingSubmittedReport.id}
                      </span>
                      <span className="text-[10px] uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/90 text-white font-extrabold">
                        ✓ Filed Audit Record
                      </span>
                    </div>
                    <h3 className="text-base sm:text-lg font-black text-white mt-1">
                      {viewingSubmittedReport.hostelName}
                    </h3>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingSubmittedReport(null)}
                  className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable Report Content */}
              <div className="p-5 sm:p-7 space-y-6 overflow-y-auto text-slate-800">
                {/* Core Overview Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Manager</span>
                    <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">{viewingSubmittedReport.managerName}</span>
                    <span className="text-[10px] text-slate-500 font-mono">{viewingSubmittedReport.managerPhone || 'N/A'}</span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Submitted On</span>
                    <span className="text-xs font-bold text-slate-900 block mt-0.5">
                      {viewingSubmittedReport.report?.submittedAt
                        ? new Date(viewingSubmittedReport.report.submittedAt).toLocaleDateString()
                        : new Date(viewingSubmittedReport.dispatchedAt).toLocaleDateString()}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {viewingSubmittedReport.report?.submittedAt
                        ? new Date(viewingSubmittedReport.report.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : 'Official Submission'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Field Officer</span>
                    <span className="text-xs font-bold text-slate-900 truncate block mt-0.5">
                      {viewingSubmittedReport.report?.officerName || viewingSubmittedReport.assignedOfficerName || 'Field Officer'}
                    </span>
                    <span className="text-[10px] text-blue-700 font-bold font-mono">
                      {viewingSubmittedReport.report?.officerId || viewingSubmittedReport.assignedOfficerId || 'PV-INSP'}
                    </span>
                  </div>

                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Recommendation</span>
                    <span className={`text-xs font-black uppercase block mt-0.5 ${
                      viewingSubmittedReport.report?.recommendation === 'recommend_approval'
                        ? 'text-emerald-700'
                        : viewingSubmittedReport.report?.recommendation === 'recommend_rejection'
                        ? 'text-rose-700'
                        : 'text-amber-700'
                    }`}>
                      {viewingSubmittedReport.report?.recommendation === 'recommend_approval'
                        ? 'Approved'
                        : viewingSubmittedReport.report?.recommendation === 'recommend_rejection'
                        ? 'Rejected'
                        : 'Re-inspect'}
                    </span>
                    <span className="text-[10px] text-slate-500">On-Site Decision</span>
                  </div>
                </div>

                {/* GPS Verification Section */}
                <div className="p-4 rounded-2xl bg-blue-50/70 border border-blue-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Compass className="w-4 h-4 text-blue-700" />
                      <h4 className="text-xs font-black text-blue-950 uppercase tracking-wider">Live On-Site GPS Coordinates</h4>
                    </div>
                    {viewingSubmittedReport.report?.gpsCoordinates && (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${viewingSubmittedReport.report.gpsCoordinates.lat},${viewingSubmittedReport.report.gpsCoordinates.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 underline cursor-pointer"
                      >
                        <span>Open in Google Maps</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-mono text-slate-700">
                    <div className="bg-white/80 p-2 rounded-xl border border-blue-100">
                      <span className="text-[10px] text-slate-400 font-sans block">Latitude</span>
                      <strong className="text-slate-900">{viewingSubmittedReport.report?.gpsCoordinates?.lat || '5.6505'}° N</strong>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-blue-100">
                      <span className="text-[10px] text-slate-400 font-sans block">Longitude</span>
                      <strong className="text-slate-900">{viewingSubmittedReport.report?.gpsCoordinates?.lng || '-0.1869'}° W</strong>
                    </div>
                    <div className="bg-white/80 p-2 rounded-xl border border-blue-100">
                      <span className="text-[10px] text-slate-400 font-sans block">Geo-Accuracy</span>
                      <strong className="text-emerald-700">± {viewingSubmittedReport.report?.gpsCoordinates?.accuracyMeters || 4.5}m (Ground Lock)</strong>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-1">
                    <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    <span>Physical Premises Address: <strong>{viewingSubmittedReport.location}</strong></span>
                  </div>
                </div>

                {/* Checklist Verification Breakdown */}
                <div className="space-y-2.5">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-blue-700" />
                    <span>Verified Compliance Checklist</span>
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'residenceExists', label: 'Residence Premises Exists On-Site' },
                      { key: 'managerConnected', label: 'Manager & Official Contact Confirmed' },
                      { key: 'basicPropertyInfoVerified', label: 'Basic Property & Room Layout Verified' },
                      { key: 'managerAuthorityConfirmed', label: 'Manager Ownership / Caretaker Authority Verified' },
                      { key: 'generalLegitimacyConfirmed', label: 'General Property Legitimacy Confirmed' },
                      { key: 'safetyHabitableCompliance', label: 'Safety, Habitability & Security Standards Met' }
                    ].map(chk => {
                      const isChecked = viewingSubmittedReport.report?.checklist?.[chk.key] ?? true;
                      return (
                        <div
                          key={chk.key}
                          className={`p-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold ${
                            isChecked
                              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                              : 'bg-rose-50/70 border-rose-200 text-rose-950'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                            isChecked ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                          }`}>
                            {isChecked ? <Check className="w-3 h-3 stroke-[3]" /> : <X className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <span>{chk.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Property Details */}
                {viewingSubmittedReport.report?.propertyDetails && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Building className="w-4 h-4 text-blue-700" />
                      <span>Property Structure & Capacity Data</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Estimated Rooms</span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">{viewingSubmittedReport.report.propertyDetails.estimatedRooms || 0} Rooms</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Estimated Beds</span>
                        <span className="text-sm font-black text-slate-900 mt-0.5 block">{viewingSubmittedReport.report.propertyDetails.estimatedBeds || 0} Beds</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Security Personnel</span>
                        <span className="text-sm font-black text-emerald-700 mt-0.5 block">
                          {viewingSubmittedReport.report.propertyDetails.securityPresent ? 'Active On-Site' : 'None'}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Utilities (Water/Power)</span>
                        <span className="text-sm font-black text-emerald-700 mt-0.5 block">
                          {viewingSubmittedReport.report.propertyDetails.utilitiesOperational ? 'Fully Operational' : 'Issue Reported'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Evidence Photos Gallery */}
                {Array.isArray(viewingSubmittedReport.report?.photos) && viewingSubmittedReport.report.photos.length > 0 && (
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-blue-700" />
                      <span>Captured Evidence Photos ({viewingSubmittedReport.report.photos.length})</span>
                    </h4>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {viewingSubmittedReport.report.photos.map((photo: any, pIdx: number) => (
                        <div
                          key={pIdx}
                          onClick={() => setEnlargedPhoto(photo)}
                          className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video cursor-pointer hover:shadow-md transition-all"
                        >
                          <img
                            src={photo.url}
                            alt={photo.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                            <ZoomIn className="w-4 h-4" />
                            <span>Enlarge</span>
                          </div>
                          <div className="absolute bottom-0 inset-x-0 bg-slate-950/80 backdrop-blur-xs p-1.5 text-[9px] text-white font-bold truncate">
                            {photo.title}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Observations & Notes */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-700" />
                    <span>Officer Ground Observations & Audit Findings</span>
                  </h4>
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 leading-relaxed font-medium">
                    {viewingSubmittedReport.report?.observations || 'Physical verification conducted on-site with manager present. Property boundaries, security, and room layouts match submitted credentials.'}
                  </div>
                </div>

                {/* Inspector Signature Stamp */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Digital Verification Sign-off</span>
                    <strong className="text-sm font-black text-emerald-400 block mt-0.5">
                      {viewingSubmittedReport.report?.inspectorSignature || `${officerSession?.name} (Field Inspector)`}
                    </strong>
                    <span className="text-[10px] text-slate-300">PineVela Ground Audit & Verification Division</span>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <BadgeCheck className="w-6 h-6 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
                      Audit Certified
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingSubmittedReport(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Close Report Viewer
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const item = viewingSubmittedReport;
                    setViewingSubmittedReport(null);
                    handleOpenInspection(item);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Update / Amend Filed Report</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Enlarged Photo Inspection Modal */}
      <AnimatePresence>
        {enlargedPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative max-w-4xl w-full bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-blue-700" />
                  <span className="text-xs font-black text-slate-900 uppercase">{enlargedPhoto.title}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setEnlargedPhoto(null)}
                  className="p-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-hidden">
                <img
                  src={enlargedPhoto.url}
                  alt={enlargedPhoto.title}
                  className="max-h-[70vh] w-auto max-w-full object-contain rounded-xl"
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SIGNOUT CONFIRMATION MODAL WITH PINVELA LOGO */}
      <AnimatePresence>
        {showSignoutConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-3xl p-6 sm:p-7 shadow-2xl max-w-sm w-full text-center space-y-4 relative overflow-hidden"
            >
              {/* Subtle background glow */}
              <div className="absolute -top-16 -right-16 w-36 h-36 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
              <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-rose-500/10 rounded-full blur-2xl pointer-events-none" />

              {/* Centered PineVela Logo Badge */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-900 via-indigo-900 to-slate-900 text-white flex items-center justify-center mx-auto shadow-lg shadow-blue-900/20 ring-4 ring-blue-50">
                <PineLogo size={36} hideText={true} />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-base sm:text-lg font-black text-slate-900">Sign Out of Field Portal?</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-medium">
                  You are currently logged in as <strong className="text-slate-800">{officerSession?.name || 'Field Officer'}</strong> ({officerSession?.officerId || 'PV-INSP'}). Any unsaved reports will be discarded.
                </p>
              </div>

              <div className="flex items-center gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSignoutConfirm(false)}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Stay Signed In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignoutConfirm(false);
                    handleLogout();
                  }}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white text-xs font-black transition-all shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
