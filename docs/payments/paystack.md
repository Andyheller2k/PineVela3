# Paystack setup and billing policy

Set these **locally** in `.env`; the file is ignored by Git:

```
PAYSTACK_SECRET_KEY=
PINEVELA_PUBLIC_ORIGIN=
```

Put the actual secret in the first variable locally. Do not paste it into chat, use a `VITE_` variable, or commit it. Development may use a Paystack test secret. A production build requires a live secret for paid checkout. When running directly on localhost, leave the origin blank; hosted checkout and its return route derive it only from a loopback Host and actual loopback socket peer. Forwarded headers cannot authorize this fallback. Deployed servers require a configured HTTPS public origin. Never test a real charge without the payer's authorization.

In Paystack's dashboard, configure the webhook URL as `<public origin>/api/payments/paystack/webhook`. A localhost webhook is not reachable from Paystack; during local testing use the checkout return page and its **Verify payment** button. Checkout and verification need internet access, even with `npm run dev`. `npm run preview` does not run the API.

Admins propose one-time market registration, commission, all three monthly plans and the semester fee under **Admin Settings**, using their separate **settings keys**. At least three distinct admins must approve; fourth and fifth votes are allowed. Only the main admin (#1) can apply the approved prices with the final push. Proposing or voting never changes live prices; direct settings writes cannot bypass approval. See [pricing governance](../admin-governance.md).

The semester fee renews every **two calendar months**. Plans renew every calendar month. Initial activation combines registration + selected plan + two-month fee; later plan and two-month renewals have separate checkout buttons. There is no automatic debit. Existing quotes retain their prices; a successful renewal extends the current paid period. A plan change starts its new monthly period immediately, without proration or refunds.

Each fee in Admin Settings has a **No payment (GHS 0)** option, subject to the same pricing approvals. Zero prices waive that component; remaining positive fees still require Paystack. An entirely zero-valued checkout grants verified access immediately without Paystack credentials, a receiving account or a return-origin setting. Free fulfillment creates a server-authorized ledger entry and remains ownership-checked, persistent and idempotent. Other prices must be at least GHS 0.10 with at most two decimal places. Paystack receives integer pesewa.

Server-created immutable quotes bind the actor, store/residence, purpose, plan, amount, currency and unpredictable reference. A browser return URL and submitted `paid`, `agreedToPay` or receipt strings grant nothing. The server verifies Paystack's success status, reference, exact amount, currency, customer email and test/live domain. Webhooks additionally require the HMAC-SHA512 signature of the exact raw request bytes. A repeated confirmation does not extend a period or count revenue twice. Wrong-account access is denied. Checkout/verification concurrency, pending checkouts, request size and attempt rates are bounded.

Payment records persist across restart and participate in scoped wipes. Test receipts grant development access only and are excluded from production access and live revenue. Prior self-attested records are preserved, but cannot prove payment; those stores must complete verified activation. Do not migrate historical manual receipts to paid status without independently validating them.

Default/Star/Pro limits are respectively 20/100/200 items, 1/5/10 services and 200/600/900 inventory units. Publishing and editing enforce limits, including after image decoding yields. Downgrades above the new limits are rejected. Expired premium plans fall back to Default; if Default costs money, its own valid paid period is required. Expired two-month fees block new publishing and purchases and hide public catalogue listings. Existing orders and seller messaging remain available so outstanding transactions can finish.

The former plan descriptions advertised AI/animated-card tools that were not implemented. The pricing cards now describe the supported catalogue limits rather than selling those missing tools.

Housing onboarding's legacy fee remains GHS 50, requires the authenticated manager's ownership, and uses the same verified checkout. Property submission cannot attest payment or subscription. Admin property approval is independent of payment.

Admins can load active, verified GHS Paystack subaccounts under **Payment receiving account** and select one using their own separate settings key. Bank or supported mobile-money settlement details are created/updated in the authenticated Paystack dashboard, then selected here. The default is the main Paystack settlement account. Receiving numbers are never included in seller checkout responses or public settings; the admin picker shows only the last four digits. Paystack/operator payment prompts can still identify the registered business. PineVela cannot suppress provider-required identity or disclosures.

New quotes snapshot the selected subaccount and send all proceeds, less Paystack fees, to it using `transaction_charge: 0` and `bearer: subaccount`. Existing quotes retain their receiving destination after changes. Provider verification must also match the quoted subaccount. Changing payment environments requires reconfiguring the receiving account. No receiving account has been changed as part of the isolated rejection tests.

The initialization API additionally accepts a Ghana `mobileMoney: { phone, provider }` payer instrument for direct phone approval (`mtn`, `vod`, `atl`). It validates the instrument, uses the same immutable server quote and independent receipt verification, and never stores the phone in the application payment ledger. The ordinary seller UI continues using hosted checkout; it never asks for a wallet PIN. A charge response alone grants no access.

For an explicitly authorized live rejection check, `scripts/test-paystack-live-rejection.ts` requires an owned inbox/wallet/network and an authorized total ceiling. It keeps its component-test seller and ledger in ignored `data/live-payment-tests`, never writes an operational seller, and reuses existing references with `--resume-ledger`. This is provider/payment-component verification, not proof of a complete registration/admin-approval browser flow. Activation includes registration, selected monthly plan and two-month fee. Rejecting activation correctly prevents subsequent monthly/semester renewal requests; do not fake a successful payment to get past that rule. The zero-priced Default monthly plan has no charge when a registered seller chooses it.

This integration uses the native Supabase/PostgreSQL backend. It handles hosted/direct mobile-money one-off checkout, verification, signed provider events and a configured settlement subaccount. It does not initiate refunds, move money from the review UI, implement automatic recurring debits, or convert historical manual receipts into verified payments.

## Refund and dispute reconciliation

Migration `20261020214438` adds private, RLS-protected reversal records and a durable event queue. Signed refund/dispute webhooks enqueue work; the server worker verifies the original transaction and its processed refunds directly with Paystack. Jobs use exclusive per-payment leases, retry with bounded backoff and survive restarts. Provider amounts from the webhook body do not grant/revoke access. No full raw financial/customer payload is saved in the queue.

Original successful receipts and paid intervals stay immutable. Full processed refunds and reversed transactions without refund rows end the access granted by that receipt. Exact partial-refund amounts reduce net platform revenue and enter administrator review; a provider transaction label alone does not turn a known partial refund into a full refund. Reviews require an active administrator, the separate approval key, a current revision and a reason. A retain decision cannot override a confirmed full reversal. Reversed periods do not extend later renewals.

The administrator marketplace page lists recent live payment reviews and allows a provider recheck. Verifying an already fulfilled live receipt also queues a recheck. The worker is started and drained with the native server; it does not fabricate provider evidence or initiate refunds. Existing orders, messages, receipts and resident allocations are retained. Reversed one-time store/residence registration charges require Help to review registration recovery before another one-time charge is accepted.

Local verification used the existing encrypted checkpoint, actual native sessions, SQL/RLS/grant checks, the current Supabase security advisor and monetary-policy tests. No Paystack charge/refund/dispute was generated or mocked. Provider lifecycle delivery and real administrator review with a configured payment environment remain external acceptance checks. Install the migration before starting the new backend; no hosted migration was applied during local verification.

References: [Paystack transactions](https://paystack.com/docs/api/transaction/), [verification](https://paystack.com/docs/payments/verify-payments/), [webhook authentication](https://paystack.com/docs/payments/webhooks/).
