import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { flushSync } from 'react-dom';

type Mode = 'login' | 'register';
type Flip = { from: Mode; to: Mode; committed: boolean; done: boolean; animations: Animation[]; settle: (commit?: boolean, restoreFocus?: boolean) => void };

/** One live form: change its contents at the edge of a short, reversible flip. */
export function useAuthCardFlip(cardRef: RefObject<HTMLDivElement | null>, mode: Mode, onChange: (mode: Mode) => void) {
  const running = useRef<Flip | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; running.current?.settle(false, false); };
  }, []);

  useLayoutEffect(() => {
    const flip = running.current;
    // A route-driven mode change wins over a transition already in progress.
    if (flip && mode !== (flip.committed ? flip.to : flip.from)) flip.settle(false, false);
  }, [mode]);

  return useCallback((next: Mode) => {
    const card = cardRef.current;
    if (next === mode || running.current) return;
    const preference = window.matchMedia('(prefers-reduced-motion: reduce), (forced-colors: active)');
    if (!card || !card.animate || preference.matches || document.hidden) { onChange(next); return; }

    const height = card.offsetHeight;
    const direction = next === 'register' ? -1 : 1;
    const focusWasInside = card.contains(document.activeElement);
    const flip: Flip = { from: mode, to: next, committed: false, done: false, animations: [], settle: () => {} };
    const interrupt = () => flip.settle(true);
    const hidden = () => { if (document.hidden) interrupt(); };
    flip.settle = (commit = false, restoreFocus = true) => {
      if (flip.done) return;
      flip.done = true;
      if (commit && !flip.committed && mounted.current) {
        flip.committed = true;
        flushSync(() => onChange(next));
      }
      flip.animations.forEach(animation => animation.cancel());
      card.inert = false;
      card.removeAttribute('data-card-flip');
      card.removeAttribute('aria-busy');
      preference.removeEventListener('change', interrupt);
      window.removeEventListener('resize', interrupt);
      document.removeEventListener('visibilitychange', hidden);
      running.current = null;
      if (restoreFocus && focusWasInside && mounted.current && !document.hidden &&
          (document.activeElement === document.body || card.contains(document.activeElement))) {
        card.querySelector<HTMLElement>('.login-mode-toggle button[aria-pressed="true"]')?.focus({ preventScroll: true });
      }
    };
    running.current = flip;
    card.inert = true;
    card.setAttribute('data-card-flip', 'out');
    card.setAttribute('aria-busy', 'true');
    preference.addEventListener('change', interrupt);
    window.addEventListener('resize', interrupt, { passive: true });
    document.addEventListener('visibilitychange', hidden);
    const turn = (degrees: number) => `perspective(1600px) rotateY(${degrees}deg)`;
    const startTime = document.timeline.currentTime;

    void (async () => {
      try {
        const outgoing = card.animate([{ transform: turn(0) }, { transform: turn(direction * 90) }],
          { duration: 105, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' });
        if (typeof startTime === 'number') outgoing.startTime = startTime;
        flip.animations.push(outgoing);
        await outgoing.finished;
        if (flip.done || !mounted.current) return;
        flip.committed = true;
        flushSync(() => onChange(next));
        const nextHeight = card.offsetHeight;
        card.setAttribute('data-card-flip', 'in');
        const incoming = card.animate([
          { transform: turn(-direction * 90), height: `${height}px` },
          { transform: turn(0), height: `${nextHeight}px` },
        ], { duration: 145, easing: 'cubic-bezier(0, 0, .2, 1)', fill: 'both' });
        // Both halves share one clock; rendering a longer form adds no pause.
        if (typeof startTime === 'number') incoming.startTime = startTime + 105;
        flip.animations.push(incoming);
        outgoing.cancel();
        await incoming.finished;
        flip.settle();
      } catch {
        // Cancellation, preference changes and unmounting must never strand a card.
        if (!flip.done) flip.settle(true);
      }
    })();
  }, [cardRef, mode, onChange]);
}
