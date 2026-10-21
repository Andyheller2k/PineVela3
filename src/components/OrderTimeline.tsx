import {useEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {apiFetch} from '../lib/api';
import {currentSessionGeneration} from '../lib/session';
type Step={id?:string;status:string;title:string;timestamp:string;notes?:string};
type Order={id:string;timeline?:Step[];timelineCursor?:string|null;timelineHasMore?:boolean};
export default function OrderTimeline({order}:{order:Order}){
  const {user}=useAuth();
  return <AccountOrderTimeline key={JSON.stringify([user?.id,currentSessionGeneration(),order.id])} order={order}/>;
}
function AccountOrderTimeline({order}:{order:Order}){
  const {user}=useAuth(),account=useRef(user?.id),mounted=useRef(true),paging=useRef(false),pending=useRef(false);
  account.current=user?.id;
  const [older,setOlder]=useState<Step[]>([]),[cursor,setCursor]=useState(order.timelineCursor),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;controller.current?.abort();};},[]);
  useEffect(()=>{if(!paging.current)setCursor(order.timelineCursor);},[order.timelineCursor]);
  const steps=useMemo(()=>{
    const rows=new Map<string,Step>();for(const step of [...older,...(order.timeline||[])])rows.set(step.id||JSON.stringify([step.timestamp,step.title]),step);
    return [...rows.values()].sort((a,b)=>a.timestamp.localeCompare(b.timestamp)||(a.id||'').localeCompare(b.id||''));
  },[older,order.timeline]);
  const load=async()=>{
    if(!cursor||pending.current)return;const id=user?.id,generation=currentSessionGeneration();pending.current=true;setBusy(true);setError('');
    const abort=new AbortController();controller.current=abort;
    const current=()=>mounted.current&&account.current===id&&currentSessionGeneration()===generation&&!abort.signal.aborted;
    try{const page=await apiFetch('/api/digital-market/orders/'+encodeURIComponent(order.id)+'/events?limit=20&before='+encodeURIComponent(cursor),{signal:abort.signal,headers:{'X-PineVela-Profile-Context':id||''}});
      if(!current())return;if(!Array.isArray(page.timeline)||typeof page.hasMore!=='boolean'||page.nextCursor!==null&&typeof page.nextCursor!=='string')throw Error('Earlier updates could not load.');
      paging.current=true;setOlder(previous=>[...page.timeline,...previous]);setCursor(page.nextCursor);
    }catch(e:any){if(current())setError(e.message||'Earlier updates could not load.');}
    finally{pending.current=false;if(current())setBusy(false);}
  };
  return <div className="space-y-2 border-t border-slate-200/60 pt-3"><h5 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">Chronological Order Timeline</h5>
    {cursor&&<button type="button" disabled={busy} onClick={()=>void load()} className="rounded-xl border border-blue-200 px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-50">{busy?'Loading…':'Load earlier timeline updates'}</button>}
    {error&&<p role="status" className="text-xs text-rose-700">{error}</p>}
    <div className="relative space-y-2 border-l-2 border-blue-200 pl-4">{steps.map(step=><div key={step.id||JSON.stringify([step.timestamp,step.title])} className="relative text-xs"><div className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-white"/><div className="font-bold text-slate-900">{step.title}</div><div className="text-[10px] text-slate-500">{new Date(step.timestamp).toLocaleString()}</div>{step.notes&&<div className="mt-0.5 text-[11px] font-medium text-slate-600">{step.notes}</div>}</div>)}</div>
  </div>;
}
