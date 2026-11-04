import { useEffect,useRef,useState } from 'react';
import { Link,useNavigate,useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PineLogo from './PineLogo';
import SessionRestorationNotice from './SessionRestorationNotice';

const button='inline-block rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40';
export default function SupabaseAdminInvitation(){
  const {user}=useAuth(),[params]=useSearchParams(),token=params.get('token')||'';
  return <InvitationContent key={`${user?.id||'signed-out'}:${token}`} token={token}/>;
}
function InvitationContent({token}:{token:string}){
  const {user,loading,restorationError,apiFetch,logout}=useAuth(),navigate=useNavigate();
  const [invitation,setInvitation]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState<any>(null);
  const mounted=useRef(true);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const valid=/^[a-zA-Z0-9_-]{43}$/.test(token);
  useEffect(()=>{let active=true;
    if(!loading&&valid&&user?.role==='user')apiFetch('/api/auth/admin-invitation/inspect',{method:'POST',body:JSON.stringify({invitationToken:token})})
      .then(result=>{if(active)setInvitation(result);}).catch(e=>{if(active)setError(e.message||'This invitation is unavailable.');});
    return()=>{active=false;};
  },[token,user?.id,user?.role,loading,apiFetch,valid]);
  const next=`/admin-invitation?token=${token}`,login=`/login?${new URLSearchParams({next})}`;
  async function accept(){if(busy)return;setBusy(true);setError('');
    try{const result=await apiFetch('/api/auth/admin-invitation/accept',{method:'POST',body:JSON.stringify({invitationToken:token})});
      if(!mounted.current)return;
      if(!result?.success)throw new Error('Administrator enrollment could not be saved.');
      setAccepted(result);window.history.replaceState(null,'',`${window.location.pathname}#/admin-invitation`);
    }catch(e:any){if(mounted.current)setError(e.message||'Administrator enrollment could not be saved.');}finally{if(mounted.current)setBusy(false);}
  }
  if (loading && restorationError) return <SessionRestorationNotice />;
  return <main data-pv-onboarding className="page-canvas flex min-h-screen items-center justify-center p-5"><section className="w-full max-w-lg space-y-5 rounded-3xl border border-blue-200 bg-white/75 p-6 text-slate-900 shadow-xl backdrop-blur-xl">
    <PineLogo size={36}/><h1 className="text-xl font-bold">Private administrator invitation</h1>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {accepted?<><p>Administrator #{accepted.slot} · {accepted.email} is enrolled.</p><p className="text-sm">Sign in again, then open Admin Approvals and Settings to enroll your separate keys. Each is shown once.</p>
      <button className={button} disabled={busy} onClick={async()=>{setBusy(true);if(await logout())navigate('/login',{replace:true});else{setError('Sign-out failed. Retry before signing in as an administrator.');setBusy(false);}}}>Sign in as administrator</button></>
    :loading?<p role="status" aria-live="polite">Checking your sign-in…</p>
    :!valid?<p>Open the private invitation shared by administrator #1.</p>
    :!user?<><p className="text-sm">Sign in or create an account with the invited Google/email address. Verify your email first; this link alone cannot grant administrator access.</p>
      <div className="flex flex-wrap gap-3"><Link className={button} to={login}>Sign in</Link><Link className={button} to={`${login}&mode=register`}>Sign up</Link></div></>
    :user.role!=='user'?<><p className="text-sm">Use the invited email's primary account. Resident, seller, staff and manager identities cannot accept this invitation.</p><button className={button} disabled={busy} onClick={async()=>{setBusy(true);if(await logout())navigate(login,{replace:true});else{setError('Sign-out failed. Please retry.');setBusy(false);}}}>Sign in with invited account</button></>
    :invitation?<><p className="font-semibold">Administrator #{invitation.slot} · {invitation.name}</p><p className="break-all text-sm">Invited verified email: {invitation.email}</p><p className="text-xs">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>
      <p className="text-sm">Accept using this verified account. Your login password stays with Supabase; approval and settings keys are enrolled separately afterward.</p><button className={button} disabled={busy} onClick={()=>void accept()}>{busy?'Accepting…':'Accept administrator invitation'}</button></>
    :!error?<p role="status">Checking your verified invitation…</p>:<button className={button} disabled={busy} onClick={async()=>{setBusy(true);if(await logout())navigate(login,{replace:true});else setBusy(false);}}>Use a different verified account</button>}
  </section></main>;
}
