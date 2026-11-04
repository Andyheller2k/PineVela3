# Navigation, artwork and shorter keys — 4 November 2026

The mobile navigation transition now takes 250 ms, including the sliding cutout
and icon handoff. The fixed notch plane, circle and icons use CSS transforms;
navigation no longer redraws an SVG path on every JavaScript animation frame.
Seller/resident side selections use solid PineVela blue with
white icons in light mode and solid yellow with navy icons in dark mode. The
landing girl has fixed layered depth and shadows; pointer parallax is removed.
The adjacent PineVela card keeps its existing depth treatment. Reduced-motion
and contrast fallbacks remain available.

New manager authorization codes contain six digits. Existing long manager keys
continue working. In Manager Settings, choose **Replace with a 6-digit code**,
confirm with the current key, then privately save the new code shown once. The
old key stops working after replacement. Lost-key recovery stays with the
administrator workflow. Five failed proofs still lock attempts for fifteen
minutes; stale key-version proofs cannot authorize later changes.

New room keys use the saved block Room Prefix, uppercased, followed by a hyphen
and four random letters/digits, for example `PM-A7K2`. Empty prefixes fall back
to block-name initials, then PV. The random suffix excludes ambiguous I/O/0/1. Collision retries
use the database's global unique-code constraint, including revoked history.
Initial generation, individual room release and annual reset share this format.
Existing resident keys are not replaced automatically. Existing authorization,
verified enrollment, occupancy and annual-reset rules are preserved.

The account-bound room activation budget covers all verification/claim aliases:
ten requests per fifteen minutes per verified Auth identity. The existing IP
limit also applies. These API budgets live per backend process; manager failure
lockouts remain database-persistent. No schema or dependency change is needed.

## Installation

The ZIP contains both `dist-supabase/` and `dist-supabase-backend/`. Back up both
existing folders, extract the ZIP into the existing `pinevela-app` hosting root,
then restart Node. Preserve `app.cjs`, environment variables, dependencies and
hosting configuration. Do not upload the APK or verification notes to the public
web directory. No SQL update is required.

Install the matching APK over the existing development app without uninstalling
or clearing its data. It uses the existing debug package/signature and bundles
its UI. Deploy the backend update before using the new manager replacement
button from Android. This is a development APK, not a signed Google Play release.
If reverting visual changes after issuing six-digit codes, retain a frontend
that accepts both key formats.

## Verification

Current evidence is in `docs/verification/navigation-keys-2026-11-04/`.
`summary.json` and `package-report.json` record completed checks and artifact
hashes. The native database suite uses a disposable Unix-socket restore of
archived verified identities; it makes no hosted writes. Browser/native UI
fixtures simulate roles and do not verify real Google login or issue real keys.
Database advisors were not rerun because the schema is unchanged. Device checks
use an isolated Android package before updating the existing development APK.
The website has not been deployed remotely. iOS has not been built or tested on
this Ubuntu machine.
