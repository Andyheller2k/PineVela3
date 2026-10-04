import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import { ACCOUNT_FEATURES } from '../../accountFeatures';
import DashboardOverlay from './DashboardOverlay';

export default function AccountAccessNotice() {
  const { user } = useAuth();
  const [access, setAccess] = useState<any>(null), [popup, setPopup] = useState<any>(null);
  useEffect(() => {
    const receive = (event: Event) => { const body = (event as CustomEvent).detail; setPopup(body); if (!body.accountBanned) setAccess(body.accountAccess); };
    window.addEventListener('pinevela-account-access', receive);
    return () => window.removeEventListener('pinevela-account-access', receive);
  }, []);
  useEffect(() => {
    setAccess(null); if (user) setPopup(null); if (!user || user.role === 'admin') return;
    let disposed = false;
    const refresh = async () => { try { const res = await sessionFetch('/api/auth/account-access'); if (res.ok) { const data = await res.json(); if (!disposed) setAccess(data); } } catch {} };
    refresh(); const timer = setInterval(refresh, 15000);
    return () => { disposed = true; clearInterval(timer); };
  }, [user?.id, user?.role]);
  return <>
    {user && access?.restrictions.length > 0 && <aside role="status" aria-label="Account restrictions" className="fixed bottom-24 left-4 z-[80] max-h-36 w-[min(32rem,calc(100vw_-_6rem))] overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-xs text-amber-950 shadow-lg backdrop-blur-xl">
      <strong>Your account has feature restrictions</strong>{access.restrictions.map((r: any, index: number) => <p key={index} className="mt-1">{r.features.map((f: keyof typeof ACCOUNT_FEATURES) => ACCOUNT_FEATURES[f]).join(', ')}. Reason: {r.reason}{r.inherited ? ' (From your linked account.)' : ''}</p>)}
      <button className="mt-2 font-semibold underline" onClick={() => setPopup({ accountRestricted: true, accountAccess: access })}>View restriction details</button>
    </aside>}
    {popup && <DashboardOverlay aria-label={popup.accountBanned ? 'Account banned' : 'Feature restricted'} onClose={() => setPopup(null)} className="flex items-center justify-center bg-slate-950/40 p-5 backdrop-blur-md">
      <article className="w-full max-w-md space-y-4 rounded-3xl border border-blue-200 bg-white/95 p-7 text-slate-900 shadow-2xl">
        <h2 className="text-xl font-bold">{popup.accountBanned ? 'Your account is temporarily banned' : 'This feature is restricted'}</h2>
        <p className="text-sm">Reason: {popup.accountAccess?.reason || popup.accountAccess?.restrictions?.map((r: any) => r.reason).join('; ')}</p>
        {popup.accountBanned && <><p className="text-sm">Ban ends: <strong>{new Date(popup.accountAccess.until).toLocaleString()}</strong></p><p className="text-sm">Remaining: {Math.max(1, Math.ceil(popup.accountAccess.remainingSeconds / 3600))} hours. Access returns after the ban ends; sign in again.</p></>}
        <button onClick={() => setPopup(null)} className="rounded-xl bg-blue-700 px-5 py-2 font-semibold text-white">Close</button>
      </article>
    </DashboardOverlay>}
  </>;
}
