import { useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAdminGovernance } from './AdminGovernancePanel';
import { queryClient } from '../lib/queryClient';
import DashboardOverlay from './DashboardOverlay';

export default function AdminRemovalNotice() {
  const {user}=useAuth();
  return <AccountRemovalNotice key={user?.id}/>;
}
function AccountRemovalNotice() {
  const { data } = useAdminGovernance(), { apiFetch, user } = useAuth();
  const [dismissed, setDismissed] = useState<string[]>([]), [message, setMessage] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const change = data?.changes?.find((c: any) => c.targetId === user?.id && (c.canSubmitPlea || c.plea?.decision && !c.plea.acknowledgedAt) && !dismissed.includes(`${c.id}:${c.status}`));
  if (!change) return null;
  const decision = change.plea?.decision;
  const close = async () => {
    if (busy) return;
    if (decision) {
      setBusy(true);
      try { await apiFetch(`/api/admin/governance/changes/${change.id}/plea/acknowledge`, { method: 'POST', body: JSON.stringify({}) }); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); }
      catch { setError('The decision could not be acknowledged. Please try again.'); return; }
      finally { setBusy(false); }
    }
    setDismissed(values => [...values, `${change.id}:${change.status}`]);
  };
  const submit = async () => {
    setBusy(true); setError('');
    try { await apiFetch(`/api/admin/governance/changes/${change.id}/plea`, { method: 'POST', body: JSON.stringify({ message }) }); setMessage(''); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] }); }
    catch (err) { setError(err instanceof Error ? err.message : 'Your plea could not be submitted.'); }
    finally { setBusy(false); }
  };
  return <DashboardOverlay aria-label={decision ? `Plea ${decision}` : 'Administrator removal plea'} onClose={() => void close()} className="fixed inset-0 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-4">
    <section className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-blue-200 bg-white p-6 space-y-4">
      <button type="button" aria-label="Close removal notice" disabled={busy} onClick={() => void close()} className="absolute right-4 top-4 p-2 text-slate-500"><X size={18} /></button>
      <h2 className="pr-10 text-xl font-bold text-slate-900">{decision ? `Plea ${decision}` : 'Administrator removal proposal'}</h2>
      {decision ? <><p className="text-sm text-slate-700">{decision === 'accepted' ? 'The main administrator accepted your plea and revoked all removal votes. Your account remains active.' : 'The main administrator rejected your plea and may now confirm account removal.'}</p><p className="whitespace-pre-wrap text-sm text-slate-700">{change.plea.decisionReason}</p></> : <>
        <p className="text-sm text-slate-700">The main administrator and three other administrators approved your removal. You may submit a plea before {new Date(change.pleaUntil).toLocaleString()}.</p><p className="whitespace-pre-wrap text-sm text-slate-700">Reason: {change.reason}</p>
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}><label className="block text-sm font-semibold text-slate-700">Your plea<textarea required minLength={3} maxLength={2000} value={message} onChange={e => setMessage(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-900" /></label><button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Submit plea to main administrator</button></form>
      </>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </section>
  </DashboardOverlay>;
}
