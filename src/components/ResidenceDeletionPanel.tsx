import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { queryClient } from '../lib/queryClient';
import { useAdminGovernance } from './AdminGovernancePanel';
import DashboardOverlay from './DashboardOverlay';

const control = 'mt-1 w-full min-w-0 rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-900';
const action = 'rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40';
const danger = 'rounded-xl bg-red-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40';
function Preview({ preview }: { preview: any }) {
  return <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm">
    <h4 className="font-bold">Deletion preview · {preview.hostelName}</h4>
    <p>Manager: {preview.managerName || 'No linked manager'} · {preview.deleteManager ? 'Account also deleted' : 'Account retained'}</p>
    {preview.residences?.map((home: any) => <p key={home.id} className="break-words">Residence: {home.name} <span className="break-all text-xs">({home.id})</span></p>)}
    {!!preview.accounts?.length && <details><summary className="cursor-pointer font-semibold">Accounts included in deletion ({preview.accounts.length})</summary><ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">{preview.accounts.map((account: any) => <li key={`${account.role}:${account.id}`} className="break-words">{account.name} · {account.role}<span className="block break-all text-xs">{account.id}</span></li>)}</ul></details>}
    <dl className="grid gap-1 sm:grid-cols-2">{Object.entries(preview.counts).map(([name, count]) => <div key={name} className="flex justify-between gap-3"><dt className="break-all">{name}</dt><dd>{String(count)}</dd></div>)}</dl>
    <p>{preview.uploadCount} uploaded files · {(preview.uploadBytes / 1024 / 1024).toFixed(2)} MiB</p>
    {preview.notes.map((note: string) => <p key={note}>{note}</p>)}
  </div>;
}
export default function ResidenceDeletionPanel({ selectedHostel, onClose }: { selectedHostel?: any; onClose: () => void }) {
  const { apiFetch } = useAuth(), { data, error } = useAdminGovernance();
  const [deleteManager, setDeleteManager] = useState(false), [amount, setAmount] = useState(0), [unit, setUnit] = useState('days');
  const [reason, setReason] = useState(''), [privateKey, setPrivateKey] = useState(''), [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, string>>({}), [rejections, setRejections] = useState<Record<string, string>>({});
  useEffect(() => { setPreview(null); setDeleteManager(false); setAmount(0); setUnit('days'); setReason(''); setPrivateKey(''); setFailure(''); }, [selectedHostel?.id]);
  const options = { hostelId: selectedHostel?.id, deleteHostel: true, deleteManager, ban: { amount, unit } };
  const root = '/api/admin/governance/residences';
  async function act(path: string, body: any, complete?: (result: any) => void) {
    if (busy) return; setBusy(true); setFailure(''); setNotice('');
    try {
      const result = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      if (!result || Array.isArray(result)) throw new Error('Sign in again to continue.');
      if (path !== `${root}/preview`) { setPrivateKey(''); setNotice(result.message || 'Approval saved. The hostel is deleted only after the founder’s final keyed decision.'); }
      complete?.(result); await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] });
      if (result.status === 'executed') await queryClient.invalidateQueries();
    } catch (err: any) { setFailure(err.message || 'The action could not be completed.'); }
    finally { setBusy(false); }
  }
  const keyField = <label className="block text-sm font-semibold">Your private approval key<input aria-label="Hostel deletion approval key" type="password" autoComplete="off" maxLength={128} value={privateKey} onChange={e => setPrivateKey(e.target.value)} className={control} /></label>;
  return <section aria-label="Hostel deletion approvals" className="space-y-4 rounded-3xl border border-blue-200 bg-white/70 p-5 text-slate-900">
    <h3 className="text-lg font-bold">Hostel deletion approvals</h3>
    <p className="text-sm">At least two distinct administrators must approve using their own keys. Administrator #1 (Andyheller2k) always makes the final keyed decision. Approvals expire after 24 hours.</p>
    {error && <p role="alert" className="text-red-700">{error.message}</p>}
    {failure && !selectedHostel && <p role="alert" className="text-red-700">{failure}</p>}
    {notice && <p role="status" className="text-blue-700">{notice}</p>}
    {!data && !error && <p role="status">Loading approvals…</p>}
    {data && !data.members.find((m: any) => m.id === data.currentId)?.keyEnrolled && <p className="text-sm">Enroll your approval key in the Admin Approvals tab before consenting.</p>}
    {!!data?.residenceProposals?.some((p: any) => ['pending', 'approved'].includes(p.status)) && keyField}
    {data?.residenceProposals?.slice().reverse().map((p: any) => {
      const live = ['pending', 'approved'].includes(p.status), ownVote = p.votes.some((v: any) => v.id === data.currentId), main = data.currentId === data.mainId;
      return <article key={p.id} className="space-y-3 rounded-2xl border border-blue-200 p-4 text-sm">
        <h4 className="font-bold">{p.preview.hostelName} · {p.status}</h4><p>{p.reason}</p>
        <details><summary className="cursor-pointer font-semibold">Review selected records and registration ban</summary><Preview preview={p.preview} /></details>
        <p>Expires {new Date(p.expiresAt).toLocaleString()}</p>
        {p.votes.map((v: any) => <p key={v.id}>#{v.slot} {v.name}: {v.decision}</p>)}
        {p.finalReason && <p>Founder’s final decision: {p.finalReason}</p>}
        {live && !ownVote && <div className="flex flex-wrap gap-2"><button className={action} disabled={busy || !privateKey || data.blocked} onClick={() => act(`${root}/${p.id}/vote`, { privateKey, decision: 'approved' })}>Approve hostel deletion</button><button className={danger} disabled={busy || !privateKey || data.blocked} onClick={() => act(`${root}/${p.id}/vote`, { privateKey, decision: 'rejected' })}>Reject hostel deletion</button></div>}
        {live && main && <div className="space-y-3 border-t pt-3">
          {p.status === 'approved' && <><label className="block">Type DELETE APPROVED HOSTEL<input value={confirmations[p.id] || ''} onChange={e => setConfirmations({ ...confirmations, [p.id]: e.target.value })} className={control} autoComplete="off" /></label><button className={danger} disabled={busy || !privateKey || data.blocked || confirmations[p.id] !== 'DELETE APPROVED HOSTEL'} onClick={() => act(`${root}/${p.id}/execute`, { privateKey, confirmation: confirmations[p.id] })}>Founder: execute approved deletion</button></>}
          <label className="block">Final rejection reason<textarea value={rejections[p.id] || ''} maxLength={1000} onChange={e => setRejections({ ...rejections, [p.id]: e.target.value })} className={control} /></label>
          <button className={action} disabled={busy || !privateKey || data.blocked || (rejections[p.id]?.trim().length || 0) < 3} onClick={() => act(`${root}/${p.id}/final-reject`, { privateKey, reason: rejections[p.id] })}>Founder: decline deletion</button>
        </div>}
      </article>;
    })}
    {selectedHostel && <DashboardOverlay aria-label="Review hostel deletion" onClose={busy ? null : onClose} className="flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl bg-white p-5 text-slate-900" onSubmit={e => { e.preventDefault(); act(root, { ...options, reason, privateKey, fingerprint: preview?.fingerprint }, onClose); }}>
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Delete {selectedHostel.name}</h2><button type="button" aria-label="Close deletion review" disabled={busy} onClick={onClose} className="p-2"><X /></button></div>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked disabled />Delete hostel and its operational records</label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={deleteManager} onChange={e => { setDeleteManager(e.target.checked); setPreview(null); }} />Also delete its manager account and other residences owned by that manager</label>
        <p className="text-sm">{deleteManager ? 'The primary user stays. Choose how long they must wait before creating another manager account.' : 'The manager keeps their sign-in account. Choose how long they must wait before registering another hostel.'}</p>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Registration ban duration<input type="number" min={0} step={1} value={amount} onChange={e => { setAmount(Number(e.target.value)); setPreview(null); }} className={control} /></label><label className="text-sm">Unit<select value={unit} onChange={e => { setUnit(e.target.value); setPreview(null); }} className={control}>{['hours', 'days', 'weeks', 'months', 'years'].map(u => <option key={u}>{u}</option>)}</select></label></div>
        <p className="text-xs">Use zero for no registration ban. Months are 30 days; years are 365 days.</p>
        <label className="block text-sm">Deletion reason<textarea required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className={control} /></label>
        <button type="button" className={action} disabled={busy || data?.blocked} onClick={() => act(`${root}/preview`, options, setPreview)}>Review deletion</button>
        {preview && <Preview preview={preview} />}
        {keyField}
        {failure && <p role="alert" className="text-sm text-red-700">{failure}</p>}
        <button className={danger} disabled={busy || !preview || !privateKey || reason.trim().length < 3 || data?.blocked}>Submit deletion for approval</button>
      </form>
    </DashboardOverlay>}
  </section>;
}
