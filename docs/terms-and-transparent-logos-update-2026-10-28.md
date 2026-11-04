# Terms acceptance, policy logos and documentation — 28 October 2026

The update adds explicit current-Terms acceptance to email signup/verification,
Google signup and merchant applications. Returning accounts without a receipt
see the agreement screen before private pages/notifications mount. Backend
product operations require the current receipt as well as existing server
authorization. Support, account appearance/status, supported self-closure and
sign-out remain available. Marketing and optional AI provider sharing remain
separate.

Private registry/receipt tables store verified subject/context/session,
document version/article/hash, database time and server-selected source/purpose.
Merchant evidence is tied to application/submission version. Duplicate requests
retain the original timestamp. There is no existing-user consent backfill.

The enforced Platform Terms are the currently published **2026-10-27** article,
verified against https://pinevela.app/terms.html on 28 October. Article SHA-256:
`5221d730f6e4247f43cbf82e8b51e55a37cb075016bde7849a500a66a6e56ada`.
An immutable public copy ships at `/legal/terms-2026-10-27.html`. New legal drafts
are not published by this release and are not included in that agreement.

Privacy, current Terms and the immutable Terms copy use the existing transparent
PineVela mascot SVG, replacing the square PWA icon in their headers. Existing
favicon/PWA assets keep their intended role.

## Supabase rollout

Project: `bivajljcdeofyxzmplxm`. Applied through the Supabase MCP tool after the
isolated checks. Project migration version: `20261028120000`, SHA-256:
`79c1a618a5523bdbc54d348850fd1a1add93ddee15a0ea03f07d34f12b70b418`.
MCP deployment ledger version: `20261028113608`, `versioned_terms_acceptance`.
Verified the registry article hash, zero pre-existing receipts, RLS on both
tables and no anon/authenticated/scoped-backend-role table grants. Security
advisors reported no new non-informational finding; the pre-existing executable
security-definer and leaked-password-protection warnings remain outside this
change. No live person was marked accepted and no account record was changed.

## Verification and deployment boundary

The isolated PostgreSQL restore and actual HTTP handler suite passed 61 checks,
covering missing/false/stale proof, unverified identity, cross-origin submission,
Google callback state/replay/cancel/Login, spoofed account fields, foreign seller
enrollment, required student verification/declaration, idempotency, transactional
rollback and native session revocation. Provider replies and local test Auth
subjects are fixtures; this is not a fresh hosted Google or email-delivery test.

Build, TypeScript, focused regressions, browser scenes and archive verification
are recorded with the install package's final manifest. The owner chose manual
deployment. The Supabase migration alone does not activate the new app feature;
install the new frontend **and backend**, restart the existing Node app, then
check a real signed-in account on the hosted site. No hosting files or DNS were
changed by this release preparation.

## Draft handoff and traffic protection

`docs/documentation-drafts-2026-10-28/` contains 22 editable source documents.
The Word/Markdown ZIP is a separate authoring handoff and must not be extracted
into the live app. Resolve business, age/authority, commercial, DPC, retention
and legal-review placeholders before publication. Its operations plan records
the current absence of an identified visitor tracker, Turnstile form checks,
direct Spaceship hosting observations and the difference between provider
server-level DDoS protection and individual-site/edge protection.
