# Hosted signup password rejection — 29 October 2026

## Confirmed cause

The owner supplied the hosted Supabase Auth event for `POST /signup` at
14:21:39 UTC: HTTP 422, `weak_password`. The configured policy requires lowercase
and uppercase ASCII letters, a digit and a supported symbol. PineVela's older
provider adapter discarded that explanation and returned “Authentication request
could not be verified.” The frontend advertised six characters while the server
already required eight.

This request failed password validation before confirmation mail was sent.
It does not establish a Resend delivery failure. The owner confirmed custom SMTP
is enabled. Supabase Auth SMTP and the app's support Resend credentials are separate.

## Changes

- Share an 8–256 character signup validator between the browser and server,
  matching the confirmed provider character classes. Keep existing sign-in unchanged.
- Show compact password requirements next to the signup field and reject invalid
  passwords before mounting CAPTCHA. Incomplete passwords cannot show “Strong.”
- Return an actionable fixed `weak_password` explanation rather than the generic error.
- Classify known signup/email configuration errors safely and recognize both provider
  error-code formats. Preserve CAPTCHA, confirmation, Terms, duplicate-email and
  rate-limit checks.
- Add bounded, allowlisted server diagnostics without raw provider messages,
  addresses, passwords, verification/CAPTCHA tokens or credentials.

## Live inspection and limits

Read-only checks returned HTTP 200 for the live app health, CAPTCHA configuration
and Supabase public Auth settings. Email signup is enabled, email confirmation
is required, and the live app enables Turnstile. The Resend app key is sending-only,
so read-only domain/email API requests returned `restricted_api_key`. Its access
was not broadened. Public sending DNS records exist; DNS presence does not prove
Resend verification or inbox delivery.

No hosted settings, DNS records, migrations or user accounts were changed. No
real signup email was sent by this debugging session. Local checks and the prepared
ZIP do not establish installation or inbox delivery on pinevela.app.

Verification passed: production frontend/backend build, TypeScript, 36 focused
assertion tests across six files, and 18 mobile/desktop browser scenarios using
local transport and a synthetic CAPTCHA SDK. Eleven additional checks invoked
the actual registered signup handler with guarded database/provider doubles;
these were not full HTTP integration tests. Both password gauges were checked,
including rejection of every missing character class. Error privacy, unknown
responses, CAPTCHA admission/replay, Terms and rate-limit regressions passed.

## Install and verify

1. Back up the existing application build folders privately.
2. Extract the prepared signup update ZIP into the existing `pinevela-app` folder,
   replacing `dist-supabase/` and `dist-supabase-backend/` without extra nesting.
3. Restart the existing Node application. Keep `app.cjs`, environment, dependencies,
   private files, SMTP, CAPTCHA, database and DNS configuration.
4. Reload the browser. A password missing a required character class should show
   the clear requirements without requesting CAPTCHA or sending a signup request.
5. Retry once using your own mailbox and a unique password that meets every rule.
   Check that the confirmation email arrives, then complete verification. Never
   share the password or email code in chat.

If that valid attempt fails, inspect the new `[Auth provider] Request rejected.`
log category and the matching Supabase Auth event. For `weak_password`, review
the configured password policy; for `email_address_not_authorized`, check the
SMTP configuration; for a mail-provider error, inspect Resend's delivery logs.
Keep confirmation and CAPTCHA enabled. Do not repeatedly retry or lower security
requirements to work around a delivery problem.

Rollback restores the prior two build folders and restarts the application.
No database changes are involved in this update.

References: [Supabase Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes),
[Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp),
[Resend SMTP with Supabase](https://resend.com/docs/send-with-supabase-smtp).
