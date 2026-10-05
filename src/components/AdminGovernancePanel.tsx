import { useActionFeedback } from '../lib/useActionFeedback';
import OnboardingProgress, { ADMIN_INVITATION_STEPS } from './OnboardingProgress';
import AdministratorLabel from './AdministratorLabel';
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Users, Trash2, AlertTriangle, Copy } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { queryClient } from '../lib/queryClient';

export function useAdminGovernance() {
  const { apiFetch, user } = useAuth();
  return useQuery<any>({ queryKey: ['adminGovernance', user?.id], enabled: user?.role === 'admin', refetchInterval: 8000,
    queryFn: async () => { const data = await apiFetch('/api/admin/governance'); if (!Array.isArray(data?.members)) throw new Error('Administrator governance could not load. Please sign in again.'); return data; } });
}
const labels: Record<string, string> = { hostels: 'Hostels', markets: 'Markets', managers: 'Managers and their staff', residents: 'Resident accounts', users: 'Primary user accounts', total: 'Total wipeout (except administrators)' };
const control = 'w-full min-w-0 rounded-xl border border-blue-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const button = 'rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700';
const danger = 'rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-800';
function Counts({ preview }: { preview: any }) {
  return <div className="space-y-2 rounded-xl border border-red-200 bg-red-50/60 p-4 text-sm">
    <p className="font-semibold text-red-950">Server deletion preview</p>
    <dl className="grid grid-cols-1 gap-1 sm:grid-cols-2">{Object.entries(preview.counts).map(([name, count]) => <div key={name} className="flex min-w-0 justify-between gap-3"><dt className="break-words text-slate-600">{name}</dt><dd className="font-semibold">{String(count)}</dd></div>)}</dl>
    {!Object.keys(preview.counts).length && <p>No matching operational records.</p>}
    <p>{preview.uploadCount} uploaded files · {(preview.uploadBytes / 1024 / 1024).toFixed(2)} MiB</p>
    {preview.notes?.map((note: string) => <p key={note} className="text-xs text-slate-600">{note}</p>)}
  </div>;
}
export default function AdminGovernancePanel() {
  const feedback = useActionFeedback();
  const { apiFetch } = useAuth(), { data, error, isPending } = useAdminGovernance();
  const [privateKey, setPrivateKey] = useState(''), [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [, setFailure] = useState('');
  const [secret, setSecret] = useState<{ title: string; value: string; kind?: 'invitation' } | null>(null);
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [scopes, setScopes] = useState<string[]>([]), [reason, setReason] = useState(''), [preview, setPreview] = useState<any>(null);
  const [changeTarget, setChangeTarget] = useState(''), [changeAction, setChangeAction] = useState('reset-key'), [changeReason, setChangeReason] = useState('');
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  async function act(path: string, body: any, complete?: (result: any) => void) {
    if (busy) return;
    const origin = feedback.begin();
    setBusy(true); setFailure(''); setNotice('');
    try {
      const result = await apiFetch(path, { method: 'POST', body: JSON.stringify(body) });
      if (!result || Array.isArray(result)) throw new Error('Your administrator session has ended. Sign in again.');
      setPrivateKey(''); setPassword(''); complete?.(result);
      setNotice(result.message || 'Saved. All administrator dashboards will receive the update.');
      await queryClient.invalidateQueries({ queryKey: ['adminGovernance'] });
      if (result.status === 'executed') await queryClient.invalidateQueries();
    } catch (err: any) { setFailure(err.message || 'This action could not be completed.'); feedback.fail(err.message || 'This action could not be completed.', origin); }
    finally { setBusy(false); }
  }
  useEffect(() => { if (secret?.kind === 'invitation') document.getElementById('admin-invitation-link')?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }, [secret]);
  async function copySecret() { try { await navigator.clipboard.writeText(secret!.value); setNotice('Copied. Store it privately.'); } catch { feedback.fail('Copy is unavailable. Select and copy the value manually.', feedback.begin()); } }
  if (isPending) return <div role="status" className="rounded-3xl bg-blue-50/70 p-8 animate-pulse">Loading administrator approvals…</div>;
  if (error || !data) return <p role="alert" className="text-red-700">{error?.message || 'Administrator governance is unavailable.'}</p>;
  const self = data.members.find((m: any) => m.id === data.currentId), main = data.currentId === data.mainId;
  const ready = data.members.length === 5 && data.members.every((m: any) => m.active && m.keyEnrolled);
  const root = '/api/admin/governance';
  const secretPanel = secret ? (<div id={secret?.kind === 'invitation' ? 'admin-invitation-link' : undefined} className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <h3 className="font-bold">{secret!.title}</h3>{secret?.kind === 'invitation' && <p className="text-sm text-blue-950">Copy this link and send it privately to the named founder. PineVela does not email it automatically.</p>}<p className="text-sm">Shown once in this session. Store it securely before closing this message.</p>
      <textarea aria-label={secret?.kind === 'invitation' ? 'Private administrator invitation link' : secret!.title} readOnly value={secret!.value} className={`${control} min-h-24 break-all font-mono`} />
      <div className="flex flex-wrap gap-3"><button className={button} onClick={copySecret}><Copy className="mr-1 inline h-4 w-4" /> {secret?.kind === 'invitation' ? 'Copy invitation link' : 'Copy'}</button><button className={button} onClick={() => setSecret(null)}>I have saved it</button></div>
    </div>) : null;
  return <section onClickCapture={feedback.capture} onSubmitCapture={feedback.capture} className="space-y-6 text-slate-900" aria-label="Administrator governance">
    <header className="rounded-3xl border border-blue-200 bg-white/65 p-6 backdrop-blur-xl">
      <h2 className="text-xl font-bold"><AdministratorLabel slot={self?.slot} name={self?.name} /></h2>
      <p className="mt-1 break-all text-xs text-slate-600">Account ID: {data.currentId}</p>
      <p className="mt-3 text-sm text-slate-600">Wipes need five independent approvals. Keys belong to each administrator and are separate from login passwords. A rejected, expired or changed proposal cannot execute.</p>
    </header>
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-4 text-blue-800">{notice}</p>}
    {data.blocked && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">Writes are blocked. Stop the server and inspect the recovery archive offline.</p>}
    {secret && secret.kind !== 'invitation' && secretPanel}
    {!self?.keyEnrolled && <form className="space-y-3 rounded-2xl border border-blue-200 bg-white/70 p-5" onSubmit={e => { e.preventDefault(); act(`${root}/keys/enroll`, { password }, r => setSecret({ title: 'Your private approval key', value: r.privateKey })); }}>
      <h3 className="flex items-center gap-2 font-bold"><KeyRound className="h-5 w-5" /> Enroll your private approval key</h3>
      <label className="block text-sm">Your current login password<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} className={`${control} mt-1`} /></label>
      <button className={button} disabled={busy || !password}>Generate my private key</button>
    </form>}
    {self?.keyEnrolled && <label className="block rounded-2xl border border-blue-200 bg-white/70 p-5 text-sm font-semibold">Your private approval key for the next action
      <input type="password" autoComplete="off" maxLength={128} value={privateKey} onChange={e => setPrivateKey(e.target.value)} className={`${control} mt-2`} />
      <span className="mt-2 block text-xs font-normal text-slate-500">Used only by your account. Cleared after a successful action; never saved in browser storage.</span>
    </label>}
    <div className="space-y-4 rounded-3xl border border-blue-200 bg-white/60 p-5">
      <h3 className="flex items-center gap-2 font-bold"><Users className="h-5 w-5" /> Administrator roster · {data.members.length}/5</h3>
      <div className="grid gap-3 sm:grid-cols-2">{data.members.map((m: any) => <article key={m.id} className="min-w-0 rounded-2xl border border-blue-100 bg-white/75 p-4 text-sm">
        <p className="font-bold">#{m.slot} {m.name}{m.id === data.mainId ? ' · Main administrator' : ''}</p><p className="break-all text-slate-600">{m.email}</p><p className="mt-1 break-all text-xs text-slate-500">{m.id}</p>
        <p className="mt-2 text-xs">{m.active ? 'Active' : 'Suspended'} · {m.keyEnrolled ? 'Private key enrolled' : 'Key enrollment pending'}</p>
        {main && m.id !== data.mainId && <button className={`${button} mt-3`} disabled={busy || !privateKey} onClick={() => act(`${root}/members/${m.id}/status`, { active: !m.active, privateKey })}>{m.active ? 'Suspend and revoke sessions' : 'Reactivate (sign-in required)'}</button>}
      </article>)}</div>
      {!ready && <p className="text-sm text-amber-800">Wipe proposals are locked until five active administrators have enrolled their private keys.</p>}
      {main && <form className="space-y-3 border-t border-blue-100 pt-4" onSubmit={e => { e.preventDefault(); act(`${root}/invitations`, { name, email, privateKey }, r => { setSecret({ kind: 'invitation', title: `Private invitation for ${r.email} · administrator #${r.slot}`, value: `${window.location.origin}/#/admin-invitation?token=${encodeURIComponent(r.invitationToken)}` }); setName(''); setEmail(''); }); }}>
        <h4 className="font-semibold">Invite a founder to an available administrator slot</h4><OnboardingProgress steps={ADMIN_INVITATION_STEPS} step={secret?.kind === 'invitation' ? 3 : name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 2 : 1} label="Founder invitation" /><p className="text-xs text-slate-600">Share the private invitation directly with its named recipient. They choose their own login password and receive their own approval key. Invitations expire after 24 hours.</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Administrator name<input required minLength={3} maxLength={100} value={name} onChange={e => setName(e.target.value)} className={control} /></label><label className="text-sm">Separate administrator email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={control} /></label></div>
        <button className={button} disabled={busy || !privateKey || data.members.length + data.invitations.length >= 5}>Create private invitation</button>
      </form>}
      {secret?.kind === 'invitation' && secretPanel}
      {main && data.invitations.map((i: any) => <div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 p-3 text-sm"><span className="break-all">Reserved #{i.slot} · {i.name} · {i.email}</span><button className={button} disabled={busy || !privateKey} onClick={() => act(`${root}/invitations/${i.id}/cancel`, { privateKey })}>Cancel invitation</button></div>)}
      <form className="space-y-3 border-t border-blue-100 pt-4" onSubmit={e => { e.preventDefault(); act(`${root}/members/${changeTarget}/changes`, { action: changeAction, reason: changeReason, privateKey }, () => setChangeReason('')); }}>
        <h4 className="font-semibold">Request administrator removal or private-key reset</h4><p className="text-xs text-slate-600">Requires another existing administrator’s approval. The affected administrator cannot approve their own replacement. Membership changes invalidate live wipe proposals.</p>
        <label className="block text-sm">Administrator<select required value={changeTarget} onChange={e => setChangeTarget(e.target.value)} className={control}><option value="">Select administrator</option>{data.members.filter((m: any) => changeAction !== 'remove' || m.id !== data.mainId).map((m: any) => <option key={m.id} value={m.id}>#{m.slot} {m.name}</option>)}</select></label>
        <label className="block text-sm">Action<select value={changeAction} onChange={e => { setChangeAction(e.target.value); setChangeTarget(''); }} className={control}>{main && <option value="remove">Permanently remove account</option>}<option value="reset-key">Reset lost wipe approval key</option><option value="reset-settings-key">Reset lost settings key</option></select></label>
        <label className="block text-sm">Reason<textarea required minLength={3} maxLength={500} value={changeReason} onChange={e => setChangeReason(e.target.value)} className={control} /></label><button className={button} disabled={busy || !privateKey || !changeTarget}>Submit change for independent approval</button>
      </form>
      {data.changes.map((c: any) => <article key={c.id} className="space-y-2 rounded-xl border border-amber-200 p-4 text-sm"><p className="font-semibold">{c.action === 'remove' ? 'Remove administrator' : c.action === 'reset-settings-key' ? 'Reset settings key' : 'Reset wipe approval key'} · {data.members.find((m: any) => m.id === c.targetId)?.name || c.targetId} · {c.status}</p><p>{c.reason}</p><p className="text-xs">Requested by {data.members.find((m: any) => m.id === c.requestedBy)?.name || c.requestedBy} · Expires {new Date(c.expiresAt).toLocaleString()}</p>{c.votes.map((v: any) => <p key={v.id} className="text-xs">#{v.slot} {v.name}: {v.decision} · {new Date(v.at).toLocaleString()}</p>)}
        {c.status === 'pending' && c.requestedBy !== data.currentId && c.targetId !== data.currentId && <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !privateKey} onClick={() => act(`${root}/changes/${c.id}/vote`, { privateKey, decision: 'approved' })}>Approve change</button><button className={danger} disabled={busy || !privateKey} onClick={() => act(`${root}/changes/${c.id}/vote`, { privateKey, decision: 'rejected' })}>Reject change</button></div>}
      </article>)}
    </div>
    <form className="space-y-4 rounded-3xl border border-red-200 bg-white/65 p-5" onSubmit={e => { e.preventDefault(); act(`${root}/proposals`, { scopes, reason, fingerprint: preview?.fingerprint, privateKey }, () => { setPreview(null); setScopes([]); setReason(''); }); }}>
      <h3 className="flex items-center gap-2 font-bold text-red-900"><Trash2 className="h-5 w-5" /> Propose a system wipe</h3>
      <fieldset className="grid gap-3 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold">Select data to wipe</legend>{Object.entries(labels).map(([scope, label]) => <label key={scope} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={scopes.includes(scope)} onChange={e => { setPreview(null); setScopes(current => scope === 'total' ? e.target.checked ? ['total'] : [] : e.target.checked ? [...current.filter(s => s !== 'total'), scope] : current.filter(s => s !== scope)); }} className="mt-1 accent-blue-600" />{label}</label>)}</fieldset>
      <label className="block text-sm">Reason (visible to all administrators)<textarea aria-label="Wipe proposal reason" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} className={control} /></label>
      <button type="button" className={button} disabled={busy || !scopes.length} onClick={() => act(`${root}/preview`, { scopes }, r => setPreview(r))}>Review deletion preview</button>
      {preview && <Counts preview={preview} />}
      <p className="text-xs text-slate-600">Submission counts as your approval, 1/5. Proposals expire after 24 hours. After 5/5 approval, administrator #1 must explicitly confirm execution; there is no automatic wipe.</p>
      <button className={danger} disabled={busy || !ready || !privateKey || !preview || reason.trim().length < 3}>Submit proposal with my approval key</button>
    </form>
    <div className="space-y-4"><h3 className="text-lg font-bold">Shared wipe proposals</h3>{!data.proposals.length && <p className="text-sm text-slate-500">No wipe proposals have been submitted.</p>}
      {[...data.proposals].reverse().map((p: any) => <article key={p.id} className="space-y-4 rounded-3xl border border-blue-200 bg-white/70 p-5">
        <div className="flex flex-wrap justify-between gap-2"><h4 className="font-bold">{p.scopes.map((s: string) => labels[s]).join(', ')}</h4><span className="text-sm font-semibold text-blue-700">{p.votes.filter((v: any) => v.decision === 'approved').length}/5 · {p.status}</span></div>
        <p className="text-sm">{p.reason}</p><p className="break-all text-xs text-slate-500">Proposal {p.id} · Submitted by #{p.roster.find((m: any) => m.id === p.createdBy)?.slot} {p.roster.find((m: any) => m.id === p.createdBy)?.name} ({p.createdBy})</p><p className="text-xs text-slate-500">Expires {new Date(p.expiresAt).toLocaleString()}</p><Counts preview={p.preview} />
        <ul className="grid gap-2 sm:grid-cols-2">{p.roster.map((m: any) => { const vote = p.votes.find((v: any) => v.id === m.id); return <li key={m.id} className="min-w-0 rounded-xl bg-blue-50 p-3 text-sm"><p className="font-semibold">#{m.slot} {m.name} · {vote?.decision || 'Pending'}</p><p className="break-all text-[11px] text-slate-500">{m.id}</p>{vote && <p className="text-xs text-slate-500">{new Date(vote.at).toLocaleString()}</p>}</li>; })}</ul>
        {p.status === 'pending' && !p.votes.some((v: any) => v.id === data.currentId) && <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !privateKey} onClick={() => act(`${root}/proposals/${p.id}/vote`, { privateKey, decision: 'approved' })}>Approve this exact proposal</button><button className={danger} disabled={busy || !privateKey} onClick={() => act(`${root}/proposals/${p.id}/vote`, { privateKey, decision: 'rejected' })}>Reject and cancel proposal</button></div>}
        {p.status === 'approved' && main && <div className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4"><p className="flex items-center gap-2 text-sm font-bold text-red-900"><AlertTriangle className="h-5 w-5" /> Five approvals received. Execution permanently deletes the reviewed data.</p><label className="block text-sm">Type WIPE APPROVED DATA<input value={confirmations[p.id] || ''} onChange={e => setConfirmations(c => ({ ...c, [p.id]: e.target.value }))} className={control} /></label><button className={danger} disabled={busy || !privateKey || confirmations[p.id] !== 'WIPE APPROVED DATA'} onClick={() => act(`${root}/proposals/${p.id}/execute`, { privateKey, confirmation: confirmations[p.id] })}>Back up and execute approved wipe</button></div>}
        {p.status === 'executed' && <p className="text-sm font-semibold text-blue-700">Executed {new Date(p.executedAt).toLocaleString()}. Administrator accounts preserved.</p>}
      </article>)}
    </div>
  </section>;
}
