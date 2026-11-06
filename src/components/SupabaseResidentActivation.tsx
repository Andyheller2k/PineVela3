import React,{ useState } from 'react';
import DashboardOverlay from './DashboardOverlay';
import { sessionFetch as fetch } from '../lib/session';
import { useAuth } from '../context/AuthContext';
export default function SupabaseResidentActivation({ name,phone,residenceId,onClose,onActivated }: {
  name?:string;phone?:string;residenceId?:string;onClose:() => void;onActivated:() => void;
}) {
  const { user } = useAuth();
  const [key,setKey] = useState(''),[room,setRoom] = useState<any>(null),[error,setError] = useState(''),[busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
  const [pin,setPin]=useState(''),[confirmPin,setConfirmPin]=useState(''),[pinError,setPinError]=useState('');
  async function verify(event:React.FormEvent) {
    event.preventDefault();setBusy(true);setError('');
    try {
      const response = await fetch('/api/room-keys/verify',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ roomKey:key }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (residenceId && data.hostelId !== residenceId) throw new Error('This key belongs to a different residence.');
      setRoom(data);
    } catch (err:any) { setError(err.message); } finally { setBusy(false); }
  }
  async function activate(event:React.FormEvent) {
    event.preventDefault();if(busy)return;setPinError('');setError('');
    if(!/^\d{6,12}$/.test(pin)){setPinError('Choose a room PIN with 6–12 digits.');return;}
    if(pin!==confirmPin){setPinError('The room PINs do not match.');return;}
    setBusy(true);
    try {
      const response = await fetch('/api/auth/resident-activate',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ pin,roomKey:room.roomKey }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Your room could not be activated.');
      setPin('');setConfirmPin('');setDone(true);onActivated();
    }catch(err){setPinError(err instanceof Error?err.message:'Your room could not be activated.');}
    finally{setBusy(false);}
  }
  return <DashboardOverlay data-pv-onboarding aria-label="Activate resident account" onClose={onClose} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
    <div className="onboarding-fields w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 sm:p-7 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Activate your resident account</h2>
        <button type="button" onClick={onClose} aria-label="Close resident activation" className="min-h-11 px-3 rounded-xl border border-blue-200 text-sm">Close</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {done ? <div className="space-y-3">
        <p role="status" className="text-sm text-blue-950">Your room at {room.hostelName} is activated. Enter {user?.email} and your room PIN on the login page to open your resident account. Your primary account still uses its usual password.</p>
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white">Return to my account</button>
      </div> : !room ? <form onSubmit={verify} className="space-y-3">
        <label htmlFor="resident-activation-key" className="block text-sm font-semibold">Room activation key</label>
        <input id="resident-activation-key" required maxLength={100} value={key} onChange={e => setKey(e.target.value.toUpperCase())} autoComplete="off" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600" />
        <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Checking…' : 'Check room key'}</button>
      </form> : <>
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">{room.hostelName} · {room.blockName} · Room {room.roomNumber}</p>
        <form onSubmit={activate} className="space-y-3">
          <div className="rounded-xl border border-blue-200 p-3 text-sm"><p className="font-semibold">Sign in with your primary email</p><p className="break-all">{user?.email}</p><p className="mt-1 text-xs text-slate-500">No student email is required. This PIN opens your resident account; your primary password stays the same.</p></div>
          <label className="block text-sm font-semibold" htmlFor="resident-new-pin">Room PIN</label>
          <input id="resident-new-pin" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6,12}" minLength={6} maxLength={12} disabled={busy}
            value={pin} onChange={e=>{setPin(e.target.value.replace(/\D/g,''));setPinError('');}} className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600" />
          <p className="text-xs text-slate-500">Choose 6–12 digits. Use your primary email and this PIN to sign in to your resident account.</p>
          <label className="block text-sm font-semibold" htmlFor="resident-confirm-pin">Confirm room PIN</label>
          <input id="resident-confirm-pin" type="password" inputMode="numeric" autoComplete="new-password" required pattern="[0-9]{6,12}" minLength={6} maxLength={12} disabled={busy}
            value={confirmPin} onChange={e=>{setConfirmPin(e.target.value.replace(/\D/g,''));setPinError('');}} aria-invalid={!!pinError} aria-describedby={pinError?'resident-pin-error':undefined}
            className="w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-slate-900 focus:ring-2 focus:ring-blue-600" />
          {pinError&&<p id="resident-pin-error" role="alert" className="text-xs text-rose-700">{pinError}</p>}
          <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy?'Activating…':'Activate my room'}</button>
          <button type="button" disabled={busy} onClick={()=>{setRoom(null);setPin('');setConfirmPin('');setPinError('');}} className="w-full rounded-xl border border-blue-200 px-4 py-2.5 text-sm">Use a different key</button>
        </form>
      </>}
    </div>
  </DashboardOverlay>;
}
