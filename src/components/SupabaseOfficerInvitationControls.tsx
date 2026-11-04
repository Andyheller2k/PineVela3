import { publicAppBase } from '../lib/publicAppUrl';
import {useCallback,useEffect,useRef,useState} from 'react';
import {useAuth} from '../context/AuthContext';
import {useClipboardFeedback} from '../lib/useClipboardFeedback';

type Invitation={id:string;email:string;fullName:string;phone:string;assignedZone:string;status:string;expiresAt:string;officerId?:string};
const inputClass='mt-1 w-full rounded-xl border border-[var(--pv-field-edge)] bg-[var(--pv-field)] p-3 text-sm text-[var(--pv-text)]';
const buttonClass='rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50';
/** Mounted only in the Supabase administrator Field Officers tab. Keys stay in memory. */
export default function SupabaseOfficerInvitationControls({onChanged}:{onChanged?:()=>void|Promise<void>}) {
  const {apiFetch}=useAuth(),[invitations,setInvitations]=useState<Invitation[]>([]),[loading,setLoading]=useState(true);
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[key,setKey]=useState('');
  const [fields,setFields]=useState({fullName:'',email:'',phone:'',assignedZone:''}),[created,setCreated]=useState<{url:string;email:string;expiresAt:string}|null>(null);
  const mounted=useRef(true),inFlight=useRef(false);
  const clipboard=useClipboardFeedback();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const load=useCallback(async()=>{const rows=await apiFetch('/api/verification-teams/invitations');if(mounted.current)setInvitations(rows);},[apiFetch]);
  useEffect(()=>{load().catch((e:any)=>{if(mounted.current)setError(e.message||'Officer invitations could not load.');}).finally(()=>{if(mounted.current)setLoading(false);});},[load]);
  async function run(action:()=>Promise<void>) {
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');setNotice('');
    try {await action();}catch(e:any){if(mounted.current)setError(e.message||'The officer invitation could not be saved.');}
    finally {inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function create(e:React.FormEvent) {
    e.preventDefault();await run(async()=>{
      const result=await apiFetch('/api/verification-teams',{method:'POST',body:JSON.stringify({...fields,privateKey:key})});
      if(!mounted.current)return;
      if(!result?.success||typeof result.invitationToken!=='string')throw new Error('The invitation could not be confirmed. Refresh before retrying.');
      const url=`${publicAppBase()}#/officer-invitation?${new URLSearchParams({token:result.invitationToken})}`;
      setCreated({url,email:result.email,expiresAt:result.expiresAt});setKey('');setFields({fullName:'',email:'',phone:'',assignedZone:''});
      setNotice('Invitation saved. Share the private link with the intended officer; it is shown only here.');
      await load();await onChanged?.();
    });
  }
  async function cancel(id:string) {await run(async()=>{
    await apiFetch(`/api/verification-teams/invitations/${id}/cancel`,{method:'POST',body:JSON.stringify({privateKey:key})});
    if(mounted.current){setKey('');setNotice('Officer invitation cancelled.');}
    await load();await onChanged?.();
  });}
  return <section data-pv-onboarding className="space-y-5 rounded-3xl border p-5" style={{borderColor:'var(--pv-edge)',background:'var(--pv-glass)',color:'var(--pv-text)'}} aria-label="Verified officer invitations">
    <div><h3 className="text-lg font-bold">Invite a verification officer</h3><p className="mt-1 text-sm" style={{color:'var(--pv-muted)'}}>Use a separate official Google/email address. The officer verifies their own sign-in and accepts this invitation. Your approval key authorizes the invitation.</p></div>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm dark:bg-blue-950">{notice}</p>}
    <form onSubmit={create} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Officer full name<input required maxLength={120} value={fields.fullName} onChange={e=>setFields(f=>({...f,fullName:e.target.value}))} disabled={busy} className={inputClass}/></label>
        <label className="text-sm font-semibold">Official verified email<input required type="email" maxLength={254} value={fields.email} onChange={e=>setFields(f=>({...f,email:e.target.value}))} disabled={busy} className={inputClass}/></label>
        <label className="text-sm font-semibold">Contact number<input required type="tel" maxLength={40} value={fields.phone} onChange={e=>setFields(f=>({...f,phone:e.target.value}))} disabled={busy} className={inputClass}/></label>
        <label className="text-sm font-semibold">Assigned inspection zone<input required maxLength={200} value={fields.assignedZone} onChange={e=>setFields(f=>({...f,assignedZone:e.target.value}))} disabled={busy} className={inputClass}/></label>
      </div>
      <label className="block text-sm font-semibold">Your administrator approval key<input required type="password" autoComplete="off" maxLength={128} value={key} onChange={e=>setKey(e.target.value)} disabled={busy} className={inputClass}/></label>
      <button type="submit" disabled={busy} className={buttonClass}>{busy?'Saving…':'Create private invitation'}</button>
    </form>
    {created&&<div className="space-y-3 rounded-2xl border p-4" style={{borderColor:'var(--pv-edge)',background:'var(--pv-secondary)'}}>
      <p className="text-sm font-semibold break-all">Private invitation for {created.email}</p><p className="text-xs">Expires {new Date(created.expiresAt).toLocaleString()}</p>
      <textarea readOnly aria-label="Private officer invitation link" value={created.url} className={`${inputClass} min-h-24`}/>
      <div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} onClick={async()=>{if(await clipboard.copy('officer-invitation',created.url)){setError('');setNotice('Private invitation link copied.');}else setError('Copy the invitation link from the field above.');}}>{clipboard.copiedId==='officer-invitation'?'Copied':'Copy private link'}</button><button type="button" className="rounded-xl border border-blue-300 px-4 py-3 text-sm font-semibold" onClick={()=>setCreated(null)}>I saved the link</button></div>
    </div>}
    <div className="space-y-3"><h4 className="font-semibold">Officer invitations</h4>
      {loading?<p role="status" className="text-sm">Loading invitations…</p>:invitations.length===0?<p className="text-sm text-slate-600 dark:text-slate-300">No officer invitations have been issued.</p>:invitations.map(i=><div key={i.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{borderColor:'var(--pv-edge)'}}>
        <div className="min-w-0 space-y-1"><p className="font-semibold">{i.fullName}</p><p className="break-all text-sm">{i.email}</p><p className="text-xs">{i.assignedZone} · {i.status}</p>{i.status==='invited'&&<p className="text-xs">Expires {new Date(i.expiresAt).toLocaleString()}</p>}</div>
        {i.status==='invited'&&<button type="button" disabled={busy||!key} onClick={()=>void cancel(i.id)} className="rounded-xl border border-red-300 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50 dark:text-red-300">Cancel invitation</button>}
      </div>)}
    </div>
  </section>;
}
