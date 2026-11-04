import { useEffect, useRef, useState } from 'react';
import { KeyRound, Copy, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import DashboardOverlay from './DashboardOverlay';
import { sessionFetch } from '../lib/session';

type Challenge = { execute: (key: string) => Promise<Response>; resolve: (response: Response) => void; reject: (error: Error) => void };
export default function ManagerSecretKey() {
  const { user } = useAuth();
  const [issued, setIssued] = useState(''), [saved, setSaved] = useState(false), [request, setRequest] = useState<Challenge | null>(null);
  const [key, setKey] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const queue = useRef<Challenge[]>([]), current = useRef<Challenge | null>(null);
  const advance = () => { const item = queue.current.shift() || null; current.current = item; setRequest(item); setKey(''); setError(''); };
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
      try { const response = await request.execute(key); const body = await response.clone().json().catch(() => null); if (!response.ok && body?.managerKeyRequired) throw new Error(body.error); request.resolve(response); advance(); }
      catch (failure: any) { setError(failure.message); setKey(''); }
      finally { setBusy(false); }
    }}><div className="flex justify-between gap-3"><h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} />Authorize manager action</h3><button type="button" aria-label="Close authorization" disabled={busy} onClick={cancel}><X size={20} /></button></div><p className="text-sm text-slate-600">Enter your saved manager secret key to confirm this change.</p>{error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<label className="block text-sm font-semibold">Manager secret key<input required type="password" autoComplete="off" maxLength={128} value={key} onChange={e => setKey(e.target.value)} className="mt-2 w-full rounded-xl border border-blue-200 p-3" /></label><button disabled={busy || !key} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">{busy ? 'Checking…' : 'Confirm change'}</button></form></DashboardOverlay>}
    {issued && <DashboardOverlay aria-label="Save your manager secret key" onClose={saved ? () => setIssued('') : null} className="flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"><div className={card}><div className="flex items-center justify-between"><h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound size={20} />Save your secret key</h3>{saved && <button aria-label="Close key card" onClick={() => setIssued('')}><X size={20} /></button>}</div><p className="text-sm text-slate-600">Copy this key and save it somewhere private. It authorizes every change in your manager account. This key is shown only once; a lost key requires a petition to the admin board.</p><textarea aria-label="Your manager secret key" readOnly value={issued} className="w-full rounded-xl border border-blue-200 p-3 font-mono text-sm" /><button onClick={async () => { try { await navigator.clipboard.writeText(issued); setError(''); } catch { setError('Select and copy the key manually.'); } }} className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-2 font-bold text-blue-800"><Copy size={16} />Copy key</button>{error && <p role="alert">{error}</p>}<label className="flex gap-2 text-sm"><input type="checkbox" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved this key securely.</label><button disabled={!saved} onClick={() => setIssued('')} className="rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50">Continue</button></div></DashboardOverlay>}
  </>;
}
