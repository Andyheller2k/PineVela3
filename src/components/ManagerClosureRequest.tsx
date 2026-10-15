import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import { sessionFetch } from '../lib/session';
import { invalidateAllQueries } from '../lib/queryClient';
import AccountStatusDialog from './AccountStatusDialog';
import ResidenceDeletionPanel from './ResidenceDeletionPanel';

const control = 'mt-1 block w-full rounded-xl border border-blue-200 bg-white p-3 text-sm text-slate-900';
const button = 'rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50';
export default function ManagerClosureRequest({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<any>(null), [reason, setReason] = useState(''), [requestWaiver, setRequestWaiver] = useState(false);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0), inFlight = useRef(false), mounted = useRef(false);
  const account = useRef(user?.id); account.current = user?.id;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true; setStatus(null); setError('');
    sessionFetch('/api/manager/closure-request', { headers: { 'X-PineVela-Profile-Context': user?.id || '' } })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Could not load closure status.'); if (active) setStatus(data); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [user?.id, revision]);
  if (user?.role !== 'manager') return null;
  const open = status?.requests.find((r: any) => ['pending', 'reviewing'].includes(r.state));
  const act = async (path: string, body: any) => {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError('');
    const context = user.id;
    try {
      const response=await sessionFetch(path,{method:'POST',headers:{'Content-Type':'application/json','X-PineVela-Profile-Context':context},body:JSON.stringify(body)});
      const result=await response.json();if(!response.ok)throw Error(result.error||'The request could not be confirmed.');
      if (!mounted.current || account.current !== context) return;
      if (!result?.success) throw new Error('The request was not confirmed. Refresh its status before retrying.');
      setNotice(result.message || 'Your request was withdrawn. No records were deleted.'); setRevision(r => r + 1); invalidateAllQueries();
    } catch (e) { if (mounted.current && account.current === context) setError(e instanceof Error ? e.message : 'Request failed. Refresh its status before retrying.'); }
    finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); void act('/api/users/delete-registered-account', { reason, requestWaiver, confirm: confirmed, fingerprint: status.preview.fingerprint }); };
  return <AccountStatusDialog title="Request manager account closure" onClose={() => { if (!busy) onClose(); }}>
    <div className="space-y-4 p-2 text-sm" aria-busy={busy}>
      <p>{status?.preview.reviewKind==='account_action'?'This portal has no assigned residence. Five administrators must review your request, and the founder must confirm portal closure. Your verified login, primary account, other portals and history are retained.':'Your request covers this manager portal and its assigned residences. Administrators must review the records, collect two separate approvals and the founder’s consent, and verify backups before deletion.'}</p>
      <p>{status?.preview.reviewKind==='account_action'?'Existing registration restrictions remain in effect after portal closure. This review does not waive or extend them.':'Your verified identity and primary account are retained. The usual registration cooldown is 30 days; administrators choose the final duration during review. Requesting a waiver does not approve it.'}</p>
      {!status && !error && <p role="status">Loading your assigned residences and request status…</p>}
      {status?.preview.residences.map((h: any) => <div key={h.id} className="rounded-xl border border-blue-200 p-3"><p className="font-bold">{h.name}</p><p>{h.residents} active residents · {h.staff} active staff</p></div>)}
      {status?.preview.blockers.map((text: string) => <p key={text} role="status">{text}</p>)}
      {!!status?.preview.blockers.length&&<button type="button" disabled={busy} onClick={()=>setRevision(r=>r+1)} className={button}>Refresh closure status</button>}
      {open ? <div className="space-y-3 rounded-xl border border-blue-200 p-4"><p role="status">Request {open.state === 'pending' ? 'awaiting administrator review' : `linked to administrator review: ${open.proposalStatus || 'pending'}`}. Your account remains active until reviewed execution.</p><p>{open.reason}</p>{open.state === 'pending' && <button type="button" disabled={busy} onClick={() => void act(`/api/manager/closure-request/${open.id}/withdraw`, {})} className={button}>Withdraw pending request</button>}</div> : status && !status.preview.blockers.length && <form onSubmit={submit} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <label className="block font-bold">Reason for closing your manager account<textarea required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} className={control} /></label>
          {status.preview.reviewKind==='residence_deletion'&&<label className="flex items-start gap-3"><input type="checkbox" checked={requestWaiver} onChange={e => setRequestWaiver(e.target.checked)} />Ask administrators to waive the registration cooldown.</label>}
          <label className="flex items-start gap-3"><input type="checkbox" required checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm that I want to submit this closure request for review.</label>
          <button type="submit" className={button}>{busy ? 'Submitting…' : 'Submit closure request'}</button>
        </fieldset>
      </form>}
      {status?.requests.filter((r: any) => !['pending', 'reviewing'].includes(r.state)).map((r: any) => <p key={r.id}>Previous request: {r.state}{r.decisionReason ? ` · ${r.decisionReason}` : ''}</p>)}
      {notice && <p role="status">{notice}</p>}{error && <><p role="alert" className="text-rose-700">{error}</p><button type="button" disabled={busy} onClick={() => setRevision(r => r + 1)} className={button}>Refresh status</button></>}
    </div>
  </AccountStatusDialog>;
}

