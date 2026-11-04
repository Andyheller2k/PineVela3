import { useRef, useState, useEffect } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function ManagerAuthorizationSettings() {
  const { apiFetch } = useAuth();
  const [busy,setBusy] = useState(false), [error,setError] = useState('');
  const mounted=useRef(true), pending=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const replace=async()=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try {
      const data=await apiFetch('/api/manager/secret-key/rotate',{method:'POST'});
      if(typeof data?.key!=='string'||!/^\d{6}$/.test(data.key))throw new Error('The replacement code could not be read. Please contact support.');
      // The global key card owns the one-time display even if Settings unmounts.
      window.dispatchEvent(new CustomEvent('pinevela-manager-code-issued',{detail:{key:data.key}}));
    } catch(failure) {
      if(mounted.current)setError(failure instanceof Error?failure.message:'Your manager code could not be changed.');
    } finally {pending.current=false;if(mounted.current)setBusy(false);}
  };
  return <section aria-label="Manager authorization code" className="mb-6 space-y-3 rounded-3xl border border-blue-200 bg-white p-6 text-slate-900">
    <h3 className="flex items-center gap-2 font-bold"><KeyRound size={20}/>Manager authorization code</h3>
    <p className="text-sm text-slate-600">Replace your saved key with a six-digit code for sensitive manager actions. Confirm with your current key; it will stop working when the new code is issued.</p>
    <button type="button" onClick={replace} disabled={busy} aria-busy={busy} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'Changing code…':'Replace with a 6-digit code'}</button>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
  </section>;
}
