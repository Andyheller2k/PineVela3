import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import DashboardOverlay from './DashboardOverlay';
export default function AdminMessageNotice() {
  const { user } = useAuth(); const [notice, setNotice] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const acknowledged = useRef(new Set<string>());
  useEffect(() => {
    let stopped = false; setNotice(null); acknowledged.current.clear();
    const poll = async () => { if (!user?.id) return; try { const r = await sessionFetch('/api/admin-messages/pending'); if (r.ok) { const items = await r.json(); if (!stopped) setNotice(items.find((item: any) => !acknowledged.current.has(item.id)) || null); } } catch { /* Retry at next poll. */ } };
    poll(); const timer = setInterval(poll, 8000); window.addEventListener('pinevela-data-change', poll); return () => { stopped = true; clearInterval(timer); window.removeEventListener('pinevela-data-change', poll); };
  }, [user?.id, user?.role]);
  if (!notice) return null;
  const close = async () => { if (busy) return; setBusy(true); setError(''); try { const r = await sessionFetch(`/api/admin-messages/${encodeURIComponent(notice.id)}/ack`, { method: 'POST' }); if (!r.ok) throw new Error('Could not acknowledge this message. Try again.'); acknowledged.current.add(notice.id); setNotice((current: any) => current?.id === notice.id ? null : current); } catch (e: any) { setError(e.message); } finally { setBusy(false); } };
  const denied = ['error', 'danger', 'denied'].includes(notice.type);
  const Icon = notice.type === 'success' ? CheckCircle2 : denied ? XCircle : Info;
  return <DashboardOverlay aria-label="Message from PineVela administrators" onClose={close} className="flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className="w-full max-w-lg space-y-4 rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 shadow-2xl"><div className="flex items-start gap-3"><Icon className={notice.type === 'success' ? 'text-emerald-600' : denied ? 'text-red-600' : 'text-blue-600'} /><h3 className="flex-1 text-lg font-bold">{notice.title}</h3><button disabled={busy} aria-label="Close admin message" onClick={close}><X size={20} /></button></div><p className="whitespace-pre-wrap text-sm text-slate-700">{notice.message}</p><p className="text-xs text-slate-500">This message remains in your Notifications tab.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}<button disabled={busy} onClick={close} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white">{busy ? 'Saving…' : 'Got it'}</button></div></DashboardOverlay>;
}
