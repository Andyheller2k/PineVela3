import { useLayoutEffect, useRef, type ComponentPropsWithoutRef } from 'react';
import { createPortal } from 'react-dom';

type DashboardOverlayProps = Omit<ComponentPropsWithoutRef<'dialog'>, 'onClose'> & {
  layer?: number;
  /** null is reserved for required flows that have no existing cancel action. */
  onClose: (() => void) | null;
  'aria-label': string;
};

const activeDialogs = new Set<HTMLDialogElement>();
let previousBodyOverflow = '';
const focusableSelector = 'a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]';

/** Native top-layer modals keep the dashboard and its navigation inert. */
export default function DashboardOverlay({ children, layer = 100, style, onClose, onKeyDown, ...props }: DashboardOverlayProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useLayoutEffect(() => {
    const element = dialog.current!;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (activeDialogs.size === 0) {
      previousBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeDialogs.add(element);
    element.showModal();
    // Start at the named dialog, rather than an arbitrary (possibly destructive) action.
    element.focus({ preventScroll: true });
    return () => {
      element.close();
      activeDialogs.delete(element);
      if (activeDialogs.size === 0) document.body.style.overflow = previousBodyOverflow;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog
      {...props}
      ref={dialog}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      style={{ margin: 0, width: '100%', height: '100%', maxWidth: 'none', maxHeight: 'none', border: 0, ...style, zIndex: layer }}
      data-dashboard-overlay=""
      onCancel={event => {
        // Cancelling an input's native file picker bubbles through the dialog.
        // Only an actual request to cancel this dialog should dismiss its form.
        if (event.target !== event.currentTarget) return;
        event.preventDefault(); event.stopPropagation(); onClose?.();
      }}
      onKeyDown={event => {
        // React portals bubble through their owner; only the top dialog handles keys.
        event.stopPropagation();
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === 'Escape') { event.preventDefault(); onClose?.(); return; }
        if (event.key !== 'Tab') return;
        const element = dialog.current!;
        const controls = [...element.querySelectorAll<HTMLElement>(focusableSelector)].filter(control =>
          control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert]') &&
          control.getClientRects().length > 0 && getComputedStyle(control).visibility !== 'hidden');
        const first = controls[0], last = controls[controls.length - 1];
        if (!first) { event.preventDefault(); element.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) {
          event.preventDefault(); first.focus();
        }
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}
