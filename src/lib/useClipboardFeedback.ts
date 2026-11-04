import { useCallback, useEffect, useRef, useState } from 'react';

/** Only show a copied label after the browser confirms the clipboard write. */
export function useClipboardFeedback() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  const copy = useCallback(async (id: string, value: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(value);
      if (mounted.current) {
        if (resetTimer.current) clearTimeout(resetTimer.current);
        setCopiedId(id);
        resetTimer.current = setTimeout(() => {
          setCopiedId(current => current === id ? null : current);
          resetTimer.current = null;
        }, 2200);
      }
      return true;
    } catch {
      if (mounted.current) setCopiedId(current => current === id ? null : current);
      return false;
    }
  }, []);

  const reset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = null;
    if (mounted.current) setCopiedId(null);
  }, []);

  return { copiedId, copy, reset };
}
