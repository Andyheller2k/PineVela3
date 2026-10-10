import { useState } from 'react';

export default function AdminRemovalActions({ change: c, data, busy, privateKey, act }: { change: any; data: any; busy: boolean; privateKey: string; act: (path: string, body: any) => Promise<void> }) {
  const [reason, setReason] = useState(''), [confirmation, setConfirmation] = useState('');
  const [plea, setPlea] = useState('');
  const root = `/api/admin/governance/changes/${c.id}`;
  const button = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40';
  const danger = 'rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40';
  const control = 'w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900';
  const main = data.currentId === data.mainId;
  return <div className="space-y-3" data-admin-removal={c.id}>
    <p className="font-semibold">{c.votes.filter((v: any) => v.decision === 'approved').length}/4 {c.status==='revoked'?'historical':'eligible'} approvals · The targeted administrator has no vote.</p>
    {c.status === 'pending' && c.targetId !== data.currentId && !c.votes.some((v: any) => v.id === data.currentId) && <div className="flex flex-wrap gap-2">
      <button className={button} disabled={busy || !privateKey} onClick={() => act(`${root}/vote`, { privateKey, decision: 'approved' })}>Approve change</button>
      <button className={danger} disabled={busy || !privateKey} onClick={() => act(`${root}/vote`, { privateKey, decision: 'rejected' })}>Reject change</button>
    </div>}
    {c.pleaUntil && ['awaiting-plea', 'plea-submitted', 'plea-rejected'].includes(c.status) && <p>Plea deadline: {new Date(c.pleaUntil).toLocaleString()}. Removal requires final confirmation by the main administrator.</p>}
    {c.canSubmitPlea && <form className="space-y-3" onSubmit={e => { e.preventDefault(); void act(`${root}/plea`, { message: plea }); }}><label className="block">Your plea<textarea required minLength={3} maxLength={2000} className={control} value={plea} onChange={e => setPlea(e.target.value)} /></label><button className={button} disabled={busy}>Submit plea to main administrator</button></form>}
    {c.plea && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><p className="font-semibold">Administrator’s plea</p><p className="whitespace-pre-wrap break-words">{c.plea.message}</p>{c.plea.decision && <p className="mt-2 font-semibold">Plea {c.plea.decision}: {c.plea.decisionReason}</p>}</div>}
    {main && c.status === 'plea-submitted' && <div className="space-y-3">
      <label className="block">Decision reason<textarea className={control} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !privateKey || reason.trim().length < 3} onClick={() => act(`${root}/plea/decision`, { privateKey, decision: 'accepted', reason })}>Accept plea and revoke all votes</button><button className={danger} disabled={busy || !privateKey || reason.trim().length < 3} onClick={() => act(`${root}/plea/decision`, { privateKey, decision: 'rejected', reason })}>Reject plea</button></div>
    </div>}
    {main && c.canConfirmRemoval && <div className="space-y-3"><label className="block">Type REMOVE ADMINISTRATOR<input className={control} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" /></label><button className={danger} disabled={busy || !privateKey || confirmation !== 'REMOVE ADMINISTRATOR'} onClick={() => act(`${root}/confirm-removal`, { privateKey, confirmation })}>Confirm administrator elimination</button></div>}
    {c.status === 'revoked' && <p className="font-semibold text-emerald-700">Plea accepted. All votes were revoked and the account remains active.</p>}
  </div>;
}
