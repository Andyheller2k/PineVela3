export type FeedbackKind = 'error' | 'warning' | 'info' | 'success';
export type Feedback = { container: HTMLElement; message: string; kind: FeedbackKind; floating?: boolean };

function popupCard(): HTMLElement | undefined {
  // Native dialogs render in the browser top layer, above ordinary fixed overlays.
  const dialogs = [...document.querySelectorAll<HTMLDialogElement>('dialog[open]')].filter(element => element.getClientRects().length > 0);
  const dialog = dialogs.at(-1);
  if (dialog) return dialog.querySelector<HTMLElement>('form') || dialog.querySelector<HTMLElement>('[data-popup-card]') || dialog.firstElementChild as HTMLElement;
  return [...document.querySelectorAll<HTMLElement>('[data-popup-card]')].filter(element => element.getClientRects().length > 0).at(-1);
}
export function routePopupFeedback(message: string, kind: FeedbackKind = 'error'): boolean {
  const container = popupCard();
  if (!container) return false;
  window.dispatchEvent(new CustomEvent<Feedback>('pinevela-form-feedback', { detail: { container, message, kind } }));
  return true;
}
export function reportActionFailure(message: string, container: HTMLElement | null) {
  if (routePopupFeedback(message, 'error')) return;
  if (container) window.dispatchEvent(new CustomEvent<Feedback>('pinevela-form-feedback', { detail: { container, message: `Change failed: ${message}`, kind: 'error', floating: true } }));
}
export function clearFormFeedback(container?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent('pinevela-clear-feedback', { detail: container }));
}
