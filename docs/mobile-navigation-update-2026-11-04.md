# Mobile bottom navigation — 4 November 2026

The approved curved navigation replaces the floating mobile bar across user,
resident, seller, manager, staff, administrator, field-officer and support pages.
Desktop navigation keeps its existing layout and colors.

- Light mode: white surface, PineVela blue selected circle and label, white icon
  inside the circle.
- Dark mode: PineVela blue surface, yellow selected circle and label, navy icon
  inside the circle.
- Standard bars move the cutout and circle to the selected destination over
  500 ms while the previous icon lowers and the next icon rises. Rapid taps
  continue from the current position. Reduced motion changes selection directly.
- Seller and resident bars keep the raised center plus. Their side selection
  slides between destinations. Seller Publish opens the existing item/service
  forms; resident Actions opens the existing room quick actions. Seller Services
  remains available in More.
- The surface reaches the screen's bottom edge. Content clearance follows the
  measured bar height, including browser safe-area insets. Android keeps its
  existing contained WebView and paints the system navigation area to match.
- More destinations, account restrictions, badges, keyboard access and Ask AI
  keep their existing behavior.
- Unread urgent work without a numeric count has a red update dot and an
  accessible update label. More also shows a dot for hidden destinations needing
  attention, without changing the selected tab's theme color.

## Verification and scope

Evidence is saved in `docs/verification/mobile-navigation-2026-11-04/`.
Browser checks use the actual built application with local account/API fixtures.
Android checks use a separate test package so the existing development account
is preserved. They do not submit registrations, change hosted accounts or make
payments. The final release manifest records the completed checks and hashes.

The Android APK is a development build using the existing debug package and
signature. Shared mobile UI is ready for an iOS build; iOS was not compiled or
tested on this Ubuntu machine. This update has not been deployed to pinevela.app.

## Apply or roll back

Install `releases/android/pinevela-mobile-navigation-20261104.apk` over the
existing development app. Do not uninstall first if keeping local app data.

For hosting, back up `dist-supabase/`, then extract
`releases/web/pinevela-mobile-navigation-20261104.zip` inside the existing
`pinevela-app` root. Replace the frontend folder and restart the existing Node
app. The archive also has a copy in `/tmp/`. No SQL migration, dependency change
or backend replacement is needed for this navigation update.

To roll back the website, restore the previous frontend folder and restart Node.
Earlier APKs and hosting ZIPs remain saved in `releases/`.

See [emulator startup and persistence](android-emulator-persistence-2026-11-04.md)
for the local Pixel AVD startup settings and verification.
