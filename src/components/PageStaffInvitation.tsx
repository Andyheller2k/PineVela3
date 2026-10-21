import { useEffect,useRef,useState } from 'react';
import { Link,useSearchParams } from 'react-router-dom';
import { apiFetch } from '../lib/api';

import PasswordStrengthGauge from './PasswordStrengthGauge';
import PineLogo from './PineLogo';

export default function PageStaffInvitation() {
  const [params] = useSearchParams(), token = params.get('token') || '';
  const activeToken = useRef(token); activeToken.current = token;
  const [invitation, setInvitation] = useState<any>(null), [error, setError] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [verified, setVerified] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setInvitation(null); setVerified(false); setPassword(''); setConfirmation(''); setCode(''); setNotice(''); setError(''); setBusy(false);

    apiFetch('/api/auth/staff-invitations/inspect', { method: 'POST', body: JSON.stringify({ invitationToken: token }) })
      .then(data => { if (active) { setInvitation(data); setError(''); } }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [token]);
  async function act(action: 'signup' | 'verify' | 'resend') {
    if (busy) return;
    if (action === 'signup' && password !== confirmation) { setError('Passwords do not match.'); return; }
    const requestToken = token;
    setBusy(true); setError(''); setNotice('');
    try {
      const receipt = await apiFetch(`/api/auth/staff-invitations/${action}`, { method: 'POST', body: JSON.stringify({ invitationToken: token, ...(action === 'signup' ? {password} : action === 'verify' ? {code,password} : {}) }) });
      if (activeToken.current !== requestToken) return;
      if (action === 'verify' ? receipt?.success !== true || receipt?.verified !== true : action === 'signup' ? receipt?.verificationRequired !== true || receipt?.signupStarted !== true : receipt?.success !== true)
        throw new Error('The server did not confirm this invitation step. Please retry.');
      if (action === 'verify') { setVerified(true); setPassword(''); setCode(''); }
      else { setInvitation((previous:any) => ({ ...previous, signupStarted: true })); setNotice('Check your invited work email for the confirmation message.'); }
    } catch (e:any) { if (activeToken.current === requestToken) setError(e.message || 'The invitation could not be completed.'); }
    finally { if (activeToken.current === requestToken) setBusy(false); }
  }
  return <main className="page-canvas min-h-screen flex items-center justify-center p-6">
    <section className="w-full max-w-lg rounded-3xl border border-sky-200 bg-white p-6 sm:p-8 text-slate-900 shadow-xl dark:border-cyan-900 dark:bg-slate-900 dark:text-slate-100">
      <PineLogo className="h-12 w-12 mb-4" hideText />
      <h1 className="text-2xl font-bold">Join your residence staff</h1>
      {error && <p role="alert" className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
      {!invitation && !error && <p role="status" className="mt-4">Checking your invitation…</p>}
      {verified ? <div className="space-y-4 mt-4"><p role="status">Your work email is verified and your staff account is active.</p><Link to="/login" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 text-white">Sign in to your staff account</Link></div> : invitation && <>
        <p className="mt-3 text-sm">{invitation.name} · {invitation.residenceName}</p>
        <p className="mt-1 text-sm break-all">Work email: {invitation.email}</p>
        <form className="mt-6 space-y-4" onSubmit={e => { e.preventDefault(); void act(invitation.signupStarted ? 'verify' : 'signup'); }}>
          <label className="block text-sm">{invitation.signupStarted ? 'Your password (after opening the email link)' : 'Choose your password'}<input autoComplete={invitation.signupStarted ? 'current-password' : 'new-password'} type="password" minLength={8} maxLength={256} required={!invitation.signupStarted || !code.trim()} value={password} onChange={e=>setPassword(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-3 dark:border-slate-600 dark:bg-slate-800" /></label>
          {!invitation.signupStarted && <><PasswordStrengthGauge password={password} /><label className="block text-sm">Confirm password<input type="password" autoComplete="new-password" required value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-3 dark:border-slate-600 dark:bg-slate-800" /></label></>}
          {invitation.signupStarted && <><p className="text-sm">Open your email confirmation link, then verify here using your password. You can also enter the email code below.</p><label className="block text-sm">Email confirmation code<input autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 p-3 dark:border-slate-600 dark:bg-slate-800" /></label></>}
          {notice && <p role="status" className="text-sm">{notice}</p>}
          <button disabled={busy} className="min-h-11 rounded-xl bg-blue-700 px-5 text-white disabled:opacity-50">{busy ? 'Please wait…' : invitation.signupStarted ? 'Verify work email' : 'Create staff login'}</button>
          {invitation.signupStarted && <button type="button" disabled={busy} onClick={()=>void act('resend')} className="min-h-11 ml-3 text-sm underline">Resend email</button>}
        </form>
      </>}
      <Link to="/" className="inline-block mt-6 text-sm underline">Back to PineVela</Link>
    </section>
  </main>;
}
