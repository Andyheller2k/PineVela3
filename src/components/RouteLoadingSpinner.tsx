import { useEffect, useState } from 'react';

/** Compact in-app loading with a useful recovery if the connection stalls. */
export default function RouteLoadingSpinner() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 30000);
    return () => window.clearTimeout(timer);
  }, []);
  return <div data-route-loading="spinner" role={slow ? 'alert' : 'status'} aria-live="polite" aria-busy={!slow} className="flex min-h-40 flex-1 flex-col items-center justify-center gap-4 p-6 text-center text-[var(--pv-text)]">
    {!slow && <>
      <svg viewBox="0 0 24 24" fill="none" width="20" height="20" aria-hidden="true" className="motion-safe:animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity=".2" />
        <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="sr-only">Loading page</span>
    </>}
    {slow && <>
      <p className="text-sm">This is taking longer than usual. Check your connection.</p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-xl bg-yellow-400 px-5 py-3 text-sm font-semibold text-blue-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4">Reload page</button>
    </>}
  </div>;
}
