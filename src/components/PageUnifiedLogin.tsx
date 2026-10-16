import DashboardOverlay from './DashboardOverlay';

import { AlertCircle,ArrowRight,Building,CheckCircle,CheckCircle2,Clock,Eye,EyeOff,HelpCircle,Home,Info,Key,Lock,LogIn,Mail,Phone,RefreshCw,ShieldAlert,ShieldCheck,User,X } from 'lucide-react';
import React,{ useEffect,useState } from 'react';
import { useLocation,useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';
import { routePopupFeedback } from '../lib/feedback';
import { loginContinuation } from '../lib/publicContinuation';
import { sessionFetch as fetch } from '../lib/session';
import {
cleanPhoneNumber,
validateEmail,
validatePhone
} from '../utils/formValidation';
import EmailPasswordRecovery from './EmailPasswordRecovery';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import PineLogo, { PineWordmark } from './PineLogo';
import SupabaseResidentActivation from './SupabaseResidentActivation';

// Static asset imports
import marketImg from '../../assets/login-market.png';
import '../login.css';
import GoogleAuthButton from './GoogleAuthButton';
import WindDust from './WindDust';

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

  // Resident Digital Key Onboarding states
  const [showStudentKeyModal, setShowStudentKeyModal] = useState(false);

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
    if (params.get('mode') === 'onboard' || params.get('mode') === 'claim' || params.get('verify_room_key') === 'true' || (location.state as any)?.mode === 'onboard') {
      setShowStudentKeyModal(true);
    }
  }, [location]);

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
      const authenticatedUser = (data.user);
      if (!authenticatedUser) throw new Error('Verification did not return an active account. Please sign in again.');
      setSessionUser(authenticatedUser);
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

  // Student/Resident Claim Room Key & Complete Onboarding Handler

  return (
    <div className="unified-login page-canvas min-h-screen flex flex-col font-sans justify-between relative overflow-hidden">
      {(showPasswordRecovery) && <EmailPasswordRecovery initialEmail={usernameOrEmail} onClose={() => setShowPasswordRecovery(false)} />}
      <div className="mobile-login-backdrop" aria-hidden="true">
        <img src={featureImage} alt="" />
      </div>
      <div className="mobile-login-photo" aria-hidden="true">
        <img src={featureImage} alt="" />
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
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight"><PineWordmark /></h3>
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
                  >
                    Login
                  </span>
                ) : (
                  <span 
                    className="login-brand-heading text-black font-black"
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
              <form onSubmit={handleLoginSubmit} className="login-credentials-form space-y-4 text-left py-1">
                
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
                      onClick={() => (setShowPasswordRecovery(true))}
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
              <form onSubmit={handleUnifiedRegisterSubmit} className="login-signup-form onboarding-fields space-y-3.5 text-left py-1">
                
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
      {showStudentKeyModal && true && <SupabaseResidentActivation name={user?.name} phone={user?.phone} onClose={() => setShowStudentKeyModal(false)} onActivated={() => undefined} />}

    </div>
  );
}
