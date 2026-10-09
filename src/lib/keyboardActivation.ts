import type { KeyboardEvent } from 'react';

/** Give existing click surfaces the same Enter/Space behavior as a button. */
export function activateOnKeyboard(event: KeyboardEvent<HTMLElement>) {
  if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.click();
}
