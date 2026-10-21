import { useEffect, useRef, useState } from 'react';
import { SUPPORT_QUEUE_STATUSES, SUPPORT_STATUSES, supportRequesterLabel, type SupportTicket } from '../../supportModel';
import ReportReview from './ReportReview';

export default function SupportThread({ ticket, onChange, request, operator = false, members = [] }: {
  ticket: SupportTicket; onChange: (ticket: SupportTicket) => void; request: (suffix: string, body: unknown, method?: string) => Promise<any>;
  operator?: boolean; members?: { id: string; name: string }[];
}) {
  const [body, setBody] = useState(''), [internal, setInternal] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const key = useRef(crypto.randomUUID()), sending = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  // A thread is remounted for every different case/account; no shared draft cache.
  const work = async (run: () => Promise<any>) => { if (sending.current) return; sending.current = true; setBusy(true); setError(''); try { const next = await run(); if (mounted.current && next?.id) onChange(next); } catch (e: any) { if (mounted.current) setError(e.message); } finally { sending.current = false; if (mounted.current) setBusy(false); } };
  const closed = ['resolved', 'closed'].includes(ticket.status);
  const statuses = operator ? SUPPORT_QUEUE_STATUSES : SUPPORT_STATUSES;
  return <section aria-label={`Support case ${ticket.reference}`} className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 sm:p-7">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-blue-700">{ticket.reference}</p><h2 className="mt-2 break-words text-2xl font-bold">{ticket.subject}</h2><p className="mt-2 text-xs text-slate-500">Opened {new Date(ticket.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">{statuses[ticket.status]}</span></div>
    {operator && <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700"><p className="font-bold">{ticket.requesterName} · {supportRequesterLabel(ticket.requesterKind)}</p><p className="break-all">{ticket.requesterEmail}</p><p className="break-all text-xs">Account ID: {ticket.requesterId || 'No signed-in account'} · Page: {ticket.source}</p>
      <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-xs font-bold">Status<select aria-label="Case status" disabled={busy} value={ticket.status} onChange={e => void work(() => request('', { status: e.target.value, version: ticket.version }, 'PATCH'))} className="block w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm">{Object.entries(statuses).map(([v, l]) => <option value={v} key={v}>{l}</option>)}</select></label>
        <label className="space-y-1 text-xs font-bold">Priority<select aria-label="Case priority" disabled={busy} value={ticket.priority} onChange={e => void work(() => request('', { priority: e.target.value, version: ticket.version }, 'PATCH'))} className="block w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"><option value="normal">Normal</option><option value="high">High</option></select></label>
        <label className="space-y-1 text-xs font-bold">Assigned to<select aria-label="Assigned customer-service member" disabled={busy} value={ticket.assignedTo || ''} onChange={e => void work(() => request('', { assignedTo: e.target.value || null, version: ticket.version }, 'PATCH'))} className="block w-full rounded-xl border border-slate-200 bg-white p-2.5 text-sm"><option value="">Unassigned</option>{ticket.assignedTo && !members.some(m => m.id === ticket.assignedTo) && <option value={ticket.assignedTo} disabled>Inactive team member</option>}{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      </div>
    </div>}
    {operator && <ReportReview ticketId={ticket.id} />}
    <ol aria-label="Case conversation" className="space-y-4">{ticket.messages?.map(message => <li key={message.id} className={`rounded-2xl border p-4 ${message.internal ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-blue-800">{message.authorName}{message.internal ? ' · Internal note' : message.authorRole === 'requester' ? '' : ' · Customer service'}</p><time className="text-[11px] text-slate-500">{new Date(message.createdAt).toLocaleString()}</time></div>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{message.body}</p>
      {operator && message.emailStatus && <p className="mt-3 text-xs text-slate-500">Email: {message.emailStatus === 'sent' ? 'Accepted by email provider' : message.emailStatus}{message.emailStatus === 'failed' && <button type="button" disabled={busy} onClick={() => void work(() => request('/retry-email', {}))} className="ml-2 rounded-lg px-2 py-1 font-bold text-blue-700">Retry email</button>}</p>}
    </li>)}</ol>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {closed && !operator ? <button type="button" disabled={busy} onClick={() => void work(() => request('', { status: 'open', version: ticket.version }, 'PATCH'))} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">{busy ? 'Reopening…' : 'Reopen request'}</button>
      : <form onSubmit={e => { e.preventDefault(); void work(async () => { const next = await request('/replies', { body, requestKey: key.current, version: ticket.version, ...(operator ? { internal } : {}) }); key.current = crypto.randomUUID(); setBody(''); return next; }); }} className="space-y-3 border-t border-slate-200 pt-5">
        <label className="block text-sm font-bold text-slate-900" htmlFor={`reply-${ticket.id}`}>{operator ? internal ? 'Internal note' : 'Reply to requester' : 'Your follow-up'}</label>
        <textarea id={`reply-${ticket.id}`} required minLength={3} maxLength={6000} rows={4} value={body} onChange={e => setBody(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-900" />
        {operator && <label className="flex items-center gap-2 text-xs font-semibold text-slate-600"><input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />Internal note — visible only to customer service and administrators</label>}
        <button type="submit" disabled={busy} className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy ? 'Sending…' : operator && internal ? 'Save note' : 'Send reply'}</button>
      </form>}
  </section>;
}
