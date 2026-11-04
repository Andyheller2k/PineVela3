# Manager onboarding and secret-key update — 3 November 2026

The manager dashboard now shows a first-visit welcome popup and saves the same
message in that manager's Alerts. The popup links to Register Your Property when
setup is pending. Closing it records an acknowledgement against the signed-in
manager's own notification. The new routes derive the manager context from the
session and never accept a client-selected recipient.

Residence registration has its own dashboard tab. Moving to Alerts or Settings
keeps the unfinished form mounted, including its selected files, so returning
to Register resumes the same draft during that dashboard session. A full page
reload or sign-out still discards an unsubmitted draft. Step 4 starts with an
Add Block button, changes to Add Another Block, and requires 1–10 blocks. Its
Add Room Type / Bedspace control is immediately visible at the top of every
block. The final confirmation includes Terms of service and Privacy policy
links. Room numbering and bedspace calculation were not changed.

Visible notification read receipts no longer request the manager operation
key; those endpoints can only mark the authenticated recipient's own alerts as
read. Business changes still require the key. A malformed key is rejected
before setting an HTTP header, and a well-formed but incorrect key gets an
"Invalid manager secret key" response beneath the input. The dialog keeps
the entered value available for correction. Copy controls show "Copied" only
after the clipboard confirms a successful write.

## Apply

Back up the existing `dist-supabase/` and `dist-supabase-backend/` folders in
the Spaceship `pinevela-app` application. Extract the matching web ZIP directly
into that application root, replacing those two build folders, then restart the
Node app. Keep `app.cjs`, environment variables, private files and
`node_modules`. There is no database migration in this update: it uses the
existing notifications and notification recipients tables. Keep the ZIP
outside the public web root.

Install the matching Android debug APK over the existing PineVela Development
app to update its bundled screens. It uses the existing debug package and
signer, so an over-install preserves app data. This APK is for development;
it is not a Play Store release. Restore the previous two hosting folders and
restart Node to roll back the web/server update.

## Verification boundary

TypeScript lint, focused manager/key/registration tests, the Android unit
suite, web and mobile production builds, and the debug APK build passed. The
package process checks ZIP hashes and verifies that every built mobile asset
matches the APK. The manager welcome tests use a simulated database client;
the current signed-in manager flow has not been exercised against the live
Supabase project. Nothing in these packages has been deployed remotely.
