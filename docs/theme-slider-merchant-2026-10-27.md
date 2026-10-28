# Theme slider and merchant gold — 27 October 2026

Appearance settings again use the compact rounded Light/Dark control with a
moving circular gold thumb. A separate rounded **System default** option sits
beside it. The native switch toggles Light/Dark with Space or Enter. The adjacent native
button selects System default. Both have visible focus, touch targets at least
44px high, reduced-motion handling and forced-colors support. The thumb reflects the effective device appearance
while System is selected; choosing Light or Dark switches to that explicit mode.
Theme resolution, saved preferences, account synchronization and login/logout
behavior are unchanged.

The eligible **Become a Merchant** button had a gold style, but the later dark
product secondary-button adapter matched its white-background utility and
replaced the gold gradient and shadow. The adapter now excludes this specific
CTA in both normal and hover states. Its dark-mode sheen repeats gently over
4.8 seconds. Light mode retains the previous entry sheen; reduced motion keeps
the gold background without the animation. Pending, approved, restricted,
loading, error and manager registration controls retain their existing styling.

The install package is `/tmp/pinevela-app-update-20261027.zip`.
Extract into the existing Spaceship `pinevela-app` folder, merging and overwriting
matching files, then reload the site or reopen the installed app. Keep older
hashed assets for open tabs. This is a frontend-only update: no Node restart,
dependency installation or migration is required. The latest privacy/terms pages
are included. Install this after the older app/theme or policy-only packages.
No remote deployment or database changes are part of this UI update.

The same package includes [on-demand verification and phone performance changes](mobile-performance-2026-10-27.md).
