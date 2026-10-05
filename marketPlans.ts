export const MARKET_PLANS = ['default', 'star', 'pro'] as const;
export type MarketPlan = typeof MARKET_PLANS[number];
export const PLAN_LIMITS = { default: { items: 20, services: 1, inventory: 200 }, star: { items: 100, services: 5, inventory: 600 }, pro: { items: 200, services: 10, inventory: 900 } };
export const DEFAULT_SUBSCRIPTION_PRICES = { default: 0, star: 90, pro: 150 };
export function validPlan(value: unknown): value is MarketPlan { return MARKET_PLANS.includes(value as MarketPlan); }
export function effectiveMarketPlan(seller: any, now = Date.now(), production = false): MarketPlan {
  if (!validPlan(seller?.subscriptionPlan) || !['active', 'test_active', 'free'].includes(seller?.subscriptionStatus) || production && seller.subscriptionStatus === 'test_active') return 'default';
  if (!(Date.parse(seller.subscriptionExpiresAt) > now)) return 'default';
  return seller.subscriptionPlan;
}

/** Benefits are derived from the store's effective plan, never listing-supplied flags. */
export function marketPlanBenefits(plan: MarketPlan) {
  return { subscriptionPlan: plan, isPineStar: plan === 'star' || plan === 'pro', hasGoldFrame: plan === 'pro', hasPriorityPlacement: plan === 'pro' };
}
export function compareMarketPriority(a: { hasPriorityPlacement?: boolean }, b: { hasPriorityPlacement?: boolean }) {
  return Number(b.hasPriorityPlacement === true) - Number(a.hasPriorityPlacement === true);
}

export function planCapacityError(products: any[], storeId: string, plan: MarketPlan, candidate: any, replaceId?: string): string | null {
  const isService = (p: any) => Boolean(p.isService || String(p.category || '').toLowerCase().includes('service'));
  if (!isService(candidate) && (!Number.isSafeInteger(candidate.stockQuantity) || candidate.stockQuantity < (replaceId ? 0 : 1))) return 'Inventory quantity must be a finite whole number.';
  const selected = products.filter(p => p.storeId === storeId && p.id !== replaceId).concat(candidate);
  const items = selected.filter(p => !isService(p)), limits = PLAN_LIMITS[plan];
  if (items.length > limits.items || selected.length - items.length > limits.services) return `Your Pine ${plan} plan publishing limit has been reached.`;
  if (items.reduce((sum, p) => sum + Math.max(0, Number(p.stockQuantity) || 0), 0) > limits.inventory) return `Your plan allows up to ${limits.inventory} total inventory units.`;
  return null;
}
