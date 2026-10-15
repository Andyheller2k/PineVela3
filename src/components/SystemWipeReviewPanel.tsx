import {useEffect,useRef,useState} from 'react';
import {useQueryClient} from '@tanstack/react-query';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';

const choices=[['hostels','Residences','Withdraw residences and close their resident/staff portals. Manager portals stay.'],['markets','Markets','Close stores and seller portals. Resident portals stay.'],['managers','Managers','Close manager portals, their assigned residences and dependent resident/staff portals.'],['residents','Residents','Close resident portals and release their room access. Residences stay.'],['users','Primary users','Close primary portals and their owned operational portals, residences and stores.'],['total','All operational portals','Include all the above and officers. Administrator portals stay.']] as const;
const safeguardPhrase=(action:string)=>action==='pause'?'PAUSE REVIEWED WIPE':action==='execute'?'CLOSE REVIEWED OPERATIONAL PORTALS':'AUTHORIZE REVIEWED WIPE';
const control='w-full rounded-xl border border-blue-200 bg-white/80 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const button='rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40';
function Preview({value}:{value:any}){
 return <section aria-label="Exact system wipe scope" className="space-y-3 text-sm">
  <p className="font-semibold">{value.accounts.length} portals · {value.residences.length} residences · {value.stores.length} stores</p>
  <p>Verified logins, account history, administrator access, payments, notifications and stored images are retained.</p>
  <p>Open orders: {value.obligations.openOrders} · Unsettled payments: {value.obligations.unsettledPayments} · Paused residence reviews: {value.obligations.pausedResidenceReviews}</p>
  <details className="rounded-xl border border-blue-200 p-3"><summary className="cursor-pointer font-semibold">Review exact accounts and dependencies</summary>
   <div className="mt-3 max-h-96 space-y-3 overflow-auto">
    {value.accounts.map((a:any)=><p key={a.id} className="break-words">{a.name} · {a.kind} · Close portal <span className="block break-all text-xs text-slate-600">{a.id}</span></p>)}
    {value.residences.map((h:any)=><p key={h.id} className="break-words">{h.name} · Withdraw residence; retain history <span className="block break-all text-xs text-slate-600">{h.id}</span></p>)}
    {value.stores.map((s:any)=><p key={s.id} className="break-words">{s.name} · Close store; retain history <span className="block break-all text-xs text-slate-600">{s.id}</span></p>)}
    <p className="font-semibold">Linked records included in this review</p>
    {Object.entries(value.counts).filter(([,n])=>Number(n)>0).map(([label,n])=><p key={label}>{label.replaceAll('_',' ')}: {String(n)}</p>)}
    <details><summary className="cursor-pointer">Exact linked record identifiers</summary>{Object.entries(value.resources).filter(([,ids])=>Array.isArray(ids)&&ids.length).map(([label,ids])=><p key={label} className="mt-2 break-all text-xs">{label.replaceAll('_',' ')}: {(ids as string[]).join(', ')}</p>)}</details>
   </div>
  </details>
 </section>;
}
export default function SystemWipeReviewPanel({data,privateKey,busy,onBusy,onKeyUsed}:{data:any;privateKey:string;busy:boolean;onBusy:(v:boolean)=>void;onKeyUsed:()=>void}){
 const {user}=useAuth(),client=useQueryClient();
 const [scopes,setScopes]=useState<string[]>([]),[preview,setPreview]=useState<any>(null),[reason,setReason]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [final,setFinal]=useState<{id:string;decision:string}|null>(null),[finalReason,setFinalReason]=useState(''),[confirmation,setConfirmation]=useState('');
 const [prepare,setPrepare]=useState(''),[prepareConfirmation,setPrepareConfirmation]=useState(''),[cancel,setCancel]=useState(''),[cancelReason,setCancelReason]=useState('');
 const [safeguard,setSafeguard]=useState<{id:string;action:'pause'|'authorize-execution'|'execute'}|null>(null),[safeguardConfirmation,setSafeguardConfirmation]=useState('');
 const generation=useRef(0),inFlight=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;generation.current++;setPreview(null);setScopes([]);setFinal(null);setPrepare('');setCancel('');setPrepareConfirmation('');setCancelReason('');setNotice('');setError('');return()=>{mounted.current=false;generation.current++;};},[user?.id]);
 useEffect(()=>{setSafeguard(null);setSafeguardConfirmation('');},[user?.id]);
 async function request(path:string,body:any,isPreview=false){
  if(inFlight.current||busy||!user?.id)return;inFlight.current=true;onBusy(true);setError('');setNotice('');
  const expected=generation.current,context=user.id;let result:any;
  try{
   const response=await sessionFetch('/api/admin/governance/'+path,{method:'POST',headers:{'Content-Type':'application/json','X-PineVela-Account-Context':context},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});
   result=await response.json();if(!response.ok)throw new Error(result.error||'The wipe review could not complete.');
   if(!mounted.current||expected!==generation.current)return;
   if(isPreview){if(!result?.preview||typeof result.fingerprint!=='string')throw new Error('Sign in again to review the selected scope.');setPreview(result);}else{if(!result?.success)throw new Error('The wipe review could not be saved.');onKeyUsed();setPreview(null);setFinal(null);setConfirmation('');setFinalReason('');setPrepare('');setCancel('');setPrepareConfirmation('');setCancelReason('');setSafeguard(null);setSafeguardConfirmation('');setNotice(result.message);await client.invalidateQueries({queryKey:['adminGovernance',context]});}
  }catch(e:any){if(mounted.current&&expected===generation.current){setError(e.message||'The wipe review could not complete. Refresh before retrying.');if(!isPreview){setPreview(null);await client.invalidateQueries({queryKey:['adminGovernance',context]});}}}
  finally{inFlight.current=false;if(mounted.current)onBusy(false);}
 }
 const ready=data.members.filter((m:any)=>m.active&&m.keyEnrolled).length===5;
 const toggle=(s:string)=>{generation.current++;setPreview(null);setScopes(old=>s==='total'?(old.includes(s)?[]:[s]):choices.map(([id])=>id).filter(id=>id!=='total'&&(id===s?!old.includes(s):old.includes(id))));};
 return <section aria-label="System wipe reviews" className="space-y-4 rounded-3xl border border-blue-200 bg-white/65 p-5">
  <h3 className="text-lg font-bold">System wipe reviews</h3>
  <p className="text-sm">Review operational portal closures. Five active administrators must each use their own approval key, including the founder. After five approvals, the founder separately approves backup preparation or rejects the review. {data.capabilities?.wipes?'Execution requires a separate confirmed request.':'Execution remains disabled.'}</p>
  {!ready&&<p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">All five active administrators must enroll their own approval keys before a proposal can be submitted. You can still inspect the scope.</p>}
  {notice&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{notice}</p>}
  {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
  <fieldset disabled={busy} className="space-y-3"><legend className="mb-3 font-semibold">Choose the scope to review</legend>
   {choices.map(([id,title,description])=><label key={id} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-blue-100 p-3 text-sm"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={scopes.includes(id)} onChange={()=>toggle(id)}/><span><strong>{title}</strong><span className="mt-1 block text-slate-600">{description}</span></span></label>)}
  </fieldset>
  <button type="button" className={button} disabled={busy||!scopes.length} onClick={()=>void request('preview',{scopes},true)}>{busy?'Please wait…':'Preview selected scope'}</button>
  {preview&&<form className="space-y-3 border-t border-blue-200 pt-4" onSubmit={e=>{e.preventDefault();void request('proposals',{scopes,reason,fingerprint:preview.fingerprint,privateKey});}}>
   <Preview value={preview.preview}/>
   <label className="block text-sm">Reason for this exact review<textarea required minLength={3} maxLength={500} className={control} value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label>
   <button className={button} disabled={busy||!privateKey||!ready||!preview.ready||!preview.preview.accounts.length&&!preview.preview.residences.length&&!preview.preview.stores.length}>Save review and my single approval</button>
  </form>}
  <div className="space-y-4 border-t border-blue-200 pt-4"><h4 className="font-semibold">Saved wipe reviews</h4>
   {!data.proposals.length&&<p className="text-sm text-slate-600">No system wipe reviews have been submitted.</p>}
   {data.proposals.map((p:any)=><article key={p.id} className="space-y-3 rounded-2xl border border-blue-200 bg-white/70 p-4 text-sm">
    <p className="font-semibold">{p.preview.scopes?.join(', ')||'Historical wipe review'} · {p.status}</p><p className="whitespace-pre-wrap break-words">{p.reason}</p>
    <p>Expires {new Date(p.expiresAt).toLocaleString()} · {p.votes.filter((v:any)=>v.decision==='approved').length}/5 approvals</p>
    {p.preview.version===1&&<Preview value={p.preview}/>}
    {p.votes.map((v:any)=>{const m=p.preview.roster?.find((r:any)=>r.id===v.id);return <p key={v.id}>#{m?.slot} {m?.name||v.id}: {v.decision}</p>;})}
    {p.founderDecision&&<p className="rounded-xl bg-blue-50 p-3">Founder: {p.founderDecision==='approve-backup'?'Backup preparation approved':'Review rejected'} · {p.founderReason}. {p.status==='executed'?'Reviewed closure completed; history retained.':'No wipe executed.'}</p>}
    {p.preparation&&<section aria-label="Wipe backup preparation status" className="space-y-2 rounded-xl border border-blue-200 p-3">
     <p>{p.preparation.state==='completed'?'Reviewed closure completed. Recovery files remain retained.':p.preparation.state==='cancelled'?'Backup preparation cancelled.':p.preparation.current?'Backup preparation active.':'Backup preparation is outdated. Fresh consent and backups are required.'}</p>
     <p>{p.preparation.pause?.state==='frozen'?'Reviewed records are paused. Cancel preparation to resume changes, including when this review expires or becomes outdated.':'Records remain available for changes.'}</p>
     {p.preparation.recovery&&<p>Database restore and Storage bytes verified {new Date(p.preparation.recovery.verifiedAt).toLocaleString()} · {p.preparation.recovery.objects} objects. {p.preparation.state==='completed'?'Recovery evidence is retained with the completed review.':p.preparation.recovery.current?'Evidence still matches current consent and the Storage catalog.':'Evidence no longer matches; fresh recovery files are required.'} {data.capabilities?.wipes?'Execution requires a separate confirmed request.':'Execution remains disabled.'}</p>}
     {p.preparation.state==='active'&&!p.preparation.recovery&&<p>A trusted operator must create and restore an encrypted database checkpoint, back up actual Storage bytes and record verification. Any reviewed change requires fresh consent.</p>}
     {p.preparation.reason&&<p>{p.preparation.reason}</p>}
     {p.preparation.finalConsent&&p.status!=='executed'&&<p>{p.preparation.finalConsent.current?'Final founder consent is current':'Final founder consent has expired or changed'} · Until {new Date(p.preparation.finalConsent.expiresAt).toLocaleString()}. {data.capabilities?.wipes?'Execution requires a separate confirmed request.':'Execution remains disabled.'}</p>}
    </section>}
    {data.currentId===data.mainId&&p.preparation?.state==='active'&&p.preparation.current&&data.capabilities?.wipePause&&!p.preparation.pause&&!p.preparation.recovery&&<button type="button" className={button} disabled={busy||!privateKey} onClick={()=>{setSafeguard({id:p.id,action:'pause'});setSafeguardConfirmation('');}}>Pause reviewed records for backup</button>}
    {data.currentId===data.mainId&&p.preparation?.pause?.state==='frozen'&&p.preparation.current&&p.preparation.recovery?.current&&data.capabilities?.wipeFinalConsent&&!p.preparation.finalConsent?.current&&<button type="button" className={button} disabled={busy||!privateKey} onClick={()=>{setSafeguard({id:p.id,action:'authorize-execution'});setSafeguardConfirmation('');}}>Review final founder consent</button>}
    {p.preparation?.executionRequest&&<p role="status" className="rounded-xl border border-blue-200 p-3">{p.preparation.executionRequest.state==='completed'?'Reviewed closure completed; history retained.':p.preparation.executionRequest.state==='invalidated'?'Execution request invalidated. Review consent before continuing.':p.preparation.executionRequest.current?'Closure queued for recovery and consent verification.':'Queued request no longer has current consent.'}</p>}
    {data.currentId===data.mainId&&data.capabilities?.wipes&&p.status==='approved'&&p.preparation?.state==='active'&&p.preparation.pause?.state==='frozen'&&p.preparation.recovery?.current&&p.preparation.finalConsent?.current&&!p.preparation.executionRequest?.current&&<button type="button" className={button} disabled={busy||!privateKey||!ready} onClick={()=>{setSafeguard({id:p.id,action:'execute'});setSafeguardConfirmation('');}}>Request reviewed closure</button>}
    {safeguard?.id===p.id&&p.preparation?.state==='active'&&<form className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3" onSubmit={e=>{e.preventDefault();void request(`proposals/${p.id}/${safeguard.action}`,{privateKey,confirmation:safeguardConfirmation});}}>
     <p>{safeguard.action==='pause'?'Pause writes to the exact reviewed records before the operator creates new recovery backups. Resolve unsettled payments, orders, uploads and email verification first. Cancel preparation to resume changes.':safeguard.action==='execute'?'Queue this exact reviewed closure. Recovery files and consent will be checked again before portals close. Verified logins, history and stored images remain.':'Record fresh founder consent after paused-scope recovery verification. It expires within five minutes and is bound to your current session and approval key.'}</p>
     <label className="block">Type {safeguardPhrase(safeguard.action)}<input required autoComplete="off" className={control} value={safeguardConfirmation} disabled={busy} onChange={e=>setSafeguardConfirmation(e.target.value)}/></label>
     <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!privateKey||safeguardConfirmation!==(safeguardPhrase(safeguard.action))}>Confirm {safeguard.action==='pause'?'write pause':safeguard.action==='execute'?'closure request':'final consent'}</button><button type="button" className={button} disabled={busy} onClick={()=>setSafeguard(null)}>Cancel</button></div>
    </form>}
    {data.currentId===data.mainId&&data.capabilities?.wipePreparation&&p.status==='approved'&&p.founderDecision==='approve-backup'&&!p.preparation&&<button type="button" className={button} disabled={busy||!privateKey} onClick={()=>{setPrepare(p.id);setPrepareConfirmation('');}}>Start backup preparation</button>}
    {prepare===p.id&&p.status==='approved'&&!p.preparation&&<form className="space-y-3 rounded-xl border border-blue-200 p-3" onSubmit={e=>{e.preventDefault();void request(`proposals/${p.id}/prepare`,{privateKey,confirmation:prepareConfirmation});}}>
     <p>Create a preparation record for this exact five-admin review. This does not pause records or execute a wipe.</p>
     <label className="block">Type START WIPE BACKUP<input required autoComplete="off" className={control} value={prepareConfirmation} disabled={busy} onChange={e=>setPrepareConfirmation(e.target.value)}/></label>
     <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!privateKey||prepareConfirmation!=='START WIPE BACKUP'}>Confirm backup preparation</button><button type="button" className={button} disabled={busy} onClick={()=>setPrepare('')}>Cancel</button></div>
    </form>}
    {data.currentId===data.mainId&&p.preparation?.state==='active'&&<button type="button" className={button} disabled={busy||!privateKey} onClick={()=>{setCancel(p.id);setCancelReason('');}}>Cancel backup preparation</button>}
    {cancel===p.id&&p.preparation?.state==='active'&&<form className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3" onSubmit={e=>{e.preventDefault();void request(`proposals/${p.id}/cancel-preparation`,{privateKey,reason:cancelReason});}}>
     <p>Cancellation preserves all records and invalidates this review. Its consent and backups cannot authorize a new preparation.</p>
     <label className="block">Cancellation reason<textarea required minLength={3} maxLength={500} className={control} value={cancelReason} disabled={busy} onChange={e=>setCancelReason(e.target.value)}/></label>
     <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!privateKey||cancelReason.trim().length<3}>Confirm cancellation</button><button type="button" className={button} disabled={busy} onClick={()=>setCancel('')}>Keep preparation</button></div>
    </form>}
    {p.status==='pending'&&!p.votes.some((v:any)=>v.id===data.currentId)&&<div className="flex flex-wrap gap-3">
     <button type="button" className={button} disabled={busy||!privateKey||!ready} onClick={()=>void request(`proposals/${p.id}/vote`,{decision:'approved',privateKey})}>Approve exact review</button>
     <button type="button" className={`${button} bg-red-700 hover:bg-red-800`} disabled={busy||!privateKey||!ready} onClick={()=>void request(`proposals/${p.id}/vote`,{decision:'rejected',privateKey})}>Reject review</button>
    </div>}
    {p.status==='approved'&&!p.founderDecision&&data.currentId===data.mainId&&<div className="flex flex-wrap gap-3">
     <button type="button" className={button} disabled={busy||!privateKey} onClick={()=>{setFinal({id:p.id,decision:'approve-backup'});setConfirmation('');setFinalReason('');}}>Review backup consent</button>
     <button type="button" className={`${button} bg-red-700 hover:bg-red-800`} disabled={busy||!privateKey} onClick={()=>{setFinal({id:p.id,decision:'reject'});setConfirmation('');setFinalReason('');}}>Reject approved wipe</button>
    </div>}
    {final?.id===p.id&&p.status==='approved'&&!p.founderDecision&&<form className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3" onSubmit={e=>{e.preventDefault();void request(`proposals/${p.id}/founder-review`,{decision:final.decision,reason:finalReason,confirmation,privateKey});}}>
     <p>{final.decision==='approve-backup'?'Record founder consent to prepare and rehearse backups. This does not execute a wipe.':'Reject this approved wipe; accounts and records stay.'}</p>
     <label className="block">Founder decision reason<textarea required minLength={3} maxLength={500} className={control} value={finalReason} onChange={e=>setFinalReason(e.target.value)} disabled={busy}/></label>
     <label className="block">Type {final.decision==='approve-backup'?'APPROVE WIPE BACKUP':'REJECT APPROVED WIPE'}<input required autoComplete="off" className={control} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/></label>
     <div className="flex flex-wrap gap-3"><button className={button} disabled={busy||!privateKey||confirmation!==(final.decision==='approve-backup'?'APPROVE WIPE BACKUP':'REJECT APPROVED WIPE')}>Save founder decision</button><button type="button" className={button} disabled={busy} onClick={()=>setFinal(null)}>Cancel</button></div>
    </form>}
   </article>)}
  </div>
 </section>;
}
