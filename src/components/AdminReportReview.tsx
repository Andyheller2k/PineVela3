import { useEffect, useRef, useState } from 'react';
import { Copy, Flag, RefreshCw } from 'lucide-react';
import { REPORT_STATUSES, type EntityReport } from '../../reportModel';
import { useAuth } from '../context/AuthContext';
import { requestKeyedApproval } from '../lib/approvalPrompt';
import { supportApi } from '../lib/supportApi';
import { useClipboardFeedback } from '../lib/useClipboardFeedback';
import { ReportSummary } from './ReportReview';
import AutomaticContentChecks from './AutomaticContentChecks';

export default function AdminReportReview({ onOpenApprovals, onReviewAccount }: { onOpenApprovals?: () => void; onReviewAccount?: (report: EntityReport) => void }) {
  const { user } = useAuth(), accountId = user?.id;
  const [reports, setReports] = useState<EntityReport[] | null>(null), [selected, setSelected] = useState(''), [filter, setFilter] = useState('recommended');
  const [decision, setDecision] = useState<'dismiss' | 'escalate'>('escalate'), [reason, setReason] = useState(''), [proposalId, setProposalId] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const mounted = useRef(true), working = useRef(false);
  const clipboard = useClipboardFeedback();
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setReports(null); setError('');
    const query = new URLSearchParams({ page: String(page), status: filter });
    supportApi(`/api/admin/reports?${query}`, accountId, undefined, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) { setReports(value.reports); setHasMore(value.hasMore); } }).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setReports([]); setHasMore(false); } });
    return () => controller.abort();
  }, [accountId, refresh, page, filter]);
  const report = reports?.find(item => item.ticketId === selected);
  const filtered = reports?.filter(item => !filter || item.status === filter);
  return <section aria-label="Administrator safety report review" className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    {accountId && <AutomaticContentChecks key={accountId} accountId={accountId} />}
    <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-extrabold"><Flag size={20} />Reported accounts & marketplace safety</h2><p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">Review customer-service findings and assess the next step. An escalation records your assessment. Account sanctions continue through the existing administrator approval process.</p></div><button type="button" disabled={busy} aria-label="Refresh administrator report queue" onClick={() => setRefresh(value => value + 1)} className="shrink-0 rounded-xl border border-slate-200 p-3 text-blue-700"><RefreshCw size={17} /></button></div>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <label className="block text-xs font-bold">Report stage<select value={filter} disabled={busy} onChange={event => { setFilter(event.target.value); setPage(0); setSelected(''); }} className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="">All stages</option>{Object.entries(REPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {reports === null ? <p role="status" className="text-sm text-slate-500">Loading report reviews…</p> : !filtered?.length && !report ? <p className="text-sm text-slate-500">No reports at this stage.</p> : <div className={`grid items-start gap-5 ${report ? 'xl:grid-cols-[18rem_1fr]' : ''}`}>
      <ul className="space-y-3">{filtered.map(item => <li key={item.ticketId}><button type="button" data-report-ticket-id={item.ticketId} disabled={busy} aria-current={selected === item.ticketId ? 'page' : undefined} onClick={() => { setSelected(item.ticketId); setReason(''); setProposalId(''); setError(''); }} className="w-full rounded-2xl border border-slate-200 p-4 text-left"><span className="block text-xs font-bold text-blue-700">{REPORT_STATUSES[item.status]}</span><span className="mt-2 block break-words text-sm font-bold">{item.targetName}</span><span className="mt-2 block break-all text-[11px] text-slate-500">Account: {item.targetContextId}</span></button></li>)}</ul>
      {report && <div className="min-w-0 space-y-5 rounded-2xl border border-amber-200 p-4 sm:p-5"><ReportSummary report={report} internal />
        <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={async () => { if (!await clipboard.copy('reported-account', report.targetContextId)) setError('Copy is unavailable. Select the reported account ID above.'); else setError(''); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700"><Copy size={14} />{clipboard.copiedId === 'reported-account' ? 'Copied' : 'Copy reported account ID'}</button>{onReviewAccount && <button type="button" disabled={busy} onClick={() => onReviewAccount(report)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">Review reported account</button>}{onOpenApprovals && <button type="button" disabled={busy} onClick={onOpenApprovals} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">Open account approvals</button>}</div>
        {report.status === 'recommended' ? <form className="space-y-4 border-t border-slate-200 pt-5" onSubmit={event => {
          event.preventDefault(); if (working.current) return;
          void requestKeyedApproval(async privateKey => {
            if (!mounted.current || working.current) return; working.current = true; setBusy(true); setError('');
            try {
              const value = await supportApi(`/api/admin/reports/${report.ticketId}/decision`, accountId, { decision, reason: reason.trim(), version: report.version, privateKey, ...(decision === 'escalate' && proposalId.trim() ? { proposalId: proposalId.trim() } : {}) });
              if (mounted.current) { setReports(items => items?.map(item => item.ticketId === report.ticketId ? value.report : item) || []); setReason(''); setProposalId(''); }
              return value;
            } catch (failure: any) { if (mounted.current) setError(failure.message); throw failure; }
            finally { working.current = false; if (mounted.current) setBusy(false); }
          }).catch(() => {});
        }}>
          <label className="block text-sm font-bold">Your assessment<select disabled={busy} value={decision} onChange={event => setDecision(event.target.value as 'dismiss' | 'escalate')} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="escalate">Escalate for administrator action review</option><option value="dismiss">Close report without further account action</option></select></label>
          <label className="block text-sm font-bold">Assessment reason<textarea required disabled={busy} minLength={10} maxLength={2000} rows={4} value={reason} onChange={event => setReason(event.target.value)} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /></label>
          {decision === 'escalate' && <div className="space-y-3"><p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-6 text-amber-900">Use Accounts → account review or Approvals to propose and apply an appropriate sanction. Required administrator votes, founder approval and deletion safeguards still apply. Saving this assessment does not apply the recommendation.</p><label className="block text-sm font-bold">Existing account proposal ID <span className="font-normal text-slate-500">(optional)</span><input value={proposalId} disabled={busy} onChange={event => setProposalId(event.target.value)} pattern="[a-fA-F0-9-]{36}" maxLength={36} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm" /><span className="mt-2 block text-xs font-normal leading-6 text-slate-500">Link a proposal already created for this reported account. The server checks the account and proposal relationship.</span></label></div>}
          <button type="submit" disabled={busy || reason.trim().length < 10} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Saving assessment…' : 'Save assessment with approval key'}</button>
        </form> : <p className="text-xs leading-6 text-slate-500">{report.status === 'submitted' ? 'Customer service must submit its findings and recommendation before an administrator can record an assessment.' : 'This assessment is recorded. Any linked account proposal remains subject to its own votes and application status.'}</p>}
      </div>}
    </div>}
    <div className="flex items-center justify-between gap-3 text-sm"><button type="button" disabled={busy || page === 0 || reports === null} onClick={() => { setPage(value => value - 1); setSelected(''); }} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous reports</button><span className="text-xs text-slate-500">Page {page + 1}</span><button type="button" disabled={busy || !hasMore || reports === null} onClick={() => { setPage(value => value + 1); setSelected(''); }} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next reports</button></div>
  </section>;
}
