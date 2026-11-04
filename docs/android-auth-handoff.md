# Android authentication handoff

The bundled Android client uses PineVela's existing login and signup forms
inside the app. Email/password login, account creation, email-code verification
and password forms use the native private API transport. Session cookies stay
in an Android Keystore-encrypted jar, outside WebView cookies and JavaScript.
Starting an in-app login, signup or re-entry invalidates older pending browser
proofs. Queued and in-flight replies are bound to the current native intent and
session generation; a delayed Google return cannot replace the newly selected
account. A failed new attempt preserves an already verified session.

Current Android builds open Google's native account chooser through Credential
Manager for Google sign-in and signup. The ID token stays in Java and is sent
directly to PineVela's fixed HTTPS server. A five-minute, one-use flow binds a
server nonce and S256 verifier to that token. The server exchanges it through
Supabase, checks the verified Google identity and live account binding, then
issues the existing HttpOnly session cookies. Android validates the complete
success reply before saving those cookies in its private encrypted jar, and the
WebView only receives a fixed portal destination. Explicit Google signup records
the current Terms; login does not create consent. A cancelled or failed chooser
preserves any earlier verified app session. This flow never opens PineVela's
website or puts a provider token in a URL, WebView, analytics, or browser storage.

The legacy browser handoff remains for older APKs. After fresh verification, an
explicit browser button transfers that session into Android. The fixed Google
handoff launches Google's existing flow directly, without first showing the web
login/signup card. Google signup carries the explicit current Terms acceptance
from the Android form; the backend validates the version again. Older APKs that
do not supply acceptance still use the browser Terms form. The provider hint
and consent metadata never establish authentication.
No provider token is returned to JavaScript, placed in a URL or stored in
browser/Capacitor preferences.

Required CAPTCHA runs only when submitting a protected form. Android embeds
the exact unprivileged `https://pinevela.app/api/auth/mobile/captcha` document,
so the widget runs on its configured production hostname. This document has
no native bridge, form, session access or cookies. A one-use message channel
checks its exact source and origin; the existing server/Supabase validation
still decides whether the bounded proof is valid. No production localhost
allowlist, CORS exception, provider bypass or idle refresh was introduced.

## API contract

The current Google flow uses `POST /api/auth/mobile/google/native/start` with
`mode`, `client` and the S256 `challenge` (and current `termsAcceptance` for
signup). The response contains only a one-use `flowId`, hashed Google nonce,
public Web OAuth client ID and expiry. Android requests a Google ID token for
that audience and nonce, then POSTs the token, flow ID and verifier to
`/api/auth/mobile/google/native/complete`. The server consumes proof before
exchange, verifies the token through Supabase, and returns only
`{authenticated:true,redirectTo}` with the normal private cookies. The provider
is enabled in Supabase; the Android OAuth client is registered in the same
Google Cloud project for the app's package and signing SHA-1. The development
package is `app.pinevela.mobile.debug`; store builds need the release package
and their actual signing SHA-1 registered separately. A server restart expires
unfinished attempts. Multiple backend processes require request affinity or a
shared atomic flow store. The existing CSRF boundary and live actor/RLS checks
still apply.

The following numbered flow describes only the legacy browser handoff:

1. Android creates a random verifier and state in private native storage. It
   posts `/api/auth/mobile/start` with exactly `challenge` (S256 base64url,
   43 characters), `state` (43 base64url characters), `mode` (`login` or
   `signup`) and `client` (`android` or `android-debug`), with optional fixed
   `provider: 'google'` for Google. Google signup may additionally carry exactly
   `termsAcceptance: {accepted:true,version:<current version>}`. Other modes
   reject that field, and invalid or stale consent is rejected. The only returned field
   is `browserUrl`, under the configured public origin.
2. The system browser opens that URL. Its one-use ticket establishes an
   HttpOnly, SameSite=Lax, production-Secure `pv_mobile_flow` cookie under
   `/api/`. Google login and signup with validated Terms redirect to
   `/api/auth/mobile/google`: a no-store, nonce-CSP launch document that POSTs
   to the existing same-origin `/api/auth/google/start` endpoint and navigates
   to Supabase's Google authorization URL. It never renders application forms.
   Before leaving, it sets the existing boolean tab marker
   `pinevela:mobile-handoff-active=1`, so the callback destination can show the
   browser return prompt without a `mobile` query parameter. This marker contains
   no identity, token or proof; the server-bound cookie and fresh verification
   still decide whether a return is authorized.
   Other/older attempts retain `/#/login?mobile=1`, adding `mode=register`
   for signup and `native_provider=google` when requested.
   Neither the native verifier nor an Auth token enters that URL.
