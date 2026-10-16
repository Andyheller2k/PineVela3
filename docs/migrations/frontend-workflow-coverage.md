# Frontend workflow audit and isolated acceptance plan

15–16 October 2026. This records source review and specific browser checkpoints;
it does not claim that every authenticated workflow has passed. The frontend now
uses the native API only. Legacy data archival is recorded in the main cutover
documentation. Automated dummy identities belong only to disposable local Auth
and PostgreSQL; they must not enter the configured cloud project or default UI.

The administrator directory timeout follow-up passed a new rebuilt browser run:
404 assertions, 15 actual UI logins, 513 API requests and zero runtime exceptions.
It verifies one protected bulk read in place of eight directory requests, network
failure/retry and a genuine successful reply withheld beyond the 30-second
deadline. The timeout is readable, polling does not overlap the pending read,
unavailable data is not displayed as empty, and Retry consumes a real fresh reply.
Role, responsive/theme and logout/account-isolation coverage also passes. This
uses the owned local stack and does not establish hosted page-load timing.

The exact API source inventory remains `api-cutover-inventory.json`; its reference
counts include inactive branches and do not establish runtime reachability.

The subsequent logout latency run passed 416 browser assertions with zero runtime
exceptions. It retains the above coverage and holds actual successful logout
responses to prove immediate pending feedback, blocked dismissal/duplicate
requests and a confirmed signed-out destination. Fifteen actual local logouts
took 83–1,685 ms; these are isolated-stack timings, not a hosted latency guarantee.
The native role projection is primary → `user`, resident → `student`, seller →
`merchant`, officer → `verification_team`; the other workspace roles retain their
kind names. Direct API denial remains mandatory alongside UI route protection.

| Entry / current component | Native session | Active contracts and positive journey | Required negative / recovery checks |
| --- | --- | --- | --- |
| `/`, `/pineresidence`, `/pinemarket`, `/pinemarket/stores/:id` | Guest or signed in | Public hostels/products/store projections; listing/detail, optional services map, continuation to login | Unpublished residence/store unavailable; guest purchase/message denied; catalog error and retry; map loading close |
| `/login`, `PageUnifiedLogin` | Guest | Password login, Google handoff, primary signup/email verification, recovery, explicit resident/seller PIN choice | Blank/malformed inputs; wrong password/PIN; ambiguous shared email; temporary restoration failure; genuine logout; no credential storage |
| `/user/dashboard`, `/market`, `PageUserDashboard` | Primary `user` | Own profile/registered portals, public catalog, owned buyer orders/messages, verified resident activation and seller/manager registration | Other portal roles blocked before mounting; owned-subaccount separation; failed profile/catalog/order reads recover independently; cross-order access and account switch |
| `/student/dashboard`, `StudentDashboardRouter` | Primary, resident or seller | Intentional alias chooses primary dashboard, resident dashboard, or seller setup/workbench | Admin/manager/staff/officer denied; seller activation/setup rules retained |
| `/register-manager`, `PageManagerOnboarding` | Primary `user` | `/api/users/manager-onboarding`, verified separate Google manager identity, actual property application, corrections/resubmission, closure status | Separate manager identity; owner mismatch, stale context, enrollment replay; no repeat signup when progress exists |
| `/manager/dashboard`, `PageManagerDashboard` | Manager | Owned hostel/setup, housing hierarchy, room-key delivery/release/academic year, manager-created staff invitations, maintenance assignment/closure, meetings and residence change requests | Wrong portal denied; unreviewed setup locks housing controls; cross-hostel IDs, occupied-bed conflicts, one allocation; operation-key and returned-identity checks |
| `/staff/dashboard`, `PageStaffDashboard` | Staff | Own current employment, assigned maintenance accept/decline/reschedule/complete, profile, retention/resignation | Wrong portal denied; other-hostel tickets denied; cancelled/removed staff cannot work; account switch cannot retain former staff UI |
| `/resident/dashboard`, `PageResidentDashboard` | Resident `student` | Own rooms/maintenance, repair confirmation/rating, staff review within active housing, profile/PIN and closure | Wrong portal denied; cross-room/residence access; review requires current allocation; stale/released key unavailable; read failure shows retry |
| `/digital-market/onboard`, `PageDigitalMarketOnboard` | Seller `merchant` | Owned store status/setup/media and verified activation checkout | Missing approved store shown honestly; failed reads retain error; payment cannot grant access before fulfillment; immutable separate identity |
| `/digital-market`, `PageDigitalMarket` | Seller `merchant` | Owned status/inventory/orders, services/items, buyer messages, profile/branding, subscription checkout and handover | Failed status does not redirect existing seller into onboarding; retry; order role/ownership, stock conflicts, replay/PIN checks; account switch clears prior store |
| `/admin/dashboard`, `PageAdminDashboard` | Administrator | Real account/property/manager/store directories, officer invitation/dispatch/report review, residence approval/corrections, messages, settings and governance | Non-admin denial; captured-context mismatch; explicit inspection override reason; private keys stay inside app; failed reads not mistaken for empty directory |
| Officer aliases → `PageVerificationTeamPortal` | Officer | Own dispatched inspections, truthful report/signature/GPS/photos, actual submitted history and profile | Wrong portal and other-officer inspection denied; failed queue visibly retries; coalesced requests; duplicate report and stale context denied |
| `/staff-invitation`, `/officer-invitation`, `/admin-invitation` | Per invitation contract | Inspect actual invitation, named verified identity, accept once, correct portal sign-in | Expired/replayed/wrong recipient link; no role upgrade through public staff creation; guest-restoration pending state; invitation/form recovery |
| `/payments/return`, `PagePaymentReturn` | Owning manager or seller | Pending transaction selection and server-provider verification, exact purpose/access result, dashboard continuation | Guest/wrong owner/replayed or historical transaction; no client-declared payment success; no account contamination after switch |
| Shared notices, theme and SSE | Own verified context | Notifications, admin messages, maintenance recovery, account access; immediate light/dark paint with owned persistence; native authenticated event stream | Background coalescing/hidden pause; old-account responses suppressed; native guests never open SSE; keys/identity never sourced from browser cache |
| Shared administrator approvals / deletion panels | Administrator plus own key | Current proposals, second distinct vote, founder pause, verified recovery, final consent and worker handoff | No single-vote or direct delete bypass; server rechecks roster/session/key/fingerprint; retained identities and unrelated property unchanged |

