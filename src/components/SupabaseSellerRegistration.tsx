import React,{useEffect,useId,useState} from 'react';
import DashboardOverlay from './DashboardOverlay';
import VerifiedAccountEnrollment from './VerifiedAccountEnrollment';
import TermsAcceptanceControl from './TermsAcceptanceControl';
import { termsAcceptance } from '../../legalPolicy';
import { sessionFetch as fetch } from '../lib/session';
const control='w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:ring-2 focus:ring-blue-600';
async function request(url:string,options:RequestInit={}){const res=await fetch(url,options),data=await res.json();if(!res.ok)throw new Error(data.error || 'Seller registration could not complete.');return data;}
export default function SupabaseSellerRegistration({name,phone,categories,onClose,onSubmitted}:{name?:string;phone?:string;categories:string[];onClose:()=>void;onSubmitted:()=>void}){
  const id=useId(),[ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[existing,setExisting]=useState<any>(null);
  const [acceptedTerms,setAcceptedTerms]=useState(false);
  const [enrollment,setEnrollment]=useState(''),[campus,setCampus]=useState(''),[category,setCategory]=useState(''),[studentId,setStudentId]=useState(''),[storeName,setStoreName]=useState(''),[certified,setCertified]=useState(false);
  useEffect(()=>{let live=true;request('/api/digital-market/status').then(data=>{if(!live)return;setExisting(data.application);
    if(data.application?.status==='rejected'){const app=data.application;setEnrollment(app.enrollmentId);setCampus(app.university);setCategory(app.categoryToSell);setStudentId(app.idNumber);setStoreName(app.storeName);}
    setReady(true);
  }).catch(err=>{if(live)setError(err.message);});return()=>{live=false;};},[]);
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try{
    await request('/api/digital-market/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({enrollmentId:enrollment,university:campus,categoryToSell:category,idNumber:studentId,storeName,certified,termsAcceptance:termsAcceptance(acceptedTerms)})});
    onSubmitted();onClose();
  }catch(err:any){setError(err.message);}finally{setBusy(false);}};
  return <DashboardOverlay data-pv-onboarding aria-label="Verified seller registration" onClose={onClose} className="pv-merchant-registration-overlay fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
    <section className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border border-blue-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between gap-4"><h2 className="text-xl font-bold text-blue-950">Seller registration</h2><button type="button" aria-label="Close seller registration" onClick={onClose} className="rounded-xl border border-blue-200 px-3 py-2">Close</button></div>
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {!ready && !error && <p role="status">Checking your saved registration…</p>}
      {ready && existing && existing.status!=='rejected' ? <div className="space-y-3"><p>Your application for <strong>{existing.storeName}</strong> is {existing.status}.</p><p className="text-sm text-slate-600">Approved sellers sign in with their verified student identity to complete store setup and payment.</p></div> : ready && <>
        {existing?.status==='rejected' && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Review notes: {existing.adminNotes}. Revise the details below and resubmit.</p>}
        {!enrollment ? <VerifiedAccountEnrollment kind="seller" initialName={name} initialPhone={phone} onVerified={async value=>{setEnrollment(value);}} /> : <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate-600">Your student identity is verified. Enter your actual campus and store details for administrator review.</p>
          <div><label htmlFor={`${id}-campus`} className="mb-1 block text-sm font-semibold">University / campus</label><input id={`${id}-campus`} required maxLength={250} value={campus} onChange={e=>setCampus(e.target.value)} className={control} /></div>
          <div><label htmlFor={`${id}-category`} className="mb-1 block text-sm font-semibold">Primary category</label><select id={`${id}-category`} required value={category} onChange={e=>setCategory(e.target.value)} className={control}><option value="">Choose your primary category</option>{categories.map(v=><option key={v} value={v}>{v}</option>)}</select></div>
          <div><label htmlFor={`${id}-student-id`} className="mb-1 block text-sm font-semibold">School-issued identification number</label><input id={`${id}-student-id`} required minLength={4} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9/-]{3,31}" value={studentId} onChange={e=>setStudentId(e.target.value)} className={control} /></div>
          <div><label htmlFor={`${id}-store`} className="mb-1 block text-sm font-semibold">Proposed store name</label><input id={`${id}-store`} required maxLength={200} value={storeName} onChange={e=>setStoreName(e.target.value)} className={control} /></div>
          <label className="flex gap-3 text-sm"><input type="checkbox" required checked={certified} onChange={e=>setCertified(e.target.checked)} className="mt-1" /><span>I certify that I am an enrolled student at this university and that these details and identification are genuine.</span></label>
          <TermsAcceptanceControl checked={acceptedTerms} onChange={setAcceptedTerms} merchant />
          <button disabled={busy||!acceptedTerms||!certified} className="w-full rounded-xl bg-blue-900 px-4 py-3 font-semibold text-white disabled:opacity-60">{busy?'Submitting…':existing?'Resubmit for review':'Submit for review'}</button>
        </form>}
      </>}
    </section>
  </DashboardOverlay>;
}
