import { lazy, Suspense, type ComponentProps } from 'react';

const MapPicker = lazy(() => import('./CampusMeetupMapPicker'));

export default function LazyCampusMeetupMapPicker(props: ComponentProps<typeof MapPicker>) {
  return <Suspense fallback={<div className="space-y-4 rounded-2xl border border-blue-200 bg-white p-6 text-slate-900">
    <p role="status">Loading location map…</p>
    {props.onClose && <button type="button" onClick={props.onClose} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Close map</button>}
  </div>}><MapPicker {...props} /></Suspense>;
}
