# Policy publication and versioning checklist

Status: INTERNAL WORKING DOCUMENT. Release owner: `[FILL]`.

## Before approval

- Resolve every factual/commercial placeholder, especially legal address, DPC status, minors, charges, returns and retention.
- Check actual product behaviour, payment mode, providers, permissions and deletion capability against the proposed promises.
- Obtain appropriate Ghana legal/privacy review. A drafting pack or accepted checkbox is not evidence of regulatory registration.
- Separate public policies from internal incident procedures, credentials, private infrastructure and evidence records.

## Publish an approved version

Assign document key, version, effective date, approver and change summary. Retain the approved exact text and accessible immutable URL. A material wording change requires a new version; do not overwrite the contractual history associated with existing receipts. Cosmetic header/logo fixes can preserve the article hash.

Publish responsive, readable pages at the actual production domain. Check accessible headings, readable light/dark colours, transparent branding, keyboard links, print/save usability and access without login or JavaScript. Link current Terms, Privacy, cookie/analytics notice, merchant terms and relevant transaction policies from the appropriate entry points and footer.

Google OAuth branding uses the production homepage and public privacy/terms URLs. Verify actual consent screen links and domain ownership; do not request broader scopes simply to finish branding. The supported sign-in scope is OpenID/email/profile.

## Coordinate app and database

Apply the reviewed additive migration, verify private-table grants/RLS and registry digest, install the backend and frontend as a coordinated release, then restart/reload the hosting Node app using its existing configuration. Keep `.env`, uploads, secrets and private backups out of the ZIP and public root. The update's existing Platform Terms gate does not automatically add this draft Merchant Agreement.

Run positive and negative direct-API acceptance checks, Google state/callback tests, merchant ownership/verified-enrollment checks and local phone/desktop/light/dark browser checks. Verify production separately with an authorized real user after manual deployment; local checks alone are not hosted confirmation.

## Changes and notices

Decide whether each change needs renewed agreement or a privacy notice rather than agreement. Provide appropriate notice, a readable change summary and an effective date. Preserve separate optional AI/marketing decisions. Do not mark existing users accepted to avoid an onboarding screen.

Release record: `[FILL: version, approver, date, immutable URLs, hashes, migration, checks, deployment, real-user verification and rollback plan]`. Rollback may restore the old app while preserving new receipt tables and evidence; do not delete consent history to roll back a UI.
