import OnboardingProgress, { ADMIN_ENROLLMENT_STEPS } from './OnboardingProgress';
import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { sessionFetch } from '../lib/session';
import PineLogo from './PineLogo';

export default function PageAdminInvitation() {
  const [params] = useSearchParams(), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<any>(null);
  const token = params.get('token') || '';
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (busy) return;
    if (password !== confirmation) return setError('Passwords do not match.');
    setBusy(true); setError('');
    try {
      const response = await sessionFetch('/api/auth/admin-invitation/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invitationToken: token, password }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Administrator enrollment failed.');
      setResult(data); setPassword(''); setConfirmation('');
      // Remove the one-time invitation from browser history immediately after redemption.
      window.history.replaceState(null, '', `${window.location.pathname}#/admin-invitation`);
    } catch (err: any) { setError(err.message || 'Administrator enrollment failed.'); }
    finally { setBusy(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-sky-50 via-blue-50 to-white p-5"><section className="onboarding-fields w-full max-w-lg space-y-5 rounded-3xl border border-blue-200 bg-white/75 p-6 shadow-xl backdrop-blur-xl">
    <PineLogo size={36} /><h1 className="text-xl font-bold text-blue-950">Private administrator enrollment</h1>
    <OnboardingProgress steps={ADMIN_ENROLLMENT_STEPS} step={result ? 3 : password.length >= 12 ? 2 : 1} label="Administrator enrollment" />
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {result ? <div className="space-y-4"><p className="text-sm">Administrator #{result.slot} · {result.email} is ready.</p><p className="text-sm font-semibold">Save your private approval key securely. It will not be displayed again after leaving this page.</p><textarea aria-label="Your private approval key" readOnly value={result.privateKey} className="min-h-24 w-full rounded-xl border border-amber-300 bg-amber-50 p-3 font-mono text-sm" /><p className="break-all text-xs text-slate-600">Account ID: {result.id}</p><Link to="/login" className="inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white">I saved my key · Sign in</Link></div> : !token ? <p className="text-sm text-slate-600">Open the private invitation provided by administrator #1. A valid invitation is required.</p> : <form onSubmit={submit} className="space-y-4"><p className="text-sm text-slate-600">Choose your own login password. Your independent approval key will be generated after enrollment. Do not share it with another administrator.</p>
      <label className="block text-sm">New login password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 p-3" /></label><label className="block text-sm">Confirm password<input required type="password" autoComplete="new-password" minLength={12} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-1 w-full rounded-xl border border-blue-200 p-3" /></label><button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 text-sm font-semibold text-white disabled:opacity-40">{busy ? 'Enrolling administrator…' : 'Enroll my administrator account'}</button>
    </form>}
  </section></main>;
}
