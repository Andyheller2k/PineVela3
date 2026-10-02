# S05 remediation — 2026-10-02

Status: production signup policy implemented and checked automatically. At the operator's subsequent request, temporary generated codes are enabled exclusively for local source-server development. Those codes do not establish email ownership. Live email activation is deferred until the operator configures a domain and Resend. Real Supabase project settings and signup API acceptance were checked; a fresh confirmation request returned HTTP 429 from Supabase. Successful inbox-confirmed activation is still pending the provider's sending-limit reset and a valid, unopened confirmation link. Do not interpret signup API acceptance alone as inbox delivery or successful verification. This report includes the explicitly requested local development exception to S05.

## Change

`POST /api/auth/register-unified` and `POST /api/users/register` with `role=user` now use the same pending-signup handler. In the production/email flow, neither creates a PineVela user, sets a login cookie, returns a session, or returns a verification code before inbox confirmation. Other role onboarding remains under its existing authorization and is outside this finding.

Supabase Auth generates and delivers the email challenge. The server calls its signup and verification endpoints, checks the project's confirmation settings, and resolves the authenticated user through Supabase's user endpoint. Activation requires the confirmed email and stable Supabase user ID to match the pending signup. Submitted profile claims, IDs or verification flags cannot substitute for this proof. Missing configuration, provider errors, disabled confirmation and mismatched identities fail closed. No provider payload, password, emailed verification code or Supabase session is logged or returned to the browser.

Pending records contain a salted password hash, an opaque cryptographically random signup ID, the expected provider identity/project and a 15-minute deadline. The ID is a registration binding, not an email confirmation secret. Verification requires that binding and a real emailed challenge. Six-digit codes additionally require the chosen registration password. The built-in email link carries a long one-time token hash and can confirm the bound registration without re-entering the password; it never sets or replaces the stored password. Pending records and rate counters are saved in the ignored private operational database. Cleanup runs at startup and every minute and is also applied on requests.

Limits: five verification attempts per email per 15-minute window, three sends per email per window, a 60-second send cooldown, ten sends and fifty verification attempts per source IP per window. Limits survive server restart and resending does not reset verification attempts. Per-email requests are serialized to prevent duplicate activation or send/verify races. Rate keys hash the source identity. State has bounded capacity. These controls use this application's current single-server persistence model; a future multi-instance deployment needs shared atomic counters.

The production/email signup screen does not display or auto-fill an email secret. It accepts either the six-digit code or the confirmation link from the email. Submitted links must point to the configured Supabase project and its signup verification path. Only the extracted token hash is sent to Supabase; submitted URLs and redirect parameters are never followed. Recovery, other-project and arbitrary links are rejected. The fabricated Google signup action was removed: it generated an unrelated address and falsely reported authentication success. No replacement OAuth simulation was added. The legacy full-flow test script now requires explicitly configured real inboxes and manually entered codes rather than relying on a leaked signup code. Isolated account-isolation regression tests seed their own private test identity; they cannot bypass production verification.

## Requested temporary development codes

The ignored local `.env` enables `PINEVELA_DEV_SIGNUP_CODES=true`; `.env.example` defaults to false. `npm run dev` on localhost returns a real cryptographically generated six-digit challenge and displays it with a “Use this code” button. It requires the bound signup ID and selected password, stores only a challenge digest and password hash, and retains expiry and attempt limits. No email is sent for this local path. Codes cannot be used after expiry or activation.

This mode requires an opted-in `server.ts` source entrypoint, development/absent `NODE_ENV`, an actual loopback connection, a localhost host, and no forwarding headers. Production/test environments and built `dist/server.cjs` ignore the flag. Development accounts explicitly have `isVerified=false`, `verificationStatus=development` and `emailVerificationProvider=development`; they never receive a Supabase ID or inbox-verification timestamp. Their password login, existing sessions and linked subaccounts are denied outside local development. Identity ancestry uses stored parent IDs, not shared email addresses.

Restart the local server to use generated codes. Set the flag to false when enabling real Supabase email again. Existing development accounts will then be unavailable; they are not silently converted into inbox-verified accounts. The Supabase flow remains configured for later SMTP delivery without changing signup authentication logic.

