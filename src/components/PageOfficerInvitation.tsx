import {useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import PineLogo from './PineLogo';
import SessionRestorationNotice from './SessionRestorationNotice';

const button='inline-block rounded-xl bg-blue-700 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50';
export default function PageOfficerInvitation() {
  const {user}=useAuth(),[params]=useSearchParams(),token=params.get('token')||'';
  return <OfficerInvitationContent key={`${user?.id||'signed-out'}:${token}`} token={token}/>;
}
function OfficerInvitationContent({token}:{token:string}) {
  const {user,loading,restorationError,apiFetch,logout}=useAuth(),navigate=useNavigate();
  const [invitation,setInvitation]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState<{officerStatus:string;accessAvailable:boolean}|null>(null);
  const mounted=useRef(true),inFlight=useRef(false);useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const valid=/^[a-zA-Z0-9_-]{43}$/.test(token),next=`/officer-invitation?token=${token}`,login=`/login?${new URLSearchParams({next})}`;
  useEffect(()=>{let active=true;
    if(!loading&&valid&&user?.role==='user')apiFetch('/api/auth/officer-invitation/inspect',{method:'POST',body:JSON.stringify({invitationToken:token})})
      .then(result=>{if(active)setInvitation(result);}).catch((e:any)=>{if(active)setError(e.message||'This officer invitation is unavailable.');});
    return()=>{active=false;};
  },[loading,valid,token,user?.id,user?.role,apiFetch]);
  async function signOut(target:string) {if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try {if(await logout())navigate(target,{replace:true});else setError('Sign-out failed. Retry before signing in with your invited account.');}
    finally {inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  async function accept() {if(inFlight.current)return;inFlight.current=true;setBusy(true);setError('');
    try {const result=await apiFetch('/api/auth/officer-invitation/accept',{method:'POST',body:JSON.stringify({invitationToken:token})});
      if(!mounted.current)return;if(!result?.success)throw new Error('Officer enrollment could not be confirmed. Refresh before retrying.');
      // Keep the current component mounted while removing the spent token from history.
      window.history.replaceState(null,'',`${window.location.pathname}#/officer-invitation`);setAccepted({officerStatus:result.officerStatus,accessAvailable:result.accessAvailable});
    }catch(e:any){if(mounted.current)setError(e.message||'Officer enrollment could not be saved.');}
    finally {inFlight.current=false;if(mounted.current)setBusy(false);}
  }
  if(loading&&restorationError)return <SessionRestorationNotice/>;
  return <main className="flex min-h-screen items-center justify-center p-5" style={{background:'linear-gradient(140deg,var(--pv-canvas),var(--pv-secondary))',color:'var(--pv-text)'}}><section className="w-full max-w-lg space-y-5 rounded-3xl border p-6 shadow-xl backdrop-blur-xl" style={{borderColor:'var(--pv-edge)',background:'var(--pv-glass)',color:'var(--pv-text)'}}>
    <PineLogo size={36}/><h1 className="text-xl font-bold">Private verification officer invitation</h1>
    {error&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-200">{error}</p>}
    {accepted?accepted.accessAvailable?<><p>Your verified officer portal is enrolled.</p><p className="text-sm">Sign out and sign in again through the main login page to open your assigned inspection workspace.</p><button className={button} disabled={busy} onClick={()=>void signOut('/login')}>{busy?'Signing out…':'Sign in as verification officer'}</button></>
      :<><p>Your officer portal is {accepted.officerStatus}.</p><p className="text-sm">This invitation was already accepted. An administrator must review officer access before you can enter the inspection workspace. Your ordinary primary account remains available.</p><Link className={button} to="/user/dashboard">Open primary account</Link></>
    :loading?<p role="status" aria-live="polite">Checking your sign-in…</p>
    :!valid?<p>Open the private officer invitation shared by your PineVela administrator.</p>
    :!user?<><p className="text-sm">Use the separate official Google/email address named in your invitation. Complete email verification before accepting.</p><div className="flex flex-wrap gap-3"><Link className={button} to={login}>Sign in</Link><Link className={button} to={`${login}&mode=register`}>Sign up</Link></div></>
    :user.role!=='user'?<><p className="text-sm">Accept with the invited email’s primary account. Administrator and other portal identities cannot become verification officers.</p><button className={button} disabled={busy} onClick={()=>void signOut(login)}>Sign in with the invited account</button></>
    :invitation?<><p className="font-semibold">{invitation.fullName}</p><p className="break-all text-sm">Verified official email: {invitation.email}</p><p className="text-sm">Inspection zone: {invitation.assignedZone}</p><p className="text-sm">Contact: {invitation.phone}</p>{!invitation.alreadyAccepted&&<p className="text-xs">Expires {new Date(invitation.expiresAt).toLocaleString()}</p>}
      <p className="text-sm">{invitation.alreadyAccepted&&invitation.officerStatus!=='active'?`Your already accepted officer portal is ${invitation.officerStatus}. This link cannot restore access.`:'Accept to open a separate verification officer portal. Your sign-in credentials remain managed by Supabase.'}</p><button className={button} disabled={busy} onClick={()=>void accept()}>{busy?'Accepting…':invitation.alreadyAccepted?invitation.officerStatus==='active'?'Continue to officer sign-in':'View current officer status':'Accept officer invitation'}</button></>
    :!error?<p role="status">Checking your verified invitation…</p>:<button className={button} disabled={busy} onClick={()=>void signOut(login)}>Use a different verified account</button>}
  </section></main>;
}
