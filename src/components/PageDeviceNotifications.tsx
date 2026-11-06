import {useEffect,useState} from 'react';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';
import {PUSH_ACCOUNT_LABELS,PUSH_DASHBOARDS,safePushPath} from '../../devicePushPolicy';
import SupportLayout from './SupportLayout';
import DeviceNotificationSettings from './DeviceNotificationSettings';

export const PUSH_CONTINUATION_KEY='pinevela:push-continuation';
export function DevicePushContinuation(){
  const {user}=useAuth(),navigate=useNavigate();
  useEffect(()=>{
    if(!user?.id)return;
    try{const saved=JSON.parse(sessionStorage.getItem(PUSH_CONTINUATION_KEY)||'null');
      const target=safePushPath(saved?.path);if(target&&saved.expires>Date.now())navigate(target,{replace:true});
      else if(saved)sessionStorage.removeItem(PUSH_CONTINUATION_KEY);
    }catch{/* A blocked session store does not affect authentication. */}
  },[user?.id]);
  return null;
}
export function PageDeviceNotificationSettings(){return <SupportLayout publicPage><h1 className="text-3xl font-bold">Notification preferences</h1><div className="mt-6 max-w-2xl"><DeviceNotificationSettings/></div></SupportLayout>;}

export default function PageDeviceNotification(){
  const {user}=useAuth(),location=useLocation(),[params]=useSearchParams();
  const target=safePushPath(location.pathname+location.search),context=params.get('account'),kind=params.get('kind')||'';
  const [notice,setNotice]=useState<any>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const correct=Boolean(user&&user.id===context);
  useEffect(()=>{
    setNotice(null);setError('');
    if(!target||!correct)return;
    try{sessionStorage.removeItem(PUSH_CONTINUATION_KEY);}catch{}
    const controller=new AbortController();
    sessionFetch('/api/device-push/open/'+params.get('notice'),{signal:controller.signal,headers:{'X-PineVela-Profile-Context':user!.id}})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'This alert could not be opened.');if(!controller.signal.aborted)setNotice(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>controller.abort();
  },[target,correct,user?.id,attempt]);
  const remember=()=>{if(target)try{sessionStorage.setItem(PUSH_CONTINUATION_KEY,JSON.stringify({path:target,expires:Date.now()+30*60000}));}catch{}};
  return <SupportLayout publicPage><div className="max-w-2xl space-y-5"><p className="text-sm font-bold">PineVela · {PUSH_ACCOUNT_LABELS[kind]||'Account'}</p>
    <h1 className="text-3xl font-bold">{notice?.title||'Your device notification'}</h1>
    {!target?<p role="alert">This notification link is invalid.</p>:!correct?<><p>Sign in to the {PUSH_ACCOUNT_LABELS[kind]||'correct'} account that received this alert. Your other account’s private information stays separate.</p><Link className="inline-flex rounded-full border px-5 py-3 font-bold" to="/login?mode=login" onClick={remember}>Sign in to this account</Link></>:error?<><p role="alert">{error}</p><button type="button" className="rounded-full border px-5 py-3" onClick={()=>setAttempt(n=>n+1)}>Try again</button></>:!notice?<p role="status">Opening your notification…</p>:<>
      <p className="whitespace-pre-wrap break-words leading-7">{notice.message}</p>
      {notice.image&&<img src={notice.image} alt="" className="max-h-72 w-full rounded-2xl object-cover" onError={e=>{e.currentTarget.hidden=true;}}/>}
      <Link className="inline-flex rounded-full border px-5 py-3 font-bold" to={notice.destination}>Open {notice.discovery?'listing':notice.accountLabel+' account'}</Link>
    </>}
    <div><Link className="text-sm underline underline-offset-4" to={user?PUSH_DASHBOARDS[({user:'primary',student:'resident',merchant:'seller'} as Record<string,string>)[user.role]||user.role]||'/user/dashboard':'/login'} onClick={()=>{try{sessionStorage.removeItem(PUSH_CONTINUATION_KEY);}catch{}}}>Back to PineVela</Link></div>
  </div></SupportLayout>;
}
