import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import PineLogo from './PineLogo';

export default function MaintenanceReturnNotice() {
  const { user } = useAuth();
  return <MaintenanceReturnNoticeContent key={`${user?.role || ''}:${user?.id || 'signed-out'}`} />;
}
function MaintenanceReturnNoticeContent() {
  const { user } = useAuth();
  const client = useQueryClient();
  const dialog = useRef<HTMLDialogElement>(null);
  const mounted = useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const queryKey = ['maintenance-return-notice', user?.role, user?.id];
  const { data, dataUpdatedAt } = useQuery<{ serverTime: string; notice: { id: string; message: string; expiresAt: string } | null }>({
    queryKey, enabled: !!user && user.role !== 'admin', refetchInterval: 5000,
    queryFn: async () => {
      const response = await sessionFetch('/api/auth/maintenance-notice');
      if (!response.ok) throw new Error('Notice could not load.');
      return response.json();
    },
  });
  const notice = user?.role !== 'admin' ? data?.notice : null;
  useEffect(() => {
    if (!notice || !data?.serverTime) return;
    const remaining = Date.parse(notice.expiresAt) - Date.parse(data.serverTime) - Math.max(0,Date.now()-dataUpdatedAt);
    if (!Number.isFinite(remaining) || remaining <= 0) { client.setQueryData(queryKey, { ...data, notice: null }); return; }
    const timer = window.setTimeout(() => client.setQueryData(queryKey, { ...data, notice: null }), remaining);
    return () => window.clearTimeout(timer);
  }, [notice?.id, notice?.expiresAt, data?.serverTime, dataUpdatedAt, user?.id, user?.role, client]);
  useEffect(() => {
    const element = dialog.current;
    if (notice && element && !element.open) element.showModal();
    return () => element?.close();
  }, [notice?.id, user?.id, user?.role]);
  async function dismiss() {
    if (!notice || busy) return;
    setBusy(true); setError('');
    try {
      await client.cancelQueries({ queryKey, exact: true });
      const response = await sessionFetch('/api/auth/maintenance-notice/dismiss', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ noticeId: notice.id }),
      });
      if (!mounted.current) return;
      if (!response.ok) throw new Error('Please try closing this message again.');
      client.setQueryData(queryKey, { notice: null });
    } catch { if (mounted.current) setError('Please try closing this message again.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  if (!notice) return null;
  return createPortal(<dialog ref={dialog} aria-labelledby="maintenance-return-title" onCancel={event => { event.preventDefault(); void dismiss(); }}
    className="maintenance-return-dialog m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-3xl border border-blue-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-blue-950/50 backdrop:backdrop-blur-sm">
    <div className="relative overflow-hidden p-6 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <span className="rounded-2xl border border-blue-200 bg-blue-50 p-3"><PineLogo size={36} hideText /></span>
        <button type="button" autoFocus disabled={busy} aria-label="Close administrator message" onClick={() => void dismiss()} className="rounded-full p-2 text-slate-500 hover:bg-blue-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50"><X size={20} /></button>
      </div>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-blue-700"><CheckCircle2 size={18} />A message from PineVela</div>
      <h2 id="maintenance-return-title" className="text-2xl font-bold tracking-tight">Welcome back</h2>
      <p className="mt-4 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{notice.message}</p>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
  </dialog>, document.body);
}
