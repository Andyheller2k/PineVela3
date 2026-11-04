import { ArrowLeft, Mail, RefreshCw } from 'lucide-react';
import { useEffect, useId, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { normalizeEmailOtp } from '../../emailOtp';
import PineLogo from '../components/PineLogo';
import ThemeToggle from '../components/ThemeToggle';
import { formatOtpInput, otpBoxCount } from './otpInput';
import './emailVerification.css';

type Props = {
  email: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (event: FormEvent) => void;
  onResend: () => void;
  onBack: () => void;
  verifying: boolean;
  resending: boolean;
  resendSeconds: number;
  resendReady: boolean;
  captchaWidget: ReactNode;
  developmentCode?: string;
  resumeNotice?: string;
  codeError?: string;
  feedback?: { message: string; type: 'success' | 'error' | 'info' };
};

/** One real input keeps paste, numeric keyboards, autofill and screen readers
 * working as a single code; the separate square cells are presentation only. */
export default function NativeEmailVerification({ email, code, onCodeChange, onSubmit, onResend, onBack,
  verifying, resending, resendSeconds, resendReady, captchaWidget, developmentCode, resumeNotice, codeError, feedback }: Props) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [focused, setFocused] = useState(false);
  const [selection, setSelection] = useState(code.length);
  const count = otpBoxCount(code);
  const busy = verifying || resending;
  const remaining = `${Math.floor(resendSeconds / 60)}:${String(resendSeconds % 60).padStart(2, '0')}`;
  useEffect(() => { heading.current?.focus(); }, []);

  return <main className="native-email-verification" data-native-email-verification>
    <header className="native-verification-header">
      <button type="button" data-native-otp-back onClick={onBack} disabled={busy} className="native-verification-back">
        <ArrowLeft size={18} aria-hidden="true" /><span>Go back</span>
      </button>
      <ThemeToggle showSystemDefault={false} className="native-verification-theme" />
    </header>

    <section className="native-verification-content" aria-labelledby={`${inputId}-heading`}>
      <div className="native-verification-brand"><PineLogo size={42} /></div>
      <div className="native-verification-intro">
        <div className="native-verification-mail" aria-hidden="true"><Mail size={26} strokeWidth={1.7} /></div>
        <h1 ref={heading} id={`${inputId}-heading`} tabIndex={-1}>{developmentCode ? 'Development signup code' : 'Check your email'}</h1>
        <p>{developmentCode ? 'Use the local development code for' : 'We’ve sent a verification code to'}<strong>{email}</strong></p>
      </div>

      <form className="native-verification-form" onSubmit={onSubmit} aria-busy={busy}>
        {resumeNotice&&<p role="status" data-signup-resume className="native-verification-feedback" data-kind="info">{resumeNotice}</p>}
        {developmentCode && <div className="native-verification-development">
          <p>Local development only · Email ownership is not verified</p>
          <code>{developmentCode}</code>
          <button type="button" onClick={() => { onCodeChange(developmentCode); input.current?.focus(); }} disabled={busy}>Use this code</button>
        </div>}

        <label className="native-verification-sr" htmlFor={inputId}>{developmentCode ? 'Development code' : 'Email verification code'}</label>
        <div className="native-otp-entry" data-focused={focused} data-box-count={count} style={{ '--otp-boxes': count } as CSSProperties}>
          <div className="native-otp-boxes" aria-hidden="true">
            {Array.from({ length: count }, (_, index) => <span key={index} data-native-otp-box data-active={focused && index === Math.min(selection, count - 1)} data-filled={Boolean(code[index])}>{code[index] || ''}</span>)}
          </div>
          <input ref={input} id={inputId} data-native-otp-input type="text" inputMode="numeric" autoComplete="one-time-code"
            enterKeyHint="done" pattern="[0-9]{6,10}" maxLength={10} required disabled={busy} value={code}
            aria-invalid={!!codeError} aria-describedby={`${inputId}-hint${codeError?` ${inputId}-error`:''}`} spellCheck={false} autoCapitalize="none" autoCorrect="off"
            onFocus={event => { setFocused(true); setSelection(event.currentTarget.selectionStart ?? code.length); }}
            onBlur={() => setFocused(false)} onSelect={event => setSelection(event.currentTarget.selectionStart ?? code.length)}
            onChange={event => { const next = formatOtpInput(event.target.value); onCodeChange(next); setSelection(next.length); }}
            onPaste={event => { event.preventDefault(); const next = formatOtpInput(event.clipboardData.getData('text')); onCodeChange(next); setSelection(next.length); }}
          />
        </div>
        {codeError&&<p id={`${inputId}-error`} data-signup-code-error role="alert" className="native-verification-feedback" data-kind="error">{codeError}</p>}
        <p id={`${inputId}-hint`} className="native-verification-hint">Enter the full 6–10 digit code from your latest email.</p>

        {feedback && <p className="native-verification-feedback" data-kind={feedback.type} role={feedback.type === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}

        {!developmentCode && <p className="native-verification-countdown" role="timer" aria-live="off">
          {resendSeconds > 0 ? <>Resend available in <strong>{remaining}</strong></> : 'You can request another code if it hasn’t arrived.'}
        </p>}

        <button type="submit" className="native-verification-verify" data-native-otp-verify disabled={busy || normalizeEmailOtp(code) === null}>
          {verifying && <RefreshCw size={17} aria-hidden="true" className="native-verification-spin" />}
          {verifying ? 'Verifying…' : developmentCode ? 'Continue in development' : 'Verify'}
        </button>

        {!developmentCode && <>
          <button type="button" className="native-verification-resend" data-native-otp-resend onClick={onResend} disabled={busy || resendSeconds > 0 || !resendReady}>
            {resending && <RefreshCw size={17} aria-hidden="true" className="native-verification-spin" />}
            {resending ? 'Sending…' : 'Send again'}
          </button>
          <div className="native-verification-security">{captchaWidget}</div>
        </>}
      </form>
      <p className="native-verification-help">Can’t find the email? Check your spam folder or go back to check your email address.</p>
    </section>
  </main>;
}
