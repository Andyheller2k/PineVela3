# Retained seller re-registration

Migration `20261013104625_verified_seller_registration_cycles.sql` introduces a
seller registration generation on the retained account context. Each application
and store binds that generation, and each store references its exact approved
application. There is one application per enrollment/generation, one store per
application/generation, and at most one non-closed store per seller. Existing
records receive generation zero and retain their original IDs.

A closed seller may restart only from its original primary account. The separate
student identity is verified by Supabase email code/link or password sign-in,
followed by `/user` verification and matching native Auth session. If a seller PIN
exists, its current hash, lockout and version must also pass. The native trigger
independently checks original ownership, verified enrollment, subject/session,
access invalidation epochs, bans, competing registration and closed stores without
unfinished orders/payments. Re-entry does not manufacture Auth verification times.
Provider proof remains server-owned; client identity fields are rejected.

The transaction increments the generation, makes the seller pending review, reuses
its owned enrollment and removes old seller application bindings. It emits one
primary-account notice and audit event; failure rolls everything back. Concurrent
retries reuse the pending registration. Auth users/sessions, profile, original
owner, portal PIN and the shared resident portal remain intact. Re-entry grants no
seller login until a new application is approved.

The primary UI offers verified re-registration for a closed seller. Closed or
older applications do not masquerade as current approval. Current application
submission, administrator decisions, Auth/store projection, setup, uploads,
payment authorization, public eligibility and order/message mutation checks select
the current cycle and exact store approval. Old applications and stores cannot be
reassigned to another cycle or revived. Raw historical views retain their existing
owner/admin boundaries; no new browser grant or SECURITY DEFINER function is added.

A new approval creates a fresh store, with separate setup, registration payment and
two-month access period. Historical payments remain paid records, but callbacks
report them as historical and cannot advertise access to the new store. Old checkout
retry keys cannot silently stand in for a new registration payment. Old orders,
reviews/messages and payment foreign keys remain attached to their original store.

The schema does not enable system-wipe execution or implement the general market
closure worker. Genuine institutional email/PIN browser acceptance and live payment
callback acceptance remain separate checks; do not close real accounts for testing.

Verification:

```sh
npm run db:verify-seller-reenrollment -- <genuine-auth-backup> <pre-enrollment-backup>
```

The verifier uses actual archived Google subjects/native sessions in an isolated
local restore. The two-cycle payment scenario uses a real local zero-fee policy,
not fabricated Paystack replies. No cloud accounts or product fixtures are created.
