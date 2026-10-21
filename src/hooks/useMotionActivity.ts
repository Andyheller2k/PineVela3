import { useEffect, type RefObject } from 'react';

/** Ambient motion runs only for a visible scene with no motion restriction. */
export function useMotionActivity<T extends Element>(ref: RefObject<T | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const forced = window.matchMedia('(forced-colors: active)');
    let intersecting = !('IntersectionObserver' in window);
    const sync = () => element.setAttribute('data-motion-active', String(intersecting && !document.hidden && !reduced.matches && !forced.matches));
    const observer = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
      intersecting = entry.isIntersecting;
      sync();
    }) : undefined;
    // Observe the HTML frame of a root SVG. Its CSS frame is the artwork's
    // viewport; SVG graphical bounds can change while masks/images are loading.
    const target = element instanceof SVGSVGElement ? element.parentElement || element : element;
    observer?.observe(target);
    sync();
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    forced.addEventListener('change', sync);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      forced.removeEventListener('change', sync);
      element.removeAttribute('data-motion-active');
    };
  }, [ref]);
}
