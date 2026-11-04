# Seller subscription comparison update

31 October 2026. Local app update; hosting deployment is separate.

The approved preview is implemented as one responsive comparison for mobile web,
desktop web and bundled Android. Effective Pine Default compares with Star;
Star compares with Pro. Pro shows its current benefits and a renewal action.
Emoji feature icons are static, with a highlighted next-tier column and clear
blue/white Light or yellow/navy Dark checkout buttons. App navigation and the
Become a Merchant invitation retain their existing gold treatment.

Prices come directly from `usePlatformSettings().settings.subscriptionPrices`.
No GH₵90/150 example prices were copied from the design preview. The existing
settings query refreshes every 30 seconds while active, on eligible focus and
reconnect, and through existing query-sync/foreground events. There is no new
poller or price cache. Missing, negative or non-finite rates disable that plan's
checkout and never fall back to a code-default rate. Zero is a valid rate.

Feature capacities and benefits derive from `marketPlans.ts`. The parent keeps
the existing checkout handler, account-bound request IDs, loading guard, server
responses and payment redirects. The checkout request still contains purpose,
plan and requestId; the server determines the amount and eligibility. Prices
are reviewed in secure checkout before paying. No client-side entitlement or
payment completion was introduced.

Other plan choices and current-plan renewals remain under See all plans and
renewal prices. Registration, two-month fees, verified paid periods, test-mode
notices and unfinished-payment access remain. Keeping the plan returns to the
seller dashboard. The unrelated publish FAB is absent on this billing screen
so it cannot obscure its price or actions. Publishing elsewhere is preserved.

Verification reports and screenshots are in
`docs/verification/seller-subscriptions-2026-10-31/`. Browser tests use isolated
synthetic seller/settings/payment responses and block outgoing HTTPS. They do
not prove hosted authentication, database authorization or a live charge. Native
startup and installed-build persistence are separate from explicitly labelled
SSR markup/CSS probes; authenticated seller checkout is not exercised on Android.
iOS is not built on this Ubuntu workstation.

Final local checks passed: TypeScript, web/mobile builds, Capacitor sync, Android
build, 13 focused unit checks, 33 subscription browser scenarios and 10 existing
seller/public regression scenarios. Browser cases cover four viewport widths,
both themes, all effective plans, live synthetic admin-rate changes without a
reload, missing prices, expired Pro access, checkout payloads and reachable
buttons. The minimum sampled text contrast is 6.3:1. The delivery scan found no
configured server secrets. All three backend bundles are byte-identical to the
preceding mobile UI update after excluding source-map references.

The final APK was installed over the previous development build with data
preserved. Android startup and six separate plan/theme SSR/CSS probes passed
(12 checks each). The installed checksum remained correct after normal shutdown
and plain-command Quick Boot reopening without another install. This verifies
installed build persistence, not an authenticated native checkout.

## Install

Persistent website ZIP: `releases/web/pinevela-seller-subscriptions-20261031.zip`.
A matching copy is saved to `/tmp/pinevela-seller-subscriptions-20261031.zip`.
Back up the two existing hosting build folders, extract the ZIP directly into
the existing `pinevela-app` root, replacing `dist-supabase/` and
`dist-supabase-backend/`, then restart Node. Preserve `app.cjs`, dependencies,
private data, environment variables and hosting settings. No SQL migration,
new dependency, DNS, SMTP or OAuth change is needed for this UI update.

The development APK is stored permanently inside the project at
`releases/android/pinevela-seller-subscriptions-20261031.apk`. It is debug-signed,
not a Play Store release. Earlier saved APKs and website ZIPs are retained.

Rollback: restore the previous hosting build folders and restart Node, or
reinstall the previous development APK. Packaging does not publish the app.
