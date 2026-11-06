# Notification settings cleanup — 5 November 2026

The shared device notification panel now contains only **Enable device
notifications** or **Save notification preferences**. The test and device-disable
buttons and their unused client handlers are removed. Account/maintenance,
marketplace and residence choices remain; every category can be turned off and
saved. Sign-out still revokes the installation through the existing logout path.
The protected operator diagnostic endpoint remains separate from the settings UI.

The cumulative web ZIP and development APK include the preceding resident PIN,
image compression/cache and Android navigation changes. No dependency, SQL,
environment or private sender-file change is required for this cleanup; both
preceding database migrations are already applied.

- `releases/web/pinevela-notification-settings-cleanup-20261105.zip`
- `releases/android/pinevela-notification-settings-cleanup-20261105.apk`
- `docs/verification/notification-settings-cleanup-2026-11-05/summary.json`

TypeScript, production web/backend build and Android debug build passed. The
existing browser suite passed 51 checks, including both themes at phone/desktop
sizes, opt-in permission, preference saves, all categories off, separate-account
consent and notification recipient routing. API/permission replies in this suite
are explicit local fixtures; they do not establish hosted delivery.

The live deployment and emulator installation records in the verification
directory establish what was actually installed. A host rollback ZIP was created
outside the website/application root before deployment. Preserve `.env`, existing
environment settings, database CA, delivery-PIN master and push sender keys.
For manual recovery, restore the saved dist folders and restart the Node app;
do not roll back the already-applied additive SQL.
