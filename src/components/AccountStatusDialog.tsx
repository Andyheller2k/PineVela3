import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';

export default function AccountStatusDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <DashboardOverlay aria-label={title} onClose={onClose}
    className="fixed inset-0 flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 backdrop-blur-xl">
    <section className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        <button type="button" aria-label={`Close ${title}`} onClick={onClose}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 cursor-pointer">
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">{children}</div>
    </section>
  </DashboardOverlay>;
}
