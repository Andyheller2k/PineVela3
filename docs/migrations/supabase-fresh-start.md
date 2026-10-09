# Supabase fresh start

Status: migration in progress. The opt-in Supabase backend uses verified Auth sessions,
PostgreSQL/RLS and private Storage. Default dev/build/start still use JSON until the
remaining product workflows and cutover checks pass.

The latest request (2026-10-09) supersedes the earlier all-account reset: **retain only
accounts with a verified Google identity**. A matching server-owned Google identity with
`email_verified = true`, confirmed non-anonymous Auth subject and matching email is
required. Retain exact Auth UUIDs; local accounts qualify only with their saved UUID
and matching verified mailbox. Email/provider labels alone cannot adopt an account.
Other accounts are removal candidates, not production restore targets. Review linked
residence, store, order, payment, notification and media dependencies before deletion.
Keep a full encrypted backup; full restore rehearsals stay isolated from production.
Keep platform configuration and private recovery history; review stale references.
Retained Google identities do not automatically retain historical administrator roles,
keys or sessions. The requested
new main administrator uses Google sign-in; their email belongs in the private operator
preview, not a public signup rule.

## Preparation

Run from the project root:

```sh
node --import tsx scripts/prepare-supabase-reset.ts --main-admin-email YOUR_GOOGLE_EMAIL
```

This produces a private candidate preview and AES-256-GCM backup under the Git-ignored
`.security/migration-reset/` directory. It decrypts and compares the database and all
uploads and checks for source changes. It never deletes records, changes roles,
stages media or imports the live database writer. It reads the configured Supabase Auth
records to classify retained identities and removal candidates; it has no local-label
fallback if verification fails. The private preview marks linked-record review and
execution as incomplete. Keep the archive
and its private `backup.key` securely; this local snapshot is not an off-host backup
or a guarantee that a running writer will remain unchanged.

For the existing Supabase project, `DATABASE_URL` must use its Session pooler on port
5432 in IPv4-only environments. Put the Supabase CA certificate's absolute path in
`SUPABASE_DB_CA_FILE`. After checking the database inventory, prepare a separate
encrypted PostgreSQL snapshot with `node --import tsx scripts/backup-supabase-database.ts`.
This snapshots the `auth`, `public` and `storage` schemas using `pg_dump`, checks the
archive listing, decrypts it and compares its digest. It does not save Storage object
bytes; those need their own copy if the bucket inventory is nonempty.

If `pg_dump` cannot finish, `node --import tsx scripts/backup-supabase-records.ts`
can create an encrypted read-only export of rows and catalog metadata in these schemas.
That export is supplemental: it has no tested PostgreSQL restore path and does not
satisfy the final backup gate for deleting accounts.

The dashboard's existing total wipe preserves admins and governance. Do not change
that feature's approval requirements to implement this one-time fresh start.

The inspected product model is in [current-application-audit.md](current-application-audit.md)
and [schema-design.md](schema-design.md). Timestamped SQL files under
`supabase/migrations/` define the new tables, relationships, RLS, private records and
public projections. Apply them through
`node --import tsx scripts/apply-supabase-migrations.ts --dry-run`, followed by the
same command without `--dry-run` after review. The script checks the project reference,
verifies TLS, records file digests, and commits all pending files in one transaction.
These schema migrations do not create or import user accounts.

## Implementation and cutover gates

1. Configure the dedicated target project privately, including server-only Supabase
   administration credentials and PostgreSQL access. Inventory existing cloud Auth,
   application tables and Storage before proposing their deletion. Scope operations
   to PineVela; never clear an unrelated or shared project's identities.
2. Implement relational tables, constraints, RLS and server authorization using the
   inspected current relationships. Preserve housing allocation uniqueness, manager
   and staff boundaries, buyer/seller ownership, order reservations, notification
   recipients, payment idempotency and keyed governance. Do not use a single shared
   JSON blob as a replacement for relational authorization.
3. Switch signup/login/password recovery and Google callbacks to Supabase Auth and
   verified Supabase sessions. Public signup creates ordinary users only. Provision
   the selected Google identity's main-admin role through a private, one-time server
   operation checking its verified provider identity and exact Auth UUID. Never use
   client metadata or email alone as authorization on subsequent requests.
4. Replace the old password bootstrap and local-session paths before cutover. Rebuild
   active admin membership and enroll fresh keys; old invitations, role assignments,
   keys and sessions cannot retain authority. Additional admins require trusted
   invitations; staff creation stays restricted to authorized hostel managers.
5. Verify allowed workflows and direct unauthenticated, wrong-user, cross-hostel,
   cross-store, ownership-spoofing and public-role-escalation attempts. Verify RLS
   directly, session revocation, persistence after restart, and backup restoration.
6. Present the final cloud/local candidate set for destructive approval. Stop/drain
   writers; refresh and verify backups of local and cloud data, including Storage.
   Execute the reviewed reset and cutover only after the replacement works and the
   trusted administrator can regain access. Prevent old JWT/session access as part
   of account deletion; deleting JSON does not delete Supabase Auth users.
7. Verify the new main-admin identity, retained Google UUID/mailbox bindings, ordinary
   Google/email signup, reviewed domain dependencies, absent removal candidates and
   successful authorization checks. Keep rollback
   archives private; restoring old data must invalidate restored sessions and pending
   approvals rather than reactivate historical access.

Source configuration names currently used by the preparation script are `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`, and
`DATABASE_URL`/`SUPABASE_DB_URL`. The PostgreSQL backup also needs `SUPABASE_DB_CA_FILE`.
Presence checks do not prove connectivity or permissions.
Server keys and database passwords must never be exposed through Vite variables or chat.

The PostgreSQL archive now includes `auth`, `public`, `private` and `storage`, including
their grants and revocations. `npm run db:rehearse-backup -- BACKUP_UUID` restores only
into a temporary local Unix-socket PostgreSQL instance and verifies record/schema and
access-control recovery. It never connects to the cloud target. Private Storage object
bytes still need a separate backup once objects exist. Refresh both database and media
snapshots with writers stopped before the final reset.
