import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { sessionFetch } from '../lib/session';

export default function GoogleAuthButton({ mode, onError, returnTo }: { returnTo?: string; mode: 'login' | 'signup'; onError: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ controller: AbortController; redirected: boolean } | null>(null);
  useEffect(() => {
    const reset = () => {
      pending.current?.controller.abort();
      pending.current = null;
      setBusy(false);
    };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) reset(); };
    const returned = () => { if (!document.hidden && pending.current?.redirected) reset(); };
    // Back may restore this exact component, including its old busy state.
    window.addEventListener('pageshow', restored);
    window.addEventListener('focus', returned);
    document.addEventListener('visibilitychange', returned);
    setBusy(false);
    return () => {
      window.removeEventListener('pageshow', restored);
      window.removeEventListener('focus', returned);
      document.removeEventListener('visibilitychange', returned);
      pending.current?.controller.abort();
      pending.current = null;
    };
  }, [mode, returnTo]);
  const start = async () => {
    if (pending.current) return;
    const attempt = { controller: new AbortController(), redirected: false };
    pending.current = attempt;
    onError('');
    setBusy(true);
    try {
      const response = await sessionFetch('/api/auth/google/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, returnTo }),
        signal: AbortSignal.any([attempt.controller.signal, AbortSignal.timeout(15000)]) });
      const data = await response.json();
      if (pending.current !== attempt) return;
      if (!response.ok) throw new Error(data.error || 'Google sign-in is temporarily unavailable.');
      attempt.redirected = true;
      window.location.assign(data.url);
    } catch (error) {
      if (pending.current !== attempt) return;
      attempt.redirected = false;
      onError(error instanceof Error && error.name === 'TimeoutError' ? 'Google sign-in took too long. Please try again.'
        : error instanceof Error ? error.message : 'Google sign-in could not start.');
    } finally {
      if (pending.current === attempt && !attempt.redirected) {
        pending.current = null;
        setBusy(false);
      }
    }
  };
  return <div className="login-google-section space-y-3">
    <div className="flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200" /><span>or continue with</span><span className="h-px flex-1 bg-slate-200" /></div>
    <button type="button" onClick={start} disabled={busy} aria-busy={busy} className="login-google-button flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 disabled:opacity-60">
      {busy ? <LoaderCircle size={20} className="animate-spin" /> : <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.43h11a9.4 9.4 0 0 1-4.08 6.17v5.12h6.61c3.87-3.56 6.08-8.81 6.08-14.8Z" /><path fill="#34A853" d="M24 44c5.5 0 10.1-1.83 13.53-4.74l-6.61-5.12c-1.83 1.23-4.17 1.97-6.92 1.97-5.3 0-9.8-3.57-11.41-8.38H5.78v5.29A20 20 0 0 0 24 44Z" /><path fill="#FBBC05" d="M12.59 27.73a12 12 0 0 1 0-7.46v-5.29H5.78a20 20 0 0 0 0 18.04l6.81-5.29Z" /><path fill="#EA4335" d="M24 11.89c3 0 5.69 1.03 7.81 3.05l5.86-5.86A19.6 19.6 0 0 0 24 4 20 20 0 0 0 5.78 14.98l6.81 5.29C14.2 15.46 18.7 11.89 24 11.89Z" /></svg>}
      {busy ? 'Connecting to Google…' : mode === 'signup' ? 'Sign up with Google' : 'Sign in with Google'}
    </button>
  </div>;
}
