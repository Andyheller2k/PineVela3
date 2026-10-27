# Temporary companion UI pause — 2026-10-24

Historical checkpoint: the owner authorized restoration on 2026-10-26 for
Spaceship testing. The primary dashboard now mounts Ask AI again; see
[current testing instructions](companion-spaceship-testing-2026-10-26.md).

Ask AI has been removed from the primary dashboard UI at the user's request
while provider testing is deferred. Previously the dashboard mounted
`PineVelaCompanion`, which fetched preferences and supplied a desktop launcher
or a mobile/tablet button through a portal target in the bottom navigation.

The page no longer imports or mounts that component, and the unused target
state/prop and trailing navigation slot have been removed. The mobile bar now
distributes Home, Purchases, Room and Options across its existing width.
Notifications remain in the header and desktop navigation. Existing page
callbacks, Help and sign-out remain connected.

The companion implementation, API authorization, saved preferences and chat
history remain intact for later restoration. This is a temporary UI pause with
no provider replacement, database migration or backend change. The existing
Groq 403 is not resolved by this change.

## Verification

- `npm run lint` passed (`tsc --noEmit`).
- Production frontend build passed in 13.28 seconds.
- Eight read-only source checks passed, including removed mount/target,
  unchanged primary destinations and preserved navigation callbacks.
- All 171 candidate public files were scanned against configured private
  credential values with no matches. No private files or source maps are
  included in the update.
- Candidate JavaScript contains no companion endpoint references, Ask AI
  labels, companion overlay or customization prompt. Dormant styles and the
  shared icon-animation selector remain for later restoration.
- The existing approved Brave debugger endpoint was unavailable after one
  bounded check. Signed-in layout, touch geometry and actual browser network
  request counts were not reverified. No provider requests were made.
- `git diff --check` passed. Existing unrelated worktree changes were retained.

Private verification evidence is under
`.security/production-readiness-2026-10-23/companion-ui-paused-2026-10-24/`.

## Preview update

`/tmp/pinevela-preview-companion-ui-paused-20261024.tar.gz`

- Size: 3,074,092 bytes (about 3 MB).
- SHA-256: `69718697539719e7e43243c5b5db63f9b56599d7a4fffe8b17163bdc2d3edc9f`.
- Contains 127 changed/new public frontend files relative to the prepared
  preview baseline, under `dist-supabase/`, including the preceding UI fixes.
- Every archived file was checked against its candidate bytes after packaging.
  `index.html` is the last archive member.

Upload and extract into `/home/jqmgxgpuym/pinevela-app`, retaining existing
assets. Refresh the preview or close and reopen the installed web app.
The package has no backend files and needs no Node restart. It has been
prepared locally; no remote deployment was performed.
