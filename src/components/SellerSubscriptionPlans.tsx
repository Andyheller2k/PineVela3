import { useId } from 'react';
import { MARKET_PLANS, PLAN_LIMITS, type MarketPlan } from '../../marketPlans';
import { SELLER_PLAN_NAMES, formatSellerPlanPrice, nextSellerPlan, sellerPlanFeatures, sellerPlanPrice, type SellerPlanPrices } from '../lib/sellerPlanComparison';
import '../sellerSubscriptions.css';

function FeatureValue({ value }: { value: string | boolean }) {
  if (typeof value === 'boolean') return <span role="img" aria-label={value ? 'Included' : 'Not included'} className={value ? 'seller-plan-tick' : 'seller-plan-not-included'}>{value ? '✓' : '−'}</span>;
  return <span>{value}</span>;
}

/** A view of existing effective entitlements and admin prices, not an entitlement editor. */
export default function SellerSubscriptionPlans({ currentPlan, prices, busy, error, onChoose, onKeep }: {
  currentPlan: MarketPlan; prices?: SellerPlanPrices; busy: boolean; error?: string;
  onChoose: (plan: MarketPlan) => void; onKeep: () => void;
}) {
  const headingId = useId(), comparisonId = useId();
  const nextPlan = nextSellerPlan(currentPlan), targetPlan = nextPlan || currentPlan;
  const currentName = SELLER_PLAN_NAMES[currentPlan], targetName = SELLER_PLAN_NAMES[targetPlan];
  const priceAvailable = sellerPlanPrice(prices, targetPlan) !== undefined;
  return <div data-seller-subscriptions data-current-plan={currentPlan} data-next-plan={nextPlan || 'none'}>
    <section className="seller-plan-card" aria-labelledby={headingId} aria-busy={busy}>
      <div className="seller-plan-intro">
        <span className="seller-plan-eyebrow">{nextPlan ? 'A little more possibility' : 'Your current plan'}</span>
        <span className="seller-plan-hero-icon" aria-hidden="true">{targetPlan === 'star' ? '🌟' : '💎'}</span>
        <h2 id={headingId}>{nextPlan ? targetPlan === 'star' ? 'Stand out with' : 'Go further with' : 'You’re on'}<br /><em>Pine {targetName}.</em></h2>
        <p>{nextPlan === 'star' ? <>More room for your products.<br />More personality for your store.</> : nextPlan === 'pro' ? <>More capacity. Golden frames.<br />Priority in featured searches.</> : <>Your highest PineVela seller tier.<br />Keep your store moving forward.</>}</p>
      </div>
      <div className="seller-plan-comparison-wrap">
        <table className="seller-plan-comparison" aria-label={nextPlan ? `Pine ${currentName} and Pine ${targetName} comparison` : 'Your Pine Pro benefits'}>
          <colgroup><col className={nextPlan ? 'seller-plan-feature-col' : 'seller-plan-feature-col-solo'} /><col className="seller-plan-value-col" />{nextPlan && <col className="seller-plan-value-col" />}</colgroup>
          <thead><tr>
            <th scope="col">{nextPlan ? <>Find your next<br />step forward.</> : 'Your included benefits'}</th>
            <th scope="col" className={!nextPlan ? 'seller-plan-next-head' : undefined}><span className="seller-plan-column-label">Your plan</span><span className="seller-plan-name"><span>Pine</span><span>{currentName}</span></span></th>
            {nextPlan && <th scope="col" className="seller-plan-next-head"><span className="seller-plan-column-label">Upgrade</span><span className="seller-plan-name"><span>Pine</span><span>{targetName} <span aria-hidden="true">✨</span></span></span></th>}
          </tr></thead>
          <tbody>{sellerPlanFeatures(currentPlan).map(feature => <tr key={feature.key} data-plan-feature={feature.key}>
            <th scope="row"><span className="seller-plan-feature"><span className="seller-plan-feature-emoji" aria-hidden="true">{feature.emoji}</span><span><strong>{feature.label}</strong><small>{feature.description}</small></span></span></th>
            <td className={!nextPlan ? 'seller-plan-next-value' : undefined}><FeatureValue value={feature.value(currentPlan)} /></td>
            {nextPlan && <td className="seller-plan-next-value"><FeatureValue value={feature.value(nextPlan)} /></td>}
          </tr>)}</tbody>
        </table>
      </div>
      <footer className="seller-plan-upgrade-area">
        <div className="seller-plan-price-line"><strong aria-live="polite"><span data-subscription-price={targetPlan}>{formatSellerPlanPrice(prices, targetPlan)}</span>{priceAvailable && <small> / month</small>}</strong><span className="seller-plan-renewal-pill">No automatic debit</span></div>
        <button type="button" data-subscription-checkout={targetPlan} disabled={busy || !priceAvailable} onClick={() => onChoose(targetPlan)} className="seller-plan-upgrade">{busy ? 'Opening checkout…' : <>{nextPlan ? 'Upgrade to' : 'Renew'} Pine {targetName}<span aria-hidden="true">→</span></>}</button>
        {error && <p role="alert" className="seller-plan-payment-error">{error}</p>}
        <button type="button" disabled={busy} onClick={onKeep} className="seller-plan-keep">{nextPlan ? `Keep Pine ${currentName}` : 'Back to my store'}</button>
        <p className="seller-plan-payment-note">Secure checkout · Review the total before paying</p>
      </footer>
    </section>
    <details className="seller-plan-other-plans">
      <summary aria-controls={comparisonId}>See all plans and renewal prices</summary>
      <ul id={comparisonId}>{MARKET_PLANS.map(plan => <li key={plan} data-plan-option={plan}>
        <div><strong><span aria-hidden="true">{plan === 'default' ? '🍍' : plan === 'star' ? '🌟' : '💎'}</span> Pine {SELLER_PLAN_NAMES[plan]}</strong>{plan === currentPlan && <span className="seller-plan-current-tag">Current plan</span>}<small>{PLAN_LIMITS[plan].items} items · {PLAN_LIMITS[plan].services} {PLAN_LIMITS[plan].services === 1 ? 'service' : 'services'} · {PLAN_LIMITS[plan].inventory} units</small></div>
        <strong className="seller-plan-option-price" aria-live="polite">{formatSellerPlanPrice(prices, plan)}{sellerPlanPrice(prices, plan) !== undefined && <small> / month</small>}</strong>
        <button type="button" disabled={busy || sellerPlanPrice(prices, plan) === undefined} onClick={() => onChoose(plan)} aria-label={`${plan === currentPlan ? 'Renew' : 'Choose'} Pine ${SELLER_PLAN_NAMES[plan]}`}>{plan === currentPlan ? 'Renew' : 'Choose'}</button>
      </li>)}</ul>
    </details>
  </div>;
}
