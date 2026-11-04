import { publicAppBase } from '../lib/publicAppUrl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, RefreshCw, UserPlus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { requestKeyedApproval } from '../lib/approvalPrompt';
import { supportApi } from '../lib/supportApi';
import AdminReportReview from './AdminReportReview';
import type { EntityReport } from '../../reportModel';
import { useClipboardFeedback } from '../lib/useClipboardFeedback';

export default function AdminCustomerService({ onOpenApprovals, onReviewAccount }: { onOpenApprovals?: () => void; onReviewAccount?: (report: EntityReport) => void }) {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null), [email, setEmail] = useState(''), [name, setName] = useState(''), [link, setLink] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const clipboard = useClipboardFeedback();
  const mounted = useRef(true), working = useRef(false), accountId = user?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const controller = new AbortController(); supportApi('/api/admin/customer-service', accountId, undefined, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) setData(value); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }); return () => controller.abort(); }, [accountId, refresh]);
  function approved(path: string, body: object, method = 'POST', invitation = false) {
    void requestKeyedApproval(async privateKey => {
      if (!mounted.current || working.current) return; working.current = true; setBusy(true); setError('');
      try { const result = await supportApi(path, accountId, { ...body, privateKey }, method); if (!mounted.current) return;
        if (invitation) { clipboard.reset(); setLink(`${publicAppBase()}#/support-invitation?token=${result.invitationToken}`); setEmail(''); setName(''); }
        setRefresh(v => v + 1);
        return result;
      } catch (e: any) { if (mounted.current) setError(e.message); throw e; }
      finally { working.current = false; if (mounted.current) setBusy(false); }
    }).catch(() => {});
  }
  return <><section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold">Customer-service team</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">Invite a named person using a separate verified email. The private link expires after 24 hours and grants access only to that email’s account. Your current approval key is required.</p></div><Link to="/customer-service" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Open feedback inbox</Link></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}<button type="button" onClick={() => { setError(''); setRefresh(v => v + 1); }} className="ml-3 inline-flex items-center gap-1 font-bold underline"><RefreshCw size={13} />Retry</button></p>}
    <form className="grid items-end gap-4 sm:grid-cols-[1fr_1fr_auto]" onSubmit={e => { e.preventDefault(); approved('/api/admin/customer-service/invitations', { fullName: name, email }, 'POST', true); }}><label className="text-xs font-bold">Full name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" autoComplete="off" /></label><label className="text-xs font-bold">Invited email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" autoComplete="off" /></label><button disabled={busy} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><UserPlus size={16} />Create invitation</button></form>
    {link && <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-bold">Share this private link with the invited person</p><p className="text-xs leading-6 text-slate-600">This is the only time the complete link is shown. Cancelling it or rotating the issuing approval key invalidates an unaccepted invitation.</p><textarea aria-label="Private customer-service invitation link" readOnly value={link} rows={3} className="w-full break-all rounded-xl border border-slate-200 bg-white p-3 text-xs" /><div className="flex gap-3"><button type="button" className="inline-flex items-center gap-2 text-xs font-bold text-blue-700" onClick={async () => { if (!await clipboard.copy('support-invitation', link) && mounted.current) setError('Copy is unavailable. Select and copy the invitation above.'); }}><Copy size={15} />{clipboard.copiedId === 'support-invitation' ? 'Copied' : 'Copy invitation'}</button><button type="button" onClick={() => setLink('')} className="text-xs font-bold text-slate-500">Hide link</button></div></div>}
    {!data ? <p role="status" className="text-sm text-slate-500">Loading customer-service access…</p> : <>
      <div><h3 className="mb-3 font-bold">Team members</h3>{data.members.length ? <ul className="space-y-3">{data.members.map((m: any) => <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"><div className="min-w-0"><p className="text-sm font-bold">{m.name} · {m.status}</p><p className="break-all text-xs text-slate-500">{m.email}</p><p className="mt-1 break-all text-[11px] text-slate-500">Account ID: {m.id}</p></div><button type="button" disabled={busy} onClick={() => approved(`/api/admin/customer-service/members/${m.id}`, { status: m.status === 'active' ? 'suspended' : 'active' }, 'PATCH')} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-800">{m.status === 'active' ? 'Suspend access' : 'Restore access'}</button></li>)}</ul> : <p className="text-sm text-slate-500">No customer-service invitations have been accepted.</p>}</div>
      <div><h3 className="mb-3 font-bold">Invitation history</h3>{data.invitations.length ? <ul className="space-y-3">{data.invitations.map((i: any) => <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4"><div className="min-w-0"><p className="text-sm font-bold">{i.fullName}</p><p className="break-all text-xs text-slate-500">{i.email}</p><p className="mt-1 text-xs text-slate-500">{i.status === 'pending' && new Date(i.expiresAt) < new Date() ? 'Expired' : i.status} · Expires {new Date(i.expiresAt).toLocaleString()}</p></div>{i.status === 'pending' && <button type="button" disabled={busy} onClick={() => approved(`/api/admin/customer-service/invitations/${i.id}/cancel`, {})} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-800">Cancel invitation</button>}</li>)}</ul> : <p className="text-sm text-slate-500">Create an invitation to add your first team member.</p>}</div>
    </>}
  </section><AdminReportReview key={accountId} onOpenApprovals={onOpenApprovals} onReviewAccount={onReviewAccount} /></>;
}
