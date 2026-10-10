import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import { ACCOUNT_FEATURES } from '../../accountFeatures';
import { useAdminGovernance } from './AdminGovernancePanel';
import DashboardOverlay from './DashboardOverlay';

const field='mt-1 w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-900';
const button='rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed';
export default function SupabaseAccountModerationPanel({target,onClose,onApplied}:{target:any;onClose:()=>void;onApplied:()=>void}) {
  const {user}=useAuth(),{data,error:loadError,isPending,refetch}=useAdminGovernance();
  const mounted=useRef(true),running=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const [busy,setBusy]=useState(false),[failure,setFailure]=useState(''),[notice,setNotice]=useState('');
  const [privateKey,setPrivateKey]=useState(''),[action,setAction]=useState('ban'),[reason,setReason]=useState('');
  const [amount,setAmount]=useState('24'),[unit,setUnit]=useState('hours'),[features,setFeatures]=useState<string[]>([]);
  const [finalId,setFinalId]=useState(''),[rejection,setRejection]=useState('');
  const ready=data?.members?.length===5&&data.members.every((m:any)=>m.active&&m.keyEnrolled);
  const founder=data?.currentId===data?.mainId,protectedTarget=target?.role==='admin';
  async function act(path:string,body:any,close=false) {
    if(running.current)return;running.current=true;setBusy(true);setFailure('');setNotice('');
    try {
      const response=await sessionFetch('/api/admin/governance/accounts'+path,{method:'POST',
        headers:{'Content-Type':'application/json','X-PineVela-Account-Context':user!.id},body:JSON.stringify({...body,privateKey})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'The review could not be saved.');
      if(!mounted.current)return;
      if(result.success!==true)throw new Error('Account review could not be confirmed. Refresh before retrying.');
      setNotice(result.message);setFinalId('');setRejection('');
      await refetch();if(!mounted.current)return;onApplied();if(close)onClose();
    }catch(err:any){if(mounted.current)setFailure(err.message||'The review could not be saved.');}
    finally{running.current=false;if(mounted.current){setPrivateKey('');setBusy(false);}}
  }
  const keyInput=<label className="block text-sm font-semibold">Your private approval key<input required type="password" autoComplete="off" maxLength={128} value={privateKey} onChange={e=>setPrivateKey(e.target.value)} className={field}/><span className="mt-1 block text-xs font-normal text-slate-600">Use your own approval key, separate from the settings key. It is cleared after every request.</span></label>;
  const proposals=data?.accountProposals||[];
  return <section aria-label="Account approvals" className="space-y-4 rounded-3xl border border-blue-200 bg-white/70 p-5 text-slate-900 backdrop-blur-xl">
    <h3 className="text-lg font-bold">Account proposals and approvals</h3>
    <p className="text-sm text-slate-600">Five administrators must approve, including the main administrator. Approval alone changes no account.</p>
    <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">Reviews are available. Applying bans, restrictions, restorations and deletions remains disabled until the remaining migration checks pass.</p>
    {!ready&&!isPending&&<p className="text-sm text-amber-900">Five active administrators must enroll their own approval keys before a review can proceed.</p>}
    {isPending&&<p role="status">Loading account reviews…</p>}
    {loadError&&<p role="alert" className="text-red-800">{loadError.message}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm">{notice}</p>}
    {failure&&!target&&<p role="alert" className="text-red-800">{failure}</p>}
    <fieldset disabled={busy} className="space-y-4">
      {!target&&proposals.some((p:any)=>p.status==='pending'||founder&&p.status==='approved')&&keyInput}
      {!isPending&&!loadError&&!proposals.length&&<p className="text-sm text-slate-600">No account reviews have been submitted.</p>}
      {proposals.map((p:any)=><article key={p.id} className="space-y-3 rounded-2xl border border-blue-100 bg-white/70 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words font-semibold capitalize">{p.action} · {p.targetName}</h4><span className="text-xs font-bold uppercase text-blue-700">{p.status}</span></div>
        <p className="break-all text-xs text-slate-600">{p.targetRole} · Account ID: {p.targetId}</p><p className="break-words text-sm">{p.reason}</p>
        {p.duration&&<p className="text-sm">Proposed ban: {p.duration.amount} {p.duration.unit}, starting only if applied.</p>}
        {p.features.length>0&&<p className="text-sm">Proposed restrictions: {p.features.map((f:keyof typeof ACCOUNT_FEATURES)=>ACCOUNT_FEATURES[f]).join(', ')}.</p>}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{p.roster.map((m:any)=><p key={m.id} className="rounded-xl bg-blue-50 p-3 text-xs">Administrator {m.slot} · {m.name}<span className="mt-1 block font-semibold capitalize">{p.votes.find((v:any)=>v.id===m.id)?.decision||'Awaiting approval'}</span></p>)}</div>
        <p className="text-xs text-slate-600">Review expires {new Date(p.expiresAt).toLocaleString()}</p>
        {p.finalRejectionReason&&<p className="break-words text-sm text-rose-800">Final rejection by the main administrator: {p.finalRejectionReason}</p>}
        {p.status==='pending'&&!p.votes.some((v:any)=>v.id===data.currentId)&&<div className="flex flex-wrap gap-3">
          <button type="button" className={button} disabled={!ready||!privateKey} onClick={()=>act('/'+p.id+'/vote',{decision:'approved'})}>Approve review</button>
          <button type="button" className={button+' !bg-rose-700'} disabled={!ready||!privateKey} onClick={()=>act('/'+p.id+'/vote',{decision:'rejected'})}>Reject review</button>
        </div>}
        {p.status==='approved'&&founder&&<><button type="button" className={button+' !bg-rose-700'} disabled={!ready} onClick={()=>{setFinalId(p.id);setRejection('');}}>Review final rejection</button>
          {finalId===p.id&&<form className="space-y-3" onSubmit={e=>{e.preventDefault();void act('/'+p.id+'/final-reject',{reason:rejection});}}>
            <label className="block text-sm">Final rejection reason<textarea required minLength={3} maxLength={500} value={rejection} onChange={e=>setRejection(e.target.value)} className={field}/></label>
            <button className={button+' !bg-rose-700'} disabled={!privateKey||rejection.trim().length<3}>Confirm final rejection</button>
            <button type="button" className="ml-3 rounded-xl border border-blue-200 px-4 py-3 text-sm" onClick={()=>setFinalId('')}>Cancel</button>
          </form>}</>}
      </article>)}
    </fieldset>
    {target&&<DashboardOverlay aria-label="Propose account review" onClose={busy?null:onClose} className="flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <form className="max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border border-blue-200 bg-white p-6 text-slate-900 shadow-2xl" onSubmit={e=>{e.preventDefault();void act('',{targetId:target.id,targetRole:target.role,action,reason,features:action==='restrict'?features:[],duration:action==='ban'?{amount:Number(amount),unit}:null},true);}}>
        <h3 className="break-words text-xl font-bold">Account review · {target.name}</h3>
        {protectedTarget?<p>Administrator accounts use the membership controls in Admin Approvals.</p>:<fieldset disabled={busy||!ready} className="space-y-4">
          <label className="block text-sm">Proposed action<select value={action} onChange={e=>{setAction(e.target.value);setFeatures([]);}} className={field}><option value="ban">Timed ban</option><option value="restrict">Restrict selected features</option><option value="restore">Restore access</option></select></label>
          {action==='ban'&&<div className="grid grid-cols-2 gap-3"><label className="text-sm">Duration<input required type="number" min={1} step={1} value={amount} onChange={e=>setAmount(e.target.value)} className={field}/></label><label className="text-sm">Unit<select value={unit} onChange={e=>setUnit(e.target.value)} className={field}>{['hours','days','weeks','months','years'].map(u=><option key={u}>{u}</option>)}</select></label></div>}
          {action==='restrict'&&<fieldset className="space-y-2"><legend className="mb-2 text-sm font-semibold">Features to restrict</legend>{Object.entries(ACCOUNT_FEATURES).map(([f,label])=><label key={f} className="flex items-center gap-3 py-2 text-sm"><input type="checkbox" checked={features.includes(f)} onChange={e=>setFeatures(old=>e.target.checked?[...old,f]:old.filter(v=>v!==f))}/>{label}</label>)}</fieldset>}
          <label className="block text-sm">Reason<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className={field}/></label>
          {keyInput}<p className="text-xs text-slate-600">A month is 30 days; a year is 365 days. This submits a review. It does not change account access.</p>
          <button className={button} disabled={!privateKey||reason.trim().length<3||action==='restrict'&&!features.length}>{busy?'Saving…':'Submit for five-admin review'}</button>
        </fieldset>}
        {failure&&<p role="alert" className="text-red-800">{failure}</p>}
        <button type="button" disabled={busy} onClick={onClose} className="rounded-xl border border-blue-200 px-4 py-3 text-sm">Close</button>
      </form>
    </DashboardOverlay>}
  </section>;
}
