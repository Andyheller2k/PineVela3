import { useEffect, useRef, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import { REPORT_ACTIONS, REPORT_REASONS, REPORT_STATUSES, REPORT_TARGETS, type EntityReport, type ReportAction } from '../../reportModel';
import { useAuth } from '../context/AuthContext';
import { supportApi } from '../lib/supportApi';

export function ReportSummary({ report, internal = false }: { report: EntityReport; internal?: boolean }) {
  return <div className="space-y-4 text-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-blue-700">{REPORT_TARGETS[report.targetType]} report</p><h3 className="mt-2 break-words text-lg font-extrabold">{report.targetName}</h3></div><span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">{REPORT_STATUSES[report.status]}</span></div>
    <p className="font-bold">{REPORT_REASONS[report.reason]}</p><p className="whitespace-pre-wrap break-words leading-7 text-slate-600">{report.details}</p>
    {internal && <dl className="space-y-2 break-all text-xs text-slate-500"><div><dt className="inline font-bold">Reported entity: </dt><dd className="inline">{report.targetId}</dd></div><div><dt className="inline font-bold">Account ID: </dt><dd className="inline">{report.targetContextId}</dd></div><div><dt className="inline font-bold">Account type: </dt><dd className="inline">{report.targetKind}</dd></div></dl>}
    {internal && report.evidence && <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4"><h4 className="font-bold">Message shared by the reporter</h4><p className="text-xs text-slate-500">{report.evidence.senderName} · {new Date(report.evidence.createdAt).toLocaleString()}</p><blockquote className="whitespace-pre-wrap break-words border-l-2 border-amber-400 pl-3 leading-7">{report.evidence.text}</blockquote><p className="text-xs leading-6 text-slate-500">The reporter consented to sharing this selected message for review. Other encrypted messages remain private.</p></div>}
    {internal && report.recommendation && <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 p-4"><h4 className="font-bold">Customer-service recommendation: {REPORT_ACTIONS[report.recommendation.action]}</h4><p className="whitespace-pre-wrap break-words leading-7 text-slate-600">{report.recommendation.reason}</p><p className="text-xs text-slate-500">Submitted {new Date(report.recommendation.createdAt).toLocaleString()}</p></div>}
    {internal && report.decision && <div className="space-y-2 rounded-2xl border border-slate-200 p-4"><h4 className="font-bold">Administrator assessment: {report.decision.decision === 'dismiss' ? 'Review closed' : 'Escalated for account review'}</h4><p className="whitespace-pre-wrap break-words leading-7 text-slate-600">{report.decision.reason}</p>{report.decision.proposalId && <p className="break-all text-xs text-slate-500">Governed proposal: {report.decision.proposalId}</p>}</div>}
  </div>;
}

/** Report evidence is fetched only inside an authorized customer-service thread. */
export default function ReportReview({ ticketId }: { ticketId: string }) {
  const { user } = useAuth(), accountId = user?.id;
  const [report, setReport] = useState<EntityReport | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState<ReportAction>('no_action'), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const mounted = useRef(true), working = useRef(false), requestKey = useRef(crypto.randomUUID());
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setReport(null); setError('');
    supportApi(`/api/customer-service/reports/${encodeURIComponent(ticketId)}`, accountId, undefined, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) setReport(value.report); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [ticketId, accountId, refresh]);
  if (error && !report) return <div role="alert" className="rounded-2xl border border-rose-200 p-4 text-sm text-rose-800">Report details could not load: {error}<button type="button" onClick={() => setRefresh(value => value + 1)} className="ml-3 font-bold underline">Retry</button></div>;
  if (!report) return null;
  return <section aria-label="Reported content review" className="space-y-5 rounded-2xl border border-amber-300/60 p-4 sm:p-5"><p className="flex items-center gap-2 font-extrabold text-blue-800"><Flag size={18} />Safety report</p><ReportSummary report={report} internal />
    <p className="text-xs leading-6 text-slate-500">Reporter identity stays inside customer service and administration. Recommendations do not ban, delete or change an account; administrators must review any proposed action.</p>
    {report.status === 'submitted' && <form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={async event => {
      event.preventDefault(); if (working.current) return; working.current = true; setBusy(true); setError('');
      try { const value = await supportApi(`/api/customer-service/reports/${encodeURIComponent(ticketId)}/recommend`, accountId, { action, reason: reason.trim(), version: report.version, requestKey: requestKey.current }); if (mounted.current) { setReport(value.report); setReason(''); requestKey.current = crypto.randomUUID(); } }
      catch (failure: any) { if (mounted.current) setError(failure.message); }
      finally { working.current = false; if (mounted.current) setBusy(false); }
    }}>
      <label className="block text-sm font-bold">Recommended action<select disabled={busy} value={action} onChange={event => { setAction(event.target.value as ReportAction); requestKey.current = crypto.randomUUID(); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm">{Object.entries(REPORT_ACTIONS).filter(([value]) => value !== 'remove_listing' || report.targetType === 'listing').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="block text-sm font-bold">Review findings<textarea required minLength={10} maxLength={2000} rows={4} disabled={busy} value={reason} onChange={event => { setReason(event.target.value); requestKey.current = crypto.randomUUID(); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /><span className="mt-2 block text-xs font-normal leading-6 text-slate-500">Explain the evidence and why this action is appropriate. Administrators can assess or reject the recommendation.</span></label>
      {error && <p role="alert" className="text-sm text-rose-800">{error}<button type="button" onClick={() => setRefresh(value => value + 1)} className="ml-3 inline-flex items-center gap-1 font-bold underline"><RefreshCw size={13} />Refresh review</button></p>}
      <button type="submit" disabled={busy || reason.trim().length < 10} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Submitting recommendation…' : 'Send recommendation to administrators'}</button>
    </form>}
  </section>;
}
