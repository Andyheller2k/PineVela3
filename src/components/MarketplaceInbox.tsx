import { ArrowLeft,MessageSquare,RefreshCw,Send,LockKeyhole } from 'lucide-react';
import React,{ useEffect,useMemo,useRef,useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import { safeJson } from '../lib/api';
import { sessionFetch as fetch } from '../lib/session';

import { AccountRefreshGate } from '../lib/accountRefresh';
import {decryptMarketMessage,encryptMarketMessage,type EncryptedMarketMessage,type ChatPublicIdentity,type ChatKeyBackup,type UnlockedChatIdentity,type MessageBinding} from '../../marketEncryptionProtocol';
import {lockedChatIdentity,rememberUnlockedIdentity,lockMarketEncryption,pinChatFingerprint,readableFingerprint} from '../lib/marketEncryption';
import MarketplaceEncryptionSetup from './MarketplaceEncryptionSetup';
import ReportButton from './ReportButton';

interface MarketMessage {
  id: string; buyerId?: string; sellerStoreId?: string; storeId?: string;
  senderRole?: string; senderEmail: string; recipientEmail: string; senderName: string; recipientName: string;
  content: string; productTitle?: string; createdAt: string;
  senderId:string;recipientId:string;requestId:string;encryptionVersion:number;encrypted?:EncryptedMarketMessage;senderIdentity?:ChatPublicIdentity;recipientIdentity?:ChatPublicIdentity;decryptionError?:string;
}
type InboxProps={initialPeerEmail?:string|null;initialStore?:{id:string;email?:string;name:string}};
export default function MarketplaceInbox(props:InboxProps){const {user}=useAuth();return <AccountMarketplaceInbox key={user?.id||'signed-out'} {...props}/>;}
function binding(message:MarketMessage):MessageBinding{return {requestId:message.requestId,buyerId:message.buyerId!,storeId:message.sellerStoreId||message.storeId!,senderId:message.senderId,recipientId:message.recipientId};}
function AccountMarketplaceInbox({ initialPeerEmail, initialStore }: InboxProps) {
  const { user } = useAuth();
  const { notifications, markAsRead } = useNotifications();
  const [savedMessages, setMessages] = useState<MarketMessage[]>([]);
  const [messageOwner,setMessageOwner]=useState<string>();
  const messagesRef=useRef<MarketMessage[]>([]),cursors=useRef<{newest:string|null;older:string|null;more:boolean}>({newest:null,older:null,more:false});
  const [moreHistory,setMoreHistory]=useState(false),[historyLoading,setHistoryLoading]=useState(false);
  const messages=messageOwner===user?.id?savedMessages:[];
  const account=useRef(user?.id),version=useRef(0),readEpoch=useRef(0),mounted=useRef(true);
  const decryptedCache=useRef<{identity?:UnlockedChatIdentity;messages:Map<string,{key:string;content:string}>}>({messages:new Map()});
  if(account.current!==user?.id){account.current=user?.id;version.current++;readEpoch.current++;}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;decryptedCache.current.messages.clear();decryptedCache.current.identity=undefined;};},[]);
  const request=useRef<{params:string;id:string;body?:any}|null>(null);
  const [identity,setIdentity]=useState<UnlockedChatIdentity|undefined>(()=>lockedChatIdentity(user?.id||''));
  const identityRef=useRef(identity);identityRef.current=identity;
  const [keyRecord,setKeyRecord]=useState<{publicIdentity:ChatPublicIdentity|null;backup:ChatKeyBackup|null}|null>(null);
  const [peer,setPeer]=useState<{buyerId:string;storeId:string;recipientId:string;publicIdentity:ChatPublicIdentity|null}|null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const selection=useRef(selected),currentDraft=useRef(draft);selection.current=selected;currentDraft.current=draft;
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const inboxOwner = useRef<string | undefined>(undefined);
  const reads = useRef(new AccountRefreshGate());
  const normalize = (value: string) => value?.trim().toLowerCase();
  const seller = user?.role === 'merchant';
  const requestJson=async(path:string,body?:unknown,signal?:AbortSignal)=>{const response=await fetch(path,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{'Content-Type':'application/json','X-PineVela-Profile-Context':user?.id||''},signal:signal||controller.current?.signal});const data=await safeJson(response);if(!response.ok)throw Error(data.error||'Messages could not be loaded.');return data;};
  const load = (lifecycleSignal?: AbortSignal,older=false) => {
    const id=user?.id,generation=version.current;
    // A slow read must be allowed to finish. Advancing its epoch on each poll
    // previously discarded every reply whenever latency exceeded five seconds.
    return reads.current.run(JSON.stringify([user?.role,id]), generation, async cancellation => {
      const signal = lifecycleSignal ? AbortSignal.any([cancellation, lifecycleSignal]) : cancellation;
      const epoch=++readEpoch.current;
      const current=()=>mounted.current && account.current===id && version.current===generation && readEpoch.current===epoch && !signal.aborted;
      try {
        if(older)setHistoryLoading(true);
        const cursor=older?cursors.current.older:cursors.current.newest;
        const query=new URLSearchParams({paged:'1',limit:'50',...(cursor?{[older?'before':'after']:cursor}:{})});
        const response = await fetch('/api/digital-market/messages?'+query, { headers: { 'X-PineVela-Profile-Context':id||'' }, signal });
        const data = await safeJson(response);
        if (!response.ok) throw new Error(data.error || 'Could not load your messages.');
        const unlocked=identityRef.current;
        const identityChanged=decryptedCache.current.identity!==unlocked;
        if(identityChanged){decryptedCache.current.messages.clear();decryptedCache.current.identity=unlocked;}
        if(!Array.isArray(data.messages))throw Error('Invalid message history response.');
        if(!data.messages.length&&!identityChanged){if(current())setError('');return;}
        const merged=new Map(messagesRef.current.map(m=>[m.id,m]));for(const m of data.messages)merged.set(m.id,m);
        const decrypted:MarketMessage[]=[],source:MarketMessage[]=identityChanged?[...merged.values()]:data.messages;
        const decrypt=async(message:MarketMessage)=>{
          if(message.encryptionVersion!==1)return message;
          if(!unlocked)return {...message,content:'Encrypted message — unlock to read'};
          try{if(!message.senderIdentity||!message.recipientIdentity)throw Error('The message identity is unavailable.');
            pinChatFingerprint(id!,message.senderId,message.senderIdentity.fingerprint);pinChatFingerprint(id!,message.recipientId,message.recipientIdentity.fingerprint);
            const key=JSON.stringify([binding(message),message.encrypted,message.senderIdentity,message.recipientIdentity]),cached=decryptedCache.current.messages.get(message.id);
            if(cached?.key===key)return {...message,content:cached.content};
            const result=await decryptMarketMessage(unlocked,binding(message),message.encrypted,message.senderIdentity,message.recipientIdentity);
            if(current()&&identityRef.current===unlocked&&decryptedCache.current.identity===unlocked)decryptedCache.current.messages.set(message.id,{key,content:result.content});
            return {...message,content:result.content};
          }catch(e:any){return {...message,content:'This encrypted message could not be verified.',decryptionError:e.message};}
        };
        for(let offset=0;offset<source.length;offset+=8){if(!current()||identityRef.current!==unlocked)return;decrypted.push(...await Promise.all(source.slice(offset,offset+8).map(decrypt)));}
        if (current()&&identityRef.current===unlocked) { if(!cursors.current.newest||!older&&data.newestCursor)cursors.current.newest=data.newestCursor||cursors.current.newest;
          if(older||!cursors.current.older){cursors.current.older=data.olderCursor||cursors.current.older;cursors.current.more=data.hasMore;setMoreHistory(data.hasMore);}
          for(const message of decrypted)merged.set(message.id,message);
          const visible=[...merged.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
          messagesRef.current=visible;setMessageOwner(id);setMessages(visible);setError('');
          if(decryptedCache.current.messages.size>2000){const keep=new Set(visible.slice(-2000).map(m=>m.id));for(const key of decryptedCache.current.messages.keys())if(!keep.has(key))decryptedCache.current.messages.delete(key);} }
      } catch (e: any) { if (e.name !== 'AbortError' && current()) setError(e.message || 'Could not load your messages.'); }
      finally { if (current()) {setLoading(false);setHistoryLoading(false);} }
    });
  };
  useEffect(()=>{const abort=new AbortController(),id=user?.id;void requestJson('/api/digital-market/encryption',undefined,abort.signal).then(data=>{if(mounted.current&&account.current===id&&!abort.signal.aborted){setKeyRecord(data);if(data.publicIdentity)pinChatFingerprint(id!,id!,data.publicIdentity.fingerprint);}}).catch(e=>{if(!abort.signal.aborted&&mounted.current)setError(e.message);});
    const locked=()=>{identityRef.current=undefined;decryptedCache.current.messages.clear();decryptedCache.current.identity=undefined;setIdentity(undefined);setMessages([]);messagesRef.current=[];cursors.current={newest:null,older:null,more:false};setMoreHistory(false);setHistoryLoading(false);setMessageOwner(undefined);setDraft('');request.current=null;reads.current.cancel();readEpoch.current++;};
    window.addEventListener('pinevela-chat-locked',locked);return()=>{abort.abort();window.removeEventListener('pinevela-chat-locked',locked);};},[user?.id]);
  useEffect(() => {
    const abort = new AbortController(); controller.current = abort;
    if(inboxOwner.current!==user?.id){
      inboxOwner.current=user?.id;
      setMessages([]);messagesRef.current=[];cursors.current={newest:null,older:null,more:false};setMoreHistory(false);setHistoryLoading(false);setMessageOwner(undefined);request.current=null;setError('');setSelected(null);setDraft('');setLoading(true);
    }
    setSending(false);
    const refreshVisible = () => {
      if (document.hidden) reads.current.cancel();
      else void load(abort.signal);
    };
    refreshVisible();
    const interval = window.setInterval(refreshVisible, 5000);
    document.addEventListener('visibilitychange', refreshVisible);
    return () => { abort.abort(); reads.current.cancel(); window.clearInterval(interval); document.removeEventListener('visibilitychange', refreshVisible); };
  }, [user?.id, user?.token]);
  const threads = useMemo(() => {
    const map = new Map<string, { id: string; email: string; name: string; buyerId?: string; peerId?:string; messages: MarketMessage[] }>();
    for (const message of messages) {
      const own = message.senderRole ? message.senderRole === user?.role : normalize(message.senderEmail) === normalize(user?.email || '');
      const email = own ? message.recipientEmail : message.senderEmail;
      const name = own ? message.recipientName : message.senderName;
      const id = seller ? message.buyerId || email : message.sellerStoreId || message.storeId || email;
      if (!map.has(id)) map.set(id, { id, email, name: name || email, buyerId: message.buyerId,peerId:own?message.recipientId:message.senderId, messages: [] });
      map.get(id)!.messages.push(message);
    }
    if (!seller && initialStore && !map.has(initialStore.id)) map.set(initialStore.id, { ...initialStore,email:initialStore.email || '', messages: [] });
    return [...map.values()].sort((a, b) => Date.parse(b.messages.at(-1)?.createdAt || '1970-01-01') - Date.parse(a.messages.at(-1)?.createdAt || '1970-01-01'));
  }, [messages, user?.id, user?.role, user?.email, initialStore?.id, initialStore?.email, initialStore?.name]);
  useEffect(() => {
    if (!seller && initialStore) setSelected(initialStore.id);
    else if (initialPeerEmail) { const thread = threads.find(t => normalize(t.email) === normalize(initialPeerEmail)); if (thread) setSelected(thread.id); }
  }, [initialPeerEmail, initialStore?.id, threads.length, seller]);
  const active = threads.find(t => t.id === selected);
  useEffect(()=>{setPeer(null);if(!active)return;const abort=new AbortController(),id=user?.id;void requestJson('/api/digital-market/encryption/peer',{sellerStoreId:seller?undefined:active.id,buyerId:seller?active.buyerId:undefined},abort.signal).then(data=>{if(!abort.signal.aborted&&account.current===id){if(data.publicIdentity)pinChatFingerprint(id!,data.recipientId,data.publicIdentity.fingerprint);setPeer(data);}}).catch(e=>{if(!abort.signal.aborted&&mounted.current)setError(e.message);});return()=>abort.abort();},[active?.id,user?.id,identity]);
  useEffect(() => {
    if (!active) return;
    const ids = new Set(active.messages.map(m => m.id));
    const notices = notifications.filter(n => !n.read && n.marketChat && (n.messageId ? ids.has(n.messageId) :
      seller ? n.buyerId === active.buyerId : n.sellerStoreId === active.id));
    void Promise.all(notices.map(n => markAsRead(n.id)));
  }, [selected, active?.messages.length, notifications, markAsRead]);

  useEffect(() => { end.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' }); }, [selected, active?.messages.at(-1)?.id]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!active || !draft.trim() || sending || !identityRef.current) return;
    const text = draft.trim(),id=user?.id,generation=version.current,signal=controller.current?.signal,threadId=active.id;
    const current=()=>mounted.current && account.current===id && version.current===generation && !signal?.aborted;
    reads.current.cancel();readEpoch.current++;setSending(true);setError('');
    try {
      const unlocked=identityRef.current,params=JSON.stringify([id,active.id,active.buyerId,text]);
      if(request.current?.params!==params)request.current={params,id:crypto.randomUUID()};
      if(!request.current.body){const selectedPeer=await requestJson('/api/digital-market/encryption/peer',{sellerStoreId:seller?undefined:active.id,buyerId:seller?active.buyerId:undefined},signal);
        if(!current()||identityRef.current!==unlocked)return;if(!selectedPeer.publicIdentity)throw Error('This contact has not enabled encrypted messages yet. They need to open Messages and save their private recovery phrase.');
        pinChatFingerprint(id!,selectedPeer.recipientId,selectedPeer.publicIdentity.fingerprint);
        const encrypted=await encryptMarketMessage(unlocked,selectedPeer.publicIdentity,{requestId:request.current.id,buyerId:selectedPeer.buyerId,storeId:selectedPeer.storeId,senderId:id!,recipientId:selectedPeer.recipientId},text);
        if(!current()||identityRef.current!==unlocked)return;request.current.body={requestId:request.current.id,sellerStoreId:seller?undefined:active.id,buyerId:seller?active.buyerId:undefined,encrypted};}
      const body=request.current.body;
      const response = await fetch('/api/digital-market/messages', { method: 'POST', signal,
        headers: { 'Content-Type': 'application/json','X-PineVela-Profile-Context':id||'' },body:JSON.stringify(body) });
      const data = await safeJson(response);if(!current())return;
      if (!response.ok) throw new Error(data.error || 'Your message could not be sent.');
      request.current=null;if(selection.current===threadId && currentDraft.current.trim()===text)setDraft('');
      reads.current.cancel();await load(signal);
    } catch (e: any) { if (e.name !== 'AbortError' && current()) setError(e.message || 'Your message could not be sent.'); }
    finally { if(current())setSending(false); }
  };
  return (
    <section aria-label={seller ? 'Buyer messages' : 'Seller messages'} className="overflow-hidden rounded-3xl border border-blue-200/70 bg-white/75 shadow-sm backdrop-blur-xl">
      <header className="flex items-center justify-between border-b border-blue-100 px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-lg font-black text-blue-950"><MessageSquare className="h-5 w-5" />{seller ? 'Buyer messages' : 'Seller messages'}</h2><p className="mt-1 text-xs text-slate-500">{identity?'End-to-end encrypted · private to you and your contact':'Discuss your items, orders and meetup arrangements.'}</p></div>
        <div className="flex items-center gap-1">{identity&&<button type="button" aria-label="Lock encrypted messages" onClick={()=>lockMarketEncryption()} className="rounded-xl p-2 text-blue-700 hover:bg-blue-50"><LockKeyhole className="h-4 w-4"/></button>}<button type="button" aria-label="Refresh messages" onClick={() => {void load(controller.current?.signal);void requestJson('/api/digital-market/encryption').then(setKeyRecord).catch(e=>setError(e.message));}} className="rounded-xl p-2 text-blue-700 hover:bg-blue-50"><RefreshCw className="h-4 w-4" /></button></div>
      </header>
      {!identity&&user?.id&&<MarketplaceEncryptionSetup contextId={user.id} record={keyRecord} request={body=>requestJson('/api/digital-market/encryption',body)} onUnlocked={unlocked=>{if(!mounted.current||account.current!==unlocked.contextId)return;rememberUnlockedIdentity(unlocked);identityRef.current=unlocked;setIdentity(unlocked);void requestJson('/api/digital-market/encryption').then(data=>{if(mounted.current&&account.current===unlocked.contextId)setKeyRecord(data);}).catch(e=>{if(mounted.current)setError(e.message);});void load(controller.current?.signal);}}/>}
      {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{error}</p>}
      <div className="flex h-[min(65dvh,640px)] min-h-[360px]">
        <aside aria-label="Conversations" className={`${active ? 'hidden md:flex' : 'flex'} w-full flex-col overflow-y-auto border-r border-blue-100 md:w-72 md:shrink-0`}>
          {loading ? <p className="p-6 text-sm text-slate-500">Loading messages…</p> : threads.length === 0 ? <p className="p-6 text-sm text-slate-500">{seller ? 'Buyer inquiries will appear here.' : 'Open an item and contact its seller to start a conversation.'}</p> : threads.map(thread => (
            <button type="button" key={thread.id} onClick={() => { setSelected(thread.id); setDraft(''); }} aria-pressed={selected === thread.id} className={`border-b border-blue-50 p-4 text-left transition-colors ${selected === thread.id ? 'bg-blue-100/70' : 'hover:bg-blue-50'}`}>
              <span className="block truncate text-sm font-bold text-blue-950">{thread.name}</span><span className="mt-1 block truncate text-xs text-slate-500">{thread.messages.at(-1)?.content || 'Start a conversation'}</span>
            </button>
          ))}
          {moreHistory&&<button type="button" disabled={historyLoading} onClick={()=>void load(controller.current?.signal,true)} className="m-3 rounded-xl border border-blue-200 p-3 text-xs font-bold text-blue-800 disabled:opacity-50">{historyLoading?'Loading older history…':'Load older conversations & messages'}</button>}
        </aside>
        <div className={`${active ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {active ? <>
            <div className="border-b border-blue-100 p-4"><div className="flex items-center gap-3"><button type="button" onClick={() => setSelected(null)} aria-label="Back to conversations" className="rounded-xl p-2 text-blue-700 md:hidden"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-blue-950">{active.name}</h3><p className="truncate text-xs text-slate-500">{active.email}</p></div>{(peer?.recipientId||active.peerId)&&<ReportButton targetType="profile" targetId={peer?.recipientId||active.peerId!} targetName={active.name} label="Report profile"/>}</div>
            {identity&&<details className="mt-2 text-[11px] text-slate-500"><summary className="cursor-pointer">Encryption fingerprints</summary><p className="mt-2">Compare these with your contact through a trusted channel. A first connection trusts the received public key. Changed fingerprints block sending.</p><p className="mt-2 break-all font-mono">You: {readableFingerprint(identity.publicIdentity.fingerprint)}</p><p className="mt-2 break-all font-mono">Contact: {peer?.publicIdentity?readableFingerprint(peer.publicIdentity.fingerprint):'Not enabled yet. Both participants must enable encryption before sending.'}</p></details>}</div>
            <div role="log" aria-label="Conversation messages" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {moreHistory&&<button type="button" disabled={historyLoading} onClick={()=>void load(controller.current?.signal,true)} className="rounded-xl border border-blue-200 px-4 py-2 text-xs font-bold text-blue-800 disabled:opacity-50">{historyLoading?'Loading…':'Load older history'}</button>}
              {active.messages.map(message => { const own = message.senderRole ? message.senderRole === user?.role : normalize(message.senderEmail) === normalize(user?.email || ''); return <div key={message.id} className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 ${own ? 'bg-blue-900 text-white' : 'border border-blue-100 bg-blue-50 text-slate-800'}`}><p className="whitespace-pre-wrap break-words text-sm [overflow-wrap:anywhere]">{message.content}</p>{message.encryptionVersion!==1&&<p className={`mt-2 text-[10px] ${own?'text-blue-200':'text-slate-500'}`}>Earlier message · sent before encryption</p>}{message.decryptionError&&<p role="alert" className="mt-2 text-[10px] text-red-600">{message.decryptionError}</p>}<time dateTime={message.createdAt} className={`mt-2 block text-right text-[10px] ${own ? 'text-blue-200' : 'text-slate-500'}`}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{!own&&<ReportButton targetType="message" targetId={message.id} targetName="this message" label="Report message" getEvidence={async()=>{if(message.encryptionVersion!==1)return {messageId:message.id};const unlocked=identityRef.current;if(!unlocked||!message.senderIdentity||!message.recipientIdentity)throw Error('Unlock this message with your private recovery phrase before reporting it.');const disclosed=await decryptMarketMessage(unlocked,binding(message),message.encrypted,message.senderIdentity,message.recipientIdentity,true);if(identityRef.current!==unlocked||!mounted.current)throw Error('Messages were locked. Unlock this conversation before sharing selected evidence.');return {messageId:message.id,key:disclosed.key};}}/>}</div></div>; })}<div ref={end} />
            </div>
            <form onSubmit={send} className="flex items-end gap-2 border-t border-blue-100 p-3 sm:p-4"><label className="sr-only" htmlFor="market-message">Message</label><textarea aria-label="Message" id="market-message" rows={2} maxLength={5000} value={draft} disabled={!identity} onChange={e => setDraft(e.target.value)} placeholder={identity?'Write an encrypted message':'Unlock encrypted messages to reply'} className="min-w-0 flex-1 resize-none rounded-xl border border-blue-200 bg-white p-3 text-sm focus:outline-blue-500 disabled:opacity-60" /><button type="submit" disabled={sending || !draft.trim() || !identity || !peer?.publicIdentity} aria-label="Send message" className="rounded-xl bg-blue-900 p-3 text-white disabled:opacity-40"><Send className="h-5 w-5" /></button></form>
          </> : <div className="m-auto p-6 text-center text-sm text-slate-500">Select a conversation to reply.</div>}
        </div>
      </div>
    </section>
  );
}
