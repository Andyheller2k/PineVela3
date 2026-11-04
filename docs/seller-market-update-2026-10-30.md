# Seller workflow and pending-signup update

30 October 2026. Prepared locally; not deployed to pinevela.app.

## Changes

- Seller selected controls, tabs, plan selectors and portal dialogs use blue/white
  in Light mode and yellow/navy in Dark mode.
- A file input's bubbling `cancel` event no longer closes its parent dialog.
  Cancelling product/service cover selection preserves the draft.
- Inventory/services retain their visited panels and decoded image nodes across
  seller tabs. Published marketplace photos use conditional reads: unchanged
  bytes return 304 after publication and maintenance checks. Private media stays
  `private, no-store`; revoked public access never gets 304.
- Store activation has address suggestions and the existing lazy map picker.
  Coordinates are saved beside the address in the existing location field.
  Suggestions debounce/cancel typing and stop after selection. The seller-only
  API bounds rate, concurrency, body size and cache lifetime. Photon receives
  only the typed place/selected pin, without credentials. Manual addresses work.
- Country/phone mismatch blocks the contact step before checkout. Known errors
  appear below their input/photo group. Non-field checkout/network failures
  appear beside the action in normal flow.

## Paystack on the live host

The owner confirmed the missing `PAYSTACK_SECRET_KEY` is now saved in Spaceship.
Restart `pinevela-app` to read it. Set `PINEVELA_PUBLIC_ORIGIN=https://pinevela.app`.
Production paid checkout still requires a live secret. Preserve the webhook
`https://pinevela.app/api/payments/paystack/webhook`.

From the existing hosting app root, the packaged helper prints safe flags only:

```sh
node tools/pinevela-check-payment-environment.cjs
node tools/pinevela-check-payment-environment.cjs --check-provider
```

The second command reads a Paystack integration setting; it creates no checkout,
charge or transfer. The local key passed this read-only check. A live host restart
and actual checkout are not verified; no payment was submitted during this work.

## Original user login and repeated unfinished signup

A hosted read-only check found active, verified original primary accounts for
current seller registrations, consistent ownership/email relationships and no
sign-in ban. It does not verify a typed password. No hosted account was changed.

The owner's scenario matches the implementation:
[Supabase retains an unconfirmed signup's original details](https://github.com/supabase/auth/blob/v2.197.0/internal/api/signup.go#L180-L185).
PineVela previously ignored the replacement password submitted with confirmation.
It now explicitly resumes eligible pending primary signups through resend, shows
that the original name/password remain on web/native OTP pages, and clears the
unused replacement password. Confirmed duplicates remain 409. Pending child
identities cannot be adopted as primary accounts. CAPTCHA, email budgets, OTP,
session binding, Terms and RLS boundaries remain.

For an account already confirmed using the older build, use **Forgot Password**
on login to set a password through email proof. Change the display name in account
settings. Re-registering a confirmed email does not replace its credentials.

## Verification and installation

Exact results are under `verification/seller-market-2026-10-30/`. Packaging requires
successful TypeScript, focused server/security and mobile tests, web/mobile/Android
builds and browser seller checks, and includes the actual Android check results.
The focused seller
tests passed 14 cases, signup/session checks passed 31, mobile checks passed 30,
and the final browser run passed 30 scenarios with no runtime exceptions. Browser account,
seller and checkout responses use local fixtures; they do not prove real RLS,
hosted login or a financial transaction. Android smoke checks use the signed-out
Pixel 4a/API 36 WebView without submitting account forms. iOS and physical phones
were not built/tested.

The final APK was installed over the development build, preserving app data.
Signed-out status, light welcome branding and native bars passed. A separately
measured physical tap opened the bundled Login card. The full native suite remains
incomplete: automated Sign in taps did not reach the expected card, including a
warm retry after dismissing an initial Android System UI ANR overlay. The failures
are preserved; this is not a six-scenario native pass. Authenticated seller flows
were not tested on Android. Test the development APK before wider distribution.

Persistent ZIP: `releases/web/pinevela-seller-update-20261030.zip`, also copied to
`/tmp/pinevela-seller-update-20261030.zip`. Back up the hosting app's `dist-supabase/`
and `dist-supabase-backend/`, extract into `pinevela-app` with both folders directly
inside it, then restart Node. Keep `app.cjs`, dependencies, environment and private
data. No new dependency, migration, DNS or SMTP change is needed. Restore the old
two folders and restart to roll back. This build includes preceding local changes.

The debug APK is saved at `releases/android/pinevela-seller-update-20261030.apk`;
earlier builds remain. Install it over the previous development build after the
backend update. Packaging does not deploy remotely. This APK is for testing,
not a Google Play release.
