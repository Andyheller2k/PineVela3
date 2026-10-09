import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export default function PublicCatalogRail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ previous: false, next: false });
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const update = () => {
      const previous = element.scrollLeft > 2;
      const next = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
      setEdges(current => current.previous === previous && current.next === next ? current : { previous, next });
    };
    const resize = new ResizeObserver(update);
    resize.observe(element);
    for (const child of element.children) resize.observe(child);
    element.addEventListener('scroll', update, { passive: true });
    update();
    return () => { resize.disconnect(); element.removeEventListener('scroll', update); };
  }, [children]);
  const move = (direction: number) => {
    const element = track.current;
    if (!element) return;
    const max = element.scrollWidth - element.clientWidth;
    const first = element.firstElementChild as HTMLElement | null;
    const step = (first?.offsetWidth || element.clientWidth) + (parseFloat(getComputedStyle(element).columnGap) || 0);
    const positions = [0, ...Array.from(element.children, child => Math.min(max, (child as HTMLElement).offsetLeft - (first?.offsetLeft || 0))), max];
    // Align to card boundaries and move a full card from a clipped position.
    const next = direction > 0 ? positions.find(left => left >= element.scrollLeft + step - 2)
      : positions.reverse().find(left => left <= element.scrollLeft - step + 2);
    element.scrollTo({ left: next ?? (direction > 0 ? max : 0),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  return <div className="public-catalog-rail" data-public-catalog-rail data-can-previous={edges.previous} data-can-next={edges.next}>
    <div ref={track} className="public-catalog-track" role="region" aria-label={`${label} listings`} tabIndex={0}
      onKeyDown={event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); move(event.key === 'ArrowLeft' ? -1 : 1); }
        else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          track.current?.scrollTo({ left: event.key === 'Home' ? 0 : track.current.scrollWidth,
            behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
        }
      }}>
      {children}
    </div>
    {(edges.previous || edges.next) && <div className="public-catalog-controls">
      <button type="button" aria-label={`Previous ${label} listings`} disabled={!edges.previous} onClick={() => move(-1)}><ChevronLeft size={18} aria-hidden="true" /></button>
      <button type="button" aria-label={`Next ${label} listings`} disabled={!edges.next} onClick={() => move(1)}><ChevronRight size={18} aria-hidden="true" /></button>
    </div>}
  </div>;
}
