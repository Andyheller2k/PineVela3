# Google manager enrollment during development

The user deferred domain, Resend and final email-domain/token delivery setup until
after development persistence cutover. The local Supabase preview now accepts a
separate genuinely verified Google identity for a manager without an organization
mailbox. This policy does not grant operational manager access before inspection
and administrator approval.

`PINEVELA_DEV_GOOGLE_MANAGER_ENROLLMENT=true` is server-only and requires a direct
loopback host and socket peer, non-production mode and no configured public origin.
It defaults off. Ordinary email enrollment retains its existing domain checks;
Supabase email confirmation remains enabled. The primary owner and manager use
different identities. Existing PineVela profiles or administrator identities cannot
be adopted as managers.

The primary session starts an owned enrollment and a real Supabase Google popup.
The server retains PKCE, a one-time namespaced state, a private nonce and the captured
primary actor; an HttpOnly Lax flow cookie correlates the callback. After provider
code exchange, the callback verifies the exact email, native Google identity and
live native session, revalidates the primary actor and finishes the owned enrollment.
Provider tokens stay server-side, the proof session is locally signed out, and no
primary authentication cookie or portal binding is replaced. Messages from the
popup only trigger a saved-state read. Reload/cancel controls recover from slow or
uncertain replies; failed policy/status reads show a retry state.

Migration `20261014150839_google_manager_development_enrollment.sql` (69) only updates
the existing private Auth initializer. An initial reserved Google signup without its
private nonce defers all app profile/context creation. The verified owned callback
later supplies that nonce. It reuses the existing enrollment, identity, context and
inspection model. No table, public grant or RLS policy is added. The initializer is
not callable by browser roles or the scoped backend role. Its applied SHA-256 is
`9966ba676d9ad019b44c36e77a18beeedd802c54cf3b39b4404ca70bab716fa5`.

Verification recorded in private `.security/migration-reset/` reports:

- 32 native Google-enrollment checks passed in isolated PostgreSQL with genuine
  archived Google identities and sessions. Ownership, nonce/email/session mismatch,
  existing-profile adoption, cancelled enrollments, deferred role creation, pending
  status, primary binding preservation and exact retries are covered. Auth rows
  remain unchanged; no provider replies or identities were fabricated.
- The existing manager/residence regression passed 139 native checks through all
  69 migrations. Both native security-advisor reports contain zero findings.
- 82 actual HTTP checks passed, including guest, wrong-role, cross-site and unknown
  namespaced callback denials; product snapshots remain unchanged. Genuine signed-in
  administrator checks passed 12 assertions, including manager denials and the empty
  residence directory at desktop/mobile widths. Populated review is not claimed.
- Focused TypeScript, Supabase frontend/API/both worker builds and source checks
  passed. Replacement runtime dependencies contain no JSON persistence.
- Encrypted pre/post migration database backups are retained. The post-migration
  archive `a9af3c54-c91d-4f9e-ab65-81855e572386` restored successfully into isolated
  PostgreSQL: 69 migration versions, 37 application tables with RLS, 14 private
  projections and the matching server delivery key. Storage bytes have a separate
  existing backup; database dumps alone do not contain those bytes.

On 15 October the user confirmed a different manager email: **mindspacehqr@gmail.com**,
owned by primary **finalform2k@gmail.com**. This supersedes the earlier intended
jamesgunnhunter address. The user completed genuine Google signup and submitted the
property themselves. The actual enrollment is completed; the manager portal is pending
and its application is `inspection_pending`. No automation fabricated an inspection,
approved this property or unlocked the pending manager.

The actual saved account passed **23 genuine browser checks** for verification,
ownership, preserved primary sign-in, native role/stale-scope denials and real reload
into the submitted status page. **50 unchanged-checkpoint checks** confirm the actual
Google identities, callback audit, saved case/assignment, primary-only registration
notice, all-three-administrator submission notices and foreign-primary isolation.
All 120 archived Auth/application/Storage tables remain unchanged. Private reports:
`google-manager-created-browser.json` and `created-manager-checkpoint.json`.

The new database recovery checkpoint `338c3cef-ddb7-48f3-ac1c-bca0c31f0384` restored
successfully, including RLS/privileges and private server-key recovery. Its matched
Storage archive `003b60f3-4d45-4651-a28c-eadc108876a6` reconstructed all seven objects
and 3,194,064 bytes locally. These are continuation recovery checks; writer-frozen
final cutover and off-host recovery remain separate. Existing cancelled Google
reservations were preserved. Fictional inspection positives remain in isolated tests.

After transient connection timeouts, the final read-only live verifier passed
75 checks: all 69 hashes match and browser/scoped-backend execution of the private
initializer remains denied. The final built-server startup, public reads and private-
file denial checks passed with zero cloud record changes. See [the continuation checkpoint](../../SUPABASE_CONTINUATION.md).

Before public release, configure the owned domain and authenticated email delivery,
then verify actual signup/work/student single-use tokens, expiry, resend and rate
limits and enforce the agreed address requirements. Closed-manager reactivation's
existing email proof remains a separate delivery/browser acceptance item. This round
does not switch the default backend, remove JSON, execute a reset or enable wipe gates.
