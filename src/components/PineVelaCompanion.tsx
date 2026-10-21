import {companionSubmission} from '../lib/companionSubmission';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { ArrowUp, ArrowUpRight, Bell, Check, ChevronLeft, LoaderCircle, Settings2, ShieldCheck, Sparkles, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { sessionFetch, currentSessionGeneration } from '../lib/session';
import { COMPANIONS, DEFAULT_COMPANION_PREFERENCES, companionById, companionRetryAfter, safeCompanionHref,
  type CompanionPreferences, type CompanionTurn } from '../../companionModel';
import DashboardOverlay from './DashboardOverlay';
import CompanionAvatar from './CompanionAvatar';
import CompanionNavigationButton from './CompanionNavigationButton';
import { renderAvatarGraphic } from './UserAvatarSelector';
import '../companion.css';

type State = { preferences: CompanionPreferences; firstName: string; turns: CompanionTurn[]; available: boolean };
class CompanionRequestError extends Error {
  constructor(message: string, public retryAt = 0) { super(message); }
}
export default function PineVelaCompanion({ unreadCount = 0, navigationTarget }: { unreadCount?: number; navigationTarget?: HTMLElement | null }) {
  const { user } = useAuth();
  // A keyed child prevents one frame of another account's preferences/history.
  return user?.role === 'user' ? <CompanionSession key={`${user.id}:${currentSessionGeneration()}`} accountId={user.id} unreadCount={unreadCount} navigationTarget={navigationTarget} /> : null;
}
function CompanionSession({ accountId, unreadCount, navigationTarget }: { accountId: string; unreadCount: number; navigationTarget?: HTMLElement | null }) {
  const reduceMotion = useReducedMotion();
  const { user } = useAuth(), navigate = useNavigate();
  const submission=useRef(companionSubmission(JSON.stringify([accountId,currentSessionGeneration()]))).current;
  const [state, setState] = useState<State | null>(null), [open, setOpen] = useState(false), [customize, setCustomize] = useState(false);
  const [draft, setDraft] = useState<CompanionPreferences>(DEFAULT_COMPANION_PREFERENCES), [message, setMessage] = useState(submission.unresolved?.text||'');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [clearing, setClearing] = useState(false);
  const [pending, setPending] = useState(''), [clearConfirm, setClearConfirm] = useState(false);
  const [retryAt, setRetryAt] = useState(0), [remaining, setRemaining] = useState(0);
  const [slowReply, setSlowReply] = useState(false);
  const replyRequest = useRef<AbortController | null>(null);
  const action = useRef(false);
  const alive = useRef(true), requests = useRef(new Set<AbortController>()), bottom = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const character = companionById(state?.preferences.companion), active = companionById(draft.companion);
  useEffect(() => { alive.current = true; return () => { alive.current = false; requests.current.forEach(c => c.abort()); requests.current.clear(); }; }, []);
  async function request(path: string, options: RequestInit = {}) {
    const controller = new AbortController(); requests.current.add(controller);
    try {
      const response = await sessionFetch('/api/companion' + path, { ...options,
        headers: { 'Content-Type': 'application/json', 'X-PineVela-Profile-Context': accountId },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(55000), ...(options.signal ? [options.signal] : [])]) });
      const data = await response.json().catch(error => { if (controller.signal.aborted || options.signal?.aborted) throw error; return null; });
      if (!response.ok) throw new CompanionRequestError(data?.error || 'Your companion could not connect. Please try again.',
        response.status === 429 || response.headers.has('Retry-After') ? Date.now() + companionRetryAfter(response.headers.get('Retry-After')) * 1000 : 0);
      if (!alive.current) throw new DOMException('Account changed', 'AbortError');
      if (!data || typeof data !== 'object') throw new CompanionRequestError('The reply was interrupted. Your message is kept. Please try again.');
      return data;
    } catch (error) {
      if ((error as Error).name === 'TimeoutError') throw new CompanionRequestError('The reply timed out. Your message is kept. Please try again.');
      if ((error as Error).name === 'TypeError') throw new CompanionRequestError('Could not reach PineVela. Your message is kept. Check your connection and try again.');
      throw error;
    } finally { requests.current.delete(controller); }
  }
  async function load() {
    setError('');
    try { const data = await request(''); if (alive.current) {
      const unresolved=submission.unresolved,record=unresolved&&data.turns?.find((turn:CompanionTurn)=>turn.id===unresolved.id&&turn.user===unresolved.text);
      if(record&&submission.receipt(record.id,record.user))setMessage(current=>current.trim()===record.user?'':current);
      setState(data); setDraft(data.preferences);
    } }
    catch (e) { if (alive.current && (e as Error).name !== 'AbortError') setError((e as Error).message); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setSlowReply(false);
    if (!busy) return;
    const timer = window.setTimeout(() => setSlowReply(true), 8000);
    return () => window.clearTimeout(timer);
  }, [busy]);
  useEffect(() => {
    if (!retryAt) return;
    const update = () => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) { setRetryAt(0); setError(''); }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  useEffect(() => { if (open && !customize) bottom.current?.scrollIntoView({ block: 'end', behavior: 'instant' }); }, [open, customize, state?.turns.length, pending]);
  async function save() {
    if (action.current) return;
    action.current = true;
    setSaving(true); setError('');
    try { const data = await request('/preferences', { method: 'PUT', body: JSON.stringify(draft) });
      if (alive.current) { setState(s => s ? { ...s, preferences: data.preferences } : s); setCustomize(false); setClearConfirm(false); }
    } catch (e) { if (alive.current && (e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { action.current = false; if (alive.current) setSaving(false); }
  }
  async function send(text = message, enableAI = false) {
    if (action.current || retryAt > Date.now() || !state?.available || (!text.trim() && !enableAI) || (!state.preferences.aiEnabled && !enableAI)) return;
    // The ref closes the gap before React renders disabled buttons after a rapid double tap.
    action.current = true; setError('');
    const controller = new AbortController(); replyRequest.current = controller;
    try {
      if (!state.preferences.aiEnabled) {
        setSaving(true);
        const data = await request('/preferences', { method: 'PUT', body: JSON.stringify({ ...state.preferences, aiEnabled: true }), signal: controller.signal });
        setState(s => s ? { ...s, preferences: data.preferences } : s); setDraft(data.preferences); setSaving(false);
      }
      if (!text.trim()) return;
      // Reconcile only an interrupted send; ordinary new sends avoid an extra read.
      if(submission.unresolved){
        const history=await request('',{signal:controller.signal});
        const record=history.turns?.find((turn:CompanionTurn)=>turn.id===submission.unresolved?.id&&turn.user===submission.unresolved.text);
        if(record){const same=text.trim()===record.user;submission.receipt(record.id,record.user);setState(history);if(same){setMessage(current=>current.trim()===record.user?'':current);return;}}
      }
      const logical=submission.begin(text);
      setBusy(true); setPending(logical.text); setMessage(current => current === text ? '' : current);
      const data = await request('/turns', { method: 'POST', body: JSON.stringify({ message: logical.text, requestId: logical.id }), signal: controller.signal });
      if(!data.turn||data.turn.id!==logical.id||data.turn.user!==logical.text)throw new CompanionRequestError('The reply could not be confirmed. Check saved replies or retry your message.');
      if (alive.current) {submission.receipt(data.turn.id,data.turn.user);setState(s => s ? { ...s, turns: [...s.turns.filter(t => t.id !== data.turn.id), data.turn].slice(-30) } : s);}

    } catch (e) {
      if (alive.current && ((e as Error).name !== 'AbortError' || controller.signal.aborted)) {
        setError(controller.signal.aborted ? 'Reply cancelled. Your message is kept.' : (e as Error).message); setMessage(current => current || text);
        if (e instanceof CompanionRequestError && e.retryAt) { setRetryAt(e.retryAt); setRemaining(Math.max(0, Math.ceil((e.retryAt - Date.now()) / 1000))); }
      }
    } finally { action.current = false; replyRequest.current = null; if (alive.current) { setSaving(false); setBusy(false); setPending(''); input.current?.focus(); } }
  }
  async function clear() {
    if (action.current) return;
    action.current = true;
    setClearing(true); setError('');
    try { await request('/history', { method: 'DELETE', body: '{}' }); if (alive.current) { setState(s => s ? { ...s, turns: [] } : s);submission.clear();setMessage('');setClearConfirm(false); } }
    catch (e) { if (alive.current && (e as Error).name !== 'AbortError') setError((e as Error).message); }
    finally { action.current = false; if (alive.current) setClearing(false); }
  }
  const close = () => { setOpen(false); setCustomize(false); setClearConfirm(false); };
  const visit = (href: string) => { if (safeCompanionHref(href)) { close(); navigate(href); } };
  const edit = () => { if (state) setDraft(state.preferences); setCustomize(true); setError(''); };
  const firstName = state?.firstName || user?.name?.split(/\s+/)[0] || '';
  const canAct = Boolean(state?.available && !busy && !saving && !clearing && !remaining);
  const canSend = Boolean(canAct && state?.preferences.aiEnabled);
  const suggest = (text: string) => { if (state?.preferences.aiEnabled) void send(text); else { setMessage(text); input.current?.focus(); } };
  const launch = () => { setOpen(true); if (!state) void load(); };
  const notificationBadge = state?.preferences.reminders && unreadCount > 0 ? <span className="pv-companion-badge" aria-label={`${unreadCount} unread notifications`}>{unreadCount > 9 ? '9+' : unreadCount}</span> : null;
  return <>
    <button type="button" className="pv-companion-launcher" aria-label="Ask AI" aria-haspopup="dialog" aria-expanded={open}
      onClick={launch}>
      <span className="pv-companion-launcher-icon"><Sparkles className="pv-companion-ai-icon" size={24} aria-hidden="true" /></span>
      <span className="pv-companion-launcher-label">Ask AI</span>
      {notificationBadge}
    </button>
    {navigationTarget && createPortal(<CompanionNavigationButton open={open} onLaunch={launch} badge={notificationBadge} />, navigationTarget)}
    <AnimatePresence>{open && <DashboardOverlay aria-label="PineVela companion" onClose={close} className="pv-companion-overlay" onClick={e => { if (e.target === e.currentTarget) close(); }}>
      <motion.section initial={{ opacity: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : .985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: reduceMotion ? 0 : 10, scale: reduceMotion ? 1 : .99 }}
        transition={{ duration: reduceMotion ? 0 : .24, ease: [.22, 1, .36, 1] }}
        className={`pv-companion-panel ${customize ? 'pv-companion-is-customizing' : ''}`} style={{ '--companion-accent': (customize ? active : character).accent } as React.CSSProperties}>
        <header className="pv-companion-header">
          {customize ? <button type="button" className="pv-companion-icon-button" aria-label="Back to chat" onClick={() => { setCustomize(false); setError(''); }} disabled={saving}><ChevronLeft size={20} /></button> : <CompanionAvatar companion={character.id} />}
          <div className="pv-companion-heading"><span className="pv-companion-eyebrow">PINEVELA COMPANION <span>AI</span></span><h2>{customize ? 'Make it yours.' : character.name}</h2><p>{customize ? 'A familiar face. Your kind of company.' : character.title}</p></div>
          {!customize && <button type="button" className="pv-companion-icon-button" aria-label="Customize companion" onClick={edit} disabled={!state || busy}><Settings2 size={18} /></button>}
          <button type="button" className="pv-companion-icon-button" aria-label="Close companion" onClick={close}><X size={21} /></button>
        </header>
        {!state ? <div className="pv-companion-connect"><LoaderCircle className="pv-companion-spin" size={22} /><p>Opening your companion…</p>{error && <><p role="alert">{error}</p><button type="button" onClick={() => void load()}>Try again</button></>}</div> : customize ? <>
          <div className="pv-companion-customize">
            <div className="pv-companion-section-label"><span>01 / CHOOSE YOUR COMPANY</span><span>2 FEMALE · 2 MALE</span></div>
            <div className="pv-companion-choices" role="group" aria-label="Choose your companion">
              {COMPANIONS.map(c => <button type="button" key={c.id} className={`pv-companion-choice ${draft.companion === c.id ? 'is-selected' : ''}`}
                aria-pressed={draft.companion === c.id} onClick={() => setDraft(p => ({ ...p, companion: c.id }))}>
                <CompanionAvatar companion={c.id} /><span className="pv-companion-choice-copy"><span className="pv-companion-choice-taste">{c.taste} · {c.gender}</span><strong>{c.name}</strong><span>{c.description}</span></span>
                {draft.companion === c.id && <Check className="pv-companion-selected" size={15} />}
              </button>)}
            </div>
            <div className="pv-companion-section-label"><span>02 / THE LITTLE THINGS</span></div>
            <label className="pv-companion-field">Reply style<select value={draft.responseStyle} onChange={e => setDraft(p => ({ ...p, responseStyle: e.target.value as CompanionPreferences['responseStyle'] }))}><option value="balanced">A little of everything</option><option value="brief">Short and to the point</option><option value="detailed">Talk me through it</option></select></label>
            <label className="pv-companion-field">Things you like <span className="pv-companion-optional">Optional</span><input maxLength={200} value={draft.interests} onChange={e => setDraft(p => ({ ...p, interests: e.target.value }))} placeholder="Books, tech, a good word game…" /><span className="pv-companion-field-note">Saved for your companion. You can change this anytime.</span></label>
            <label className="pv-companion-toggle"><span><strong>Missed notification reminder</strong><small>A quiet badge on your companion icon.</small></span><input type="checkbox" checked={draft.reminders} onChange={e => setDraft(p => ({ ...p, reminders: e.target.checked }))} /></label>
            <label className="pv-companion-toggle"><span><strong>Enable AI replies</strong><small>Your messages, first name, preferences and relevant app information are sent to Groq. Private notification text stays in PineVela.</small></span><input type="checkbox" checked={draft.aiEnabled} onChange={e => setDraft(p => ({ ...p, aiEnabled: e.target.checked }))} /></label>
            <div className="pv-companion-privacy"><ShieldCheck size={17} /><p>Your name comes from your profile. Recent chat is saved to your account. Your companion cannot buy items, approve forms or read private buyer–seller chats.</p></div>
            <button type="button" className="pv-companion-clear" disabled={busy || clearing || saving} onClick={() => clearConfirm ? void clear() : setClearConfirm(true)}><Trash2 size={15} />{clearing ? 'Clearing…' : clearConfirm ? 'Confirm: clear my conversation' : 'Clear my conversation'}</button>
            {clearConfirm && <button type="button" className="pv-companion-text-button" onClick={() => setClearConfirm(false)}>Keep conversation</button>}
          </div>
          {error && <p className="pv-companion-error" role="alert">{error}</p>}
          <footer className="pv-companion-settings-footer"><span>Made for your everyday.</span><button type="button" className="pv-companion-primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : `Meet ${active.name}`}<ArrowUpRight size={17} /></button></footer>
        </> : <>
          <div className="pv-companion-conversation" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions text">
            {!state.turns.length && <div className="pv-companion-welcome"><CompanionAvatar companion={character.id} /><span className="pv-companion-eyebrow">A LITTLE HELP. A LITTLE COMPANY.</span><h3>Hey{firstName ? `, ${firstName}` : ''}.</h3><p>{character.greeting}</p><div className="pv-companion-suggestions">{['How does buying work?', 'Check my submissions', 'Find something on the market', 'Let’s play a word game'].map(text => <button type="button" key={text} disabled={!canAct} onClick={() => suggest(text)}>{text}<ArrowUpRight size={14} /></button>)}</div></div>}
            {state.preferences.reminders && unreadCount > 0 && <button type="button" className="pv-companion-catchup" onClick={() => void send('Summarize my unread notifications.')} disabled={!canSend}><Bell size={16} /><span>You have {unreadCount} unread {unreadCount === 1 ? 'update' : 'updates'}. Catch me up.</span><ArrowUpRight size={14} /></button>}
            {state.turns.map(t => <div className="pv-companion-turn" key={t.id}>
              <div className="pv-companion-message pv-companion-user-message">{renderAvatarGraphic(user?.avatar || user?.photo, 'w-8 h-8 text-xs')}<div><span className="pv-companion-speaker">{firstName || 'You'}</span><p>{t.user}</p></div></div>
              <div className="pv-companion-message pv-companion-ai-message"><CompanionAvatar companion={t.companion} /><div><span className="pv-companion-speaker">{companionById(t.companion).name}<span>AI</span></span><p>{t.answer}</p>
                {t.cards?.filter(c => safeCompanionHref(c.href)).map((card, i) => <button type="button" className="pv-companion-result" key={`${t.id}-${i}`} onClick={() => visit(card.href)}>
                  {card.image?.startsWith('/api/media/') && <img src={card.image} alt="" loading="lazy" />}
                  <span><small>{card.kind === 'market' ? 'MARKETPLACE' : card.kind === 'status' ? 'YOUR SUBMISSION' : 'YOUR UPDATE'}</small><strong>{card.title}</strong><span>{card.detail}</span>{card.price !== undefined && <b>{card.currency} {card.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>}</span><ArrowUpRight size={17} />
                </button>)}
              </div></div>
            </div>)}
            {pending && <div className="pv-companion-message pv-companion-user-message">{renderAvatarGraphic(user?.avatar || user?.photo, 'w-8 h-8 text-xs')}<div><span className="pv-companion-speaker">{firstName || 'You'}</span><p>{pending}</p></div></div>}
            {busy && <div className="pv-companion-thinking" role="status"><CompanionAvatar companion={character.id} /><span>{slowReply ? 'Taking longer than usual' : `${character.name} is thinking`}<span className="pv-companion-dots">…</span></span><button type="button" className="pv-companion-text-button" onClick={() => replyRequest.current?.abort()}>Cancel reply</button></div>}
            <div ref={bottom} />
          </div>
          {!state.preferences.aiEnabled && <div className="pv-companion-enable"><p id="pv-companion-consent">Enable replies to send your messages, first name, preferences and relevant app information to Groq. Private notification text stays in PineVela.</p><button type="button" className="pv-companion-primary" aria-describedby="pv-companion-consent" disabled={!canAct} onClick={() => void send(message, true)}>{saving ? 'Enabling…' : message.trim() ? 'Enable AI & send' : 'Enable AI replies'}<ArrowUpRight size={16} /></button></div>}
          {!state.available && <p className="pv-companion-error" role="status">AI replies are temporarily unavailable. <button type="button" onClick={() => visit('/help?from=/user/dashboard')}>Open Help</button></p>}
          {(error || remaining > 0) && <p className="pv-companion-error" role={remaining ? 'status' : 'alert'}>{error || 'Your companion needs a pause. Your message is kept.'}{submission.unresolved&&<button type="button" className="pv-companion-text-button" disabled={busy||saving} onClick={()=>void load()}>Check saved replies</button>}{remaining > 0 && <span className="pv-companion-retry">Try again in {remaining >= 3600 ? `${Math.ceil(remaining / 3600)}h` : remaining >= 60 ? `${Math.floor(remaining / 60)}m ${remaining % 60}s` : `${remaining}s`}.</span>}</p>}
          <form className="pv-companion-composer" onSubmit={(e: FormEvent) => { e.preventDefault(); void send(); }}>
            <label className="sr-only" htmlFor="pv-companion-message">Message your companion</label><textarea id="pv-companion-message" ref={input} rows={1} maxLength={1000} value={message} aria-describedby={!state.preferences.aiEnabled ? 'pv-companion-consent' : undefined} onChange={e => setMessage(e.target.value)} placeholder={`Ask ${character.name} anything…`} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); void send(); } }} />
            <button type="submit" aria-label="Send message" disabled={!canSend || !message.trim()}>{busy ? <LoaderCircle className="pv-companion-spin" size={18} /> : <ArrowUp size={20} />}</button>
          </form>
          <footer className="pv-companion-chat-footer"><span>AI can make mistakes. Check important details.</span><button type="button" onClick={() => visit('/help?from=/user/dashboard')}>Need a person?</button></footer>
        </>}
      </motion.section>
    </DashboardOverlay>}</AnimatePresence>
  </>;
}
