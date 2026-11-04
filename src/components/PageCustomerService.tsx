import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, Flag, Inbox, LogOut, RefreshCw, Search, Settings } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { supportApi } from '../lib/supportApi';
import { SUPPORT_CATEGORIES, SUPPORT_QUEUE_STATUSES as SUPPORT_STATUSES, supportRequesterLabel, type SupportTicket } from '../../supportModel';
import AppearanceSettings from './AppearanceSettings';
import SupportLayout from './SupportLayout';
import SupportThread from './SupportThread';
import CustomerServiceReports from './CustomerServiceReports';
import MobileNavigation from './MobileNavigation';

type Queue = { tickets: SupportTicket[]; hasMore: boolean; members: { id: string; name: string }[]; emailConfigured: boolean };
export default function PageCustomerService() {
  const { user, logout } = useAuth(), navigate = useNavigate(), [params, setParams] = useSearchParams();
  const { notifications, markAsRead } = useNotifications();
  const [tab, setTab] = useState<'inbox' | 'reports' | 'notifications' | 'settings'>('inbox');
  const [queue, setQueue] = useState<Queue | null>(null), [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [search, setSearch] = useState(''), [query, setQuery] = useState(''), [status, setStatus] = useState(''), [category, setCategory] = useState(''), [page, setPage] = useState(0);
  const [error, setError] = useState(''), [detailError, setDetailError] = useState(''), [loading, setLoading] = useState(true), [refresh, setRefresh] = useState(0), [detailRefresh, setDetailRefresh] = useState(0), [signingOut, setSigningOut] = useState(false);
  const mounted = useRef(true), accountId = user?.id, selected = params.get('ticket');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!accountId) return;
    const controller = new AbortController(); setLoading(true); setError('');
    const filters = new URLSearchParams({ search: query, status, category, page: String(page) });
    supportApi(`/api/customer-service/tickets?${filters}`, accountId, undefined, 'GET', controller.signal).then(data => { if (!controller.signal.aborted) setQueue(data); }).catch(e => { if (!controller.signal.aborted) { setQueue(null); setError(e.message); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [accountId, query, status, category, page, refresh]);
  useEffect(() => {
    setTicket(current => current?.id === selected ? current : null); setDetailError(''); if (!selected || !accountId) return;
    const controller = new AbortController();
    supportApi(`/api/customer-service/tickets/${encodeURIComponent(selected)}`, accountId, undefined, 'GET', controller.signal).then(data => { if (!controller.signal.aborted) setTicket(data); }).catch(e => { if (!controller.signal.aborted) setDetailError(e.message); });
    return () => controller.abort();
  }, [accountId, selected, detailRefresh]);
  const supportNotifications = notifications.filter(n => n.category === 'support');
  return <div className="product-mobile-nav-content"><SupportLayout>
    <div className="mb-7 flex flex-wrap items-start justify-between gap-5"><div className="max-w-2xl"><p className="mb-3 text-xs font-bold uppercase tracking-widest text-blue-700">Customer-service workspace</p><h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">User feedback & complaints</h1><p className="mt-3 text-sm leading-7 text-slate-600">Review requests, follow up with the right account, and keep every response in one conversation.</p></div><div className="flex items-center gap-3"><span className="text-xs font-bold text-slate-600">{user?.name}</span><button type="button" disabled={signingOut} onClick={async () => { if (signingOut) return; setSigningOut(true); if (await logout()) navigate('/login', { replace: true }); else if (mounted.current) { setError('Sign-out failed. Please retry.'); setSigningOut(false); } }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-blue-800"><LogOut size={15} />{signingOut ? 'Signing out…' : 'Sign out'}</button></div></div>
    <nav aria-label="Customer-service sections" data-page-tabs className="mb-7 hidden lg:flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2">{([{ id: 'inbox', label: 'Inbox', icon: Inbox }, { id: 'reports', label: 'Safety reports', icon: Flag }, { id: 'notifications', label: 'Notifications', icon: Bell }, { id: 'settings', label: 'Settings', icon: Settings }] as const).map(item => <button type="button" key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)} className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${tab === item.id ? 'bg-blue-600 text-white' : 'text-slate-600'}`}><item.icon size={17} />{item.label}{item.id === 'notifications' && supportNotifications.some(n => !n.read) && <span className="h-2 w-2 rounded-full bg-amber-400" aria-label="Unread notifications" />}</button>)}</nav>
    {error && <p role="alert" className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" className="ml-3 font-bold underline" onClick={() => setRefresh(v => v + 1)}>Retry</button></p>}
    {tab === 'reports' && accountId ? <CustomerServiceReports key={accountId} accountId={accountId} onSelect={ticketId => { setParams({ ticket: ticketId }); setTab('inbox'); }} /> : tab === 'settings' ? <div className="max-w-2xl space-y-5"><AppearanceSettings /><section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-bold">Customer-service access</h2><p className="text-sm leading-7 text-slate-600">Your verified sign-in is linked to an administrator invitation. Administrators can suspend or restore customer-service access. Internal notes stay inside this workspace.</p></section></div>
      : tab === 'notifications' ? <section className="rounded-3xl border border-slate-200 bg-white p-5"><h2 className="mb-5 text-xl font-bold">Support notifications</h2>{supportNotifications.length ? <ul className="space-y-3">{supportNotifications.map(n => <li key={n.id} data-notification-id={n.id}><button type="button" className="w-full rounded-2xl border border-slate-200 p-4 text-left" onClick={() => { void markAsRead(n.id); if (n.link?.startsWith('/customer-service')) { navigate(n.link); setTab('inbox'); } else if (n.link?.startsWith('/help?ticket=')) navigate(n.link); }}><span className="text-sm font-bold">{n.title}{!n.read && ' · New'}</span><span className="mt-2 block text-sm text-slate-600">{n.message}</span></button></li>)}</ul> : <p className="text-sm text-slate-500">New requests and follow-ups will appear here.</p>}</section>
      : <>
        {queue && !queue.emailConfigured && <p role="status" className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Email delivery is not configured. Public replies are saved and in-app notifications still work; emails remain queued until the server’s email sender is configured.</p>}
        <form onSubmit={e => { e.preventDefault(); setQuery(search.trim()); setPage(0); }} className="mb-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_auto_auto_auto]">
          <label className="text-xs font-bold">Search requests<div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3"><Search size={16} className="text-slate-500" /><input value={search} maxLength={120} onChange={e => setSearch(e.target.value)} className="w-full min-w-0 bg-transparent py-3 text-sm" aria-label="Search by reference, subject, name, email or account ID" /></div></label>
          <label className="text-xs font-bold">Status<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="">All statuses</option>{Object.entries(SUPPORT_STATUSES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="text-xs font-bold">Topic<select value={category} onChange={e => { setCategory(e.target.value); setPage(0); }} className="mt-2 block w-full rounded-xl border border-slate-200 bg-white p-3 text-sm"><option value="">All topics</option>{Object.entries(SUPPORT_CATEGORIES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <div className="flex items-end gap-2"><button type="submit" className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white">Search</button><button type="button" aria-label="Refresh support inbox" onClick={() => { setRefresh(v => v + 1); setDetailRefresh(v => v + 1); }} className="rounded-xl border border-slate-200 p-3 text-blue-700"><RefreshCw size={18} /></button></div>
        </form>
        <div className={`grid items-start gap-6 ${selected ? 'xl:grid-cols-[20rem_1fr]' : ''}`}>
          <section aria-label="Support requests" className="min-w-0 space-y-3">
            {loading && <p role="status" className="p-4 text-sm">Loading requests…</p>}
            {!loading && queue?.tickets.length === 0 && <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No requests match these filters.</p>}
            {queue?.tickets.map(t => <button type="button" key={t.id} onClick={() => setParams({ ticket: t.id })} aria-current={selected === t.id ? 'page' : undefined} className="block w-full rounded-2xl border border-slate-200 bg-white p-4 text-left"><div className="flex flex-wrap justify-between gap-2"><span className="text-xs font-bold text-blue-700">{t.reference}</span><span className="text-xs font-semibold text-slate-500">{SUPPORT_STATUSES[t.status]}{t.priority === 'high' ? ' · High priority' : ''}</span></div><p className="mt-2 break-words font-bold">{t.subject}</p><p className="mt-2 break-words text-xs text-slate-600">{t.requesterName} · {supportRequesterLabel(t.requesterKind)}</p><p className="mt-1 break-all text-xs text-slate-500">{t.requesterEmail}</p><p className="mt-2 text-[11px] text-slate-500">Updated {new Date(t.updatedAt).toLocaleString()}</p></button>)}
            <div className="flex items-center justify-between gap-3 pt-3 text-sm"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Previous</button><span className="text-xs text-slate-500">Page {page + 1}</span><button type="button" disabled={!queue?.hasMore || loading} onClick={() => setPage(p => p + 1)} className="rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Next</button></div>
          </section>
          {selected && <div className="min-w-0 space-y-3"><button type="button" onClick={() => setParams({})} className="rounded-xl px-3 py-2 text-xs font-bold text-blue-700">Close conversation</button>{detailError ? <p role="alert" className="rounded-2xl border border-rose-200 p-4 text-sm">{detailError}<button onClick={() => setDetailRefresh(v => v + 1)} className="ml-3 underline">Retry</button></p> : ticket ? <SupportThread key={ticket.id} operator ticket={ticket} members={queue?.members || []} onChange={next => { setTicket(next); setQueue(q => q && ({ ...q, tickets: q.tickets.map(t => t.id === next.id ? next : t) })); }} request={(suffix, body, method) => supportApi(`/api/customer-service/tickets/${ticket.id}${suffix}`, accountId, body, method)} /> : <p role="status" className="p-5 text-sm">Opening conversation…</p>}</div>}
        </div>
      </>}
    <MobileNavigation
      label="Customer-service navigation"
      activeTab={tab}
      items={[
        { id: 'inbox', label: 'Inbox', icon: Inbox },
        { id: 'reports', label: 'Reports', icon: Flag },
        { id: 'notifications', label: 'Alerts', icon: Bell, badge: supportNotifications.filter(n => !n.read).length },
        { id: 'settings', label: 'Settings', icon: Settings },
      ]}
      onSelect={id => {
        if (id === 'inbox' || id === 'reports' || id === 'notifications' || id === 'settings') setTab(id);
      }}
    />
  </SupportLayout></div>;
}
