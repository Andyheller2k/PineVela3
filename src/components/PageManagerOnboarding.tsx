import { activateOnKeyboard } from '../lib/keyboardActivation';
import DashboardOverlay from './DashboardOverlay';
import { usesSupabasePersistence } from '../lib/persistence';
import VerifiedAccountEnrollment,{type ManagerEnrollmentSnapshot} from './VerifiedAccountEnrollment';
import ManagerClosureRequest from './ManagerClosureRequest';
import ManagerApplicationCorrections from './ManagerApplicationCorrections';
import { routePopupFeedback } from '../lib/feedback';
import RouteSkeleton from './RouteSkeleton';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import OnboardingProgress from './OnboardingProgress';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect, useRef } from 'react';
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
  const [correctingManager,setCorrectingManager]=useState(false);
  const [googleManagerPreview,setGoogleManagerPreview]=useState(false);
  const [managerEnrollmentSnapshot,setManagerEnrollmentSnapshot]=useState<ManagerEnrollmentSnapshot|null>(null);
  const [managerStatusError,setManagerStatusError]=useState('');
  const [checkingExisting, setCheckingExisting] = useState<boolean>(true);
  const activeOwner=useRef(user?.id);activeOwner.current=user?.id;
  const managerStatusRequest=useRef(0);
  const managerStatusController=useRef<AbortController|null>(null);
  const [retainedManagerEmail,setRetainedManagerEmail]=useState<string|null>(null);
  const [verifiedSubmission,setVerifiedSubmission] = useState<Record<string,unknown> | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [delPassword, setDelPassword] = useState<string>('');
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [delError, setDelError] = useState<string | null>(null);

  const fetchExistingManagerStatus = async () => {
    const captured=user?.id;
    managerStatusController.current?.abort();
    const controller=new AbortController();managerStatusController.current=controller;
    const request=++managerStatusRequest.current;
    const current=()=>!controller.signal.aborted&&request===managerStatusRequest.current&&activeOwner.current===captured;
    if (!user) {
      setCheckingExisting(false);
      return;
    }
    try {
      setCheckingExisting(true);
      setManagerStatusError('');
      if(usesSupabasePersistence){setCheckingRestriction(true);setRestrictionOwner(`${captured}:${user.role}`);setRestrictionError(null);}
      const uEmail = (user.email || '').toLowerCase().trim();
      const uId = user.id || '';
      const token = user?.token;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if(usesSupabasePersistence)headers['X-PineVela-Profile-Context']=captured;
      const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]);
      const res=await fetch(usesSupabasePersistence?'/api/users/manager-onboarding':`/api/users/my-registered-accounts?email=${encodeURIComponent(uEmail)}&userId=${encodeURIComponent(uId)}`,{headers,signal});
      if(usesSupabasePersistence&&!res.ok){
        const failure=await safeJson(res);
        throw Error([401,403].includes(res.status)?'Open manager registration from your primary user account, then retry loading its sign-in options.':failure.error||'Could not load your manager registration. Please retry.');
      }
      if (res.ok) {
        const payload = await safeJson(res);
        const data=usesSupabasePersistence?payload.registrations:payload;
        if(!current())return;
        if(usesSupabasePersistence&&(!data||!('managerAccount'in data)))throw Error('Could not confirm your manager registration. Please retry.');
        if(usesSupabasePersistence&&data.managerAccount?.requiresPropertyRegistration){
          setManagerName(data.managerAccount.name||'');setPhone(data.managerAccount.phone||'');setEmail(data.managerAccount.email||'');
        }
        if(usesSupabasePersistence){
          const policy=payload.policy,enrollments=payload.enrollments,access=payload.access;
          if(!policy)throw Error('Could not check manager sign-in options.');
          if(typeof policy.googleManagerEnrollment!=='boolean')throw Error('Could not confirm manager sign-in options. Please retry.');
          if(!Array.isArray(enrollments))throw Error('Could not confirm your saved manager registration. Please retry.');
          if(!access||!('restriction'in access)||!Number.isFinite(Date.parse(access.serverTime)))throw Error('Could not confirm manager registration access. Please retry.');
          if(access.restriction!==null){
            if(typeof access.restriction!=='object'||!Number.isFinite(Date.parse(access.restriction.expiresAt)))throw Error('Could not confirm your manager registration cooldown.');
            restrictionDeadline.current=performance.now()+Math.max(0,Date.parse(access.restriction.expiresAt)-Date.parse(access.serverTime));
          }else restrictionDeadline.current=0;
          setActiveRestriction(access.restriction);setRestrictionTimeLeft('');
          setGoogleManagerPreview(policy.googleManagerEnrollment===true);
          setManagerEnrollmentSnapshot({ownerId:captured,records:enrollments,googleManagerEnrollment:policy.googleManagerEnrollment});
          const retained=enrollments.find((e:any)=>e.kind==='manager'&&e.verified_at&&(e.account_status==='closed'&&['completed','cancelled','expired'].includes(e.status)||e.account_status==='pending'&&e.status==='pending_review'));
          setRetainedManagerEmail(retained?.email||null);
          if(retained){setEmail(retained.email);setPassword('');setConfirmPassword('');}
        }
        if (data.managerAccount && !(usesSupabasePersistence&&data.managerAccount.requiresPropertyRegistration)) {
          setExistingManagerRecord(data.managerAccount);
          setCorrectingManager(usesSupabasePersistence&&Boolean(data.managerAccount.canCorrectRegistration));
        } else {
          setExistingManagerRecord(null);
        }
      }
    } catch (err) {
      if(usesSupabasePersistence&&current())setManagerStatusError(err instanceof Error&&err.name==='TimeoutError'?'Your manager registration check took too long. Retry when your connection is ready.':err instanceof Error?err.message:'Could not load manager registration.');
      console.error("Error checking existing manager record:", err);
    } finally {
      if(current()){setCheckingExisting(false);if(usesSupabasePersistence)setCheckingRestriction(false);}
    }
  };

  useEffect(() => {
    setManagerStatusError('');
    setGoogleManagerPreview(false);
    setManagerEnrollmentSnapshot(null);
    setCorrectingManager(false);
    setRetainedManagerEmail(null);setExistingManagerRecord(null);setVerifiedSubmission(null);
    setPassword('');setConfirmPassword('');setManagerName(user?.name||'');setPhone(user?.phone||'');setEmail(initialWorkEmail);
    fetchExistingManagerStatus();
    return()=>{managerStatusController.current?.abort();managerStatusRequest.current++;};
  }, [user?.id,user?.role]);

  const handleDeleteManagerAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (usesSupabasePersistence) return;
    if (!delPassword) {
      setDelError('Manager account password is required to delete registration.');
      return;
    }
    try {
      setIsDeleting(true);
      setDelError(null);
      const token = user?.token;
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
    if (routePopupFeedback(msg, type)) return;
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Registration cooldowns have administrator-selected durations.
  const [activeRestriction, setActiveRestriction] = useState<{ expiresAt: string; kind?: string; reason?: string } | null>(null);
  const [restrictionTimeLeft, setRestrictionTimeLeft] = useState<string>('');
  const [checkingRestriction, setCheckingRestriction] = useState(false);
  const [restrictionError, setRestrictionError] = useState<string | null>(null);
  const [restrictionOwner, setRestrictionOwner] = useState<string | null>(null);
  const restrictionRequest = useRef(0);
  const restrictionController = useRef<AbortController | null>(null);
  const restrictionDeadline = useRef(0);
  const restrictionActorKey = `${user?.id || ''}:${user?.role || ''}`;
  const currentRestrictionActor = useRef(restrictionActorKey);
  currentRestrictionActor.current = restrictionActorKey;
  const shouldCheckRestriction = !!user && (!usesSupabasePersistence || user.role === 'user');

  const fetchRestrictionStatus = async () => {
    if(usesSupabasePersistence)return fetchExistingManagerStatus();
    restrictionController.current?.abort();
    const controller = new AbortController();
    restrictionController.current = controller;
    const request = ++restrictionRequest.current;
    const capturedActor = restrictionActorKey;
    const isCurrent = () => !controller.signal.aborted && request === restrictionRequest.current && currentRestrictionActor.current === capturedActor;
    setRestrictionOwner(capturedActor);
    setRestrictionError(null);
    setActiveRestriction(null);
    setRestrictionTimeLeft('');
    if (!shouldCheckRestriction) {
      setCheckingRestriction(false);
      return;
    }
    setCheckingRestriction(true);
    try {
      const token = (user as any)?.token;
      const headers: any = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (usesSupabasePersistence) headers['X-PineVela-Account-Context'] = user!.id;
      const res = await fetch('/api/users/manager-restriction', { headers, signal: AbortSignal.any([controller.signal,AbortSignal.timeout(30000)]) });
      const data = await safeJson(res);
      if (!res.ok) throw new Error(data.error || 'Could not check your manager registration cooldown.');
      if (!isCurrent()) return;
      if (data.restriction) {
        const expiresAt = Date.parse(data.restriction.expiresAt);
        const serverTime = usesSupabasePersistence ? Date.parse(data.serverTime) : Date.now();
        if (!Number.isFinite(expiresAt) || !Number.isFinite(serverTime)) throw new Error('Could not read your registration cooldown. Please retry.');
        // Use database time and a monotonic timer rather than the device clock.
        restrictionDeadline.current = performance.now() + Math.max(0, expiresAt - serverTime);
      }
      setActiveRestriction(data.restriction || null);
    } catch (err) {
      if (isCurrent()) setRestrictionError(err instanceof Error&&err.name==='TimeoutError'?'The registration access check took too long. Retry when your connection is ready.':err instanceof Error ? err.message : 'Could not check your manager registration cooldown.');
    } finally {
      if (isCurrent()) setCheckingRestriction(false);
    }
  };

  useEffect(() => {
    if(!usesSupabasePersistence)fetchRestrictionStatus();
    return () => { restrictionController.current?.abort(); restrictionRequest.current++; };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!activeRestriction || restrictionOwner !== restrictionActorKey) return;
    const update = () => {
      if (currentRestrictionActor.current !== restrictionActorKey) return;
      const diffMs = restrictionDeadline.current - performance.now();
      if (diffMs <= 0) {
        // Recheck all active bans before allowing registration after expiry.
        void fetchRestrictionStatus();
      } else {
        const seconds = Math.ceil(diffMs / 1000);
        const diffDays = Math.floor(seconds / 86400);
        const diffHours = Math.floor((seconds % 86400) / 3600);
        const diffMins = Math.floor((seconds % 3600) / 60);
        const diffSecs = seconds % 60;
        setRestrictionTimeLeft(`${diffDays}d ${diffHours}h ${diffMins}m ${diffSecs}s`);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [activeRestriction, restrictionActorKey, restrictionOwner]);

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
    if (shouldCheckRestriction && (checkingRestriction || restrictionError || activeRestriction || restrictionOwner !== restrictionActorKey)) {
      setErrorMessage('Your registration cooldown must be checked before continuing.');
      return;
    }

    // 1. Enforce official work email
    const emailVal = googleManagerPreview?{isValid:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()),error:'Enter the separate Google account email for your manager login.'}:validateManagerWorkEmail(email, 'Official Manager Work Email');
    if (!retainedManagerEmail && !emailVal.isValid) {
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

    if (!retainedManagerEmail && !googleManagerPreview && (!password || password.length < 6)) {
      const err = "Password must be at least 6 characters long.";
      setErrorMessage(err);
      triggerToast(err, 'error');
      return;
    }

    if (!retainedManagerEmail && !googleManagerPreview && password !== confirmPassword) {
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

      if (usesSupabasePersistence) {
        const { password: _password,parentUserId: _parentId,parentUserEmail: _parentEmail,...property } = payload;
        setVerifiedSubmission(property);
        return;
      }
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
        <div role="status" className={`ux-dashboard-toast fixed top-5 right-5 font-bold text-xs sm:text-sm px-5 py-3.5 rounded-2xl shadow-2xl z-50 flex items-center gap-2.5 border animate-bounce ${
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
          <div role="button" tabIndex={0} aria-label="Return to home" onKeyDown={activateOnKeyboard}
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
        
        {checkingExisting || checkingRestriction || (shouldCheckRestriction && restrictionOwner !== restrictionActorKey) ? (
          <RouteSkeleton />
        ) : usesSupabasePersistence&&managerStatusError ? (
          <section role="alert" className="space-y-4 rounded-3xl border border-blue-200 bg-[var(--pv-panel)] p-6 text-[var(--pv-text)]">
            <h1 className="text-xl font-bold">Manager registration could not load</h1><p className="text-sm">{managerStatusError}</p>
            <button type="button" onClick={()=>void fetchExistingManagerStatus()} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white">Retry registration</button>
          </section>
        ) : restrictionOwner === restrictionActorKey && restrictionError ? (
          <section role="alert" className="rounded-3xl border p-6 sm:p-10 text-center space-y-5 bg-[var(--pv-panel)] border-[var(--pv-edge)] text-[var(--pv-text)]">
            <h2 className="text-2xl font-bold">Could not check registration access</h2>
            <p>{restrictionError}</p>
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={() => void fetchRestrictionStatus()} className="min-h-11 px-6 rounded-xl bg-[var(--pv-blue-primary)] text-white font-bold">Retry access check</button>
              <button onClick={handleCloseOrReturn} className="min-h-11 px-6 rounded-xl border border-[var(--pv-edge)]">Return to Dashboard</button>
            </div>
          </section>
        ) : restrictionOwner === restrictionActorKey && activeRestriction ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-2xl p-10 text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900">Account Creation Cooldown Active</h2>
            <p className="text-slate-500 text-sm max-w-md mx-auto leading-relaxed font-medium">
              A registration cooldown applies to your account. You can register a manager account after the remaining cooldown expires.
            </p>
            {activeRestriction.reason && <p className="text-sm text-slate-600">{activeRestriction.reason}</p>}
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
        ) : usesSupabasePersistence&&googleManagerPreview&&!retainedManagerEmail&&!existingManagerRecord ? (
          <section className="rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-8">
            <h1 className="mb-3 text-2xl font-bold">Create your manager login</h1>
            <p className="mb-5 text-sm text-slate-600 dark:text-slate-300">Verify your separate Google account first. You can enter your property details afterward.</p>
            <VerifiedAccountEnrollment key={user?.id} kind="manager" initialName={managerName} initialPhone={phone} initialEmail={email} initialSnapshot={managerEnrollmentSnapshot||undefined}
              onVerified={async()=>{await fetchExistingManagerStatus();await refreshNotifications();}}/>
          </section>
        ) : usesSupabasePersistence&&correctingManager ? (
          <ManagerApplicationCorrections key={user?.id} onClose={()=>{setCorrectingManager(false);}} onSubmitted={()=>{setCorrectingManager(false);void fetchExistingManagerStatus();void refreshNotifications();}}/>
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
                      <span>Status: {existingManagerRecord.status==='more_info_required'?'More Information Required':'Pending Admin Verification'}</span>
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
              {existingManagerRecord.adminNotes&&<p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Administrator feedback: </strong>{existingManagerRecord.adminNotes}</p>}
              {usesSupabasePersistence&&existingManagerRecord.canCorrectRegistration&&<button type="button" onClick={()=>setCorrectingManager(true)} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white">Review and correct application</button>}
              {!(existingManagerRecord.isApproved || existingManagerRecord.isVerified || existingManagerRecord.status?.toLowerCase() === 'approved' || existingManagerRecord.status?.toLowerCase() === 'verified') ? (
                <div className="p-4 rounded-2xl bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950 leading-relaxed font-medium">
                    <strong className="block text-amber-900 font-bold mb-0.5">{existingManagerRecord.status==='more_info_required'?'Corrections Required — Login Locked:':'Verification in Progress — Login Locked:'}</strong>
                    {existingManagerRecord.status==='more_info_required'?'Review the administrator feedback and correct your property details. Resubmission requires a fresh physical inspection before manager approval.':'Your residence registration has been submitted to PineVela Administration. A certified field officer is being scheduled to physically inspect the hostel and verify property details. You cannot log into the Manager Console until your account has been verified by the admin.'}
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-950 leading-relaxed font-medium">
                    <strong className="block text-emerald-900 font-bold mb-0.5">Verified Manager Account:</strong>
                    Your property and manager credentials have been verified by PineVela Administration. You can now log into your manager account to manage rooms, maintenance, and resident support.
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
                {user?.role === 'manager' && (existingManagerRecord.managerId || existingManagerRecord.id) === user.id && (
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
                  <span>{usesSupabasePersistence ? 'Request account closure' : 'Delete Account & Restart Registration'}</span>
                </button>
                )}

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
                    Once the inspection report is reviewed and approved, your manager portal is unlocked to manage rooms and activate resident access.
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

            <div className="p-6 sm:p-8"><OnboardingProgress steps={phaseTitles} step={phase} label="Manager registration" /></div>

            {/* Error Message Alert */}
            {errorMessage && (
              <div className="mx-6 sm:mx-8 mt-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Form Form Content */}
            <form onSubmit={handleSubmit} className="onboarding-fields p-6 sm:p-8 space-y-6">
              
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
                        <input aria-label="Manager Full Legal Name"
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
                        <input aria-label="Official Residence / Hostel Name"
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
                          <input aria-label="Kumasi Campus Zone"
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
                        <input aria-label="Street Address or Plot Number"
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

                </div>
              )}

              {/* PHASE 3: PORTAL SECURITY & KNUST ACCREDITATION */}
              {phase === 3 && (
                <div className="space-y-5 animate-fadeIn">
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        {googleManagerPreview?'Manager Google Email':'Official Manager Email'} <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input aria-label="Official Manager Email"
                          readOnly={Boolean(retainedManagerEmail)}
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
                        <input aria-label="Phone / WhatsApp Contact"
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

                  {retainedManagerEmail ? <p className="text-sm text-blue-900">Your retained manager email will be confirmed in the next step. Your existing sign-in credentials are kept.</p> : googleManagerPreview?<p className="text-sm text-blue-900">Verify a separate Google account in the next step. You do not need a work mailbox or a new password for this signup.</p>:<>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Account Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input aria-label="Account Password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                        <button aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <PasswordStrengthGauge password={password} />
                    </div>

                    <div>
                      <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">
                        Confirm Password <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                        <input aria-label="Confirm Password"
                          type={showPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:bg-white focus:border-blue-800 focus:ring-1 focus:ring-blue-800 focus:outline-none transition-colors"
                        />
                      </div>
                      <PasswordStrengthGauge password={confirmPassword} />
                    </div>
                  </div>
                  </>}

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
      {showDeleteModal && (usesSupabasePersistence ? <ManagerClosureRequest onClose={() => setShowDeleteModal(false)} /> :
        <DashboardOverlay aria-label="Authenticate Manager Account Deletion" onClose={() => setShowDeleteModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div data-popup-card className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-6 relative">
            <button aria-label="Close dialog"
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
                <input aria-label="Official Work Email"
                  type="email"
                  value={existingManagerRecord?.email || user?.email || ''}
                  disabled
                  className="w-full px-4 py-3 rounded-xl bg-slate-100 border border-slate-200 text-slate-500 text-sm font-medium cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-slate-700 uppercase tracking-wider mb-1.5">Account Password</label>
                <input aria-label="Account Password"
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
        </DashboardOverlay>
      )}
      {verifiedSubmission && <DashboardOverlay aria-label="Verify manager email" onClose={() => setVerifiedSubmission(null)} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
        <section className="onboarding-fields w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 sm:p-7 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-bold text-slate-900">{googleManagerPreview?'Verify your manager Google account':'Verify your manager work email'}</h2>
            <button type="button" onClick={() => setVerifiedSubmission(null)} className="min-h-11 rounded-xl border border-blue-200 px-3 text-sm">Close</button>
          </div>
          <VerifiedAccountEnrollment kind="manager" initialName={managerName} initialPhone={phone} initialEmail={email} initialPassword={password} initialSnapshot={managerEnrollmentSnapshot||undefined}
            onVerified={async enrollmentId => {
              const response = await fetch('/api/manager-verifications/submit',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ ...verifiedSubmission,enrollmentId }) });
              const result = await safeJson(response);
              if (!response.ok) throw new Error(result.error || 'The manager registration could not be submitted.');
              setSubmittedData(result.verification);setExistingManagerRecord(result.verification);setIsSuccess(true);
              setPassword('');setConfirmPassword('');setVerifiedSubmission(null);
              await refreshNotifications();
            }} />
        </section>
      </DashboardOverlay>}
    </div>
  );
}