## Supabase setup

- The provided public project URL/key are stored only in ignored `.env` with file mode 0600. No service-role key is needed or accepted by this integration.
- Project settings read successfully: email provider enabled, signup enabled, automatic confirmation disabled.
- Keep Confirm email enabled. The built-in signup email works as supplied: copy its confirmation button link into PineVela without opening it first. A custom email template may include `{{ .Token }}` later to offer a six-digit code. The operator reported that this hosted project requires custom SMTP before editing templates, so no template edit is needed for development.
- Configure email-code expiry as 15 minutes in Supabase too. PineVela independently enforces its 15-minute pending deadline.
- During development, the built-in sender is restricted to project/organization team-member inboxes and has a low sending limit. Configure custom SMTP before wider signup. Resend SMTP can be selected entirely in Supabase; application authentication code stays unchanged.
- Restart the application server after updating `.env` or deploying this patch.

Provider documentation: [email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [verification](https://supabase.com/docs/reference/javascript/auth-verifyotp), [development sender and custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Verification

| Check | Result |
|---|---|
| Type validation and secret-free pending metadata | Passed |
| Missing/wrong signup binding, password, malformed or expired challenge | Rejected |
| Confirmation disabled, email provider disabled, wrong/unconfirmed provider identity | Rejected by policy tests |
| Attempt limit, resend cooldown, concurrent requests and restart persistence | Passed |
| Both primary-signup endpoints without provider configuration | HTTP 503; no account, cookie, session or code |
| Direct `role=user` alias bypass | Removed; same pending policy |
| Client requests `role=admin` through role alias | HTTP 400 |
| Production/email pending inputs without real provider confirmation | Cannot activate |
| Generated development code | Local signup, password login, expiry, incorrect password/code and restart checks passed |
| Development mode requested through external host/forwarding headers | Code not returned; normal provider policy applies |
| Development account/session outside development | HTTP 401; cannot authenticate |
| Full security regressions | `npm run test:security`: all 42 passed |
| Production build | `npm run build`: passed; existing bundle-size warning |
| Project TypeScript | `npm run lint`: passed; redundant narrowed comparison at `src/components/PageDigitalMarket.tsx:3536` replaced with `required`, preserving Fixed/Hybrid location requirements |
| Focused TypeScript | New modules, tests and live runner passed after link support was added |
| Private-data guard | Passed; `.env` and operational data remain untracked |
| Real Supabase public settings | HTTP 200; confirmation required |
| Real signup requests | Supabase accepted earlier requests; no local account or session issued. This alone does not establish inbox delivery. |
| Fresh email request | Supabase HTTP 429; provider sending limit prevents another live signup email now |
| Real confirmed activation and authenticated session after restart | Not completed: operator supplied a localhost `otp_expired` error redirect, which contains no proof; fresh email blocked by provider HTTP 429 |

The live test uses an isolated local database and the actual configured Supabase project. No mocked provider is used. Any real Supabase Auth identity created for the operator-provided address remains in the Supabase project; its disposable local database is removed when the test finishes. Existing PineVela administrator records and credentials are untouched.

## Scope

This is a signup inbox-verification integration with Supabase Auth. Existing PineVela local password validation, password changes, recovery and bearer sessions remain in place; authentication and database migration is not complete. Verified new accounts record `supabaseUserId`, `emailVerificationProvider` and `emailVerifiedAt` for the planned migration. Supabase is used as the inbox confirmation authority here, while PineVela remains the current account/session authority. Existing unverified historical accounts are not silently deleted or changed. No commit, push or deployment was performed.

## Remaining live verification

After Supabase allows another email, run `node --import tsx scripts/verify-signup-live.ts --email` followed by a real team-member inbox address in an interactive terminal. Copy the newest email button's destination with Copy link address and paste it into the hidden prompt, without opening the link. A browser redirect such as `localhost:3000/#error=otp_expired` is not the email token and is rejected. The runner checks real Supabase confirmation, account activation, replay rejection, original password-hash retention, login/session and restart persistence. It uses no provider simulation and removes its local database afterward. Earlier verification attempts expired while waiting for inbox/template setup; the 15-minute deadline was not disabled to force a pass.
