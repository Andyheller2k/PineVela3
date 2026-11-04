import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supportApi } from '../lib/supportApi';
import SupportLayout from './SupportLayout';
import SessionRestorationNotice from './SessionRestorationNotice';

const button = 'inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50';
export default function PageSupportInvitation() {
  const { user } = useAuth(), [params] = useSearchParams();
  return <Invitation key={`${user?.id || 'guest'}:${params.get('token') || ''}`} token={params.get('token') || ''} />;
}
function Invitation({ token }: { token: string }) {
  const { user, loading, restorationError, logout, apiFetch, setSessionUser } = useAuth(), navigate = useNavigate();
  const [invitation, setInvitation] = useState<any>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false), [suspended, setSuspended] = useState(false);
  const mounted = useRef(true), working = useRef(false), valid = /^[A-Za-z0-9_-]{43}$/.test(token);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const login = `/login?${new URLSearchParams({ next: `/support-invitation?token=${token}` })}`;
  useEffect(() => {
    if (loading || !valid || user?.role !== 'user') return;
    const controller = new AbortController();
    supportApi('/api/auth/support-invitation/inspect', user.id, { invitationToken: token }, 'POST', controller.signal).then(data => { if (!controller.signal.aborted) setInvitation(data); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [loading, valid, token, user?.id, user?.role]);
  async function accept() {
    if (!user || working.current) return; working.current = true; setBusy(true); setError('');
    try { const result = await supportApi('/api/auth/support-invitation/accept', user.id, { invitationToken: token });
      if (!mounted.current) return;
      if (!result?.success) throw Error('Customer-service access could not be confirmed. Refresh and retry.');
      if (!result.accessAvailable) { setSuspended(true); return; }
      const me = await apiFetch('/api/auth/me'); if (!mounted.current) return;
      setSessionUser(me.user || me, user.id); navigate('/customer-service', { replace: true });
    } catch (e: any) { if (mounted.current) setError(e.message); } finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  async function switchAccount() {
    if (working.current) return; working.current = true; setBusy(true);
    try { if (await logout()) navigate(login, { replace: true }); else if (mounted.current) setError('Sign-out failed. Retry before switching accounts.'); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  if (loading && restorationError) return <SessionRestorationNotice />;
  return <SupportLayout publicPage><section data-pv-onboarding className="mx-auto max-w-xl space-y-5 rounded-3xl border border-slate-200 bg-white p-6 sm:p-9"><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Private invitation</p><h1 className="text-2xl font-extrabold sm:text-3xl">Join PineVela customer service</h1>
    {error && <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {loading ? <p role="status">Checking your sign-in…</p> : !valid ? <p className="text-sm leading-7 text-slate-600">Open the complete private invitation link shared by your administrator.</p>
      : !user ? <><p className="text-sm leading-7 text-slate-600">Sign in or create a primary account with the exact email named in your invitation. Verify that email before accepting. Customer-service access is available only through an administrator invitation.</p><div className="flex flex-wrap gap-3"><Link to={login} className={button}>Sign in</Link><Link to={`${login}&mode=register`} className={button}>Create account</Link></div></>
      : user.role !== 'user' ? <><p className="text-sm leading-7 text-slate-600">Use the invited person’s separate primary account. Another operational or administrator identity cannot accept this invitation.</p><button disabled={busy} onClick={() => void switchAccount()} className={button}>Use the invited account</button></>
      : suspended ? <><p className="text-sm leading-7 text-slate-600">Your customer-service access is suspended. This invitation cannot restore it. Ask your administrator to review your team access.</p><Link to="/user/dashboard" className={button}>Open primary account</Link></>
      : invitation ? <><div className="space-y-2 rounded-2xl border border-slate-200 p-4"><p className="font-bold">{invitation.fullName}</p><p className="break-all text-sm">{invitation.email}</p><p className="text-xs text-slate-500">{invitation.status === 'accepted' ? 'This invitation has already been accepted by your account.' : `Expires ${new Date(invitation.expiresAt).toLocaleString()}`}</p></div><p className="text-sm leading-7 text-slate-600">You will be able to review user reports, send replies, and add private team notes. Handle account information carefully and never ask a user for their password, room key, or payment PIN.</p><button disabled={busy} onClick={() => void accept()} className={button}>{busy ? 'Opening workspace…' : invitation.status === 'accepted' ? 'Continue to workspace' : 'Accept invitation'}</button></>
      : !error ? <p role="status" className="text-sm">Checking your verified invitation…</p> : <button disabled={busy} onClick={() => void switchAccount()} className={button}>Use the invited account</button>}
  </section></SupportLayout>;
}
