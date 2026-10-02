# S01 remediation — exposed credentials and sessions in Git

Date: 2026-10-02. Scope: S01 only.

## Status

**Local containment implemented and verified. Historical cleanup is prepared but not published. S01 is not fully closed.**

The active checkout and GitHub history still contain the original historical commits. A separate cleaned repository has been prepared at `.security/s01-clean-history.git`; private runtime paths were removed from all five original commits. Publishing it requires authenticated GitHub access, a fresh comparison against remote branches/tags, and approval to replace shared history. No force-push or rewrite of the active checkout has occurred. Other deployed instances and existing external clones have not been inspected or modified.

## Changes applied

- Stopped tracking `data/pinevela_store.json` and the three tracked runtime uploads, retaining the local files. Their deletions are staged for the next commit.
- Ignored runtime data, uploads, local environment files and `.security` recovery artifacts. Added a pre-commit guard and enabled it locally using `core.hooksPath=.githooks`.
- Added a one-time credential-exposure migration. Existing password copies are locked pending recovery, plaintext aliases are removed, and `token`, `merchantToken` and `sessionToken` are revoked recursively. Protected password history prevents reuse during recovery.
- Applied that migration to the local operational database: 23 credential records locked and 25 session fields removed. These are field/record counts, not counts of unique people.
- Prevented startup from recreating sessions for locked accounts and removed the source-defined officer accounts with known default passwords. Existing registered officer records were retained and their credentials locked.
- Persisted database writes with permission `0600`. Optional `PINEVELA_DATA_DIR` supports a private data directory outside the checkout.
- Added an offline password-recovery command that updates an existing identity without creating accounts or changing roles. Password entry is hidden and supplied in the terminal, never as a command argument.
- Restarted the local development server with these protections. Existing local accounts now require fresh passwords.

## Verification

| Check | Result |
|---|---|
| Old tokens from the current database and five historical snapshots | All 27 distinct tokens rejected with HTTP 401 by `/api/auth/me` |
| Historical exposed-password attempts against user, merchant and officer login routes | All 21 attempts rejected |
| Local database after restart | Zero active session fields and zero unlocked password fields; exposure migration version persisted |
| Record preservation | User, hostel, merchant application/store, booking, maintenance and officer counts unchanged |
| File permissions | Database is `0600` |
| Automatic startup containment | Passed using a private copy of the original local database |
| Recovery and restart | Fresh administrator password and session both returned HTTP 200 after restart in the private copy; operational account passwords were not changed by this test |
| Credential-security unit tests | Passed |
| Existing account-isolation integration suite | Passed |
| Git guard | Rejects a temporary index containing the historical private database; accepts the cleaned index |
| Production build | Passed |
| TypeScript | Still fails only on the pre-existing TS2367 at `src/components/PageDigitalMarket.tsx:3536`; outside S01 |

No credential values are included in this report. Verification used the local deployment; this does not establish that any separately deployed server has been updated.

## Recover local account access

Stop the running PineVela server before offline recovery, so its old in-memory state cannot overwrite the new password. From the project directory run:

```text
node --import tsx scripts/credential-recovery.ts reset <account-email-or-id> <role>
```

Replace the two bracketed arguments with the existing account identifier and role. Supported account records include ordinary users, administrators, managers, staff, students, merchants and verification officers. Enter and confirm a fresh password at the hidden prompts. Start PineVela again with `npm run dev`, then sign in normally. The old session remains invalid. Recover an administrator first; existing authenticated administration tools can then reset other accounts.

The command does not create a new administrator and does not reuse the old password. Do not paste passwords into chat, source files, environment examples, Git commands or shell arguments.

## Finish historical cleanup

1. Restore authenticated GitHub access locally. The read-only `git ls-remote` check failed because Git could not obtain a GitHub username/credential; no push was attempted.
2. Re-read all remote branch/tag tips and compare them to the cleaned repository. Include any newly published work before proceeding.
3. Review the prepared S01 commit and approve replacement of the affected shared history. Use an exact `--force-with-lease` tied to freshly verified remote tips, not an unconditional force-push.
4. Update local branches to the cleaned history while preserving unrelated working-tree changes. Collaborators must replace or clean old clones instead of merging the exposed history back.
5. Request provider cleanup of cached commit/PR references where needed; rewriting a branch cannot erase third-party copies. Credentials stay revoked regardless of history cleanup.
6. Apply this code and credential revocation to every separately deployed instance. Verify old sessions there before closing S01.

Keep `.security` private. Do not commit or upload the original credential-bearing snapshots. New clones should enable the guard with `git config core.hooksPath .githooks`; CI can run `npm run check:private-data`.
