import { useEffect, useState } from 'react';
import { Flag, RefreshCw } from 'lucide-react';
import { REPORT_REASONS, REPORT_STATUSES, REPORT_TARGETS, type EntityReport } from '../../reportModel';
import { supportApi } from '../lib/supportApi';
import AutomaticContentChecks from './AutomaticContentChecks';

export default function CustomerServiceReports({ accountId, onSelect }: { accountId: string; onSelect: (ticketId: string) => void }) {
  const [reports, setReports] = useState<EntityReport[] | null>(null), [status, setStatus] = useState(''), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); setReports(null); setError('');
    const query = new URLSearchParams({ page: String(page), status });
    supportApi(`/api/customer-service/reports?${query}`, accountId, undefined, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) { setReports(value.reports); setHasMore(value.hasMore); } }).catch(failure => { if (!controller.signal.aborted) { setError(failure.message); setReports([]); setHasMore(false); } });
    return () => controller.abort();
  }, [accountId, refresh, page, status]);
  const shown = reports?.filter(report => !status || report.status === status);
  return <section aria-label="Customer-service safety reports" className="space-y-5">
    <AutomaticContentChecks key={accountId} accountId={accountId} />
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="flex items-center gap-2 text-2xl font-extrabold"><Flag size={22} />Safety reports</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">Review reported profiles, stores, items, services and messages. Open a case to review evidence, contact the reporter and send a recommendation to administrators.</p><p className="mt-2 text-xs text-slate-500">Showing 25 reports per page, with active reviews first.</p></div><button type="button" aria-label="Refresh safety reports" onClick={() => setRefresh(value => value + 1)} className="rounded-xl border border-slate-200 p-3 text-blue-700"><RefreshCw size={18} /></button></div>
    <label className="block text-xs font-bold">Report stage<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }} className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="">All stages</option>{Object.entries(REPORT_STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {reports === null ? <p role="status" className="text-sm text-slate-500">Loading safety reports…</p> : shown?.length ? <ul className="grid gap-4 md:grid-cols-2">{shown.map(report => <li key={report.ticketId}><button type="button" data-report-ticket-id={report.ticketId} onClick={() => onSelect(report.ticketId)} className="h-full w-full rounded-2xl border border-slate-200 bg-white p-5 text-left"><span className="block text-xs font-bold text-blue-700">{REPORT_TARGETS[report.targetType]} · {REPORT_STATUSES[report.status]}</span><span className="mt-3 block break-words font-extrabold">{report.targetName}</span><span className="mt-2 block text-sm text-slate-600">{REPORT_REASONS[report.reason]}</span><span className="mt-3 block break-all text-[11px] text-slate-500">Reported account: {report.targetContextId}</span><span className="mt-4 block text-xs font-bold text-blue-700">Open case & review</span></button></li>)}</ul> : <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No safety reports at this stage.</p>}
    <div className="flex items-center justify-between gap-3 text-sm"><button type="button" disabled={page === 0 || reports === null} onClick={() => setPage(value => value - 1)} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous reports</button><span className="text-xs text-slate-500">Page {page + 1}</span><button type="button" disabled={!hasMore || reports === null} onClick={() => setPage(value => value + 1)} className="rounded-xl border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next reports</button></div>
  </section>;
}
