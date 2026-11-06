import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import type { DigitalMarketOrder } from '../types';
import '../purchaseCards.css';
import { optimizeImageDisplayUrl } from '../lib/imageOptimizer';

/** Only mount tracking/PIN controls after the owner expands this order. */
export default function PurchaseCard({ order, isBuyer, children }: {
  order: DigitalMarketOrder; isBuyer: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const created = new Date(order.createdAt);
  return <details className="purchase-card" data-purchase-id={order.id} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary className="purchase-summary">
      <span className="purchase-merchant"><span>{isBuyer ? order.storeName : order.buyerName}</span><ChevronDown size={18} aria-hidden="true" /></span>
      <span className="purchase-product">
        <img src={optimizeImageDisplayUrl(order.productImage,192)} alt="" loading="lazy" decoding="async" />
        <span className="purchase-product-copy"><span className="purchase-title">{order.productTitle}</span><span className="purchase-quantity">Qty {order.quantity} · GHS {order.totalAmount}</span></span>
      </span>
      <span className="purchase-status" data-status={order.status}>{order.status}</span>
      <span className="purchase-meta"><span className="purchase-reference" title={order.id}>Order #{order.id.slice(0, 8).toUpperCase()}</span><time dateTime={order.createdAt}>{Number.isNaN(created.getTime()) ? '' : created.toLocaleDateString()}</time><span className="purchase-expand-label">{expanded ? 'Hide details' : 'View details'}</span></span>
    </summary>
    {expanded && <div className="purchase-details">{children}</div>}
  </details>;
}
