# PineVela UI rules

The reference is the user's **5 UX Laws** image (Fitts, Hick, Jakob, Proximity, and Von Restorff). These are design heuristics, not a certification checklist.

| Principle | Project convention |
| --- | --- |
| Fitts | Touch controls have at least a 44 × 44 CSS pixel target; wrapped checkbox/radio labels provide the hit area. Frequent mobile destinations stay in the bottom bar. Fixed shortcuts must clear the bar, each other, and the final content. |
| Hick | Show at most five primary mobile destinations. Group additional destinations in the **More** dialog, retaining their counts and existing access restrictions. Reveal optional filters and FAQ answers on demand. |
| Jakob | Use the same navigation component across dashboards. Selected destinations have `aria-current`; toggles expose their state. Use named native dialogs through `DashboardOverlay`, with focus containment, Escape cancellation and return to the opening control. |
| Proximity | Keep field labels beside their fields, supporting text with its field, and related actions together. More destinations are grouped by work area. Accessible field names use the actual field purpose. |
| Von Restorff | Give the main action clear emphasis, keep secondary actions quieter, and reserve alert badges for actual pending work or unread activity. An update dot represents an update without inventing a count. Respect reduced-motion settings. |

## Shared implementation

- `src/ux.css` provides touch targets, keyboard focus, navigation spacing, and safe mobile content clearance.
- `src/components/MobileNavigation.tsx` provides grouped mobile navigation.
- `src/components/DashboardOverlay.tsx` provides modal focus and cancellation behavior; required flows may explicitly use `onClose={null}`.
- `src/lib/keyboardActivation.ts` supports existing click surfaces with Enter/Space without intercepting their nested controls.
- `src/publicPages.css` gives opaque public headers matching light and dark appearances.

Keep desktop layouts, genuine account data, permission checks and workflows intact. Do not remove destinations to reduce choice count. Do not use flashing animation as the only indication of unread or selected state. Use visible labels and accessible names for icon controls, fields, photographs and upload areas.

## Verification

`node --import tsx --test tests/uiRules.test.ts` checks every component for unnamed fields/icon buttons and inaccessible click surfaces. `node tests/theme.browser.cjs` uses real Chromium and the real API with disposable storage to check dashboard roles, mobile dimensions, overlap, names, themes, More navigation and focus. Browser assertions cover exercised states, not every possible account/data combination; review new dialogs and populated forms visually and with the keyboard.
