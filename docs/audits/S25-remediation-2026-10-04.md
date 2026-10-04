# S25 — Payment verification and seller billing

Implementation and isolated verification are complete. A live key and local public origin were subsequently configured, and authorized Telecel rejection checks were run separately; see the [live rejection follow-up](Paystack-live-rejection-2026-10-04.md). **Successful live payment fulfillment remains unverified.** Isolated tests never changed operational seller accounts.

## Changes

- Replaced agreement-based housing payment, self-paid market setup/create-store aliases and unconditional test subscriptions with authenticated checkout and provider verification.
- Server quotes bind identity, store/residence, purpose, selected plan, amount, GHS currency and an unpredictable reference. Exact provider status/amount/currency/email/reference/domain must match. HMAC-SHA512 raw-body verification protects webhooks, followed by an independent provider check.
- Fulfillment is idempotent, concurrency/attempt/pending-checkout bounded, persisted, and rolls back paid flags if persistence fails. Test payments cannot activate production accounts. Existing self-attested records remain preserved but cannot grant verified paid access or count as live revenue.
- Admins configure registration, Default/Star/Pro monthly prices, and the semester fee using their separate settings key. Semester renewal is every **two calendar months**. Initial checkout combines registration + selected monthly plan + two-month fee. Later renewals have separate buttons; no automatic debits or proration are implemented.
- Seller and primary-account pricing displays use the public settings; server quotes use those same settings. The primary account enters the seller login flow rather than running a simulated payment wizard.
- Default/Star/Pro item/service/inventory quotas are enforced when creating, editing and downgrading, with a recheck after asynchronous image decoding. Expired premium benefits fall back to Default, subject to Default's own paid policy. Expired two-month access blocks new purchases and publishing, while existing orders and messaging remain usable.
- Removed claims about unimplemented AI/animated-card subscription tools from plan descriptions. The supported publishing capacities remain.
- Payment collection survives load/save/restart, participates in existing scoped wipes, and verified live transactions drive marketplace fee revenue.
- Paystack secrets stay in ignored `.env`, server-only; the pre-commit private-data check also rejects staged Paystack secret keys without printing their values.

## Verified

- Payment unit tests: all three quoted prices, calendar renewal/expiry, mismatched/failed/pending receipts, wrong accounts, forged references, duplicate verification, capacity downgrades, free admin exemptions, bounds, raw signature tampering, production/test segregation and persistence-failure rollback.
- Isolated HTTP route tests: authenticated aliases cannot attest payment; foreign actors cannot initialize/verify another seller's payment; signed webhooks independently verify and fulfill once; callback redirects are confined to the configured origin.
- Real-server flow: all three plans activate under a zero-priced administrator test policy, enforce item/service/inventory limits, reject malformed inventory, allow a buyer purchase, retain proof and plans on restart, and deny new purchases after two-month expiry. Real images pass the secure upload endpoint.
- Admin settings API: wrong/no/another admin's/wipe keys are rejected, all billing prices validate and persist, ownership and maintenance controls remain intact.
- Chromium: pricing fields under settings-key protection; saved prices reflected on desktop and mobile seller cards for all three plans; no overflow, console or runtime errors.
- Existing order-price, delivery-PIN, terminal-state, rating, upload, self-purchase and authenticated onboarding regressions passed with completed-payment test fixtures.
- Production build, TypeScript, Git private-data check and diff whitespace checks passed. The existing main-chunk size warning remains.

## Activation steps and limits

Follow [Paystack setup](../payments/paystack.md). Localhost supports browser return verification and explicitly authorized live-key development tests; real hosted webhooks require a publicly reachable HTTPS URL. Checkout requires internet. Production accepts only live verified payments. A settings-key-protected selection of verified GHS receiving subaccounts is supported; raw bank/wallet details are managed in Paystack. Automatic recurring charges, refunds/chargebacks and legacy manual receipt reconciliation remain outside this implementation. JSON persistence remains single-writer during migration; preserve the billing and ownership rules in PostgreSQL/RLS.
