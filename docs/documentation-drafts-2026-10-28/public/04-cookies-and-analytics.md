# Cookies and Analytics Notice

Status: WORKING DRAFT. Complete the technical inventory before publication.
Version / effective date: `[FILL]`.

## Essential storage

PineVela uses necessary session/security cookies and browser storage to keep the service working, protect authentication, remember appearance preferences and support installed-app behavior. Security tools may process connection/browser signals to prevent automated misuse. These functions have a different purpose from audience measurement and advertising.

| Item/category | Purpose | Provider | Duration / control |
| --- | --- | --- | --- |
| Authentication/session cookies | Maintain verified account access | PineVela / Supabase | `[VERIFY actual names and expiries]`; sign-out/account controls |
| Security/flow cookies | Protect login/provider handoffs | PineVela and enabled security provider | `[VERIFY]` |
| Appearance/browser preferences | Save Light/Dark/System choices | PineVela | Until changed or cleared; verify exact keys |
| Installed-app/service-worker cache | Deliver permitted static app assets | PineVela | Browser/cache lifecycle; exclude private API responses |
| Message-key fingerprints | Detect changes to a contact's public keys | PineVela | Until account/browser data is cleared; not the private recovery phrase |

## Optional audience measurement

An earlier 28 October audit found no visitor tracker. The subsequent owner-authorized update adds **Google Analytics 4**, Measurement ID **G-NWBP5E04F9**, pending manual hosting installation and live verification. Hosting/security logs are separate.

The implemented choice is optional and separate from Terms acceptance. Before Allow analytics, no Google tag or collection request is made by this integration. Preferences can be changed through the landing footer, Privacy Policy and app settings. The browser stores `pinevela:analytics-consent` (format version 1) until changed or cleared. Analytics cookies are configured for up to 30 days without extending their expiry on every page load. Withdrawing stops further collection and clears accessible analytics cookies; it does not automatically erase data already received by Google.

Events use allowlisted general page names and normalized store paths. Authentication, invitations, onboarding/payment-return paths, unknown paths and sensitive-query URLs are excluded. Full referrer paths/queries and private account/form/message data are not sent. Advertising personalization and Google signals are disabled. `[FILL: the approved GA4 property-level retention/access settings and review date.]`

Confirm the deployed implementation and live collection before final publication. Fill in the purpose, lawful basis and provider-level retention/access decisions. This first integration measures page visits; signup/order/merchant conversion events are not yet installed. Cloudflare Web Analytics is not installed.

`[IF OPTIONAL TRACKING IS ENABLED: We use [provider] to understand [purposes]. You can accept or reject optional analytics through [control] and change that choice at [location]. Necessary service functions remain available when optional analytics is rejected.]`

## Marketing and controls

`[DECIDE: no advertising/marketing cookies, or describe every active tool separately.]` Optional choices should be specific and initially unset. Do not combine an advertising choice with acceptance of service terms. Cookie consent and promotional-message consent are separate decisions where applicable.

Clearing cookies/storage may sign you out or remove local settings. It does not erase server-held account or transaction records. Explain any analytics exclusions for signed-in sensitive pages, support messages and authentication callback URLs.

## Required implementation review

- Inventory actual cookie/storage names, purposes, suppliers and expiry periods.
- Verify whether a choice is legally required for each category and jurisdiction.
- Keep credentials, personal messages, email addresses, room keys and payment references out of analytics events and URLs.
- Make the final notice reachable before sign-in and from the preference control.
- Record the selected categories and notice version; honor later changes.

Privacy contact: andyheller2k@gmail.com. See the Privacy Policy and the internal analytics plan for the selected setup.
