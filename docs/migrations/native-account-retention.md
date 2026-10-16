# Native account retention

On 2026-10-15 the user confirmed that all legacy JSON records are development data,
authorized archiving them, and instructed us to retain all current Supabase accounts.
No legacy account or business-record import is required. This supersedes the earlier
Google-only retention preview.

`npm run db:verify-retention` reads only Supabase in a repeatable-read, read-only
transaction. It checks native profile/context relationships and emits subject,
profile and context fingerprints for comparison between saved reports. Google
verification is an informational subset; other provider accounts remain retained.
The command neither reads the legacy datastore nor changes accounts or sessions.

The encrypted legacy checkpoint is `9879d6a8-2d6a-4351-9eaa-3108d6bc5035`.
Its 29 source-file hashes were checked against the unchanged originals before
retirement. Recovery artifacts remain private and are separate from native runtime
dependencies.
