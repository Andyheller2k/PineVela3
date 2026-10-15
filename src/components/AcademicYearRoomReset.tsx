import {useEffect,useRef,useState} from 'react';
import DashboardOverlay from './DashboardOverlay';
import {useAuth} from '../context/AuthContext';
import {sessionFetch} from '../lib/session';
type Preview={residenceName:string;academicYear:string;previousAcademicYear:string|null;alreadyCompleted:boolean;rooms?:number;occupants?:number;fingerprint?:string;receipt?:{message:string}};
export default function AcademicYearRoomReset({residenceId,onClose,onComplete}:{residenceId:string;onClose:()=>void;onComplete:(message:string)=>Promise<void>}){
 const {user}=useAuth(),current=useRef(''),mounted=useRef(false),inFlight=useRef(false);current.current=`${user?.id}:${residenceId}`;
 const [year,setYear]=useState(()=>{const y=new Date().getFullYear();return `${y}/${y+1}`;}),[confirmation,setConfirmation]=useState('');
 const [preview,setPreview]=useState<Preview|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setPreview(null);setConfirmation('');setError('');},[user?.id,residenceId]);
 const request=async(path:string,options:RequestInit={})=>{
  const captured=current.current,headers=new Headers(options.headers);if(user?.id)headers.set('X-PineVela-Account-Context',user.id);
  const response=await sessionFetch(path,{...options,headers,signal:AbortSignal.timeout(45000)});const data=await response.json();
  if(!mounted.current||current.current!==captured)throw Error('Your active account changed.');
  if(!response.ok)throw Error(data.error||'The room reset could not complete.');return data;
 };
 const run=async(work:()=>Promise<void>)=>{
  if(inFlight.current)return;inFlight.current=true;const captured=current.current;setBusy(true);setError('');
  try{await work();}catch(e:any){if(mounted.current&&current.current===captured)setError(e.name==='TimeoutError'?'The request timed out. Refresh the preview to check whether this year completed.':e.message);}
  finally{inFlight.current=false;if(mounted.current)setBusy(false);}
 };
 return <DashboardOverlay aria-label="Academic-year room access reset" onClose={busy?null:onClose} className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
  <div data-popup-card className="w-full max-w-lg space-y-4 rounded-3xl border border-blue-200 bg-white p-6 shadow-2xl dark:border-blue-800 dark:bg-slate-950 dark:text-blue-50">
   <h3 className="text-lg font-bold">Reset room access for an academic year</h3>
   <p className="text-sm text-slate-600 dark:text-blue-100">This ends every current resident allocation in this residence and replaces every room key. Verified identities, other portals and history are retained. Residents must activate again with the new keys.</p>
   <label className="block text-sm font-semibold">Academic year<input disabled={busy} value={year} onChange={e=>{setYear(e.target.value);setPreview(null);setConfirmation('');setError('');}} maxLength={9} className="mt-2 min-h-11 w-full rounded-xl border border-blue-200 bg-transparent px-3 py-2 dark:border-blue-800"/></label>
   <button type="button" disabled={busy||!/^\d{4}\/\d{4}$/.test(year)} onClick={()=>void run(async()=>{setPreview(await request(`/api/hostels/${encodeURIComponent(residenceId)}/room-key-reset-preview?academicYear=${encodeURIComponent(year)}`));})} className="min-h-11 rounded-xl border border-blue-300 px-4 py-3 text-sm font-semibold disabled:opacity-50">{busy?'Checking…':'Preview exact reset'}</button>
   {preview&&<div className="space-y-2 rounded-xl bg-blue-50 p-4 text-sm text-blue-950 dark:bg-blue-950 dark:text-blue-100">
    <strong className="block">{preview.residenceName}</strong>
    {preview.alreadyCompleted?<p role="status">{preview.receipt?.message}</p>:<p>{preview.rooms} rooms; {preview.occupants} current resident allocations will end.</p>}
    {preview.previousAcademicYear&&<p>Last completed reset: {preview.previousAcademicYear}</p>}
   </div>}
   {preview&&!preview.alreadyCompleted&&<label className="block text-sm font-semibold">Type RESET ROOM ACCESS to confirm<input disabled={busy} autoComplete="off" value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-blue-200 bg-transparent px-3 py-2 dark:border-blue-800"/></label>}
   {error&&<p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
   <div className="flex flex-wrap justify-end gap-3">
    <button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border border-blue-200 px-4 py-3 text-sm font-semibold dark:border-blue-800">Cancel</button>
    {preview&&!preview.alreadyCompleted&&<button type="button" disabled={busy||confirmation!=='RESET ROOM ACCESS'} onClick={()=>void run(async()=>{
     const result=await request(`/api/hostels/${encodeURIComponent(residenceId)}/reshuffle-room-keys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirm:confirmation,academicYear:preview.academicYear,fingerprint:preview.fingerprint})});
     // Retain the committed receipt if a follow-up refresh is slow or fails.
     setPreview({...preview,alreadyCompleted:true,receipt:{message:result.message}});setConfirmation('');
     const completedScope=current.current;await onComplete(result.message);if(mounted.current&&current.current===completedScope)onClose();
    })} className="min-h-11 rounded-xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{busy?'Resetting…':'Reset keys and end occupancy'}</button>}
   </div>
  </div>
 </DashboardOverlay>;
}
