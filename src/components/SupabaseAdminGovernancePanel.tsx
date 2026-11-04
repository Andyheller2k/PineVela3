import { publicAppBase } from '../lib/publicAppUrl';
import { useEffect,useRef,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { Copy,KeyRound,Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActionFeedback } from '../lib/useActionFeedback';
import AdministratorLabel from './AdministratorLabel';
import AdminRemovalActions from './AdminRemovalActions';
import SystemWipeReviewPanel from './SystemWipeReviewPanel';
import { governanceRefreshInterval } from '../lib/governanceRefresh';
import { useClipboardFeedback } from '../lib/useClipboardFeedback';

const control='w-full rounded-xl border border-blue-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const button='rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
export default function SupabaseAdminGovernancePanel() {
  const {apiFetch,user}=useAuth(),client=useQueryClient(),feedback=useActionFeedback(),mounted=useRef(true);
  const clipboard=useClipboardFeedback();
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const {data,error,isPending}=useQuery<any>({queryKey:['adminGovernance',user?.id],enabled:user?.role==='admin',refetchInterval:governanceRefreshInterval(false),refetchOnWindowFocus:true,
    queryFn:async({signal})=>{const ownerId=user!.id;const value=await apiFetch('/api/admin/governance',{signal,headers:{'X-PineVela-Account-Context':ownerId}});if(!Array.isArray(value?.members)||value.currentId!==ownerId)throw new Error('Administrator approvals could not load. Sign in again.');return value;}});
  const [key,setKey]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [target,setTarget]=useState(''),[action,setAction]=useState('reset-key'),[reason,setReason]=useState('');
  const [inviteName,setInviteName]=useState(''),[inviteEmail,setInviteEmail]=useState(''),[inviteLink,setInviteLink]=useState('');
  const [membershipTarget,setMembershipTarget]=useState<{id:string;name:string;active:boolean}|null>(null);
  async function act(path:string,body:unknown,enrollment=false) {
    if(busy)return;const origin=feedback.begin();setBusy(true);setNotice('');
    try {
      const result=await apiFetch(path,{method:'POST',body:JSON.stringify(body)});
      if(!mounted.current)return;
      if(!result?.success)throw new Error('The approval action could not be saved.');
      if(enrollment){clipboard.reset();setSecret(result.privateKey);}
      if(result.invitationToken){clipboard.reset();setInviteLink(`${publicAppBase()}#/admin-invitation?token=${encodeURIComponent(result.invitationToken)}`);setInviteName('');setInviteEmail('');}
      setKey('');setNotice(result.message);
      setMembershipTarget(null);
      await client.invalidateQueries({queryKey:['adminGovernance']});
      await client.invalidateQueries({queryKey:['adminSettingsStatus']});
    }catch(e:any){if(mounted.current)feedback.fail(e.message||'The approval action could not be saved.',origin);}
    finally{if(mounted.current)setBusy(false);}
  }
  if(isPending)return <p role="status">Loading administrator approvals…</p>;
  if(error||!data)return <p role="alert" className="text-red-700">{error?.message||'Administrator approvals are unavailable.'}</p>;
  const self=data.members.find((m:any)=>m.id===data.currentId),root='/api/admin/governance';
  return <section aria-label="Administrator governance" onClickCapture={feedback.capture} onSubmitCapture={feedback.capture} className="space-y-6 text-slate-900">
    <header className="rounded-3xl border border-blue-200 bg-white/65 p-6"><h2 className="text-xl font-bold"><AdministratorLabel slot={self?.slot} name={self?.name}/></h2>
      <p className="mt-3 text-sm text-slate-600">Approval keys belong to each administrator and are separate from login passwords and settings keys. Two other administrators must consent to a lost-key recovery.</p></header>
    {notice&&<p role="status" className="rounded-xl bg-blue-50 p-4 text-blue-900">{notice}</p>}
    {secret&&<section data-pv-onboarding className="space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5"><h3 className="font-bold">Your private approval key</h3>
      <p className="text-sm">Save this privately. It is displayed once and is never stored in browser storage.</p><textarea aria-label="Your private approval key" readOnly value={secret} className={`${control} font-mono`}/>
      <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={async()=>{if(await clipboard.copy('approval-key',secret))setNotice('Copied. Store it privately.');else feedback.fail('Select and copy the key manually.',feedback.begin());}}><Copy size={16} className="mr-2 inline"/>{clipboard.copiedId==='approval-key'?'Copied':'Copy'}</button>
        <button type="button" className={button} onClick={()=>setSecret('')}>I have saved it</button></div></section>}
    {!self?.keyEnrolled&&<form data-pv-onboarding className="space-y-3 rounded-2xl border border-blue-200 bg-white/70 p-5" onSubmit={e=>{e.preventDefault();void act(root+'/keys/enroll',{},true);}}>
      <h3 className="flex items-center gap-2 font-bold"><KeyRound size={20}/>Enroll your approval key</h3>
      <p className="text-sm text-slate-600">Sign in with Google or your verified email within the last five minutes. If that window has ended, sign out and sign in again.</p>
      <button className={button} disabled={busy||!data.freshSignIn||!data.capabilities?.approvalKeys}>Generate my approval key</button></form>}
    {self?.keyEnrolled&&<label className="block rounded-2xl border border-blue-200 bg-white/70 p-5 text-sm font-semibold">Your approval key for the next action
      <input type="password" autoComplete="off" maxLength={128} value={key} onChange={e=>setKey(e.target.value)} className={`${control} mt-2`}/>
      <span className="mt-2 block text-xs font-normal text-slate-600">Used only by your account and cleared after a successful action.</span></label>}
    <section className="space-y-4 rounded-3xl border border-blue-200 bg-white/60 p-5"><h3 className="flex items-center gap-2 font-bold"><Users size={20}/>Administrator roster · {data.members.length}/5</h3>
      <div className="grid gap-3 sm:grid-cols-2">{data.members.map((m:any)=><article key={m.id} className="min-w-0 rounded-2xl border border-blue-100 bg-white/75 p-4 text-sm">
        <p className="font-bold">#{m.slot} {m.name}{m.id===data.mainId?' · Main administrator':''}</p><p className="break-all text-slate-600">{m.email}</p>
        <p className="mt-2 text-xs">{m.active?'Active':'Suspended'} · Approval key {m.keyEnrolled?'enrolled':'pending'} · Settings key {m.settingsKeyEnrolled?'enrolled':'pending'}</p>
        {data.currentId===data.mainId&&m.id!==data.mainId&&data.capabilities?.membershipChanges&&<button type="button" className={`${button} mt-3`} disabled={busy||!key} onClick={()=>setMembershipTarget({id:m.id,name:m.name,active:m.active})}>{m.active?'Suspend access':'Restore access'}</button>}
      </article>)}</div>
      {membershipTarget&&<section aria-label="Confirm administrator access change" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
        <h4 className="font-semibold">{membershipTarget.active?'Suspend':'Restore'} {membershipTarget.name}?</h4>
        <p className="text-sm">{membershipTarget.active?'Administrator access will be revoked immediately. Their account and approval history will be preserved.':'They will need to sign out and sign in again. Existing approval and settings keys will be preserved.'}</p>
        <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!key} onClick={()=>void act(`${root}/members/${membershipTarget.id}/active`,{active:!membershipTarget.active,privateKey:key})}>Confirm {membershipTarget.active?'suspension':'restoration'}</button>
          <button type="button" className={button} disabled={busy} onClick={()=>setMembershipTarget(null)}>Cancel</button></div></section>}
      <p role="status" className="text-sm text-slate-600">Removal requires all four other administrators, a private appeal window and founder confirmation. System wipe reviews require five own-key approvals and a separate founder decision.</p>
      {data.currentId===data.mainId&&data.capabilities?.removal&&<form className="space-y-3 rounded-2xl border border-red-200 bg-red-50/50 p-4" onSubmit={e=>{e.preventDefault();void act(`${root}/members/${target}/changes`,{action:'remove',reason,privateKey:key});}}>
        <h4 className="font-semibold">Propose permanent administrator removal</h4><p className="text-sm">This removes the administrator portal and its keys. The person's verified login, primary account and approval history are preserved. Your approval counts once; the three other eligible administrators must also approve.</p>
        <label className="block text-sm">Administrator<select required value={target} onChange={e=>setTarget(e.target.value)} className={control}><option value="">Select administrator</option>{data.members.filter((m:any)=>m.id!==data.mainId).map((m:any)=><option key={m.id} value={m.id}>#{m.slot} {m.name}</option>)}</select></label>
        <label className="block text-sm">Removal reason<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className={control}/></label>
        <button className={`${button} bg-red-700 hover:bg-red-800`} disabled={busy||!key||!target||data.members.length!==5}>Submit removal for four approvals</button>
      </form>}
      {data.currentId===data.mainId&&<section className="space-y-4 border-t border-blue-100 pt-4"><h4 className="font-semibold">Private administrator invitations</h4>
        <form className="space-y-3" onSubmit={e=>{e.preventDefault();void act(root+'/invitations',{name:inviteName,email:inviteEmail,privateKey:key});}}>
          <p className="text-xs text-slate-600">Reserve one of slots 2–5 for 24 hours. The recipient signs in with the invited verified email, accepts once, then enrolls their own keys. Share the private link through a trusted channel.</p>
          <label className="block text-sm">Administrator name<input required maxLength={100} value={inviteName} onChange={e=>setInviteName(e.target.value)} className={control}/></label>
          <label className="block text-sm">Administrator email<input type="email" required maxLength={254} value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} className={control}/></label>
          <button className={button} disabled={busy||!key||!data.capabilities?.invitations}>Create private invitation</button>
        </form>
        {inviteLink&&<section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm font-semibold">Save this private link. It is shown once.</p>
          <textarea readOnly aria-label="Private administrator invitation link" value={inviteLink} className={control}/><div className="flex flex-wrap gap-3">
          <button type="button" className={button} onClick={async()=>{if(await clipboard.copy('admin-invitation',inviteLink))setNotice('Private invitation link copied.');else feedback.fail('Select and copy the link manually.',feedback.begin());}}>{clipboard.copiedId==='admin-invitation'?'Copied':'Copy invitation link'}</button>
          <button type="button" className={button} onClick={()=>setInviteLink('')}>I have saved it</button></div></section>}
        {data.invitations?.map((i:any)=><article key={i.id} className="rounded-xl border border-blue-100 p-3 text-sm"><p className="font-semibold">#{i.slot} {i.name} · {i.status}</p><p className="break-all">{i.email}</p><p className="text-xs">Expires {new Date(i.expiresAt).toLocaleString()}</p>
          {i.status==='reserved'&&<button type="button" className={`${button} mt-2`} disabled={busy||!key} onClick={()=>void act(`${root}/invitations/${i.id}/cancel`,{privateKey:key})}>Cancel invitation</button>}</article>)}
      </section>}
      <form className="space-y-3 border-t border-blue-100 pt-4" onSubmit={e=>{e.preventDefault();void act(`${root}/members/${target}/changes`,{action,reason,privateKey:key});}}>
        <h4 className="font-semibold">Request recovery for another administrator</h4><p className="text-xs text-slate-600">Your approval counts once. A different administrator must approve within 24 hours. The target cannot vote and must sign in again before enrolling their replacement key.</p>
        <label className="block text-sm">Administrator<select required value={target} onChange={e=>setTarget(e.target.value)} className={control}><option value="">Select administrator</option>{data.members.filter((m:any)=>m.active&&m.id!==data.currentId).map((m:any)=><option key={m.id} value={m.id}>#{m.slot} {m.name}</option>)}</select></label>
        <label className="block text-sm">Key to recover<select value={action} onChange={e=>setAction(e.target.value)} className={control}><option value="reset-key">Approval key</option><option value="reset-settings-key">Settings key</option></select></label>
        <label className="block text-sm">Reason<textarea required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} className={control}/></label>
        <button className={button} disabled={busy||!key||!target||!data.capabilities?.keyRecovery}>Submit for independent approval</button></form>
    </section>
    {data.capabilities?.wipeReviews&&<SystemWipeReviewPanel data={data} privateKey={key} busy={busy} onBusy={setBusy} onKeyUsed={()=>setKey('')}/>}
    <section className="space-y-4"><h3 className="font-bold">Administrator proposals</h3>{data.changes.length===0&&<p className="text-sm text-slate-500">No administrator proposals have been submitted.</p>}
      {data.changes.map((p:any)=><article key={p.id} className="space-y-3 rounded-2xl border border-blue-200 bg-white/70 p-5 text-sm">
        <h4 className="font-semibold">{p.action==='remove'?'Administrator removal':p.action==='reset-key'?'Approval key':'Settings key'} · {p.targetName||data.members.find((m:any)=>m.id===p.targetId)?.name||p.targetId} · {p.status}</h4><p className="whitespace-pre-wrap break-words">{p.reason}</p>
        <p className="text-xs text-slate-600">Expires {new Date(p.expiresAt).toLocaleString()}</p>{p.votes.map((v:any)=><p key={v.id} className="text-xs">#{v.slot} {v.name}: {v.decision}</p>)}
        {p.action==='remove'&&<AdminRemovalActions change={p} data={data} privateKey={key} busy={busy} act={act}/>}
        {p.action!=='remove'&&p.status==='pending'&&p.requestedBy!==data.currentId&&p.targetId!==data.currentId&&!p.votes.some((v:any)=>v.id===data.currentId)&&<div className="flex flex-wrap gap-3">
          <button className={button} disabled={busy||!key} onClick={()=>void act(`${root}/changes/${p.id}/vote`,{privateKey:key,decision:'approved'})}>Approve recovery</button>
          <button className={`${button} bg-red-700 hover:bg-red-800`} disabled={busy||!key} onClick={()=>void act(`${root}/changes/${p.id}/vote`,{privateKey:key,decision:'rejected'})}>Reject recovery</button></div>}
      </article>)}</section>
  </section>;
}
