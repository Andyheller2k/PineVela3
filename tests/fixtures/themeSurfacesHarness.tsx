/** Actual presentation components with synthetic context inputs. No real auth,
 * account changes, form submissions or external APIs are used by this fixture. */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import * as progress from '../../src/components/OnboardingProgress';
import OnboardingProgress from '../../src/components/OnboardingProgress';
import OrderNotifications from '../../src/components/OrderNotifications';
import WelcomePopup from '../../src/components/WelcomePopup';
import LogoutConfirmationModal from '../../src/components/LogoutConfirmationModal';
import AdminMessageNotice from '../../src/components/AdminMessageNotice';
import MaintenanceReturnNotice from '../../src/components/MaintenanceReturnNotice';
import AccountAccessNotice from '../../src/components/AccountAccessNotice';
import VerifiedAccountEnrollment from '../../src/components/VerifiedAccountEnrollment';
import SessionRestorationNotice from '../../src/components/SessionRestorationNotice';

const host = window as any;
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const steps = Object.entries(progress).filter(([name]) => name.endsWith('_STEPS')) as Array<[string, progress.OnboardingStep[]]>;
const root = createRoot(document.getElementById('root')!);
let select: (name: string) => void;
let themeControl: ReturnType<typeof useTheme>;
function App() {
  const [scene, setScene] = useState('onboardings');
  themeControl = useTheme(); select = setScene;
  host.themeSurfaceHarness.ready = true;
  return <main className="page-canvas min-h-screen p-4 sm:p-8 text-slate-900" data-surface-scene={scene}>
    {scene === 'onboardings' && <div className="space-y-4">{steps.flatMap(([name, list]) => list.map((_, index) =>
      <OnboardingProgress key={`${name}:${index}`} label={`${name}:${index + 1}`} steps={list} step={index + 1} />))}</div>}
    {scene === 'notifications' && <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-slate-900"><h2>Order updates</h2><OrderNotifications orderId="theme-fixture-order" /></section>}
    {scene === 'welcome' && <WelcomePopup onClose={() => setScene('onboardings')} />}
    {scene === 'logout' && <LogoutConfirmationModal isOpen onClose={() => setScene('onboardings')} onConfirm={() => { throw Error('This visual harness cannot sign out an account.'); }} userName="Visual fixture" />}
    {scene === 'admin-message' && <AdminMessageNotice />}
    {scene === 'maintenance' && <MaintenanceReturnNotice />}
    {scene === 'restriction' && <AccountAccessNotice />}
    {scene.startsWith('enrollment-') && <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 text-slate-900" data-enrollment-fixture>
      <VerifiedAccountEnrollment key={scene} kind={scene.slice(11) as 'resident' | 'seller' | 'manager'} onVerified={async () => { throw Error('This visual harness cannot complete enrollment.'); }} />
    </section>}
    {scene === 'restoration' && <SessionRestorationNotice />}
  </main>;
}
host.themeSurfaceHarness = {
  ready: false,
  show: (scene: string) => select(scene),
  choose: (theme: 'light' | 'dark' | 'system') => themeControl.setPreference(theme),
  restrict: () => window.dispatchEvent(new CustomEvent('pinevela-account-access', { detail: {
    accountRestricted: true, accountAccess: { reason: 'Read-only theme fixture.', restrictions: [] },
  } })),
  onboardingPhases: steps.reduce((total, [, list]) => total + list.length, 0),
  unmount: () => { root.unmount(); client.clear(); },
};
root.render(<MemoryRouter initialEntries={['/user/dashboard']}><QueryClientProvider client={client}>
  <ThemeProvider><App /></ThemeProvider>
</QueryClientProvider></MemoryRouter>);
