import {useEffect,useRef,useState,type FormEvent} from 'react';
import {useNavigate} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';
import {usesSupabasePersistence} from '../lib/persistence';

export default function ResidentAccountClosure(){
  const {user,apiFetch,logout}=useAuth(),navigate=useNavigate();
  const [preview,setPreview]=useState<any>(null),[pin,setPin]=useState(''),[confirm,setConfirm]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const current=useRef(user?.id),mounted=useRef(false),inFlight=useRef(false);current.current=user?.id;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!usesSupabasePersistence||user?.role!=='student')return;
    let active=true;setPreview(null);setError('');setPin('');setConfirm('');
    sessionFetch('/api/resident/closure-preview',{headers:{'X-PineVela-Profile-Context':user.id}})
      .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'Could not check your room access.');if(active)setPreview(d);})
      .catch(e=>{if(active)setError(e.message);});
    return()=>{active=false;};
  },[user?.id,revision]);
  if(!usesSupabasePersistence||user?.role!=='student')return null;
  const submit=async(event:FormEvent)=>{
    event.preventDefault();if(inFlight.current||!preview)return;inFlight.current=true;setBusy(true);setError('');
    const account=user.id;
    try{
      const result=await apiFetch('/api/student/delete-room',{method:'POST',headers:{'X-PineVela-Profile-Context':account},
        body:JSON.stringify({confirm,fingerprint:preview.fingerprint,...(preview.requiresPin?{currentPin:pin}:{})})});
      if(!mounted.current||current.current!==account)return;
      if(!result?.success)throw Error('The release was not confirmed. Refresh your account before retrying.');
      // The server ended only resident bindings. Leave provider cookies and any
      // newer signed-in account untouched; this event clears this portal's UI.
      window.dispatchEvent(new Event('pinevela-session-expired'));
      navigate('/login',{replace:true,state:{residentReleaseCompleted:true}});
    }catch(e){if(mounted.current&&current.current===account)setError(e instanceof Error?e.message:'Could not confirm release. Refresh your account before retrying.');}
    finally{inFlight.current=false;if(mounted.current&&current.current===account){setPin('');setBusy(false);}}
  };
  return <section aria-label="End resident room access" aria-busy={busy} className="space-y-4 rounded-3xl border border-rose-200 bg-white/80 p-6 text-sm text-slate-900">
    <h3 className="text-lg font-bold">End resident room access</h3>
    <p>This closes your resident portal and releases your allocated room with a new activation key. Your verified identity, other portals and account history are retained.</p>
    {!preview&&!error&&<p role="status">Checking your current room and confirmation method…</p>}
    {preview&&<><p className="font-semibold">{preview.residenceName} · {preview.blockName} · Room {preview.roomNumber}</p>
      {!preview.requiresPin&&!preview.recentSignIn?<div className="space-y-3"><p>Sign out and sign in again, then return here within five minutes to confirm release.</p><button type="button" disabled={busy} onClick={async()=>{const account=user.id;if(inFlight.current)return;inFlight.current=true;setBusy(true);try{if(await logout())navigate('/login');else if(current.current===account)setError('Sign-out was not confirmed. Please try again.');}finally{inFlight.current=false;if(mounted.current&&current.current===account)setBusy(false);}}} className="min-h-11 rounded-xl bg-blue-700 px-4 py-3 font-bold text-white disabled:opacity-50">Sign out to verify again</button></div>:
      <form onSubmit={submit} className="space-y-4"><fieldset disabled={busy} className="space-y-4">
        {preview.requiresPin&&<label className="block font-semibold">Current resident portal PIN<input aria-label="Current resident portal PIN" type="password" inputMode="numeric" autoComplete="off" required minLength={6} maxLength={12} pattern="[0-9]{6,12}" value={pin} onChange={e=>setPin(e.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label>}
        <label className="block font-semibold">Type END MY ROOM ACCESS to confirm<input aria-label="Room release confirmation" required value={confirm} onChange={e=>setConfirm(e.target.value)} maxLength={32} autoComplete="off" className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900" /></label>
        <button type="submit" disabled={confirm!=='END MY ROOM ACCESS'} className="min-h-11 rounded-xl bg-rose-700 px-4 py-3 font-bold text-white disabled:opacity-50">{busy?'Ending room access…':'End my room access'}</button>
      </fieldset></form>}</>}
    {error&&<><p role="alert" className="text-rose-700">{error}</p><button type="button" disabled={busy} onClick={()=>setRevision(r=>r+1)} className="min-h-11 rounded-xl border border-blue-200 px-4 py-3 font-bold text-blue-800">Refresh room status</button></>}
  </section>;
}
