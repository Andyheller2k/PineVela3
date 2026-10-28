import { KeyRound,Trash2 } from 'lucide-react';
import { useEffect,useRef,useState,type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AccountStatusDialog from './AccountStatusDialog';
import PasswordStrengthGauge from './PasswordStrengthGauge';

import EmailPasswordRecovery from './EmailPasswordRecovery';
import ManagerClosureRequest from './ManagerClosureRequest';
import { useAuthCaptcha } from './AuthCaptcha';

/** Self-service controls are available only inside the authenticated manager account. */
export default function ManagerAccountControls({ onClose }: { onClose: () => void }) {
  const { user, apiFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<'password' | 'delete'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');


  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const inFlight = useRef(false);
  const account = useRef(user?.id);
  account.current = user?.id;
  const mounted = useRef(true);
  const captcha = useAuthCaptcha(`manager-password:${user?.id}`, user?.role === 'manager' && action === 'password' && !showRecovery && !completed);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (user?.role !== 'manager') return null;

  const finish = async () => { if (await logout()) navigate('/login', { replace: true }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((action === 'delete')) return;
    if (inFlight.current) return;
    setError('');
    if ((newPassword !== confirmPassword)) { setError('New passwords do not match.'); return; }

    inFlight.current = true; setSaving(true);
    const submittedAccount = user.id;
    try {
      const captchaToken = await captcha.requireToken();
      if (!mounted.current || account.current !== submittedAccount) return;
      const result = (await apiFetch('/api/auth/change-password', {
        method: 'POST', headers: ({ 'X-PineVela-Profile-Context': submittedAccount }), body: JSON.stringify({ currentPassword, newPassword, captchaToken }),
      }));
      if (!mounted.current || account.current !== submittedAccount) return;
      if (!result?.success) throw new Error('The account change was not confirmed. Please try again.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setCompleted(true);
      await finish();
    } catch (error) { setError(error instanceof Error ? error.message : 'The account change failed.'); }
    finally { captcha.reset(); inFlight.current = false; setSaving(false); }
  };

  if (showRecovery) return <EmailPasswordRecovery initialEmail={user.email} onClose={() => setShowRecovery(false)} />;
  if ((action === 'delete')) return <ManagerClosureRequest onClose={onClose} />;
  return <AccountStatusDialog title="Manager Account Security" onClose={() => { if (!saving) onClose(); }}>
    {completed ? <div className="space-y-4 p-3"><p>Your account change is complete. Sign in again to continue.</p><button type="button" onClick={() => void finish()} className="rounded-xl bg-blue-600 px-4 py-3 text-white">Continue to Login</button></div> :
      <div className="space-y-5 p-2 sm:p-4">
        <p className="break-all text-sm text-slate-600">{user.email}</p>
        {(<div className="space-y-2 text-sm text-slate-600"><p>Update this verified email identity’s PineVela password. Your Google password stays unchanged. You will need to sign in again.</p><button type="button" disabled={saving} onClick={() => setShowRecovery(true)} className="rounded-xl border border-blue-200 px-4 py-3 font-bold text-blue-800">Recover email password</button></div>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} aria-pressed={true} onClick={() => { setAction('password'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800"><KeyRound className="h-4 w-4" />Reset Password</button>
          <button type="button" disabled={saving} aria-pressed={false} onClick={() => { setAction('delete'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"><Trash2 className="h-4 w-4" />{('Request account closure')}</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-xs font-bold text-slate-800">Current Manager Password
            <input type="password" autoComplete="current-password" required disabled={saving} maxLength={256} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
          </label>
          {(<>
            <label className="block space-y-2 text-xs font-bold text-slate-800">New Password
              <input type="password" autoComplete="new-password" required disabled={saving} minLength={(8)} maxLength={256} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
            </label>
            <PasswordStrengthGauge password={newPassword} />
            <label className="block space-y-2 text-xs font-bold text-slate-800">Confirm New Password
              <input type="password" autoComplete="new-password" required disabled={saving} minLength={(8)} maxLength={256} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
            </label>
          </>)}
          {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
          {captcha.widget}
          <button type="submit" disabled={saving || !captcha.ready} className={`rounded-xl px-5 py-3 text-xs font-bold text-white disabled:opacity-60 ${('bg-blue-600')}`}>{saving ? 'Saving…' : ('Update Password')}</button>
        </form>
      </div>}
  </AccountStatusDialog>;
}
