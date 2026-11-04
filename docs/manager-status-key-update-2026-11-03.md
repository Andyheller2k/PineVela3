# Manager registration status and key prompt update — 3 November 2026

The manager Alerts page now shows a compact PineVela-themed locked-tabs notice.
Before residence submission it says registration has **not** been submitted;
only an actual `under_review` case is called pending review. Corrections and
rejection get their own explanation. The notice disappears after approval.
Register Your Property opens the saved registration form while setup or
corrections are outstanding, and shows a status card after submission. The
card shows Pending, Approved or Rejected, including administrator notes for
corrections or rejection. Its source is the signed-in manager's assigned
residence; the browser cannot choose another manager or property.

Final residence submission asks for the manager secret key once. The same key
is attached to that submission's protected photo uploads and database request,
then discarded; the server validates each request and still enforces its
existing manager assignment, media ownership and review checks. A wrong key
stays in the dialog for correction. A cancelled action sends no new request.
Changing only a manager profile picture no longer asks for the manager key.
The dedicated avatar endpoint accepts only `photo`, is scoped to the signed-in
identity, and keeps the existing content review and owned-media checks.
Changing display name or phone remains on the protected profile route.

## Apply

Back up the existing `dist-supabase/` and `dist-supabase-backend/` folders in
the Spaceship `pinevela-app` application. Extract the web ZIP at the application
root, replacing those build folders, then restart the Node app. Keep `app.cjs`,
`node_modules`, environment variables and private files. No SQL migration is
needed. Keep the ZIP outside the public web root.

Install the matching Android debug APK over the existing PineVela Development
app to update its bundled screens. It is for testing, not Play Store release.
To roll back the website, restore both backed-up build folders and restart Node.

## Verification boundary

TypeScript lint, focused manager-key/status tests and a direct local HTTP test
for the avatar endpoint passed. The direct test covered a manager's own picture
save and denials for extra profile fields, a foreign context and a non-manager.
Web and mobile production builds passed. The Android build and package integrity
checks are recorded in the release ZIP. This update has not been deployed to
pinevela.app or verified through a signed-in live manager session.
