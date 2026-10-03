# S18 remediation — 2026-10-02

## Purchase-bound authorization

`marketRatingSecurity.ts` owns both submission paths:

| Route | Policy |
| --- | --- |
| POST `/api/digital-market/ratings` | Authenticated primary buyer, exact owned completed order |
| POST `/api/digital-market/services/:id/reviews` | Same policy; URL item must match the order |
| GET `/api/digital-market/ratings` | Public allowlisted verified reviews with explicit selectors |
| GET `/api/digital-market/services/:id/reviews` | Public allowlisted verified reviews for that item |

Both POST routes accept only `orderId`, numeric integer `rating` from 1–5 and optional
string `review` up to 4,000 characters. Buyer ID/name/email come from the session; seller,
store and product come from the stored `Completed & Paid` order. Email matches do not prove
ownership. Anonymous/invalid sessions receive 401; seller, administrator, resident or other
buyer impersonation receives 403. Incomplete purchases and mismatched service IDs receive
409. Protected/invalid fields receive 400 before mutation.

One verified row belongs to one purchase. The buyer can edit that row while retaining its
ID and original creation time. Separate orders by the same buyer/store remain independent.
Conflicting/misowned verified records fail closed. Ownership, upsert, aggregate updates and
persistence occur synchronously without an intervening await in the JSON backend.

## Reputation and UI

Public lists, store status, item/store catalog scores and order review attachments all use
the same receipt-verified rows. Legacy unverified ratings and old service reviews stay
privately stored across restart; they cannot affect scores or appear as verified reviews.
No historical rating is silently promoted. Public projections omit buyer account ID/email,
order ID and internal provenance. A submission response includes only the submitting
buyer's order ID plus public review fields. Separate stores do not share scores by email.

The buyer's completed-order review form sends the minimal allowed payload and supports
editing their own review. The seller's service-review popup remains a reader; its orderless
submission form is removed. Empty review sets display as unrated rather than five stars.

## Verification

- Focused S18 tests: 3 passed (unit policies and direct HTTP integration).
- Complete `npm run test:security`: 57 passed, 0 failures.
- Direct HTTP coverage: anonymous/invalid sessions, forbidden roles, same-email/different-ID
  buyers, foreign orders, nonterminal/cancelled orders, forged identities, invalid rating/text,
  wrong service URL, valid submit/edit, separate receipts, concurrent first writes, public
  redaction, per-store/item statistics, exact order attachment and persistence after restart.
- Production Chromium: buyer submission/edit and seller read-only review display passed at
  375, 768 and 1440 pixels, with no page overflow or console/runtime/API errors.
- Production build passed; Vite retained its existing large-chunk advisory.
- `npm run lint` (TypeScript): passed.
- Private-data check passed. Operational data and credentials were not used for tests.

## Limits and migration

This verifies the current single-process JSON backend. Historical unverified review data
is preserved privately, so previous scores can decrease until buyers submit verified reviews.
Orders must contain an explicit buyer ID; there is no shared-email ownership fallback.
Multiple processes sharing the JSON file are unsupported. Supabase/PostgreSQL migration
requires a unique order constraint, transactions and equivalent RLS. No production deployment,
commit, push or automatic promotion/deletion of operational review records was performed.
