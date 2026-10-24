# CAPTCHA setup for PineVela

PineVela supports Cloudflare Turnstile through Supabase Auth. The integration is
prepared; real protection becomes active after you configure your own keys in
both services. The site key is public. The secret key belongs only in Supabase.
Never paste either an API credential or the CAPTCHA secret into chat.

## Setup steps

1. Open [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile)
   and choose **Add widget**. Name it PineVela, choose **Managed**, and allow the
   exact app hostnames: `pinevela.app` and any subdomain you actually use. For the
   current preview, also allow `localhost` and `127.0.0.1`; remove unused development
   hostnames from the production widget later. No domain transfer is required.
2. Copy the public **Site key** into the backend environment as
   `AUTH_CAPTCHA_SITE_KEY`. Restart the PineVela backend and open its login page.
   `/api/auth/captcha` should return `enabled: true`, `provider: "turnstile"` and
   your public site key. Complete a security check before proceeding.
3. In the PineVela Supabase project, open **Authentication → Bot and Abuse
   Protection** (or **Settings → Authentication → Bot and Abuse Protection**).
   Enable CAPTCHA protection, choose **Cloudflare Turnstile**, paste the matching
   **Secret key**, and save. Do this only after the frontend/widget is ready,
   because Supabase will then require tokens on protected auth requests.
4. Try a real account sign-in and a genuine signup. Confirm tokenless/invalid-token
   attempts are rejected, then check signup, resend and password recovery with a
   newly completed challenge each time. Check enrollments and staff invitations
   before launch too. Missing keys mean this setup is not yet verified live.

## Integration behavior

The widget loads only on active authentication forms when configured. It runs in
the background and asks for interaction when necessary. Narrow forms use the
compact widget. Failure displays a retry action and keeps submission closed.
An issued proof shows **Security check complete**. A pending check offers a
retry after 45 seconds; a later genuine completion still enables the form.
Tokens stay in memory, are passed as `captchaToken` in the request JSON, and reset
after every attempt. Switching form/account discards the earlier token. No secret
key is bundled into the frontend.

Protection covers password sign-in, signup/resend, password recovery, shared
identity enrollment, retained-account reactivation, staff invitation signup and
password verification, and manager password changes. OTP confirmation itself
uses the emailed proof; Google OAuth keeps its existing provider workflow.

The backend forwards CAPTCHA to Supabase for validation. The public configuration
endpoint reports PineVela's configured site key; it cannot prove the dashboard's
CAPTCHA switch is enabled. Always complete step 3 and test both valid and invalid
requests. CAPTCHA supplements rate limits; network-level flood protection belongs
at the hosting/CDN boundary.

PineVela's increasing resend cooldown applies at its own API. Keep Supabase's
native email minimum interval at least 300 seconds and retain its email/token
rate limits, because requests sent directly to Supabase do not use PineVela's
application-level cooldown table. Supabase performs the single Turnstile token
validation; PineVela does not redeem the same token a second time. Widget actions
help identify forms in Cloudflare analytics; native Supabase validation does not
establish an application-specific action/hostname policy.

## Application replay guard and provider follow-up

Migration `20261022214514` adds a private table containing only SHA-256 proof
fingerprints and server-controlled timestamps. Before entering any protected
workflow, the HTTP middleware commits one claim. The same proof cannot be
forwarded again through PineVela, including another portal or app process. It
stays consumed after wrong credentials, an invalid proof or an upstream timeout;
the widget must issue another proof. Supabase performs the actual CAPTCHA
validation once. No service-role bypass or second Siteverify call is used.

Fingerprints last ten minutes, covering the provider's five-minute proof
lifetime. Cleanup removes at most 100 expired entries per admission. Capacity
is 50,000 fingerprints; lock waits are capped at two seconds. Busy admission
returns a retryable `503`; duplicate proofs return `422 captcha_failed`.
The local verification command is
`npm run db:local:captcha -- /absolute/path/to/owned-stack-metadata.json`.
It tests real PostgreSQL admission and native local workflows; its random
technical strings do not establish genuine Cloudflare validation.

On October 22 a genuine unused Cloudflare proof expired after 310 seconds, but
an immediate genuine-proof replay was accepted by direct native Supabase Auth.
PineVela's guard closes reuse at the app API. The native behavior remains a
separate provider issue: keep CAPTCHA enabled, inspect the widget's token
validation analytics and matching Supabase Auth logs, confirm the intended
widget/provider configuration, and share only sanitized timestamps/request IDs
with Supabase support. Do not share tokens, passwords or the widget secret.
See [the verification report](auth-protection-verification.md) for current
results and limits.

The October 23 production-readiness retest reproduced this boundary with genuine
production-widget proofs: native missing/invented proofs failed, but one genuine
proof reused after five seconds with different nonexistent credentials reached
credential checking again. A fresh proof still worked. PineVela's API rejected
exact and cross-alias reuse. Hosted Auth still reported `v2.197.0`. Sanitized
request IDs and owner-side configuration/log steps are recorded privately under
`.security/production-readiness-2026-10-23/captcha/`; no provider setting or support
message was changed, and no account, email or session was created. Native replay
rejection remains an open public-launch requirement.

References: [Supabase CAPTCHA protection](https://supabase.com/docs/guides/auth/auth-captcha),
[Turnstile rendering and lifecycle](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/),
[widget configuration](https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/).