Run each supported portal at 375 and 1440 pixels in light and dark mode. For
dashboards also exercise sidebar and top navigation, mobile navigation, keyboard
focus/Escape, dialogs, empty and populated data, reload persistence, and explicit
retry. Measure document-to-visible UI separately from required data completion;
record browser exceptions, actual HTTP results and request overlap/counts.

Confirmed source corrections tighten native portal navigation, remount portal
state when role/context changes, expose seller status-read retry without a false
onboarding redirect, and expose/cancel/coalesce officer queue reads. Native staff
and seller poll reads now share an in-flight request, and primary notifications
share the dashboard's account-scoped registration query. Administrator directory
failures retain a visible retry instead of becoming empty successful results.
The public store messaging action accepts the native store ID without requiring
the owner's private email. Their browser proof must use actual local native
API/Auth responses.

Native manager and residence approval forms now request the administrator's own
private approval key before their direct session requests. Seller approval keeps
the shared authenticated request prompt. A captured administrator change prevents
dispatch; keys remain transient in the approval form and request body.

`scripts/verify-supabase-local-browser.cjs` accepts only private credentials from
the owned disposable local stack. It exercises eight genuine UI logins, role
route/API denial, reload, responsive themes/navigation, read failure/retry, public
store messaging and staff logout/login isolation. Slow-read assertions withhold
actual successful responses past the existing polling interval; network failure
assertions fail outgoing requests and then consume actual replies after retry.
It does not fabricate provider responses, copy sessions or mutate cloud records.
Its private runtime report is `pinevela-harness/browser-workflow-results.json`
inside the temporary stack directory.

The first complete actual local run passed **365 browser assertions** with 14
native UI sign-ins across the eight roles, 496 recorded API requests and zero
runtime exceptions. It verified route/API denials, both responsive widths and
themes, reload/logout, exposed navigation variants, the real public-store
message dialog, seller/officer/administrator network-failure retry and the held
seller/staff poll reads. The primary page issued one shared initial registration
read. The credential-free checkpoint is
`.security/migration-reset/browser-workflow-native-before-cutover.json`.
Login-to-visible portal times ranged from 2.0 to 6.1 seconds on the owned local
stack; these timings do not establish hosted latency. This checkpoint precedes
native-only cutover and must be rerun against the resulting build.

After the default native build and the actual stack restart/persistence gate,
the final run passed **392 browser assertions** with the same eight roles, 14
native UI sign-ins, 504 API requests and zero runtime exceptions. It additionally
compared displayed administrator totals with the actual directory projection,
checked the property's saved coordinates in the responsive dossier, and verified
that guest login pages open no event stream. All earlier recovery, coalescing,
logout/reload and role-isolation checks passed again. Its credential-free report
is `.security/migration-reset/browser-workflow-native-after-cutover.json`.
Observed login-to-visible times were 2.0–6.5 seconds on this local stack; no hosted
latency or external-provider conclusion follows from these timings.

The browser run does not assert every nested form or tab, external Google OAuth,
payment-provider fulfillment, or a physical inspection. The separate actual local
HTTP workflow verifier covers business mutations and ownership boundaries; its
results must be assessed separately from this browser checkpoint.

Source checks after the native-only change removed the old login manager wizard,
synthetic identity-card generator, unused multi-room registration modal,
cooldown-bypass handlers and the inactive JSON-specific resident/seller forms.
The actual native resident activation, seller enrollment and separate manager
onboarding components remain. Route eligibility and governance polling helpers
no longer accept a persistence mode. The copied property digital address and
synthetic administrator count additions were replaced with actual API data.

Manager/staff/primary/resident roles must not enter one another's workspaces by
copying a URL. The backend remains authoritative even if UI code is bypassed or
a cached page is modified. Final acceptance combines a rebuilt native browser
run with actual HTTP ownership/workflow tests, restore/restart evidence and
default-command checks. A build or generated source inventory alone is
insufficient.
