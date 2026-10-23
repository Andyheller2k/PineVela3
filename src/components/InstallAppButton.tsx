import { useState } from 'react';
import { Download, EllipsisVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { useInstalledAppMode } from '../lib/appMode';
import { isAppleMobileDevice, requestPwaInstall, usePwaInstall } from '../lib/pwaInstall';
import DashboardOverlay from './DashboardOverlay';
import '../installApp.css';

export default function InstallAppButton() {
  const appMode = useInstalledAppMode();
  const { installed } = usePwaInstall();
  const [instructions, setInstructions] = useState(false);
  const [busy, setBusy] = useState(false);
  if (appMode || installed) return null;
  const apple = typeof navigator !== 'undefined' && isAppleMobileDevice(navigator);

  async function install() {
    if (apple) { setInstructions(true); return; }
    setBusy(true);
    try {
      const outcome = await requestPwaInstall();
      if (outcome === 'unavailable') setInstructions(true);
    } catch {
      setInstructions(true);
    } finally { setBusy(false); }
  }

  return <>
    <button type="button" className="pv-install-button" disabled={busy} onClick={install}>
      <Download size={15} aria-hidden="true" />
      <span>{busy ? 'Opening…' : 'Install app'}</span>
    </button>
    {instructions && <DashboardOverlay aria-label="Install PineVela" onClose={() => setInstructions(false)} className="pv-install-overlay">
      <section className="pv-install-card" aria-labelledby="pv-install-heading">
        <button type="button" className="pv-install-close" onClick={() => setInstructions(false)} aria-label="Close installation instructions"><X size={20} /></button>
        <div className="pv-install-app-icon"><img src="/icons/pinevela-192.png" alt="" width="64" height="64" /></div>
        <p className="pv-install-eyebrow">PINEVELA, ONE TAP AWAY</p>
        <h2 id="pv-install-heading">Install PineVela</h2>
        <p className="pv-install-intro">Add PineVela to your home screen and open straight to sign in.</p>
        <ol className="pv-install-steps">
          {apple ? <>
            <li><span className="pv-install-step-icon"><Share size={19} aria-hidden="true" /></span><span>Open this website in <strong>Safari</strong> and tap <strong>Share</strong>. You may find it in the page menu.</span></li>
            <li><span className="pv-install-step-icon"><PlusSquare size={19} aria-hidden="true" /></span><span>Choose <strong>Add to Home Screen</strong>.</span></li>
            <li><span className="pv-install-step-icon"><Smartphone size={19} aria-hidden="true" /></span><span>If shown, turn on <strong>Open as Web App</strong>, then tap <strong>Add</strong>.</span></li>
          </> : <>
            <li><span className="pv-install-step-icon"><EllipsisVertical size={19} aria-hidden="true" /></span><span>Open this website in <strong>Chrome</strong> and tap the <strong>three-dot menu</strong>.</span></li>
            <li><span className="pv-install-step-icon"><PlusSquare size={19} aria-hidden="true" /></span><span>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</span></li>
            <li><span className="pv-install-step-icon"><Smartphone size={19} aria-hidden="true" /></span><span>Confirm installation, then open <strong>PineVela</strong> from your home screen.</span></li>
          </>}
        </ol>
        <p className="pv-install-note">An internet connection is needed to sign in and use PineVela.</p>
        <button type="button" className="pv-install-done" onClick={() => setInstructions(false)}>Got it</button>
      </section>
    </DashboardOverlay>}
  </>;
}
