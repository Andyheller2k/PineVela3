# Technical and operational documentation map

Status: INTERNAL INDEX. Do not publish this folder with customer policies. Existing repository documentation remains the source for implementation details; dated audits are snapshots.

| Area | Existing source / document | What to maintain |
| --- | --- | --- |
| Architecture | `ARCHITECTURE.md` | React/Vite/TS, Express, Supabase Auth/PostgreSQL/Storage; trust boundaries |
| Product rules | `docs/product-rules.md`, `AGENTS.md` | Role/ownership rules, allocations, supported messaging/reviews |
| Database | `docs/database.md`, `supabase/migrations/`, migration scripts | Schema, immutable migration digests, RLS and verified rollout |
| Authentication | `docs/auth.md`, `supabase/auth.ts`, `googleAuth.ts` | Cookies, verified sessions, context binding, Google and recovery |
| Terms evidence | `legalPolicy.ts`, `supabase/legal.ts`, document 13 | Approved versions, hashes, actor-bound receipts and migration |
| Security | `docs/security.md`, `resourceSecurity.ts` | Server authorization, input limits, secrets and proxy trust |
| CAPTCHA | `docs/captcha.md`, `supabase/authProtection.ts` | Required protected submissions and no idle/repeating challenge work |
| Messaging | `docs/marketplace-encryption.md` | Buyer–seller encryption, recovery and selected-message reports |
| Deployment/domain | `docs/pinevela-main-domain-cutover-2026-10-27.md`, `docs/hosting-spaceship-assessment.md` | Main domain, hosting layout, redirects, backend process and rollback |
| Appearance/PWA | `docs/app-wide-theme-audit-2026-10-28.md`, `docs/market-and-login-update-2026-10-28.md` | Shared theme, phone layout, no layout divergence by theme |
| Privacy/legal | This drafting pack and approved `public/privacy.html`, `public/terms.html` | Actual data/promises and approved published versions |
| Backup/deletion | `docs/migrations/` and reviewed lifecycle scripts | Scope manifests, retained records, recovery and explicit authorization |
| Analytics/availability | Document 19 | Sanitized visitor metrics, alerts, hosting/edge protection evidence |

## Runbooks to complete

Maintain short, tested runbooks for release/install/restart/rollback; migration dry run and ledger verification; access grants/revocation; provider/SMTP/OAuth configuration; payment webhook/reversal reconciliation; media limits/storage; backup restore; incident escalation; data-subject requests; moderation/appeals; staff/manager lifecycle; and theme/PWA regression checks.

Every runbook should identify owner, prerequisites, command/tool location, protected inputs, expected output, recovery path and most recent verification date. Put actual credentials in the approved private secret store, not examples or archives. Distinguish local browser fixtures, local provider tests and real hosted authenticated verification.

## Documentation release structure

Keep customer policies and help pages public; merchant/manager/staff contractual supplements accessible at the point of agreement; implementation and operational procedures restricted; and confidential case/evidence records in an access-controlled system. A documentation ZIP is an authoring handoff, not a website install or approval to publish every file.
