import { useRef, type SyntheticEvent } from 'react';
import { clearFormFeedback, reportActionFailure } from './feedback';

export function useActionFeedback() {
  const origin = useRef<HTMLElement | null>(null);
  const capture = (event: SyntheticEvent<HTMLElement>) => {
    const element = event.target as HTMLElement;
    origin.current = element.closest<HTMLElement>('form, article, [data-admin-change], div[class*="rounded"]') || event.currentTarget;
  };
  const begin = () => { const container = origin.current; clearFormFeedback(container); return container; };
  return { capture, begin, fail: reportActionFailure };
}
