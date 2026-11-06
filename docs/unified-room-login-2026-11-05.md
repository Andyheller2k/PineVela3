# Unified room login — 5 November 2026

The login card now accepts an email and either a password or room PIN in the
same fields. The credential field is labelled **Password**. The Login / Sign Up
slide remains; the extra authentication-method selector is removed.
Primary email/password opens the primary account, and
primary email/valid room PIN opens its separate resident account.

PIN recovery is in the primary account: **Settings → Manage active room →
active room status card → Reset room PIN**. It appears only for an activated
room, with three short sign-in steps beside it: primary email, room PIN in the
Password field, then Login. Pending, closed and suspended rooms cannot use this
recovery endpoint.
Existing email-based resident/seller accounts retain their existing credential
and portal-security flow. An interrupted new setup or a move after room release
can choose a fresh PIN only with verified primary ownership and a valid available
room key.

## Installation

Use `releases/web/pinevela-unified-room-login-20261105.zip` in the existing
`pinevela-app` root, then restart Node. Back up both build folders first. This is
a cumulative build, preserving the preceding notification, media and resident
activation fixes. It needs no new SQL, dependencies, private files or environment
changes. Preserve existing `.env`, database certificates and `.security` files.
The preceding 5 November resident/media migrations are already applied.

The matching development APK is
`releases/android/pinevela-unified-room-login-20261105.apk`. Install it as an
update; do not clear app data. This is a development APK, not a Play Store release.

## Authentication boundary

Only the normal login endpoint without a requested role or legacy portal PIN
may resolve a 6–12 digit room PIN. An exact valid room PIN takes precedence if
it matches a retained numeric primary password. Otherwise a numeric primary
password still has its ordinary meaning. No PIN grants primary/admin access.

Each submission makes one public-key native Auth token exchange, retaining the
required CAPTCHA and admission limits. Failed probes roll back counters before
trying a retained primary password; a failed exchange commits the PIN denial.
Recovery rewraps the same isolated provider credential and invalidates previous
resident bindings. Primary and seller passwords remain unchanged. The old
resident-login API remains for installed-client compatibility.

Competing room activations recheck the current PIN and allocation. A database
deadlock retries only the rolled-back transaction once, then returns a readable
conflict. Native Auth identity creation is outside that retry.

## Verification

Evidence is in `docs/verification/unified-room-login-2026-11-05/`:

- 110 isolated real GoTrue/PostgreSQL/HTTP checks: common-form sign-in, account
  isolation, CAPTCHA, persistent lockout, recovery, competing activations,
  legacy credentials and allocation/media authorization.
- 36 browser scenarios at 320, 390 and 1440 pixels in both themes cover one-form
  submissions, activation and absent/pending/closed/active room recovery.
- 42 unit checks cover resident cryptography, Auth protection, login admission,
  mobile Auth, native transport and account access.
- TypeScript, web/backend builds, Android build and packaged asset/secret checks.

The local checks use fixture accounts and make no cloud writes, mail, pushes or
room claims. `hosting-application.json` records actual deployment separately;
`android/debug-install.json` records the emulator installation. Positive cloud
room activation/recovery is left to the owner's normal use of a genuine room key.
No iOS build or store submission is included.
