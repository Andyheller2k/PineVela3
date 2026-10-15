# Concurrent administrator reads

Administrator dashboard requests previously acquired the same exclusive settings
advisory lock as governance writes. One diagnostic observed a 6.7-second lock wait
inside a roughly 10-second trivial authorized request; this is a diagnostic, not a
performance benchmark.

Explicit server-selected `readActor` and `authorizedRead` calls now share that lock.
Their reviewed callbacks only read projections, notifications, preferences, account
directories or inspection rosters. Session/context/subject binding, role checks,
account policies, manager grants, maintenance checks and scoped RLS remain intact.
The existing mutation wrappers remain exclusive. GET helpers that expire proposals
or write lifecycle receipts must continue using the exclusive wrappers. HTTP methods
and browser flags never select transaction authority.

The native concurrency verifier passed 28 assertions against an isolated genuine
checkpoint: readers overlap, both actual mutation wrappers wait, writers exclude
readers, forged bindings and wrong roles are denied, and scoped readers cannot
retrieve private keys. Auth/profile/binding/key fingerprints remained exact.
The focused historical projection verifier passed 237 assertions with zero native
advisor findings. Its fixture stops at migration 54; its result is projection
boundary coverage, not current full-market/payment acceptance.

The actual approved administrator browser passed 16 checks: ten authenticated API
reads, dashboard/navigation, a read-only scope preview and disabled review controls
at 1440 and 375 pixels. No proposal, consent or deletion was submitted. The harness
uses a separate owned task tab and an explicit main-frame execution context, checks
the actual sign-in response, and closes only its own tab. Generated files, scripts,
tests and documentation no longer trigger development page reloads.

Private evidence: `administrator-read-concurrency-native.json`,
`view-exposure-boundaries-native.json`, and
`browser-acceptance-20261014/view-exposure-administrator.json` under
`.security/migration-reset/`.

On 15 October, genuine populated-manager acceptance exposed a separate frontend
dependency: twelve sequential dashboard reads delayed the saved application beyond
two minutes. Application cases and inspection reports now load concurrently in their
own administrator-scoped query; the officer roster has its own query and retry.
Supabase no longer reads both manager-list aliases. Existing `adminData` invalidations
cover both queries, and the native read/write boundaries above are unchanged.

Each query captures the administrator context, consumes cancellation, uses a
30-second API deadline and stops interval polling after an error. Failed initial
reads show retry instead of an empty list. **38 genuine browser assertions passed**:
actual saved ownership/case/notice, guest 401 and stale-context 409 denials on three
endpoints, populated 1440/375px cards, and independent application/roster recovery
with actual held requests and real replies. The user's new officer is active;
no dispatch or decision was submitted. Final document-to-card load was 32,654 ms,
so cold authentication/provider/browser latency remains a separate limit.

Final frontend TypeScript/build, the earlier full Supabase builds, 25 source checks,
CJS syntax and whitespace checks pass. Evidence: `manager-review-browser.json`.
Run `node scripts/verify-supabase-manager-review-browser.cjs mindspacehqr@gmail.com --recovery`
with the genuine administrator already signed in. See the
[current continuation](../../SUPABASE_CONTINUATION.md) for remaining acceptance gates.
