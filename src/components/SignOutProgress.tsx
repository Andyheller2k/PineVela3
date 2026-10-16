import { LoaderCircle } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';

export default function SignOutProgress() {
  return <DashboardOverlay aria-label="Signing out" aria-busy="true" onClose={null}
    className="fixed inset-0 flex items-center justify-center bg-slate-950/60 p-6 backdrop-blur-sm">
    <div role="status" aria-label="Signing out" className="text-white">
      <LoaderCircle aria-hidden="true" className="h-12 w-12 animate-spin motion-reduce:animate-none" strokeWidth={2} />
    </div>
  </DashboardOverlay>;
}
