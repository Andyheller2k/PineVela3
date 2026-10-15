import {useEffect} from 'react';
import {Link,useSearchParams} from 'react-router-dom';

/** This popup message is only a reload hint. The parent rechecks the actual
 * owned enrollment before submitting anything; it is never verification proof. */
export default function ManagerGoogleResult(){
  const [params]=useSearchParams(),verified=params.get('result')==='verified',enrollmentId=params.get('enrollment');
  useEffect(()=>{
    if(window.opener){window.opener.postMessage({type:'pinevela-manager-google-result',verified,enrollmentId},location.origin);window.close();}
  },[verified,enrollmentId]);
  return <main className="mx-auto max-w-lg space-y-4 p-8 text-[var(--pv-text)]"><h1 className="text-2xl font-bold">{verified?'Google account verified':'Google verification did not complete'}</h1><p>Return to your manager registration to check its saved status.</p><Link to="/register-manager" className="inline-flex min-h-11 items-center rounded-xl bg-blue-700 px-5 text-white">Return to manager registration</Link></main>;
}
