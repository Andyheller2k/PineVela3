# Numeric password recovery — 22 October 2026

The recovery dialog now asks for a numeric recovery code, new email password,
and confirmation. It retains CAPTCHA on the send request, a non-enumerating
response, duplicate-submit protection, and password matching. Codes stay strings
so leading zeroes survive; whitespace from pasted email is removed. Existing
provider links remain accepted by the backend for previously issued mail.

`emails/reset-password.html` contains PineVela's existing public logo and one
`{{ .Token }}` substitution, with no reset link. It must be saved as the hosted
Supabase **Reset password** template, using subject **Your PineVela password
recovery code**. No Supabase Management API credential is available in this
workspace, so the owner must perform that configuration step. The repository
template alone does not change live email bodies. See [email setup](../emails/README.md).

## Verified

Thirty-six checks passed against an isolated real PostgreSQL, GoTrue v2.197.0
and Mailpit stack with all 82 immutable application migrations. GoTrue fetched
the actual template over an owned loopback HTTP endpoint and sent real recovery
mail to the local capture service:

- The delivered HTML contained its actual eight-digit OTP, the logo, and no
  recovery link or unresolved template variable.
- Wrong mailbox, wrong proof type, incorrect/truncated codes, weak passwords and
  extra account selectors failed without changing the password.
- The correct numeric code changed only its verified identity's password and
  created no app session. Other identities, passwords and sessions stayed intact.
- Reusing the code failed. The old password failed; the new password worked,
  including after logout and another login. Old app bindings were revoked.

Two actual test identities were created only through the real local signup and
captured confirmation process. No provider response, token or identity was
fabricated. No hosted account or password was changed; no external mail was sent.
The owned test services were stopped and private recovery evidence retained in
`.security/recovery-code-2026-10-22/`.

Focused TypeScript checks for the changed dialog and new verification script,
the frontend build, and diff checks passed. The new frontend was published
without restarting the backend or removing older hashed assets. A scan of 138
frontend files found no configured private values.

Four actual-browser checks passed for initial dialog layout at 375 and 1440 px.
That browser's Managed challenge did not issue the recovery widget proof before
its deadline; code-stage browser assertions were not reached. This is separate
from the completed native captured-email recovery test and the earlier passing
genuine-token CAPTCHA guard checks. Do not describe live hosted template
publication or inbox delivery as verified until the owner saves the template and
performs an actual recovery to an accessible inbox.

Rerun on an empty, owned native stack prepared with the actual template URL:
`npm run db:local:recovery-code -- /absolute/path/to/private-stack-metadata.json`.
The shared harness refuses cloud/ordinary preview targets. Setup details and
the exact private bootstrap receipt are retained alongside the result.
