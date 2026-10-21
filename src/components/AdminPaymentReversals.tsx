import {useEffect,useRef,useState} from 'react';
import {RefreshCw} from 'lucide-react';
import {useAuth} from '../context/AuthContext';
import {requestKeyedApproval} from '../lib/approvalPrompt';
import {currentSessionGeneration} from '../lib/session';

type Reversal={id:string;reference:string;purpose:string;amount:number;currency:string;providerStatus:string|null;refundedAmount:number|null;
 manualAccess:string|null;disputeState:string|null;reviewRequired:boolean|null;revision:string|null;pending:boolean;accessGranted:boolean};

export default function AdminPaymentReversals(){
 const {user,apiFetch}=useAuth(),account=user?.id;
 const scope=useRef(account);scope.current=account;
 const mounted=useRef(true);
 const [rows,setRows]=useState<Reversal[]|null>(null),[refresh,setRefresh]=useState(0),[selected,setSelected]=useState('');
 const [reason,setReason]=useState(''),[decision,setDecision]=useState<'retain'|'revoke'>('retain');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController(),generation=currentSessionGeneration();setRows(null);setError('');setSelected('');
  apiFetch('/api/admin/payments/reversals',{signal:controller.signal}).then(value=>{
   if(!controller.signal.aborted&&scope.current===account&&generation===currentSessionGeneration()){
    if(!Array.isArray(value))throw new Error('Payment reviews could not be loaded.');setRows(value);
   }
  }).catch(failure=>{if(!controller.signal.aborted&&scope.current===account&&generation===currentSessionGeneration()){setError(failure.message);setRows([]);}});
  return()=>controller.abort();
 },[account,refresh]);
 const payment=rows?.find(row=>row.id===selected);
 async function reconcile(id:string){
  if(busy)return;const generation=currentSessionGeneration();setBusy(true);setError('');
  try{const receipt=await apiFetch(`/api/admin/payments/${id}/reconcile`,{method:'POST',body:'{}'});
   if(mounted.current&&scope.current===account&&generation===currentSessionGeneration()){
    if(!receipt?.success)throw new Error('The server did not confirm reconciliation.');
    setNotice('Provider reconciliation queued. Refresh shortly to see the result.');setRefresh(v=>v+1);
   }
  }catch(failure:any){if(mounted.current&&scope.current===account&&generation===currentSessionGeneration())setError(failure.message);}
  finally{if(mounted.current&&scope.current===account)setBusy(false);}
 }
 return <section aria-label="Payment reversal reviews" className="space-y-4 rounded-3xl border border-slate-200 bg-white/90 p-5 sm:p-6">
  <div className="flex items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">Refunds & payment reviews</h3>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">Confirmed full reversals end paid access from that receipt. Review partial refunds and disputes here. Original receipts and order history remain saved.</p></div>
   <button type="button" disabled={busy} aria-label="Refresh payment reviews" onClick={()=>{setNotice('');setRefresh(v=>v+1);}} className="rounded-xl border border-slate-200 p-3 disabled:opacity-50"><RefreshCw size={17}/></button></div>
  {error&&<p role="alert" className="text-sm text-rose-700">{error}</p>}{notice&&<p role="status" className="text-sm">{notice}</p>}
  {rows===null?<p role="status" className="text-sm text-slate-500">Loading payment reviews…</p>:!rows.length?<p className="text-sm text-slate-500">No payment reversals or disputes to review.</p>:
   <ul className="grid gap-3 md:grid-cols-2">{rows.map(row=><li key={row.id} className="space-y-3 rounded-2xl border border-slate-200 p-4">
    <p className="break-all text-xs font-bold">{row.reference}</p><p className="text-sm">{row.currency} {Number(row.amount).toFixed(2)} · Refunded {row.currency} {Number(row.refundedAmount||0).toFixed(2)}</p>
    <p className="text-xs text-slate-600">{row.pending?'Provider verification pending':!row.providerStatus?'Not yet reconciled':row.providerStatus==='reversed'?'Provider confirmed reversal':row.disputeState&&row.disputeState!=='none'?`Dispute ${row.disputeState}`:'Refund reconciliation complete'} · Paid access {row.accessGranted?'available':'ended'}</p>
    <div className="flex flex-wrap gap-3"><button type="button" disabled={busy} onClick={()=>void reconcile(row.id)} className="text-xs font-bold underline disabled:opacity-50">Recheck with provider</button>
     {row.reviewRequired&&<button type="button" disabled={busy||row.pending} onClick={()=>{setSelected(row.id);setReason('');setDecision('retain');setError('');}} className="rounded-xl bg-yellow-400 px-3 py-2 text-xs font-bold text-blue-950 disabled:opacity-50">Review access</button>}</div>
   </li>)}</ul>}
  {payment&&payment.reviewRequired&&!payment.pending&&<form className="space-y-4 border-t border-slate-200 pt-4" onSubmit={event=>{
   event.preventDefault();if(busy)return;
   const generation=currentSessionGeneration(),current=()=>mounted.current&&scope.current===account&&generation===currentSessionGeneration();
   void requestKeyedApproval(async privateKey=>{
    if(!current())throw new Error('The active account changed. Reopen this review.');setBusy(true);setError('');
    try{const receipt=await apiFetch(`/api/admin/payments/${payment.id}/reversal-review`,{method:'POST',body:JSON.stringify({privateKey,decision,reason:reason.trim(),revision:payment.revision})});
     if(!receipt?.success)throw new Error('The server did not confirm the decision.');
     if(current()){setSelected('');setReason('');setNotice('Payment access decision saved.');setRefresh(v=>v+1);}return receipt;
    }catch(failure:any){if(current())setError(failure.message);throw failure;}
    finally{if(current())setBusy(false);}
   }).catch(()=>{});
  }}>
   <p className="text-sm font-bold break-all">Review {payment.reference}</p>
   <label className="block text-sm font-semibold">Paid-access decision<select disabled={busy} value={decision} onChange={e=>setDecision(e.target.value as 'retain'|'revoke')} className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3"><option value="retain">Keep eligible access after this review</option><option value="revoke">End access from this receipt</option></select></label>
   <p className="text-xs leading-6 text-slate-600">Keeping access cannot override a confirmed full reversal. This decision does not send or move money.</p>
   <label className="block text-sm font-semibold">Review reason<textarea required minLength={3} maxLength={500} disabled={busy} value={reason} onChange={e=>setReason(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-transparent p-3"/></label>
   <button disabled={busy||reason.trim().length<3} className="rounded-xl bg-yellow-400 px-4 py-3 text-sm font-bold text-blue-950 disabled:opacity-50">Save with approval key</button>
  </form>}
 </section>;
}
