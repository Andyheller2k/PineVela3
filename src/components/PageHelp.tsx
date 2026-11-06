import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { CircleHelp, Copy, Plus, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { isPublicAppearance } from '../lib/publicAppearance';
import { privateSupportCode, supportApi } from '../lib/supportApi';
import { SUPPORT_CATEGORIES, SUPPORT_STATUSES, SUPPORT_TYPES, type SupportTicket } from '../../supportModel';
import SupportLayout, { supportHome } from './SupportLayout';
import SupportThread from './SupportThread';
import SessionRestorationNotice from './SessionRestorationNotice';
import MyReports from './MyReports';
import { useClipboardFeedback } from '../lib/useClipboardFeedback';

const button = 'inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50';
const field = 'mt-2 block w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900';
export default function PageHelp() {
  const { user, loading, restorationError } = useAuth();
  if (loading && restorationError) return <SessionRestorationNotice />;
  if (loading) return <SupportLayout><p role="status">Checking your account…</p></SupportLayout>;
  return <HelpContent key={user?.id || 'guest'} />;
}
function HelpContent() {
  const { user } = useAuth(), location = useLocation(), [params, setParams] = useSearchParams();
  const source = params.get('from') || '/', accountId = user?.id;
  const publicPage = isPublicAppearance('/help', location.search, !!user);
  const [tickets, setTickets] = useState<SupportTicket[]>([]), [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [compose, setCompose] = useState(!params.get('ticket')), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState('');
  const [subject, setSubject] = useState(''), [body, setBody] = useState(''), [category, setCategory] = useState('account'), [type, setType] = useState('question');
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [lookupId, setLookupId] = useState(''), [lookupCode, setLookupCode] = useState(''), [guestCode, setGuestCode] = useState('');
  const [refresh, setRefresh] = useState(0);
  const clipboard = useClipboardFeedback();
  const requestKey = useRef(crypto.randomUUID()), accessCode = useRef(privateSupportCode()), mounted = useRef(true), submitting = useRef(false), selection = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; selection.current++; }; }, []);
  const selected = params.get('ticket');
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController();
    supportApi('/api/support/tickets', accountId, undefined, 'GET', controller.signal).then(items => { if (!controller.signal.aborted) setTickets(items); }).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [accountId, refresh]);
  useEffect(() => {
    if (!accountId || !selected) return;
    const controller = new AbortController(), revision = ++selection.current;
    setTicket(current => current?.id === selected ? current : null); setCompose(false); setLoading(true); setError('');
    supportApi(`/api/support/tickets/${encodeURIComponent(selected)}`, accountId, undefined, 'GET', controller.signal).then(item => { if (!controller.signal.aborted && selection.current === revision) setTicket(item); }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [selected, accountId, refresh]);
  function updated(item: SupportTicket) { if (!mounted.current) return; setTicket(item); setTickets(items => [item, ...items.filter(t => t.id !== item.id)]); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError('');
    try {
      const item = await supportApi(accountId ? '/api/support/tickets' : '/api/public/support/tickets', accountId,
        { subject, body, category, type, source: /^\/[a-zA-Z0-9/_-]*$/.test(source) ? source : '/', requestKey: requestKey.current, ...(!accountId ? { name, email, accessToken: accessCode.current } : {}) });
      if (!mounted.current) return;
      updated(item); setCompose(false); setBody(''); setSubject(''); requestKey.current = crypto.randomUUID();
      if (!accountId) { setGuestCode(accessCode.current); setLookupId(item.id); setLookupCode(accessCode.current); accessCode.current = privateSupportCode(); }
      else setParams(p => { p.set('ticket', item.id); return p; }, { replace: true });
    } catch (e: any) { if (mounted.current) setError(e.message); }
    finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  async function lookup(e?: React.FormEvent) {
    e?.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError(''); const revision = ++selection.current;
    try { const item = await supportApi(`/api/public/support/tickets/${encodeURIComponent(lookupId.trim())}/read`, undefined, { accessToken: lookupCode.trim() });
      if (mounted.current && revision === selection.current) { setTicket(item); setGuestCode(lookupCode.trim()); setCompose(false); }
    } catch (e: any) { if (mounted.current) setError(e.message); } finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }
  const request = (suffix: string, data: any, method?: string) => supportApi(`${accountId ? '/api/support' : '/api/public/support'}/tickets/${ticket!.id}${suffix}`, accountId, { ...data, ...(!accountId ? { accessToken: guestCode } : {}) }, method);
  return <SupportLayout publicPage={publicPage}>
    <div className="mb-8 flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><p className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-700"><CircleHelp size={18} />PineVela support</p><h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">How can we help?</h1><p className="mt-4 text-sm leading-7 text-slate-600">Ask a question, report a problem, or follow up with customer service. For a room repair, use your resident maintenance page so your housing team can act on it.</p><Link to={`/faq?from=${publicPage ? '/faq' : encodeURIComponent(supportHome(user))}`} className="mt-3 inline-block text-sm font-bold text-blue-700 underline underline-offset-4">Browse frequently asked questions</Link></div>
      <button type="button" disabled={busy} className={button} onClick={() => { selection.current++; setCompose(true); setTicket(null); setError(''); setSubject(''); setBody(''); clipboard.reset(); requestKey.current = crypto.randomUUID(); accessCode.current = privateSupportCode(); setParams(p => { p.delete('ticket'); return p; }, { replace: true }); }}><Plus size={17} />New request</button>
    </div>
    <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
      <aside className="space-y-5">
        {accountId ? <section className="rounded-3xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-bold">Your requests</h2><button type="button" aria-label="Refresh your requests" onClick={() => setRefresh(x => x + 1)} className="rounded-lg p-2 text-blue-700"><RefreshCw size={16} /></button></div>
          {tickets.length ? <ul className="space-y-2">{tickets.map(t => <li key={t.id}><button type="button" onClick={() => { setCompose(false); setParams(p => { p.set('ticket', t.id); return p; }); }} aria-current={ticket?.id === t.id && !compose ? 'page' : undefined} className="w-full rounded-xl border border-slate-200 p-3 text-left"><span className="text-[11px] font-bold text-blue-700">{t.reference}</span><span className="mt-1 block break-words text-sm font-bold">{t.subject}</span><span className="mt-1 block text-xs text-slate-500">{SUPPORT_STATUSES[t.status]}</span></button></li>)}</ul> : <p className="text-sm leading-6 text-slate-500">Requests from this account will appear here.</p>}</section>
          : <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Track a guest request</h2><p className="mt-2 text-xs leading-6 text-slate-500">Use the case ID and private access code saved when you submitted it. A contact email alone cannot unlock a conversation.</p><form onSubmit={lookup} className="mt-4 space-y-3"><label className="block text-xs font-bold">Case ID<input required value={lookupId} onChange={e => setLookupId(e.target.value)} className={field} autoComplete="off" /></label><label className="block text-xs font-bold">Private access code<input required minLength={43} maxLength={43} value={lookupCode} onChange={e => setLookupCode(e.target.value)} className={field} autoComplete="off" spellCheck={false} /></label><button disabled={busy} className={button}>{busy ? 'Opening…' : 'Open request'}</button></form></section>}
        {accountId && <MyReports key={accountId} accountId={accountId} />}
        <p className="px-2 text-xs leading-6 text-slate-600">Prefer email? <a href="mailto:pinevela@pinevela.app" className="font-bold text-blue-700 underline underline-offset-4">Email support</a> opens your email app.</p>
        <p className="px-2 text-xs leading-6 text-slate-500">Keep your password, room key, payment PIN, chat recovery phrase, and private administrator key out of your message. Include the steps you took and any relevant order or request reference.</p>
      </aside>
      <div className="min-w-0 space-y-5">
        {error && <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" onClick={() => accountId ? setRefresh(x => x + 1) : void lookup()} className="ml-3 font-bold underline">Retry loading</button></div>}
        {compose ? <form onSubmit={submit} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7"><h2 className="text-xl font-bold">Tell us what happened</h2>
          {!accountId && <><p className="text-sm leading-6 text-slate-600">You can contact us without signing in. Your contact details are marked as unverified; we cannot change an account without checking ownership.</p><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Your name<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className={field} autoComplete="name" /></label><label className="text-sm font-bold">Contact email<input required type="email" maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className={field} autoComplete="email" /></label></div></>}
          {accountId && <p className="text-sm text-slate-600">Submitting as <strong>{user?.name}</strong>. We use the verified email on this account for replies.</p>}
          <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-bold">Request type<select value={type} onChange={e => setType(e.target.value)} className={field}>{Object.entries(SUPPORT_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label className="text-sm font-bold">Topic<select value={category} onChange={e => setCategory(e.target.value)} className={field}>{Object.entries(SUPPORT_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label></div>
          <label className="block text-sm font-bold">Subject<input required minLength={3} maxLength={160} value={subject} onChange={e => setSubject(e.target.value)} className={field} /></label>
          <label className="block text-sm font-bold">Your question or report<textarea required minLength={3} maxLength={6000} rows={7} value={body} onChange={e => setBody(e.target.value)} className={field} /></label>
          <p className="text-xs leading-6 text-slate-500">Your message and account details are shared with authorized PineVela customer service. Replies are saved in this conversation and queued for delivery to your contact email.</p><button type="submit" disabled={busy} className={button}>{busy ? 'Submitting…' : 'Submit request'}</button>
        </form> : loading && !ticket ? <p role="status" className="p-6 text-sm">Opening your request…</p> : ticket ? <>
          {!accountId && <section className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-bold">Save your private tracking details</p><p className="text-xs leading-6">Keep these somewhere safe. Anyone with both values can read and reply to this guest request. They are not saved on this shared device.</p><label className="block text-xs font-bold">Case ID<input readOnly value={ticket.id} className={field} /></label><label className="block text-xs font-bold">Private access code<input readOnly value={guestCode} className={field} /></label><button type="button" className="inline-flex items-center gap-2 font-bold text-blue-800" onClick={async () => { if (!await clipboard.copy('guest-tracking', `PineVela ${ticket.reference}\nCase ID: ${ticket.id}\nPrivate access code: ${guestCode}`) && mounted.current) setError('Copy is unavailable. Select and save the two values above.'); }}><Copy size={16} />{clipboard.copiedId === 'guest-tracking' ? 'Copied tracking details' : 'Copy tracking details'}</button></section>}
          <div className="flex justify-end"><button type="button" onClick={() => accountId ? setRefresh(x => x + 1) : void lookup()} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold text-blue-700"><RefreshCw size={15} />Refresh conversation</button></div>
          <SupportThread key={ticket.id} ticket={ticket} onChange={updated} request={request} />
        </> : <p className="rounded-2xl border border-slate-200 p-6 text-sm">Choose a request or start a new one.</p>}
      </div>
    </div>
  </SupportLayout>;
}
