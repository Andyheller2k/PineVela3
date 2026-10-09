import React,{ useState } from 'react';
import DashboardOverlay from './DashboardOverlay';
import VerifiedAccountEnrollment from './VerifiedAccountEnrollment';
import { sessionFetch as fetch } from '../lib/session';
export default function SupabaseResidentActivation({ name,phone,residenceId,onClose,onActivated }: {
  name?:string;phone?:string;residenceId?:string;onClose:() => void;onActivated:() => void;
}) {
  const [key,setKey] = useState(''),[room,setRoom] = useState<any>(null),[error,setError] = useState(''),[busy,setBusy] = useState(false);
  const [done,setDone] = useState(false);
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
  async function activate(enrollmentId:string) {
    const response = await fetch('/api/room-keys/claim',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ enrollmentId,roomKey:room.roomKey }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setDone(true);onActivated();
  }
  return <DashboardOverlay aria-label="Activate resident account" onClose={onClose} className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl flex items-center justify-center p-4">
    <div className="onboarding-fields w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-3xl border border-blue-200 bg-white p-5 sm:p-7 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Activate your resident account</h2>
        <button type="button" onClick={onClose} aria-label="Close resident activation" className="min-h-11 px-3 rounded-xl border border-blue-200 text-sm">Close</button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-800">{error}</p>}
      {done ? <div className="space-y-3">
        <p role="status" className="text-sm text-blue-950">Your room at {room.hostelName} is activated. Use your verified resident email to sign in to its portal. If you share the email with your seller account, use the resident PIN.</p>
        <button type="button" onClick={onClose} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white">Return to my account</button>
      </div> : !room ? <form onSubmit={verify} className="space-y-3">
        <label htmlFor="resident-activation-key" className="block text-sm font-semibold">Room activation key</label>
        <input id="resident-activation-key" required maxLength={100} value={key} onChange={e => setKey(e.target.value.toUpperCase())} autoComplete="off" className="w-full rounded-xl border border-blue-200 bg-white px-3 py-3 text-slate-900 focus:ring-2 focus:ring-blue-600" />
        <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Checking…' : 'Check room key'}</button>
      </form> : <>
        <p className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">{room.hostelName} · {room.blockName} · Room {room.roomNumber}</p>
        <VerifiedAccountEnrollment kind="resident" initialName={name} initialPhone={phone} onVerified={activate} />
      </>}
    </div>
  </DashboardOverlay>;
}
