import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { sessionFetch } from '../lib/session';

interface Settings { registrationFee: number; commission: number; announcement: string; maintenanceMode: boolean }
const PlatformSettingsContext = createContext<{ settings?: Settings }>({});
export const usePlatformSettings = () => useContext(PlatformSettingsContext);
export function PlatformSettingsProvider({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const { data, refetch } = useQuery<Settings>({ queryKey: ['settings'], refetchInterval: 5000, queryFn: async () => {
    const response = await sessionFetch('/api/settings');
    if (!response.ok) throw new Error('Platform settings could not load.');
    return response.json();
  } });
  useEffect(() => { if (data) setBlocked(data.maintenanceMode); }, [data]);
  useEffect(() => {
    const onMaintenance = () => { setBlocked(true); void refetch(); };
    window.addEventListener('pinevela-maintenance', onMaintenance);
    return () => window.removeEventListener('pinevela-maintenance', onMaintenance);
  }, [refetch]);
  return <PlatformSettingsContext.Provider value={{ settings: data ? { ...data, maintenanceMode: blocked || data.maintenanceMode } : blocked ? { registrationFee: 0, commission: 0, announcement: '', maintenanceMode: true } : undefined }}>{children}</PlatformSettingsContext.Provider>;
}
export function PlatformAccessBoundary({ children }: { children: React.ReactNode }) {
  const { user } = useAuth(), { settings } = usePlatformSettings(), location = useLocation();
  const adminEntry = location.pathname === '/login' || location.pathname === '/admin-invitation';
  if (settings?.maintenanceMode && user?.role !== 'admin' && !adminEntry && location.pathname !== '/') return <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-gradient-to-br from-sky-50 to-blue-100 p-6 text-center text-blue-950">
    <h1 className="text-2xl font-bold">PineVela is undergoing maintenance</h1>
    <p>Non-admin accounts are temporarily restricted during database updates. Access will return automatically when maintenance ends.</p>
    <Link to="/login" className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Administrator sign in</Link>
  </main>;
  return <>
    {settings?.maintenanceMode && location.pathname === '/' && <aside role="status" className="fixed bottom-5 left-1/2 z-[60] w-[min(42rem,calc(100%_-_2rem))] -translate-x-1/2 rounded-2xl bg-blue-950 px-5 py-3 text-sm text-white">Temporary maintenance: non-admin accounts are restricted during database updates.</aside>}{children}</>;
}
