import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import { NATIVE_APP } from '../native/environment';
import DashboardOverlay from './DashboardOverlay';

type Status = { active: boolean; mode?: 'login' | 'signup'; provider?: 'google'; fresh?: boolean };
const marker = 'pinevela:mobile-handoff-active';

export default function MobileBrowserReturn() {
  return NATIVE_APP ? null : <BrowserReturn />;
}

/** A boolean tab marker survives Google navigation; it contains no credentials. */
function BrowserReturn() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>({ active: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [approvedReturn, setApprovedReturn] = useState('');
  const flagged = new URLSearchParams(location.search).get('mobile') === '1';
  const stayInBrowser = () => {
    if (busy) return;
    try { sessionStorage.removeItem(marker); } catch {}
    setStatus({ active: false }); setError('');
    const params = new URLSearchParams(location.search); params.delete('mobile'); params.delete('native_provider');
    navigate(location.pathname + (params.size ? '?' + params : ''), { replace: true });
  };
  useEffect(() => {
    if (flagged) { try { sessionStorage.setItem(marker, '1'); } catch {} }
    let remembered = false;
    try { remembered = sessionStorage.getItem(marker) === '1'; } catch {}
    if ((!flagged && !remembered) || loading) return;
    const controller = new AbortController();
    void sessionFetch('/api/auth/mobile/status', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw Error('Mobile sign-in is unavailable.');
      const next = await response.json() as Status;
      if (controller.signal.aborted) return;
      setStatus(next);
      if (!next.active) { try { sessionStorage.removeItem(marker); } catch {} }
    }).catch(() => { if (!controller.signal.aborted) setError('We could not check your return to the app. Reopen sign-in from PineVela Android to try again.'); });
    return () => controller.abort();
  }, [flagged, user?.id, loading]);

  const finish = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await sessionFetch('/api/auth/mobile/finish', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await response.json();
      if (!response.ok) throw Error('Your app sign-in could not complete. Reopen sign-in from Android and try again.');
      const url = new URL(data.returnUrl);
      if (!['pinevela:', 'pinevela-debug:'].includes(url.protocol) || url.host !== 'auth' || url.pathname !== '/callback'
        || url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => !['code', 'state'].includes(key))
        || !['code', 'state'].every(key => url.searchParams.getAll(key).length === 1 && /^[A-Za-z0-9_-]{32,256}$/.test(url.searchParams.get(key) || ''))) throw Error('The return address was rejected.');
      try { sessionStorage.removeItem(marker); } catch {}
      setApprovedReturn(url.href);
      // Transfer cleared browser cookies without revoking the provider session.
      window.dispatchEvent(new Event('pinevela-session-expired'));
      window.location.assign(url.href);
    } catch (failure) { setError((failure as Error).message); setBusy(false); }
  };
  const freshLogin = async () => {
    setBusy(true); setError('');
    try {
      if (!await logout()) throw Error('Sign-out did not complete. Please check your connection and retry.');
      navigate('/login?mobile=1' + (status.mode === 'signup' ? '&mode=register' : '') + (status.provider === 'google' ? '&native_provider=google' : ''), { replace: true });
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  };
  if (approvedReturn) return <aside role="status" className="fixed bottom-3 left-3 right-3 z-[999] mx-auto max-w-lg rounded-2xl border border-blue-300 bg-white p-4 text-center text-sm text-blue-950 shadow-xl dark:border-yellow-400/50 dark:bg-blue-950 dark:text-yellow-100">
    <p>Your sign-in is approved. Continue in PineVela Android to finish.</p>
    <button type="button" onClick={() => window.location.assign(approvedReturn)} className="mt-3 min-h-11 rounded-xl bg-blue-800 px-5 py-2 font-semibold text-white dark:bg-yellow-400 dark:text-blue-950">Open PineVela Android</button>
  </aside>;
  if (!status.active && !error) return null;
  if (status.active && !user) return <aside className="fixed bottom-3 left-3 right-3 z-[999] mx-auto max-w-lg rounded-2xl border border-blue-300 bg-white p-3 text-center text-sm text-blue-950 shadow-xl dark:border-yellow-400/50 dark:bg-blue-950 dark:text-yellow-100" role="status">
    Finish signing in here, then return to PineVela Android.
  </aside>;
  return <DashboardOverlay aria-label="Continue in PineVela Android" aria-labelledby="mobile-return-title" onClose={stayInBrowser} className="grid place-items-center bg-slate-950/60 p-5">
    <section className="w-full max-w-md rounded-3xl border border-blue-200 bg-white p-6 text-blue-950 shadow-2xl dark:border-yellow-400/50 dark:bg-blue-950 dark:text-slate-100">
      <h2 id="mobile-return-title" className="text-xl font-bold">Continue in PineVela Android</h2>
      {status.fresh ? <><p className="my-4 text-sm leading-6">Continue as {user?.name || 'your PineVela account'}. Your sign-in will move into the app, and this browser tab will be signed out.</p>
        <button type="button" disabled={busy} onClick={() => void finish()} className="min-h-12 w-full rounded-2xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-50 dark:bg-yellow-400 dark:text-blue-950">{busy ? 'Returning to app…' : 'Continue in the app'}</button></>
        : <><p className="my-4 text-sm leading-6">For your security, sign in again in this tab before moving your account into the app.</p>
          <button type="button" disabled={busy} onClick={() => void freshLogin()} className="min-h-12 w-full rounded-2xl bg-blue-800 px-5 py-3 font-semibold text-white disabled:opacity-50 dark:bg-yellow-400 dark:text-blue-950">Sign out and sign in again</button></>}
      {error && <p role="alert" className="mt-4 text-sm text-rose-800 dark:text-rose-200">{error}</p>}
      <button type="button" disabled={busy} onClick={stayInBrowser} className="mt-3 min-h-11 w-full rounded-2xl border border-blue-200 px-5 py-2 text-sm font-medium dark:border-yellow-400/40">Stay in browser</button>
    </section>
  </DashboardOverlay>;
}
