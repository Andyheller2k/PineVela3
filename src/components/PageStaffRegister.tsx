import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { sanitizePdfDataUrl } from '../utils/pdfHelper';
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
  Building, 
  FileText, 
  UploadCloud, 
  Key, 
  Eye, 
  EyeOff, 
  RefreshCw, 
  Check, 
  Award, 
  FileCheck, 
  Compass, 
  Sparkles,
  Briefcase,
  Wrench,
  Clock,
  Home,
  CheckCircle,
  AlertCircle,
  X
} from 'lucide-react';
import PineLogo from './PineLogo';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { apiFetch, safeJson } from '../lib/api';
import {
  validateEmail,
  cleanPhoneNumber,
  validatePhone,
  validateAddress,
  formatDigitalAddress,
  validateDigitalAddress,
  resolveIdConfig
} from '../utils/formValidation';

export default function PageStaffRegister() {
  const navigate = useNavigate();
  const { user, login, setSessionUser } = useAuth();
  const { refreshNotifications } = useNotifications();

  // Active Phase State (1 to 5, 6 for Success)
  const [phase, setPhase] = useState<number>(1);

  // Existing Registered Staff Account State
  const [existingStaffRecord, setExistingStaffRecord] = useState<any>(null);
  const [checkingExisting, setCheckingExisting] = useState<boolean>(true);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [delEmail, setDelEmail] = useState<string>('');
  const [delPassword, setDelPassword] = useState<string>('');
  const [delLoading, setDelLoading] = useState<boolean>(false);
  const [delError, setDelError] = useState<string | null>(null);
  const [showDelPassword, setShowDelPassword] = useState<boolean>(false);
  const [quickLoggingIn, setQuickLoggingIn] = useState<boolean>(false);

  const handleGoToStaffConsole = async () => {
    setToastMessage('Please sign in with your staff account credentials on the Login page.');
    setToastType('info');
    setTimeout(() => {
      navigate('/login');
    }, 400);
  };

  // Fetch and check if user already has a recorded Staff account
  const fetchMyStaffAccount = async (isSilent = false) => {
    try {
      if (!isSilent) setCheckingExisting(true);
      const queryEmail = user?.email || '';
      const queryId = user?.id || '';
      const token = localStorage.getItem('pinevela_auth_token') || (user as any)?.token;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`/api/users/my-registered-accounts?email=${encodeURIComponent(queryEmail)}&userId=${encodeURIComponent(queryId)}`, { headers });
      if (res.ok) {
        const data = await safeJson(res);
        if (data.staffAccount) {
          setExistingStaffRecord((prev: any) => {
            if (JSON.stringify(prev) === JSON.stringify(data.staffAccount)) return prev;
            if (prev && prev.status !== data.staffAccount.status) {
              setToastMessage(`Staff account status updated: ${data.staffAccount.displayStatus || data.staffAccount.status}`);
              setToastType('info');
              setTimeout(() => setToastMessage(null), 3500);
            }
            return data.staffAccount;
          });
          setDelEmail(prev => prev || data.staffAccount.email || queryEmail);
        } else {
          setExistingStaffRecord((prev: any) => prev === null ? prev : null);
        }
      }
    } catch (err) {
      console.warn("Could not check registered staff account status:", err);
    } finally {
      if (!isSilent) setCheckingExisting(false);
    }
  };

  React.useEffect(() => {
    fetchMyStaffAccount();

    const interval = setInterval(() => {
      fetchMyStaffAccount(true);
    }, 8000);

    const onFocus = () => fetchMyStaffAccount(true);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user?.email, user?.id]);

  // Do not pre-fill textboxes automatically; keep blank with placeholders

  // Account Deletion Handler
  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!delEmail || !delPassword) {
      setDelError('Email and password are required.');
      return;
    }
    setDelLoading(true);
    setDelError(null);
    try {
      const authToken = localStorage.getItem('pinevela_session_token') || localStorage.getItem('token') || localStorage.getItem('pinevela_auth_token') || '';
      const res = await fetch('/api/users/delete-registered-account', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          role: 'staff',
          email: delEmail.trim(),
          password: delPassword
        })
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Invalid email or password.');
      }
      setToastType('success');
      setToastMessage(data.message || 'Staff account deleted successfully.');
      try {
        const localStaff = JSON.parse(localStorage.getItem('pinevela_registered_staff') || '[]');
        const tEmail = delEmail.trim().toLowerCase();
        const filteredStaff = localStaff.filter((s: any) => {
          const sEmail = (s.email || '').toLowerCase().trim();
          const sParentEmail = (s.parentUserEmail || '').toLowerCase().trim();
          return sEmail !== tEmail && sParentEmail !== tEmail;
        });
        localStorage.setItem('pinevela_registered_staff', JSON.stringify(filteredStaff));
      } catch (e) {
        console.warn(e);
      }
      setExistingStaffRecord(null);
      setShowDeleteModal(false);
      setDelPassword('');
      setPhase(1);
    } catch (err: any) {
      setDelError(err.message || 'Invalid email or password.');
    } finally {
      setDelLoading(false);
    }
  };

  // Ensure every phase and page view starts strictly from the top
  React.useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant'
    });
    if (document.body) document.body.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
  }, [phase]);

  const [loadingSubmit, setLoadingSubmit] = useState<boolean>(false);
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  // Phase 1: Personal & Contact Info
  const [title, setTitle] = useState('Mr.');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [ageRange, setAgeRange] = useState('25 - 34 Years');

  // Phase 2: Residential Location & Commute
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('Kumasi');
  const [region, setRegion] = useState('Ashanti');
  const [customRegion, setCustomRegion] = useState('');
  const [digitalAddress, setDigitalAddress] = useState('');
  const [commutePreference, setCommutePreference] = useState('Daily Commuter (Lives nearby)');

  // Phase 3: Vocational Trade, Role & Experience
  const [role, setRole] = useState('Facilities & Maintenance Technician');
  const [yearsExperience, setYearsExperience] = useState('1 - 3 Years');
  const [preferredShift, setPreferredShift] = useState('Day Shift (8 AM - 5 PM)');
  const [certification, setCertification] = useState('NVTI Trade Certificate / Technical Diploma');
  const [experienceSummary, setExperienceSummary] = useState('');

  // Phase 4: Identification & Credential Documents
  const [idType, setIdType] = useState('Ghana Card (National ID)');
  const [idNumber, setIdNumber] = useState('');
  const [cvFileName, setCvFileName] = useState<string | null>(null);
  const [cvData, setCvData] = useState<string | null>(null);
  
  // National ID (Ghana Card) Front & Back Upload State
  const [idFrontFileName, setIdFrontFileName] = useState<string | null>(null);
  const [idFrontDoc, setIdFrontDoc] = useState<string | null>(null);
  const [idBackFileName, setIdBackFileName] = useState<string | null>(null);
  const [idBackDoc, setIdBackDoc] = useState<string | null>(null);
  const [idCardDoc, setIdCardDoc] = useState<string | null>(null);

  // Phase 5: Account Credentials & Declaration
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(false);

  // Password Strength Analyzer Helper
  const analyzePasswordStrength = (pwd: string) => {
    let score = 0;
    const checks = {
      length: pwd.length >= 8,
      hasLower: /[a-z]/.test(pwd),
      hasUpper: /[A-Z]/.test(pwd),
      hasNumber: /[0-9]/.test(pwd),
      hasSpecial: /[^a-zA-Z0-9]/.test(pwd)
    };

    if (pwd.length >= 8) score += 25;
    if (pwd.length >= 12) score += 10;
    if (checks.hasLower && checks.hasUpper) score += 25;
    if (checks.hasNumber) score += 20;
    if (checks.hasSpecial) score += 20;

    score = Math.min(score, 100);

    let label = 'Very Weak';
    let color = 'bg-rose-500';
    let textColor = 'text-rose-600';
    let badgeBg = 'bg-rose-50';

    if (score >= 80) {
      label = 'Strong / Excellent';
      color = 'bg-emerald-500';
      textColor = 'text-emerald-600';
      badgeBg = 'bg-emerald-50';
    } else if (score >= 55) {
      label = 'Good';
      color = 'bg-lime-500';
      textColor = 'text-lime-600';
      badgeBg = 'bg-lime-50';
    } else if (score >= 25) {
      label = 'Weak';
      color = 'bg-amber-500';
      textColor = 'text-amber-600';
      badgeBg = 'bg-amber-50';
    }

    return { score, label, color, textColor, badgeBg, checks };
  };

  const pwdStrength = analyzePasswordStrength(password);

  // Trigger Toast Notification
  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // CV File Upload Handler - Compulsory PDF format
  const handleCvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (file.size > MAX_SIZE) {
        triggerToast(`Upload failed: "${file.name}" exceeds the strict 5MB limit. Please upload a smaller document.`, 'error');
        e.target.value = '';
        return;
      }
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        triggerToast('CV document MUST be in PDF format (.pdf)', 'error');
        return;
      }
      setCvFileName(file.name);
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const result = loadEvt.target?.result as string;
        const sanitized = sanitizePdfDataUrl(result, fullName || 'Staff Applicant');
        setCvData(sanitized);
        triggerToast(`CV PDF attached: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Ghana Card National ID Front Upload Handler
  const handleIdFrontUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (file.size > MAX_SIZE) {
        triggerToast(`Upload failed: "${file.name}" exceeds the strict 5MB limit. Please upload a smaller document.`, 'error');
        e.target.value = '';
        return;
      }
      setIdFrontFileName(file.name);
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const result = loadEvt.target?.result as string;
        setIdFrontDoc(result);
        const combined = JSON.stringify({
          front: result,
          back: idBackDoc || result,
          frontName: file.name,
          backName: idBackFileName || file.name
        });
        setIdCardDoc(combined);
        triggerToast(`Ghana Card FRONT attached: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Ghana Card National ID Back Upload Handler
  const handleIdBackUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const MAX_SIZE = 5 * 1024 * 1024; // 5MB limit
      if (file.size > MAX_SIZE) {
        triggerToast(`Upload failed: "${file.name}" exceeds the strict 5MB limit. Please upload a smaller document.`, 'error');
        e.target.value = '';
        return;
      }
      setIdBackFileName(file.name);
      const reader = new FileReader();
      reader.onload = (loadEvt) => {
        const result = loadEvt.target?.result as string;
        setIdBackDoc(result);
        const combined = JSON.stringify({
          front: idFrontDoc || result,
          back: result,
          frontName: idFrontFileName || file.name,
          backName: file.name
        });
        setIdCardDoc(combined);
        triggerToast(`Ghana Card BACK attached: ${file.name}`, 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  // Navigation Validation
  const handleNextPhase = () => {
    if (phase === 1) {
      if (!fullName.trim() || fullName.trim().length < 3) {
        triggerToast('Please enter your full legal name (minimum 3 characters).', 'error');
        return;
      }
      if (!username.trim() || username.trim().length < 3) {
        triggerToast('Please choose a staff username (min 3 characters).', 'error');
        return;
      }
      const phoneCheck = validatePhone(phone, 'Primary contact phone');
      if (!phoneCheck.isValid) {
        triggerToast(phoneCheck.error!, 'error');
        return;
      }
      if (altPhone.trim()) {
        const altCheck = validatePhone(altPhone, 'Alternative contact phone');
        if (!altCheck.isValid) {
          triggerToast(altCheck.error!, 'error');
          return;
        }
      }
    } else if (phase === 2) {
      const addrCheck = validateAddress(address, 'Residential address');
      if (!addrCheck.isValid) {
        triggerToast(addrCheck.error!, 'error');
        return;
      }
      if (!city.trim() || city.trim().length < 2) {
        triggerToast('Please enter your city/town (min 2 characters).', 'error');
        return;
      }
      if (digitalAddress.trim()) {
        const gpsCheck = validateDigitalAddress(digitalAddress);
        if (!gpsCheck.isValid) {
          triggerToast(gpsCheck.error!, 'error');
          return;
        }
      }
    } else if (phase === 3) {
      if (!role) {
        triggerToast('Please choose your primary vocational role or trade.', 'error');
        return;
      }
    } else if (phase === 4) {
      const idCfg = resolveIdConfig(idType);
      const idCheck = idCfg.validate(idNumber);
      if (!idCheck.isValid) {
        triggerToast(idCheck.error!, 'error');
        return;
      }
      if (!cvFileName) {
        triggerToast('Please upload your Curriculum Vitae (CV) in compulsory PDF format.', 'error');
        return;
      }
    } else if (phase === 5) {
      const emailCheck = validateEmail(email, 'Staff login email');
      if (!emailCheck.isValid) {
        triggerToast(emailCheck.error!, 'error');
        return;
      }
      if (!password || password.length < 6) {
        triggerToast('Password must be at least 6 characters long.', 'error');
        return;
      }
      if (password !== confirmPassword) {
        triggerToast('Passwords do not match. Please verify your entries.', 'error');
        return;
      }
    }

    setPhase((prev) => Math.min(prev + 1, 5));
  };

  const handlePrevPhase = () => {
    setPhase((prev) => Math.max(prev - 1, 1));
  };

  // Submit Staff Registration
  const handleSubmitStaffRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loadingSubmit) return;

    const emailCheck = validateEmail(email, 'Staff login email');
    if (!emailCheck.isValid) {
      triggerToast(emailCheck.error!, 'error');
      return;
    }
    const phoneCheck = validatePhone(phone, 'Primary contact phone');
    if (!phoneCheck.isValid) {
      triggerToast(phoneCheck.error!, 'error');
      return;
    }
    const addrCheck = validateAddress(address, 'Residential address');
    if (!addrCheck.isValid) {
      triggerToast(addrCheck.error!, 'error');
      return;
    }
    const idCfg = resolveIdConfig(idType);
    const idCheck = idCfg.validate(idNumber);
    if (!idCheck.isValid) {
      triggerToast(idCheck.error!, 'error');
      return;
    }

    if (!declarationAccepted) {
      triggerToast('Please agree to the safeguarding and code of conduct declaration.', 'error');
      return;
    }

    setLoadingSubmit(true);
    try {
      const formattedName = `${title} ${fullName.trim()}`;
      const cleanEmail = email.trim().toLowerCase();
      const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '_');
      const cleanPhone = phone.trim();

      const payload = {
        name: formattedName,
        username: cleanUsername,
        email: cleanEmail,
        parentUserId: user?.id || undefined,
        parentUserEmail: user?.email || undefined,
        userId: user?.id || undefined,
        userEmail: user?.email || undefined,
        phone: cleanPhone,
        altPhone: altPhone.trim() || undefined,
        password,
        role,
        specialization: role,
        yearsExperience,
        preferredShift,
        address: address.trim(),
        city: city.trim(),
        region: region === 'Other / International' ? customRegion.trim() : region,
        digitalAddress: digitalAddress.trim() || undefined,
        commutePreference,
        nationalId: idNumber.trim(),
        idType,
        idCardDoc: idCardDoc || undefined,
        cvData: cvData || undefined,
        cvFileName: cvFileName || undefined,
        qualifications: certification,
        experienceSummary: experienceSummary.trim() || undefined,
        declarationAccepted: true
      };

      // Call dedicated staff registration endpoint
      const res = await apiFetch('/api/auth/register-staff', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      if (!res.success && res.error) {
        throw new Error(res.error);
      }

      if (res.user?.username) {
        setUsername(res.user.username);
      }

      setPhase(6); // Success confirmation view
      triggerToast('Staff Profile Registered Successfully!', 'success');
      try {
        await refreshNotifications();
      } catch (e) {
        // ignore
      }
      setTimeout(() => {
        fetchMyStaffAccount(false);
      }, 300);
    } catch (err: any) {
      console.error('Staff registration error:', err);
      const msg = err.message || 'An error occurred during staff registration.';
      triggerToast(msg, 'error');
      if (msg.toLowerCase().includes('username')) {
        setPhase(1);
      } else if (msg.toLowerCase().includes('email') || msg.toLowerCase().includes('password')) {
        setPhase(5);
      }
    } finally {
      setLoadingSubmit(false);
    }
  };

  // Handle proceed to console after success
  const handleLaunchConsole = async () => {
    sessionStorage.removeItem('navigated_to_staff_register');
    try {
      setLoadingSubmit(true);
      await login(email.trim().toLowerCase(), password);
      navigate('/staff/dashboard', { replace: true });
    } catch (err) {
      navigate('/login', { replace: true });
    } finally {
      setLoadingSubmit(false);
    }
  };

  const phaseTitles = [
    { num: 1, title: 'Personal Info', sub: 'Legal Identity & Contact', icon: User },
    { num: 2, title: 'Residential Location', sub: 'Living Area & Commute Preference', icon: MapPin },
    { num: 3, title: 'Vocational Trade', sub: 'Role, Experience & Shift Preference', icon: Wrench },
    { num: 4, title: 'Identity & Documents', sub: 'National ID & CV / Resume', icon: ShieldCheck },
    { num: 5, title: 'Credentials & Conduct', sub: 'Account Security & Safeguarding', icon: FileCheck }
  ];

  return (
    <div className="min-h-screen bg-transparent flex flex-col font-sans relative overflow-hidden text-slate-800">
      
      {/* Decorative gradient backdrops */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-indigo-100/60 rounded-full blur-3xl opacity-30 -z-10" />

      {/* Curved semi-circle downwards backdrop */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] md:w-[120%] h-[380px] md:h-[480px] bg-gradient-to-b from-blue-50/70 via-slate-50/60 to-blue-100/30 border-b border-blue-200/30 rounded-b-[50%] -z-10 shadow-sm" />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className={`fixed top-5 right-5 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-2.5 border animate-bounce ${
          toastType === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          toastType === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-900 text-white border-slate-700'
        }`}>
          <span className="text-base">{toastType === 'success' ? '✓' : toastType === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Bar */}
      <header className="bg-white/80 backdrop-blur-md border-b border-blue-100/50 sticky top-0 z-30 px-6 py-4 shadow-xs">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div 
            onClick={() => {
              sessionStorage.removeItem('navigated_to_staff_register');
              navigate('/student/dashboard');
            }}
            className="flex items-center gap-3 cursor-pointer"
          >
            <PineLogo size={36} hideText={false} />
            <span className="hidden sm:inline-block h-5 w-px bg-slate-200" />
            <span className="hidden sm:inline-block text-xs font-extrabold text-blue-900 uppercase tracking-wider bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200/80">
              Staff Career Gateway
            </span>
          </div>

          <button
            onClick={() => {
              sessionStorage.removeItem('navigated_to_staff_register');
              navigate('/student/dashboard');
            }}
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
            <div className="w-10 h-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm font-bold text-slate-600">Checking Registered Staff Account Status...</p>
          </div>
        ) : existingStaffRecord ? (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden relative animate-fadeIn">
            {/* Top Brand Line */}
            <div className="h-2 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 w-full" />
            
            <div className="p-6 sm:p-10 space-y-8">
              {/* Header Info */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center font-bold shadow-sm">
                    <Wrench className="w-8 h-8" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase text-amber-700 tracking-wider">Recorded Registered Account</span>
                      <span className="text-[10px] bg-slate-100 text-slate-700 font-bold px-2 py-0.5 rounded-full border border-slate-200">
                        Staff & Artisan Gateway
                      </span>
                    </div>
                    <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                      {existingStaffRecord.name}
                    </h1>
                    <p className="text-xs text-slate-500 font-medium">
                      Registered Staff Account under <strong className="text-slate-700">{existingStaffRecord.email}</strong>
                    </p>
                  </div>
                </div>

                {/* Verification Status Badge */}
                <div className="flex items-center gap-2">
                  {existingStaffRecord.isVerified || existingStaffRecord.status?.toLowerCase() === 'verified' || existingStaffRecord.status?.toLowerCase() === 'approved' ? (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 text-emerald-800 border border-emerald-200 font-extrabold text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Status: Verified & Accredited Staff</span>
                    </div>
                  ) : existingStaffRecord.isRejected || existingStaffRecord.status?.toLowerCase() === 'rejected' ? (
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
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Vocational Specialization</span>
                  <p className="text-sm font-black text-slate-800">{existingStaffRecord.specialization}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Years of Experience</span>
                  <p className="text-sm font-black text-slate-800">{existingStaffRecord.yearsExperience}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Commute Preference</span>
                  <p className="text-sm font-black text-slate-800">{existingStaffRecord.commutePreference}</p>
                </div>
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 space-y-1">
                  <span className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Contact Phone Number</span>
                  <p className="text-sm font-black text-slate-800">{existingStaffRecord.phone}</p>
                </div>
              </div>

              {/* Account Notice Box */}
              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-100 flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950 leading-relaxed font-medium">
                  <strong>Single Account Policy Active:</strong> Your staff application is recorded in our system. You cannot submit multiple staff accounts under this user profile. To update your specialization or register a new staff account, you can delete your current record below.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setDelEmail(existingStaffRecord.email || user?.email || '');
                    setShowDeleteModal(true);
                  }}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-black text-xs border border-rose-200 flex items-center justify-center gap-2 cursor-pointer transition-all shadow-xs"
                >
                  <X className="w-4 h-4" />
                  <span>Delete Account & Re-Register</span>
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {(existingStaffRecord.isVerified || existingStaffRecord.status?.toLowerCase() === 'approved' || existingStaffRecord.status?.toLowerCase() === 'verified') ? (
                    <button
                      type="button"
                      disabled={quickLoggingIn}
                      onClick={handleGoToStaffConsole}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-50"
                    >
                      <span>{quickLoggingIn ? 'Logging In...' : 'Go to Staff Console'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        sessionStorage.removeItem('navigated_to_staff_register');
                        await refreshNotifications();
                        navigate('/student/dashboard');
                      }}
                      className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <span>Return to User Dashboard</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : phase <= 5 ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl overflow-hidden relative">
            
            {/* Top Brand Line */}
            <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-800 to-indigo-950 w-full" />

            {/* Stepper Header */}
            <div className="p-6 sm:p-8 bg-slate-50/70 border-b border-slate-100">
              
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase text-blue-700 tracking-wider">Phase {phase} of 5</span>
                    <span className="text-[10px] bg-blue-100 text-blue-900 font-bold px-2 py-0.5 rounded-full">
                      Step {phase}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                    {phaseTitles[phase - 1].title}
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">
                    {phaseTitles[phase - 1].sub}
                  </p>
                </div>

                <div className="hidden sm:flex items-center gap-1">
                  {phaseTitles.map((p) => {
                    const Icon = p.icon;
                    const isActive = phase === p.num;
                    const isPassed = phase > p.num;
                    return (
                      <div
                        key={p.num}
                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all ${
                          isPassed
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : isActive
                            ? 'bg-blue-900 text-white shadow-md scale-105'
                            : 'bg-slate-200 text-slate-400'
                        }`}
                        title={p.title}
                      >
                        {isPassed ? <Check size={16} /> : <Icon size={16} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                <motion.div
                  className="bg-gradient-to-r from-blue-600 to-blue-900 h-full rounded-full"
                  initial={{ width: `${((phase - 1) / 5) * 100}%` }}
                  animate={{ width: `${(phase / 5) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Mobile Phase Pill Strip */}
              <div className="flex sm:hidden justify-between items-center mt-3 text-[10px] text-slate-400 font-bold">
                {phaseTitles.map((p) => (
                  <span
                    key={p.num}
                    className={phase === p.num ? 'text-blue-900 font-black' : phase > p.num ? 'text-emerald-600' : ''}
                  >
                    {p.num}. {p.title.split(' ')[0]}
                  </span>
                ))}
              </div>
            </div>

            {/* Form Content Body with Animations */}
            <div className="p-6 sm:p-10">
              <AnimatePresence mode="wait">
                
                {/* PHASE 1: Personal & Contact Info */}
                {phase === 1 && (
                  <motion.div
                    key="phase1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6 text-left"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                      
                      <div className="sm:col-span-1 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Title</label>
                        <select
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          className="w-full py-3 px-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="Mr.">Mr.</option>
                          <option value="Mrs.">Mrs.</option>
                          <option value="Ms.">Ms.</option>
                          <option value="Master">Master</option>
                        </select>
                      </div>

                      <div className="sm:col-span-3 space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Full Legal Name <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                            <User size={18} />
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Kwame Mensah Addo"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                        </div>
                      </div>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-slate-700 block">
                            Staff Username Handle <span className="text-rose-500">*</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const base = fullName.trim() ? fullName.trim().toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/^_+|_+$/g, '') : 'staff';
                              const randomNum = Math.floor(100 + Math.random() * 900);
                              setUsername(`${base || 'staff'}_${randomNum}`);
                            }}
                            className="text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                          >
                            Auto-Generate
                          </button>
                        </div>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 font-bold pointer-events-none">
                            @
                          </span>
                          <input
                            type="text"
                            required
                            placeholder="e.g. kwame_staff"
                            value={username}
                            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 font-mono"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">Used by managers and hostel directors to identify your staff record.</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Age Range / Bracket
                        </label>
                        <select
                          value={ageRange}
                          onChange={(e) => setAgeRange(e.target.value)}
                          className="w-full py-3 px-4 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="18 - 24 Years">18 - 24 Years</option>
                          <option value="25 - 34 Years">25 - 34 Years</option>
                          <option value="35 - 49 Years">35 - 49 Years</option>
                          <option value="50+ Years">50+ Years</option>
                        </select>
                      </div>

                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Primary Contact Phone <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                            <Phone size={18} />
                          </span>
                          <input
                            type="tel"
                            required
                            placeholder="024 000 0000 or +233 24 000 0000"
                            value={phone}
                            onChange={(e) => setPhone(cleanPhoneNumber(e.target.value))}
                            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">Numbers only (10 digits starting with 0, or international +233)</p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Alternative Contact / Emergency Phone
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                            <Phone size={18} />
                          </span>
                          <input
                            type="tel"
                            placeholder="050 000 0000 or +233 50 000 0000"
                            value={altPhone}
                            onChange={(e) => setAltPhone(cleanPhoneNumber(e.target.value))}
                            className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">Numbers only (optional)</p>
                      </div>

                    </div>
                  </motion.div>
                )}

                {/* PHASE 2: Residential Location & Commute */}
                {phase === 2 && (
                  <motion.div
                    key="phase2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6 text-left"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Residential Address / Neighborhood <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute top-3.5 left-3.5 text-slate-400 pointer-events-none">
                          <MapPin size={18} />
                        </span>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Hse 44, Dome Pillar 2 / Haatso"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          City / Town <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Accra"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">Region</label>
                        <select
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="Greater Accra">Greater Accra</option>
                          <option value="Ashanti">Ashanti</option>
                          <option value="Central">Central</option>
                          <option value="Western">Western</option>
                          <option value="Eastern">Eastern</option>
                          <option value="Volta">Volta</option>
                          <option value="Northern">Northern</option>
                          <option value="Bono">Bono</option>
                          <option value="Upper East">Upper East</option>
                          <option value="Upper West">Upper West</option>
                          <option value="Other / International">Other / International</option>
                        </select>
                        {region === 'Other / International' && (
                          <div className="mt-2 space-y-1 animate-fadeIn">
                            <label className="text-[10px] font-bold text-slate-500 block">Specify Region / State *</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. London / California"
                              value={customRegion}
                              onChange={(e) => setCustomRegion(e.target.value)}
                              className="w-full px-4 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                            />
                          </div>
                        )}
                      </div>

                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Commute & Living Preference
                      </label>
                      <select
                        value={commutePreference}
                        onChange={(e) => setCommutePreference(e.target.value)}
                        className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                      >
                        <option value="Daily Commuter (Lives nearby)">Daily Commuter (Lives nearby)</option>
                        <option value="Requires Hostel Staff Quarters (Live-in)">Requires Hostel Staff Quarters (Live-in)</option>
                        <option value="Flexible Commuter (Public Transit / Motorbike)">Flexible Commuter (Public Transit / Motorbike)</option>
                      </select>
                    </div>
                  </motion.div>
                )}

                {/* PHASE 3: Vocational Trade & Experience */}
                {phase === 3 && (
                  <motion.div
                    key="phase3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6 text-left"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Primary Staff Role / Trade Applied For <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="w-full py-3 px-4 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                      >
                        <option value="Facilities & Maintenance Technician">Facilities & Maintenance Technician</option>
                        <option value="Plumber & Water Systems Lead">Plumber & Water Systems Lead</option>
                        <option value="Electrician & Backup Power Specialist">Electrician & Backup Power Specialist</option>
                        <option value="Head of Security & Gate Operations">Head of Security & Gate Operations</option>
                        <option value="Security Officer (Night Shift)">Security Officer (Night Shift)</option>
                        <option value="Front Desk & Operations Assistant">Front Desk & Operations Assistant</option>
                        <option value="Housekeeping & Sanitation Supervisor">Housekeeping & Sanitation Supervisor</option>
                        <option value="Hostel Warden / Residential Assistant">Hostel Warden / Residential Assistant</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Years of Practical Experience
                        </label>
                        <select
                          value={yearsExperience}
                          onChange={(e) => setYearsExperience(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="Entry Level (< 1 Year)">Entry Level (&lt; 1 Year)</option>
                          <option value="1 - 3 Years">1 - 3 Years</option>
                          <option value="3 - 5 Years">3 - 5 Years</option>
                          <option value="5+ Years Senior / Master Craftsman">5+ Years Senior / Master Craftsman</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Preferred Work Shift
                        </label>
                        <select
                          value={preferredShift}
                          onChange={(e) => setPreferredShift(e.target.value)}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="Day Shift (8 AM - 5 PM)">Day Shift (8 AM - 5 PM)</option>
                          <option value="Night Shift (6 PM - 6 AM)">Night Shift (6 PM - 6 AM)</option>
                          <option value="Morning Shift (6 AM - 2 PM)">Morning Shift (6 AM - 2 PM)</option>
                          <option value="Flexible / Rotating">Flexible / Rotating</option>
                          <option value="24/7 On-Call (Residential Emergency)">24/7 On-Call (Residential Emergency)</option>
                        </select>
                      </div>

                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Vocational Certificate / Trade Qualifications
                      </label>
                      <select
                        value={certification}
                        onChange={(e) => setCertification(e.target.value)}
                        className="w-full py-3 px-4 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                      >
                        <option value="NVTI Trade Certificate / Technical Diploma">NVTI Trade Certificate / Technical Diploma</option>
                        <option value="Energy Commission Certified Electrician">Energy Commission Certified Electrician</option>
                        <option value="Security Personnel Clearance & Guard Certificate">Security Personnel Clearance & Guard Certificate</option>
                        <option value="Red Cross First Aid & Safety Certification">Red Cross First Aid & Safety Certification</option>
                        <option value="Hospitality & Customer Care Certificate">Hospitality & Customer Care Certificate</option>
                        <option value="Practical Apprenticeship / Field Experience">Practical Apprenticeship / Field Experience</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Summary of Trade Background & Past Work (Optional)
                      </label>
                      <textarea
                        rows={3}
                        value={experienceSummary}
                        onChange={(e) => setExperienceSummary(e.target.value)}
                        placeholder="Briefly state hostels, estates, or commercial facilities you have worked at and equipment you handle..."
                        className="w-full p-3.5 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-900 resize-none"
                      />
                    </div>
                  </motion.div>
                )}

                {/* PHASE 4: Identity & Credential Documents */}
                {phase === 4 && (
                  <motion.div
                    key="phase4"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6 text-left"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          National ID Document Type
                        </label>
                        <select
                          value={idType}
                          onChange={(e) => {
                            const newType = e.target.value;
                            setIdType(newType);
                            const cfg = resolveIdConfig(newType);
                            setIdNumber(prev => cfg.formatInput(prev));
                          }}
                          className="w-full px-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        >
                          <option value="Ghana Card (National ID)">Ghana Card (GHA-XXXXXXXXX-X)</option>
                          <option value="Voter ID Card">Voter ID Card (10 Digits — Numbers Only)</option>
                          <option value="NHIS Card (Health Insurance)">NHIS Card (8 Digits — Numbers Only)</option>
                          <option value="International Passport">International Passport (e.g. G1234567)</option>
                          <option value="Driver's License">Driver's License (DVLA Alphanumeric)</option>
                        </select>
                      </div>

                      {(() => {
                        const cfg = resolveIdConfig(idType);
                        return (
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-700 block">
                                {cfg.name} Number <span className="text-rose-500">*</span>
                              </label>
                              {cfg.numericOnly && (
                                <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-black tracking-wide uppercase">
                                  Numbers Only (No Alphabets)
                                </span>
                              )}
                            </div>
                            <div className="relative">
                              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                                <ShieldCheck size={18} />
                              </span>
                              <input
                                type={cfg.numericOnly ? "tel" : "text"}
                                required
                                inputMode={cfg.numericOnly ? "numeric" : "text"}
                                maxLength={cfg.maxLength}
                                placeholder={cfg.placeholder}
                                value={idNumber}
                                onChange={(e) => setIdNumber(cfg.formatInput(e.target.value))}
                                className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900 font-mono tracking-wide"
                              />
                            </div>
                            <p className="text-[11px] text-slate-500 font-medium">
                              {cfg.helperText}
                            </p>
                          </div>
                        );
                      })()}

                    </div>

                    {/* Upload CV Document - Compulsory PDF Format */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <span>Upload Curriculum Vitae (CV)</span>
                          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-700 text-[10px] font-black uppercase">Compulsory PDF (.pdf)</span>
                        </label>
                      </div>
                      <div className="border-2 border-dashed border-slate-200 hover:border-blue-900 rounded-2xl p-5 text-center bg-slate-50/50 transition-all">
                        {cvFileName ? (
                          <div className="flex items-center justify-between bg-emerald-50 text-emerald-900 p-3.5 rounded-xl border border-emerald-200">
                            <div className="flex items-center gap-2.5">
                              <FileCheck size={22} className="text-emerald-600 shrink-0" />
                              <div className="text-left">
                                <span className="text-xs font-bold truncate block max-w-xs">{cvFileName}</span>
                                <span className="text-[10px] text-emerald-700 font-semibold">PDF Document loaded & ready for Admin review</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setCvFileName(null);
                                setCvData(null);
                              }}
                              className="text-xs text-rose-600 hover:underline font-bold px-2 py-1 cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer space-y-2 block">
                            <UploadCloud size={30} className="mx-auto text-blue-900" />
                            <div className="text-xs font-bold text-slate-700">
                              Click to attach your CV document (PDF format only)
                            </div>
                            <p className="text-[10px] text-slate-400">
                              Must be in valid PDF format (.pdf) for Admin credential review
                            </p>
                            <input
                              type="file"
                              accept=".pdf,application/pdf"
                              onChange={handleCvUpload}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>

                    {/* Upload National ID Card (Ghana Card - Front & Back) */}
                    <div className="space-y-3 pt-2">
                      <label className="text-xs font-bold text-slate-700 block">
                        National ID Card (Ghana Card) Documents <span className="text-rose-500">* (Front & Back Required)</span>
                      </label>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* ID FRONT */}
                        <div className="border-2 border-dashed border-slate-200 hover:border-blue-900 rounded-2xl p-4 text-center bg-slate-50/40 transition-all">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">1. Front Side (Ghana Card)</span>
                          {idFrontFileName ? (
                            <div className="flex items-center justify-between bg-blue-50 text-blue-900 p-2.5 rounded-xl border border-blue-200">
                              <div className="flex items-center gap-2 truncate">
                                <ShieldCheck size={18} className="text-blue-600 shrink-0" />
                                <span className="text-xs font-bold truncate max-w-[120px]">{idFrontFileName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setIdFrontFileName(null);
                                  setIdFrontDoc(null);
                                }}
                                className="text-[10px] text-rose-600 font-bold px-1.5 py-0.5 cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer space-y-1 block">
                              <UploadCloud size={20} className="mx-auto text-blue-600" />
                              <div className="text-xs font-bold text-slate-700">Upload Front Side</div>
                              <p className="text-[9px] text-slate-400">Scan or photo of ID Front</p>
                              <input
                                type="file"
                                accept=".png,.jpg,.jpeg,.pdf"
                                onChange={handleIdFrontUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>

                        {/* ID BACK */}
                        <div className="border-2 border-dashed border-slate-200 hover:border-blue-900 rounded-2xl p-4 text-center bg-slate-50/40 transition-all">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-2">2. Back Side (Ghana Card)</span>
                          {idBackFileName ? (
                            <div className="flex items-center justify-between bg-blue-50 text-blue-900 p-2.5 rounded-xl border border-blue-200">
                              <div className="flex items-center gap-2 truncate">
                                <ShieldCheck size={18} className="text-blue-600 shrink-0" />
                                <span className="text-xs font-bold truncate max-w-[120px]">{idBackFileName}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setIdBackFileName(null);
                                  setIdBackDoc(null);
                                }}
                                className="text-[10px] text-rose-600 font-bold px-1.5 py-0.5 cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <label className="cursor-pointer space-y-1 block">
                              <UploadCloud size={20} className="mx-auto text-blue-600" />
                              <div className="text-xs font-bold text-slate-700">Upload Back Side</div>
                              <p className="text-[9px] text-slate-400">Scan or photo of ID Back</p>
                              <input
                                type="file"
                                accept=".png,.jpg,.jpeg,.pdf"
                                onChange={handleIdBackUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* PHASE 5: Credentials & Declaration */}
                {phase === 5 && (
                  <motion.div
                    key="phase5"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-6 text-left"
                  >
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 block">
                        Staff Login Email Address <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                          <Mail size={18} />
                        </span>
                        <input
                          type="email"
                          required
                          placeholder="e.g. kwame.staff@pinevela.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full pl-11 pr-4 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400">You can use either this email or your @{username || 'username'} to sign in.</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Security Password <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                            <Key size={18} />
                          </span>
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-11 pr-10 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 block">
                          Confirm Password <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                            <Lock size={18} />
                          </span>
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full pl-11 pr-10 py-3 border border-slate-200 rounded-2xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-900"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>

                    </div>

                    {/* Password Strength Analyzer Widget */}
                    {password.length > 0 && (
                      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3 transition-all">
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ShieldCheck size={16} className={pwdStrength.textColor} />
                            <span className="text-xs font-extrabold text-slate-800">
                              Password Strength:
                            </span>
                            <span className={`text-xs font-extrabold px-2 py-0.5 rounded-md ${pwdStrength.badgeBg} ${pwdStrength.textColor}`}>
                              {pwdStrength.label}
                            </span>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-500">
                            {pwdStrength.score}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                          <motion.div
                            className={`h-full rounded-full ${pwdStrength.color}`}
                            initial={{ width: '0%' }}
                            animate={{ width: `${pwdStrength.score}%` }}
                            transition={{ duration: 0.3 }}
                          />
                        </div>

                        {/* Strength Rule Checklist */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                          <div className={`flex items-center gap-1.5 font-semibold ${pwdStrength.checks.length ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span>{pwdStrength.checks.length ? '✓' : '○'}</span>
                            <span>8+ Characters</span>
                          </div>

                          <div className={`flex items-center gap-1.5 font-semibold ${pwdStrength.checks.hasLower && pwdStrength.checks.hasUpper ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span>{pwdStrength.checks.hasLower && pwdStrength.checks.hasUpper ? '✓' : '○'}</span>
                            <span>Aa Case Mix</span>
                          </div>

                          <div className={`flex items-center gap-1.5 font-semibold ${pwdStrength.checks.hasNumber ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span>{pwdStrength.checks.hasNumber ? '✓' : '○'}</span>
                            <span>0-9 Numbers</span>
                          </div>

                          <div className={`flex items-center gap-1.5 font-semibold ${pwdStrength.checks.hasSpecial ? 'text-emerald-600' : 'text-slate-400'}`}>
                            <span>{pwdStrength.checks.hasSpecial ? '✓' : '○'}</span>
                            <span>!@# Special</span>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* Summary Card */}
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                      <h3 className="text-xs font-black uppercase text-blue-900 tracking-wider flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-500" />
                        Staff Dossier Summary
                      </h3>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">STAFF NAME & HANDLE:</span>
                          <span className="font-extrabold text-slate-800">{title} {fullName} (@{username})</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">VOCATIONAL ROLE:</span>
                          <span className="font-extrabold text-blue-900">{role}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">LOCATION:</span>
                          <span className="font-extrabold text-slate-800">{city}, {region}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">CONTACT:</span>
                          <span className="font-extrabold text-slate-800">{phone}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">IDENTIFICATION:</span>
                          <span className="font-extrabold text-slate-800">{idType} ({idNumber})</span>
                        </div>
                        <div>
                          <span className="text-slate-400 font-bold block text-[10px]">CV DOCUMENT:</span>
                          <span className="font-extrabold text-slate-800">{cvFileName || 'Uploaded in Portal'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Safeguarding & Conduct Declaration */}
                    <label className="flex items-start gap-3.5 p-5 bg-blue-50 border-2 border-blue-400 rounded-2xl cursor-pointer shadow-sm transition-all hover:bg-blue-100/50 hover:border-blue-500">
                      <input
                        type="checkbox"
                        checked={declarationAccepted}
                        onChange={(e) => setDeclarationAccepted(e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded border-blue-400 text-blue-600 focus:ring-blue-600 cursor-pointer accent-blue-600 shrink-0"
                      />
                      <span className="text-xs text-blue-950 font-extrabold leading-relaxed">
                        I hereby declare that all submitted personal records, vocational experience, and national identification credentials are authentic. I agree to abide by PineVela hostel security policies, university student safeguarding regulations, and professional codes of conduct.
                      </span>
                    </label>
                  </motion.div>
                )}

              </AnimatePresence>

              {/* Navigation Button Footer */}
              <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between gap-4">
                {phase > 1 ? (
                  <button
                    type="button"
                    onClick={handlePrevPhase}
                    disabled={loadingSubmit}
                    className="px-5 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center gap-2 cursor-pointer"
                  >
                    <ArrowLeft size={16} />
                    <span>Previous Phase</span>
                  </button>
                ) : <div />}

                {phase < 5 ? (
                  <button
                    type="button"
                    onClick={handleNextPhase}
                    className="px-6 py-3.5 bg-blue-900 hover:bg-blue-850 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center gap-2 ml-auto cursor-pointer"
                  >
                    <span>Continue to Phase {phase + 1}</span>
                    <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSubmitStaffRegistration}
                    disabled={loadingSubmit || !declarationAccepted}
                    className={`px-8 py-3.5 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-xl transition-all flex items-center gap-2 ml-auto cursor-pointer ${
                      declarationAccepted && !loadingSubmit
                        ? 'bg-emerald-600 hover:bg-emerald-700'
                        : 'bg-slate-300 cursor-not-allowed'
                    }`}
                  >
                    {loadingSubmit ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Creating Staff Profile...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={18} />
                        <span>Submit Staff Registration</span>
                      </>
                    )}
                  </button>
                )}
              </div>

            </div>

          </div>
        ) : (
          
          /* SUCCESS STATE: Complete & Proceed */
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-8 sm:p-12 text-center max-w-xl mx-auto space-y-6"
          >
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 size={48} />
            </div>

            <div className="space-y-2">
              <span className="text-xs font-black uppercase text-emerald-600 tracking-wider">
                Staff Profile Active
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-900">
                Staff Registration Complete!
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-md mx-auto">
                Welcome, <strong className="text-slate-800">{fullName}</strong>. Your vocational staff profile for <strong className="text-blue-900">{role}</strong> is now enrolled in the PineVela Staff Network.
              </p>
            </div>

            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-left text-xs text-slate-600 space-y-2 font-medium">
              <p className="font-black text-slate-800 uppercase tracking-wider text-[11px]">Your Staff Credentials:</p>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">LOGIN EMAIL:</span>
                  <span className="font-mono font-bold text-blue-900 truncate block">{email}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">STAFF HANDLE:</span>
                  <span className="font-mono font-bold text-slate-800">@{username}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PRIMARY ROLE:</span>
                  <span className="font-bold text-slate-800">{role}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">PHONE:</span>
                  <span className="font-bold text-slate-800">{phone}</span>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-2xl text-left text-xs text-amber-950 space-y-1">
              <span className="font-black block text-amber-900">Next Step: Administrator Credential Verification</span>
              <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                Your submitted Curriculum Vitae (CV) and National ID credentials have been forwarded to PineVela Administration for verification review. You will receive an update once verified.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={async () => {
                  sessionStorage.removeItem('navigated_to_staff_register');
                  try {
                    await refreshNotifications();
                  } catch (e) {
                    // ignore
                  }
                  navigate('/student/dashboard');
                }}
                className="w-full py-4 bg-blue-900 hover:bg-blue-800 text-white font-black text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Return to User Dashboard</span>
                <ArrowRight size={18} />
              </button>
            </div>
          </motion.div>

        )}

      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-[10px] sm:text-xs text-slate-400 border-t border-slate-100 bg-white">
        &copy; 2026 PineVela Residence Solutions. Staff Career Network & Student Housing Operations.
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
              <h3 className="text-lg font-black text-slate-900">Authenticate Staff Account Deletion</h3>
              <p className="text-xs text-slate-500 leading-relaxed font-medium">
                Enter the email address and password for this Staff account to permanently delete it from our database and allow fresh registration.
              </p>
            </div>

            {delError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>{delError}</span>
              </div>
            )}

            <form onSubmit={handleDeleteAccount} className="space-y-4">
              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Account Email</label>
                <input
                  type="email"
                  value={delEmail}
                  onChange={(e) => setDelEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                  placeholder="e.g. staff@artisan.com"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Account Password</label>
                <div className="relative">
                  <input
                    type={showDelPassword ? 'text' : 'password'}
                    value={delPassword}
                    onChange={(e) => setDelPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 pr-10"
                    placeholder="Enter your account password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowDelPassword(!showDelPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showDelPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={delLoading}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {delLoading ? (
                    <span>Deleting...</span>
                  ) : (
                    <span>Confirm & Delete Account</span>
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
