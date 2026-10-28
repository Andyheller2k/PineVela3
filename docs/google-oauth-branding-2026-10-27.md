# Google branding and public policies — 27 October 2026

The owner subsequently confirmed Google branding verification. The authorized
move replacing WordPress with the app at **pinevela.app** is now complete. The
values and preparation checks below record the original preview setup. See the
[completed cutover record](pinevela-main-domain-cutover-2026-10-27.md) for current
URLs, hosting backups, verification and remaining provider checks.

Owner-confirmed details: operator **Oppong Manu Andy**, country **Ghana**,
minimum age **16**, contact **andyheller2k@gmail.com**. The owner selected the
application at **preview.pinevela.app** and will upload their own Google logo.
No postal address, registration number or provider retention period was supplied
or invented.

## Google Auth Platform → Branding

| Field | Value |
| --- | --- |
| App name | `PineVela` |
| User support email | `andyheller2k@gmail.com` |
| App logo | Owner supplies the image |
| Application home page | `https://preview.pinevela.app/` |
| Privacy policy | `https://preview.pinevela.app/privacy.html` |
| Terms of service | `https://preview.pinevela.app/terms.html` |
| Authorized domain to add | `pinevela.app` |
| Existing authorized domain to retain | `bivajljcdeofyxzmplxm.supabase.co` |
| Developer contact email | `andyheller2k@gmail.com` |

The authorized-domain entry uses the registered domain, without `https://`, a
path or wildcard. `pinevela.app` covers the selected `preview` subdomain.
Keep the Google OAuth client's existing Supabase redirect URI:

```text
https://bivajljcdeofyxzmplxm.supabase.co/auth/v1/callback
```

This is separate from the application's own callback. Branding does not require
additional scopes; the existing Google flow uses `openid email profile`.
Google's [branding guide](https://support.google.com/cloud/answer/15549049?hl=en)
requires the homepage to identify the app and link to the same privacy policy
entered in the consent screen. Verify ownership of `pinevela.app` in Search
Console when required; do not claim ownership of Supabase's provider domain.
Follow Google's [brand verification procedure](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
after the selected pages are published and checked. Saving form values does not
itself publish verified branding.

## Policy update

The prepared pages identify the operator/country/email and eligibility age and
use the selected app hostname throughout. The revision date is 27 October 2026.
They describe the existing service, Google data, operational providers, optional
AI, moderation, retained records, requests and contact. They do not invent
deletion deadlines or a general refund guarantee.

Two previously overbroad disclosures were corrected: only new marketplace
messages are end-to-end encrypted (legacy history remains), and Ask AI identifies
Cloudflare Workers AI or Groq according to its configuration. Ghana's Data
Protection Commission is linked as a contact for data-protection concerns.
The eligibility age is policy wording; this static update does not add technical
age verification to signup. Terms retain applicable legal protections.

Review the actual wording before publishing it. The pages are prepared as the
publication version, with draft notices and `noindex` removed. This preparation
does not certify legal compliance, registration with Ghana's regulator or Google
approval. Google account settings and hosted pages have not been changed.

## Installation

Use `/tmp/pinevela-privacy-terms-update-20261027.zip` for the existing
Spaceship `pinevela-app` folder. Its HTML, CSS and existing policy-page icon are
wrapped under `dist-supabase/`; extract/merge there and overwrite matching files.
If installing the full app/theme update too, install it first, then this policy
update, so the older bundle does not replace these newer pages. No database
migration, Node restart or dependency installation is required for these static
files. Existing homepage and login/signup links already point to `/privacy.html`
and `/terms.html`.

After installation, open the selected homepage and both policy URLs signed out.
Confirm the operator, age, date, email, navigation and final text before running
Google branding verification. The older recovered draft ZIP remains separately
available as `/tmp/pinevela-google-branding-drafts-20261026.zip`; its root-file
layout was intended for the main website and is not this app update.

On 27 October, anonymous HTTPS checks confirmed both app policy URLs returned
200 with the older draft notices; main-domain policy URLs returned 404. The
updated source and local install package do not by themselves change that live
state. Evidence: `/tmp/pinevela-branding-url-check-20261027.json`.

## Sources checked

- [Google: Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049?hl=en)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Ghana Data Protection Commission](https://dpc.gov.gh/compliance/)
- Code: `googleAuth.ts`, `docs/marketplace-encryption.md`,
  `supabase/companionInference.ts`, `supabase/companion.ts`,
  `docs/content-moderation.md` and the existing signup form.

## Package verification

The app ZIP is 31,823 bytes and contains four public files plus installation
instructions, branding values and a manifest (seven members total). SHA-256:
`056054c93dfa1b0a4293079b3d963fd360bcd533006274b2100f69d2ab0e79e9`.
All ZIP members passed CRC, path and exact-byte verification; source, current
build and archived public files match. All four resources passed HTTP checks
through the app's actual static-file handler, including framing protection.
Both pages passed eight local Chromium scenes: 320/1440px in light/dark, with
JavaScript disabled, valid anchors/cross-links, loaded CSS/icon, keyboard skip
navigation and no horizontal overflow. No remote/API/session requests were made
by those browser checks. Evidence is under
`/tmp/pinevela-legal-browser-qa-20261027/`; release metadata is
`/tmp/pinevela-privacy-terms-release-report.json`.
