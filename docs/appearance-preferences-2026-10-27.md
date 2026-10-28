# Light, Dark and System preferences — 27 October 2026

The latest control styling restores the Light/Dark slider and renames the third
option **System default**; see [the UI follow-up](theme-slider-merchant-2026-10-27.md)
and its frontend-only package. The original three-mode rollout below remains the
record of the provider, migration and persistence work.

Appearance settings now offer three choices. Light and Dark are explicit;
System settings follows the current device theme live. With no valid saved
choice, System is the default. Existing saved Light/Dark preferences remain
explicit rather than being converted.

Product pages and login/signup resolve the same preference at every width.
Logout and reload preserve the choice. System changes update the effective
appearance without replacing `system` in the saved account/device preference.
Landing, catalogs, storefronts, Why Us, FAQ, Help and static policies now share
the preference too (28 October 2026). Public headers
show the Light/Dark slider without System default. Theme changes retain the existing
responsive layouts, glass cards and diagonal geometry.

Preferences remain private to the native session's active portal. The API
accepts only `{theme: light | dark | system}`. Account-context headers remain
consistency checks, never authorization. Serialized, identity/revision-guarded
writes preserve pending choices across network failures, account switches and
reloads. Storage events synchronize the active choice between tabs.

Migration `20261027001131_system_account_appearance.sql` expands only the
existing theme CHECK. Existing rows, ownership, policies and grants are preserved.
Its SHA-256 is `5d1c055a08bef478be37f24651d1e5b12918dfb78550a40a82a7b3ece23b8dbf`.
The backend startup gate now requires this migration's private ledger entry.
The owner approved the project's migration naming convention after repeated
official CLI download failures; no CLI execution or live migration is claimed.

Verification passed:

- TypeScript, production frontend/backend/worker builds, five theme/UI/API
  validation test files and prepaint preference/media-query matrices.
- Twelve actual React provider scenario groups covering manual/System choices,
  logout, refresh, live OS changes, storage, failed saves, retries, stale responses,
  account switches and native radio keyboard interaction at 320px. Auth inputs
  and deferred requests in this frontend-only harness are explicitly synthetic.
- Sixteen actual compiled guest Login/Signup scenes at phone, landscape and
  desktop widths. Manual modes ignore OS changes; System follows them live.
  Prepaint traces showed no wrong-theme flash or horizontal overflow. These
  checks do not claim genuine sign-in/signup provider journeys.
- Fifty-nine checks against a disposable restore with three genuine Google
  identities: all choices, separate portals, session revocation, spoofed input,
  cross-context SQL/RLS denials and preserved Auth records. No cloud writes.
- Nine SQL-editor wrapper checks: first application, identical no-op reapplication,
  digest mismatch rollback, and unchanged preferences/access controls.

Provider tests run with `npm run verify:theme-provider-browser`. Guest rendering
evidence is in `/tmp/pinevela-preference-login-qa/`. The SQL-editor installer is
`/tmp/pinevela-apply-system-appearance.sql`; it atomically registers the exact
migration digest in `private.schema_migrations` and rejects a conflicting entry.

Apply the SQL to the existing Supabase project before installing/restarting the
matching backend. Then merge the update into `pinevela-app`, retain private
configuration and existing hashed assets, and restart Node using `app.cjs`.
No dependency installation or new credentials are required. No remote deployment
or database migration was performed during packaging.

The install archive is `/tmp/pinevela-light-dark-system-update-20261027.tar.gz`
(8,166,956 bytes; 179 files, including 174 frontend files and the backend bundle).
SHA-256: `373c5ddb418d74beabce97404f4decbb21e6ff86f53fb238c1f079efec2abc03`.
It includes `SPACESHIP-UPDATE.md`, the SQL-editor installer, the canonical
migration and a file manifest. All member bytes were verified; the new frontend
index is last. Configured-private-value scans found zero matches, and no source
maps or test fixtures are included. This update supersedes the earlier login
appearance archives and requires both the SQL step and a Node restart.

On 27 October 2026, the owner explicitly authorized applying the supplied SQL.
Migration `20261027001131` was committed to the configured existing project and
its exact ledger digest and validated three-choice CHECK were verified. All 13
existing preference rows, RLS, ownership, grants, policies and other constraints
were unchanged. Evidence is `/tmp/pinevela-system-theme-live-migration-report.json`.
The SQL step is complete for that project; the original installer remains safe
to reapply with the same digest. Hosted app files have not been deployed or
restarted. Supabase MCP was subsequently connected, and both advisors were
reviewed: see [the advisor review](supabase-advisor-review-2026-10-27.md).

The missing archive was restored byte-for-byte, with the original SHA-256 above.
An equivalent ZIP is `/tmp/pinevela-light-dark-system-update-20261027.zip`
(8,238,196 bytes), SHA-256
`92ae19eb37ea53cace827c2293fa56b6ebab8208d5b6e500ca0038dd1d267973`.
All 179 member contents match between the ZIP and original tar archive. The
restored archive's embedded instructions describe its original packaging state;
the live migration status in this paragraph is newer.
