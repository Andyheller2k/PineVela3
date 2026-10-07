import { useState, type FormEvent } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import AccountStatusDialog from './AccountStatusDialog';
import PasswordStrengthGauge from './PasswordStrengthGauge';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

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
  if (user?.role !== 'manager') return null;

  const finish = async () => { if (await logout()) navigate('/login', { replace: true }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (action === 'password' && newPassword !== confirmPassword) { setError('New passwords do not match.'); return; }
    if (action === 'delete' && !confirmed) { setError('Confirm account deletion before continuing.'); return; }
    setSaving(true);
    try {
      const result = action === 'password' ? await apiFetch('/api/auth/change-password', {
        method: 'POST', body: JSON.stringify({ currentPassword, newPassword }),
      }) : await apiFetch('/api/users/delete-registered-account', {
        method: 'POST', body: JSON.stringify({ role: 'manager', email: user.email, password: currentPassword, confirm: true, deletionReason: requestBypass ? reason.trim() : '' }),
      });
      if (!result?.success) throw new Error('The account change was not confirmed. Please try again.');
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      setCompleted(true);
      await finish();
    } catch (error) { setError(error instanceof Error ? error.message : 'The account change failed.'); }
    finally { setSaving(false); }
  };

  return <AccountStatusDialog title="Manager Account Security" onClose={onClose}>
    {completed ? <div className="space-y-4 p-3"><p>Your account change is complete. Sign in again to continue.</p><button type="button" onClick={() => void finish()} className="rounded-xl bg-blue-600 px-4 py-3 text-white">Continue to Login</button></div> :
      <div className="space-y-5 p-2 sm:p-4">
        <p className="break-all text-sm text-slate-600">{user.email}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={action === 'password'} onClick={() => { setAction('password'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-blue-800"><KeyRound className="h-4 w-4" />Reset Password</button>
          <button type="button" aria-pressed={action === 'delete'} onClick={() => { setAction('delete'); setError(''); setCurrentPassword(''); }} className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"><Trash2 className="h-4 w-4" />Delete Account & Restart Registration</button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <label className="block space-y-2 text-xs font-bold text-slate-800">Current Manager Password
            <input type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
          </label>
          {action === 'password' ? <>
            <label className="block space-y-2 text-xs font-bold text-slate-800">New Password
              <input type="password" autoComplete="new-password" required minLength={6} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
            </label>
            <PasswordStrengthGauge password={newPassword} />
            <label className="block space-y-2 text-xs font-bold text-slate-800">Confirm New Password
              <input type="password" autoComplete="new-password" required minLength={6} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="block w-full rounded-xl border border-slate-200 p-3" />
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
