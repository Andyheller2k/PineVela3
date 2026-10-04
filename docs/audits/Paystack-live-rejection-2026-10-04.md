# Paystack live rejection and receiving-account follow-up

The user authorized real payment requests to their Telecel wallet and planned to reject them. The configured live key stayed server-side in ignored `.env`. `PINEVELA_PUBLIC_ORIGIN=http://localhost:3000` is configured for development. No operational seller, account, approval or receiving account was created or changed by these tests.

## Live provider observations

An isolated payment-component seller used an owned inbox and the production Paystack API. Its private ledger is in ignored `data/live-payment-tests`; no operational database session was impersonated. This checks actual provider requests and the same payment service used by the server, but is not a registration/admin-approval browser walkthrough.

| Plan activation | Registration | Monthly plan | Two-month fee | Total | Observation |
| --- | ---: | ---: | ---: | ---: | --- |
| Default | GHS 50 | GHS 0 | GHS 300 | GHS 350 | Initial request refused; subsequent charge check reported failed; no paid access |
| Star | GHS 50 | GHS 90 | GHS 300 | GHS 440 | User received/rejected the prompt; final provider charge status failed; no paid access |
| Pro | GHS 50 | GHS 150 | GHS 300 | GHS 500 | User received/rejected the prompt; final provider charge status failed; no paid access |

Paystack initially continued reporting ongoing transactions after phone rejection, then the final read-only check returned failed for all three charge references. Independent transaction verification granted no access. A DNS error interrupted the first final check; the resumed check reused the same references and sent no new charges. All three monthly renewal options and the semester renewal returned 403 until paid registration. No fabricated receipt was inserted to bypass this prerequisite. The zero-priced Default monthly plan requires no provider debit once registration is valid. Rejection cannot demonstrate successful live fulfillment or settlement.

## Implementation and verification

- Admin Settings now loads active, verified GHS Paystack receiving subaccounts. Selection/reset requires an active admin and that admin's own separate settings key. Other admins' keys and wipe keys are rejected before contacting Paystack.
- Add/change raw bank or supported mobile-wallet settlement details in Paystack's authenticated dashboard, then select the verified account in PineVela. This does not edit raw payout credentials directly in PineVela.
- Public settings and seller checkout responses omit receiving account numbers/configuration; the admin picker shows only last four digits. Provider/operator prompts can still show registered business identity.
- New quotes snapshot the destination, send proceeds less provider fees there, and independently verify the corresponding subaccount. Existing quotes keep their destination after a settings change. Failed saves roll configuration back; switching provider environments fails closed.
- Direct Ghana mobile-money charge requests validate the payer number/network, use server prices, omit wallet details from the local payment ledger and still require independent verification.
- Eleven payment-component tests and two HTTP authorization/webhook tests passed. These use explicitly isolated provider responses for success, tampering and rollback checks.
- Actual-server admin settings/save/restart/public-privacy checks passed. Real desktop/tablet/mobile admin/seller browser checks passed without console/runtime errors or overflow. The first browser run inherited the local production origin; the test was corrected to set its own temporary origin and blank live key.
- The actual-server isolated all-plan flow passed again: publishing quotas, malformed inventory, buyer purchase, restart persistence, two-month expiry and public catalogue exclusion.
- Production build and TypeScript passed. Private-data Git checks and diff whitespace checks passed. Existing main-bundle size warning remains.

Successful live activation, live renewals, recipient settlement and a public HTTPS webhook delivery still need verification with a payment the payer approves.
