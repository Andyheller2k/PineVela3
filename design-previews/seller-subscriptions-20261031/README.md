# Seller subscription design preview

31 October 2026. A standalone draft, not wired into the seller app or checkout.

Open `index.html` in a browser to switch Light/Dark and preview the current plan
as Pine Default or Pine Star. `preview-board.png` shows all four combinations.
The desktop images show the same comparison at a wider viewport.

The reference supplies the comparison structure. PineVela supplies the logo,
white/blue Light palette, navy/yellow Dark palette, plan limits and benefits.
Emoji icons are static; there are no looping effects or third-party scripts.

- Default compares with Star: 20 → 100 items, 1 → 5 services, 200 → 600 units,
  custom store cover/logo and a glowing badge.
- Star compares with Pro: 100 → 200 items, 5 → 10 services, 600 → 900 units,
  custom branding retained, golden listing frames and featured-search priority.
- The next tier has a tinted column with a named Upgrade header. The primary
  upgrade button is blue/white Light and yellow/navy Dark; keeping the current
  plan is a separate secondary action.

Values come from `marketPlans.ts`, `marketBranding.ts` and the existing seller
page. GH₵90/150 are **code-default preview rates**, not a verified hosted quote.
Implementation must continue to read admin-configured rates, effective plan
status and payment eligibility from the existing APIs. It must retain secure
checkout, verified paid periods, separate registration/two-month fees, pending
payment recovery and no automatic debit. Pine Pro needs its own current-plan
state rather than an invented fourth tier. No entitlement or API rule changes
are proposed by this draft.

`render-preview.cjs` renders the draft with a disposable local Chromium profile.
`preview-checks.json` records 16 cases: 320/390/430/1280px × both themes × both
current plans. It checks horizontal fit, labels, button size, action colours and
text contrast of at least 4.5:1, plus interactive theme/plan controls. The lowest
measured sampled text contrast is 6.2:1. These are prototype checks, not an
authenticated checkout or an Android/iOS implementation test.

The emulator APK investigation is separate:
`docs/verification/subscription-preview-2026-10-31/android/`.
