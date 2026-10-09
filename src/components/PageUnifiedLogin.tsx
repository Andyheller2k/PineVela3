import DashboardOverlay from './DashboardOverlay';
import { usesSupabasePersistence } from '../lib/persistence';
import SupabaseResidentActivation from './SupabaseResidentActivation';
import { loginContinuation } from '../lib/publicContinuation';
import { routePopupFeedback } from '../lib/feedback';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import OnboardingProgress, { SIGNUP_STEPS, MANAGER_ACCOUNT_STEPS, ROOM_ACTIVATION_STEPS } from './OnboardingProgress';
import { sessionFetch as fetch } from '../lib/session';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Mail, Key, Eye, EyeOff, ShieldCheck, ArrowRight, ShieldAlert, CheckCircle, CheckCircle2, RefreshCw, LogIn, ClipboardList, Building, MapPin, Lock, Phone, ChevronRight, ChevronLeft, Search, User, X, Clock, Briefcase, Home, Wrench, GraduationCap, School, BookOpen, Building2, Bell, HelpCircle, Info, AlertCircle } from 'lucide-react';
import PineLogo from './PineLogo';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIconUrl from 'leaflet/dist/images/marker-icon.png';
import markerRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { motion } from 'motion/react';
import {
  validateEmail,
  validateManagerWorkEmail,
  cleanPhoneNumber,
  validatePhone,
  validateAddress,
  resolveIdConfig
} from '../utils/formValidation';
import { safeJson } from '../lib/api';

// Static asset imports
import marketImg from '../../assets/login-market.png';
import ThemeToggle from './ThemeToggle';
import GoogleAuthButton from './GoogleAuthButton';
import '../login.css';

const featureImage = marketImg;
const featureDescription = "PineVela- The unified digital ecosystem connecting Properties, People, and Services into one seamless campus platform.";

