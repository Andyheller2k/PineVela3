# Operator and contact update — 5 November 2026

Current policies and public support identify the operator as **PineVela Ghana**
and use **pinevela@pinevela.app**, including `mailto:` links. The update covers
the current Terms, Privacy Policy, help screen, native preview support, branding
guides and all affected documentation templates and their editable draft pack.
The signup example uses a neutral personal name. The administrator instruction
uses its existing slot number without a personal nickname.

## Terms and existing accounts

The current Terms revision is **2026-11-05**, available at
`/terms.html` and `/legal/terms-2026-11-05.html`. Article SHA-256:
`ae27c932e6b9b3706d359b2842179afb6b3dfaf9020924b6622ac21c47f4fa3f`.

The additive migration registers this article without changing existing
documents or receipts. Returning accounts must explicitly accept the revised
Terms. No acceptance is backfilled. The server refuses startup before the
required migration is present. Browser and native signup use the same version.
The Android bundle includes the new dated article with its exact published
content and the existing safe-area adaptations outside that article.

The 2026-10-27 accepted Terms, original migration, prior release archives and
historical verification evidence retain their original contents. They can
contain the earlier operator/contact. The founder's authentication email,
provisioning authorization and identity-based security fixtures remain separate
from the public support mailbox. This update changes no account credentials.
Google Console and hosted email-service settings are not edited by this package.

## Install

1. In the existing Supabase project `bivajljcdeofyxzmplxm`, run
   `database/APPLY-operator-contact.sql` from the ZIP, or the identical
   `/tmp/pinevela-apply-operator-contact.sql`, in SQL Editor. This registers the
   new document and project migration ledger entry atomically. Repeating the
   exact file is safe. Existing rows with conflicting content/digests cause a
   rollback. Migration: `20261105090000_operator_contact_terms.sql`.
2. Back up the hosting `dist-supabase/` and `dist-supabase-backend/` folders.
   Extract `pinevela-operator-contact-20261105.zip` into the existing
   `pinevela-app` root and restart the Node app. Keep environment variables,
   startup configuration, dependencies and private keys.
3. Install the matching development APK over the existing Android development
   app. Preserve app data. Coordinate the Android update with the server update:
   earlier APKs contain the earlier agreement version. This APK is a debug build,
   not a Play Store release; no iOS build was produced on this Linux workstation.
4. Check the public policies and Help email, then read and accept the updated
   Terms on a returning account. Do not mark other accounts accepted manually.

The separate documentation drafting ZIP is for editing; keep it outside the
public website. No new draft contractual clauses are published by this update.
No dependency or infrastructure configuration change is required.

## Verification

- TypeScript, production web build, mobile asset sync and Android debug build.
- Existing policy, analytics, mobile bundle and native Google acceptance tests.
- Actual HTTP handlers and PostgreSQL/RLS checks on an isolated restored
  database, including repeatable SQL install, historical receipt preservation,
  rejection of stale acceptance and cross-account/cross-origin restrictions.
- Local browser policy/help/acceptance checks at phone and desktop widths in
  light and dark themes, with hosted requests blocked.
- Source/build contact checks, article hashes, archive integrity, APK asset
  equality, secret scanning and final diff review.

Evidence is in `docs/verification/operator-contact-2026-11-05/`. These are local
checks; the website/database have not been updated remotely and the emulator's
installed app and account data have not been changed for this content update.

To roll back hosting, restore the backed-up build folders and restart Node.
Keep the additive document/ledger entry and historical receipts intact. Earlier
release artifacts remain available under `releases/`.
