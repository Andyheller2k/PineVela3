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
    const restore = new Map<HTMLDivElement, () => void>();
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<Feedback>).detail;
      if (!detail.container.isConnected) return;
      const field = detail.field?.isConnected && detail.container.contains(detail.field) ? detail.field : null;
      let slot = [...slots].find(s => s.isConnected && s.dataset.feedbackTarget === (field?.id || '') && s.parentElement && detail.container.contains(s));
      if (!slot || (field && !field.id)) {
        slot = document.createElement('div'); slot.dataset.formFeedback = ''; slot.className = 'col-span-full shrink-0 mt-1.5'; slot.dataset.feedbackKey = String(++sequence);
        slot.id = `pinevela-feedback-${sequence}`;
        if (field) {
          if (!field.id) field.id = `pinevela-field-${sequence}`;
          slot.dataset.feedbackTarget = field.id;
          const anchor = field.matches('input[type="file"]') ? field.closest('label') || field : field;
          anchor.after(slot);
          const described = field.getAttribute('aria-describedby'), invalid = field.getAttribute('aria-invalid');
          field.setAttribute('aria-describedby', [described, slot.id].filter(Boolean).join(' ')); field.setAttribute('aria-invalid', 'true');
          restore.set(slot, () => {
            if (described === null) field.removeAttribute('aria-describedby'); else field.setAttribute('aria-describedby', described);
            if (invalid === null) field.removeAttribute('aria-invalid'); else field.setAttribute('aria-invalid', invalid);
          });
        } else {
          // Non-field failures (network, checkout, plan limits) belong near the
          // action. They must not cover fields or the top of a scrolling card.
          const action = detail.container.querySelector('button[type="submit"], [data-feedback-action]');
          if (action) action.before(slot); else detail.container.append(slot);
        }
        slots.add(slot);
      }
      setEntries(previous => [...previous.filter(entry => entry.slot !== slot), { ...detail, field, slot }]);
      if (!detail.floating) requestAnimationFrame(() => { if (slot?.isConnected) slot.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
    };
    const clear = (event: Event) => {
      const container = (event as CustomEvent<HTMLElement | null>).detail;
      for (const slot of slots) if (!container || container.contains(slot)) { restore.get(slot)?.(); restore.delete(slot); slot.remove(); slots.delete(slot); }
      setEntries(previous => previous.filter(entry => container && entry.container !== container));
    };
    const edited = (event: Event) => {
      if (!(event.target instanceof HTMLElement)) return;
      const field = event.target;
      for (const slot of slots) if (slot.dataset.feedbackTarget === field.id && field.id) {
        restore.get(slot)?.(); restore.delete(slot); slot.remove(); slots.delete(slot);
        setEntries(previous => previous.filter(entry => entry.slot !== slot));
      }
    };
    const observer = new MutationObserver(() => {
      for(const slot of slots)if(!slot.isConnected){restore.get(slot)?.();restore.delete(slot);slots.delete(slot);}
      setEntries(previous => previous.some(entry => !entry.slot.isConnected) ? previous.filter(entry => entry.slot.isConnected) : previous);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('pinevela-form-feedback', receive);
    window.addEventListener('pinevela-clear-feedback', clear);
    document.addEventListener('input',edited); document.addEventListener('change',edited);
    return () => { observer.disconnect(); window.removeEventListener('pinevela-form-feedback', receive); window.removeEventListener('pinevela-clear-feedback', clear); document.removeEventListener('input',edited); document.removeEventListener('change',edited); slots.forEach(slot => {restore.get(slot)?.();slot.remove();}); };
  }, []);
  const latest = entries.filter(entry => entry.floating).at(-1);
  return <>{entries.map(entry => createPortal(<p role={entry.kind === 'error' || entry.kind === 'warning' ? 'alert' : 'status'} className={`mb-2 rounded-xl border p-2.5 text-xs leading-relaxed break-words ${entry.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{entry.message}</p>, entry.slot, entry.slot.dataset.feedbackKey))}
    {latest && createPortal(<div role="alert" className="fixed top-4 left-1/2 z-[9999] flex w-[min(36rem,calc(100%_-_2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 shadow-xl"><span className="flex-1">{latest.message}</span><button aria-label="Dismiss error notification" onClick={() => setEntries(previous => previous.map(entry => entry === latest ? { ...entry, floating: false } : entry))}><X size={18} /></button></div>, document.body)}
  </>;
}
