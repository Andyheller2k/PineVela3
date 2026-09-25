import React, { useState } from 'react';
import PineLogo from './PineLogo';
import { Mail, Key, Eye, EyeOff, ShieldCheck, MailOpen, ArrowLeft, RefreshCw } from 'lucide-react';

interface Page3StudentLoginProps {
  currentScreen: 'student-login' | 'student-submitted';
  onNavigate: (screen: 'public-browse' | 'student-login' | 'student-submitted' | 'student-dashboard') => void;
}

export default function Page3StudentLogin({ currentScreen, onNavigate }: Page3StudentLoginProps) {
  const [studentId, setStudentId] = useState('STU-2024-8842');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [hasAccessCode, setHasAccessCode] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  
  // Toast notifications for interactive buttons
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      triggerToast('Please fill in your Student ID');
      return;
    }
    // Route to dashboard
    onNavigate('student-dashboard');
  };

  const handleSelfRegister = () => {
    // Navigate to Page 4: Registration Submitted
    onNavigate('student-submitted');
  };

  if (currentScreen === 'student-submitted') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col font-sans relative">
        {/* Floating Toast Notification */}
        {toastMessage && (
          <div className="fixed top-5 right-5 bg-emerald-600 text-white font-bold text-xs px-4 py-3 rounded-xl shadow-xl z-50 flex items-center gap-2 animate-fade-in">
            <span>✓</span>
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Global Nav */}
        <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => onNavigate('public-browse')}>
            <PineLogo />
          </div>
          <div className="flex items-center gap-6 text-sm font-medium text-slate-600">
            <span>Student / Manager</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-400 hover:text-slate-600 cursor-pointer">❓</span>
            <span className="text-slate-400 hover:text-slate-600 cursor-pointer">🔔</span>
          </div>
        </header>

        {/* Content Container */}
        <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-12">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl overflow-hidden p-8 md:p-12 text-center space-y-8 relative">
            
            {/* Top decorative circle backdrop */}
            <div className="absolute top-0 right-0 w-44 h-44 bg-amber-50 rounded-full blur-2xl -z-10" />

            {/* Verification Icon */}
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-emerald-50 border-4 border-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm">
                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            {/* Hero Text */}
            <div className="space-y-3">
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">Registration Submitted</h1>
              <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
                Thank you, Alex! Your account has been created. Please <span className="font-extrabold text-blue-900">verify your email</span> to complete the process.
              </p>
            </div>

            {/* Submission Summary Card */}
            <div className="bg-slate-50 rounded-2xl border border-slate-150 p-6 text-left space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck size={14} className="text-slate-400" />
                Submission Summary
              </h3>

              <div className="space-y-3 divide-y divide-slate-100 text-sm">
                <div className="flex justify-between items-center py-2">
                  <span className="text-slate-500 text-xs">👤 Full Name</span>
                  <span className="font-bold text-slate-800">Alex Thompson</span>
                </div>
                <div className="flex justify-between items-center py-2 pt-3">
                  <span className="text-slate-500 text-xs">💳 Student ID</span>
                  <span className="font-mono font-bold text-slate-800">STU-2024-8842</span>
                </div>
                <div className="flex justify-between items-center py-2 pt-3">
                  <span className="text-slate-500 text-xs">✉️ Institution Email</span>
                  <span className="font-medium text-slate-800">a.thompson@university.edu.gh</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 pt-3 border-t border-slate-100">
                <span>Submitted on October 24, 2026</span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Processing Application
                </span>
              </div>
            </div>

            {/* Email Verification Box Mockup */}
            <div className="text-left space-y-3">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <MailOpen size={16} className="text-amber-500" />
                Next Steps
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                We've sent a verification link to your university email. Clicking this link will activate your PineVela account and allow you to access the student portal.
              </p>

              {/* simulated email app */}
              <div className="bg-slate-100 rounded-xl border border-slate-200 overflow-hidden font-mono text-[11px] mt-2">
                <div className="bg-slate-200 px-3 py-1.5 flex items-center justify-between border-b border-slate-300">
                  <div className="flex gap-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400" />
                  </div>
                  <span className="text-slate-500 text-[10px]">verification_mail_preview.msg</span>
                  <div className="w-10" />
                </div>
                <div className="p-3 space-y-2 bg-white text-slate-600">
                  <p><span className="font-bold text-slate-400">From:</span> noreply@pinevela.com</p>
                  <p><span className="font-bold text-slate-400">Subject:</span> Verify your PineVela Student Registration</p>
                  <div className="border-t border-slate-100 my-2" />
                  <div className="h-2 w-3/4 bg-slate-100 rounded" />
                  <div className="h-2 w-1/2 bg-slate-100 rounded" />
                  <div className="py-2">
                    <button
                      onClick={() => triggerToast('Email verified! You can now log in.')}
                      className="px-4 py-1.5 bg-amber-400 hover:bg-amber-500 text-slate-900 font-bold rounded-lg text-[10px] transition-colors"
                    >
                      Verify Email Address
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Help Note Box */}
            <div className="bg-amber-50/50 border border-amber-100 rounded-xl p-4 text-left flex gap-3 text-xs text-slate-600">
              <span className="text-lg">💡</span>
              <p className="leading-relaxed">
                <span className="font-bold text-slate-700">Didn't receive the email?</span> Please check your spam folder or wait 2-5 minutes. If it still doesn't arrive, contact our support at <span className="font-bold text-blue-900">support@pinevela.com</span>.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
              <button
                onClick={() => onNavigate('public-browse')}
                className="py-3 px-6 bg-blue-900 hover:bg-blue-850 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-900/10 transition-colors"
              >
                <ArrowLeft size={14} />
                <span>Back to Dashboard</span>
              </button>
              <button
                onClick={() => triggerToast('A new verification email has been sent to a.thompson@university.edu.gh')}
                className="py-3 px-6 border-2 border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <RefreshCw size={14} />
                <span>Resend Email</span>
              </button>
            </div>

          </div>

          <div className="flex items-center justify-center gap-8 text-[11px] text-slate-400 font-semibold uppercase tracking-wider py-8">
            <span className="flex items-center gap-1">🛡️ Secure Enrollment</span>
            <span>|</span>
            <span className="flex items-center gap-1">✓ Certified</span>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white py-6 px-6 text-xs text-slate-400 mt-auto">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
            <span>© 2026 PineVela. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="#" className="hover:text-slate-600">Privacy Policy</a>
              <a href="#" className="hover:text-slate-600">Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ELSE: PAGE 3 (STUDENT LOGIN)
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans justify-between">
      {/* Toast */}
      {toastMessage && (
        <div className="fixed top-5 right-5 bg-amber-500 text-slate-950 font-extrabold text-xs px-4 py-3 rounded-xl shadow-xl z-50 animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Spacer or very thin branding bar at top */}
      <div className="w-full h-[2px] bg-blue-600" />

      {/* Main Form Box */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full space-y-8">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-xl p-8 space-y-6 text-center">
            
            {/* Logo */}
            <div className="flex justify-center">
              <PineLogo size={56} hideText={true} />
            </div>

            {/* Header */}
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Student Login</h1>
              <p className="text-xs text-slate-400 font-medium mt-1">Access your accommodation portal</p>
            </div>

            {/* Form */}
            <form onSubmit={handleLogin} className="space-y-4 text-left">
              
              {/* Student ID */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 block">Student ID Number</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <Mail size={16} />
                  </span>
                  <input
                    type="text"
                    required
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    placeholder="e.g. STU-2024-001"
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-slate-50 text-slate-800 text-sm transition-all font-mono"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-700">Password</label>
                  <a href="#" onClick={(e) => { e.preventDefault(); triggerToast('Password recovery code sent!'); }} className="text-xs font-extrabold text-blue-900 hover:underline">Forgot password?</a>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400 pointer-events-none">
                    <Key size={16} />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-slate-50 text-slate-800 text-sm transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Access Code Checkbox */}
              <div className="pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hasAccessCode}
                    onChange={(e) => setHasAccessCode(e.target.checked)}
                    className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 w-4 h-4"
                  />
                  <span className="text-xs font-semibold text-slate-600 select-none">I have a one-time Room Access Code</span>
                </label>
              </div>

              {hasAccessCode && (
                <div className="space-y-1.5 animate-fade-in">
                  <label className="text-xs font-bold text-slate-700 block">One-time Access Code</label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="Enter 6-digit access code"
                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-900 focus:border-transparent bg-slate-50 text-slate-800 text-sm tracking-widest text-center font-bold"
                  />
                </div>
              )}

              {/* Sign In Button */}
              <button
                type="submit"
                className="w-full py-3 px-4 bg-blue-900 hover:bg-blue-850 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-900/10 transition-colors"
              >
                Sign In
              </button>
            </form>

            {/* Note banner */}
            <div className="bg-amber-50/50 border border-amber-100/60 rounded-xl p-4 text-left flex gap-3 text-xs text-slate-600">
              <span className="text-lg">ℹ️</span>
              <p className="leading-relaxed">
                <span className="font-bold text-slate-700">Note:</span> Successful sign-in will securely route you to your personal <span className="font-extrabold text-blue-900">Room Information dashboard</span>. Ensure you are using your institution-issued Student ID.
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">
                New to PineVela?{' '}
                <button onClick={handleSelfRegister} className="font-black text-blue-900 hover:underline">
                  Self-Register Here
                </button>
              </p>
            </div>

          </div>

          {/* Security and trouble footnotes */}
          <div className="text-center space-y-2 text-[10px] text-slate-400">
            <p>Security Notice: PineVela uses industry-standard encryption to protect your data.</p>
            <p>
              Having trouble logging in? Contact{' '}
              <a href="mailto:support@pinevela.host" className="text-slate-500 font-semibold hover:underline">
                support@pinevela.host
              </a>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-4 px-6 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <span>© 2026 PineVela. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-600">Privacy Policy</a>
            <a href="#" className="hover:text-slate-600">Terms of Service</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
