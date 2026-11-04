import assert from 'node:assert/strict';
import test from 'node:test';
import { PLAN_LIMITS } from '../marketPlans';
import { formatSellerPlanPrice, nextSellerPlan, sellerPlanFeatures, sellerPlanPrice } from '../src/lib/sellerPlanComparison';

test('upgrade comparison stops at Pro and preserves shared capacity rules', () => {
  assert.equal(nextSellerPlan('default'), 'star');
  assert.equal(nextSellerPlan('star'), 'pro');
  assert.equal(nextSellerPlan('pro'), null);
  for (const current of ['default', 'star', 'pro'] as const) {
    const rows = sellerPlanFeatures(current);
    for (const plan of ['default', 'star', 'pro'] as const) for (const key of ['items', 'services', 'inventory'] as const) {
      assert.equal(rows.find(row => row.key === key)!.value(plan), String(PLAN_LIMITS[plan][key]));
    }
  }
});

test('comparisons distinguish branding, frames and priority without promising new benefits', () => {
  const defaults = sellerPlanFeatures('default');
  assert.equal(defaults.find(row => row.key === 'badge')!.value('default'), 'Standard');
  assert.equal(defaults.find(row => row.key === 'badge')!.value('star'), true);
  assert.equal(defaults.find(row => row.key === 'cover')!.value('default'), '4 designs');
  assert.equal(defaults.find(row => row.key === 'cover')!.value('star'), 'Custom');
  const stars = sellerPlanFeatures('star');
  assert.equal(stars.find(row => row.key === 'branding')!.value('star'), true);
  assert.equal(stars.find(row => row.key === 'frames')!.value('star'), false);
  assert.equal(stars.find(row => row.key === 'frames')!.value('pro'), true);
  assert.equal(stars.find(row => row.key === 'priority')!.value('pro'), 'Priority');
});

test('prices follow changed admin values, including decimal and zero rates', () => {
  assert.equal(formatSellerPlanPrice({ default: 7.25, star: 127.35, pro: 211.5 }, 'star'), 'GH₵127.35');
  assert.equal(formatSellerPlanPrice({ default: 7.25, star: 163.8, pro: 299.99 }, 'star'), 'GH₵163.80');
  assert.equal(formatSellerPlanPrice({ default: 0, star: 0, pro: 0 }, 'star'), 'GH₵0.00');
  assert.equal(formatSellerPlanPrice({ pro: 211.5 }, 'pro'), 'GH₵211.50');
});

test('missing or invalid rates never fall back to preview prices or become checkout-ready', () => {
  assert.equal(formatSellerPlanPrice(undefined, 'star'), 'Loading prices…');
  for (const value of [undefined, NaN, Infinity, -1]) {
    const rates = { star: value };
    assert.equal(sellerPlanPrice(rates, 'star'), undefined);
    assert.equal(formatSellerPlanPrice(rates, 'star'), 'Price unavailable');
  }
});