3. `/api/auth/mobile/status` returns `{active:false}` or
   `{active:true,mode,fresh}` (plus the fixed provider hint when requested).
   Existing browser session restoration alone never
   counts as fresh proof. Password login, confirmed signup/re-entry and the
   verified Google callback can establish proof only inside this bound flow.
4. Once authenticated, the browser offers an explicit **Continue in PineVela
   Android** button. Its POST to `/api/auth/mobile/finish` has exactly `{}`.
   The server rechecks the live provider session, active account binding,
   restrictions and current Terms. The browser session must match the freshly
   issued session recorded in this exact attempt. Existing signed-in users
   must sign out and sign in again before continuing.
5. Finish returns only `returnUrl`: `pinevela://auth/callback?code=…&state=…`
   or the fixed `pinevela-debug` scheme. The code expires within 60 seconds.
   It clears browser authentication/flow cookies without revoking the session
   being transferred. No caller-selected redirect is accepted.
6. Native validates the exact callback scheme/host/path and saved state. It
   POSTs `/api/auth/mobile/exchange` with exactly `code`, `state`, `verifier`.
   The server verifies S256 and consumes the code before asynchronous work,
   rechecks Supabase and the live application binding, then issues the existing
   `pv_sb_access`/`pv_sb_refresh` HttpOnly cookies with `{ok:true,redirectTo}`.
   Android's native-only encrypted jar consumes those cookies; JavaScript sees
   only the success/result path. Failed validation installs no cookies, even
   if a provider refresh occurred during the internal check.

The complete attempt expires after five minutes. Up to 1,000 process-local
attempts are retained, expired entries are reclaimed on requests, and the
existing authentication IP budget covers start/finish/exchange. Restarting the
server invalidates unfinished attempts. Multiple backend processes require
request affinity; a future shared store must preserve atomic single use and
expiry. There is no new database schema or alternate identity authority.

## Security and deployment

Keep existing CSRF, CAPTCHA, application authorization, RLS and cookie flags.
Browser status also rejects explicit foreign origins/cross-site requests and
has no CORS allowance. Tokens remain in server memory during the brief handoff;
only the initial browser ticket and final one-use code travel through URLs.
Application log sanitization strips mobile authentication query strings. Ensure
the hosting proxy also omits queries for `/api/auth/mobile/browser` and Google
callback paths. Responses use no-store and no-referrer.

Deploy the backend endpoints and browser completion component together before
using a production APK. `PINEVELA_PUBLIC_ORIGIN` must be the existing exact HTTPS
site origin. Supabase's existing Google callback remains unchanged. Verified
Android App Links additionally need a hosted asset-links file matching the
signing certificate. Custom-scheme returns always require the native state and
S256 verifier checks. Maintenance protection stays conservative: mobile
handoff routes remain behind the existing maintenance boundary.

## Verification

`node --import tsx tests/mobileAuth.test.ts` tests the HTTP state machine with
explicitly intercepted provider/database dependencies. Its passing results
cover client/body validation, fixed redirects, fresh proof, existing-session
rejection, cookie ambiguity, cross-site denial, account substitution, wrong or
replayed proofs, concurrency, Terms, live-binding failures, staged refresh,
expiry and bounded capacity. These are boundary tests, not evidence of genuine
hosted Google login or an Android device round trip. Actual local Auth/SMTP and
native emulator checks must be recorded separately.

`tests/mobileGooglePage.test.ts` executes the launch document's script against
synthetic responses, checking login/signup request bodies, retry behavior and
unsafe navigation rejection. The November 1 release also checks the actual
Android bundle's Google buttons and the live public provider authorization
redirect without submitting a real Google identity. See
`docs/verification/android-safe-area-2026-11-01/` for the recorded scope.

On 29 October 2026, `scripts/verify-and-serve-android-local.ts` passed 27 checks
against a fresh owned PostgreSQL 18 instance, cached genuine GoTrue 2.197.0,
captured local SMTP and all 84 application migrations. Two local-only identities
completed actual email confirmation and Terms acceptance. Verification covered
real password login, fresh browser handoff, Secure/HttpOnly native exchange,
identity restoration, replay rejection, another identity's context/profile
selectors, copied-cookie revocation after logout and preservation of the other
identity. No hosted records were changed or external email sent.

The isolated provider has CAPTCHA disabled and no Google credentials or Storage
service. These checks do not establish genuine Turnstile/Google completion or
authorized private-photo bytes. The negative private-media checks cover missing
identifiers only. The local TLS emulator server uses a task-owned CA; release
builds must not contain that CA, loopback API configuration or test credentials.
