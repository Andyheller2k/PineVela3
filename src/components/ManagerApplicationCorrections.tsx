import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';
import {invalidateAllQueries} from '../lib/queryClient';
import HostelMapPicker from './HostelMapPicker';

type Property={name:string;location:string;latitude:number;longitude:number;landmark:string;description:string};
const field='mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';

/** Corrections use the primary owner's existing verified work-email enrollment.
 * No second identity, residence or application is created here. */
export default function ManagerApplicationCorrections({onClose,onSubmitted}:{onClose:()=>void;onSubmitted:()=>void}) {
  const {user}=useAuth(),owner=useRef(user?.id);owner.current=user?.id;
  const [account,setAccount]=useState<any>(null),[property,setProperty]=useState<Property|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [confirmed,setConfirmed]=useState(false),[reload,setReload]=useState(0),[mustReload,setMustReload]=useState(false);
  const live=useRef(false),inFlight=useRef(false),request=useRef<AbortController|null>(null);
  useEffect(()=>{live.current=true;return()=>{live.current=false;request.current?.abort();};},[]);
  useEffect(()=>{
    const controller=new AbortController(),captured=user?.id;
    setLoading(true);setError('');setAccount(null);setProperty(null);setConfirmed(false);setMustReload(false);
    void (async()=>{
      const response=await sessionFetch('/api/users/my-registered-accounts',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
      const data=await response.json();if(!response.ok)throw Error(data.error||'Could not load your manager application.');
      const saved=data.managerAccount,p=saved?.property;
      if(!saved?.canCorrectRegistration||saved.status!=='more_info_required'||!saved.enrollmentId||!saved.verificationId)
        throw Error('This application is no longer awaiting corrections. Return to your registration status.');
      if(!p||typeof p.name!=='string'||typeof p.location!=='string'||!Number.isFinite(p.latitude)||!Number.isFinite(p.longitude))
        throw Error('The saved property details could not be loaded.');
      if(!controller.signal.aborted&&owner.current===captured){setAccount(saved);setProperty({...p});}
    })().catch(e=>{if(!controller.signal.aborted&&owner.current===captured)setError(e.message);})
      .finally(()=>{if(!controller.signal.aborted&&owner.current===captured)setLoading(false);});
    return()=>controller.abort();
  },[user?.id,reload]);
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(inFlight.current||!account||!property||!confirmed||mustReload)return;
    inFlight.current=true;setBusy(true);setError('');const captured=user?.id,controller=new AbortController();request.current=controller;
    try{
      const response=await sessionFetch('/api/manager-verifications/submit',{method:'POST',
        headers:{'content-type':'application/json','X-PineVela-Profile-Context':String(captured)},
        body:JSON.stringify({enrollmentId:account.enrollmentId,hostelName:property.name,location:property.location,
          latitude:property.latitude,longitude:property.longitude,landmark:property.landmark,description:property.description,knustAccreditedConfirmed:confirmed}),
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(45000)])});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Your corrections could not be saved.');
      if(!result.success||result.verification?.id!==account.verificationId||result.verification?.status!=='inspection_pending')
        throw Error('The saved result could not be confirmed.');
      if(live.current&&owner.current===captured){invalidateAllQueries();onSubmitted();}
    }catch(e:any){if(live.current&&owner.current===captured){setError(`${e.name==='TimeoutError'?'The request timed out.':e.message} Reload the saved application before retrying.`);setMustReload(true);}}
    finally{request.current=null;inFlight.current=false;if(live.current&&owner.current===captured)setBusy(false);}
  };
  const change=(key:keyof Property,value:string)=>setProperty(p=>p?{...p,[key]:value}:p);
  return <section aria-label="Correct manager application" className="space-y-5 rounded-3xl border border-blue-200 bg-white p-5 text-slate-900 shadow-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:p-8">
    <header><h1 className="text-2xl font-bold">Correct manager application</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Update the requested property details. Your verified manager email stays attached to this application. A fresh physical inspection and administrator approval are required.</p></header>
    {loading&&<p role="status">Loading your saved application…</p>}
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
    {account&&property&&<form onSubmit={submit} className="space-y-5">
      {account.adminNotes&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"><strong>Administrator feedback</strong><p className="mt-1 whitespace-pre-wrap">{account.adminNotes}</p></div>}
      <p className="break-words text-sm">Verified manager email: <strong>{account.email}</strong></p>
      <fieldset disabled={busy||mustReload} className="space-y-4 disabled:opacity-60">
        <label className="block text-sm font-semibold">Residence name<input required maxLength={200} value={property.name} onChange={e=>change('name',e.target.value)} className={field}/></label>
        <label className="block text-sm font-semibold">Street address or selected map location<input required minLength={4} maxLength={600} value={property.location} onChange={e=>change('location',e.target.value)} className={field}/></label>
        <HostelMapPicker latitude={property.latitude} longitude={property.longitude} initialAddressHint={property.location} onLocationSelect={coords=>{
          if(!busy&&!mustReload)setProperty(p=>p?{...p,latitude:coords.lat,longitude:coords.lng,location:coords.addressSnippet||p.location}:p);
        }}/>
        <label className="block text-sm font-semibold">Nearby landmark (optional)<input maxLength={200} value={property.landmark} onChange={e=>change('landmark',e.target.value)} className={field}/></label>
        <label className="block text-sm font-semibold">Property description (optional)<textarea rows={4} maxLength={4000} value={property.description} onChange={e=>change('description',e.target.value)} className={field}/></label>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input required type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} className="mt-1 h-5 w-5 shrink-0"/>I confirm that this residence is in Kumasi and accredited for KNUST student accommodation.</label>
      </fieldset>
      <button disabled={busy||mustReload||!confirmed} className="min-h-11 rounded-xl bg-blue-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'Saving corrections…':'Resubmit for physical inspection'}</button>
    </form>}
    <div className="flex flex-wrap gap-3">
      {(!loading&&(!account||mustReload))&&<button type="button" disabled={busy} onClick={()=>setReload(n=>n+1)} className="min-h-11 rounded-xl border border-blue-200 px-4 text-sm font-semibold">Reload saved application</button>}
      <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold disabled:opacity-50 dark:border-slate-600">Return to registration status</button>
    </div>
  </section>;
}
