import { useRef, useState, type FormEvent } from 'react';
import AccountStatusDialog from './AccountStatusDialog';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import { sessionFetch } from '../lib/session';
import { useAuthCaptcha } from './AuthCaptcha';

/** Email proof changes only the verified identity's password, never portal access. */
export default function EmailPasswordRecovery({ onClose, initialEmail = '' }: { onClose: () => void; initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  const captcha = useAuthCaptcha('password-recovery', !sent && !complete);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (inFlight.current) return;
    setError('');
    if (sent && password !== confirmation) { setError('New passwords do not match.'); return; }
    inFlight.current = true; setBusy(true);
    try {
      const response = await sessionFetch(sent ? '/api/auth/recover/complete' : '/api/auth/recover', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent ? { email: email.trim(), code: code.trim(), newPassword: password } : { email: email.trim(), captchaToken: await captcha.requireToken() }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Email recovery could not complete.');
      if (sent) { setComplete(true); setCode(''); setPassword(''); setConfirmation(''); }
      else setSent(true);
    } catch (error) { setError(error instanceof Error ? error.message : 'Email recovery could not complete.'); }
    finally { captcha.reset(); inFlight.current = false; setBusy(false); }
  };
  return <AccountStatusDialog title="Recover email password" onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4 p-2 sm:p-4" aria-busy={busy}>
      {complete ? <><p role="status">Your PineVela email password has been updated. Sign in again with the new password and your portal PIN, if required.</p>
        <button type="button" onClick={onClose} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white">Return to sign in</button></> : <>
        <p className="text-sm text-slate-600">Use your account’s verified email address. This changes your PineVela email password, including any portals sharing that email. Your Google password and portal PINs stay unchanged.</p>
        {sent && <p role="status" className="text-sm text-blue-800">If an account exists for this email, a recovery code has been requested. Enter the full code from your latest email, then choose and confirm your new password.</p>}
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={busy} className="space-y-4">
            <label className="block space-y-2 text-sm font-bold">Verified account email<input type="email" autoComplete="email" required maxLength={254} readOnly={sent} value={email} onChange={e => setEmail(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" /></label>
            {sent && <>
              <label className="block space-y-2 text-sm font-bold">Recovery code<input type="text" inputMode="numeric" autoComplete="one-time-code" required minLength={6} maxLength={10} pattern="[0-9]{6,10}" title="Enter the full 6–10 digit recovery code from your latest email." value={code} onChange={e => setCode(e.target.value.replace(/\s+/gu, ''))} onPaste={event => {
                const pastedCode = event.clipboardData.getData('text').replace(/\s+/gu, '');
                if (/^[0-9]{6,10}$/.test(pastedCode)) { event.preventDefault(); setCode(pastedCode); }
              }} className="block w-full rounded-xl border border-slate-200 p-3" /></label>
              <label className="block space-y-2 text-sm font-bold">New email password<input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={password} onChange={e => setPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" /></label>
              <PasswordStrengthGauge password={password} />
              <label className="block space-y-2 text-sm font-bold">Confirm new email password<input type="password" autoComplete="new-password" required minLength={8} maxLength={256} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" /></label>
            </>}
            {captcha.widget}
            <button type="submit" disabled={!sent && !captcha.ready} className="rounded-xl bg-blue-700 px-5 py-3 font-bold text-white disabled:opacity-60">{busy ? 'Please wait…' : sent ? 'Update email password' : 'Send recovery code'}</button>
            {sent && <button type="button" onClick={() => { setSent(false); setCode(''); setPassword(''); setConfirmation(''); setError(''); }} className="ml-3 rounded-xl border border-blue-200 px-4 py-3 text-sm font-bold text-blue-800">Request a new code</button>}
          </fieldset>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        </form>
      </>}
    </div>
  </AccountStatusDialog>;
}
