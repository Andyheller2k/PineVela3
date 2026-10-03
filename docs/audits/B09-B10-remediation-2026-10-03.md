# B09/B10 remediation — 2026-10-03

Scope: corrupt-database preservation and a constrained single-writer JSON backend during
migration. No operational database was corrupted, restored or manually replaced.

## B09 — fail closed and explicit recovery

- `persistentDb.ts` no longer returns defaults after existing-store read, parse or migration
  failure. Initialization failure also propagates; startup's swallowed initial save error
  is removed. Startup failure produces a nonzero exit before listening.
- `jsonStoreSafety.ts` checks strict UTF-8, JSON root/known collection shapes, readable
  regular files, recovery artifacts and configured size before transformation/replacement.
  Missing legacy fields still use defaults; present malformed fields reject the file.
- Saves retain one prior validated snapshot in a private `.bak` with file/directory fsync
  and atomic replacement. Original corrupt input and the existing backup remain untouched
  when startup validation fails. Database errors omit JSON contents.
- `scripts/database-recovery.ts check|restore` requires the writer to be stopped. Restore
  validates the backup first, preserves original bytes in `.quarantine`, and revokes all
  restored sessions and pending signup challenges. Invalid/oversized backups and an existing
  quarantine are rejected. There is no silent automatic restore or empty reset.
- Development Vite file serving denies the real configured data directory and its database,
  backup, lock and recovery artifacts, as well as default data/security directories.

## B10 — enforced supported operating mode

- A nonblocking Linux `flock` lease is acquired before load/initialization and retained by an
  inherited open file descriptor for the in-memory snapshot lifetime. Competing servers and
  credential/recovery tools fail before writing. Kernel release handles exit and SIGKILL;
  the lock inode is retained, and removing/replacing it invalidates the writer.
- Network/unsupported filesystems and non-Linux platforms are rejected. Supported local
  filesystem types are documented in `docs/database.md`.
- A SHA-256 expected-content check rejects saves after out-of-band file changes. Unique
  temporary filenames and private atomic writes replace the timestamp-only temporary name.
- Reads and serialized saves are bounded by `PINEVELA_JSON_MAX_BYTES`: default 64 MiB,
  accepted configuration 1–256 MiB. A failed backup write prevents primary replacement.
- Offline credential recovery now uses the same lock, digest/backup and size checks and
  refuses to initialize a missing operational database.

This resolves B10 through a constrained single-writer design. Whole-store JSON work is
still synchronous and does not provide PostgreSQL transactions or multi-worker support.
Migrate to transactional PostgreSQL before clustered/network or high-volume deployment.

## Verification

The full existing security suite passed **90 tests, 0 failed**. Final focused process/
filesystem/UTF-8 checks were rerun after the last guard additions: **6 passed, 0 failed**.
`npm run lint`, `npm run build`, `npm run check:private-data` and `git diff --check`
passed. The build retains the existing bundle-size warning. The current operational JSON
also passed read-only structural validation; no file was changed by that check.

New disposable tests verify corrupt/truncated/invalid-root/invalid-collection/invalid-UTF-8
input stays byte-identical; unreadable directory and symlink inputs reject; missing primary
with a backup does not initialize defaults; one writer excludes another server and both
offline tools; a real SIGKILL releases the lease; restart retains records; stale writes,
size overflow, replaced lock inode and failed backup writes refuse replacement; backups
and quarantine are private; validated restore preserves history but invalidates old sessions;
invalid backups and repeated quarantine overwrite reject; Vite denies recovery artifacts
from a configured directory outside the default data path. B01 collection round trips and
all previous security regressions remain passing. No destructive load test was performed.

## Recovery limits

There is one rotating backup and one quarantine, not historical backup retention. Budget
primary + backup + temporary space (roughly 3 times the configured store bound), plus
quarantine after restore. An unreadable/oversized original needs operator preservation
before recovery. Missing backups cannot recreate already lost records. An older snapshot
may predate recent allocations, orders or account approval changes; sessions are revoked,
but the restored business state still needs operator review. Private operator backups and
PostgreSQL migration remain necessary for broader durability/scale requirements.

See `docs/database.md` for the offline check/restore commands and deployment constraints.
