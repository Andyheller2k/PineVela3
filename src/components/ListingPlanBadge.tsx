import { Star } from 'lucide-react';
import type { MarketPlan } from '../../marketPlans';

/** Subscription decoration is separate from purchase-review stars. */
export default function ListingPlanBadge({ plan }: { plan?: MarketPlan }) {
  if (plan !== 'star' && plan !== 'pro') return null;
  return <span className="pinevela-listing-star" role="img" aria-label={`Pine ${plan === 'pro' ? 'Pro' : 'Star'} subscription`} title={`PineVela · Pine ${plan === 'pro' ? 'Pro' : 'Star'}`}><Star size={12} aria-hidden="true" /><span>PineVela</span></span>;
}
