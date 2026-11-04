import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import NativeApp from './NativeApp';
import App from '../App';
import { NATIVE_PREVIEW } from './environment';
import { installNativeTransport } from './bootstrap';
import { installMobileViewport } from '../lib/mobileViewport';
import { appLaunch } from '../lib/appLaunch';
import { installNativeStartup } from './startup';
import './policy.js';
import '../index.css';
import '../publicPages.css';
import '../ux.css';
import '../publicAppearance.css';
import '../mobileViewport.css';
import './fonts.css';
import './preview.css';

installNativeStartup();

function PreviewReady() {
  useEffect(() => { appLaunch.authReady(); appLaunch.routeReady(); }, []);
  return <NativeApp />;
}

// Install before rendering account providers so their first request
// uses the private native transport. No website worker or tag is installed.
async function start() {
  if (!NATIVE_PREVIEW) await installNativeTransport();
  installMobileViewport();
  createRoot(document.getElementById('root')!).render(<StrictMode>{NATIVE_PREVIEW ? <PreviewReady /> : <App />}</StrictMode>);
}
void start().catch(() => {
  const root = document.getElementById('root');
  if (root) root.textContent = 'PineVela could not start securely. Close the app and open it again.';
  appLaunch.recoveryVisible();
});
