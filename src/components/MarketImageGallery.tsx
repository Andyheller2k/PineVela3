import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import DashboardOverlay from './DashboardOverlay';

export default function MarketImageGallery({ imageUrl, additionalImages = [], title }:
  { imageUrl: string; additionalImages?: string[]; title: string }) {
  const images = [...new Set([imageUrl, ...additionalImages].filter(Boolean))];
  const [index, setIndex] = useState<number | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const step = (delta: number) => setIndex(i => i === null ? null : (i + delta + images.length) % images.length);
  useEffect(() => { setIndex(null); }, [imageUrl, title]);
  return <div className="space-y-2">
    <button type="button" aria-label={`Enlarge ${title}`} onClick={() => setIndex(0)} className="block h-44 sm:h-60 w-full overflow-hidden rounded-2xl border border-blue-100 bg-slate-50">
      <img src={imageUrl} alt={title} className="h-full w-full object-contain" decoding="async" />
    </button>
    {images.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Item photographs">{images.map((src, i) => <button key={src} type="button" aria-label={`Enlarge photograph ${i + 1} of ${title}`} onClick={() => setIndex(i)} className="h-16 w-16 overflow-hidden rounded-lg border border-blue-200"><img src={src} alt={`${title}, photograph ${i + 1}`} className="h-full w-full object-cover" loading="lazy" /></button>)}</div>}
    {index !== null && <DashboardOverlay layer={300} onClose={() => setIndex(null)} onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); } if (event.key === 'ArrowRight') { event.preventDefault(); step(1); } }} aria-label={`${title} photographs`} className="fixed inset-0 flex flex-col bg-slate-950/95 backdrop-blur-xl text-white">
      <div className="flex items-center justify-between gap-4 p-4"><p className="truncate text-sm">{title} · {index + 1} / {images.length}</p><button type="button" aria-label="Close photographs" onClick={() => setIndex(null)} className="rounded-full bg-white/10 p-3"><X className="h-6 w-6" /></button></div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-8" style={{ touchAction: 'pan-y' }} onTouchStart={e => { touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }} onTouchEnd={e => {
        if (!touchStart.current) return;
        const dx = e.changedTouches[0].clientX - touchStart.current.x, dy = e.changedTouches[0].clientY - touchStart.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1);
        touchStart.current = null;
      }}>
        <img src={images[index]} alt={`${title}, photograph ${index + 1}`} className="h-full w-full object-contain" />
        {images.length > 1 && <><button type="button" aria-label="Previous photograph" onClick={() => step(-1)} className="absolute left-3 rounded-full bg-black/50 p-3"><ChevronLeft /></button><button type="button" aria-label="Next photograph" onClick={() => step(1)} className="absolute right-3 rounded-full bg-black/50 p-3"><ChevronRight /></button></>}
      </div>
    </DashboardOverlay>}
  </div>;
}
