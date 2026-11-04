import HelpLink from './HelpLink';
import TermsAcceptanceControl from './TermsAcceptanceControl';
import { termsAcceptance } from '../../legalPolicy';
import { signupPasswordError } from '../../signupPassword';
import InstallAppButton from './InstallAppButton';
import DashboardOverlay from './DashboardOverlay';

import { AlertCircle,ArrowRight,Building,CheckCircle,CheckCircle2,Clock,Eye,EyeOff,HelpCircle,Home,Info,Key,Lock,LogIn,Mail,Phone,RefreshCw,ShieldAlert,ShieldCheck,User,X } from 'lucide-react';
import React,{ useEffect,useLayoutEffect,useRef,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';
import { routePopupFeedback } from '../lib/feedback';
import { loginContinuation } from '../lib/publicContinuation';
import { useInstalledAppMode } from '../lib/appMode';
import { sessionFetch as fetch } from '../lib/session';
import { EMAIL_CODE_RESEND_SECONDS, normalizeEmailOtp } from '../../emailOtp';
import {
cleanPhoneNumber,
validateEmail,
validatePhone
} from '../utils/formValidation';
import EmailPasswordRecovery from './EmailPasswordRecovery';
import { useAuthCaptcha } from './AuthCaptcha';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import PineLogo, { PineWordmark } from './PineLogo';
import SupabaseResidentActivation from './SupabaseResidentActivation';
import ArtworkLayers from './ArtworkLayers';
import { useMotionActivity } from '../hooks/useMotionActivity';

// Static asset imports
import marketImg from '../../assets/marketing-artwork/login-market.webp';
import mobileMarketImg from '../../assets/marketing-artwork/login-market-mobile.webp';
import '../login.css';
import '../loginMotion.css';
import GoogleAuthButton from './GoogleAuthButton';
import WindDust from './WindDust';
import { NATIVE_APP, NATIVE_PREVIEW_MESSAGE } from '../native/environment';
import NativeEmailVerification from '../native/NativeEmailVerification';
import { nativeSignedInDestination } from '../native/signedInDestination';
import ThemeToggle from './ThemeToggle';
import '../native/signupDensity.css';

const featureImage = marketImg;
const featureSources = `${mobileMarketImg} 768w, ${featureImage} 1122w`;
const featureSizes = '(max-width: 1023px) 100vw, (max-width: 1480px) 46vw, 680px';
const featureDescription = "PineVela- The unified digital ecosystem connecting Properties, People, and Services into one seamless campus platform.";

export default function PageUnifiedLogin({ nativePreview = false }: { nativePreview?: boolean } = {}) {
  const { login, user, setSessionUser, loading: restoringSession } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const installedApp = useInstalledAppMode();
  const continuation = loginContinuation(location.search);
  const motionRef = useRef<HTMLDivElement>(null);
  useMotionActivity(motionRef);
  const [portraitSource, setPortraitSource] = useState<string>();
  const [portraitFailed, setPortraitFailed] = useState(false);
  const revealPortrait = async (event: React.SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    const source = image.currentSrc || image.src;
    try {
      if (typeof image.decode === 'function') await image.decode();
      if ((image.currentSrc || image.src) === source) setPortraitSource(source);
    } catch { /* A new responsive source can replace a decode already in progress. */ }
  };

  // Form states
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingLogin, setLoadingLogin] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [needsPortalPin,setNeedsPortalPin] = useState(false);
  const [loginPortal,setLoginPortal] = useState<'resident' | 'seller'>('resident');
  const [loginPortalPin,setLoginPortalPin] = useState('');
  const [pendingApprovalModal, setPendingApprovalModal] = useState<{ email: string; name?: string; message: string; pass?: string } | null>(null);
  const [blockedAccountModal, setBlockedAccountModal] = useState<{ email: string; name?: string; message: string; reason: string } | null>(null);

  // Unified Registration & Verification states
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(() =>
    new URLSearchParams(location.search).get('mode') === 'register' || (location.state as { mode?: string } | null)?.mode === 'register'
      ? 'register' : 'login');
  const authScrollRef = useRef<HTMLDivElement>(null);
  const [regName, setRegName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [regEmail, setRegEmail] = useState('');
  const [registeredEmailError, setRegisteredEmailError] = useState<string | null>(null);
  const registrationEmailRef = useRef<HTMLInputElement>(null);
  const showRegisteredEmailError = registeredEmailError === regEmail.trim().toLowerCase();
  const [regPass, setRegPass] = useState('');
  const [regConfirmPass, setRegConfirmPass] = useState('');
  const [showRegPass, setShowRegPass] = useState(false);
  const [showRegConfirmPass, setShowRegConfirmPass] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [resumedSignup,setResumedSignup] = useState(false);
  const signupResumeNotice='This email has an unfinished signup. Verify it with the new code. Your original name and password are kept. Use Forgot Password on the sign-in page if you need a new password.';
  const [verificationEmail, setVerificationEmail] = useState('');
  const [verificationCodeInput, setVerificationCodeInput] = useState('');
  const [verificationError,setVerificationError] = useState<string|null>(null);
  const [signupId, setSignupId] = useState('');
  const [developmentSignupCode, setDevelopmentSignupCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [resendingCode, setResendingCode] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(0);
  const verificationActionPending = useRef(false);
  const credentialActionPending = useRef(false);
  const captcha = useAuthCaptcha(verificationPending ? 'resend' : activeTab, !nativePreview && !showPasswordRecovery && (!verificationPending || resendSeconds === 0));

  useLayoutEffect(() => {
    if (authScrollRef.current) authScrollRef.current.scrollTop = 0;
  }, [activeTab, verificationPending]);

  useEffect(() => {
    if (!verificationPending || !resendAvailableAt) {
      setResendSeconds(0);
      return;
    }
    let timer: ReturnType<typeof setInterval> | undefined;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((resendAvailableAt - Date.now()) / 1000));
      setResendSeconds(seconds);
      if (seconds === 0 && timer !== undefined) clearInterval(timer);
    };
    tick();
    if (resendAvailableAt > Date.now()) timer = setInterval(tick, 1000);
    return () => { if (timer !== undefined) clearInterval(timer); };
  }, [verificationPending, resendAvailableAt]);

  const startResendCountdown = (seconds = EMAIL_CODE_RESEND_SECONDS) => {
    const wait = Number.isInteger(seconds) && seconds > 0 ? seconds : EMAIL_CODE_RESEND_SECONDS;
    setResendAvailableAt(Date.now() + wait * 1000);
    setResendSeconds(wait);
  };

  // Resident Digital Key Onboarding states
  const [showStudentKeyModal, setShowStudentKeyModal] = useState(false);

  useEffect(() => {
    // A cold return can finish before the router mounts. Restore the destination
    // from the provider-verified account, never from the incoming callback URL.
    const params = new URLSearchParams(location.search);
    const roomClaim = ['onboard', 'claim'].includes(params.get('mode') || '') || params.get('verify_room_key') === 'true' || (location.state as { mode?: string } | null)?.mode === 'onboard';
    if (NATIVE_APP && user && !restoringSession && !roomClaim && !showStudentKeyModal && !showPasswordRecovery) {
      navigate(nativeSignedInDestination(user, continuation), { replace: true });
    }
  }, [user, restoringSession, showStudentKeyModal, showPasswordRecovery, continuation, location.search, location.state, navigate]);

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
      primary_closed: 'Your primary portal was closed after a reviewed wipe. Choose Sign Up with Google using the same account to reopen it. Your history remains saved.',
      missing: ('This Google account has no profile in the new PineVela database. Choose Sign Up with Google using the same account to continue.'),
      conflict: 'This email already has a PineVela account. Sign in with your existing credentials.',
      blocked: 'This PineVela account is not permitted to sign in.',
    };
    if (params.has('google_error')) setLoginError(googleErrors[params.get('google_error') || ''] || googleErrors.failed);
    if (params.get('mode') === 'register' || (location.state as any)?.mode === 'register') {
      setActiveTab('register');
    }
    if (!nativePreview && (params.get('mode') === 'onboard' || params.get('mode') === 'claim' || params.get('verify_room_key') === 'true' || (location.state as any)?.mode === 'onboard')) {
      setShowStudentKeyModal(true);
    }
  }, [location, nativePreview]);

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
    if (nativePreview) { setLoginError(NATIVE_PREVIEW_MESSAGE); return; }
    if (credentialActionPending.current) return;
    setLoginError(null);
    if (!usernameOrEmail || !password) {
      setLoginError('Please provide both username/email and password.');
      return;
    }

    credentialActionPending.current = true;
    setLoadingLogin(true);
    try {
      const authenticatedUser = await login(usernameOrEmail, password,needsPortalPin ? { accountKind:loginPortal,portalPin:loginPortalPin } : undefined, await captcha.requireToken());

      if (NATIVE_APP) {
        navigate(nativeSignedInDestination(authenticatedUser, continuation), { replace: true });
        return;
      }

      // Redirect based on role and digital market merchant status
      setTimeout(() => {
        if (authenticatedUser.role === 'user' && continuation) { navigate(continuation, { replace: true }); return; }
        if (authenticatedUser.role === 'user' && authenticatedUser.customerService) { navigate('/customer-service', { replace: true }); return; }
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
      const errMsg = err?.status === 429 && Number.isFinite(err?.retryAfter) && err.retryAfter > 0
        ? `Too many sign-in attempts. Please try again in ${Math.ceil(err.retryAfter / 60)} ${Math.ceil(err.retryAfter / 60) === 1 ? 'minute' : 'minutes'}.`
        : err?.message || '';
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
      credentialActionPending.current = false;
      captcha.reset();
      setLoadingLogin(false);
    }
  };

  const handleUnifiedRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nativePreview) { setLoginError(NATIVE_PREVIEW_MESSAGE); return; }
    if (!acceptedTerms) { setLoginError('Read and accept the Terms of service to create an account.'); return; }
    if (credentialActionPending.current) return;
    setRegisteredEmailError(null);
    if (!regName.trim() || !regEmail.trim() || !regPass) {
      triggerToast('All fields are required to create an account.', 'error');
      return;
    }
    const emailCheck = validateEmail(regEmail, 'Email address');
    if (!emailCheck.isValid) {
      triggerToast(emailCheck.error || 'Invalid email format.', 'error');
      return;
    }
    const passwordError = signupPasswordError(regPass);
    if (passwordError) {
      triggerToast(passwordError, 'error');
      return;
    }
    if (regPass !== regConfirmPass) {
      triggerToast('Passwords do not match.', 'error');
      return;
    }

    credentialActionPending.current = true;
    setLoadingLogin(true);
    try {
      const captchaToken = await captcha.requireToken();
      const res = await fetch('/api/auth/register-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: regName.trim(),
          termsAcceptance: termsAcceptance(acceptedTerms),
          email: regEmail.trim(),
          password: regPass,
          captchaToken
        })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        if (res.status === 409 && data.code === 'email_already_registered') {
          setRegisteredEmailError(regEmail.trim().toLowerCase());
          setVerificationPending(false);
          setVerificationEmail('');
          setVerificationCodeInput('');
          setSignupId('');
          setDevelopmentSignupCode('');
          setResendAvailableAt(0);
          registrationEmailRef.current?.focus();
          return;
        }
        if (res.status === 429 && verificationEmail === regEmail.trim().toLowerCase() && signupId) {
          startResendCountdown(Number(res.headers.get('Retry-After')) || EMAIL_CODE_RESEND_SECONDS);
          setResumedSignup(true);setRegPass('');setRegConfirmPass('');
          setVerificationPending(true);
        }
        throw new Error(data.error || 'Registration failed.');
      }

      setSignupId(data.signupId || '');
      setResumedSignup(data.resumed===true);
      if(data.resumed===true){setRegPass('');setRegConfirmPass('');}
      setDevelopmentSignupCode(data.developmentOnly ? data.developmentCode || '' : '');
      setVerificationCodeInput('');
      setVerificationError(null);
      setVerificationEmail(regEmail.trim().toLowerCase());
      startResendCountdown(data.retryAfter);
      setVerificationPending(true);
      triggerToast(data.developmentOnly ? 'Your temporary development code is ready.' : 'Check your email for your verification code.', 'success');
    } catch (err: any) {
      triggerToast(err.message || 'An error occurred during sign up.', 'error');
    } finally {
      credentialActionPending.current = false;
      captcha.reset();
      setLoadingLogin(false);
    }
  };

  const handleUnifiedVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (nativePreview) { setLoginError(NATIVE_PREVIEW_MESSAGE); return; }
    if (verificationActionPending.current) return;
    setVerificationError(null);
    const code = normalizeEmailOtp(verificationCodeInput);
    if (code === null) {
      setVerificationError('Enter the verification code from your email (6–10 digits).');
      return;
    }

    verificationActionPending.current = true;
    setVerifyingCode(true);
    try {
      const res = await fetch('/api/auth/verify-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: verificationEmail,
          termsAcceptance: termsAcceptance(acceptedTerms),
          code,
          signupId
        })
      });

      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data.error || 'Verification failed.');
      }

      // Automatically sign in the user
      const authenticatedUser = (data.user);
      if (!authenticatedUser) throw new Error('Verification did not return an active account. Please sign in again.');
      setSessionUser(authenticatedUser);
      triggerToast(data.user?.developmentOnly ? 'Signed in to your local development account.' : 'Account verified and logged in successfully!', 'success');

      // Clear state
      setVerificationPending(false);
      setVerificationCodeInput('');
      setSignupId('');
      setDevelopmentSignupCode('');
      setResendAvailableAt(0);
      setRegName('');
      setRegEmail('');
      setRegPass('');
      setRegConfirmPass('');

      if (NATIVE_APP) {
        navigate(nativeSignedInDestination(authenticatedUser, continuation), { replace: true });
        return;
      }

      setTimeout(() => {
        navigate(authenticatedUser.role === 'user' && continuation ? continuation : authenticatedUser.customerService ? '/customer-service' : '/student/dashboard', { replace: true });
      }, 800);
    } catch (err: any) {
      setVerificationError(err.message || 'Verification failed.');
    } finally {
      verificationActionPending.current = false;
      setVerifyingCode(false);
    }
  };

  const handleResendCode = async () => {
    if (nativePreview) { setLoginError(NATIVE_PREVIEW_MESSAGE); return; }
    if (verificationActionPending.current || resendAvailableAt > Date.now()) return;
    verificationActionPending.current = true;
    setResendingCode(true);
    try {
      const captchaToken = await captcha.requireToken();
      const res = await fetch('/api/auth/resend-unified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: verificationEmail, captchaToken }),
        signal: AbortSignal.timeout(30000),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        if (res.status === 429) startResendCountdown(Number(res.headers.get('Retry-After')) || EMAIL_CODE_RESEND_SECONDS);
        throw new Error(data.error || 'The code could not be resent. Please try again.');
      }
      startResendCountdown(data.retryAfter);
      setVerificationCodeInput('');
      setVerificationError(null);
      triggerToast(data.message || 'A new code has been requested. Check your inbox and spam folder.', 'success');
    } catch (err: any) {
      triggerToast(err.name === 'TimeoutError' ? 'The email request took too long. Please try again.' : err.message || 'The code could not be resent. Please try again.', 'error');
    } finally {
      captcha.reset();
      verificationActionPending.current = false;
      setResendingCode(false);
    }
  };

  // Student/Resident Key Verification Handler

  // Student/Resident Claim Room Key & Complete Onboarding Handler

  if (NATIVE_APP && verificationPending) return <NativeEmailVerification
    email={verificationEmail}
    code={verificationCodeInput}
    onCodeChange={value=>{setVerificationCodeInput(value);setVerificationError(null);}}
    codeError={verificationError||undefined}
    onSubmit={handleUnifiedVerifySubmit}
    onResend={handleResendCode}
    onBack={() => { setVerificationPending(false); setActiveTab('register'); }}
    verifying={verifyingCode}
    resending={resendingCode}
    resendSeconds={resendSeconds}
    resendReady={captcha.ready}
    captchaWidget={captcha.widget}
    developmentCode={developmentSignupCode}
    resumeNotice={resumedSignup?signupResumeNotice:undefined}
    feedback={toastMessage ? { message: toastMessage, type: toastType } : undefined}
  />;

  return (
    <div ref={motionRef} data-native-auth={NATIVE_APP || undefined} data-motion-active="false" data-portrait-state={portraitSource ? 'ready' : portraitFailed ? 'error' : 'loading'} className="unified-login page-canvas min-h-screen flex flex-col font-sans justify-between relative overflow-hidden">
      {!nativePreview && showPasswordRecovery && <EmailPasswordRecovery initialEmail={usernameOrEmail} onClose={() => setShowPasswordRecovery(false)} />}
      <div className="mobile-login-backdrop" aria-hidden="true">
        <img src={featureImage} srcSet={featureSources} sizes={featureSizes} alt="" width={1122} height={1402} loading="eager" fetchPriority="high" decoding="async" className="login-portrait" onLoad={revealPortrait} onError={() => setPortraitFailed(true)} />
      </div>
      <div className="mobile-login-photo" aria-hidden="true">
        <img src={featureImage} srcSet={featureSources} sizes={featureSizes} alt="" width={1122} height={1402} loading="eager" fetchPriority="high" decoding="async" className="login-portrait" onLoad={revealPortrait} onError={() => setPortraitFailed(true)} />
        {portraitSource && <ArtworkLayers variant="login" sourceUrl={portraitSource} />}
      </div>
      <WindDust />
      
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
        {NATIVE_APP ? <button type="button" aria-label="PineVela welcome" className="login-logo-link cursor-pointer" onClick={() => navigate('/login')}><PineLogo /></button> : installedApp ? <div className="login-logo-link"><PineLogo /></div> : <button type="button" aria-label="PineVela home" className="login-logo-link cursor-pointer" onClick={() => navigate('/')}>
          <PineLogo />
        </button>}
        <div className="login-header-actions flex items-center gap-2"><InstallAppButton /><HelpLink compact={NATIVE_APP} />
        {NATIVE_APP && <ThemeToggle showSystemDefault={false} />}
        {!installedApp && <div className="login-home-link">
          <button 
            onClick={() => navigate('/')}
            className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:bg-blue-50 flex items-center gap-1.5 bg-transparent px-3 py-1.5 rounded-lg transition-all"
          >
            <Home size={13} className="text-blue-700" />
            <span>Home</span>
          </button>
        </div>}
      </div>
      </header>

      {/* Main Container */}
      <main className="login-main flex-1 grid grid-cols-1 lg:grid-cols-12 items-center justify-center w-full px-5 sm:px-6 md:px-10 py-8 gap-8 lg:gap-12 z-10 max-w-[1380px] mx-auto">

        {/* Left side: feature image */}
        <div className="login-showcase-pane hide-scrollbar lg:col-span-6 hidden lg:flex flex-col items-stretch justify-center w-full lg:sticky lg:top-24 select-none">
          <div className="login-showcase-content space-y-7 flex flex-col justify-between w-full">
            <div className="login-feature-card relative aspect-[5/4] w-full rounded-3xl overflow-hidden">
              <img src={featureImage} srcSet={featureSources} sizes={featureSizes} alt="PineVela student marketplace" width={1122} height={1402} loading="eager" fetchPriority="high" decoding="async" onLoad={revealPortrait} onError={() => setPortraitFailed(true)} className="login-portrait absolute inset-0 w-full h-full object-contain" />
              {portraitSource && <ArtworkLayers variant="login" sourceUrl={portraitSource} />}
            </div>
            <div className="login-feature-description space-y-4 px-1">
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight"><PineWordmark /></h3>
              <p className="text-slate-650 text-sm sm:text-base leading-relaxed font-semibold">{featureDescription}</p>
            </div>

            {/* Design brand line divider */}
            <div className="pt-2 border-t border-slate-200/50" />
          </div>
        </div>

        {/* Right Side: Login & Signup Box */}
        <div className="login-form-pane hide-scrollbar lg:col-span-6 flex flex-col items-stretch justify-center w-full max-w-2xl mx-auto lg:max-w-none">
          <div ref={authScrollRef} role="region" aria-label={verificationPending ? 'Email verification' : activeTab === 'login' ? 'Login form' : 'Signup form'} tabIndex={0} data-active-tab={verificationPending ? 'verify' : activeTab} className="login-auth-card bg-blue-50/90 backdrop-blur-lg rounded-3xl border border-blue-200/70 shadow-2xl p-8 sm:p-10 space-y-6 relative overflow-hidden flex flex-col justify-between w-full">
            
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
                  >
                    Login
                  </span>
                ) : (
                  <span 
                    className="login-brand-heading text-black font-black"
                  >
                    {NATIVE_APP ? 'Create your account' : 'Sign Up'}
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
              <div data-active-tab={activeTab} className="login-mode-toggle flex bg-slate-100 p-1.5 rounded-2xl border border-slate-200/60">
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

            {verificationPending ? (
              /* Email Verification Screen */
              <form onSubmit={handleUnifiedVerifySubmit} className="login-motion-form onboarding-fields space-y-4 text-left py-1">
                <div className="text-center space-y-1">
                  <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-900 rounded-full flex items-center justify-center font-bold shadow-inner">
                    <ShieldCheck className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-black text-slate-800">{developmentSignupCode ? 'Development signup code' : 'Verify Your Email'}</h3>
                  <p className="text-[11px] text-slate-500">
                    {developmentSignupCode ? 'Enter the development code for' : 'Enter the verification code emailed to'} <span className="font-bold text-blue-900">{verificationEmail}</span>
                  </p>
                </div>

                {developmentSignupCode && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-center">
                    <p className="text-[11px] font-semibold text-blue-900">Local development only · Email ownership is not verified</p>
                    <p className="my-2 font-mono text-xl font-black tracking-widest text-blue-900">{developmentSignupCode}</p>
                    <button type="button" onClick={() => setVerificationCodeInput(developmentSignupCode)} className="text-xs font-bold text-blue-900 underline cursor-pointer">Use this code</button>
                  </div>
                )}
                {resumedSignup&&<p role="status" data-signup-resume className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">{signupResumeNotice}</p>}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">{developmentSignupCode ? 'Development code' : 'Email verification code'}</label>
                  <input
                    type="text"
                    required
                    maxLength={64}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Email verification code"
                    aria-invalid={!!verificationError}
                    aria-describedby={verificationError?'signup-email-code-error':undefined}
                    value={verificationCodeInput}
                    onChange={(e) => {setVerificationCodeInput(e.target.value);setVerificationError(null);}}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white text-slate-800 font-mono text-sm transition-all"
                  />
                  {verificationError&&<p id="signup-email-code-error" data-signup-code-error role="alert" className="mt-1 text-xs leading-relaxed text-rose-700 dark:text-rose-200">{verificationError}</p>}
                </div>

                {!developmentSignupCode && <p className="text-[11px] text-slate-500 leading-relaxed">Use the full code from your latest verification email.</p>}

                <button
                  type="submit"
                  disabled={verifyingCode || resendingCode}
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

                {!developmentSignupCode && captcha.widget}
                <div className="login-verification-actions">
                  {!developmentSignupCode && (
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={resendingCode || verifyingCode || resendSeconds > 0 || !captcha.ready}
                      className="login-resend-code"
                    >
                      <RefreshCw size={14} aria-hidden="true" className={resendingCode ? 'animate-spin' : ''} />
                      <span>
                        {resendingCode ? 'Sending code…' : 'Resend code'}
                        {resendSeconds > 0 && <span className="login-resend-countdown">in {Math.floor(resendSeconds / 60)}:{String(resendSeconds % 60).padStart(2, '0')}</span>}
                      </span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={verifyingCode || resendingCode}
                    onClick={() => {
                      setVerificationPending(false);
                      setActiveTab('register');
                    }}
                    className="login-verification-back text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Back to registration
                  </button>
                </div>
              </form>
            ) : activeTab === 'login' ? (
              /* System Login Form */
              <form key="login" onSubmit={handleLoginSubmit} className="login-motion-form login-credentials-form space-y-4 text-left py-1">
                
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
                      onClick={() => nativePreview ? setLoginError(NATIVE_PREVIEW_MESSAGE) : setShowPasswordRecovery(true)}
                      disabled={nativePreview}
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

                {captcha.widget}
                <button
                  type="submit"
                  disabled={nativePreview || loadingLogin || !captcha.ready}
                  aria-busy={loadingLogin}
                  className="w-full py-3 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
                >
                  {loadingLogin ? (
                    <>
                      <RefreshCw aria-hidden="true" className="w-4 h-4 animate-spin" />
                      <span role="status" className="sr-only">Signing in…</span>
                    </>
                  ) : (
                    <>
                      <LogIn size={17} />
                      <span>Login</span>
                    </>
                  )}
                </button>

                {(location.state as {residentReleaseCompleted?:boolean}|null)?.residentReleaseCompleted && <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">Your room access has ended. Your verified identity, other portals and account history are retained. Sign in to continue.</p>}
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
              <form key="register" onSubmit={handleUnifiedRegisterSubmit} className="login-motion-form login-signup-form onboarding-fields space-y-3.5 text-left py-1">
                
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">Your Full Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <User size={16} />
                    </span>
                    <input aria-label="Your Full Name"
                      type="text"
                      required
                      autoComplete="name"
                      placeholder={NATIVE_APP ? 'Full name' : 'e.g. Oppong Manu Andy'}
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
                      ref={registrationEmailRef}
                      type="email"
                      required
                      autoComplete="email"
                      placeholder={NATIVE_APP ? 'Email address' : 'e.g. andy@example.com'}
                      value={regEmail}
                      aria-invalid={showRegisteredEmailError || undefined}
                      aria-describedby={showRegisteredEmailError ? 'signup-email-error' : undefined}
                      onChange={(e) => { setRegEmail(e.target.value); setRegisteredEmailError(null); }}
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
                      minLength={8}
                      maxLength={256}
                      aria-describedby="signup-password-requirements"
                      autoComplete="new-password"
                      placeholder={NATIVE_APP ? 'Password' : 'Min. 8 characters'}
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
                  <p id="signup-password-requirements" className="text-[11px] leading-relaxed text-slate-600">8+ characters with uppercase, lowercase, a number and a symbol.</p>
                  <PasswordStrengthGauge password={regPass} requirementsMet={!signupPasswordError(regPass)} />

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
                      autoComplete="new-password"
                      placeholder={NATIVE_APP ? 'Confirm password' : 'Repeat password'}
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
                  <PasswordStrengthGauge password={regConfirmPass} requirementsMet={!signupPasswordError(regConfirmPass)} />
                </div>

                <TermsAcceptanceControl checked={acceptedTerms} onChange={setAcceptedTerms} />
                {captcha.widget}
                <button
                  type="submit"
                  disabled={nativePreview || loadingLogin || !captcha.ready || !acceptedTerms}
                  className="w-full py-2.5 bg-blue-900 hover:bg-blue-850 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-1 disabled:opacity-50"
                >
                  {loadingLogin ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Sending Code...</span>
                    </>
                  ) : (
                    <span>{NATIVE_APP ? 'Create account' : 'Create a free account'}</span>
                  )}
                </button>

                {showRegisteredEmailError && (
                  <div role="alert" className="login-registration-error">
                    <AlertCircle size={16} aria-hidden="true" />
                    <p id="signup-email-error">This email is already registered. Please sign in.</p>
                    <button type="button" onClick={() => {
                      setUsernameOrEmail(regEmail.trim());
                      setPassword('');
                      setLoginError(null);
                      setRegisteredEmailError(null);
                      setActiveTab('login');
                    }}>Sign in</button>
                  </div>
                )}

              </form>
            )}

            {!verificationPending && <GoogleAuthButton disabled={nativePreview} acceptedTerms={acceptedTerms} returnTo={continuation} mode={activeTab === 'register' ? 'signup' : 'login'} onError={setLoginError} />}
            {activeTab === 'register' && !verificationPending && loginError && <p role="alert" className="text-xs font-semibold text-rose-800">{loginError}</p>}

          </div>

        </div>

      </main>

      {/* Footer - Fixed Clean Base */}
      <footer className="login-footer text-center py-4 text-[10px] text-slate-400 bg-transparent shrink-0 z-20">
        <span>&copy; 2026 PineVela Residence Solutions.</span>
        <a href="/privacy.html">Privacy policy</a>
        <a href="/terms.html">Terms of service</a>
      </footer>

      {/* HOSTEL MANAGER REGISTRATION WIZARD */}

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
      {!nativePreview && showStudentKeyModal && <SupabaseResidentActivation name={user?.name} phone={user?.phone} onClose={() => setShowStudentKeyModal(false)} onActivated={() => undefined} />}

    </div>
  );
}
