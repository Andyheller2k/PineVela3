import { useNotifications } from '../context/NotificationContext';
import { sessionFetch as fetch } from '../lib/session';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, MessageSquare, Send, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { safeJson } from '../lib/api';

interface MarketMessage {
  id: string; buyerId?: string; sellerStoreId?: string; storeId?: string;
  senderRole?: string; senderEmail: string; recipientEmail: string; senderName: string; recipientName: string;
  content: string; productTitle?: string; createdAt: string;
}
export default function MarketplaceInbox({ initialPeerEmail }: { initialPeerEmail?: string | null }) {
  const { user } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const [messages, setMessages] = useState<MarketMessage[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const normalize = (value: string) => value?.trim().toLowerCase();
  const seller = user?.role === 'merchant';
  const load = async (signal?: AbortSignal) => {
    try {
      const response = await fetch('/api/digital-market/messages', { headers: { Authorization: `Bearer ${user?.token || ''}` }, signal });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Could not load your messages.');
      if (!signal?.aborted) { setMessages(Array.isArray(data) ? data : []); setError(''); }
    } catch (e: any) { if (e.name !== 'AbortError' && !signal?.aborted) setError(e.message || 'Could not load your messages.'); }
    finally { if (!signal?.aborted) setLoading(false); }
  };
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    setMessages([]); setSelected(null); setDraft(''); setLoading(true);
    void load(abort.signal);
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void load(abort.signal); }, 5000);
    return () => { abort.abort(); window.clearInterval(interval); };
  }, [user?.id, user?.token]);
  const threads = useMemo(() => {
    const map = new Map<string, { id: string; email: string; name: string; buyerId?: string; messages: MarketMessage[] }>();
    for (const message of messages) {
      const own = message.senderRole ? message.senderRole === user?.role : normalize(message.senderEmail) === normalize(user?.email || '');
      const email = own ? message.recipientEmail : message.senderEmail;
      const name = own ? message.recipientName : message.senderName;
      const id = seller ? message.buyerId || email : message.sellerStoreId || message.storeId || email;
      if (!map.has(id)) map.set(id, { id, email, name: name || email, buyerId: message.buyerId, messages: [] });
      map.get(id)!.messages.push(message);
    }
    return [...map.values()].sort((a, b) => Date.parse(b.messages.at(-1)!.createdAt) - Date.parse(a.messages.at(-1)!.createdAt));
  }, [messages, user?.id, user?.role, user?.email]);
  useEffect(() => {
    if (initialPeerEmail) { const thread = threads.find(t => normalize(t.email) === normalize(initialPeerEmail)); if (thread) setSelected(thread.id); }
  }, [initialPeerEmail, threads.length]);
  const active = threads.find(t => t.id === selected);
  useEffect(() => {
    if (!active) return;
    const ids = new Set(active.messages.map(m => m.id));
    const notices = notifications.filter(n => !n.read && n.marketChat && (n.messageId ? ids.has(n.messageId) :
      seller ? n.buyerId === active.buyerId : n.sellerStoreId === active.id));
    void Promise.all(notices.map(n => markAsRead(n.id)));
  }, [selected, active?.messages.length, notifications, markAsRead]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); }, [selected, active?.messages.length]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!active || !draft.trim() || sending) return;
    const text = draft.trim(); setSending(true); setError('');
    try {
      const response = await fetch('/api/digital-market/messages', { method: 'POST', signal: controller.current?.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user?.token || ''}` },
        body: JSON.stringify({ recipientEmail: active.email, buyerId: seller ? active.buyerId : undefined, content: text }) });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || 'Your message could not be sent.');
      setDraft(''); await load(controller.current?.signal);
    } catch (e: any) { if (e.name !== 'AbortError') setError(e.message || 'Your message could not be sent.'); }
    finally { setSending(false); }
  };
  return (
    <section aria-label={seller ? 'Buyer messages' : 'Seller messages'} className="overflow-hidden rounded-3xl border border-blue-200/70 bg-white/75 shadow-sm backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-blue-100 px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-lg font-black text-blue-950"><MessageSquare className="h-5 w-5" />{seller ? 'Buyer messages' : 'Seller messages'}</h2><p className="mt-1 text-xs text-slate-500">Discuss your items, orders and meetup arrangements.</p></div>
        <button type="button" aria-label="Refresh messages" onClick={() => void load(controller.current?.signal)} className="rounded-xl p-2 text-blue-700 hover:bg-blue-50"><RefreshCw className="h-4 w-4" /></button>
      </header>
      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}
      <div className="flex h-[min(65dvh,640px)] min-h-[360px]">
        <aside aria-label="Conversations" className={`${active ? 'hidden md:flex' : 'flex'} w-full flex-col overflow-y-auto border-r border-blue-100 md:w-72 md:shrink-0`}>
          {loading ? <p className="p-6 text-sm text-slate-500">Loading messages…</p> : threads.length === 0 ? <p className="p-6 text-sm text-slate-500">{seller ? 'Buyer inquiries will appear here.' : 'Open an item and contact its seller to start a conversation.'}</p> : threads.map(thread => (
            <button type="button" key={thread.id} onClick={() => { setSelected(thread.id); setDraft(''); }} aria-pressed={selected === thread.id} className={`border-b border-blue-50 p-4 text-left transition-colors ${selected === thread.id ? 'bg-blue-100/70' : 'hover:bg-blue-50'}`}>
              <span className="block truncate text-sm font-bold text-blue-950">{thread.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{thread.messages.at(-1)?.content}</span>
            </button>
          ))}
        </aside>
        <div className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {active ? <>
            <div className="flex items-center gap-3 border-b border-blue-100 p-4"><button type="button" onClick={() => setSelected(null)} aria-label="Back to conversations" className="rounded-xl p-2 text-blue-700 md:hidden"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0"><h3 className="truncate text-sm font-bold text-blue-950">{active.name}</h3><p className="truncate text-xs text-slate-500">{active.email}</p></div></div>
            <div role="log" aria-label="Conversation messages" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {active.messages.map(message => { const own = message.senderRole ? message.senderRole === user?.role : normalize(message.senderEmail) === normalize(user?.email || ''); return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${own ? 'bg-blue-900 text-white' : 'border border-blue-100 bg-blue-50 text-slate-800'}`}><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.content}</p><time dateTime={message.createdAt} className={`mt-2 block text-right text-[10px] ${own ? 'text-blue-200' : 'text-slate-500'}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div></div>; })}<div ref={end} />
            </div>
            <form onSubmit={send} className="flex items-end gap-2 border-t border-blue-100 p-3 sm:p-4"><label className="sr-only" htmlFor="market-message">Message</label><textarea id="market-message" rows={2} maxLength={5000} value={draft} onChange={e => setDraft(e.target.value)} placeholder="Write a message" className="min-w-0 flex-1 resize-none rounded-xl border border-blue-200 bg-white p-3 text-sm focus:outline-blue-500" /><button type="submit" disabled={sending || !draft.trim()} aria-label="Send message" className="rounded-xl bg-blue-900 p-3 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></form>
          </> : <div className="m-auto p-6 text-center text-sm text-slate-500">Select a conversation to reply.</div>}
        </div>
      </div>
    </section>
  );
}
