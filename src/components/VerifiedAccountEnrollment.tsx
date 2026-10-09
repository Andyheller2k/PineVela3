import React,{ useEffect,useId,useState } from 'react';
import { sessionFetch as fetch } from '../lib/session';
type Kind = 'resident' | 'seller' | 'manager';
type Enrollment = { id:string;kind:Kind;email:string;status:string;verified_at:string | null;signup_id?:string;expires_at:string;account_status?:string;requires_portal_pin?:boolean };
const control = 'w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600';
async function request(url:string,options:RequestInit = {}) {
  const response = await fetch(url,options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request could not complete.'),{ enrollmentId:data.enrollmentId });
  return data;
}
export default function VerifiedAccountEnrollment({ kind,initialName = '',initialPhone = '',initialEmail = '',initialPassword = '',onVerified }: {
  kind:Kind;initialName?:string;initialPhone?:string;initialEmail?:string;initialPassword?:string;onVerified:(enrollmentId:string) => Promise<void>;
}) {
  const formId = useId();
  const [records,setRecords] = useState<Enrollment[]>([]),[ready,setReady] = useState(false);
  const [name,setName] = useState(initialName),[phone,setPhone] = useState(initialPhone),[email,setEmail] = useState(initialEmail);
  const [password,setPassword] = useState(initialPassword),[repeatPassword,setRepeatPassword] = useState(initialPassword);
  const [newPin,setNewPin] = useState(''),[existingPin,setExistingPin] = useState('');
  const [code,setCode] = useState(''),[confirmationPassword,setConfirmationPassword] = useState('');
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[notice,setNotice] = useState('');
  const pending = records.find(e => e.kind === kind && ['pending_email','pending_review'].includes(e.status));
  const released = kind === 'resident' ? records.find(e => e.kind === 'resident' && e.status === 'completed' && e.account_status === 'closed') : undefined;
  const shared = kind !== 'manager' && records.some(e => e.kind === (kind === 'resident' ? 'seller' : 'resident') &&
    e.email.toLowerCase() === email.trim().toLowerCase() && e.verified_at && ['pending_review','completed'].includes(e.status));
  const load = async () => {
    const data = await request('/api/auth/enrollments');
    setRecords(data);setReady(true);
    return data as Enrollment[];
  };
  useEffect(() => { let live = true;
    request('/api/auth/enrollments').then(data => { if (live) { setRecords(data);setReady(true); } }).catch(err => { if (live) setError(err.message); });
    return () => { live = false; };
  },[]);
  const run = async (work:() => Promise<void>) => {
    setBusy(true);setError('');setNotice('');
    try { await work(); }
    catch (err:any) { setError(err.message);if (err.enrollmentId) await load().catch(() => undefined); }
    finally { setBusy(false); }
  };
  const begin = (event:React.FormEvent) => { event.preventDefault();void run(async () => {
    if (password !== repeatPassword) throw new Error('The passwords do not match.');
    const result = await request('/api/auth/enrollments',{ method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({ kind,name,email,phone,password,...(shared ? { portalPin:newPin,existingPortalPin:existingPin } : {}) }) });
    setPassword('');setRepeatPassword('');setNewPin('');setExistingPin('');
    await load();
    if (result.verificationRequired) setNotice('Check your email to confirm this account.');
    else setNotice('Your verified student identity is linked. Use the different PINs to enter each portal.');
  }); };
  const confirm = (event:React.FormEvent) => { event.preventDefault();if (!pending) return;void run(async () => {
    await request(`/api/auth/enrollments/${pending.id}/verify`,{ method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(code.trim() ? { code } : { password:confirmationPassword }) });
    setCode('');setConfirmationPassword('');await load();setNotice('Email verified. You can continue registration.');
  }); };
  const label = (field:string) => `${formId}-${field}`;
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">{notice}</p>}
    {!ready && !error && <p role="status" className="text-sm text-slate-600">Checking your account registration…</p>}
    {ready && !pending && released && <form onSubmit={event => { event.preventDefault();void run(async () => {
      await request(`/api/auth/enrollments/${released.id}/reactivate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:confirmationPassword,portalPin:existingPin})});
      setConfirmationPassword('');setExistingPin('');await load();setNotice('Your verified resident identity is ready. Continue to activate your new room.');
    }); }} className="space-y-3">
      <p className="text-sm text-slate-700">Your previous room allocation has ended. Reuse your verified resident email: <strong>{released.email}</strong>.</p>
      <div><label htmlFor={label('reactivate-password')} className="mb-1 block text-sm font-semibold">Resident account password</label>
        <input id={label('reactivate-password')} type="password" autoComplete="current-password" required minLength={8} maxLength={256} value={confirmationPassword} onChange={e => setConfirmationPassword(e.target.value)} className={control} /></div>
      {released.requires_portal_pin && <div><label htmlFor={label('reactivate-pin')} className="mb-1 block text-sm font-semibold">Resident portal PIN</label>
        <input id={label('reactivate-pin')} type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6,12}" minLength={6} maxLength={12} value={existingPin} onChange={e => setExistingPin(e.target.value)} className={control} /></div>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Verifying…' : 'Reuse verified resident account'}</button>
    </form>}
    {ready && !pending && !released && <form onSubmit={begin} className="space-y-3">
      <p className="text-sm text-slate-600">Verify your {kind === 'manager' ? 'work' : 'student'} email before activating this account.</p>
      <div><label htmlFor={label('name')} className="block text-sm font-semibold mb-1">Full name</label>
        <input id={label('name')} required maxLength={120} autoComplete="name" value={name} onChange={e => setName(e.target.value)} className={control} /></div>
      <div><label htmlFor={label('phone')} className="block text-sm font-semibold mb-1">Contact phone</label>
        <input id={label('phone')} type="tel" required maxLength={40} autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} className={control} /></div>
      <div><label htmlFor={label('email')} className="block text-sm font-semibold mb-1">{kind === 'manager' ? 'Work email' : 'Student email'}</label>
        <input id={label('email')} type="email" required maxLength={254} autoComplete="email" value={email} onChange={e => { setEmail(e.target.value);setNewPin('');setExistingPin(''); }} className={control} /></div>
      <div><label htmlFor={label('password')} className="block text-sm font-semibold mb-1">{shared ? 'Existing student-email password' : 'Account password'}</label>
        <input id={label('password')} type="password" required minLength={8} maxLength={256} autoComplete={shared ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} className={control} /></div>
      <div><label htmlFor={label('repeat-password')} className="block text-sm font-semibold mb-1">Confirm password</label>
        <input id={label('repeat-password')} type="password" required minLength={8} maxLength={256} autoComplete={shared ? 'current-password' : 'new-password'} value={repeatPassword} onChange={e => setRepeatPassword(e.target.value)} className={control} /></div>
      {shared && <fieldset className="space-y-3 rounded-xl border border-blue-200 p-3">
        <legend className="px-1 text-sm font-semibold">Separate portal access</legend>
        <p className="text-xs text-slate-600">This student email is already verified. Keep its password and choose different PINs for the two portals.</p>
        <div><label htmlFor={label('existing-pin')} className="block text-sm font-semibold mb-1">{kind === 'resident' ? 'Seller' : 'Resident'} PIN: enter it, or choose one if none is set</label>
          <input id={label('existing-pin')} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required value={existingPin} onChange={e => setExistingPin(e.target.value)} className={control} /></div>
        <div><label htmlFor={label('new-pin')} className="block text-sm font-semibold mb-1">New {kind} portal PIN</label>
          <input id={label('new-pin')} type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{6,12}" minLength={6} maxLength={12} required value={newPin} onChange={e => setNewPin(e.target.value)} className={control} /></div>
      </fieldset>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : shared ? 'Link verified student account' : 'Send verification email'}</button>
    </form>}
    {pending && <>
      <p className="text-sm text-slate-700">Account email: <strong>{pending.email}</strong></p>
      {pending.verified_at ? <button disabled={busy} onClick={() => void run(() => onVerified(pending.id))} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Please wait…' : 'Continue with verified account'}</button> : <>
        {pending.signup_id && <form onSubmit={confirm} className="space-y-3">
          <div><label htmlFor={label('code')} className="block text-sm font-semibold mb-1">Email code or confirmation link</label>
            <input id={label('code')} autoComplete="one-time-code" maxLength={4096} value={code} onChange={e => setCode(e.target.value)} className={control} /></div>
          <p className="text-xs text-slate-600">Already opened the confirmation link? Leave the code blank and enter this account's password.</p>
          <div><label htmlFor={label('confirmation-password')} className="block text-sm font-semibold mb-1">Confirmed account password</label>
            <input id={label('confirmation-password')} type="password" autoComplete="current-password" required={!code.trim()} maxLength={256} value={confirmationPassword} onChange={e => setConfirmationPassword(e.target.value)} className={control} /></div>
          <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Verifying…' : 'Verify email'}</button>
        </form>}
        <div className="flex flex-wrap gap-3">
          {pending.signup_id && <button type="button" disabled={busy} onClick={() => void run(async () => {
            await request(`/api/auth/enrollments/${pending.id}/resend`,{ method:'POST' });setNotice('A new confirmation email has been requested.');
          })} className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm">Resend email</button>}
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            await request(`/api/auth/enrollments/${pending.id}`,{ method:'DELETE' });setCode('');setConfirmationPassword('');await load();
          })} className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm">Cancel pending signup</button>
        </div>
      </>}
    </>}
  </div>;
}
