# Administrator pricing approval — 2026-10-04

## Implemented behavior

Admin Settings now submits a pricing proposal covering marketplace registration,
commission, the two-month semester fee and Default/Star/Pro monthly subscriptions.
At least three distinct active administrators must approve; up to five may approve.
Submitting a proposal counts as its creator's approval. Every submission, vote and final
push requires that administrator's own settings key, separate from the wipe key.

Approvals never automatically change live prices. Only the persisted main administrator
(#1) can apply the immutable reviewed prices with **Final push — apply approved pricing**.
Shared cards show previous/proposed values, the reason, named numbered voters, expiry
and the final applier/time. At least three active keyed administrators, including #1,
must be available before a proposal can be submitted.

The server rejects direct pricing changes through the old settings endpoint, including
changes by #1. It rejects spoofed identities, duplicate votes, foreign/wipe keys,
malformed amounts, insufficient approvals and replayed final pushes. Proposals expire
after 24 hours; roster/key changes, stale prices and a competing proposal's application
invalidate pending proposals. Persistence is bounded to ten live and 100 retained
proposals. Failed final-save operations restore in-memory pricing and block further
governance writes for offline recovery.

Existing payment quotes, paid periods and stored order accounting retain their original
amounts. Receiving-account configuration, announcements, maintenance and personal
profile settings retain their existing policies. Five-administrator wipe rules remain
unchanged. Offline wipe recovery invalidates restored live pricing proposals.

## Verification

All checks use disposable accounts/databases; no live prices, operational accounts or
Paystack payments were changed for this task.

- Pricing policy: five tests passed, including three/four/five approvals, main-only
  application, persistence/restart, adversarial input and safe handling of malformed
  saved metadata.
- Full settings HTTP integration passed: unauthenticated/non-admin denials, direct
  pricing bypass denial, premature and foreign application denial, three named votes,
  approval persistence across restart and one-time final application.
- Existing settings-key tests (3), wipe/governance tests (6) and payment tests (11)
  passed.
- Chromium browser flow passed at 375, 768 and 1440 pixels: proposal submission,
  approvals by three separate accounts, unchanged live pricing before the final push,
  main-only application, visible audit and applied seller plan prices. Existing profile
  upload/reload, announcement inbox and maintenance/resumption also passed, with no
  console/runtime errors or page overflow.
- TypeScript check, production build, private-data check and diff whitespace check passed.

Run the focused checks:

```sh
node --import tsx tests/adminPricing.test.ts
node --import tsx tests/adminSettings.integration.test.ts
npm run lint
npm run build
node tests/adminSettings.browser.cjs
npm run check:private-data
```