export default function PageUnifiedLogin() {
  const { login, user, setSessionUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const continuation = loginContinuation(location.search);

  // Form states
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [needsPortalPin,setNeedsPortalPin] = useState(false);
  const [loginPortal,setLoginPortal] = useState<'resident' | 'seller'>('resident');
  const [loginPortalPin,setLoginPortalPin] = useState('');
  const [pendingApprovalModal, setPendingApprovalModal] = useState<{ email: string; name?: string; message: string; pass?: string } | null>(null);
  const [blockedAccountModal, setBlockedAccountModal] = useState<{ email: string; name?: string; message: string; reason: string } | null>(null);
  const [approvingFromModal, setApprovingFromModal] = useState(false);

  // Unified Registration & Verification states
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(() =>
    new URLSearchParams(location.search).get('mode') === 'register' || (location.state as { mode?: string } | null)?.mode === 'register'
      ? 'register' : 'login');
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirmPass, setShowRegConfirmPass] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCodeInput, setVerificationCodeInput] = useState('');
  const [signupId, setSignupId] = useState('');
  const [developmentSignupCode, setDevelopmentSignupCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);

  // Manager registration onboarding states
  const [showRegModal, setShowRegModal] = useState(false);

  // Resident Digital Key Onboarding states
  const [showStudentKeyModal, setShowStudentKeyModal] = useState(false);
  const [studentKeyInput, setStudentKeyInput] = useState('');
  const [studentKeyStep, setStudentKeyStep] = useState<1 | 2 | 3 | 4>(1); // 1: Category & Digital Key, 2: Personal & Academic Info, 3: Password & Security, 4: Success Confirmed
  const [verifyingStudentKey, setVerifyingStudentKey] = useState(false);
  const [verifiedKeyDetails, setVerifiedKeyDetails] = useState<any | null>(null);
  const [studentKeyError, setStudentKeyError] = useState<string | null>(null);

  // Resident Category & Academic Profile
  const [stuResidentType, setStuResidentType] = useState<'student' | 'resident' | 'other'>('student');
  const [stuCustomType, setStuCustomType] = useState('');
  const [stuName, setStuName] = useState('');
  const [stuId, setStuId] = useState('');
  const [stuEmail, setStuEmail] = useState('');
  const [stuPhone, setStuPhone] = useState('');
  const [stuProgram, setStuProgram] = useState('');
  const [stuDepartment, setStuDepartment] = useState('');
  const [stuInstitution, setStuInstitution] = useState('');

  // Password & Security
  const [stuPassword, setStuPassword] = useState('');
  const [stuConfirmPassword, setStuConfirmPassword] = useState('');
  const [showStuPassword, setShowStuPassword] = useState(false);
  const [showStuConfirmPassword, setShowStuConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [submittingStudentClaim, setSubmittingStudentClaim] = useState(false);
  const [claimedUserData, setClaimedUserData] = useState<any | null>(null);
  const [regStep, setRegStep] = useState(1); // 1: Account Info, 2: Verification Success
  const [regManagerName, setRegManagerName] = useState('');
  const [regManagerEmail, setRegManagerEmail] = useState('');
  const [regManagerPhone, setRegManagerPhone] = useState('');
  const [regNationalId, setRegNationalId] = useState('');
  const [regOrganization, setRegOrganization] = useState('');
  const [regRoleTitle, setRegRoleTitle] = useState('General Manager');
  const [regExperienceYears, setRegExperienceYears] = useState(4);
  const [regAddress, setRegAddress] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [showRegConfirmPassword, setShowRegConfirmPassword] = useState(false);
  const [regSelectedLocation, setRegSelectedLocation] = useState('Ayeduase Gate, Kumasi (KNUST Area)');
  const [regKnustConfirmed, setRegKnustConfirmed] = useState(false);
  const [showRegLocationTooltip, setShowRegLocationTooltip] = useState(false);
  const [regLocationSearch, setRegLocationSearch] = useState('');
  const [mapCoordinates, setMapCoordinates] = useState({ lat: 5.6506, lng: -0.1870 });
  const [loadingRegister, setLoadingRegister] = useState(false);
  const [registeredManagers, setRegisteredManagers] = useState<Array<{
    name: string;
    email: string;
    organization?: string;
    savedAt?: string;
  }>>([]);

  const loadRegisteredManagers = () => {
    try {
      const raw = localStorage.getItem('pinevela_registered_managers');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.filter(Boolean).map(({ password, plainPassword, ...manager }: any) => manager);
          localStorage.setItem('pinevela_registered_managers', JSON.stringify(sanitized));
          setRegisteredManagers(sanitized);
        }
      }
    } catch (e) {
      console.warn("Failed to load registered managers from localStorage:", e);
    }
  };

  useEffect(() => {
    loadRegisteredManagers();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const googleErrors: Record<string, string> = {
      expired: 'Your Google sign-in expired. Please try again.',
      cancelled: 'Google sign-in was cancelled. Please try again.',
      provider_exchange: 'Google accepted your sign-in, but our sign-in provider could not complete it. Please use email and password while this is resolved.',
      provider_failed: 'Google authentication is temporarily unavailable. Please try again later or use email and password.',
      signup_disabled: 'Google account registration is currently unavailable. Please use email registration or try again later.',
      email_unverified: 'Please verify your Google account email before signing in.',
      failed: 'Google sign-in could not complete. Please try again.',
      missing: 'No PineVela account is connected to this Google account. Choose Sign Up to create one.',
      conflict: 'This email already has a PineVela account. Sign in with your existing credentials.',
      blocked: 'This PineVela account is not permitted to sign in.',
    };
    if (params.has('google_error')) setLoginError(googleErrors[params.get('google_error') || ''] || googleErrors.failed);
    if (params.get('mode') === 'register' || (location.state as any)?.mode === 'register') {
      setActiveTab('register');
    }
    if (params.get('mode') === 'onboard' || params.get('mode') === 'claim' || params.get('verify_room_key') === 'true' || (location.state as any)?.mode === 'onboard') {
      setStudentKeyStep(1);
      setShowStudentKeyModal(true);
    }
  }, [location]);

  // Extended Manager Verification States (Phase 1)
  const [regCountry, setRegCountry] = useState('Ghana');
  const [regDocumentType, setRegDocumentType] = useState('Passport');
  const [regFullNameOnId, setRegFullNameOnId] = useState('');
  const [regDob, setRegDob] = useState('1988-06-15');
  const [regIdExpiry, setRegIdExpiry] = useState('2032-11-20');
  const [regAuthorityRel, setRegAuthorityRel] = useState<'Property Owner' | 'Authorized Manager' | 'Managing Director' | 'Property Agent'>('Property Owner');
  const [regClaimedOwnerName, setRegClaimedOwnerName] = useState('');
  const [regClaimedOwnerPhone, setRegClaimedOwnerPhone] = useState('');
  const [regClaimedOwnerEmail, setRegClaimedOwnerEmail] = useState('');
  const [regOrgRegNumber, setRegOrgRegNumber] = useState('');
  const [regAuthorityEvidenceDesc, setRegAuthorityEvidenceDesc] = useState('Registered property owner with verifiable lease and municipal certification.');
  const [regDocFileName, setRegDocFileName] = useState('ownership-certificate.pdf');
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [testCards, setTestCards] = useState<Array<{ idNumber: string; fullName: string; dob?: string; expiryDate?: string; status?: string }>>([]);
  const [selectedSyntheticCardId, setSelectedSyntheticCardId] = useState('');

  // Apply a selected or randomized synthetic card to the form
  const applySyntheticCard = (card: { idNumber: string; fullName: string; dob?: string; expiryDate?: string; status?: string }) => {
    if (!card) return;
    setSelectedSyntheticCardId(card.idNumber);
    setRegDocumentType('Passport');
    setRegCountry('Ghana');
    setRegNationalId(card.idNumber);
    setRegFullNameOnId(card.fullName);
    setRegManagerName(card.fullName);
    if (card.dob) setRegDob(card.dob);
    if (card.expiryDate) setRegIdExpiry(card.expiryDate);
    triggerToast(`Applied Synthetic Card: ${card.idNumber} (${card.fullName})`, 'success');
  };

  // Dedicated random test card selector that always works
  const handleRandomCard = async () => {
    try {
      const res = await fetch('/api/verification/test-cards/random?verified=true');
      if (res.ok) {
        const data = await safeJson(res);
        if (data && data.card) {
          applySyntheticCard(data.card);
          return;
        }
      }
    } catch (err) {
      // Fallback below
    }

    if (testCards && testCards.length > 0) {
      const verifiedCards = testCards.filter(c => c && (!c.status || c.status === 'verified'));
      const pool = verifiedCards.length > 0 ? verifiedCards : testCards.filter(Boolean);
      if (pool.length > 0) {
        const randCard = pool[Math.floor(Math.random() * pool.length)];
        if (randCard) applySyntheticCard(randCard);
        return;
      }
    } else {
      const randomIdx = Math.floor(Math.random() * 250) + 1;
      const numPadded = String(100000000 + randomIdx);
      const checksum = (randomIdx * 7) % 10;
      const fNames = ['Kwame', 'Kofi', 'Ama', 'Yaw', 'Abena', 'Kojo', 'Akosua', 'Kwesi', 'Sarah', 'Anthony'];
      const lNames = ['Mensah', 'Osei', 'Appiah', 'Asante', 'Boateng', 'Agyemang', 'Owusu', 'Frimpong'];
      const card = {
        idNumber: `GHA-${numPadded}-${checksum}`,
        fullName: `${fNames[randomIdx % fNames.length]} ${lNames[(randomIdx * 3) % lNames.length]}`,
        dob: `1985-05-${String(1 + (randomIdx % 28)).padStart(2, '0')}`,
        expiryDate: `2032-05-${String(1 + (randomIdx % 28)).padStart(2, '0')}`,
        status: 'verified'
      };
      applySyntheticCard(card);
    }
  };

  useEffect(() => {
    // Generate initial fallback test cards so the UI is responsive immediately
    if (usesSupabasePersistence) return;
    const initialFallbackCards = Array.from({ length: 50 }, (_, i) => {
      const idx = i + 1;
      const numPadded = String(100000000 + idx);
      const checksum = (idx * 7) % 10;
      const fNames = ['Kwame', 'Kofi', 'Ama', 'Yaw', 'Abena', 'Kojo', 'Akosua', 'Kwesi', 'Sarah', 'Anthony', 'Michael', 'Grace'];
      const lNames = ['Mensah', 'Osei', 'Appiah', 'Asante', 'Boateng', 'Agyemang', 'Owusu', 'Frimpong', 'Darko', 'Antwi'];
      const fullName = `${fNames[i % fNames.length]} ${lNames[(i * 3) % lNames.length]}`;
      const birthYear = 1975 + (i % 25);
      const birthMonth = String(1 + (i % 12)).padStart(2, '0');
      const birthDay = String(1 + (i % 28)).padStart(2, '0');
      return {
        idNumber: `GHA-${numPadded}-${checksum}`,
        fullName,
        dob: `${birthYear}-${birthMonth}-${birthDay}`,
        expiryDate: `2032-${birthMonth}-${birthDay}`,
        status: 'verified'
      };
    });
    setTestCards(initialFallbackCards);

    // Pre-fetch complete synthetic test cards from verification engine API
    fetch('/api/verification/test-cards')
      .then(safeJson)
      .then(data => {
        const cards = data.testCards || data.sample || data.allCards;
        if (cards && Array.isArray(cards) && cards.length > 0) {
          setTestCards(cards);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch test cards from backend, using local synthetic cards:", err);
      });
  }, []);

  // Map References
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapInstanceRef = React.useRef<any>(null);
  const markerInstanceRef = React.useRef<any>(null);

  // Address search & reverse geocoding functions
  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      if (res.ok) {
        const data = await safeJson(res);
        if (data && data.display_name) {
          setRegSelectedLocation(data.display_name);
        }
      }
    } catch (err) {
      console.error("Reverse geocoding error:", err);
      setRegSelectedLocation(`Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
    }
  };

  const searchAddress = async () => {
    if (!regLocationSearch.trim()) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(regLocationSearch)}&limit=1`);
      if (res.ok) {
        const data = await safeJson(res);
        if (data && data.length > 0) {
          const lat = parseFloat(data[0].lat);
          const lon = parseFloat(data[0].lon);
          const name = data[0].display_name;

          setRegSelectedLocation(name);
          setMapCoordinates({ lat, lng: lon });

          if (mapInstanceRef.current && markerInstanceRef.current) {
            mapInstanceRef.current.setView([lat, lon], 16);
            markerInstanceRef.current.setLatLng([lat, lon]);
          }
          triggerToast('Location found on map!', 'success');
        } else {
          triggerToast('Location not found. Try searching for a different area.', 'error');
        }
      }
    } catch (err) {
      console.error("Geocoding search error:", err);
      triggerToast('Geocoding search failed. Try again.', 'error');
    }
  };

  // Map mounting hook
  useEffect(() => {
    if (showRegModal && regStep === 2) {
      const timer = setTimeout(() => {
        if (!mapContainerRef.current) return;

        // Initialize map
        if (!mapInstanceRef.current) {
          const map = L.map(mapContainerRef.current).setView([mapCoordinates.lat, mapCoordinates.lng], 15);
          mapInstanceRef.current = map;

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors'
          }).addTo(map);

          // Add marker
          const marker = L.marker([mapCoordinates.lat, mapCoordinates.lng], { draggable: true, icon: L.icon({ iconUrl: markerIconUrl, iconRetinaUrl: markerRetinaUrl, shadowUrl: markerShadowUrl, iconSize: [25, 41], iconAnchor: [12, 41], shadowSize: [41, 41] }) }).addTo(map);
          markerInstanceRef.current = marker;

          // Drag end event listener
          marker.on('dragend', () => {
            const position = marker.getLatLng();
            setMapCoordinates({ lat: position.lat, lng: position.lng });
            reverseGeocode(position.lat, position.lng);
          });

          // Map click event listener
          map.on('click', (e: any) => {
            const { lat, lng } = e.latlng;
            marker.setLatLng([lat, lng]);
            setMapCoordinates({ lat, lng });
            reverseGeocode(lat, lng);
          });
        } else {
          mapInstanceRef.current.invalidateSize();
        }
      }, 200);

      return () => {
        clearTimeout(timer);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
          markerInstanceRef.current = null;
        }
      };
    }
  }, [showRegModal, regStep]);

  // Password strength helper
  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'success' | 'error' | 'info'>('info');

  const triggerToast = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    if (routePopupFeedback(msg, type)) return;
    setToastMessage(msg);
    setToastType(type);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    if (!usernameOrEmail || !password) {
      setLoginError('Please provide both username/email and password.');
      return;
    }

    setLoadingLogin(true);
    try {
      const authenticatedUser = await login(usernameOrEmail, password,needsPortalPin ? { accountKind:loginPortal,portalPin:loginPortalPin } : undefined);

      // Redirect based on role and digital market merchant status
      setTimeout(() => {
        if (authenticatedUser.role === 'user' && continuation) { navigate(continuation, { replace: true }); return; }
        // Only direct digital merchant accounts (authenticated via student credentials) go to digital market onboarding or store
        const isDigitalMerchant = authenticatedUser.role === 'merchant' || (authenticatedUser as any).isDigitalMarketOnly === true;

        if (isDigitalMerchant) {
          if (authenticatedUser.targetRedirect) {
            navigate(authenticatedUser.targetRedirect, { replace: true });
            return;
          }
          if (authenticatedUser.merchantSetupCompleted === false || !authenticatedUser.merchantRegistrationFeePaid) {
            // First time after admin approval -> Digital Onboarding Platform
            navigate('/digital-market/onboard', { replace: true });
            return;
          } else {
            // Completed onboarding and activated market -> Registered Store
            navigate('/digital-market', { replace: true });
            return;
          }
        }

        if (authenticatedUser.role === 'verification_team' || authenticatedUser.role === 'officer' || authenticatedUser.role === 'field_officer') {
          navigate('/field-officer', { replace: true });
        } else if (authenticatedUser.role === 'staff') {
          navigate('/staff/dashboard', { replace: true });
        } else if (authenticatedUser.role === 'manager') {
          navigate('/manager/dashboard', { replace: true });
        } else if (authenticatedUser.role === 'admin') {
          navigate('/admin/dashboard', { replace: true });
        } else if (authenticatedUser.role === 'student') {
          navigate('/resident/dashboard', { replace: true });
        } else if (authenticatedUser.role === 'user') {
          navigate('/user/dashboard', { replace: true });
        } else {
          navigate('/user/dashboard', { replace: true });
        }
      }, 800);
    } catch (err: any) {
      if (['account_choice_required','portal_pin_required'].includes(err?.code)) {
        setNeedsPortalPin(true);
        setLoginPortalPin('');
      }
      const errMsg = err?.message || '';
      if (err?.isBlocked || errMsg.toLowerCase().includes('blocked') || errMsg.toLowerCase().includes('restricted') || errMsg.toLowerCase().includes('freeze')) {
        const rawReason = err?.restrictionReason || errMsg;
        const cleanReason = rawReason.replace(/^.*Reason:\s*/i, '').replace(/\.\s*Please wait.*$/i, '').trim();
        setBlockedAccountModal({
          email: err.managerEmail || usernameOrEmail,
          name: err.managerName || usernameOrEmail,
          message: errMsg,
          reason: cleanReason || 'Account access has been restricted by administration.'
        });
      } else if (err?.isPendingApproval === true) {
        setPendingApprovalModal({
          email: usernameOrEmail,
          name: usernameOrEmail,
          message: errMsg || 'Your manager account has been successfully registered and is awaiting Administrator review and approval. Once an administrator approves your account, your login will become active.',
          pass: password
        });
      } else {
        setLoginError(errMsg || 'Invalid credentials. Please try again.');
      }
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleUnifiedRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPass) {
      triggerToast('All fields are required to create an account.', 'error');
      return;
    }
    const emailCheck = validateEmail(regEmail, 'Email address');
    if (!emailCheck.isValid) {
      triggerToast(emailCheck.error || 'Invalid email format.', 'error');
      return;
    }
    if (regPass.length < 6) {
      triggerToast('Password must be at least 6 characters long.', 'error');
      return;
    }
    if (regPass !== regConfirmPass) {
      triggerToast('Passwords do not match.', 'error');
      return;
    }

    setLoadingLogin(true);
    try {
      const res = await fetch('/api/auth/register-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          password: regPass
        })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }

      setSignupId(data.signupId || '');
      setDevelopmentSignupCode(data.developmentOnly ? data.developmentCode || '' : '');
      setVerificationCodeInput('');
      setVerificationEmail(regEmail.trim().toLowerCase());
      setVerificationPending(true);
      triggerToast(data.developmentOnly ? 'Your temporary development code is ready.' : 'Check your email for your confirmation link or code.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'An error occurred during sign up.', 'error');
    } finally {
      setLoadingLogin(false);
    }
  };

  const handleUnifiedVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verificationCodeInput.trim()) {
      triggerToast('Enter the verification code or paste the confirmation link from your email.', 'error');
      return;
    }

    setVerifyingCode(true);
    try {
      const res = await fetch('/api/auth/verify-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationEmail,
          password: regPass,
          code: verificationCodeInput.trim(),
          signupId
        })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed.');
      }

      // Automatically sign in the user
      const authenticatedUser = usesSupabasePersistence ? data.user : await login(verificationEmail, regPass);
      if (!authenticatedUser) throw new Error('Verification did not return an active account. Please sign in again.');
      if (usesSupabasePersistence) setSessionUser(authenticatedUser);
      triggerToast(data.user?.developmentOnly ? 'Signed in to your local development account.' : 'Account verified and logged in successfully!', 'success');

      // Clear state
      setVerificationPending(false);
      setVerificationCodeInput('');
      setSignupId('');
      setDevelopmentSignupCode('');
      setRegName('');
      setRegEmail('');
      setRegPass('');
      setRegConfirmPass('');

      setTimeout(() => {
        navigate(authenticatedUser.role === 'user' && continuation ? continuation : '/student/dashboard', { replace: true });
      }, 800);
    } catch (err: any) {
      triggerToast(err.message || 'Verification failed.', 'error');
    } finally {
      setVerifyingCode(false);
    }
  };

  // Student/Resident Key Verification Handler
  const handleVerifyStudentKey = async (keyCodeToVerify?: string) => {
    const code = (keyCodeToVerify || studentKeyInput || '').trim().toUpperCase();
    if (!code || code.length < 5) {
      setStudentKeyError('Please input a valid digital room key (e.g. MAZE-A-749201).');
      return;
    }
    if (!user || user.role !== 'user') {
      setStudentKeyError('Sign in to your primary account before verifying a room key.');
      return;
    }
    setVerifyingStudentKey(true);
    setStudentKeyError(null);
    try {
      const res = await fetch('/api/room-keys/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({ roomKey: code })
      });
      const data = await safeJson(res);
      if (!res.ok || !data.valid) {
        setStudentKeyError(data.error || 'Invalid room key. Check with your hostel manager.');
        setVerifiedKeyDetails(null);
      } else {
        setVerifiedKeyDetails(data);
        setStudentKeyInput(code);
        setStudentKeyError(null);
        triggerToast(`Room Found: ${data.hostelName} (${data.blockName}, ${data.roomNumber})`, 'success');
        // Automatically start the student or resident registration profile setup
        setStudentKeyStep(2);
      }
    } catch (e: any) {
      setStudentKeyError('Network error verifying room key. Please try again.');
    } finally {
      setVerifyingStudentKey(false);
    }
  };

  // Student/Resident Claim Room Key & Complete Onboarding Handler
  const handleClaimStudentKeySubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (user?.role !== 'user') {
      triggerToast('Sign in with your primary user account to activate a room.', 'error');
      return;
    }
    if (!verifiedKeyDetails) {
      triggerToast('Please verify a valid digital room key first.', 'error');
      setStudentKeyStep(1);
      return;
    }
    if (!stuName.trim()) {
      triggerToast('Please provide your username / full name.', 'error');
      return;
    }
    if (!stuPhone.trim()) {
      triggerToast('Please provide your phone number.', 'error');
      return;
    }
    if (!stuEmail.trim()) {
      triggerToast('Please provide your email address.', 'error');
      return;
    }
    if (!stuPassword.trim()) {
      triggerToast('Please create a password for your account.', 'error');
      return;
    }
    if (stuPassword && stuConfirmPassword && stuPassword !== stuConfirmPassword) {
      triggerToast('Passwords do not match. Please verify your password.', 'error');
      return;
    }

    setSubmittingStudentClaim(true);
    try {
      const res = await fetch('/api/room-keys/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PineVela-Switch-Session': 'true', 'Authorization': `Bearer ${user.token}` },
        body: JSON.stringify({
          roomKey: verifiedKeyDetails.roomKey,
          studentName: stuName.trim(),
          name: stuName.trim(),
          username: stuName.trim(),
          studentEmail: stuEmail.trim(),
          email: stuEmail.trim(),
          studentPhone: stuPhone.trim(),
          phone: stuPhone.trim(),
          password: stuPassword.trim()
        })
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setClaimedUserData(data);
        
        // Adopt the room profile after the server switches its HttpOnly cookie.
        if (data.user) {
          const mergedUser = { ...data.user, token: data.token };
          setSessionUser(mergedUser);
        }

        setShowStudentKeyModal(false);
        triggerToast(`Registration complete! Welcome to ${verifiedKeyDetails.hostelName || 'your hostel'}.`, 'success');
        navigate('/student/dashboard', { replace: true });
      } else {
        triggerToast(data.error || 'Failed to complete resident onboarding.', 'error');
      }
    } catch (e: any) {
      triggerToast(e.message || 'Error activating room key.', 'error');
    } finally {
      setSubmittingStudentClaim(false);
    }
  };

  const handleManagerRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regManagerName.trim() || regManagerName.trim().length < 3) {
      triggerToast('Please provide your full legal name (minimum 3 characters)', 'error');
      return;
    }

    const emailCheck = validateManagerWorkEmail(regManagerEmail, 'Official Manager Work Email');
    if (!emailCheck.isValid) {
      triggerToast(emailCheck.error!, 'error');
      return;
    }

    const phoneCheck = validatePhone(regManagerPhone, 'Direct Phone Number');
    if (!phoneCheck.isValid) {
      triggerToast(phoneCheck.error!, 'error');
      return;
    }

    const idCfg = resolveIdConfig(regDocumentType);
    const idCheck = idCfg.validate(regNationalId);
    if (!idCheck.isValid) {
      triggerToast(idCheck.error!, 'error');
      return;
    }

    const fullAddress = `${regAddress.trim() ? regAddress.trim() + ', ' : ''}${regSelectedLocation || 'Ayeduase, Kumasi'}`;
    const lowerAddress = fullAddress.toLowerCase();

    // Validate Kumasi & KNUST requirement
    const forbiddenOutsideRegions = [
      'accra', 'legon', 'cape coast', 'takoradi', 'tamale', 'sunyani', 'koforidua', 'winneba', 'ho', 'wa', 'bolgatanga', 'tema', 'madina', 'adenta', 'spintex', 'dansoman', 'teshie', 'osu'
    ];
    for (const forbidden of forbiddenOutsideRegions) {
      if (lowerAddress.includes(forbidden)) {
        triggerToast(`Hostel registration is strictly restricted to KNUST-accredited properties in the Kumasi region. Locations outside Kumasi (${forbidden.toUpperCase()}) cannot be registered.`, 'error');
        return;
      }
    }

    if (!regKnustConfirmed) {
      triggerToast('You must accept and confirm that your hostel/residence is located in Kumasi and is KNUST accredited.', 'error');
      return;
    }

    if (regAddress.trim()) {
      const addrCheck = validateAddress(regAddress, 'Operating Address');
      if (!addrCheck.isValid) {
        triggerToast(addrCheck.error!, 'error');
        return;
      }
    }

    if (!regPassword || regPassword.length < 6) {
      triggerToast('Password must be at least 6 characters long', 'error');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      triggerToast('Passwords do not match. Please verify your entry.', 'error');
      return;
    }

    setLoadingRegister(true);
    try {
      const res = await fetch('/api/auth/register-manager-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
        body: JSON.stringify({
          name: regManagerName.trim(),
          managerName: regManagerName.trim(),
          email: regManagerEmail.trim(),
          managerEmail: regManagerEmail.trim(),
          password: regPassword,
          phone: regManagerPhone.trim(),
          managerPhone: regManagerPhone.trim(),
          nationalId: regNationalId.trim(),
          organization: regOrganization.trim() || 'Student Residence Management',
          roleTitle: regRoleTitle.trim() || 'General Manager',
          experienceYears: Number(regExperienceYears) || 3,
          address: fullAddress,
          operatingAddress: fullAddress,
          location: fullAddress,
          knustAccreditedConfirmed: true
        })
      });

      if (!res.ok) {
        const err = await safeJson(res);
        throw new Error(err.error || 'Failed to create manager account');
      }

      const managerData = await safeJson(res);

      // Submit Manager Verification with Identity Checks & Authority Proof (Phase 1)
      try {
        const verifPayload = {
          managerId: managerData.user?.id || managerData.manager?.id || `mgr_${Date.now()}`,
          managerName: regManagerName.trim(),
          managerEmail: regManagerEmail.trim(),
          managerPhone: regManagerPhone.trim(),
          country: regCountry,
          idDocumentType: regDocumentType,
          documentType: regDocumentType,
          idNumber: regNationalId.trim(),
          documentNumber: regNationalId.trim(),
          nationalId: regNationalId.trim(),
          fullNameOnId: regFullNameOnId.trim() || regManagerName.trim(),
          dateOfBirth: regDob,
          idExpiryDate: regIdExpiry,
          authorityRelationship: regAuthorityRel,
          claimedOwnerName: regClaimedOwnerName.trim() || undefined,
          claimedOwnerPhone: regClaimedOwnerPhone.trim() || undefined,
          claimedOwnerEmail: regClaimedOwnerEmail.trim() || undefined,
          organizationName: regOrganization.trim() || 'Student Residence Management',
          organizationRegNumber: regOrgRegNumber.trim() || undefined,
          authorityEvidenceDescription: regAuthorityEvidenceDesc.trim() || 'Official authority documents submitted.',
          documents: regDocFileName ? [{
            fileName: regDocFileName,
            documentType: 'AUTHORITY_PROOF',
            storagePath: `manager-verifications/${regManagerEmail.trim()}/${regDocFileName}`,
            mimeType: 'application/pdf',
            fileSizeBytes: 245000,
            isSensitive: true
          }] : []
        };

        const verifRes = await fetch('/api/manager-verifications/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(user?.token ? { Authorization: `Bearer ${user.token}` } : {}) },
          body: JSON.stringify(verifPayload)
        });
        if (verifRes.ok) {
          const verifData = await safeJson(verifRes);
          setVerificationResult(verifData.verification || verifData.record || verifData);
        }
      } catch (verifErr) {
        console.warn("Manager verification submission warning:", verifErr);
      }

      // Save locally in localStorage for persistent offline & Sandbox Quick Access
      try {
        const existingRaw = localStorage.getItem('pinevela_registered_managers');
        const existing = existingRaw ? JSON.parse(existingRaw) : [];
        const newManagerEntry = {
          name: regManagerName.trim(),
          email: regManagerEmail.trim(),
          organization: regOrganization.trim() || 'Independent Residence',
          savedAt: new Date().toISOString()
        };
        const updated = [...existing.filter((m: any) => m && m.email !== regManagerEmail), newManagerEntry];
        localStorage.setItem('pinevela_registered_managers', JSON.stringify(updated));
        setRegisteredManagers(updated);
      } catch (storageErr) {
        console.warn("Local storage write error:", storageErr);
      }

      // Pre-fill login input with registered email
      setUsernameOrEmail(regManagerEmail);
      setPassword(regPassword);

      setRegStep(2); // Step 2: Verification Success Card
      triggerToast('Manager account created & approval dossier queued for Admin!', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'An error occurred during manager registration', 'error');
    } finally {
      setLoadingRegister(false);
    }
  };

  const regPhoneVerified = (p: string) => {
    return p.trim().length >= 6;
  };

  return (
    <div className="unified-login min-h-screen bg-transparent flex flex-col font-sans justify-between relative overflow-hidden">
      <div className="mobile-login-backdrop" aria-hidden="true">
        <img src={featureImage} alt="" />
      </div>
      <div className="mobile-login-photo" aria-hidden="true">
        <img src={featureImage} alt="PineVela student marketplace" />
      </div>
      
      {/* Decorative gradient backdrops */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-amber-100 rounded-full blur-3xl opacity-30 -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-100 rounded-full blur-3xl opacity-30 -z-10" />

      {/* Light blue semi-circle curving downwards backdrop */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[140%] md:w-[120%] h-[380px] md:h-[480px] bg-gradient-to-b from-blue-50/80 to-blue-100/40 border-b border-blue-200/30 rounded-b-[50%] -z-10 shadow-sm" />

      {/* Floating Toast */}
      {toastMessage && (
        <div role="status" className={`ux-dashboard-toast fixed top-5 right-5 font-bold text-xs px-4 py-3 rounded-xl shadow-2xl z-50 flex items-center gap-2 border animate-bounce ${
          toastType === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
          toastType === 'error' ? 'bg-rose-600 text-white border-rose-500' :
          'bg-slate-900 text-white border-slate-700'
        }`}>
          <span>{toastType === 'success' ? '✓' : toastType === 'error' ? '⚠️' : 'ℹ️'}</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <header className="login-header public-header-card bg-transparent px-6 py-4 flex items-center justify-between z-10 sticky top-0">
        <button type="button" aria-label="PineVela home" className="login-logo-link cursor-pointer" onClick={() => navigate('/')}>
          <PineLogo />
        </button>
        <div className="login-home-link">
          <button 
            onClick={() => navigate('/')}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50 flex items-center gap-1.5 bg-transparent px-3 py-1.5 rounded-lg transition-all"
          >
            <Home size={13} className="text-blue-700" />
            <span>Home</span>
          </button>
        </div>
        <div className="login-mobile-theme"><ThemeToggle /></div>
      </header>

      {/* Main Container */}
      <main className="login-main flex-1 grid grid-cols-1 lg:grid-cols-12 items-center justify-center w-full px-5 sm:px-6 md:px-10 py-8 gap-8 lg:gap-12 z-10 max-w-[1380px] mx-auto">
        
        
        {/* Left side: feature image */}
        <div className="login-showcase-pane hide-scrollbar lg:col-span-6 hidden lg:flex flex-col items-stretch justify-center w-full lg:sticky lg:top-24 select-none">
          <div className="login-showcase-content space-y-7 flex flex-col justify-between w-full">
            <div className="login-feature-card relative aspect-[5/4] w-full rounded-3xl overflow-hidden">
              <img src={featureImage} alt="PineVela student marketplace" loading="eager" fetchPriority="high" className="absolute inset-0 w-full h-full object-contain" />
            </div>
            <div className="login-feature-description space-y-4 px-1">
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight"><span className="text-slate-950">Pine</span><span className="text-blue-900">Vela</span></h3>
              <p className="text-slate-650 text-sm sm:text-base leading-relaxed font-semibold">{featureDescription}</p>
            </div>

            {/* Design brand line divider */}
            <div className="pt-2 border-t border-slate-200/50" />
          </div>
        </div>

        {/* Right Side: Login & Signup Box */}
        <div className="login-form-pane hide-scrollbar lg:col-span-6 flex flex-col items-stretch justify-center w-full max-w-2xl mx-auto lg:max-w-none">
          
          <div className="login-auth-card bg-blue-50/90 backdrop-blur-lg rounded-3xl border border-blue-200/70 shadow-2xl p-8 sm:p-10 space-y-6 relative overflow-hidden flex flex-col justify-between w-full">
            
            <div className="login-card-heading text-center space-y-2 pt-1">
              <div className="login-card-logo flex justify-center">
                <PineLogo size={58} hideText={true} />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                {verificationPending ? (
                  <span className="text-slate-900">Security Verification</span>
                ) : activeTab === 'login' ? (
                  <span 
                    className="login-brand-heading text-black font-black"
                    style={{ 
                      color: '#000000', 
                      WebkitTextStroke: '1.5px #2563eb', 
                      paintOrder: 'stroke fill' 
                    }}
                  >
                    Login
                  </span>
                ) : (
                  <span 
                    className="login-brand-heading text-black font-black"
                    style={{ 
                      color: '#000000', 
                      WebkitTextStroke: '1.5px #2563eb', 
                      paintOrder: 'stroke fill' 
                    }}
                  >
                    Sign Up
                  </span>
                )}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-semibold max-w-md mx-auto">
                {verificationPending 
                  ? 'Verify your email to activate your PineVela identity account.' 
                  : activeTab === 'login' 
                   
                    }
              </p>
            </div>

            {/* Tab Selector */}
            {!verificationPending && (
              <div className="login-mode-toggle flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60">
                <button
                  type="button"
                  aria-pressed={activeTab === 'login'}
                  onClick={() => { setActiveTab('login'); setLoginError(null); }}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'login' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <span className="hidden lg:inline">Sign In</span><span className="lg:hidden">Login</span>
                </button>
                <button
                  type="button"
                  aria-pressed={activeTab === 'register'}
                  onClick={() => { setActiveTab('register'); setLoginError(null); }}
                  className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    activeTab === 'register' ? 'bg-white text-blue-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Sign Up
                </button>
              </div>
            )}

            {(activeTab === 'register' || verificationPending) && <OnboardingProgress steps={SIGNUP_STEPS} step={verificationPending ? 2 : 1} label="Account signup" />}

            {verificationPending ? (
              /* Email Verification Screen */
              <form onSubmit={handleUnifiedVerifySubmit} className="onboarding-fields space-y-4 text-left py-1">
                <div className="text-center space-y-1">
                  <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-900 rounded-full flex items-center justify-center font-bold shadow-inner">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">{developmentSignupCode ? 'Development signup code' : 'Verify Your Email'}</h3>
                  <p className="text-[11px] text-slate-500">
                    {developmentSignupCode ? 'Enter the development code for' : 'Paste the confirmation link or enter the code emailed to'} <span className="font-bold text-blue-900">{verificationEmail}</span>
                  </p>
                </div>

                {developmentSignupCode && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                    <p className="text-[11px] font-semibold text-blue-900">Local development only · Email ownership is not verified</p>
                    <p className="my-2 font-mono text-xl font-black tracking-widest text-blue-900">{developmentSignupCode}</p>
                    <button type="button" onClick={() => setVerificationCodeInput(developmentSignupCode)} className="text-xs font-bold text-blue-900 underline cursor-pointer">Use this code</button>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">{developmentSignupCode ? 'Development code' : 'Email confirmation link or code'}</label>
                  <input
                    type="text"
                    required
                    maxLength={4096}
                    inputMode="text"
                    autoComplete="one-time-code"
                    aria-label="Email confirmation link or code"
                    value={verificationCodeInput}
                    onChange={(e) => setVerificationCodeInput(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 font-mono text-sm transition-all"
                  />
                </div>

                {!developmentSignupCode && <p className="text-[11px] text-slate-500 leading-relaxed">
                  If your email contains a button, copy its link and paste it above without opening it.
                </p>}

                <button
                  type="submit"
                  disabled={verifyingCode}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {verifyingCode ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Token...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      <span>{developmentSignupCode ? 'Continue in development' : 'Verify & Activate Account'}</span>
                    </>
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setVerificationPending(false);
                      setActiveTab('register');
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Back to registration
                  </button>
                </div>
              </form>
            ) : activeTab === 'login' ? (
              /* System Login Form */
              <form onSubmit={handleLoginSubmit} className="space-y-4 text-left py-1">
                
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">Username or Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Mail size={17} />
                    </span>
                    <input aria-label="Username or Email Address"
                      type="text"
                      required
                      placeholder="e.g. student@pinevela.com"
                      value={usernameOrEmail}
                      onChange={(e) => {
                        setUsernameOrEmail(e.target.value);
                        setNeedsPortalPin(false);
                        setLoginPortalPin('');
                        if (loginError) setLoginError(null);
                      }}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-700 block">Password</label>
                    <button 
                      type="button" 
                      onClick={() => triggerToast('Standard password reset requires system administrator approval.', 'info')} 
                      className="text-xs font-bold text-blue-900 hover:underline cursor-pointer"
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Key size={17} />
                    </span>
                    <input aria-label="Password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all shadow-xs"
                    />
                    <button aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                {needsPortalPin && (
                  <fieldset className="space-y-3">
                    <legend className="text-xs font-bold text-slate-700 mb-2">Open your account portal</legend>
                    <div className="space-y-1.5">
                      <label htmlFor="login-portal" className="text-xs font-bold text-slate-700 block">Account</label>
                      <select id="login-portal" value={loginPortal} onChange={e => { setLoginPortal(e.target.value as 'resident' | 'seller'); setLoginPortalPin(''); }}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-900">
                        <option value="resident">Resident</option>
                        <option value="seller">Seller</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="login-portal-pin" className="text-xs font-bold text-slate-700 block">Portal access PIN</label>
                      <input id="login-portal-pin" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required
                        value={loginPortalPin} onChange={e => setLoginPortalPin(e.target.value)}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-900" />
                      <p className="text-xs text-slate-500">Use the PIN for this portal with your verified student email and password.</p>
                    </div>
                  </fieldset>
                )}

                <button
                  type="submit"
                  disabled={loadingLogin}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loadingLogin ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying Session...</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={17} />
                      <span>Login</span>
                    </>
                  )}
                </button>

                {loginError && (
                  <div
                    className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-800"
                    role="alert"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}


              </form>
            ) : (
              /* Unified Registration Form */
              <form onSubmit={handleUnifiedRegisterSubmit} className="onboarding-fields space-y-3.5 text-left py-1">
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Your Full Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <User size={16} />
                    </span>
                    <input aria-label="Your Full Name"
                      type="text"
                      required
                      placeholder="e.g. Alexander Cole"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Email Address</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Mail size={16} />
                    </span>
                    <input aria-label="Email Address"
                      type="email"
                      required
                      placeholder="e.g. alex@example.com"
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Choose Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Key size={16} />
                    </span>
                    <input aria-label="Choose Password"
                      type={showRegPass ? 'text' : 'password'}
                      required
                      placeholder="Min. 6 characters"
                      value={regPass}
                      onChange={(e) => setRegPass(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all"
                    />
                    <button aria-label={showRegPass ? 'Hide password' : 'Show password'} aria-pressed={showRegPass}
                      type="button"
                      onClick={() => setShowRegPass(!showRegPass)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRegPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <PasswordStrengthGauge password={regPass} />

                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Confirm Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Lock size={16} />
                    </span>
                    <input aria-label="Confirm Password"
                      type={showRegConfirmPass ? 'text' : 'password'}
                      required
                      placeholder="Repeat password"
                      value={regConfirmPass}
                      onChange={(e) => setRegConfirmPass(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 text-xs sm:text-sm font-semibold transition-all"
                    />
                    <button aria-label={showRegConfirmPass ? 'Hide password' : 'Show password'} aria-pressed={showRegConfirmPass}
                      type="button"
                      onClick={() => setShowRegConfirmPass(!showRegConfirmPass)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showRegConfirmPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <PasswordStrengthGauge password={regConfirmPass} />
                </div>

                <button
                  type="submit"
                  disabled={loadingLogin}
                  className="w-full py-2.5 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-1"
                >
                  {loadingLogin ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <span>Sign Up Now</span>
                  )}
                </button>

              </form>
            )}

            {!verificationPending && <GoogleAuthButton returnTo={continuation} mode={activeTab === 'register' ? 'signup' : 'login'} onError={setLoginError} />}
            {activeTab === 'register' && !verificationPending && loginError && <p role="alert" className="text-xs font-semibold text-rose-800">{loginError}</p>}

          </div>

        </div>

      </main>

      {/* Footer - Fixed Clean Base */}
      <footer className="login-footer text-center py-4 text-[10px] text-slate-400 bg-transparent shrink-0 z-20">
        &copy; 2026 PineVela Residence Solutions.
      </footer>

      {/* HOSTEL MANAGER REGISTRATION WIZARD */}
      {showRegModal && (
        <DashboardOverlay aria-label="Hostel Manager Onboarding" onClose={() => setShowRegModal(false)} className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div data-popup-card className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 border border-slate-100 shadow-2xl relative flex flex-col max-h-[90vh] overflow-y-auto animate-fade-in text-left">
            
            {/* Close Button */}
            <button 
              onClick={() => setShowRegModal(false)}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all text-xl font-bold cursor-pointer"
            >
              ×
            </button>

            <OnboardingProgress steps={MANAGER_ACCOUNT_STEPS} step={regStep} label="Manager account" />

            {/* Step Wizard Header */}
            {regStep === 1 && (
              <div className="mb-5 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-900 text-white rounded-2xl shadow-sm">
                    <Building size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 tracking-tight">
                      Hostel Manager Onboarding
                    </h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Enter verified managerial credentials to establish your property management profile.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-[11px] text-blue-900 leading-relaxed">
                  🛡️ <strong>Manager Verification Policy:</strong> Managers must provide verifiable national identity and operational credentials. Once registered, you will be able to request and complete the four-step hostel registration directly within your dashboard.
                </div>
              </div>
            )}

            {/* STEP 1: ACCOUNT & KEEN MANAGER DETAILS WITH PHASE 1 VERIFICATION */}
            {regStep === 1 && (
              <form onSubmit={handleManagerRegisterSubmit} className="onboarding-fields space-y-4 text-xs font-semibold text-left max-h-[75vh] overflow-y-auto pr-1">
                
                {/* Synthetic Test Card Quick-Select Banner (Dev/Test Tooling) */}
                <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-3 space-y-1.5 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      Synthetic NIA Ghana Card Registry ({testCards.length > 0 ? testCards.length : 300} Test Cards)
                    </span>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">
                      Dev/Test Mode
                    </span>
                  </div>
                  <p className="text-[10px] text-amber-800 font-normal leading-relaxed">
                    Select a synthetic card or click <strong>Random Card</strong> to auto-fill valid verification credentials without using real Ghana Card numbers.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <select aria-label="Development document sample"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-white border border-amber-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-amber-500 shadow-xs"
                      value={selectedSyntheticCardId}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const card = testCards.find(c => c && c.idNumber === val);
                        if (card) {
                          applySyntheticCard(card);
                        }
                      }}
                    >
                      <option value="">-- Select a Synthetic Test Ghana Card --</option>
                      {testCards.filter(Boolean).slice(0, 50).map(c => (
                        <option key={c.idNumber || c.fullName} value={c.idNumber}>
                          {c.idNumber} — {c.fullName} {c.status && c.status !== 'verified' ? `[${c.status}]` : ''}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleRandomCard}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-lg text-[10px] font-black uppercase tracking-wider shrink-0 transition-all shadow-xs flex items-center gap-1"
                    >
                      Random Card
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Manager Full Legal Name *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <User size={15} />
                      </span>
                      <input aria-label="Manager Full Legal Name"
                        type="text"
                        required
                        placeholder="e.g. Dr. Sarah Jenkins"
                        value={regManagerName}
                        onChange={(e) => setRegManagerName(e.target.value)}
                        autoComplete="name"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Manager Work Email *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <Mail size={15} />
                      </span>
                      <input aria-label="Manager Work Email"
                        type="email"
                        required
                        placeholder="e.g. sarah.jenkins@pinevela.com"
                        value={regManagerEmail}
                        onChange={(e) => setRegManagerEmail(e.target.value)}
                        autoComplete="email"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Direct Phone */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Direct Phone Number *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <Phone size={15} />
                      </span>
                      <input aria-label="Direct Phone Number"
                        type="tel"
                        required
                        placeholder="024 000 0000 or +233 24 000 0000"
                        value={regManagerPhone}
                        onChange={(e) => setRegManagerPhone(cleanPhoneNumber(e.target.value))}
                        autoComplete="tel"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">Numbers only (10 digits starting with 0, or international +233)</p>
                  </div>

                  {/* Country of Issuance */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Country of Identity *</label>
                    <select aria-label="Country of Identity"
                      value={regCountry}
                      onChange={(e) => setRegCountry(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    >
                      <option value="Ghana">Ghana</option>
                      <option value="Nigeria">Nigeria</option>
                      <option value="Kenya">Kenya</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="United States">United States</option>
                      <option value="Other">Other International</option>
                    </select>
                  </div>

                  {/* Identity Document Type */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Document Type *</label>
                    <select aria-label="Document Type"
                      value={regDocumentType}
                      onChange={(e) => {
                        const newType = e.target.value;
                        setRegDocumentType(newType);
                        const cfg = resolveIdConfig(newType);
                        setRegNationalId(prev => cfg.formatInput(prev));
                      }}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    >
                      <option value="Voter ID">National Voters ID (10 Digits — Numbers Only)</option>
                      <option value="NHIS Card">NHIS Health Card (8 Digits — Numbers Only)</option>
                      <option value="Passport">International Passport (Alphanumeric)</option>
                      <option value="Driver's License">Driver's License (DVLA Alphanumeric)</option>
                    </select>
                  </div>

                  {/* National ID / Document Number with Dynamic Constraints */}
                  {(() => {
                    const cfg = resolveIdConfig(regDocumentType);
                    return (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-slate-700 block font-bold">
                            {cfg.name} Number *
                          </label>
                          {cfg.numericOnly && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-black tracking-wide uppercase">
                              Numbers Only
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                            <ShieldCheck size={15} />
                          </span>
                          <input aria-label="Number"
                            type={cfg.numericOnly ? "tel" : "text"}
                            required
                            inputMode={cfg.numericOnly ? "numeric" : "text"}
                            maxLength={cfg.maxLength}
                            placeholder={cfg.placeholder}
                            value={regNationalId}
                            onChange={(e) => setRegNationalId(cfg.formatInput(e.target.value))}
                            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                          />
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium">
                          {cfg.helperText}
                        </p>
                      </div>
                    );
                  })()}

                  {/* Full Name on Document */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Full Name on ID Document *</label>
                    <input aria-label="Full Name on ID Document"
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins Mensah"
                      value={regFullNameOnId || ''}
                      onChange={(e) => setRegFullNameOnId(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  {/* Date of Birth & ID Expiry */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-slate-700 block font-bold">Date of Birth</label>
                      <input aria-label="Date of Birth"
                        type="date"
                        value={regDob}
                        onChange={(e) => setRegDob(e.target.value)}
                        className="w-full px-2.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-700 block font-bold">Expiry Date</label>
                      <input aria-label="Expiry Date"
                        type="date"
                        value={regIdExpiry}
                        onChange={(e) => setRegIdExpiry(e.target.value)}
                        className="w-full px-2.5 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Authority / Relationship to Property */}
                  <div className="space-y-1 sm:col-span-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                    <label className="text-slate-800 block font-bold mb-1">
                      Authority & Relationship to Property *
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(['Property Owner', 'Authorized Manager', 'Managing Director', 'Property Agent'] as const).map(rel => (
                        <button
                          key={rel}
                          type="button"
                          onClick={() => setRegAuthorityRel(rel)}
                          className={`px-2.5 py-2 rounded-xl text-xs font-bold transition-all border text-center ${
                            regAuthorityRel === rel
                              ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {rel}
                        </button>
                      ))}
                    </div>

                    {/* Conditional owner contact fields if Authorized Manager or Property Agent */}
                    {(regAuthorityRel === 'Authorized Manager' || regAuthorityRel === 'Property Agent') && (
                      <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-600">Claimed Owner Name *</label>
                          <input aria-label="Claimed Owner Name"
                            type="text"
                            placeholder="e.g. Chief Nana Boakye"
                            value={regClaimedOwnerName}
                            onChange={(e) => setRegClaimedOwnerName(e.target.value)}
                            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-600">Owner Phone *</label>
                          <input aria-label="Owner Phone"
                            type="text"
                            placeholder="+233 20 111 2233"
                            value={regClaimedOwnerPhone}
                            onChange={(e) => setRegClaimedOwnerPhone(e.target.value)}
                            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-600">Owner Email</label>
                          <input aria-label="Owner Email"
                            type="email"
                            placeholder="owner@property.gh"
                            value={regClaimedOwnerEmail}
                            onChange={(e) => setRegClaimedOwnerEmail(e.target.value)}
                            className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-xs"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Organization / Management Entity */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Management Entity / Company *</label>
                    <input aria-label="Management Entity / Company"
                      type="text"
                      required
                      placeholder="e.g. PineVela Accommodations Ltd."
                      value={regOrganization}
                      onChange={(e) => setRegOrganization(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  {/* Company Registration Number */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Company Reg No. (Optional)</label>
                    <input aria-label="Company Reg No. (Optional)"
                      type="text"
                      placeholder="e.g. CS-90214-2021"
                      value={regOrgRegNumber}
                      onChange={(e) => setRegOrgRegNumber(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none font-mono"
                    />
                  </div>

                  {/* Managerial Designation */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Designation / Role Title *</label>
                    <select aria-label="Designation / Role Title"
                      value={regRoleTitle}
                      onChange={(e) => setRegRoleTitle(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    >
                      <option value="General Manager">General Manager / Managing Director</option>
                      <option value="Property Owner / Landlord">Property Owner / Landlord</option>
                      <option value="Residence Warden">Chief Residence Warden</option>
                      <option value="Operations Director">Director of Student Accommodation</option>
                    </select>
                  </div>

                  {/* Management Experience */}
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Management Experience (Years)</label>
                    <input aria-label="Management Experience (Years)"
                      type="number"
                      min="1"
                      max="40"
                      value={regExperienceYears}
                      onChange={(e) => setRegExperienceYears(Number(e.target.value))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  {/* Kumasi Campus Zone & Address */}
                  <div className="space-y-1 sm:col-span-2">
                    <div className="flex items-center gap-1.5 mb-1">
                      <label className="text-slate-700 font-bold">Kumasi Campus Zone *</label>
                      <div className="relative inline-block">
                        <button
                          type="button"
                          onClick={() => setShowRegLocationTooltip(!showRegLocationTooltip)}
                          onMouseEnter={() => setShowRegLocationTooltip(true)}
                          onMouseLeave={() => setShowRegLocationTooltip(false)}
                          className="text-slate-400 hover:text-blue-900 transition-colors p-0.5 rounded-full cursor-pointer focus:outline-none flex items-center"
                          title="Why Kumasi/KNUST only?"
                        >
                          <HelpCircle className="w-3.5 h-3.5" />
                        </button>
                        
                        {showRegLocationTooltip && (
                          <div className="absolute left-0 top-6 z-50 w-72 p-3 bg-slate-900 text-slate-100 border border-blue-500/40 rounded-xl shadow-2xl text-[11px] space-y-1.5 leading-relaxed backdrop-blur-md">
                            <div className="flex items-center gap-1.5 font-bold text-blue-400 border-b border-slate-800 pb-1">
                              <Info className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span>Why Kumasi / KNUST Properties Only?</span>
                            </div>
                            <p className="text-slate-300">
                              PineVela's property management network, student room key system, and physical verification officers are officially localized and accredited for <strong className="text-white">KNUST campus student housing in Kumasi</strong>.
                            </p>
                            <p className="text-blue-300 text-[10px] font-medium">
                              Only hostels located in Kumasi/KNUST zones can be verified and onboarded.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    <select aria-label="Management area"
                      value={regSelectedLocation}
                      onChange={(e) => setRegSelectedLocation(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-semibold focus:ring-2 focus:ring-blue-900 focus:outline-none cursor-pointer mb-2"
                    >
                      <option value="Ayeduase (KNUST Gate)">Ayeduase (KNUST Gate)</option>
                      <option value="Kotei (KNUST Gate)">Kotei (KNUST Gate)</option>
                      <option value="Kentinkrono (KNUST Area)">Kentinkrono (KNUST Area)</option>
                      <option value="Bomso (KNUST Area)">Bomso (KNUST Area)</option>
                      <option value="Gaza / Gaza-Ayeduase">Gaza / Gaza-Ayeduase</option>
                      <option value="Boadi (KNUST Area)">Boadi (KNUST Area)</option>
                      <option value="KNUST Main Campus / Hilltop">KNUST Main Campus / Hilltop</option>
                      <option value="Tech Junction / Maxima, Kumasi">Tech Junction / Maxima, Kumasi</option>
                      <option value="Oforikrom, Kumasi">Oforikrom, Kumasi</option>
                      <option value="Other Kumasi Location">Other Kumasi Location</option>
                    </select>

                    <label className="text-slate-700 block font-bold mt-2">Specific Office / Hostel Address in Kumasi</label>
                    <input aria-label="Full residence address"
                      type="text"
                      placeholder="e.g. Plot 14 Gaza Road, Ayeduase, Kumasi"
                      value={regAddress}
                      onChange={(e) => setRegAddress(e.target.value)}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                    />
                  </div>

                  {/* Mandatory KNUST Accreditation & Kumasi Location Confirmation */}
                  <div className="sm:col-span-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-200">
                    <label className="flex items-start gap-2.5 cursor-pointer select-none">
                      <input 
                        type="checkbox"
                        required
                        checked={regKnustConfirmed}
                        onChange={(e) => setRegKnustConfirmed(e.target.checked)}
                        className="mt-0.5 w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600 accent-emerald-600 cursor-pointer shrink-0"
                      />
                      <span className="text-xs text-emerald-950 font-medium leading-relaxed">
                        I explicitly confirm that my hostel/residence property is located in <strong className="text-emerald-800 font-bold">Kumasi</strong> and is <strong className="text-emerald-800 font-bold">KNUST accredited</strong> (or registered to serve KNUST university students).
                      </span>
                    </label>
                  </div>

                  {/* Proof of Authority Evidence & Document Upload */}
                  <div className="space-y-2 sm:col-span-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-100">
                    <div className="flex items-center justify-between">
                      <label className="text-blue-950 font-bold flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-blue-700" />
                        <span>Proof of Authority / Ownership Evidence</span>
                      </label>
                      <span className="text-[10px] text-blue-700 font-bold bg-blue-100 px-2 py-0.5 rounded-full">
                        Stored in Private Storage
                      </span>
                    </div>
                    <input aria-label="Proof of Authority / Ownership Evidence"
                      type="text"
                      placeholder="e.g. Registered title deed and power of attorney executed with property owner."
                      value={regAuthorityEvidenceDesc}
                      onChange={(e) => setRegAuthorityEvidenceDesc(e.target.value)}
                      className="w-full px-3 py-2 border border-blue-200 rounded-xl bg-white text-slate-800 text-xs"
                    />
                    <div className="flex items-center gap-2 pt-1 text-[11px]">
                      <div className="flex-1 px-3 py-2 bg-white border border-dashed border-blue-300 rounded-xl flex items-center justify-between">
                        <span className="text-slate-600 truncate">
                          📄 {regDocFileName || 'authority-documentation.pdf'}
                        </span>
                        <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-full">
                          Ready for Private Storage
                        </span>
                      </div>
                    </div>
                  </div>

                </div>

                {/* Password Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Account Password *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <Lock size={15} />
                      </span>
                      <input aria-label="Account Password"
                        type={showRegPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                      <button aria-label={showRegPassword ? 'Hide password' : 'Show password'} aria-pressed={showRegPassword}
                        type="button"
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-650 cursor-pointer"
                      >
                        {showRegPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <PasswordStrengthGauge password={regPassword} />


                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-700 block font-bold">Confirm Password *</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                        <Lock size={15} />
                      </span>
                      <input aria-label="Confirm Password"
                        type={showRegConfirmPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        className="w-full pl-9 pr-10 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-medium focus:ring-2 focus:ring-blue-900 focus:outline-none"
                      />
                      <button aria-label={showRegConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showRegConfirmPassword}
                        type="button"
                        onClick={() => setShowRegConfirmPassword(!showRegConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-650 cursor-pointer"
                      >
                        {showRegConfirmPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                    <PasswordStrengthGauge password={regConfirmPassword} />
                  </div>
                </div>

                <div className="pt-4 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setShowRegModal(false)}
                    className="px-4 py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold rounded-xl transition-all text-xs cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={loadingRegister}
                    className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white font-extrabold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {loadingRegister ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Verifying & Submitting...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck size={14} />
                        <span>Submit Manager Verification</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 2: MANAGER VERIFICATION SUBMISSION STATUS */}
            {regStep === 2 && (
              <div className="space-y-6 text-center py-4 flex flex-col items-center">
                
                {/* Pulsing Status Icon */}
                <div className="mx-auto w-16 h-16 bg-amber-50 rounded-full border-4 border-amber-100 flex items-center justify-center text-amber-600 shadow-sm animate-pulse">
                  <ShieldCheck size={32} />
                </div>

                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 bg-amber-100 text-amber-900 text-xs font-black uppercase px-3 py-1 rounded-full">
                    <span>Status: Pending Admin Review</span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                    Verification Submitted Successfully
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed max-w-md mx-auto">
                    Welcome, <span className="font-extrabold text-blue-900">{regManagerName}</span>! Your manager identity and authority claims have been received and logged in the administrative verification queue.
                  </p>
                </div>

                {/* Automated System Check Summary */}
                <div className="w-full bg-slate-50 rounded-2xl border border-slate-200 p-4 text-left text-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                    <span className="font-extrabold text-slate-800">Automated System Pre-Checks:</span>
                    <span className="text-[10px] font-black uppercase text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                      Validation Passed
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Identity Check: Validated</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Name Consistency: Passed</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Authority Evidence: Attached</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-700">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>Duplicate Check: Clean</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-200 text-[11px] space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Document:</span>
                      <span className="font-mono text-slate-800">{regDocumentType} ({regNationalId})</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Authority Claim:</span>
                      <span className="font-bold text-slate-800">{regAuthorityRel} — {regOrganization}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400 font-bold">Work Email:</span>
                      <span className="text-blue-900 font-semibold">{regManagerEmail}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 leading-relaxed text-left space-y-1.5 w-full">
                  <p className="font-bold flex items-center gap-1.5 text-amber-950">
                    <Clock size={14} className="text-amber-600 animate-pulse" />
                    <span>Approval Required Before Login & Resident Registration</span>
                  </p>
                  <p className="text-[10px] text-amber-850 font-medium">
                    Your manager account registration has been created and submitted to the administrator queue. Direct login to your manager account and resident/hostel registration will remain locked until an administrator approves your account.
                  </p>
                </div>

                <div className="space-y-2 w-full pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRegModal(false);
                      setActiveTab('login');
                    }}
                    className="w-full py-3 bg-blue-900 hover:bg-blue-800 text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    <span>Acknowledge & Return to Sign In</span>
                  </button>
                </div>
              </div>
            )}

          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: Pending Approval / Verification Notice */}
      {pendingApprovalModal && (
        <DashboardOverlay aria-label="Submission under review" onClose={() => setPendingApprovalModal(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-blue-950/60 backdrop-blur-md animate-fadeIn">
          <div data-popup-card className="bg-white rounded-3xl border-2 border-amber-200/80 shadow-2xl max-w-md w-full p-6 md:p-8 space-y-6 text-center relative overflow-hidden">
            {/* PineVela Signature Top Gradient */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-900 via-amber-400 to-emerald-600" />
            
            <div className="flex flex-col items-center space-y-3 pt-2">
              <div className="flex items-center justify-center p-2 bg-amber-50 rounded-2xl border border-amber-200/60 shadow-inner">
                <PineLogo size={52} hideText={true} />
              </div>
              
              <div>
                <span className="inline-flex items-center gap-1.5 bg-amber-100/80 text-amber-900 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full border border-amber-300 shadow-xs">
                  <Clock size={12} className="text-amber-600 animate-spin" />
                  PineVela Admissions & Security Review
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
                  Submission Under Review
                </h3>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-650 leading-relaxed max-w-sm mx-auto">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] text-slate-500 font-medium">Account Credential:</p>
                <p className="text-blue-900 font-mono font-bold text-xs truncate">{pendingApprovalModal.email}</p>
              </div>

              <div className="p-4 bg-amber-50/80 border border-amber-200/70 rounded-2xl text-amber-950 font-medium text-left space-y-2">
                <p className="font-bold flex items-center gap-2 text-amber-900 text-xs">
                  <ShieldCheck size={16} className="text-amber-600 shrink-0" />
                  PineVela Verification Policy
                </p>
                <p className="text-[11px] text-amber-900 leading-normal">
                  Thank you for submitting your application! PineVela administrators personally review and verify all student merchant and hostel manager applications against official university credentials.
                </p>
                <p className="text-[11px] text-amber-800 font-bold bg-white/70 p-2 rounded-lg border border-amber-200/50">
                  ⏳ Please check back later — once PineVela admins approve your submission, you will be able to log in and access your platform.
                </p>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setPendingApprovalModal(null)}
                className="w-full py-3.5 bg-blue-900 hover:bg-blue-800 active:scale-[0.99] text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <span>Understood & Return to Sign In</span>
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* MODAL: Blocked / Restricted Manager Account Popup */}
      {blockedAccountModal && (
        <DashboardOverlay aria-label="Manager account blocked" onClose={() => setBlockedAccountModal(null)} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-fadeIn">
          <div data-popup-card className="bg-white rounded-3xl border-2 border-rose-300 shadow-2xl max-w-md w-full p-6 md:p-8 space-y-6 text-center relative overflow-hidden">
            {/* Red Accent Header */}
            <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-rose-600 via-red-500 to-amber-600" />
            
            <div className="flex flex-col items-center space-y-3 pt-2">
              <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shadow-inner">
                <ShieldAlert size={32} className="text-rose-600 animate-pulse" />
              </div>
              
              <div>
                <span className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 text-[10px] font-black uppercase tracking-wider px-3.5 py-1 rounded-full border border-rose-300 shadow-xs">
                  <Lock size={12} className="text-rose-600" />
                  Account Access Suspended
                </span>
                <h3 className="text-2xl font-black text-slate-900 mt-2 tracking-tight">
                  Manager Account Blocked
                </h3>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-650 leading-relaxed max-w-sm mx-auto">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <p className="text-[11px] text-slate-500 font-medium">Work Email Account:</p>
                <p className="text-rose-900 font-mono font-bold text-xs truncate">{blockedAccountModal.email}</p>
              </div>

              <div className="p-4 bg-rose-50/90 border border-rose-200 rounded-2xl text-rose-950 font-medium text-left space-y-2.5">
                <p className="font-bold flex items-center gap-2 text-rose-900 text-xs">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  Administrator Restriction Notice
                </p>
                <div className="p-3 bg-white/80 border border-rose-200 rounded-xl text-xs text-rose-950 font-medium">
                  <span className="block text-[10px] font-black text-rose-600 uppercase tracking-wider mb-0.5">Reason for Restriction:</span>
                  <p className="font-semibold text-rose-900 leading-relaxed">"{blockedAccountModal.reason}"</p>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Your manager console credentials and live property listings are temporarily paused. <strong>Please wait until further notice</strong> or contact PineVela administrative support for case review.
                </p>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="button"
                onClick={() => setBlockedAccountModal(null)}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 active:scale-[0.99] text-white font-black rounded-xl text-xs transition-all shadow-md cursor-pointer tracking-wider uppercase flex items-center justify-center gap-2"
              >
                <span>Understood & Close</span>
              </button>
            </div>
          </div>
        </DashboardOverlay>
      )}

      {/* RESIDENT & STUDENT DIGITAL ROOM KEY ONBOARDING MODAL */}
      {showStudentKeyModal && usesSupabasePersistence && <SupabaseResidentActivation name={user?.name} phone={user?.phone} onClose={() => setShowStudentKeyModal(false)} onActivated={() => undefined} />}
      {showStudentKeyModal && !usesSupabasePersistence && (
        <DashboardOverlay aria-label="Activate resident room" onClose={() => {
                setShowStudentKeyModal(false);
                setStudentKeyStep(1);
              }} className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-50 flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
          <div data-popup-card className="bg-white/95 backdrop-blur-2xl rounded-3xl max-w-xl w-full p-6 sm:p-8 border border-blue-200/80 shadow-2xl relative flex flex-col max-h-[92vh] overflow-y-auto text-left space-y-5">
            
            {/* Close Button */}
            <button aria-label="Close dialog"
              onClick={() => {
                setShowStudentKeyModal(false);
                setStudentKeyStep(1);
              }}
              className="absolute top-5 right-5 p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-all text-xl font-bold cursor-pointer"
            >
              <X size={18} />
            </button>

            {/* Stepper Header */}
            <div className="space-y-3 pr-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center shadow-md shadow-blue-600/30 shrink-0">
                  <Key size={20} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <span>Resident Room Registration</span>
                    <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 tracking-wider">Room Key</span>
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {studentKeyStep === 1 && 'Input your digital room key to verify room allocation'}
                    {studentKeyStep === 2 && 'Set up your resident account details and security password'}
                    {studentKeyStep === 3 && 'Room verified! Your resident account is now active'}
                  </p>
                </div>
              </div>

              <OnboardingProgress steps={ROOM_ACTIVATION_STEPS} step={studentKeyStep} label="Room activation" />
            </div>

            {/* STEP 1: Digital Room Key Verification */}
            {studentKeyStep === 1 && (
              <div className="space-y-4">
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-black text-slate-800 block">
                      Enter Digital Room Key <span className="text-rose-600">*</span>
                    </label>
                    <span className="text-[11px] text-blue-700 font-semibold">
                      Provided by Hostel Manager
                    </span>
                  </div>

                  <div className="relative">
                    <Key className="w-4 h-4 text-blue-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input aria-label="Enter Digital Room Key"
                      type="text"
                      autoFocus
                      value={studentKeyInput}
                      onChange={(e) => {
                        setStudentKeyInput(e.target.value.toUpperCase());
                        setStudentKeyError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleVerifyStudentKey();
                      }}
                      placeholder="e.g. MAZE-A-749201"
                      className="w-full pl-10 pr-24 py-3 bg-white border border-slate-200 rounded-2xl font-mono text-sm font-black uppercase text-slate-900 tracking-wider focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-400/20 shadow-inner"
                    />
                    <button
                      type="button"
                      onClick={() => handleVerifyStudentKey()}
                      disabled={verifyingStudentKey || !studentKeyInput.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {verifyingStudentKey ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck size={14} />
                      )}
                      <span>Verify</span>
                    </button>
                  </div>
                </div>

                {studentKeyError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 font-bold flex items-center gap-2 animate-fade-in">
                    <ShieldAlert size={16} className="text-rose-600 shrink-0" />
                    <span>{studentKeyError}</span>
                  </div>
                )}

                {/* Verified Room Card & Progression */}
                {verifiedKeyDetails && (
                  <div className="space-y-3 animate-fade-in">
                    <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl space-y-2 text-xs text-emerald-950 shadow-xs">
                      <div className="flex items-center justify-between font-black text-emerald-900">
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-emerald-600" />
                          <span>Room Key Validated: {verifiedKeyDetails.roomKey}</span>
                        </span>
                        <span className="px-2 py-0.5 bg-emerald-200/80 text-emerald-900 font-extrabold rounded-full text-[10px]">
                          Available
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 pt-1 font-bold text-[11px] bg-white/70 p-2.5 rounded-xl border border-emerald-200/60">
                        <div>
                          <span className="text-slate-400 block text-[10px] font-semibold">Hostel</span>
                          <span className="text-slate-900 truncate block">{verifiedKeyDetails.hostelName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-semibold">Block</span>
                          <span className="text-slate-900 truncate block">{verifiedKeyDetails.blockName}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px] font-semibold">Room No.</span>
                          <span className="text-slate-900 truncate block">{verifiedKeyDetails.roomNumber}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setStudentKeyStep(2)}
                        className="w-full py-3.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-white font-extrabold text-xs sm:text-sm rounded-2xl shadow-lg shadow-blue-900/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Continue to Account Setup</span>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* STEP 2: Resident Account Details & Password */}
            {studentKeyStep === 2 && verifiedKeyDetails && (
              <form onSubmit={handleClaimStudentKeySubmit} className="space-y-4">
                <div className="p-3.5 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 font-medium block text-[10px]">Claiming Room</span>
                    <strong className="text-blue-950 font-bold">{verifiedKeyDetails.hostelName} — Block {verifiedKeyDetails.blockName}, Room {verifiedKeyDetails.roomNumber}</strong>
                  </div>
                  <span className="font-mono text-xs font-black bg-blue-100 text-blue-900 px-2 py-0.5 rounded-lg border border-blue-200">{verifiedKeyDetails.roomKey}</span>
                </div>

                <div className="space-y-3">
                  {/* Username / Full Name */}
                  <div className="space-y-1">
                    <label className="text-xs font-black text-slate-800 block">
                      Username / Full Name <span className="text-rose-600">*</span>
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input aria-label="Username / Full Name"
                        type="text"
                        required
                        value={stuName}
                        onChange={(e) => setStuName(e.target.value)}
                        placeholder="Enter your username or full name"
                        className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>

                  {/* Phone & Email */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Phone Number <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Phone Number"
                          type="tel"
                          required
                          value={stuPhone}
                          onChange={(e) => setStuPhone(e.target.value)}
                          placeholder="e.g. 0241234567"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Email Address <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Email Address"
                          type="email"
                          required
                          value={stuEmail}
                          onChange={(e) => setStuEmail(e.target.value)}
                          placeholder="e.g. resident@example.com"
                          className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Password Setup */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Password <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Password"
                          type={showStuPassword ? "text" : "password"}
                          required
                          value={stuPassword}
                          onChange={(e) => setStuPassword(e.target.value)}
                          placeholder="Create password"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                        <button aria-label={showStuPassword ? 'Hide password' : 'Show password'} aria-pressed={showStuPassword}
                          type="button"
                          onClick={() => setShowStuPassword(!showStuPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showStuPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <PasswordStrengthGauge password={stuPassword} />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-black text-slate-800 block">
                        Confirm Password <span className="text-rose-600">*</span>
                      </label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input aria-label="Confirm Password"
                          type={showStuConfirmPassword ? "text" : "password"}
                          required
                          value={stuConfirmPassword}
                          onChange={(e) => setStuConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                          className="w-full pl-10 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                        <button aria-label={showStuConfirmPassword ? 'Hide password' : 'Show password'} aria-pressed={showStuConfirmPassword}
                          type="button"
                          onClick={() => setShowStuConfirmPassword(!showStuConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          {showStuConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <PasswordStrengthGauge password={stuConfirmPassword} />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setStudentKeyStep(1)}
                    className="px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 cursor-pointer"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={submittingStudentClaim || !stuName.trim() || !stuPhone.trim() || !stuEmail.trim() || !stuPassword.trim()}
                    className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-black text-xs rounded-xl shadow-md shadow-blue-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {submittingStudentClaim ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Activating Resident Account...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle size={16} />
                        <span>Complete Registration</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: Minimalistic Confirmation & Room Activated */}
            {studentKeyStep === 3 && claimedUserData && (
              <div className="space-y-5 text-center py-4 animate-fade-in">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce">
                  <CheckCircle2 size={32} />
                </div>

                <div className="space-y-1.5">
                  <h4 className="text-xl font-black text-slate-900 tracking-tight">
                    Room Successfully Activated!
                  </h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Welcome to <strong>{verifiedKeyDetails?.hostelName || 'your hostel'}</strong>. Your digital room key has been claimed and your profile is active.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowStudentKeyModal(false);
                    if (claimedUserData?.user) {
                      const mergedUser = { ...claimedUserData.user, token: claimedUserData.token };
                      setSessionUser(mergedUser);
                      triggerToast(`Welcome ${claimedUserData.user.name || 'Resident'}! Logged in successfully.`, 'success');
                      navigate('/student/dashboard', { replace: true });
                    } else if (stuPassword && stuEmail) {
                      login(stuEmail, stuPassword)
                        .then(() => navigate('/student/dashboard', { replace: true }))
                        .catch(() => {
                          setStudentKeyStep(1);
                          triggerToast('Please sign in with your new email and password.', 'info');
                        });
                    } else {
                      setStudentKeyStep(1);
                      triggerToast('Please sign in with your credentials.', 'info');
                    }
                  }}
                  className="w-full max-w-md mx-auto py-3.5 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-850 hover:to-indigo-850 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-900/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogIn size={18} />
                  <span>Enter Resident Portal & Dashboard</span>
                </button>
              </div>
            )}

          </div>
        </DashboardOverlay>
      )}

    </div>
  );
}
