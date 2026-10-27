# Merchant backdrop, navigation and clearer glass — 24 October 2026

The [browser-rendering correction](auth-browser-rendering-2026-10-24.md) contains
the latest auth-card material and upload package. The checkpoint below precedes
that correction.

Dark-mode merchant registration now uses a translucent navy scrim with 12px
backdrop blur. A broad dark utility override previously made that scrim opaque.
The scoped correction covers both the registration-status dialog and the actual
seller form. Form panels keep their readable solid surfaces; light mode is
unchanged. The separate full-page marketplace onboarding flow is unchanged.

Unnecessary “Portal” branding in product headings, navigation and access notices
has been replaced with PineVela, Dashboard or natural wording. Internal routes,
role identifiers and meaningful PIN/account-separation explanations remain.

Shared navbar SVG icons now make short, finite gestures on hover, tap, keyboard
focus/activation and selection. Settings turns, notifications swing, housing and
shopping icons bounce, and other icons use restrained related motions. Only the
icon transforms; labels, highlights and button geometry stay still. Duplicate
events are coalesced. Reduced-motion preferences suppress motion, and active
motion is cancelled when a control disappears, becomes unavailable or changes
into a loading indicator. No continuous animation or API request is introduced.

Login/signup glass is slightly clearer again: phone/tablet tint is 5–9% navy
with 1.5px blur; desktop tint is 34–40% with 6px blur. Backdrop-only dimming keeps
status text readable over bright artwork. Fields, buttons, muted hints, fixed
portrait positioning, internal card scrolling and accessibility fallbacks remain.

## Verification

- TypeScript, production frontend build, officer-verifier syntax and final diff
  checks passed. This update changes no schema, API or authorization boundary.
- Final guest browser regression passed 257 checks across 55 scenes. Both auth
  forms were checked at seven viewport sizes, including settled fonts, reachable
  controls, bright-image contrast, hints, independent portrait scrolling and
  reduced-transparency fallback. No account/CAPTCHA submission was performed.
- Public navbar motion passed 15 browser assertions across three scenes using
  actual CDP mouse input: hover, finite duration, stable geometry, Menu-to-X
  replacement, cleanup and reduced-motion cancellation/suppression.
- Real primary-user merchant registration passed six light/dark scenes at
  375px, 768px and 1440px. The actual form loaded, dashboard remained visible
  behind the dark blur, native modal state/scroll locking worked, and closing
  removed the overlay. The status-dialog hook was source checked separately.
  These scenes used the preceding merchant-only build with the same merchant
  source and styles. No registration was submitted; all non-GET requests were
  blocked. A pre-existing launcher-focus limitation remains: an asynchronous
  status refetch can disable the opener before the modal captures it.

- The final candidate's genuine primary-user navigation audit recorded 110
  passing assertions across 25 cases: sidebar/top/mobile controls, correct SVG
  keyframes, finite timing declarations, event deduplication, stable geometry,
  actual selection, Ask AI dialog and the corrected merchant dark overlay.
  Three non-GET requests were blocked, no runtime exceptions occurred, and the
  original top-navigation/light preference was restored before closing the tab.
  The raw report remains partial (`passed: false`): 24 completion/live-media
  assertions could not be established because that debugger session kept all
  WAAPI animations at `currentTime: 0` and did not deliver media-change events.
  CDP control clicks also required activation through the genuine DOM controls.
  These results do not establish hardware touch/keyboard behavior or visual
  completion on the signed-in page. The separate 15-check public run verified
  this same controller's completion and reduced-motion cancellation in an
  isolated browser using actual mouse input. Physical touch/iOS compositing
  and other authenticated role journeys remain outside this focused audit.

Evidence is under `.security/production-readiness-2026-10-23/navigation-ui-audit-2026-10-24/`
and `merchant-backdrop-audit-2026-10-24/` in the same parent directory.

## Upload

Use `/tmp/pinevela-preview-navigation-ui-20261024.tar.gz` (3,083,666 bytes).
This consolidated frontend archive supersedes the earlier clear-glass package
and includes the preceding frontend fixes. Extract into
`/home/jqmgxgpuym/pinevela-app`, retaining existing assets. Refresh the preview
and close/reopen the installed app. No Node restart is required for this frontend
update. Remote installation has not been performed by the agent.

127 changed public frontend files; all 171 public build files were scanned for
configured private credentials and source maps, with zero matches. No API or
private files are included. Archive members were byte-verified, and index.html
is last. SHA-256:
`c8a329f0ebfb15d1cb2c322652c3a81ceb885881ad9330e8cc94b459c3d2b488`.
