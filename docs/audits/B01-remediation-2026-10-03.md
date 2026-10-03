# B01 remediation — 2026-10-03

Scope: persisted collection loss during load/save and server startup in the transitional JSON backend.

## Current finding and change

`ratings`, `staffBargains` and `onboardingPayments` were still omitted by the loader.
`digitalMarketServiceReviews` had already been preserved by the purchase-review remediation;
its default fallback is now consistent with the other retained historical collections.
The same omission also affected `managerProfiles`, which has an active database writer and
manager-account deletion handling. That supported collection is now explicitly typed and loaded.

- `persistentDb.ts` loads these arrays without collapsing distinct historical records that
  share an email. Existing empty arrays remain empty; missing or invalid arrays use defaults.
- `localDb.ts` initializes the supported collections and types the profile/payment writers.
- `server.ts` initializes the onboarding payment reference from persistent storage and
  records new payments only through the database writer. The source payment example is removed;
  sharing the persisted array does not cause duplicate payment insertion.
- No unrelated authorization rules, public review eligibility, retired features or operational
  database contents were changed. Legacy service reviews remain private and unverified.

## Verification

- **9 focused tests passed, 0 failed**, covering B01 and related credential, session,
  purchase-review and staff/onboarding regressions. The full security suite was not rerun.
- `npm run lint`, `npm run build`, `npm run check:private-data` and `git diff --check`: passed.
- Build retains the existing Vite bundle-size warning; compilation and bundling completed.


`tests/persistentStore.test.ts` derives the supported array collection names from the
`PersistentStore` interface, pre-seeds each collection, and checks exact nested data across
three load/save rounds. Historical records sharing an email, empty arrays and missing/invalid
collection fallbacks are covered. Future declared collection omissions fail this contract test.

`tests/persistentStore.integration.test.ts` uses a temporary database and a real Express
server. It checks historical collections immediately after startup and after two restarts,
ratings/staff-bargain read paths, private legacy service-review behavior, rejection of an
unacknowledged payment, and a single acknowledged payment surviving both restarts.

All integration fixtures are disposable; existing local accounts and records are not used.
Related credential/session, purchase-review and staff/onboarding regressions are also checked.

## Limits

This prevents future omission on load/startup. Records already removed by an older version
can only be recovered from an existing backup or other preserved copy. Unknown/retired JSON
fields are not promoted into active models; the explicitly supported collection contract
and existing private archive behavior remain in place. Supabase migration is unchanged.

B09/B10 follow-up: present malformed collection fields now reject startup instead of falling back. Missing legacy fields still use defaults; the B01 test was updated to verify preservation on rejection.
