import { useEffect, useRef, type MouseEvent, type PointerEvent } from 'react';

/** Keep touch scrolling native, and cancel delayed activation when a gesture moves. */
export function useCardActivation(onActivate: () => void) {
  const activate = useRef(onActivate);
  activate.current = onActivate;
  const gesture = useRef({ x: 0, y: 0, touch: false, cancelled: false });
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = () => {
    gesture.current.cancelled = true;
    if (pending.current !== null) clearTimeout(pending.current);
    pending.current = null;
  };

  useEffect(() => {
    window.addEventListener('scroll', cancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('scroll', cancel, true);
      if (pending.current !== null) clearTimeout(pending.current);
    };
  }, []);

  return {
    onPointerDown: (event: PointerEvent) => {
      cancel();
      gesture.current = { x: event.clientX, y: event.clientY, touch: event.pointerType !== 'mouse', cancelled: false };
    },
    onPointerMove: (event: PointerEvent) => {
      if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 10) cancel();
    },
    onPointerCancel: cancel,
    onClick: (event: MouseEvent) => {
      if (event.detail === 0) {
        cancel();
        activate.current();
      } else if (!gesture.current.cancelled) {
        if (gesture.current.touch) {
          if (pending.current !== null) clearTimeout(pending.current);
          pending.current = setTimeout(() => {
            pending.current = null;
            activate.current();
          }, 140);
        } else activate.current();
      }
    },
  };
}
