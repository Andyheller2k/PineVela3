# Personal appearance

`ThemeProvider` owns the shared light/night mode; `ThemeEnvironment`, `ThemeToggle`
and `src/theme.css` provide the atmosphere, switch and existing-surface adaptation.
The landing page crossfades the supplied day/night images. Reduced-motion users get
the same theme and readable surfaces without travel, breathing or transition effects.

The last device mode is applied in the document head before React renders. Each
authenticated account caches its own mode and saves it through `GET/PUT
/api/auth/appearance`. Only `theme: light | dark` is accepted. Server session identity
selects the record; matching email addresses never combine preferences. New accounts
inherit the current device appearance. Logout retains the last appearance on public
pages. Failed writes remain cached across reloads and retry when the connection
returns or the account is reopened. Writes are serialized so rapid toggles preserve
the final choice.

During the JSON migration period, `appearanceTheme` lives on its owning user,
officer or merchant credential record, so restart preserves it and account deletion
removes it. When migrating to PostgreSQL, preserve the preference on the corresponding
account/profile with owner-only RLS. Personal appearance requires no administrator
settings key and does not change global platform settings.

Verification: `npm run test:theme` checks
authentication, rejected spoofed fields, same-email isolation, pending-manager,
merchant/officer access and persistence after restarting an isolated server.
After `npm run build`, `npm run test:theme:browser` runs Chromium checks on
landing/login/company screens and every account portal at desktop/tablet/mobile
sizes, including reduced motion, saved preferences and nested maintenance dialogs.
