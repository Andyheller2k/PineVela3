import { useRef, useState, type FormEvent } from 'react';
import AccountStatusDialog from './AccountStatusDialog';
import type { AuthenticatedUser } from '../context/AuthContext';
import { useAuthCaptcha } from './AuthCaptcha';

export default function PrimaryEmailReentry({ initialEmail = '', onClose, onReopened }: {
  initialEmail?: string; onClose: () => void; onReopened: (user: AuthenticatedUser) => void;
}) {
  const [email, setEmail] = useState(initialEmail), [code, setCode] = useState('');
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const inFlight = useRef(false);
  const captcha = useAuthCaptcha('primary-reentry', !sent);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try {
      const response = await fetch(sent ? '/api/auth/primary-reentry/verify' : '/api/auth/primary-reentry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent ? { email: email.trim(), code: code.trim() } : { email: email.trim(), captchaToken: await captcha.requireToken() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Your primary account could not reopen.');
      if (sent) {
        if (!result.user || result.user.role !== 'user') throw new Error('Confirmation did not return your primary account.');
        setCode(''); onReopened(result.user);
      } else setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Your primary account could not reopen.'); }
    finally { captcha.reset(); inFlight.current = false; setBusy(false); }
  };
  return <AccountStatusDialog title="Reopen primary account" onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4 p-2 sm:p-4" aria-busy={busy}>
      <p className="text-sm text-[var(--pv-muted)]">Use the same verified email as your primary account closed after a reviewed system wipe. Your account history remains. Closed residences, stores and other portals require their own registration.</p>
      {sent && <p role="status" className="text-sm text-[var(--pv-heading)]">If this email has an eligible closed primary account, a sign-in email has been requested. Copy its code or unopened link below. Request another email if you already opened the link.</p>}
      <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block space-y-2 text-sm font-bold">Verified primary email<input type="email" autoComplete="email" required maxLength={254} readOnly={sent} value={email} onChange={e => setEmail(e.target.value)} className="block w-full rounded-xl border border-[var(--pv-edge)] bg-[var(--pv-panel)] p-3 text-[var(--pv-text)]" /></label>
          {sent && <label className="block space-y-2 text-sm font-bold">Sign-in code or unopened link<input type="password" autoComplete="off" required maxLength={4096} value={code} onChange={e => setCode(e.target.value)} className="block w-full rounded-xl border border-[var(--pv-edge)] bg-[var(--pv-panel)] p-3 text-[var(--pv-text)]" /></label>}
          {captcha.widget}
          <button type="submit" disabled={!sent && !captcha.ready} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? 'Please wait…' : sent ? 'Verify and reopen' : 'Send sign-in email'}</button>
          {sent && <button type="button" onClick={() => { setSent(false); setCode(''); setError(''); }} className="ml-3 min-h-11 rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold text-[var(--pv-heading)]">Request a new email</button>}
        </fieldset>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      </form>
    </div>
  </AccountStatusDialog>;
}
