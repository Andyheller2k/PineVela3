import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { Feedback } from '../lib/feedback';

/** Feedback stays with its originating card; closing that card discards its errors. */
export default function FormFeedback() {
  const [entries, setEntries] = useState<(Feedback & { slot: HTMLDivElement })[]>([]);
  useEffect(() => {
    const slots = new Set<HTMLDivElement>();
    let sequence = 0;
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Feedback>).detail;
      if (!detail.container.isConnected) return;
      let slot = detail.container.querySelector<HTMLDivElement>(':scope > [data-form-feedback]');
      if (!slot) { slot = document.createElement('div'); slot.dataset.formFeedback = ''; slot.className = 'col-span-full shrink-0 sticky top-0 z-10'; slot.dataset.feedbackKey = String(++sequence); detail.floating ? detail.container.append(slot) : detail.container.prepend(slot); slots.add(slot); }
      setEntries(previous => [...previous.filter(entry => entry.container !== detail.container), { ...detail, slot }]);
      if (!detail.floating) requestAnimationFrame(() => { if (slot?.isConnected) slot.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
    };
    const clear = (event: Event) => {
      const container = (event as CustomEvent<HTMLElement | null>).detail;
      setEntries(previous => previous.filter(entry => container && entry.container !== container));
    };
    const observer = new MutationObserver(() => setEntries(previous => previous.some(entry => !entry.slot.isConnected) ? previous.filter(entry => entry.slot.isConnected) : previous));
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pinevela-form-feedback', receive);
    window.addEventListener('pinevela-clear-feedback', clear);
    return () => { observer.disconnect(); window.removeEventListener('pinevela-form-feedback', receive); window.removeEventListener('pinevela-clear-feedback', clear); slots.forEach(slot => slot.remove()); };
  }, []);
  const latest = entries.filter(entry => entry.floating).at(-1);
  return <>{entries.map(entry => createPortal(<p role={entry.kind === 'error' || entry.kind === 'warning' ? 'alert' : 'status'} className={`sticky top-0 z-10 mb-3 rounded-xl border p-3 text-sm break-words ${entry.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{entry.message}</p>, entry.slot, entry.slot.dataset.feedbackKey))}
    {latest && createPortal(<div role="alert" className="fixed top-4 left-1/2 z-[9999] flex w-[min(36rem,calc(100%_-_2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-xl"><span className="flex-1">{latest.message}</span><button aria-label="Dismiss error notification" onClick={() => setEntries(previous => previous.map(entry => entry === latest ? { ...entry, floating: false } : entry))}><X size={18} /></button></div>, document.body)}
  </>;
}
