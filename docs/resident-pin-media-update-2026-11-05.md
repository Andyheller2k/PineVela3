# Resident PIN, photographs and Android navigation — 5 November 2026

## Delivery status

> Follow-up deployment: the cumulative notification settings update is now
> installed on the live host and emulator. See [the current guide](notification-settings-cleanup-2026-11-05.md)
> and its deployment record. The status below describes the earlier checkpoint.

Source, documentation, web/backend builds and Android build are updated. Both
additive migrations are applied to Supabase project `bivajljcdeofyxzmplxm`, after
an encrypted backup, local rehearsal and rolled-back hosted dry run. Committed
readback confirmed RLS, denied grants, the owner index and private Storage.

The earlier Chrome push fix is already live and delivered a real notification.
This newer hosting update is **not deployed**: Chrome requested fresh debugging
approval, and no alternate hosting token was available. Browser protections were
preserved. The complete cumulative ZIP is saved in the project, outside `/tmp`.
The matching development APK is installed over the emulator's existing app,
retaining its data. New resident PIN activation/login needs the hosting update
before it works against the live server. Existing password login remains.

## Files and installation

- Web/server: `releases/web/pinevela-resident-pin-media-20261105.zip`
- Android: `releases/android/pinevela-resident-pin-media-20261105.apk`
- Applied SQL: `releases/database/pinevela-apply-resident-pin-media-20261105.sql`
- Evidence: `docs/verification/resident-pin-media-2026-11-05/summary.json`

Back up `dist-supabase` and `dist-supabase-backend` in
`/home/jqmgxgpuym/pinevela-app`, extract the web ZIP into that application root,
then restart the Node.js app in cPanel. Dependency manifests match the installed
device-notification release; this update adds no dependencies. Preserve `.env`,
environment variables, the database CA and all private `.security` files,
particularly the delivery-PIN master and push sender keys. Private files are
excluded from the ZIP. SQL is already applied and need not be run again.

The APK is a development build, not a Play Store AAB. Install over **PineVela
Development** without uninstalling or clearing data. Web changes need hosting
extraction/restart; Android bundled changes need the APK. After deployment,
verify a genuine primary-owner activation, room PIN login, unchanged primary
password login, and an authorized photo upload/read. Automated tests did not
create cloud accounts, send email, claim a real room or publish a real listing.

## Behavior and security

New residents use a verified primary account, valid available room key and chosen
6–12 digit PIN. The subsequent [unified login update](unified-room-login-2026-11-05.md)
uses one email and password-or-PIN form. Primary email/password opens the primary account; primary email/room PIN
opens the isolated resident account. No student email is required for this new
resident flow. Legacy email-based resident/seller credentials remain. The primary
owner can recover only its own new resident PIN; changes invalidate earlier
resident sessions. Seller enrollment rules are unchanged.

Supabase Auth still issues separate resident tokens; a short PIN never grants
primary-identity authority. Allocations, verified ownership, approval, CAPTCHA,
persistent five-attempt/15-minute lockout and RLS remain enforced. No primary or
seller password is rewritten. Recovery uses the existing private delivery-PIN
master with domain separation. See [authentication](auth.md) and [security](security.md).

New market/residence photos are metadata-free WebP up to 1600px, quality 84, with
a smaller fallback for unusually large output. Cards use 640px variants; purchase
and gallery thumbnails use 192px. Existing PNGs are preserved. A repository photo
measured 7,057,991 bytes as the previous PNG versus 132,738 bytes as WebP, at
1600×1200 and 41.2 dB PSNR. This is one fixture, not a guarantee for every photo.

Browser/Android caches validate publication before reuse. A bounded server cache
reuses derived bytes after fresh access checks. Private evidence remains uncached.
Inactive purchase panels retain image nodes within the current account mount,
causing zero requests on the tested tab round trips; account teardown removes
those private nodes. Android accepts strict card/thumb selectors and WebP without
allowing arbitrary transform URLs. Navigation no longer applies the dark-theme
rectangular press outline; rounded keyboard focus, theme colors and 250ms motion remain.

## Verification

- TypeScript and production web/backend builds passed; 54 focused unit tests passed.
- 88 checks passed with real local GoTrue 2.197.0, restored PostgreSQL and Express
  HTTP, covering ownership spoofing, RLS, separate native tokens, unchanged
  primary/seller credentials, PIN recovery/lockout, concurrent claims, legacy
  access and withdrawn-photo authorization.
- 46 local Chromium scenarios passed: 18 cache, 16 touch/focus style, and 12 new
  resident forms at 320/390/1440px in both themes. Visual fixtures do not prove
  cloud authentication. Browser press-style tests explicitly force CSS `:active`
  after touch delivery; Android checks use genuine held ADB touches.
- Android: 10 JVM and 29 emulator instrumentation tests passed, including actual
  WebP decoding and cache validation. Twenty-six navigation scenes and held
  touches on eight account pages in each theme passed.
- Exact migration wrapper repeated safely on an isolated restore; both additive
  migrations then passed hosted dry run, commit and independent readback.

Hosting publication and a genuine new resident's complete cloud activation remain
unverified until the ZIP is applied. No iOS build was made. Release hashes and
installation/shutdown records are saved in the evidence directory.
