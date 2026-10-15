import { useEffect, useRef, useState, type FormEvent } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import AccountStatusDialog from './AccountStatusDialog';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { usesSupabasePersistence } from '../lib/persistence';
import EmailPasswordRecovery from './EmailPasswordRecovery';
import ManagerClosureRequest from './ManagerClosureRequest';

/** Self-service controls are available only inside the authenticated manager account. */
export default function ManagerAccountControls({ onClose }: { onClose: () => void }) {
  const { user, apiFetch, logout } = useAuth();
  const navigate = useNavigate();
  const [action, setAction] = useState<'password' | 'delete'>('password');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [requestBypass, setRequestBypass] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showRecovery, setShowRecovery] = useState(false);
  const inFlight = useRef(false);
  const account = useRef(user?.id);
  account.current = user?.id;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  if (user?.role !== 'manager') return null;

  const finish = async () => { if (await logout()) navigate('/login', { replace: true }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (usesSupabasePersistence && action === 'delete') return;
    if (inFlight.current) return;
    setError('');
    if (action === 'password' && newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    if (action === 'delete' && !confirmed) { setError('Confirm account deletion before continuing.'); return; }
    inFlight.current = true; setSaving(true);
    const submittedAccount = user.id;
    try {
      const result = action === 'password' ? await apiFetch('/api/auth/change-password', {
        method: 'POST', headers: usesSupabasePersistence ? { 'X-PineVela-Profile-Context': submittedAccount } : undefined, body: JSON.stringify({ currentPassword, newPassword }),
      }) : await apiFetch('/api/users/delete-registered-account', {
        method: 'POST', body: JSON.stringify({ role: 'manager', email: user.email, password: currentPassword, confirm: true, deletionReason: requestBypass ? reason.trim() : '' }),
      });
      if (!mounted.current || account.current !== submittedAccount) return;
      if (!result?.success) throw new Error('The account change was not confirmed. Please try again.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setCompleted(true);
      await finish();
    } catch (error) { setError(error instanceof Error ? error.message : 'The account change failed.'); }
    finally { inFlight.current = false; setSaving(false); }
  };

  if (showRecovery) return <EmailPasswordRecovery initialEmail={user.email} onClose={() => setShowRecovery(false)} />;
  if (usesSupabasePersistence && action === 'delete') return <ManagerClosureRequest onClose={onClose} />;
  return <AccountStatusDialog title="Manager Account Security" onClose={() => { if (!saving) onClose(); }}>
    {completed ? <div className="space-y-4 p-3"><p>Your account change is complete. Sign in again to continue.</p><button type="button" onClick={() => void finish()} className="rounded-xl bg-blue-600 px-4 py-3 text-white">Continue to Login</button></div> :
      <div className="space-y-5 p-2 sm:p-4">
        <p className="break-all text-sm text-slate-600">{user.email}</p>
        {usesSupabasePersistence && action === 'password' && <div className="space-y-2 text-sm text-slate-600"><p>Update this verified email identity’s PineVela password. Your Google password stays unchanged. You will need to sign in again.</p><button type="button" disabled={saving} onClick={() => setShowRecovery(true)} className="rounded-xl border border-blue-200 px-4 py-3 font-bold text-blue-800">Recover email password</button></div>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={saving} aria-pressed={action === 'password'} onClick={() => { setAction('password'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800"><KeyRound className="h-4 w-4" />Reset Password</button>
          <button type="button" disabled={saving} aria-pressed={action === 'delete'} onClick={() => { setAction('delete'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"><Trash2 className="h-4 w-4" />{usesSupabasePersistence ? 'Request account closure' : 'Delete Account & Restart Registration'}</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-xs font-bold text-slate-800">Current Manager Password
            <input type="password" autoComplete="current-password" required disabled={saving} maxLength={256} value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
          </label>
          {action === 'password' ? <>
            <label className="block space-y-2 text-xs font-bold text-slate-800">New Password
              <input type="password" autoComplete="new-password" required disabled={saving} minLength={usesSupabasePersistence ? 8 : 6} maxLength={256} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
            </label>
            <PasswordStrengthGauge password={newPassword} />
            <label className="block space-y-2 text-xs font-bold text-slate-800">Confirm New Password
              <input type="password" autoComplete="new-password" required disabled={saving} minLength={usesSupabasePersistence ? 8 : 6} maxLength={256} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
            </label>
          </> : <div className="space-y-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900">
            <p>Deleting your manager account removes its registration and related residence records. The existing 30-day registration restriction applies.</p>
            <label className="flex items-start gap-2"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm that I want to delete my manager account.</label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={requestBypass} onChange={e => setRequestBypass(e.target.checked)} />Request administrator approval to waive the 30-day restriction.</label>
            {requestBypass && <label className="block space-y-2">Reason for deletion and restarting registration<textarea required value={reason} onChange={e => setReason(e.target.value)} className="block w-full rounded-xl border border-rose-200 bg-white p-3" /></label>}
          </div>}
          {error && <p role="alert" className="text-sm font-semibold text-rose-700">{error}</p>}
          <button type="submit" disabled={saving} className={`rounded-xl px-5 py-3 text-xs font-bold text-white disabled:opacity-60 ${action === 'delete' ? 'bg-rose-600' : 'bg-blue-600'}`}>{saving ? 'Saving…' : action === 'delete' ? 'Delete Manager Account' : 'Update Password'}</button>
        </form>
      </div>}
  </AccountStatusDialog>;
}
