import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  User, 
  Phone, 
  MapPin, 
  ShieldCheck, 
  Mail, 
  Lock, 
  ArrowRight, 
  ArrowLeft, 
  CheckCircle2, 
  Clock,
  Building, 
  Eye, 
  EyeOff, 
  Check, 
  Compass, 
  Info,
  AlertTriangle,
  HelpCircle,
  Footprints,
  Building2,
  Trash2,
  X
} from 'lucide-react';
import PineLogo from './PineLogo';
import HostelMapPicker from './HostelMapPicker';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { safeJson } from '../lib/api';
import { validateManagerWorkEmail, DISALLOWED_MANAGER_DOMAINS } from '../utils/formValidation';
import { checkIsKumasiLocation } from './HostelMapPicker';

export default function PageManagerOnboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { refreshNotifications } = useNotifications();

  const handleCloseOrReturn = async () => {
    sessionStorage.removeItem('navigated_to_manager_register');
    try {
      await refreshNotifications();
    } catch (e) {
      // ignore
    }
    if (user) {
      if (user.role === 'manager') {
        navigate('/manager/dashboard');
      } else if (user.role === 'staff') {
        navigate('/staff/dashboard');
      } else if (user.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/user/dashboard');
      }
    } else {
      navigate('/login');
    }
  };

  // Active Phase State (1 to 3)
  const [phase, setPhase] = useState<number>(1);

  // Existing Registered Manager Account State
  const [existingManagerRecord, setExistingManagerRecord] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState<boolean>(true);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [delPassword, setDelPassword] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [delError, setDelError] = useState<string | null>(null);

  const fetchExistingManagerStatus = async () => {
    if (!user) {
      setCheckingExisting(false);
      return;
    }
    try {
      setCheckingExisting(true);
      const uEmail = (user.email || '').toLowerCase().trim();
      const uId = user.id || '';
      const token = user?.token || localStorage.getItem('pinevela_auth_token') || localStorage.getItem('pinevela_session_token') || localStorage.getItem('token');
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`/api/users/my-registered-accounts?email=${encodeURIComponent(uEmail)}&userId=${encodeURIComponent(uId)}`, { headers });
      if (res.ok) {
        const data = await safeJson(res);
        if (data.managerAccount) {
          setExistingManagerRecord(data.managerAccount);
        } else {
          setExistingManagerRecord(null);
        }
      }
    } catch (err) {
      console.error("Error checking existing manager record:", err);
    } finally {
      setCheckingExisting(false);
    }
  };

  useEffect(() => {
    fetchExistingManagerStatus();
  }, [user]);

  const handleDeleteManagerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delPassword) {
      setDelError('Manager account password is required to delete registration.');
      return;
    }
    try {
      setIsDeleting(true);
      setDelError(null);
      const token = user?.token || localStorage.getItem('pinevela_auth_token') || localStorage.getItem('pinevela_session_token') || localStorage.getItem('token');
      const res = await fetch('/api/users/delete-registered-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          role: 'manager',
          email: existingManagerRecord?.email || user?.email,
          password: delPassword
        })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete manager account.');
      }
      setShowDeleteModal(false);
      setExistingManagerRecord(null);
      setDelPassword('');
      try {
        await refreshNotifications();
      } catch (e) {
        // ignore
      }
      triggerToast('Manager account deleted. You can now register a new property.', 'success');
      setPhase(1);
    } catch (err: any) {
      setDelError(err.message || 'Failed to delete manager account.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Form State
  const [managerName, setManagerName] = useState(user?.name || '');
  const [hostelName, setHostelName] = useState('');
  // Don't pre-fill email if it's a consumer domain (e.g. gmail.com) as managers must use work emails
  const initialWorkEmail = user?.email && !DISALLOWED_MANAGER_DOMAINS.some(d => user.email.toLowerCase().endsWith(`@${d}`)) ? user.email : '';
  const [email, setEmail] = useState(initialWorkEmail);
  const [phone, setPhone] = useState(user?.phone || '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [latitude, setLatitude] = useState<number>(6.6745);
  const [longitude, setLongitude] = useState<number>(-1.5716);
  const [kumasiZone, setKumasiZone] = useState('KNUST, Kumasi');
  const [location, setLocation] = useState('');
  const [digitalAddress, setDigitalAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [knustAccreditedConfirmed, setKnustAccreditedConfirmed] = useState(false);
  const [showLocationTooltip, setShowLocationTooltip] = useState(false);

  // Submission & UI States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // 30-day restriction check
  const [activeRestriction, setActiveRestriction] = useState<any>(null);
  const [restrictionTimeLeft, setRestrictionTimeLeft] = useState<string>('');

  const fetchRestrictionStatus = async () => {
    try {
      const token = localStorage.getItem('pinevela_auth_token') || localStorage.getItem('pinevela_session_token') || localStorage.getItem('token') || (user as any)?.token;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch('/api/users/manager-restriction', { headers });
      if (res.ok) {
        const data = await safeJson(res);
        setActiveRestriction(data.restriction);
      }
    } catch (err) {
      console.error("Error fetching restriction status:", err);
    }
  };

  useEffect(() => {
    fetchRestrictionStatus();
  }, [user]);

  useEffect(() => {
    if (!activeRestriction) return;
    const timer = setInterval(() => {
      const expiresTime = new Date(activeRestriction.expiresAt).getTime();
      const diffMs = expiresTime - Date.now();
      if (diffMs <= 0) {
        setActiveRestriction(null);
        clearInterval(timer);
      } else {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const diffMins = Math.floor((diffMs % (1000 * 60)) / (1000 * 60));
        const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
        setRestrictionTimeLeft(`${diffDays}d ${diffHours}h ${diffMins}m ${diffSecs}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [activeRestriction]);

  // Phase Validation Handlers
  const handleNextPhase = () => {
    setErrorMessage(null);
    if (phase === 1) {
      if (!managerName.trim() || managerName.trim().length < 3) {
        triggerToast('Please enter your full legal or manager name (minimum 3 characters).', 'error');
        return;
      }
      if (!hostelName.trim() || hostelName.trim().length < 2) {
        triggerToast('Please enter the official name of your hostel or residence.', 'error');
        return;
      }
      setPhase(2);
    } else if (phase === 2) {
      if (!location.trim()) {
        triggerToast('Please specify the street address or plot number in Kumasi.', 'error');
        return;
      }
      // Check Kumasi location validation
      const isKumasi = checkIsKumasiLocation(latitude, longitude, location);
      if (!isKumasi) {
        const err = 'Hostel registration is strictly restricted to KNUST-accredited properties in the Kumasi region. Your pinned map location is outside Kumasi. Please pin your property location inside Kumasi/KNUST to proceed.';
        setErrorMessage(err);
        triggerToast(err, 'error');
        return;
      }
      setPhase(3);
    }
  };

  const handlePrevPhase = () => {
    setPhase((prev) => Math.max(prev - 1, 1));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // 1. Enforce official work email
    const emailVal = validateManagerWorkEmail(email, 'Official Manager Work Email');
    if (!emailVal.isValid) {
      setErrorMessage(emailVal.error!);
      triggerToast(emailVal.error!, 'error');
      return;
    }

    if (!phone.trim() || phone.trim().length < 8) {
      const err = "Please provide a valid phone or WhatsApp contact number.";
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    // 2. Enforce Kumasi / KNUST location
    const isKumasi = checkIsKumasiLocation(latitude, longitude, location);
    if (!isKumasi) {
      const err = 'Hostel registration is strictly restricted to KNUST-accredited properties in the Kumasi region. Locations outside Kumasi cannot be registered.';
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    if (!knustAccreditedConfirmed) {
      const err = "You must accept and confirm that your hostel/residence is located in Kumasi and is officially KNUST accredited.";
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    if (!password || password.length < 6) {
      const err = "Password must be at least 6 characters long.";
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    if (password !== confirmPassword) {
      const err = "Passwords do not match. Please verify your entries.";
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    try {
      setIsSubmitting(true);
      const fullAddressStr = location.toLowerCase().includes('kumasi') 
        ? location.trim() 
        : `${location.trim()}, KNUST, Kumasi`;

      const payload = {
        managerName: managerName.trim(),
        name: managerName.trim(),
        hostelName: hostelName.trim(),
        residenceName: hostelName.trim(),
        latitude: latitude,
        longitude: longitude,
        kumasiZone: 'KNUST, Kumasi',
        location: fullAddressStr,
        address: fullAddressStr,
        operatingAddress: fullAddressStr,
        physicalAddress: fullAddressStr,
        city: 'Kumasi',
        region: 'Ashanti Region',
        digitalAddress: digitalAddress.trim(),
        landmark: landmark.trim(),
        knustAccreditedConfirmed: true,
        managerEmail: email.trim().toLowerCase(),
        email: email.trim().toLowerCase(),
        managerPhone: phone.trim(),
        phone: phone.trim(),
        password: password.trim(),
        parentUserId: user?.id || null,
        parentUserEmail: user?.email || null
      };

      const res = await fetch('/api/manager-verifications/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.token ? { 'Authorization': `Bearer ${user.token}` } : {})
        },
        body: JSON.stringify(payload)
      });

      const data = await safeJson(res);

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit manager registration.');
      }

      setSubmittedData(data.verification || payload);
      setIsSuccess(true);
      setExistingManagerRecord(data.verification || payload);
      try {
        await refreshNotifications();
      } catch (e) {
        // ignore
      }
      triggerToast('Manager Account Registered Successfully!', 'success');
    } catch (err: any) {
      const msg = err.message || 'An error occurred while submitting your registration.';
      setErrorMessage(msg);
      triggerToast(msg, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const phaseTitles = [
    { num: 1, title: 'Residence Identity', sub: 'Manager Name & Property Title', icon: Building },
    { num: 2, title: 'Kumasi Location', sub: 'Campus Zone, Plot & Coordinates', icon: MapPin },
    { num: 3, title: 'Security & Contact', sub: 'Email, Phone & KNUST Accreditation', icon: ShieldCheck }
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col font-sans relative text-slate-800">
      
      {/* Decorative gradient backdrops */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl opacity-30 -z-10 pointer-events-none fixed" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-100/60 rounded-full blur-3xl opacity-30 -z-10 pointer-events-none fixed" />

      {/* Curved semi-circle downwards backdrop */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] md:w-[120%] h-[380px] md:h-[480px] bg-gradient-to-b from-blue-50/70 via-slate-50/60 to-blue-100/30 border-b border-blue-200/30 rounded-b-[50%] -z-10 shadow-sm pointer-events-none fixed" />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-2.5 border animate-bounce ${
          toastType === 'success' ? 'bg-blue-900 text-white border-blue-800' :
          toastType === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-900 text-white border-slate-700'
        }`}>
          <span className="text-base">{toastType === 'success' ? '✓' : toastType === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Static Header Bar at top */}
      <header className="bg-white/90 backdrop-blur-md border-b border-slate-200/90 sticky top-0 z-50 px-6 py-3.5 shadow-sm">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div 
            onClick={handleCloseOrReturn}
            className="flex items-center gap-3 cursor-pointer"
          >
            <PineLogo size={36} hideText={false} />
            <span className="hidden sm:inline-block h-5 w-px bg-slate-200" />
            <span className="hidden sm:inline-block text-xs font-extrabold text-blue-900 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200/80">
              Manager Onboarding Gateway
            </span>
          </div>

          <button
            onClick={handleCloseOrReturn}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 transition-all cursor-pointer border border-slate-200"
            title="Close and return to account"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 flex flex-col justify-center">
        
        {checkingExisting ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-12 text-center flex flex-col items-center justify-center space-y-4">
            <div className="w-10 h-10 border-4 border-blue-900 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-600">Verifying Manager Registration Records...</p>
          </div>
        ) : activeRestriction ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-10 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Account Creation Cooldown Active</h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed font-medium">
              A previously registered manager account associated with your profile was deleted recently. To maintain platform integrity, new registration requires cooldown expiration.
            </p>
            <div className="inline-block px-6 py-3.5 rounded-2xl bg-slate-900 text-amber-400 font-mono font-black text-lg shadow-md">
              {restrictionTimeLeft || 'Processing...'}
            </div>
            <div>
              <button
                onClick={handleCloseOrReturn}
                className="px-6 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold transition-all cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        ) : existingManagerRecord && !isSuccess ? (
          /* Live Status Card: Replaces form card when an account is submitted */
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden relative animate-fadeIn">
            {/* Top Brand Line */}
            <div className="h-2 bg-gradient-to-r from-blue-900 via-indigo-800 to-blue-700 w-full" />
            
            <div className="p-6 sm:p-10 space-y-8">
              {/* Header Info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center font-bold shadow-sm">
                    <Building2 className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-emerald-700 tracking-wider">Recorded Registered Residence</span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                        Manager Gateway
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                      {existingManagerRecord.hostelName || existingManagerRecord.organizationName || 'PineVela Registered Property'}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">
                      Managed by <strong className="text-slate-800">{existingManagerRecord.name || existingManagerRecord.managerName}</strong> • Official Work Email: <strong className="text-emerald-900">{existingManagerRecord.email || existingManagerRecord.managerEmail}</strong>
                    </p>
                  </div>
                </div>

                {/* Verification Status Badge */}
                <div className="flex items-center gap-2">
                  {(existingManagerRecord.isApproved || existingManagerRecord.isVerified || existingManagerRecord.status?.toLowerCase() === 'approved' || existingManagerRecord.status?.toLowerCase() === 'verified') ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Status: Verified & Approved Manager</span>
                    </div>
                  ) : (existingManagerRecord.isRejected || existingManagerRecord.status?.toLowerCase() === 'rejected') ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-rose-50 text-rose-800 border border-rose-200 font-extrabold text-xs">
                      <X className="w-4 h-4 text-rose-600" />
                      <span>Status: Registration Rejected</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-50 text-amber-900 border border-amber-200 font-extrabold text-xs">
                      <Clock className="w-4 h-4 text-amber-600 animate-pulse" />
                      <span>Status: Pending Admin Verification</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Account Details Summary Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Manager Full Name</span>
                  <p className="text-sm font-black text-slate-800">{existingManagerRecord.name || existingManagerRecord.managerName}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Property / Residence</span>
                  <p className="text-sm font-black text-slate-800">{existingManagerRecord.hostelName || existingManagerRecord.organizationName}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Official Manager Work Email</span>
                  <p className="text-sm font-black text-slate-800 font-mono">{existingManagerRecord.email || existingManagerRecord.managerEmail}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Contact Phone</span>
                  <p className="text-sm font-black text-slate-800">{existingManagerRecord.phone || existingManagerRecord.managerPhone || 'Provided'}</p>
                </div>
              </div>

              {/* Status explanation notice */}
              {!(existingManagerRecord.isApproved || existingManagerRecord.isVerified || existingManagerRecord.status?.toLowerCase() === 'approved' || existingManagerRecord.status?.toLowerCase() === 'verified') ? (
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 leading-relaxed font-medium">
                    <strong className="block text-amber-900 font-bold mb-0.5">Verification in Progress — Login Locked:</strong>
                    Your residence registration has been submitted to PineVela Administration. A certified field officer is being scheduled to physically inspect the hostel and verify property details. You cannot log into the Manager Console until your account has been verified by the admin.
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 leading-relaxed font-medium">
                    <strong className="block text-emerald-900 font-bold mb-0.5">Verified Manager Account:</strong>
                    Your property and manager credentials have been verified by PineVela Administration. You can now log into your manager account to manage rooms, bookings, and resident communications.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDelError(null);
                    setDelPassword('');
                    setShowDeleteModal(true);
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Account & Restart Registration</span>
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={handleCloseOrReturn}
                    className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    <span>Return to User Dashboard</span>
                  </button>

                  {(existingManagerRecord.isApproved || existingManagerRecord.isVerified || existingManagerRecord.status?.toLowerCase() === 'approved' || existingManagerRecord.status?.toLowerCase() === 'verified') && (
                    <button
                      type="button"
                      onClick={() => navigate('/login')}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <span>Log In to Manager Console</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : isSuccess ? (
          /* Success Phase: Physical Verification Timeline */
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-8 sm:p-10 space-y-8"
          >
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center mx-auto mb-4 border border-blue-200">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">Manager Account Registered</h2>
              <p className="text-slate-500 text-sm mt-1 max-w-lg mx-auto font-medium">
                Thank you <strong className="text-slate-800">{submittedData?.managerName || managerName}</strong>. Your property manager application for <strong className="text-blue-900">{submittedData?.hostelName || hostelName}</strong> is officially registered.
              </p>
            </div>

            {/* Verification Protocol Timeline */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4">
              <div className="flex items-center gap-2 text-blue-900 text-xs font-black uppercase tracking-wider">
                <Footprints className="w-4 h-4" />
                <span>Next: Physical On-Site Verification Workflow</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex flex-col gap-2 shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 font-black flex items-center justify-center text-xs">
                    01
                  </div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Team Dispatch</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    PineVela administration dispatches an official verification officer to your property location at <strong className="text-slate-700">{location}</strong>.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex flex-col gap-2 shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 font-black flex items-center justify-center text-xs">
                    02
                  </div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">On-Site Inspection</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Our team physically inspects the hostel, confirms existence, validates manager authority, and captures live GPS & photo reports.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-white border border-slate-200/80 flex flex-col gap-2 shadow-xs">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-900 font-black flex items-center justify-center text-xs">
                    03
                  </div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider">Account Activation</h4>
                  <p className="text-xs text-slate-500 leading-relaxed font-medium">
                    Once the inspection report is reviewed and approved, your manager portal is unlocked to publish rooms and receive bookings.
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-2.5 font-medium leading-relaxed">
                <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                <span>
                  <strong>Notice upon login:</strong> When you log in before completion, our system will confirm that your property inspection is in progress. Please ensure phone lines remain reachable.
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  if (user) {
                    handleCloseOrReturn();
                  } else {
                    navigate('/login');
                  }
                }}
                className="w-full sm:w-auto px-8 py-3 rounded-2xl bg-blue-900 hover:bg-blue-800 text-white font-black text-xs transition-all shadow-md cursor-pointer"
              >
                {user ? "Return to Dashboard" : "Go to Manager Login"}
              </button>
            </div>
          </motion.div>
        ) : (
          /* Multi-Phase Wizard Layout (Matching Staff Account Creation) */
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden relative">
            
            {/* Top Accent Gradient Line */}
            <div className="h-1.5 bg-gradient-to-r from-blue-900 via-indigo-800 to-blue-700 w-full" />

            {/* Stepper Header */}
            <div className="p-6 sm:p-8 bg-slate-50/70 border-b border-slate-100">
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-blue-900 tracking-wider">Phase {phase} of 3</span>
                    <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                      Step {phase}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {phaseTitles[phase - 1].title}
                  </h1>
                  <p className="text-xs font-semibold text-slate-500 mt-0.5">
                    {phaseTitles[phase - 1].sub}
                  </p>
                </div>

                {/* Progress Bar Circle / Pill */}
                <div className="hidden sm:flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-xs">
                  <span className="text-xs font-extrabold text-slate-700">{Math.round(10 + ((phase - 1) / 2) * 90)}%</span>
                  <span className="text-[10px] font-bold text-slate-400">Completed</span>
                </div>
              </div>

              {/* Step Navigation Pills */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {phaseTitles.map((p) => {
                  const Icon = p.icon;
                  const isActive = phase === p.num;
                  const isDone = phase > p.num;
                  return (
                    <div 
                      key={p.num}
                      className={`p-2.5 sm:p-3 rounded-2xl border transition-all flex items-center gap-2.5 ${
                        isActive 
                          ? 'bg-blue-900 text-white border-blue-900 shadow-md' 
                          : isDone 
                            ? 'bg-blue-50 text-blue-900 border-blue-200' 
                            : 'bg-white text-slate-400 border-slate-200/80'
                      }`}
                    >
                      <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                        isActive 
                          ? 'bg-white text-blue-900' 
                          : isDone 
                            ? 'bg-blue-200 text-blue-950' 
                            : 'bg-slate-100 text-slate-500'
                      }`}>
                        {isDone ? <Check className="w-4 h-4" /> : p.num}
                      </div>
                      <div className="hidden md:block truncate">
                        <div className={`text-[10px] font-extrabold uppercase tracking-wider truncate ${isActive ? 'text-white' : isDone ? 'text-blue-950' : 'text-slate-500'}`}>
                          {p.title}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form Form Content */}
            <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
              
              {/* PHASE 1: RESIDENCE & MANAGER LEGAL PROFILE */}
              {phase === 1 && (
                <div className="space-y-5 animate-fadeIn">
                  
                  {/* KNUST Accreditation Policy Banner */}
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div className="leading-relaxed">
                      <strong className="text-blue-950 block font-black mb-0.5 uppercase tracking-wider">Kumasi Region & KNUST Accreditation Policy</strong>
                      Manager registration is strictly reserved for officially accredited student housing properties located in the <strong>Kumasi region (KNUST campus area)</strong>.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Manager Full Legal Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text"
                          required
                          value={managerName}
                          onChange={(e) => setManagerName(e.target.value)}
                          placeholder="e.g. Anthony Mensah"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Official Residence / Hostel Name <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Building className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type="text"
                          required
                          value={hostelName}
                          onChange={(e) => setHostelName(e.target.value)}
                          placeholder="e.g. Gaza Luxury Hostel"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* PHASE 2: KUMASI LOCATION & CONTACT INFO */}
              {phase === 2 && (
                <div className="space-y-5 animate-fadeIn">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                            Kumasi Campus Zone <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() => setShowLocationTooltip(!showLocationTooltip)}
                              onMouseEnter={() => setShowLocationTooltip(true)}
                              onMouseLeave={() => setShowLocationTooltip(false)}
                              className="text-slate-400 hover:text-blue-800 transition-colors p-0.5 rounded-full cursor-pointer focus:outline-none flex items-center"
                              title="Why Kumasi/KNUST only?"
                            >
                              <HelpCircle className="w-3.5 h-3.5" />
                            </button>
                            
                            {showLocationTooltip && (
                              <div className="absolute left-0 top-6 z-50 w-72 p-3 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl text-[11px] text-slate-200 space-y-1.5 leading-relaxed">
                                <div className="flex items-center gap-1.5 font-bold text-blue-400 border-b border-slate-800 pb-1">
                                  <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                  <span>Why Kumasi / KNUST Properties Only?</span>
                                </div>
                                <p className="text-slate-300">
                                  PineVela's property management network and physical verification officers are officially localized for <strong>KNUST campus student housing in Kumasi</strong>.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="relative">
                          <MapPin className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value="KNUST, Kumasi"
                            readOnly
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none cursor-not-allowed"
                          />
                        </div>
                      </div>

                      {/* Street Address / Plot Number Required Input Field */}
                      <div>
                        <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                          Street Address or Plot Number <span className="text-rose-500">*</span>
                        </label>
                        <input 
                          type="text"
                          required
                          value={location}
                          onChange={(e) => setLocation(e.target.value)}
                          placeholder="e.g. Plot 24 Block B, Ayeduase, Kumasi"
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                        <p className="text-[10.5px] text-slate-500 font-semibold mt-1.5">
                          Specify your physical plot number or house street address in Kumasi.
                        </p>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-3">
                        Pin Exact Property Location on Map <span className="text-rose-500">*</span>
                      </label>
                      <HostelMapPicker
                        latitude={latitude}
                        longitude={longitude}
                        onLocationSelect={(coords) => {
                          setLatitude(coords.lat);
                          setLongitude(coords.lng);
                          if (coords.addressSnippet) {
                            const snippet = coords.addressSnippet;
                            setLocation(snippet.toLowerCase().includes('kumasi') ? snippet : `${snippet}, Kumasi`);
                          } else if (!location) {
                            setLocation('KNUST Campus, Ayeduase, Kumasi');
                          }
                        }}
                      />
                      
                      {/* Location Verification Status Badge */}
                      <div className="mt-3">
                        {checkIsKumasiLocation(latitude, longitude, location) ? (
                          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Verified Kumasi / KNUST Location Pin recorded ({latitude.toFixed(6)}, {longitude.toFixed(6)}). Ready for Phase 3!</span>
                          </div>
                        ) : (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                            <span>Pinned location ({latitude.toFixed(6)}, {longitude.toFixed(6)}) is outside Kumasi / KNUST. Please drag marker or search a Kumasi location to proceed.</span>
                          </div>
                        )}
                      </div>

                      <p className="text-[10.5px] text-slate-500 font-semibold mt-2 italic">
                        Drag the marker to pinpoint the exact location of your residence in Kumasi. Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
                      </p>
                    </div>
                  </div>

                  {/* Landmark and GhanaPost GPS fields removed as requested */}
                </div>
              )}

              {/* PHASE 3: PORTAL SECURITY & KNUST ACCREDITATION */}
              {phase === 3 && (
                <div className="space-y-5 animate-fadeIn">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Official Manager Email <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="manager@residence.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Phone / WhatsApp Contact <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+233 24 000 0000"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Account Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input 
                          type={showPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mandatory KNUST Accreditation & Kumasi Location Checkbox */}
                  <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        required
                        checked={knustAccreditedConfirmed}
                        onChange={(e) => setKnustAccreditedConfirmed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-800 focus:ring-blue-800 cursor-pointer shrink-0"
                      />
                      <span className="text-xs text-slate-800 leading-relaxed font-semibold">
                        I explicitly confirm and accept that my hostel or residence property is physically located in the <strong className="text-blue-950">Kumasi region</strong> and is <strong className="text-blue-950">KNUST accredited</strong> (or registered to accommodate Kwame Nkrumah University of Science and Technology students).
                      </span>
                    </label>
                  </div>

                  {/* Ethical Guarantee Notice */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs text-slate-600">
                    <ShieldCheck className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-slate-900 block mb-0.5 font-bold">Direct Physical Verification Policy</strong>
                      PineVela strictly relies on physical property visits conducted by certified field officers to establish authentic connection, avoiding intrusive document storage.
                    </div>
                  </div>
                </div>
              )}

              {/* Wizard Footer Navigation Buttons */}
              <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
                {phase === 1 ? (
                  <button
                    type="button"
                    onClick={handleCloseOrReturn}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handlePrevPhase}
                    className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back</span>
                  </button>
                )}

                {phase < 3 ? (
                  <button
                    type="button"
                    onClick={handleNextPhase}
                    className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                  >
                    <span>Next Step</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-8 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Submitting Application...</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Registration</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        )}
      </main>

      {/* Footer Info */}
      <footer className="mt-8 mb-6 text-center text-xs font-semibold text-slate-400 z-10 flex items-center justify-center gap-4">
        <span>© 2026 PineVela Platform Inc.</span>
        <span>•</span>
        <button onClick={() => navigate('/verification-team')} className="text-slate-500 hover:text-blue-900 underline transition-colors">
          PineVela Verification Team Portal
        </button>
      </footer>

      {/* Account Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative">
            <button
              type="button"
              onClick={() => setShowDeleteModal(false)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-black text-slate-900">Authenticate Manager Account Deletion</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Enter your account password to confirm permanent deletion of this Manager registration. Once deleted, you can register a new property immediately.
              </p>
            </div>

            {delError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>{delError}</span>
              </div>
            )}

            <form onSubmit={handleDeleteManagerAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Official Work Email</label>
                <input
                  type="email"
                  value={existingManagerRecord?.email || user?.email || ''}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-sm font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Account Password</label>
                <input
                  type="password"
                  value={delPassword}
                  onChange={(e) => setDelPassword(e.target.value)}
                  required
                  placeholder="Enter your account password"
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-extrabold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isDeleting}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting Registration...</span>
                    </>
                  ) : (
                    <span>Confirm & Delete</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
