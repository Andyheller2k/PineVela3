import { useEffect, useRef, useState } from 'react';
import { Flag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { REPORT_REASONS, REPORT_TARGETS, type ReportReason, type ReportTargetType } from '../../reportModel';
import { useAuth } from '../context/AuthContext';
import { supportApi } from '../lib/supportApi';
import DashboardOverlay from './DashboardOverlay';

export type ReportEvidence = { messageId: string; key?: string };
type Props = { targetType: ReportTargetType; targetId: string; targetName?: string; label?: string; className?: string; getEvidence?: () => Promise<ReportEvidence> };

/** Only the selected message's decryption key is disclosed, after explicit consent. */
export default function ReportButton(props: Props) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [user?.id, props.targetId, props.targetType]);
  if (!/^[a-f0-9-]{36}$/i.test(props.targetId) || props.targetType === 'profile' && props.targetId === user?.id) return null;
  return <>
    <button type="button" onClick={event => { event.stopPropagation(); setOpen(true); }} className={props.className || 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:border-amber-400 hover:text-blue-800'}><Flag size={14} aria-hidden="true" />{props.label || `Report ${REPORT_TARGETS[props.targetType].toLowerCase()}`}</button>
    {open && <ReportDialog key={`${user?.id || 'guest'}:${props.targetType}:${props.targetId}`} {...props} accountId={user?.id} onClose={() => setOpen(false)} />}
  </>;
}

function ReportDialog({ targetType, targetId, targetName, getEvidence, accountId, onClose }: Props & { accountId?: string; onClose: () => void }) {
  const [reason, setReason] = useState<ReportReason>('other'), [details, setDetails] = useState(''), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<{ id: string; reference: string } | null>(null);
  const requestKey = useRef(crypto.randomUUID()), working = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const changed = () => { requestKey.current = crypto.randomUUID(); setError(''); };
  return <DashboardOverlay layer={400} aria-label={`Report ${REPORT_TARGETS[targetType].toLowerCase()}`} onClose={busy ? null : onClose} className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-xl">
    <section className="support-surface max-h-[90dvh] w-full max-w-lg space-y-5 overflow-y-auto rounded-3xl border border-amber-300/50 bg-white p-5 text-slate-900 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-3"><div><p className="mb-2 text-xs font-bold uppercase tracking-wider text-blue-700">PineVela safety</p><h2 className="text-2xl font-extrabold">Report {REPORT_TARGETS[targetType].toLowerCase()}</h2>{targetName && <p className="mt-2 break-words text-sm text-slate-600">{targetName}</p>}</div><button type="button" disabled={busy} onClick={onClose} aria-label="Close report" className="shrink-0 rounded-xl p-2 text-slate-500 disabled:opacity-40"><X size={20} /></button></div>
      {!accountId ? <div className="space-y-4"><p className="text-sm leading-7 text-slate-600">Sign in to submit a report and receive updates in your account. For a sign-in problem, contact customer service through Help.</p><div className="flex flex-wrap gap-3"><Link to="/login" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Sign in</Link><Link to="/help" className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold">Open Help</Link></div></div>
        : result ? <div className="space-y-4"><p role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 font-semibold">Report received · {result.reference}</p><p className="text-sm leading-7 text-slate-600">Customer service will review your report. Any recommended account action goes to administrators for review. Your name and contact details are withheld from the reported account.</p><Link to={`/help?ticket=${encodeURIComponent(result.id)}`} className="inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Track your report</Link></div>
          : <form className="space-y-4" onSubmit={async event => {
            event.preventDefault(); if (working.current || targetType === 'message' && !consent) return;
            working.current = true; setBusy(true); setError('');
            try {
              const evidence = targetType === 'message' ? await getEvidence?.() : undefined;
              if (targetType === 'message' && (!evidence || evidence.messageId !== targetId)) throw Error('This message cannot be shared for review. Unlock the conversation on this device and try again.');
              const value = await supportApi('/api/reports', accountId, { targetType, targetId, reason, details: details.trim(), requestKey: requestKey.current, ...(evidence ? { evidence: { ...evidence, consent: true } } : {}) });
              if (mounted.current) setResult(value);
            } catch (failure: any) { if (mounted.current) setError(failure.message || 'Your report could not be submitted. Try again.'); }
            finally { working.current = false; if (mounted.current) setBusy(false); }
          }}>
            <p className="text-sm leading-7 text-slate-600">Tell us what happened. Include relevant order details, dates and the issue you noticed. Do not include passwords, payment PINs or your chat recovery phrase.</p>
            <label className="block text-sm font-bold">Reason<select required disabled={busy} value={reason} onChange={event => { changed(); setReason(event.target.value as ReportReason); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">{Object.entries(REPORT_REASONS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            <label className="block text-sm font-bold">What happened?<textarea required minLength={10} maxLength={6000} rows={5} disabled={busy} value={details} onChange={event => { changed(); setDetails(event.target.value); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
            {targetType === 'message' && <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-slate-700"><input type="checkbox" required disabled={busy} checked={consent} onChange={event => { changed(); setConsent(event.target.checked); }} className="mt-1 shrink-0" /><span>I agree to share this selected message with customer service and administrators as report evidence. They can read and retain this message for review. This does not share my recovery phrase or unlock other messages.</span></label>}
            <p className="text-xs leading-6 text-slate-500">Your report stays in your Help history. Reports are reviewed before an account action is considered.</p>
            {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
            <button type="submit" disabled={busy || details.trim().length < 10 || targetType === 'message' && !consent} className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Submitting report…' : 'Submit report'}</button>
          </form>}
    </section>
  </DashboardOverlay>;
}
