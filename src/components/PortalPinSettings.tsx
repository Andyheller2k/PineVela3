import { useEffect,useRef,useState,type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';


export default function PortalPinSettings() {
  const { user } = useAuth();
  if ((!user) || !['student', 'merchant'].includes(user.role)) return null;
  return <OwnPortalPinSettings key={user.id} contextId={user.id} />;
}

function OwnPortalPinSettings({ contextId }: { contextId: string }) {
  const { logout } = useAuth(), navigate = useNavigate();
  const mounted = useRef(false);
  const [status, setStatus] = useState<{ portalPinEnabled: boolean } | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [complete, setComplete] = useState(false);
  const [currentPin, setCurrentPin] = useState(''), [newPin, setNewPin] = useState(''), [confirmPin, setConfirmPin] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  useEffect(() => {
    let active = true;
    setError('');
    sessionFetch('/api/auth/portal-security', { headers: { 'X-PineVela-Profile-Context': contextId } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Portal security could not load.');
        if (active) setStatus(data);
      }).catch(e => { if (active) setError(e.message || 'Portal security could not load.'); });
    return () => { active = false; };
  }, [contextId, reload]);

  async function signIn() { if (await logout()) navigate('/login', { replace: true }); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (newPin !== confirmPin) { setError('The new PINs do not match.'); return; }
    setBusy(true); setError('');
    try {
      const response = await sessionFetch('/api/auth/portal-pin', { method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PineVela-Profile-Context': contextId },
        body: JSON.stringify({ currentPin, newPin }) });
      const data = await response.json();
      if (!response.ok || !data.success || !data.signInRequired) throw new Error(data.error || 'The PIN change was not confirmed.');
      if (mounted.current) { setCurrentPin(''); setNewPin(''); setConfirmPin(''); setComplete(true); }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : 'The PIN change failed. Refresh your account before retrying.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  const input = 'mt-1 block min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100';
  return <section className="rounded-2xl border border-blue-200 bg-white/80 p-5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
    <h3 className="text-base font-semibold">Portal access PIN</h3>
    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Resident and seller portals sharing a student email use separate PINs. Changing this PIN leaves the email password and the other portal unchanged.</p>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
    {!status ? error ? <button type="button" className="mt-3 min-h-11 rounded-xl border border-blue-300 px-4" onClick={() => setReload(value => value + 1)}>Retry loading</button>
      : <p role="status" className="mt-3">Loading portal security…</p>
      : complete ? <div className="mt-4 space-y-3"><p role="status">Your PIN has changed. Sign in again to use this portal.</p><button type="button" onClick={() => void signIn()} className="min-h-11 rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">Sign in again</button></div>
      : !status.portalPinEnabled ? <p className="mt-3">This account uses its own verified email login and does not require a portal PIN.</p>
      : <form onSubmit={submit} className="mt-4 space-y-4">
        <label className="block font-medium">Current portal PIN<input className={input} aria-label="Current portal PIN" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required disabled={busy} value={currentPin} onChange={e => setCurrentPin(e.target.value)} /></label>
        <label className="block font-medium">New portal PIN<input className={input} aria-label="New portal PIN" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required disabled={busy} value={newPin} onChange={e => setNewPin(e.target.value)} /></label>
        <label className="block font-medium">Confirm new portal PIN<input className={input} aria-label="Confirm new portal PIN" type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required disabled={busy} value={confirmPin} onChange={e => setConfirmPin(e.target.value)} /></label>
        <p className="text-sm text-slate-600 dark:text-slate-300">Use 6–12 digits. Earlier sessions for this portal will require a fresh sign-in.</p>
        <button type="submit" disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Updating PIN…' : 'Update portal PIN'}</button>
      </form>}
  </section>;
}
