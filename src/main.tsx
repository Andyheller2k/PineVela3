import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {registerServiceWorker} from './lib/registerServiceWorker';
import {installMobileViewport} from './lib/mobileViewport';
import './lib/pwaInstall';
import './index.css';
import './publicPages.css';
import './ux.css';
import './mobileViewport.css';
import './publicAppearance.css';

installMobileViewport();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

registerServiceWorker();
