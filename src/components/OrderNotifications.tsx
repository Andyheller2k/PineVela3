import {useNotifications} from '../context/NotificationContext';
import {marketNoticeKind} from '../lib/marketNotifications';

/** Only explicit order references belong here. The existing viewport tracker
 * acknowledges each rendered notice after visibility, never merely tab entry. */
export default function OrderNotifications({orderId}:{orderId:string}){
  const {notifications}=useNotifications();
  const notices=notifications.filter(n=>n.orderId===orderId&&marketNoticeKind(n)==='order');
  if(!notices.length)return null;
  return <div className="space-y-2" aria-label="Order updates">{notices.map(n=><div key={n.id} data-notification-id={n.id} className={`rounded-xl border px-3 py-2 text-xs ${n.read?'border-blue-100 text-slate-500':'border-yellow-400/50 bg-yellow-50 text-blue-950'}`}><strong className="block font-bold">{n.title}</strong><p className="mt-1">{n.message}</p></div>)}</div>;
}
