# S14 and S15 remediation — 2026-10-02

**Follow-up:** [S16/S17 remediation](./S16-S17-remediation-2026-10-02.md) supersedes the earlier
no-reservation policy and open S13/S16/S17 status below. This report preserves the original
S14/S15 implementation and verification record.

## Changes

- Order creation ignores client prices. It snapshots the stored base price, or the price and name/ID of an exactly matching stored category. Unknown, ambiguous and inconsistent category selections fail before order creation or notification.
- The buyer sends category selectors rather than a price. Name-only selectors remain compatible with older clients; no selector uses the stored base price.
- Quantities must be positive safe integer JSON numbers. Strings, booleans, arrays, objects, null, omitted values, zero, negative values, fractions and unsafe numbers are rejected.
- Prices are finite, nonnegative stored numbers, rounded to pesewas. Multiplication uses integer pesewas and rejects unsafe totals. Stored zero-price products remain valid; a supplied zero cannot discount a priced product.
- Creation checks current stock. Completion independently validates the saved quantity/price/total and current product inventory; missing, unavailable or insufficient-stock products cannot complete. Negative historical quantities cannot add inventory.
- Stock comparison, deduction, order completion and synchronous persistence have no intervening await. Competing completions cannot consume the same stock in this single-process JSON implementation. Pending orders remain requests, without reservations.
- Completed/cancelled orders are guarded before all actions, preventing location confirmation/rejection from reopening a completed order for another deduction. Order IDs now use UUIDs to avoid concurrent creation collisions.

## Verification

All checks passed. Tests used isolated temporary databases, not operational accounts or stock.

- Full security suite: **51 tests passed**, no failures or skips. This includes existing account isolation, residence authorization, maintenance workflow, retired-feature and seller messaging regressions.
- S14 unit/HTTP tests: a catalog price of 100 remains 100 when the request sends 0, 1, a negative number, string, null or object. Selected categories use stored prices and canonical metadata; unknown/mismatched categories fail. Unit coverage includes ambiguous categories, invalid/nonfinite stored prices, legitimate free products and decimal totals.
- S15 unit/HTTP tests: invalid quantities fail without changing orders/inventory; negative historical order completion also fails. Excess quantities and unavailable stock fail closed. Unauthorized and unrelated-seller completion requests fail; authorized seller confirmation and buyer cancellation remain functional.
- Two outstanding quantity-two orders competed for the final two units: one completed with HTTP 200, one failed with HTTP 409, stock remained zero, and exactly one completion survived restart. Concurrent completion of the same service order similarly deducted once. Completed/cancelled orders could not be reopened or completed again. Category price/ID snapshots survived restart.
- `npm run lint`, `npm run build`, `npm run check:private-data` and `git diff --check` passed. The build retains its existing bundle-size advisory. No new browser session was run.

## Scope and limits

This is not a Supabase marketplace migration. Multiple processes sharing the JSON file are unsupported; PostgreSQL migration must use a transaction/row lock or conditional stock update for order completion. No RLS policy was weakened or changed.

Historical orders are preserved, not repriced against today's catalog. Structurally invalid orders cannot complete, but a previously tampered positive price cannot reliably be distinguished from a legitimate historical price snapshot.

S13 (buyer authentication/identity) and S16 (PIN exposure/verification) remain separate open findings. The stock and terminal-order fixes overlap S17, but its unrestricted generic status transition policy remains open. No unrelated feature or operational data was changed. Browser interaction was not retested; frontend verification uses TypeScript and the production build.

Implementation: `marketOrderSecurity.ts`, the order creation/status routes in `server.ts`, buyer payload in `PageUserDashboard.tsx`, order types, tests and the security test script.
