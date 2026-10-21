import { useEffect, useMemo, useRef } from 'react';

interface Props {
  scopeKey: string;
  notifications: readonly { id: string; read?: boolean }[];
  onViewed: (id: string) => Promise<void>;
}

/** Observe only rendered inbox cards, including clipping by nested scroll panes.
 * Hidden tabs and modal-covered cards must never acknowledge an unseen notice. */
export default function NotificationViewportTracker(props: Props) {
  const unreadIds = useMemo(() => new Set(props.notifications.filter(n => !n.read).map(n => n.id)), [props.notifications]);
  const latest = useRef({ ...props, unreadIds });
  latest.current = { ...props, unreadIds };
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const scope = props.scopeKey;
    const observed = new Map<Element, { visible: boolean; timer?: number }>();
    const attempted = new Map<string, number>();
    let stopped = false;
    const unread = (id: string) => latest.current.unreadIds.has(id);
    const uncovered = (element: Element) => {
      if (document.hidden || document.querySelector('dialog[open], [aria-modal="true"]')) return false;
      const r = element.getBoundingClientRect();
      const left = Math.max(0, r.left), right = Math.min(innerWidth, r.right);
      const top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      if (right <= left || bottom <= top || getComputedStyle(element).opacity === '0') return false;
      const inset = Math.min(4, (right - left) / 2, (bottom - top) / 2);
      return [[(left + right) / 2, (top + bottom) / 2], [left + inset, top + inset],
        [right - inset, top + inset], [left + inset, bottom - inset], [right - inset, bottom - inset]]
        .some(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit && element.contains(hit); });
    };
    const consider = (element: Element) => {
      const item = observed.get(element), id = element.getAttribute('data-notification-id');
      if (!item || item.timer || !item.visible || !id || !unread(id) || !uncovered(element)) return;
      if (Date.now() - (attempted.get(id) || 0) < 5000) return;
      item.timer = window.setTimeout(() => {
        item.timer = undefined;
        if (stopped || latest.current.scopeKey !== scope || !element.isConnected || !item.visible || !unread(id) || !uncovered(element)) return;
        attempted.set(id, Date.now());
        void latest.current.onViewed(id).catch(() => {});
      }, 200);
    };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const item = observed.get(entry.target);
        if (!item) continue;
        item.visible = entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0;
        if (!item.visible && item.timer) { clearTimeout(item.timer); item.timer = undefined; }
        consider(entry.target);
      }
    });
    const sync = () => {
      for (const [element, item] of observed) {
        if (!element.isConnected || !unread(element.getAttribute('data-notification-id') || '')) {
          if (item.timer) clearTimeout(item.timer);
          observer.unobserve(element); observed.delete(element);
        }
      }
      for (const element of document.querySelectorAll('[data-notification-id]')) {
        if (!observed.has(element) && unread(element.getAttribute('data-notification-id') || '')) {
          observed.set(element, { visible: false }); observer.observe(element);
        }
      }
      for (const element of observed.keys()) consider(element);
    };
    refresh.current = sync;
    const reconsiderVisible = () => { for (const [element, item] of observed) if (item.visible) consider(element); };
    const mutations = new MutationObserver(records => {
      if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes]
        .some(node => node instanceof Element && (node.matches('[data-notification-id], dialog, [aria-modal]') || node.querySelector('[data-notification-id], dialog, [aria-modal]'))))) sync();
    });
    mutations.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'aria-modal'] });
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('scroll', reconsiderVisible, { capture: true, passive: true });
    sync();
    return () => {
      stopped = true; refresh.current = () => {};
      observer.disconnect(); mutations.disconnect();
      for (const item of observed.values()) if (item.timer) clearTimeout(item.timer);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('scroll', reconsiderVisible, true);
    };
  }, [props.scopeKey]);
  useEffect(() => refresh.current(), [props.notifications]);
  return null;
}
