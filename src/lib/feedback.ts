export type FeedbackKind = 'error' | 'warning' | 'info' | 'success';
export type Feedback = { container: HTMLElement; message: string; kind: FeedbackKind; floating?: boolean; field?: HTMLElement | null };

/** Route known field failures explicitly; keep non-field service failures by
 * the form action rather than guessing that a random input caused them. */
export function reportFormFieldError(container: HTMLElement | null, label: string | null, message: string) {
  if (!container?.isConnected) return;
  const field = label ? [...container.querySelectorAll<HTMLElement>('input,select,textarea,[data-feedback-field]')]
    .find(element => element.getAttribute('aria-label') === label || element.dataset.feedbackField === label) : null;
  window.dispatchEvent(new CustomEvent<Feedback>('pinevela-form-feedback', {detail:{container,message,kind:'error',field}}));
}

export function feedbackField(container: HTMLElement | null, message: string): HTMLElement | null {
  if (!container) return null;
  const aliases = [
    [/\b(photo|photograph|image|picture|jpeg|png|webp)\b/i, /photo|photograph|image|picture|cover/i],
    [/\b(phone|calling code|whatsapp|call line)\b/i, /phone|whatsapp|call line/i],
    [/\b(stock|quantity)\b/i, /stock|quantity/i],
    [/\b(starting rate|price|amount)\b/i, /price|rate|amount/i],
    [/\b(title)\b/i, /title/i], [/\b(description)\b/i, /description/i],
    [/\b(username)\b/i, /username/i], [/\b(password)\b/i, /password/i],
    [/\b(email)\b/i, /email/i], [/\b(location|map pin)\b/i, /location|map pin/i],
  ] as const;
  const controls = [...container.querySelectorAll<HTMLInputElement>('input,select,textarea')].filter(e=>e.type!=='hidden');
  for (const [problem, label] of aliases) if (problem.test(message)) {
    const candidates = controls.filter(e => label.test([e.getAttribute('aria-label'), e.id, e.name, ...[...(e.labels || [])].map(l=>l.textContent)].join(' ')));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
}

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
  window.dispatchEvent(new CustomEvent<Feedback>('pinevela-form-feedback', { detail: { container, message, kind, field:kind==='error'?feedbackField(container,message):null } }));
  return true;
}
export function reportActionFailure(message: string, container: HTMLElement | null) {
  if (routePopupFeedback(message, 'error')) return;
  if (container) window.dispatchEvent(new CustomEvent<Feedback>('pinevela-form-feedback', { detail: { container, message: `Change failed: ${message}`, kind: 'error', floating: true } }));
}
export function clearFormFeedback(container?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent('pinevela-clear-feedback', { detail: container }));
}
