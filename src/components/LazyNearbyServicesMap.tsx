import { lazy, Suspense, type ComponentProps } from 'react';
import DashboardOverlay from './DashboardOverlay';

const ServicesMap = lazy(() => import('./NearbyServicesMap'));

export default function LazyNearbyServicesMap(props: ComponentProps<typeof ServicesMap>) {
  return <Suspense fallback={<DashboardOverlay aria-label="Services near you" onClose={props.onClose} className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-4">
    <div className="space-y-4 rounded-2xl border border-blue-200 bg-white p-6 text-slate-900">
      <p role="status">Loading services map…</p>
      <button type="button" onClick={props.onClose} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Close services map</button>
    </div>
  </DashboardOverlay>}><ServicesMap {...props} /></Suspense>;
}
