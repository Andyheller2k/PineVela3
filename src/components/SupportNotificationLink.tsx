import { Link } from 'react-router-dom';

/** Only known support routes are actionable; ordinary notification text stays inert. */
export default function SupportNotificationLink({ notification }: { notification: { category?: string; link?: string } }) {
  if (notification.category !== 'support' || !notification.link || !/^\/(?:help\?ticket=[a-f0-9-]{36}|customer-service(?:\?ticket=[a-f0-9-]{36})?)$/.test(notification.link)) return null;
  return <Link to={notification.link} className="mt-3 inline-block rounded-lg px-2 py-1 text-xs font-bold text-blue-700 underline underline-offset-4">Open support conversation</Link>;
}
