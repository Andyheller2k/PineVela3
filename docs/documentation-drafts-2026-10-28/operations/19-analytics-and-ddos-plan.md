# Website analytics and DDoS: observations and setup plan

Status: INTERNAL PLAN. Read-only checks performed 28 October 2026. No analytics, DNS or hosting protection setting was changed during this audit.

Update later on 28 October: the owner supplied GA4 ID **G-NWBP5E04F9**. The
subsequent app package implements optional, consent-gated analytics and manual
sanitized SPA page views. The original audit observations below describe the
earlier deployed site. The new ZIP still needs manual hosting installation and
a first real visitor check in Realtime. Enhanced measurement was disabled in the
Google stream and verified through its public tag. See
`docs/google-analytics-setup-2026-10-28.md` for implementation and installation.

## What was observed

The homepage returned HTTP 200 with `Server: LiteSpeed`. DNS used Spaceship nameservers and A record 66.29.148.39. No Cloudflare proxy response markers were observed; this supports the conclusion that the checked hostname was serving directly from hosting. A private Cloudflare/Spaceship account setting was not inspected, and no attack/load test was performed.

No GA4, GTM, Cloudflare Insights, Clarity, Plausible, PostHog, Umami or Matomo visitor tracker was identified in the current source or served entry page. Manager operational statistics are not a website visitor-analytics service. The public CAPTCHA configuration reports Turnstile enabled for protected forms. Turnstile can operate without a Cloudflare reverse proxy and is not evidence of whole-site DDoS filtering.

Spaceship's published shared-hosting information describes server-level DDoS protection and distinguishes it from individual-website protection. This is the provider's published product scope, not confirmation of a particular purchased add-on or account switch. Existing app code also limits API/auth/room-key attempts. In-process request budgets do not replace distributed edge/network DDoS mitigation.

## Tracking useful visits

Use GA4 if you want traffic sources, engagement and conversion events. Create an Analytics property → Web stream for https://pinevela.app → obtain its public `G-...` Measurement ID. Owner input still required: selected provider, account/property access or ID, lawful tracking basis/preferences and retention. Do not send an API secret or Google password.

Because PineVela uses hash-based client routing, instrument sanitized virtual screen views and verify navigation in DebugView. Do not rely only on initial page load or create duplicate automatic/manual page views. Strip callback/verification parameters and internal identifiers from page paths and referrers. Disable automatic form collection if it could capture account or application data.

Suggested minimal event plan:

| Event | Useful attributes | Exclude |
| --- | --- | --- |
| Public landing/catalog view | Screen name, device category | Identity, exact location, tokens |
| Market search/category/filter | Category, result-count bucket | Raw searches containing personal data |
| Listing / property view | Approved public category/type | Resident/room IDs or private ownership details |
| Signup completed | Method category, success event | Email, name, password, verification code |
| Merchant application completed | Completion event | School ID, university email, application contents |
| Order request completed | Event/count, approved value if necessary | Handover PIN, payment credentials, message contents |

Analytics describes traffic and activity; it does not reveal anonymous visitors' real names. Record authenticated security events separately with restricted access. Adopt an approved cookie/analytics notice, appropriate choices/consent and a withdrawal process before optional tracking where required. Verify on a fresh phone/browser that collection obeys the selected policy.

Cloudflare Web Analytics is an alternative for simpler aggregate traffic/performance. Its current documented feature set lacks custom event tracking, so it does not replace a conversion-event plan.

## DDoS next steps

First inspect Spaceship Hosting Manager → Manage hosting plan → Hosting usage → Reports log for provider DDoS reports and confirm the purchased protection with hosting. For additional site-level filtering, evaluate a Cloudflare proxied DNS setup and managed DDoS/WAF controls. Do not change nameservers or proxy mail records as part of a tracker install.

Before any switch, inventory existing DNS and mail/verification records, preserve TLS and origin compatibility, confirm real client IP handling using explicit trusted proxy configuration, bypass caching for private/auth/API responses and test Google redirects, CAPTCHA, uploads, payments/webhooks and installed-app requests. A setup must not create repeating challenges inside the signed-in app. Apply changes only after a concrete reviewed configuration is ready and authorized.

Official references: [GA4 SPA measurement](https://developers.google.com/analytics/devguides/collection/ga4/single-page-applications), [GA4 setup](https://support.google.com/analytics/answer/9304153), [Spaceship hosting](https://www.spaceship.com/en-GB/web-hosting/), [Spaceship DDoS reports](https://www.spaceship.com/blog/shared-hosting-by-spaceship-updates/), [Turnstile](https://developers.cloudflare.com/turnstile/), [Cloudflare DDoS](https://developers.cloudflare.com/ddos-protection/), [origin protection](https://developers.cloudflare.com/fundamentals/security/protect-your-origin-server/), [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/).
