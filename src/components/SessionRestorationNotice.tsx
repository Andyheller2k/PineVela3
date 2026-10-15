import { useAuth } from '../context/AuthContext';

export default function SessionRestorationNotice() {
  const { restorationError, retrySession } = useAuth();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <section aria-labelledby="session-retry-title" className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h1 id="session-retry-title" className="text-xl font-semibold text-slate-900 dark:text-slate-100">Checking your sign-in</h1>
        <p role="status" className="mt-3 text-sm text-slate-600 dark:text-slate-300">{restorationError}</p>
        <button type="button" onClick={retrySession} className="mt-5 min-h-11 rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Retry connection</button>
      </section>
    </main>
  );
}