export function AdminManagerClosureRequests() {
  const { apiFetch,user } = useAuth();
  const { data, error } = useQuery({ queryKey: ['managerClosureRequests'], queryFn: () => apiFetch('/api/admin/manager-closure-requests'), refetchInterval: 15000 });
  const [selected, setSelected] = useState<any>(null), [rejecting, setRejecting] = useState<any>(null);
  const [reviewing,setReviewing]=useState<any>(null);
  const [key, setKey] = useState(''), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  const mounted=useRef(false),inFlight=useRef(false),current=useRef(user?.id);current.current=user?.id;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setReviewing(null);setRejecting(null);setKey('');setFailure('');},[user?.id]);
  const submitReview=async(e:FormEvent)=>{
    e.preventDefault();if(inFlight.current||!reviewing||!user)return;inFlight.current=true;setBusy(true);setFailure('');const account=user.id;
    try{
      const response=await sessionFetch(`/api/admin/manager-closure-requests/${reviewing.id}/review`,{method:'POST',headers:{'Content-Type':'application/json','X-PineVela-Account-Context':account},body:JSON.stringify({privateKey:key,fingerprint:reviewing.preview.fingerprint})});
      const result=await response.json();if(!mounted.current||current.current!==account)return;
      if(!response.ok||!result.success)throw Error(result.error||'Review was not confirmed. Refresh before retrying.');
      setReviewing(null);invalidateAllQueries();
    }catch(e){if(mounted.current&&current.current===account)setFailure(e instanceof Error?e.message:'Review failed.');}
    finally{inFlight.current=false;if(mounted.current&&current.current===account){setKey('');setBusy(false);}}
  };
  return <section aria-label="Manager closure requests" className="space-y-4 rounded-3xl border border-blue-200 bg-white/70 p-5 text-slate-900">
    <h3 className="text-lg font-bold">Manager closure requests</h3><p className="text-sm">Use the reviewed residence protocol for assigned housing. Unassigned portals use five-administrator account review with the founder’s final confirmation. Use your own approval key for decisions.</p>
    {!data && !error && <p role="status">Loading manager closure requests…</p>}{error && <p role="alert">{error.message}</p>}
    {data?.requests?.length === 0 && <p>No manager closure requests.</p>}
    {data?.requests?.map((r: any) => <article key={r.id} className="space-y-3 rounded-xl border border-blue-200 p-4 text-sm">
      <h4 className="font-bold">{r.managerName} · {r.completedAt ? 'reviewed deletion completed' : r.state}</h4><p>{r.reason}</p>
      <p>Cooldown waiver {r.requestWaiver ? 'requested; requires review' : 'not requested'}.</p>
      {r.decisionReason && <p>{r.decisionReason}</p>}{r.proposalId && <p>Linked administrator proposal: {r.proposalStatus} · {r.proposalId}</p>}
      {r.state === 'pending' && <div className="flex flex-wrap gap-2">{r.preview.residences.map((h: any) => <button key={h.id} type="button" className={button} onClick={() => setSelected({ ...h, closureRequestId: r.id })}>Review {h.name} and manager closure</button>)}{r.preview.reviewKind==='account_action'&&<button type="button" disabled={!!r.preview.blockers.length} className={button} onClick={()=>{setReviewing(r);setKey('');setFailure('');}}>Review unassigned manager portal</button>}<button type="button" className="rounded-xl border border-rose-200 px-4 py-3 font-bold text-rose-700" onClick={() => { setRejecting(r); setKey(''); setReason(''); setFailure(''); }}>Decline request</button></div>}
    </article>)}
    {selected && <ResidenceDeletionPanel selectedHostel={selected} onClose={() => { setSelected(null); invalidateAllQueries(); }} />}
    {reviewing&&<AccountStatusDialog title="Review unassigned manager closure" onClose={()=>{if(!busy){setReviewing(null);setKey('');}}}><form className="space-y-4 p-2" onSubmit={submitReview}><p>Submit {reviewing.managerName}’s own request to the existing five-administrator account review. The founder must make the final decision. No housing, history, verified identity or existing restriction is removed.</p><p>{reviewing.reason}</p><label className="block font-bold">Your approval key<input required type="password" autoComplete="off" maxLength={128} value={key} onChange={e=>setKey(e.target.value)} disabled={busy} className={control}/></label>{failure&&<p role="alert" className="text-rose-700">{failure}</p>}<button disabled={busy||!key} className={button}>{busy?'Submitting review…':'Submit for five-administrator review'}</button></form></AccountStatusDialog>}
    {rejecting && <AccountStatusDialog title="Decline manager closure request" onClose={() => { if (!busy) setRejecting(null); }}><form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (busy) return; setBusy(true); setFailure(''); try { const r = await apiFetch(`/api/admin/manager-closure-requests/${rejecting.id}/reject`, { method: 'POST', body: JSON.stringify({ privateKey: key, reason }) }); if (!r?.success) throw new Error('The decision was not confirmed.'); setRejecting(null); invalidateAllQueries(); } catch (e) { setFailure(e instanceof Error ? e.message : 'Decision failed.'); } finally { setKey(''); setBusy(false); } }}>
      <label className="block font-bold">Reason<textarea required minLength={3} maxLength={1000} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} className={control} /></label>
      <label className="block font-bold">Your approval key<input type="password" required autoComplete="off" maxLength={128} value={key} onChange={e => setKey(e.target.value)} disabled={busy} className={control} /></label>
      {failure && <p role="alert" className="text-rose-700">{failure}</p>}<button type="submit" disabled={busy} className={button}>{busy ? 'Confirming…' : 'Decline closure request'}</button>
    </form></AccountStatusDialog>}
  </section>;
}
