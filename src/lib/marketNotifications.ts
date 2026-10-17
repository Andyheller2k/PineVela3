import type { NotificationItem } from '../context/NotificationContext';

export function marketNoticeKind(n: NotificationItem): 'chat' | 'order' | 'vendor' | 'support' | null {
  if (n.category === 'support') return 'support';
  if (n.marketChat || /^📩 New message from /.test(n.title || '')) return 'chat';
  const text = `${n.title} ${n.message}`.toLowerCase();
  if (n.orderId || /buy request|order|handover|delivery pin|meetup|purchase|item sold/.test(text)) return 'order';
  if (n.scope === 'market' || n.category === 'market' || n.module === 'digital_market' ||
      /merchant|digital market|store application|store accreditation|marketplace/.test(text)) return 'vendor';
  return null;
}
