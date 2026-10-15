import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Building2,X} from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';
import {invalidateAllQueries} from '../lib/queryClient';
import {canDecideResidenceReview,residenceReviewLabel} from '../lib/residenceReview';

type Decision='approve'|'reject'|'request-info';
const field='mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
const labels:Record<Decision,string>={approve:'Approve residence',reject:'Reject registration','request-info':'Request corrections'};
export default function AdminResidenceRegistrationReview({residenceId,onClose,onReviewed}:{residenceId:string;onClose:()=>void;onReviewed:()=>void}) {
  const {user}=useAuth(),owner=useRef(user?.id);owner.current=user?.id;
  const [record,setRecord]=useState<any>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[notes,setNotes]=useState('');
  const [decision,setDecision]=useState<Decision|''>(''),[reload,setReload]=useState(0);
  const inFlight=useRef(false),live=useRef(false);
  useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
  useEffect(()=>{
    const controller=new AbortController(),captured=user?.id;
    setRecord(null);setLoading(true);setError('');setNotice('');setNotes('');setDecision('');
    void (async()=>{
      const response=await sessionFetch('/api/admin/hostels',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
      if(!response.ok)throw Error('Your administrator session could not load this residence.');
      const rows=await response.json();if(!Array.isArray(rows))throw Error('The residence review could not be loaded.');
      const found=rows.find(r=>r.id===residenceId);if(!found)throw Error('This residence is no longer available for review.');
      if(!controller.signal.aborted&&owner.current===captured)setRecord(found);
    })().catch(e=>{if(!controller.signal.aborted&&owner.current===captured)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted&&owner.current===captured)setLoading(false);});
    return()=>controller.abort();
  },[residenceId,user?.id,reload]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(inFlight.current||!record||!decision||!canDecideResidenceReview(record))return;
    if(decision!=='approve'&&notes.trim().length<5){setError('Explain the requested corrections or rejection in at least five characters.');return;}
    inFlight.current=true;setBusy(true);setError('');setNotice('');const captured=user?.id;
    try{
      const response=await sessionFetch(`/api/hostel-verifications/${encodeURIComponent(record.verificationId)}/${decision}`,{
        method:'PUT',headers:{'content-type':'application/json','X-PineVela-Profile-Context':String(captured)},body:JSON.stringify({adminNotes:notes.trim()}),signal:AbortSignal.timeout(45000)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'The residence decision could not be saved.');
      if(!result.success||!result.hostel||result.hostel.id!==residenceId)throw Error('The saved decision could not be confirmed. Refresh the review before retrying.');
      invalidateAllQueries();onReviewed();
      if(live.current&&owner.current===captured){setRecord((previous:any)=>({...previous,...result.hostel,adminNotes:notes.trim()}));
        setNotes('');setDecision('');setNotice(decision==='request-info'?'Corrections requested. The primary owner and administrators have been notified.':'The residence review decision has been saved. The primary owner and administrators have been notified.');}
    }catch(e:any){if(live.current&&owner.current===captured)setError(e.name==='TimeoutError'?'The request timed out. Reload the saved review to check its result before retrying.':e.message);}
    finally{inFlight.current=false;if(live.current)setBusy(false);}
  };
  const details=record?[
    ['Street address',record.addressLine1||record.location],['City / region',[record.city,record.region].filter(Boolean).join(', ')],
    ['Map pin',record.latitude!=null&&record.longitude!=null?`${record.latitude}, ${record.longitude}`:''],
    ['Property type',record.wing],['Established',record.yearEstablished],['Stay cycle',record.paymentFrequency],
    ['Public contact',[record.contactEmail,record.contactPhone].filter(Boolean).join(' · ')],
    ['Manager',[record.managerName,record.managerEmail,record.managerPhone].filter(Boolean).join(' · ')]]:[];
  const photos: string[]=record?[...new Set<string>([record.imageUrl,...(record.gallery||[])].filter(Boolean))]:[];
  return <DashboardOverlay aria-label="Review residence registration" onClose={busy?null:onClose} className="flex items-center justify-center bg-slate-950/75 p-3 backdrop-blur-md sm:p-6">
    <section className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-7">
      <header className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">Review residence registration</h2>
        {record&&<><p className="mt-1 font-semibold">{record.name}</p><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{residenceReviewLabel(record)}</p></>}</div>
        <button type="button" disabled={busy} aria-label="Close residence review" onClick={onClose} className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 disabled:opacity-50 dark:border-slate-600"><X size={20}/></button></header>
      {loading&&<p role="status" className="mt-5 text-sm">Loading the saved residence registration…</p>}
      {error&&<p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
      {notice&&<p role="status" className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">{notice}</p>}
      {!loading&&!record&&<button type="button" onClick={()=>setReload(n=>n+1)} className="mt-3 min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold">Retry loading review</button>}
      {record&&<div className="mt-5 space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">{details.map(([label,value])=><div key={label}><dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm">{value||'Not provided'}</dd></div>)}</dl>
        <section aria-label="Submitted residence photographs"><h3 className="font-semibold">Submitted photographs</h3>{photos.length?<div className="mt-2 grid grid-cols-2 gap-3">{photos.map((photo,index)=><a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt={`Submitted residence photograph ${index+1}`} className="h-36 w-full rounded-xl border border-slate-200 object-cover"/></a>)}</div>:<p className="mt-2 flex items-center gap-2 text-sm"><Building2 size={20}/>No photographs submitted.</p>}</section>
        <section aria-label="Configured residence capacity"><h3 className="font-semibold">{record.totalBlocks} blocks · {record.totalFloors} floors · {record.totalRooms} rooms · {record.totalBeds} beds</h3>
          <div className="mt-2 space-y-3">{(record.blocksList||[]).map((block:any)=><div key={block.id} className="rounded-xl border border-blue-100 p-3 dark:border-slate-700"><p className="text-sm font-semibold">{block.name} · {block.floors} floors</p>
            <ul className="mt-1 space-y-1 text-sm">{(block.roomTypes||[]).map((layout:any)=><li key={layout.typeName}>{layout.typeName}: {layout.totalRooms} rooms, {layout.bedsPerRoom} beds per room</li>)}</ul></div>)}</div></section>
        {record.adminNotes&&<section aria-label="Previous residence review feedback"><h3 className="font-semibold">Previous review feedback</h3><p className="mt-1 whitespace-pre-wrap text-sm">{record.adminNotes}</p></section>}
        {canDecideResidenceReview(record)?<form onSubmit={submit} className="space-y-4 border-t border-blue-100 pt-5 dark:border-slate-700">
          <label className="block text-sm font-semibold">Review decision<select required disabled={busy} value={decision} onChange={e=>{setDecision(e.target.value as Decision);setError('');}} className={field}>
            <option value="" disabled>Choose a decision</option><option value="request-info">Request corrections</option><option value="approve">Approve residence</option><option value="reject">Reject registration</option></select></label>
          <label className="block text-sm font-semibold">{decision==='approve'?'Review notes (optional)':'Feedback for the primary owner'}<textarea disabled={busy} required={decision!=='approve'} minLength={decision==='approve'?undefined:5} maxLength={4000} value={notes} onChange={e=>setNotes(e.target.value)} className={field}/></label>
          {decision==='reject'&&<p className="text-sm text-rose-800 dark:text-rose-200">Rejection is final for this submission. Choose Request corrections when the manager should update and resubmit it.</p>}
          <button type="submit" disabled={busy||!decision} className="min-h-11 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{busy?'Saving review…':decision?labels[decision]:'Save review decision'}</button>
        </form>:<p className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800">{record.registrationRequired?'Full residence setup has not been submitted. Manager approval alone does not publish this property.':'This registration is not awaiting an administrator decision.'}</p>}
        <button type="button" disabled={busy} onClick={()=>setReload(n=>n+1)} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold disabled:opacity-50 dark:border-slate-600">Reload saved review</button>
      </div>}
    </section>
  </DashboardOverlay>;
}
