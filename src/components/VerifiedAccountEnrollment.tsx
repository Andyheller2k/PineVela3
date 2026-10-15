import React,{ useEffect,useId,useState,useRef } from 'react';
import { sessionFetch as fetch } from '../lib/session';
import {useAuth} from '../context/AuthContext';
import GoogleManagerEnrollment from './GoogleManagerEnrollment';
type Kind = 'resident' | 'seller' | 'manager';
type Enrollment = { id:string;kind:Kind;email:string;status:string;verified_at:string | null;signup_id?:string;expires_at:string;account_status?:string;requires_portal_pin?:boolean;authentication?:string };
export type ManagerEnrollmentSnapshot={ownerId:string;records:Enrollment[];googleManagerEnrollment:boolean};
const control = 'w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600';
async function request(url:string,options:RequestInit = {}) {
  const response = await fetch(url,options);
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || 'The request could not complete.'),{ enrollmentId:data.enrollmentId });
  return data;
}
export default function VerifiedAccountEnrollment({ kind,initialName = '',initialPhone = '',initialEmail = '',initialPassword = '',initialSnapshot,onVerified }: {
  kind:Kind;initialName?:string;initialPhone?:string;initialEmail?:string;initialPassword?:string;initialSnapshot?:ManagerEnrollmentSnapshot;onVerified:(enrollmentId:string) => Promise<void>;
}) {
  const formId = useId(),{user}=useAuth();
  const mounted=useRef(false),inFlight=useRef(false),previousAccount=useRef<string|undefined>(undefined),current=useRef('');current.current=`${user?.id}:${kind}`;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const ownRequest=async(url:string,options:RequestInit={})=>{
    const captured=current.current,headers=new Headers(options.headers);if(user?.id)headers.set('X-PineVela-Profile-Context',user.id);
    const data=await request(url,{...options,headers});if(!mounted.current||current.current!==captured)throw Error('Your active registration account changed.');return data;
  };
  const [records,setRecords] = useState<Enrollment[]>([]),[ready,setReady] = useState(false);
  const [name,setName] = useState(initialName),[phone,setPhone] = useState(initialPhone),[email,setEmail] = useState(initialEmail);
  const [password,setPassword] = useState(initialPassword),[repeatPassword,setRepeatPassword] = useState(initialPassword);
  const [newPin,setNewPin] = useState(''),[existingPin,setExistingPin] = useState('');
  const [code,setCode] = useState(''),[confirmationPassword,setConfirmationPassword] = useState('');
  const [busy,setBusy] = useState(false),[error,setError] = useState(''),[notice,setNotice] = useState('');
  const pending = records.find(e => e.kind === kind && ['pending_email','pending_review'].includes(e.status));
  const released = records.find(e=>e.kind===kind&&e.verified_at&&e.account_status==='closed'&&(kind==='resident'?e.status==='completed':['completed','cancelled','expired'].includes(e.status)));
  const [managerProof,setManagerProof]=useState<'email'|'password'>('email');
  const [googleManager,setGoogleManager]=useState(false);
  const shared = kind !== 'manager' && records.some(e => e.kind === (kind === 'resident' ? 'seller' : 'resident') &&
    e.email.toLowerCase() === email.trim().toLowerCase() && e.verified_at && ['pending_review','completed'].includes(e.status));
  const load = async () => {
    const result=await ownRequest(kind==='manager'?'/api/users/manager-onboarding':'/api/auth/enrollments',kind==='manager'?{signal:AbortSignal.timeout(30000)}:{});
    const data=kind==='manager'?result.enrollments:result;
    if(!Array.isArray(data)||kind==='manager'&&typeof result.policy?.googleManagerEnrollment!=='boolean')throw Error('Could not confirm your account registration. Please retry.');
    if(kind==='manager')setGoogleManager(result.policy.googleManagerEnrollment);
    setRecords(data);setReady(true);
    return data as Enrollment[];
  };
  useEffect(() => { let live = true;
    if(previousAccount.current&&previousAccount.current!==current.current){setName('');setPhone('');setEmail('');setPassword('');setRepeatPassword('');setNewPin('');}
    previousAccount.current=current.current;setManagerProof('email');setBusy(inFlight.current);
    setRecords([]);setReady(false);setCode('');setConfirmationPassword('');setExistingPin('');setError('');setNotice('');
    setGoogleManager(false);
    if(kind==='manager'&&initialSnapshot?.ownerId===user?.id){
      setRecords(initialSnapshot.records);setGoogleManager(initialSnapshot.googleManagerEnrollment);setReady(true);
    }else void load().catch(err=>{if(live)setError(err.message);});
    return () => { live = false; };
  },[user?.id,kind]);
  const run = async (work:() => Promise<void>) => {
    if(inFlight.current)return;inFlight.current=true;const captured=current.current;setBusy(true);setError('');setNotice('');
    try { await work(); }
    catch (err:any) { if(mounted.current&&current.current===captured){setError(err.message);if (err.enrollmentId) await load().catch(() => undefined);} }
    finally { inFlight.current=false;if(mounted.current)setBusy(false); }
  };
  const begin = (event:React.FormEvent) => { event.preventDefault();void run(async () => {
    if (password !== repeatPassword) throw new Error('The passwords do not match.');
    const result = await ownRequest('/api/auth/enrollments',{ method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({ kind,name,email,phone,password,...(shared ? { portalPin:newPin,existingPortalPin:existingPin } : {}) }) });
    setPassword('');setRepeatPassword('');setNewPin('');setExistingPin('');
    await load();
    if (result.verificationRequired) setNotice('Check your email to confirm this account.');
    else setNotice('Your verified student identity is linked. Use the different PINs to enter each portal.');
  }); };
  const confirm = (event:React.FormEvent) => { event.preventDefault();if (!pending) return;void run(async () => {
    await ownRequest(`/api/auth/enrollments/${pending.id}/verify`,{ method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify(code.trim() ? { code } : { password:confirmationPassword }) });
    setCode('');setConfirmationPassword('');await load();setNotice('Email verified. You can continue registration.');
  }); };
  const label = (field:string) => `${formId}-${field}`;
  if(ready&&googleManager&&kind==='manager'&&!released&&(!pending||pending.authentication==='google'))
    return <GoogleManagerEnrollment key={user?.id} initialName={initialName} initialPhone={initialPhone} initialEmail={initialEmail} pending={pending} onChanged={load} onVerified={onVerified}/>;
  return <div className="space-y-4">
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-950">{notice}</p>}
    {!ready && !error && <p role="status" className="text-sm text-slate-600">Checking your account registration…</p>}
    {ready && !pending && released && <form onSubmit={event => { event.preventDefault();void run(async () => {
      await ownRequest(`/api/auth/enrollments/${released.id}/reactivate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(kind!=='resident'?{...(managerProof==='email'?{code}:{password:confirmationPassword}),...(kind==='seller'?{portalPin:existingPin}:{})}:{password:confirmationPassword,portalPin:existingPin})});
      setCode('');setConfirmationPassword('');setExistingPin('');await load();setNotice(kind==='manager'?'Your retained work identity is confirmed. Continue to submit a new property for inspection.':kind==='seller'?'Your verified seller identity is ready. Submit a new application; approval and a new registration payment are required.':'Your verified resident identity is ready. Continue to activate your new room.');
    }); }} className="space-y-3">
      <p className="text-sm text-slate-700">{kind==='manager'?'Your manager portal was closed. Reuse your verified work email; a new physical property inspection is required.':kind==='seller'?'Your seller portal was closed. Reuse your verified student email; your old store and transactions remain in history.':'Your previous room allocation has ended. Reuse your verified resident email:'} <strong>{released.email}</strong>.</p>
      {kind!=='resident'&&<><label className="block text-sm font-semibold">Confirm your {kind==='seller'?'student':'work'} identity<select disabled={busy} value={managerProof} onChange={e=>{setManagerProof(e.target.value as 'email'|'password');setCode('');setConfirmationPassword('');}} className={control}><option value="email">Email code (including Google accounts)</option><option value="password">Existing PineVela account password</option></select></label>{managerProof==='email'&&<><button type="button" disabled={busy} onClick={()=>void run(async()=>{const result=await ownRequest(`/api/auth/enrollments/${released.id}/reactivate/send-code`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});setNotice(result.message);})} className="min-h-11 rounded-xl border border-blue-200 px-4 py-3 text-sm font-semibold">Request verification code</button><label htmlFor={label('reactivate-code')} className="block text-sm font-semibold">Email code or unopened sign-in link<input id={label('reactivate-code')} required autoComplete="one-time-code" maxLength={4096} disabled={busy} value={code} onChange={e=>setCode(e.target.value)} className={control}/></label><p className="text-xs text-slate-600">Copy the code or unopened link into this form. Your primary sign-in and Google password are retained.</p></>}</>}
      {(kind==='resident'||managerProof==='password')&&<div><label htmlFor={label('reactivate-password')} className="mb-1 block text-sm font-semibold">{kind==='manager'?'Work-account password':kind==='seller'?'Student account password':'Resident account password'}</label>
        <input id={label('reactivate-password')} type="password" autoComplete="current-password" required minLength={8} maxLength={256} disabled={busy} value={confirmationPassword} onChange={e => setConfirmationPassword(e.target.value)} className={control} /></div>}
      {kind!=='manager'&&released.requires_portal_pin && <div><label htmlFor={label('reactivate-pin')} className="mb-1 block text-sm font-semibold">{kind==='seller'?'Seller':'Resident'} portal PIN</label>
        <input id={label('reactivate-pin')} type="password" inputMode="numeric" autoComplete="off" required pattern="[0-9]{6,12}" minLength={6} maxLength={12} value={existingPin} onChange={e => setExistingPin(e.target.value)} className={control} /></div>}
      <button disabled={busy} className="w-full rounded-xl bg-blue-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{busy ? 'Verifying…' : kind==='manager'?'Confirm work identity and restart registration':kind==='seller'?'Verify seller and restart registration':'Reuse verified resident account'}</button>
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
            await ownRequest(`/api/auth/enrollments/${pending.id}/resend`,{ method:'POST' });setNotice('A new confirmation email has been requested.');
          })} className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm">Resend email</button>}
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            await ownRequest(`/api/auth/enrollments/${pending.id}`,{ method:'DELETE' });setCode('');setConfirmationPassword('');await load();
          })} className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm">Cancel pending signup</button>
        </div>
      </>}
    </>}
  </div>;
}
