import {useEffect,useRef,useState,type FormEvent} from 'react';
import {sessionFetch} from '../lib/session';
import {useAuth} from '../context/AuthContext';

type Enrollment={id:string;email:string;status:string;verified_at:string|null;authentication?:string};
const control='w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100';
export default function GoogleManagerEnrollment({initialName,initialPhone,initialEmail,pending,onChanged,onVerified}:{initialName:string;initialPhone:string;initialEmail:string;pending?:Enrollment;onChanged:()=>Promise<unknown>;onVerified:(id:string)=>Promise<void>}){
  const {user}=useAuth(),owner=useRef(user?.id);owner.current=user?.id;
  const [name,setName]=useState(initialName),[phone,setPhone]=useState(initialPhone),[email,setEmail]=useState(initialEmail);
  const [busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[error,setError]=useState('');
  const live=useRef(false),inFlight=useRef(false),popup=useRef<Window|null>(null),expectedId=useRef<string|null>(null);
  useEffect(()=>{live.current=true;return()=>{live.current=false;popup.current?.close();};},[]);
  const request=async(url:string,options:RequestInit={})=>{
    const response=await sessionFetch(url,{...options,headers:{'content-type':'application/json','X-PineVela-Profile-Context':String(user?.id),...options.headers},signal:AbortSignal.timeout(45000)});
    const data=await response.json();if(!response.ok)throw Error(data.error||'Could not complete manager verification.');return data;
  };
  const run=async(work:()=>Promise<unknown>)=>{
    if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');const captured=user?.id;
    try{await work();}catch(e:any){if(live.current&&owner.current===captured)setError(e.name==='TimeoutError'?'The request timed out. Check the saved enrollment before retrying.':e.message);}
    finally{inFlight.current=false;if(live.current&&owner.current===captured)setBusy(false);}
  };
  const checkSaved=async()=>{
    const captured=user?.id,rows=await request('/api/auth/enrollments');
    if(!live.current||owner.current!==captured)return;
    const actual=Array.isArray(rows)?rows.find(r=>r.id===(expectedId.current||pending?.id)&&r.kind==='manager'&&r.authentication==='google'):null;
    await onChanged();
    if(actual?.verified_at&&['pending_review','completed'].includes(actual.status)){setWaiting(false);popup.current?.close();await onVerified(actual.id);}
    else{setWaiting(false);setError('Google verification is not saved yet. Finish the Google window or cancel this pending signup and try again.');}
  };
  useEffect(()=>{
    const listener=(event:MessageEvent)=>{
      if(event.origin!==location.origin||event.source!==popup.current||event.data?.type!=='pinevela-manager-google-result')return;
      if(event.data.enrollmentId!==expectedId.current)return;
      void run(checkSaved);
    };
    window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
  },[user?.id,pending?.id]);
  const start=(event:FormEvent)=>{
    event.preventDefault();if(inFlight.current||waiting)return;
    popup.current=window.open('about:blank','_blank','popup,width=520,height=720');
    if(!popup.current){setError('Allow the Google sign-in window, then try again.');return;}
    void run(async()=>{
      const captured=user?.id;
      try{
        const result=await request('/api/auth/enrollments/google/start',{method:'POST',body:JSON.stringify({kind:'manager',name,phone,email})});
        const url=new URL(result.url);
        if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.pathname!=='/auth/v1/authorize'||typeof result.enrollmentId!=='string')throw Error('The Google sign-in request could not be confirmed.');
        if(!live.current||owner.current!==captured){popup.current?.close();return;}
        expectedId.current=result.enrollmentId;setWaiting(true);popup.current!.location.href=url.href;await onChanged();
      }catch(e){popup.current?.close();await onChanged().catch(()=>undefined);throw e;}
    });
  };
  return <div className="space-y-4">
    <p className="text-sm text-slate-600 dark:text-slate-300">Use a separate Google account you control for your manager login. Google verifies its email; no emailed code or new password is needed here. Property inspection and administrator approval still apply.</p>
    {error&&<p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900 dark:bg-rose-950 dark:text-rose-100">{error}</p>}
    {!pending&&!waiting&&<form onSubmit={start} className="space-y-3">
      <label className="block text-sm font-semibold">Manager name<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)} className={control}/></label>
      <label className="block text-sm font-semibold">Contact phone<input required type="tel" maxLength={40} value={phone} onChange={e=>setPhone(e.target.value)} className={control}/></label>
      <label className="block text-sm font-semibold">Separate Google account email<input required type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} className={control}/></label>
      <button disabled={busy} className="min-h-11 w-full rounded-xl bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-50">{busy?'Opening Google…':'Verify manager account with Google'}</button>
    </form>}
    {(pending||waiting)&&<div className="space-y-3">
      <p className="break-words text-sm">Manager email: <strong>{pending?.email||email}</strong></p>
      {waiting&&<p role="status" className="text-sm">Complete sign-in in the Google window. Your primary account stays signed in.</p>}
      <button type="button" disabled={busy} onClick={()=>void run(checkSaved)} className="min-h-11 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-50">{busy?'Checking…':pending?.verified_at?'Continue with verified manager account':'Check saved verification'}</button>
      {pending?.status==='pending_email'&&<button type="button" disabled={busy} onClick={()=>void run(async()=>{await request(`/api/auth/enrollments/${pending.id}`,{method:'DELETE'});popup.current?.close();expectedId.current=null;setWaiting(false);await onChanged();})} className="ml-2 min-h-11 rounded-xl border border-blue-200 px-4 text-sm">Cancel pending signup</button>}
    </div>}
  </div>;
}
