/** One foreground-only refresh timer replaces the browser EventSource.
 * Native HTTP responses are bounded, so a long-lived SSE request cannot occupy
 * the serialized private session transport or keep a background radio active. */
export function startForegroundRefresh(refresh: () => void) {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    clearTimeout(timer); timer = undefined;
    if (disposed || document.hidden || !navigator.onLine) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed && !document.hidden && navigator.onLine) refresh();
      schedule();
    }, 60000);
  };
  const resume = () => {
    if (!disposed && !document.hidden && navigator.onLine) refresh();
    schedule();
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('online', resume);
  window.addEventListener('offline', schedule);
  schedule();
  return () => {
    disposed = true; clearTimeout(timer);
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('online', resume);
    window.removeEventListener('offline', schedule);
  };
}
