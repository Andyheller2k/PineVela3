import { MARKET_PLANS, PLAN_LIMITS, marketPlanBenefits, type MarketPlan } from '../../marketPlans';

export { MARKET_PLANS };
export const SELLER_PLAN_NAMES: Record<MarketPlan, string> = { default: 'Default', star: 'Star', pro: 'Pro' };
export type SellerPlanPrices = Readonly<Partial<Record<MarketPlan, number>>>;
export type SellerPlanFeature = { key: string; emoji: string; label: string; description: string; value: (plan: MarketPlan) => string | boolean };

export function nextSellerPlan(current: MarketPlan): MarketPlan | null {
  return current === 'default' ? 'star' : current === 'star' ? 'pro' : null;
}

export function sellerPlanPrice(prices: SellerPlanPrices | undefined, plan: MarketPlan): number | undefined {
  const price = prices?.[plan];
  return typeof price === 'number' && Number.isFinite(price) && price >= 0 ? price : undefined;
}

/** Display only loaded admin settings, never the code-default preview rates. */
export function formatSellerPlanPrice(prices: SellerPlanPrices | undefined, plan: MarketPlan): string {
  const price = sellerPlanPrice(prices, plan);
  return price === undefined ? prices ? 'Price unavailable' : 'Loading prices…' : `GH₵${price.toFixed(2)}`;
}

export function sellerPlanFeatures(current: MarketPlan): SellerPlanFeature[] {
  const capacity: SellerPlanFeature[] = [
    { key: 'items', emoji: '📦', label: 'Item listings', description: 'Active at a time', value: plan => String(PLAN_LIMITS[plan].items) },
    { key: 'services', emoji: '🛠️', label: 'Service listings', description: 'Active at a time', value: plan => String(PLAN_LIMITS[plan].services) },
    { key: 'inventory', emoji: '🛍️', label: 'Inventory units', description: 'Total stock capacity', value: plan => String(PLAN_LIMITS[plan].inventory) },
  ];
  return capacity.concat(current === 'default' ? [
    { key: 'cover', emoji: '🎨', label: 'Store cover', description: 'Four designs or your own', value: plan => marketPlanBenefits(plan).isPineStar ? 'Custom' : '4 designs' },
    { key: 'badge', emoji: '🌟', label: 'Glowing badge', description: 'On your listings', value: plan => marketPlanBenefits(plan).isPineStar || 'Standard' },
    { key: 'logo', emoji: '🍍', label: 'Store logo', description: 'Your brand, front & centre', value: plan => marketPlanBenefits(plan).isPineStar ? 'Custom' : 'PineVela' },
  ] : [
    { key: 'branding', emoji: '🎨', label: 'Store branding', description: 'Your logo & cover', value: plan => marketPlanBenefits(plan).isPineStar },
    { key: 'frames', emoji: '💎', label: 'Golden frames', description: 'Around your listings', value: plan => marketPlanBenefits(plan).hasGoldFrame },
    { key: 'priority', emoji: '🚀', label: 'Search placement', description: 'In featured results', value: plan => marketPlanBenefits(plan).hasPriorityPlacement ? 'Priority' : 'Standard' },
  ]);
}
