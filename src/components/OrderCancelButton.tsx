import {useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {apiFetch} from '../lib/api';
import {currentSessionGeneration} from '../lib/session';
import DashboardOverlay from './DashboardOverlay';

export default function OrderCancelButton({order,onCancelled}:{order:{id:string;productTitle:string;status:string};onCancelled:(order:any)=>void}){
  const {user}=useAuth(),owner=useRef(user?.id),mounted=useRef(true),pending=useRef(false);
  owner.current=user?.id;
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  if(!['Awaiting Seller Confirmation','Pending Meetup'].includes(order.status))return null;
  const cancel=async()=>{
    if(pending.current)return;const id=user?.id,generation=currentSessionGeneration();pending.current=true;setBusy(true);setError('');
    const current=()=>mounted.current&&owner.current===id&&generation===currentSessionGeneration();
    try{const result=await apiFetch('/api/digital-market/orders/'+encodeURIComponent(order.id)+'/update-status',{method:'POST',signal:AbortSignal.timeout(30000),headers:{'X-PineVela-Profile-Context':id||''},body:JSON.stringify({action:'cancelled'})});
      if(!current())return;if(!result.success||!result.order)throw Error('Cancellation was not confirmed. Refresh the order and retry.');onCancelled(result.order);setOpen(false);
    }catch(e:any){if(current())setError(e.name==='TimeoutError'?'Cancellation could not be confirmed. Refresh this order before retrying.':e.message||'Could not cancel this order.');}
    finally{pending.current=false;if(current())setBusy(false);}
  };
  return <><button type="button" onClick={()=>setOpen(true)} className="rounded-xl border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">Cancel request</button>
    {open&&<DashboardOverlay aria-label="Cancel order request" onClose={busy?null:()=>setOpen(false)} className="fixed inset-0 flex items-center justify-center bg-blue-950/40 p-4 backdrop-blur-xl">
      <section className="w-full max-w-md space-y-4 rounded-3xl border border-yellow-400/50 bg-white p-6 text-blue-950 shadow-xl dark:bg-[#001d3d] dark:text-slate-100">
        <h2 className="text-xl font-black">Cancel this request?</h2><p className="text-sm">{order.productTitle}</p><p className="text-sm">This releases the reservation and keeps your order history. Purchases use Pay on Campus Delivery. Contact Help if you already paid the seller directly.</p>
        {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" disabled={busy} onClick={()=>setOpen(false)} className="rounded-xl border border-blue-200 px-4 py-2 text-sm font-bold">Keep request</button><button type="button" disabled={busy} onClick={()=>void cancel()} className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">{busy?'Cancelling…':'Confirm cancellation'}</button></div>
      </section>
    </DashboardOverlay>}
  </>;
}
