# Retired features and marketplace messaging — 2026-10-02

Implemented the requested product cleanup in the current checkout. No commit, push, deployment, database migration or deletion of operational records was performed.

## Product changes

- Removed public/general chat, room DMs, resident–manager messaging and staff–manager messaging from dashboard navigation, components, polling, types, API handlers, database helpers, initialization and configuration. Removed their automatic welcome messages while preserving residence approval and room activation.
- Removed public/manual staff signup, public staff directory and reviews, applications, CV submission/review, administrator staff accreditation, job offers and manager recruitment/openings. Removed primary-account staff registration caches, status popups, password/reset/delete controls and API branches. Historical notices for these features are suppressed.
- Managers alone create staff for an approved residence they currently manage. Credentials are explicitly required, ownership and IDs are server-generated, protected fields cannot be reassigned, and another manager or primary/admin account cannot create, edit or remove those staff records.
- Staff sessions require an active manager-created/internal roster entry tied to their canonical user ID and residence manager. Suspension blocks login and existing sessions; manager deletion removes the staff identity and revokes access. Historical standalone staff accounts are inaccessible; their stored records have not been destroyed.
- Staff reviews require an activated room in the staff member’s residence. Review authors are bound to the authenticated resident. Review reads are private to that residence’s activated residents, assigned manager and reviewed staff member. Maintenance reporting and repair confirmation/rating remain active.
- Added a reusable buyer/seller inbox to the seller dashboard and buyer marketplace experience. Buyers initiate inquiries from a seller item/order; sellers reply from their seller account. Arbitrary general DMs and forged sender/buyer identities are rejected. Messages and notifications stay separate from primary accounts, including accounts sharing the seller’s email. Unambiguous historical marketplace conversations remain available.
- Seller alerts open Messages. The inbox supports polling, refresh, inline errors, mobile conversation navigation and reduced-motion scrolling.
- Updated the full-flow script to manager-created/suspended staff; it no longer relies on retired staff applications or administrator verification.

## Verification

- Full security regression suite: **43 tests passed**. It runs serially to avoid resource contention between isolated servers.
- Focused HTTP checks use a disposable database and actual Express authentication: removed routes return 404; unauthorized staff and messages are rejected; cross-account and cross-residence access is blocked; changes persist after restart; suspended/deleted staff cannot authenticate.
- `npm run lint`: **passed**. `npm run build`: **passed**, including client and server bundles. The existing large-bundle warning remains.
- **Mobile follow-up completed (2026-10-02):** the production-bundle seller inbox passed at 375px, 390px, 768px and 1440px, including reply, back navigation and reload, with no console errors or failed API requests. See [focused follow-up report](/home/wyse/Documents/PineVela3/docs/audits/mobile-seller-and-development-signup-2026-10-02.md). The earlier verification reached the landing page; that failure was not reproduced after initializing the seller session before loading the app.
- Latest focused integration test: **passed**, including retired staff signup, roster privacy and removal of primary staff controls.
- `npm run check:private-data` and `git diff --check`: **passed**. Structural checks found no empty API handlers or omitted navigation-array entries.

Test fixtures are confined to temporary databases and are never application seed data. Historical JSON datasets for retired features may remain as inactive archival fields because the project rules prohibit destroying existing data before a verified database migration. They have no active schema helpers, initialization, routes or UI. This cleanup is not a claim that unrelated audit findings are resolved.

## Audit impact

- **S07 and B06:** manager-only staff creation now requires explicit credentials and consistent middleware/ownership checks.
- **S11:** retired application/CV/job-offer surfaces removed; remaining staff CRUD uses canonical ownership and protected-field checks.
- **S20, S27, B02–B05:** affected chat systems retired completely from executable product functionality.
- **S34:** public staff directory/review exposure removed; remaining reviews require authenticated residence relationships.
- **S12:** resident repair confirmation now requires the issue owner’s activated room. Other maintenance actions remain separate audit work.
- **S22:** deletion/suspension of manager-created staff is tested; other session lifecycle findings remain separate.
- **S29:** marketplace message notifications are isolated, including read-one/read-all and legacy seller notices. Other notification categories remain separate audit work.
- **S08:** obsolete staff accreditation routes are removed; unrelated verification/inspection list access remains separate audit work.

The original audit evidence is retained as historical evidence, with feature-retirement updates linking here.
