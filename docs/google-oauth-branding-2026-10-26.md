# PineVela Google sign-in branding — 26 October 2026

The owner has since selected the app hostname, provided the operator identity,
Ghana and minimum age 16. Use [the 27 October update](google-oauth-branding-2026-10-27.md)
and its app-layout ZIP. The details below describe the historical draft and main
website plan.

Prepared from the owner's consent-screen fields, current application code and
Google/Supabase documentation. Google Console settings have not been changed.

## Branding fields

| Field | Value |
| --- | --- |
| App name | `PineVela` |
| User support email | `andyheller2k@gmail.com` |
| App logo | Existing square `public/icons/pinevela-192.png` (192 × 192 PNG, 18,180 bytes) |
| Application home page | `https://pinevela.app/` |
| Application privacy policy | `https://pinevela.app/privacy.html` **after approval and deployment** |
| Application terms of service | `https://pinevela.app/terms.html` **after approval and deployment** |
| Authorized domain to add | `pinevela.app` (no scheme, path or wildcard) |
| Developer contact email | `andyheller2k@gmail.com` |

The owner's original `PineVelatrans.png` is a valid PNG below 1 MB (688,849
bytes), but is 1214 × 1296 rather than square. The existing square app icon
avoids distortion. Google recommends a square 120 × 120 image; 192 × 192 is
also within the stated format/size limits. No new or recolored logo was created.

Preserve the existing authorized domain
`bivajljcdeofyxzmplxm.supabase.co` while the default Supabase auth callback is
in use. Do not claim ownership of Supabase's domain in Search Console. If Google
flags that provider-owned domain during review, follow the reported issue and
the provider guidance; an owned Supabase custom auth domain is a separate setup.

Keep the Google OAuth client's redirect URI as:

```text
https://bivajljcdeofyxzmplxm.supabase.co/auth/v1/callback
```

This is different from PineVela's application return endpoint
`/api/auth/google/callback`. Do not replace the provider callback with the app
endpoint. The code requests only `openid email profile`; no extra scopes are
needed for this branding work.

## Public pages and review status

On 26 October 2026, read-only HTTPS checks found:

- `https://pinevela.app/`: HTTP 200, existing WordPress homepage, currently the
  default Blog / Hello world! / My WordPress Blog content, with no policy links.
- `https://www.pinevela.app/`: redirects to the main homepage.
- `https://preview.pinevela.app/`: HTTP 200, current React application.
- Main-domain `/privacy.html` and `/terms.html`: HTTP 404 before this work.

The new `public/privacy.html` and `public/terms.html` are standalone, publicly
readable HTML with no login, scripts, remote font or API dependency. They share
`public/legal.css` and the existing `public/icons/pinevela-192.png`. They support
white/yellow light appearance, navy/yellow dark appearance, keyboard navigation
and printing. Both are visibly marked **Draft for review**, have a prepared
date rather than an effective date, and use `noindex` while unapproved.

The privacy draft reflects Google sign-in, Cloudflare Turnstile security checks,
core Supabase/hosting, housing and
marketplace records, Paystack, Resend, map services, optional Cloudflare AI,
OpenAI content moderation, limited data-clearing controls and retained records.
The draft does not promise universal instant deletion or invent retention periods.

Before adopting these as effective policy/terms, the owner must confirm:

1. The operator's legal name, contact/address details, applicable jurisdiction
   and eligibility/age requirements.
2. The complete provider list, actual processing locations, provider/backup
   retention, record-retention schedule and deletion-request process.
3. Business data-use commitments, applicable user rights and the basis for
   processing; these must match actual operations.
4. Commercial, cancellation/refund, dispute and liability provisions.
5. The final wording and effective date. Replace the draft notices, draft titles
   and prepared-date wording, and remove `noindex` when the pages are approved.

These are owner-review drafts, not a claim of legal compliance or Google approval.

## Publishing locations

The files are copied into `dist-supabase` by the frontend build. The React
homepage and login/signup footers link directly to `/privacy.html` and
`/terms.html`, outside the hash router.

The main domain runs WordPress, separately from the preview app. To serve the
chosen branding URLs, place **only** these static files in the document root
serving `pinevela.app`:

```text
privacy.html
terms.html
legal.css
icons/pinevela-192.png
```

Preserve WordPress's `index.php`, configuration, `.htaccess`, content and private
files. Do not put the React app's `index.html` over the WordPress homepage.
Add these links to the actual WordPress homepage/footer too:

```html
<a href="https://pinevela.app/privacy.html">Privacy policy</a>
<a href="https://pinevela.app/terms.html">Terms of service</a>
```

The repository footer change does not edit the separate live WordPress site.
Replace the default WordPress homepage content with an actual PineVela product
description. A ready-to-paste Custom HTML block is prepared in
`docs/design/wordpress-branding-homepage-draft.html`; review its wording and
preview-app link before using it. Put it on a page and select that page as the
static homepage in WordPress, rather than replacing WordPress's files. Then open
the homepage and both policy URLs signed out and confirm the content and links
are correct before verification.

## Google verification

1. Verify ownership of `pinevela.app` in Google Search Console using an account
   that is also an owner/editor of the Google Cloud project. Use the DNS TXT
   value supplied by Search Console; no token was generated by this work.
2. After the policy text is approved and its URLs are live, save the fields
   above in Google Auth Platform → Branding. Keep the current sign-in callback.
3. Use **Verify Branding** when offered. Once approved and marked Ready to
   publish, click **Publish branding**. Saving a draft alone does not update the
   public consent screen.
4. Test a genuine Google sign-in in a private browser window and check the
   displayed name/logo and successful return to PineVela.

Verified name/logo branding does not rename the underlying Supabase hostname.
Changing that hostname is a separate custom-auth-domain task, not included here.
No Google account access, DNS changes, remote publishing or sign-in was performed.

## Sources

- [Google: Manage OAuth App Branding](https://support.google.com/cloud/answer/15549049?hl=en)
- [Google: Brand verification requirements](https://support.google.com/cloud/answer/13464321?hl=en)
- [Google: Submit for brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification)
- [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy)
- [Supabase: Sign in with Google](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)

## Verification

TypeScript, the production frontend build and the existing two static-frontend
security tests passed. Source/static build copies and internal anchors/local
assets were checked. A targeted owned-Chrome run passed 16 legal-page scenes at
320, 393, 768 and 1440px in light/dark appearances, plus 12 homepage/login/signup
footer-link scenes. The policy pages rendered with JavaScript disabled, CSS and
the icon returned 200, native links/keyboard navigation worked, and the 320px
auth footer did not overlap the card or overflow horizontally. No API mutation,
provider call or remote deployment was performed.

Evidence: `.security/oauth-branding-2026-10-26/`. The draft ZIP contains only the
two HTML pages, shared CSS, public icon, this guide and the WordPress content
fragment; member bytes were verified against their source files.

Code evidence: `googleAuth.ts`, `docs/auth.md`, `docs/companion.md`,
`docs/content-moderation.md`, `docs/customer-support.md`,
`docs/payments/paystack.md`, `docs/product-rules.md` and map components/services.
