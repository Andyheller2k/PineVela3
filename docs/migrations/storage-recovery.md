# Encrypted Supabase Storage recovery

Storage recovery is separate from the PostgreSQL archive: Supabase database
backups contain object metadata, [not uploaded bytes](https://supabase.com/docs/guides/platform/backups).
The new commands pair a fully rehearsed database checkpoint with an authenticated,
encrypted object archive. They do not authorize residence/account deletion or a reset.

## Read-only backup and local rehearsal

```sh
npm run db:backup
npm run db:rehearse-backup -- DATABASE_CHECKPOINT_UUID
npm run db:backup-storage -- DATABASE_CHECKPOINT_UUID
npm run db:rehearse-storage -- DATABASE_CHECKPOINT_UUID STORAGE_ARCHIVE_UUID
```

All files stay under the ignored, private `.security/migration-reset/` directory.
Storage archives live in `storage/UUID.pvstorage/`. Preserve both the encrypted
manifest/object files and their separate private `key`, alongside the corresponding
database checkpoint and encrypted server-PIN key. These local artifacts are not
off-host recovery; keep a protected independent copy before final cleanup.

The backup restores the actual PostgreSQL archive into an isolated Unix-socket
database, reads its complete Storage/media catalog and compares it with the configured
live project's catalog. Different projects, changed snapshots, missing ready objects,
unsupported foreign objects, ongoing multipart uploads and integrity mismatches block
completion. Orphan objects from interrupted uploads are included rather than discarded.
Non-ready reservations without an object remain recoverable database metadata.
Photograph recovery supports PineVela's private bucket and its saved UUID-owned PNG paths.
Unknown formats/paths require an explicit reviewed recovery extension; nothing is skipped.

Recovery also includes Studio-created `contexts/CONTEXT_UUID/.emptyFolderPlaceholder`
entries when the native catalog records exactly zero bytes and `application/octet-stream`.
Their actual authenticated provider response must be empty with the same MIME type; the
archive authenticates their path, metadata and empty-byte digest. They are counted as folder
markers and reconstructed separately from PNG files. Application photograph uploads,
downloads and removal still reject these marker paths. Other formats remain unsupported.

Each object is downloaded through the existing server-only Storage client, bounded
to 6 MiB and checked against its saved size and, where available, reservation digest.
Only one object is held in memory at a time. AES-256-GCM authenticates the bytes,
object metadata, project, database checkpoint/digest and complete inventory digest.
The manifest is encrypted too. Files are created exclusively with mode 0600 inside
0700 directories; bounded reads refuse symlinks. Changed inventory or failed transfers
discard the partial archive. Complete directories appear only after every encrypted
file passes recovery verification and files/directories are synced.

The local rehearsal reconstructs every image into a private temporary directory,
checks its size/digest independently and removes the temporary plaintext afterward.
It performs no cloud upload or deletion. Truncated/missing/extra files, changed keys,
cross-archive swaps and a different database binding fail verification.

Capacity is explicitly bounded to 500 buckets, 10,000 objects, 10,000 asset reservations,
4 GiB of source bytes and a 32 MiB encrypted-manifest payload. Exceeding these limits
fails the command; extend the reviewed streaming protocol before using it at larger scale.
SQL captures one extra row beyond each count limit as a sentinel; oversized catalogs
fail before any download rather than publishing a truncated archive.

## Actual provider acceptance

`npm run db:verify-storage-recovery -- --execute` is a separate real-object test.
It requires an existing confirmed Google primary identity with an actual native session,
and zero operational media. It creates no Auth users, sessions, profiles, portals or
published listings. It uploads the actual provided PineVela cover, takes/rehearses
a full database checkpoint, backs up its bytes, reconstructs them locally, then
re-uploads the recovered bytes and checks a real download. Only the generated,
unpublished test object is removed through the Storage API. Private journal files
record the exact path and cleanup state before any upload. An interrupted test can
leave that one object; review its retained journal before retrying or cleaning up.
Its checkpoint intentionally includes the temporary object and is test evidence,
not a final operational reset checkpoint.

## Attach recovery evidence to a founder pause (migration 42)

After the authenticated founder starts an approved housing pause, a trusted server
operator can create and full-restore-test the database backup, archive/reconstruct
the actual Storage bytes, and attach that evidence:

```sh
npm run db:prepare-residence-backup -- APPROVED_PROPOSAL_UUID
```

The proposal must already have current native consent and a genuine founder-created
pause; this command never creates consent, signs in as the founder or deletes data.
Private progress journals live in `.security/migration-reset/residence-recovery/`.
If interrupted, inspect the retained checkpoint/archive IDs and reconcile them by
reverifying the actual files:

```sh
npm run db:attach-residence-recovery -- APPROVED_PROPOSAL_UUID DATABASE_CHECKPOINT_UUID STORAGE_ARCHIVE_UUID
```

If either archive is incomplete, finish its restore/Storage backup first using the
commands above. A changed catalog requires fresh matching archives. An already
recorded receipt accepts only its exact original evidence; it cannot be replaced.
Cancellation requires the founder's key in Admin Approvals; a failed operator run
leaves housing safely paused and preserves its private recovery artifacts.

The immutable private receipt binds the actual archived pause/scope, project,
database digest, Storage inventory, encrypted manifest and checkpoint time. The
worker rechecks current consent and catalog under the native freeze/governance
locks; its notice goes to administrator portals only. No private archive paths,
keys, identifiers or digests appear in browser status. An exact retry records no
duplicate audit/notification. Root operators are trusted to perform filesystem
verification; a transaction marker does not independently prove external recovery.

## Execution gates still required

A matching catalog before/after an export is not proof that writers were stopped,
nor does it stop a later write. The commands report `writerFreezeVerified:false`.
Migration 41 adds a durable, keyed founder housing pause; migration 42's explicit
operator command attaches verified recovery evidence. These commands do not stop
other project/Storage writers. A receipt is historical and cannot establish future
archive availability or provider state. Deletion execution still needs fresh archive
verification, current reviewed consents,
founder own-key final confirmation, reference retention, portal revocation,
cooldown/notification transactions and idempotent approved-object cleanup. The real
provider acceptance test proves object-byte recovery, not an authenticated browser
journey or the deletion state machine. Ready/media read authorization still requires
the original saved digest; the operator orphan-backup path does not relax browser RLS.

Never delete `storage.objects` rows directly: only the
[Storage API removes the underlying files](https://supabase.com/docs/guides/storage/management/delete-objects).
Recovery evidence adds one private table; there is no exposed recovery RPC,
backend-default switch or JSON deletion.
