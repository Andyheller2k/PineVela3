import { useEffect, useRef, useState } from 'react';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supportApi } from '../lib/supportApi';
import { sessionFetch } from '../lib/session';
import { requestKeyedApproval } from '../lib/approvalPrompt';

type Check = { id: string; purpose: string; verdict: string; accountId: string; name: string; ticketId: string;
  text: string | null; hasImage: boolean; decision: string | null; reason: string | null; createdAt: string };
const topics: Record<string, string> = { avatar: 'Profile picture', market_image: 'Marketplace photo', listing_text: 'Listing text', store_text: 'Store profile' };
function ReviewImage({ id, accountId }: { id: string; accountId: string }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    setUrl(''); setError('');
    void (async () => {
      try {
        const response = await sessionFetch(`/api/customer-service/content-checks/${id}/image`, { headers: { 'X-PineVela-Profile-Context': accountId }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) });
        if (!response.ok) throw new Error('This review photo could not be opened. Refresh your account and retry.');
        const blob = await response.blob(); if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
      } catch (failure: any) { if (!controller.signal.aborted) setError(failure.message); }
    })();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, accountId]);
  return error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : url ? <img src={url} alt="Private submitted photo for content review" className="max-h-80 max-w-full rounded-xl object-contain" /> : <p role="status" className="text-sm text-slate-500">Opening private review photo…</p>;
}
export default function AutomaticContentChecks({ accountId }: { accountId: string }) {
  const { user } = useAuth(), [rows, setRows] = useState<Check[] | null>(null), [page, setPage] = useState(0), [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0), [selected, setSelected] = useState(''), [showImage, setShowImage] = useState(false);
  const [error, setError] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const active = useRef(accountId), working = useRef(false); active.current = accountId;
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController(); setRows(null); setError(''); setSelected(''); setShowImage(false); setReason('');
    supportApi(`/api/customer-service/content-checks?page=${page}`, accountId, undefined, 'GET', controller.signal)
      .then(data => { if (!controller.signal.aborted) { setRows(data.checks); setHasMore(data.hasMore); } })
      .catch(failure => { if (!controller.signal.aborted) { setRows([]); setHasMore(false); setError(failure.message); } });
    return () => controller.abort();
  }, [accountId, page, refresh]);
  useEffect(() => { active.current = accountId; return () => { active.current = ''; }; }, [accountId]);
  const item = rows?.find(row => row.id === selected), administrator = user?.role === 'admin';
  let submittedText = item?.text || '';
  try { if (submittedText) submittedText = JSON.parse(submittedText).filter(Boolean).join('\n\n'); } catch {}
  const decide = (decision: 'approved' | 'blocked') => {
    if (!item || working.current) return;
    const checkId = item.id, currentAccount = accountId;
    void requestKeyedApproval(async privateKey => {
      if (active.current !== currentAccount || working.current) return;
      working.current = true; setBusy(true); setError('');
      try {
        await supportApi(`/api/admin/content-checks/${checkId}/decision`, currentAccount, { decision, reason: reason.trim(), privateKey });
        if (active.current === currentAccount) setRefresh(value => value + 1);
      } catch (failure: any) { if (active.current === currentAccount) setError(failure.message); throw failure; }
      finally { working.current = false; if (active.current === currentAccount) setBusy(false); }
    }).catch(() => undefined);
  };
  return <section aria-label="Automatic content safety checks" className="space-y-4 rounded-2xl border border-amber-200 bg-white p-4 sm:p-5">
    <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck size={19} />Automatic content checks</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Review photos and marketplace text held by the explicit-content checks. Open the linked support case to contact the user or recommend an account review.</p></div><button type="button" aria-label="Refresh automatic content checks" disabled={busy} onClick={() => setRefresh(value => value + 1)} className="rounded-xl border border-slate-200 p-3 text-blue-700"><RefreshCw size={16} /></button></div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {rows === null ? <p role="status" className="text-sm text-slate-500">Loading content checks…</p> : rows.length ? <ul className="grid gap-3 sm:grid-cols-2">{rows.map(row => <li key={row.id}><button type="button" data-content-check-id={row.id} disabled={busy} aria-expanded={selected === row.id} onClick={() => { setSelected(selected === row.id ? '' : row.id); setShowImage(false); setReason(''); }} className="h-full w-full rounded-xl border border-slate-200 p-4 text-left"><span className="text-xs font-bold text-blue-700">{topics[row.purpose] || 'Content'} · {row.decision ? `Reviewed: ${row.decision}` : row.verdict === 'review' ? 'Needs review' : 'Blocked'}</span><span className="mt-2 block break-words text-sm font-extrabold">{row.name}</span><span className="mt-1 block break-all text-[11px] text-slate-500">Account: {row.accountId}</span></button></li>)}</ul> : <p className="text-sm text-slate-500">No flagged submissions to review.</p>}
    {item && <div className="space-y-4 rounded-xl border border-amber-200 p-4">
      <p className="text-sm font-bold">{topics[item.purpose]} review · {item.name}</p>
      {submittedText && <p className="whitespace-pre-wrap break-words rounded-xl border border-slate-200 p-3 text-sm">{submittedText}</p>}
      {item.hasImage && <><button type="button" onClick={() => setShowImage(value => !value)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-700">{showImage ? 'Hide review photo' : 'Review flagged photo'}</button>{showImage && <ReviewImage key={`${accountId}:${item.id}`} accountId={accountId} id={item.id} />}</>}
      <a href={`#/customer-service?ticket=${item.ticketId}`} className="block text-sm font-bold text-blue-700 underline">Open support case & recommendations</a>
      {item.decision ? <p className="text-sm text-slate-600">Recorded decision: {item.decision}. {item.reason}</p> : administrator ? <div className="space-y-3"><label className="block text-sm font-bold">Review explanation<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={10} maxLength={2000} disabled={busy} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm font-normal" /></label><div className="flex flex-wrap gap-3"><button type="button" disabled={busy || reason.trim().length < 10} onClick={() => decide('approved')} className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Approve this content</button><button type="button" disabled={busy || reason.trim().length < 10} onClick={() => decide('blocked')} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-50">Keep blocked</button></div><p className="text-xs leading-5 text-slate-500">Approval lets the user retry the same submission. It does not publish it or change the account automatically.</p></div> : <p className="text-xs leading-5 text-slate-500">An administrator records the final content decision. Use the support case to document your findings.</p>}
    </div>}
    {(page > 0 || hasMore) && <div className="flex items-center justify-between gap-3"><button type="button" disabled={!page || busy || rows === null} onClick={() => setPage(value => value - 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Previous checks</button><span className="text-xs text-slate-500">Page {page + 1}</span><button type="button" disabled={!hasMore || busy || rows === null} onClick={() => setPage(value => value + 1)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-40">Next checks</button></div>}
  </section>;
}
