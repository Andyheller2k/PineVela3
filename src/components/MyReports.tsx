import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flag, RefreshCw } from 'lucide-react';
import { REPORT_STATUSES, REPORT_TARGETS, type EntityReport } from '../../reportModel';
import { supportApi } from '../lib/supportApi';

export default function MyReports({ accountId }: { accountId: string }) {
  const [reports, setReports] = useState<EntityReport[] | null>(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setReports(null); setError('');
    supportApi('/api/reports', accountId, undefined, 'GET', controller.signal).then(value => { if (!controller.signal.aborted) setReports(value.reports); }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [accountId, refresh]);
  return <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7" aria-label="Your safety reports"><div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Flag size={18} />Your safety reports</h2><button type="button" aria-label="Refresh your safety reports" onClick={() => setRefresh(value => value + 1)} className="rounded-xl border border-slate-200 p-2 text-blue-700"><RefreshCw size={16} /></button></div><p className="text-xs leading-6 text-slate-500">Use Report on a profile, store, item, service or message. Customer service reviews the issue and sends any recommended account action to administrators.</p>
    {error ? <p role="alert" className="text-sm text-rose-800">{error}</p> : reports === null ? <p role="status" className="text-sm text-slate-500">Loading your reports…</p> : reports.length ? <ul className="space-y-3">{reports.map(report => <li key={report.ticketId}><Link to={`/help?ticket=${encodeURIComponent(report.ticketId)}`} className="block rounded-2xl border border-slate-200 p-4"><span className="text-xs font-bold text-blue-700">{REPORT_TARGETS[report.targetType]} · {REPORT_STATUSES[report.status]}</span><span className="mt-2 block break-words text-sm font-bold">{report.targetName}</span><span className="mt-2 block text-xs text-slate-500">Open report and follow up</span></Link></li>)}</ul> : <p className="text-sm text-slate-500">You have not submitted any safety reports.</p>}
  </section>;
}
