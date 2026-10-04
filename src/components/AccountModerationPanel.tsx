import { useEffect, useState } from 'react';
import { apiFetch } from '../lib/api';
import { ACCOUNT_FEATURES } from '../../accountFeatures';
import DashboardOverlay from './DashboardOverlay';
import { useAdminGovernance } from './AdminGovernancePanel';

const root = '/api/admin/governance';
const field = 'w-full rounded-xl border border-blue-200 bg-white/70 px-3 py-2 text-sm';
const button = 'rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';
export default function AccountModerationPanel({ target, onClose, onApplied }: { target: any; onClose: () => void; onApplied: () => void }) {
  const { data, error: loadError, refetch } = useAdminGovernance();
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [action, setAction] = useState('ban'), [reason, setReason] = useState(''), [amount, setAmount] = useState('24'), [unit, setUnit] = useState('hours');
  const [features, setFeatures] = useState<string[]>([]), [privateKey, setPrivateKey] = useState(''), [preview, setPreview] = useState<any>(null);
  const [final, setFinal] = useState<any>(null), [confirmation, setConfirmation] = useState('');
  const [rejection, setRejection] = useState('');
  useEffect(() => { setReason(''); setPrivateKey(''); setPreview(null); setFeatures([]); setAction('ban'); }, [target?.id, target?.role]);
  const ready = data?.members.length === 5 && data.members.every((m: any) => m.active && m.keyEnrolled);
  const main = data?.currentId === data?.mainId;
  const run = async (path: string, body: any, done?: (result: any) => void) => {
    setBusy(true); setError(''); setNotice('');
    try { const result = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) }); if (!result || Array.isArray(result)) throw new Error('Your administrator session has ended. Sign in again.'); setPrivateKey(''); done?.(result); setNotice(result.message || 'Account proposal updated.'); await refetch(); onApplied(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  const proposals = data?.accountProposals || [];
  const keyInput = <label className="block text-sm font-semibold">Your private approval key<input required type="password" autoComplete="off" maxLength={128} value={privateKey} onChange={e => setPrivateKey(e.target.value)} className={`${field} mt-1`} /><span className="mt-1 block text-xs font-normal text-slate-500">The same private approval key used for governance, separate from your settings key. Never saved in your browser.</span></label>;
  return <section className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-5 backdrop-blur-xl" aria-label="Account approvals">
    <div><h3 className="text-lg font-bold text-blue-950">Account proposals and approvals</h3><p className="mt-1 text-sm text-slate-600">All five administrators must approve. Administrator 1 makes the final decision. Approval alone changes no account.</p></div>
    {!ready && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Account actions are locked until five active administrators have enrolled their private approval keys. Manage founders in Shared Approvals.</p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}
    {loadError && <p role="alert" className="text-sm text-red-800">{loadError.message}</p>}
    {error && !target && !final && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!proposals.length && <p className="text-sm text-slate-500">No account proposals have been submitted.</p>}
    {[...proposals].reverse().map((p: any) => <article key={p.id} className="space-y-3 rounded-2xl border border-blue-100 bg-white/65 p-4">
      <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold capitalize">{p.action === 'restore' ? 'Restore access' : p.action} · {p.targetName}</h4><span className="text-xs font-bold uppercase text-blue-700">{p.status}</span></div>
      <p className="break-all text-xs text-slate-500">{p.targetRole} · Account ID: {p.targetId}</p><p className="text-sm">{p.reason}</p>
      {p.duration && <p className="text-sm">Ban for {p.duration.amount} {p.duration.unit}, starting when applied.</p>}
      {p.features.length > 0 && <p className="text-sm">Restricted: {p.features.map((f: keyof typeof ACCOUNT_FEATURES) => ACCOUNT_FEATURES[f]).join(', ')}.</p>}
      {p.preview && <p className="text-xs text-slate-600">Deletion: {Object.entries(p.preview.counts).map(([name, count]) => `${name}: ${count}`).join(' · ')} · {p.preview.uploadCount} uploads. Data changes require a fresh proposal.</p>}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{p.roster.map((m: any) => { const vote = p.votes.find((v: any) => v.id === m.id); return <p key={m.id} className={`rounded-xl p-2 text-xs ${vote?.decision === 'approved' ? 'bg-emerald-50 text-emerald-900' : vote?.decision === 'rejected' ? 'bg-red-50 text-red-900' : 'bg-blue-50 text-blue-900'}`}>Administrator {m.slot} · {m.name}<span className="mt-1 block font-semibold capitalize">{vote?.decision || 'Awaiting approval'}</span></p>; })}</div>
      <p className="text-xs text-slate-500">Expires {new Date(p.expiresAt).toLocaleString()}{p.appliedAt ? ` · Applied ${new Date(p.appliedAt).toLocaleString()} by administrator 1` : ''}</p>
      {p.finalRejectionReason && <p className="text-sm text-rose-800">Final rejection by administrator 1: {p.finalRejectionReason}</p>}
      {['pending', 'approved'].includes(p.status) && !p.votes.some((v: any) => v.id === data.currentId) && <div className="space-y-3">{keyInput}<div className="flex gap-2"><button className={button} disabled={!ready || busy || !privateKey} onClick={() => run(`${root}/accounts/${p.id}/vote`, { privateKey, decision: 'approved' })}>Approve</button><button className={`${button} !bg-rose-700`} disabled={!ready || busy || !privateKey} onClick={() => run(`${root}/accounts/${p.id}/vote`, { privateKey, decision: 'rejected' })}>Reject</button></div></div>}
      {main && p.status === 'approved' && <button className={button} disabled={!ready || busy} onClick={() => { setFinal(p); setPrivateKey(''); setConfirmation(''); setRejection(''); setError(''); }}>Review final decision</button>}
    </article>)}
    {(target || final) && <DashboardOverlay aria-label={target ? 'Propose account action' : 'Final account decision'} onClose={busy ? null : () => { onClose(); setFinal(null); setPrivateKey(''); }} className="flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <form className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border border-blue-200 bg-white/95 p-6 text-slate-900 shadow-2xl" onSubmit={e => {
        e.preventDefault();
        if (final) run(`${root}/accounts/${final.id}/apply`, { privateKey, confirmation }, () => setFinal(null));
        else run(`${root}/accounts`, { targetId: target.id, targetRole: target.role, action, reason, privateKey, features, duration: { amount: Number(amount), unit }, fingerprint: preview?.fingerprint }, onClose);
      }}>
        <h3 className="text-xl font-bold">{final ? 'Main administrator · final decision' : `Account action · ${target.name}`}</h3>
        <p className="break-all text-xs text-slate-500">{(target || final).role || final?.targetRole} · {(target || final).id === final?.id ? final.targetId : target?.id}</p>
        {!ready && <p className="text-sm text-amber-900">Five active administrators and enrolled keys are required.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
        {final ? <><p className="text-sm">Apply the approved <strong>{final.action}</strong> action for <strong>{final.targetName}</strong>? All five approvals are recorded above. Reason: {final.reason}</p>
          <label className="block text-sm">Type <strong>{final.action === 'delete' ? 'DELETE APPROVED ACCOUNT' : 'APPLY APPROVED ACTION'}</strong><input required value={confirmation} onChange={e => setConfirmation(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="block text-sm">Or reject the final action with a reason<textarea maxLength={500} value={rejection} onChange={e => setRejection(e.target.value)} className={`${field} mt-1`} /></label>
          <button type="button" className={`${button} !bg-rose-700`} disabled={busy || !ready || !privateKey || rejection.trim().length < 3} onClick={() => run(`${root}/accounts/${final.id}/final-reject`, { privateKey, reason: rejection }, () => setFinal(null))}>Reject final action</button></> : <>
          <label className="block text-sm">Action<select value={action} onChange={e => { setAction(e.target.value); setPreview(null); setError(''); }} className={`${field} mt-1`}><option value="ban">Timed ban</option><option value="restrict">Restrict selected features</option><option value="restore">Restore access (remove this account’s ban/restrictions)</option><option value="delete">Permanently delete account and related records</option></select></label>
          {action === 'ban' && <div className="grid grid-cols-2 gap-3"><label className="text-sm">Duration<input type="number" required min={1} max={876000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className={`${field} mt-1`} /></label><label className="text-sm">Unit<select value={unit} onChange={e => setUnit(e.target.value)} className={`${field} mt-1`}>{['hours', 'days', 'weeks', 'months', 'years'].map(u => <option key={u}>{u}</option>)}</select></label></div>}
          {action === 'restrict' && <fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Restricted features</legend>{Object.entries(ACCOUNT_FEATURES).map(([key, label]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={features.includes(key)} onChange={e => setFeatures(prev => e.target.checked ? [...prev, key] : prev.filter(f => f !== key))} />{label}</label>)}</fieldset>}
          <label className="block text-sm">Reason shown to the account holder<textarea required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={`${field} mt-1`} /></label>
          <p className="text-xs text-slate-600">Bans and restrictions also apply to linked sub-accounts. Independent accounts sharing an email are unaffected. A year is 365 days; a month is 30 days.</p>
          {action === 'delete' && <div className="space-y-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-900"><p>Deletes related housing, staff, markets, orders and uploaded files where applicable. A private encrypted recovery archive is retained.</p><button type="button" className={button} disabled={busy} onClick={() => run(`${root}/accounts/preview`, { targetId: target.id, targetRole: target.role }, setPreview)}>Review deletion preview</button>{preview && <p>{Object.entries(preview.counts).map(([k, n]) => `${k}: ${n}`).join(' · ')} · {preview.uploadCount} uploads</p>}</div>}
        </>}
        {keyInput}<div className="flex flex-wrap gap-3"><button className={button} disabled={busy || !ready || !privateKey || (!final && (action === 'delete' && !preview || action === 'restrict' && !features.length))}>{busy ? 'Saving…' : final ? 'Apply final decision' : 'Submit for five-admin approval'}</button><button type="button" className="rounded-xl border border-blue-200 px-4 py-2 text-sm" disabled={busy} onClick={() => { onClose(); setFinal(null); setPrivateKey(''); }}>Cancel</button></div>
      </form>
    </DashboardOverlay>}
  </section>;
}
