import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { compressImageFileToLowRes } from '../lib/imageOptimizer';
import { uploadMaintenancePhoto } from '../lib/maintenanceMedia';
import DashboardOverlay from './DashboardOverlay';

export default function QuickMaintenanceReport({ activeComplaint, hidden, onSubmitted }: {
  activeComplaint?: any; hidden?: boolean; onSubmitted: (issue: any) => void;
}) {
  const { apiFetch } = useAuth();
  const camera = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [photo, setPhoto] = useState(''), [title, setTitle] = useState(''), [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const close = () => { if (!busy) { setPhoto(''); setTitle(''); setDetails(''); setError(''); } };
  async function capture(file?: File) {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) throw new Error('Choose a photograph smaller than 20 MB.');
      const bitmap = await createImageBitmap(file); bitmap.close();
      const image = await compressImageFileToLowRes(file, 1280, 0.75);
      if (image.length > 3 * 1024 * 1024) throw new Error('This photograph is too large. Please take another.');
      if (mounted.current) setPhoto(image);
    } catch (err: any) { setError(err.message || 'The photograph could not be opened. Please try again.'); }
    finally { setBusy(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !photo || !title.trim()) return;
    setBusy(true); setError('');
    try {
      const uploadedPhoto = await uploadMaintenancePhoto(apiFetch,photo);
      if (mounted.current) setPhoto(uploadedPhoto);
      const issue = await apiFetch('/api/issue-reports', { method: 'POST', body: JSON.stringify({ title: title.trim(), description: details.trim(), photos: [uploadedPhoto], category: 'General', urgency: 'Medium' }) });
      if (!issue?.id) throw new Error('The complaint could not be filed. Please sign in again.');
      if (mounted.current) { setPhoto(''); setTitle(''); setDetails(''); onSubmitted(issue); }
    } catch (err: any) { setError(err.message || 'The complaint could not be filed. Your photograph is still here.'); }
    finally { setBusy(false); }
  }
  const control = 'mt-1 w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-900';
  return <>
    <input ref={camera} data-maintenance-camera type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { void capture(event.target.files?.[0]); event.target.value = ''; }} />
    {!hidden && !photo && <div className="fixed bottom-[calc(var(--pv-mobile-nav-height,4rem)+.875rem)] left-4 z-40 max-w-[calc(100%-5rem)] lg:hidden">
      <button aria-label="Log maintenance with camera" title={activeComplaint ? `Active complaint: ${activeComplaint.title}` : 'Take a photograph and report an issue'} disabled={busy} onClick={() => { if (activeComplaint) setError(`Your complaint “${activeComplaint.title}” is still active. Wait for its resolution before filing another.`); else camera.current?.click(); }} className="flex min-h-12 items-center gap-2 rounded-full bg-blue-700 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-60"><Camera size={20} />{busy ? 'Opening photo…' : 'Log maintenance'}</button>
    </div>}
    {!photo && error && <DashboardOverlay aria-label="Maintenance reporting notice" onClose={() => setError('')} className="flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-5 text-slate-900"><p role="alert" className="text-sm">{error}</p><button onClick={() => setError('')} className="rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">Close</button></div></DashboardOverlay>}
    {photo && <DashboardOverlay aria-label="Quick maintenance complaint" onClose={close} className="flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl bg-white p-5 text-slate-900">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold">Log maintenance</h2><button type="button" aria-label="Close quick complaint" disabled={busy} onClick={close} className="rounded-xl p-2"><X size={20} /></button></div>
        <img src={photo} alt="Complaint photograph preview" className="max-h-52 w-full rounded-xl object-contain" />
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="text-sm font-semibold text-blue-700">Retake photograph</button>
        <label className="block text-sm font-semibold">Issue title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} className={control} /></label>
        <label className="block text-sm font-semibold">Details (optional)<textarea maxLength={4000} rows={3} value={details} onChange={event => setDetails(event.target.value)} className={control} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={busy || !title.trim()} className="w-full rounded-xl bg-blue-700 p-3 font-bold text-white disabled:opacity-50">{busy ? 'Filing complaint…' : 'File complaint'}</button>
      </form>
    </DashboardOverlay>}
  </>;
}
