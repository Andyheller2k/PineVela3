import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { usePlatformSettings } from '../context/PlatformSettingsContext';
import { appLaunch } from '../lib/appLaunch';

/** Own the initial HTML splash only; route loading never creates another one. */
export default function AppLaunchLoader() {
  const { loading, restorationError, user } = useAuth();
  const { settings } = usePlatformSettings();
  useEffect(() => {
    if (!loading) appLaunch.authReady();
    // The splash must not cover an actionable connection/maintenance notice.
    if (restorationError || (settings?.maintenanceMode && user?.role !== 'admin')) {
      appLaunch.recoveryVisible();
    }
  }, [loading, restorationError, settings?.maintenanceMode, user?.role]);
  return null;
}

/** Inside Suspense: this commits only after the initial route chunk resolves. */
export function AppLaunchReady() {
  const { loading } = useAuth();
  useEffect(() => {
    // Some guards live inside PageWrapper. Their loading view is not the
    // destination route; wait for its post-auth Suspense commit instead.
    if (!loading) appLaunch.routeReady();
  }, [loading]);
  return null;
}
