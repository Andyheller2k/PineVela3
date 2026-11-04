import { useEffect, useRef, useState } from 'react';
import { KeyRound, Copy, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardOverlay from './DashboardOverlay';
import { sessionFetch } from '../lib/session';
import { useClipboardFeedback } from '../lib/useClipboardFeedback';
import { normalizeManagerKeyInput } from '../lib/managerKeyInput';

type Challenge = { execute: (key: string) => Promise<Response>; resolve: (response: Response) => void; reject: (error: Error) => void; label?: string };
export default function ManagerSecretKey() {
  const { user } = useAuth();
  const [issued, setIssued] = useState(''), [saved, setSaved] = useState(false), [request, setRequest] = useState<Challenge | null>(null);
  const [key, setKey] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const queue = useRef<Challenge[]>([]), current = useRef<Challenge | null>(null);
  const clipboard = useClipboardFeedback();
  const advance = () => { const item = queue.current.shift() || null; current.current = item; setRequest(item); setKey(''); setError(''); };
  useEffect(()=>{
    const receive=(event:Event)=>{
      const value=(event as CustomEvent<{key:string}>).detail?.key;
      if(user?.role==='manager' && typeof value==='string' && /^[0-9]{6}$/.test(value)) {
        setIssued(value);setSaved(false);setError('');
      }
    };
    window.addEventListener('pinevela-manager-code-issued',receive);
    return()=>window.removeEventListener('pinevela-manager-code-issued',receive);
  },[user?.id,user?.role]);
  useEffect(() => {
    let stopped = false, checking = false;
    setIssued(''); setSaved(false);
    const check = async () => {
      if (stopped || checking || user?.role !== 'manager') return; checking = true;
      try {
        const status = await sessionFetch('/api/manager/secret-key'); const info = status.ok && await status.json();
        if (!stopped && info?.available && info.issueRequired) {
          const response = await sessionFetch('/api/manager/secret-key/issue', { method: 'POST' });
          const data = await response.json(); if (!stopped && response.ok) { setIssued(data.key); setSaved(false); setError(''); }
        }
      } catch { /* A failed connection does not create a substitute key. */ }
      finally { checking = false; }
    };
    check(); const timer = setInterval(check, 8000);
    return () => { stopped = true; clearInterval(timer); };
  }, [user?.id, user?.role]);
  useEffect(() => {
    const receive = (event: Event) => {
      event.preventDefault(); // Claim the cancelable challenge before queuing it.
      const item = (event as CustomEvent<Challenge>).detail;
      if (user?.role !== 'manager') { item.reject(new Error('Sign in to your manager account.')); return; }
      queue.current.push(item); if (!current.current) advance();
    };
    window.addEventListener('pinevela-manager-key', receive);
    return () => { window.removeEventListener('pinevela-manager-key', receive); current.current?.reject(new Error('Manager authorization cancelled.')); queue.current.forEach(item => item.reject(new Error('Manager authorization cancelled.'))); queue.current = []; current.current = null; setRequest(null); };
  }, [user?.id, user?.role]);
  const cancel = () => { if (busy) return; request?.reject(new Error('Manager authorization cancelled. No changes were made.')); advance(); };
  const card = 'w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 shadow-2xl space-y-4';
  return <>
    {request && <DashboardOverlay aria-label="Authorize manager action" onClose={busy ? null : cancel} className="flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><form className={card} onSubmit={async e => {
      e.preventDefault(); if (busy) return; setBusy(true); setError('');
      let submittedKey: string;
      try { submittedKey = normalizeManagerKeyInput(key); }
      catch (failure: any) { setError(failure.message); setBusy(false); return; }
      try {
        const response = await request.execute(submittedKey);
        const body = await response.clone().json().catch(() => null);
        if (!response.ok && body?.managerKeyRequired) { setError(body.error || 'Invalid manager secret key. Check and try again.'); return; }
        request.resolve(response); advance();
      }
      catch (failure: any) { request.reject(failure instanceof Error ? failure : new Error('Manager action failed.')); advance(); }
      finally { setBusy(false); }
    }}><div className="flex justify-between gap-3"><h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} />Authorize manager action</h3><button type="button" aria-label="Close authorization" disabled={busy} onClick={cancel}><X size={20} /></button></div><p className="text-sm text-slate-600">Enter your saved manager code or existing key to {request.label || 'confirm this change'}.</p><label className="block text-sm font-semibold">Manager authorization code<input required type="password" autoComplete="off" placeholder="6-digit code or existing key" maxLength={128} value={key} onChange={e => setKey(e.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 p-3" />{error && <span role="alert" className="mt-2 block rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</span>}</label><button disabled={busy || !key} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Confirm change'}</button></form></DashboardOverlay>}
    {issued && <DashboardOverlay aria-label="Save your manager authorization code" onClose={saved ? () => setIssued('') : null} className="flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className={card}><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} />Save your authorization code</h3>{saved && <button aria-label="Close key card" onClick={() => setIssued('')}><X size={20} /></button>}</div><p className="text-sm text-slate-600">Save this six-digit code somewhere private. It authorizes sensitive manager actions. It is shown only once; a lost code requires administrator recovery.</p><input aria-label="Your manager authorization code" readOnly value={issued} className="w-full rounded-xl border border-blue-200 p-4 text-center font-mono text-3xl font-bold tracking-[0.3em]" /><button onClick={async () => { if (await clipboard.copy('manager-secret', issued)) setError(''); else setError('Select and copy the key manually.'); }} className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 font-bold text-blue-800"><Copy size={16} />{clipboard.copiedId === 'manager-secret' ? 'Copied' : 'Copy code'}</button>{error && <p role="alert">{error}</p>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved this code securely.</label><button disabled={!saved} onClick={() => setIssued('')} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">Continue</button></div></DashboardOverlay>}
  </>;
}
