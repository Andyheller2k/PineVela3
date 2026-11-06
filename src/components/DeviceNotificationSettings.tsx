import {useEffect,useId,useState} from 'react';
import {Bell,Smartphone} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../context/AuthContext';
import {useDevicePush} from '../context/DevicePushContext';
import {devicePushPlatform,supportsDevicePush} from '../lib/devicePush';
import '../devicePush.css';

export default function DeviceNotificationSettings(){
  const {user}=useAuth(),push=useDevicePush();
  const headingId=useId();
  const [accountAlerts,setAccountAlerts]=useState(true),[marketplace,setMarketplace]=useState(false),[residences,setResidences]=useState(false);
  const [keepExistingAccounts,setKeepExistingAccounts]=useState(false);
  const own=push.accounts.find(a=>a.contextId===user?.id);
  useEffect(()=>{setAccountAlerts(own?.accountAlerts??true);setMarketplace(own?.marketplace??false);setResidences(own?.residences??false);},[own?.accountAlerts,own?.marketplace,own?.residences,user?.id]);
  const supported=supportsDevicePush(),configured=Boolean(push.config?.[devicePushPlatform()]);
  return <section className="pv-device-settings" aria-labelledby={headingId}>
    <div className="pv-device-heading"><Bell aria-hidden="true"/><div><h3 id={headingId}>Device notifications</h3><p>Account alerts on your phone or computer, even when PineVela is closed.</p></div></div>
    {!user?<p><Link to="/login?mode=login&next=%2Fnotification-settings">Sign in to enable notifications</Link>.</p>:<>
      <p className="pv-device-status" role="status"><Smartphone aria-hidden="true"/>{push.loading?'Checking notification delivery…':!supported?'Push notifications are unavailable in this browser.':push.registered?'Notifications are connected on this device.':push.permission==='denied'?'Notifications are blocked in device or browser settings.':configured?'Choose which alerts you want on this device.':'Device notification delivery is being configured.'}</p>
      <div className="pv-device-options">
        <label><input type="checkbox" checked={accountAlerts} onChange={e=>setAccountAlerts(e.target.checked)}/><span><strong>Account & maintenance alerts</strong><small>Updates already addressed to this account’s notification centre.</small></span></label>
        <label><input type="checkbox" checked={marketplace} onChange={e=>setMarketplace(e.target.checked)}/><span><strong>New marketplace listings</strong><small>Optional item and service updates, with a picture where supported.</small></span></label>
        <label><input type="checkbox" checked={residences} onChange={e=>setResidences(e.target.checked)}/><span><strong>New residences</strong><small>Optional alerts when an approved property becomes available.</small></span></label>
      </div>
      {push.otherAccounts&&<div className="pv-device-options"><p className="pv-device-note">This device already has connected accounts. Connecting this login replaces them unless you choose to keep your other accounts.</p><label><input type="checkbox" checked={keepExistingAccounts} onChange={e=>setKeepExistingAccounts(e.target.checked)}/><span><strong>Keep my other accounts connected</strong><small>Only keep accounts that belong to you on this device.</small></span></label></div>}
      <p className="pv-device-note">Each alert identifies its account. Sign in to each account to connect it on this device. Signing out stops all connected accounts’ alerts on this device.</p>
      {push.accounts.length>0&&<div className="pv-device-accounts" aria-label="Connected accounts">{push.accounts.map(a=><span key={a.contextId}>{a.label}{a.feedback?' · Feedback':''}</span>)}</div>}
      {push.error&&<p className="pv-device-error" role="alert">{push.error}</p>}
      <div className="pv-device-actions"><button type="button" className="pv-device-primary" disabled={!configured||!supported||push.busy||push.loading} onClick={()=>{void push.enable({accountAlerts,marketplace,residences,keepExistingAccounts:push.otherAccounts?keepExistingAccounts:true});}}>{push.busy?'Saving…':push.registered?'Save notification preferences':'Enable device notifications'}</button>
      </div>
      <p className="pv-device-note">Private alerts show a short summary. Passwords, approval keys, room keys, payment codes and encrypted messages stay inside the app. Pictures depend on device support.</p>
    </>}
  </section>;
}
