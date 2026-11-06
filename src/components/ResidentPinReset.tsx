import { useState,type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

/** The endpoint chooses only this verified primary owner's managed resident. */
export default function ResidentPinReset(){
  const {apiFetch}=useAuth();
  const [pin,setPin]=useState(''),[confirm,setConfirm]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
  async function submit(event:FormEvent){
    event.preventDefault();if(busy)return;setError('');
    if(pin!==confirm){setError('The new room PINs do not match.');return;}
    setBusy(true);
    try{await apiFetch('/api/auth/resident-pin/reset',{method:'POST',body:JSON.stringify({newPin:pin})});setPin('');setConfirm('');setDone(true);}
    catch(e){setError(e instanceof Error?e.message:'Your room PIN could not be reset.');}
    finally{setBusy(false);}
  }
  if(done)return <p role="status" className="text-sm text-slate-700">Your room PIN is reset. Enter your primary email and new PIN on the login page to open your resident account. Your primary password stays the same.</p>;
  const input='mt-1 min-h-11 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-slate-900';
  return <form onSubmit={submit} className="space-y-3">
    <p className="text-sm text-slate-600">Reset the PIN for your resident account. Earlier resident sessions will need to sign in again.</p>
    <label className="block text-sm font-semibold">New room PIN<input aria-label="New room PIN" className={input} type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="new-password" required disabled={busy} value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,''));setError('');}} /></label>
    <label className="block text-sm font-semibold">Confirm new room PIN<input aria-label="Confirm new room PIN" className={input} type="password" inputMode="numeric" pattern="[0-9]{6,12}" minLength={6} maxLength={12} autoComplete="new-password" required disabled={busy} value={confirm} onChange={e=>{setConfirm(e.target.value.replace(/\D/g,''));setError('');}} aria-invalid={!!error} aria-describedby={error?'resident-reset-error':undefined} /></label>
    {error&&<p id="resident-reset-error" role="alert" className="text-xs text-rose-700">{error}</p>}
    <button disabled={busy} className="min-h-11 w-full rounded-xl bg-blue-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{busy?'Resetting…':'Reset room PIN'}</button>
  </form>;
}
