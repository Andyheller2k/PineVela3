import { useEffect, useRef, useState } from 'react';
import DashboardOverlay from './DashboardOverlay';
import type { ApprovalRequest } from '../lib/approvalPrompt';
import { KeyRound } from 'lucide-react';

export default function ApprovalKeyPrompt() {
  const [request, setRequest] = useState<ApprovalRequest | null>(null);
  const active = useRef<ApprovalRequest | null>(null);
  const [key, setKey] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<ApprovalRequest>).detail;
      if (active.current) { next.reject(new Error('Finish the current approval first.')); return; }
      active.current = next; setRequest(next); setKey(''); setError('');
    };
    window.addEventListener('pinevela-approval-key', receive);
    return () => { window.removeEventListener('pinevela-approval-key', receive); active.current?.reject(new Error('Approval cancelled.')); };
  }, []);
  const cancel = () => { if (busy) return; request?.reject(new Error('Approval cancelled. No changes were made.')); active.current = null; setRequest(null); setKey(''); };
  if (!request) return null;
  return <DashboardOverlay aria-label="Authorize approval" onClose={busy ? null : cancel} className="flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm"><form className="max-h-[90dvh] w-full max-w-md space-y-4 overflow-y-auto rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 shadow-2xl" onSubmit={async event => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try { const result = await request.execute(key); if (!result || Array.isArray(result)) throw new Error('Your administrator session has ended. Sign in again.'); request.resolve(result); active.current = null; setRequest(null); setKey(''); }
    catch (failure: any) { setError(`Approval failed: ${failure.message || 'Please try again.'}`); setKey(''); }
    finally { setBusy(false); }
  }}><h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} />Authorize approval</h3><p className="text-sm text-slate-600">Enter your private approval key to approve this registration. Your settings key cannot authorize this action.</p>{error && <p role="alert" className="sticky top-0 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<label className="block text-sm font-semibold">Private approval key<input autoFocus required type="password" autoComplete="off" maxLength={128} value={key} onChange={event => setKey(event.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 bg-white p-3" /></label><div className="flex gap-3"><button disabled={busy || !key} className="rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy ? 'Approving…' : 'Approve with key'}</button><button type="button" disabled={busy} onClick={cancel} className="rounded-xl border border-blue-200 px-4 py-2">Cancel</button></div></form></DashboardOverlay>;
}
