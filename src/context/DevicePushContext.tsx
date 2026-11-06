import {createContext,useCallback,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {useAuth} from './AuthContext';
import {sessionFetch} from '../lib/session';
import {deviceNotificationPermission,devicePushPlatform,devicePushProofHeaders,localDevicePush,setDevicePushEnabled,subscribeDevicePush,supportsDevicePush,type DevicePushPreferences} from '../lib/devicePush';

type Config={web:boolean;android:boolean;vapidPublicKey:string|null};
type Account={contextId:string;kind:string;label:string;feedback:boolean}&DevicePushPreferences;
type State={config:Config|null;accounts:Account[];registered:boolean;otherAccounts:boolean;loading:boolean;busy:boolean;error:string;permission:string;enable:(p:DevicePushPreferences)=>Promise<void>};
const Context=createContext<State|null>(null);
export function useDevicePush(){const value=useContext(Context);if(!value)throw new Error('Device notification provider is unavailable.');return value;}
export function DevicePushProvider({children}:{children:ReactNode}){
  const {user}=useAuth();const [config,setConfig]=useState<Config|null>(null),[accounts,setAccounts]=useState<Account[]>([]),[registered,setRegistered]=useState(false);
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[permission,setPermission]=useState('prompt');
  const [otherAccounts,setOtherAccounts]=useState(false);
  const current=useRef(user?.id);current.current=user?.id;
  const read=useCallback(async(signal?:AbortSignal)=>{
    if(!user?.id)return;const id=user.id;
    const response=await sessionFetch('/api/device-push/config',{signal});
    if(!response.ok)throw new Error('Notification settings could not be loaded.');const config=await response.json() as Config;
    if(current.current!==id||signal?.aborted)return;
    const permission=await deviceNotificationPermission();if(current.current!==id||signal?.aborted)return;
    setConfig(config);setPermission(permission);
    if(!localDevicePush())return;
    const status=await sessionFetch('/api/device-push/status',{signal,headers:{...devicePushProofHeaders(),'X-PineVela-Profile-Context':id}});
    if(!status.ok)throw new Error('Notification settings could not be loaded.');const saved=await status.json();
    if(current.current!==id||signal?.aborted)return;setAccounts(saved.accounts||[]);setRegistered(Boolean(saved.registered));setOtherAccounts(Boolean(saved.otherAccounts));
    if(localDevicePush()?.enabled&&!saved.connected){
      // An independent login is never joined automatically. Its owner chooses
      // whether to keep their other verified logins or replace the connections.
      setDevicePushEnabled(false);return;
    }
    if(localDevicePush()?.enabled&&await deviceNotificationPermission()==='granted'&&config[devicePushPlatform()]){
      const own=saved.accounts?.find((a:Account)=>a.contextId===id);
      await subscribeDevicePush(config,{accountAlerts:own?.accountAlerts??true,marketplace:own?.marketplace??false,residences:own?.residences??false,keepExistingAccounts:true},id,false,signal);
      const refreshed=await sessionFetch('/api/device-push/status',{signal,headers:{...devicePushProofHeaders(),'X-PineVela-Profile-Context':id}});
      if(!refreshed.ok)throw new Error('Notification settings could not be loaded.');
      const connected=await refreshed.json();
      if(current.current===id&&!signal?.aborted){setRegistered(Boolean(connected.registered));setAccounts(connected.accounts||[]);}
    }
  },[user?.id]);
  useEffect(()=>{
    setAccounts([]);setRegistered(false);setOtherAccounts(false);setError('');setConfig(null);setBusy(false);setLoading(false);
    if(!user?.id||!supportsDevicePush())return;
    const controller=new AbortController();setLoading(true);
    read(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    const rotated=()=>{void read(controller.signal).catch(e=>{if(!controller.signal.aborted)setError(e.message);});};
    window.addEventListener('pinevela-push-token-changed',rotated);
    return()=>{controller.abort();window.removeEventListener('pinevela-push-token-changed',rotated);};
  },[read,user?.id]);
  const enable=async(preferences:DevicePushPreferences)=>{
    if(!user?.id||!config||busy)return;const id=user.id;setBusy(true);setError('');
    try{await subscribeDevicePush(config,preferences,id,true);if(current.current===id){setRegistered(true);setPermission('granted');await read();}}
    catch(e){if(current.current===id){setError(e instanceof Error?e.message:'Notifications could not be enabled.');setPermission(await deviceNotificationPermission());}}
    finally{if(current.current===id)setBusy(false);}
  };
  return <Context.Provider value={{config,accounts,registered,otherAccounts,loading,busy,error,permission,enable}}>{children}</Context.Provider>;
}
