# PineVela security and bug audit — 20 October 2026

The audit identified **11 findings: seven Medium and four Low**. These include one reproduced security weakness in request limiting, one browser hardening gap, and nine reliability, workflow, validation, or integration issues. **No Critical or High vulnerability was confirmed within the tested scope.** This is an evidence-based assessment, not a guarantee that the application has no other vulnerabilities.

No product fixes or hosted database changes were made. Existing unrelated worktree changes were preserved. Audit scripts, private evidence, isolated build output, and this report were added separately. No mock accounts, listings, orders, support tickets, or chat messages were created in the application or hosted database.

## Findings at a glance

| ID | Severity | Area | Finding | Evidence level |
| --- | --- | --- | --- | --- |
| PV-01 | Medium | Security | URL variants bypass the stricter authentication and room-key attempt limits | Reproduced against the actual app factory on an isolated database |
| PV-02 | Medium | Reliability | API helpers turn HTTP 401 failures into successful empty results | Reproduced with the real helper and running backend; affected screens traced in source |
| PV-03 | Medium | Payments | Refunds/disputes have no entitlement reconciliation workflow | Current source and live installed SQL verified; no real reversal executed |
| PV-04 | Medium | Performance | Inbox polling repeatedly downloads the entire message history | Source confirmed; no hosted load test |
| PV-05 | Medium | Orders | Cancellation is missing from the UI; expired reservations remain pending orders | Source confirmed across API, UI, and FAQ |
| PV-06 | Medium | Companion | Retrying an ambiguous failed response can create another turn and consume allowance | Source confirmed; network-loss scenario not executed |
| PV-07 | Medium | Notifications | Opening Purchases acknowledges order notices that were never visible | Source confirmed |
| PV-08 | Low | Browser hardening | Guest pages can be embedded by another origin | Reproduced in isolated Chromium; authenticated action not demonstrated |
| PV-09 | Low | Maps | Valid current store-logo URLs are rejected by the map | Actual URL predicate evaluated; producer/consumer traced |
| PV-10 | Low | Validation | Companion preferences accept an array where a string is required | Real validator and isolated PostgreSQL failure reproduced |
| PV-11 | Low | Product accuracy | Marketplace copy implies escrow/platform settlement for manual payment | Exact current UI and order behavior verified in source |

### PV-01 — Sensitive route limits do not cover equivalent URL spellings

**Locations:** [supabase/app.ts](../../supabase/app.ts#L77), [resourceSecurity.ts](../../resourceSecurity.ts#L51).

Express accepts case variations and a trailing slash, while the stricter limiter classifies the original path using case-sensitive regular expressions and exact strings. On the full current application factory, request 21 to `/api/auth/login` returned 429, but 22 requests each to `/api/auth/login/` and `/api/AUTH/LOGIN` all reached input validation and returned 400. Request 11 to `/api/room-keys/claim` returned 429, while 12 requests to `/api/room-keys/claim/` all reached authentication and returned 401. No credentials were supplied and no provider login was attempted.

This weakens application protection against repeated authentication, recovery, verification, and room-key attempts. The broad 900/IP/minute and 3,000/process/minute budgets still apply. Supabase/provider limits, authenticated ownership checks, and durable PIN/key lockouts remain separate defenses; this test did not bypass them. Process-local counters also need review before a multi-worker deployment.

**Recommended change:** classify canonicalized or matched operations consistently, so aliases share one sensitive budget. Add casing/trailing-slash regression cases while preserving independent account lockouts.

### PV-02 — Denied operations can appear successful

**Locations:** [src/lib/api.ts](../../src/lib/api.ts#L41), [AuthContext.tsx](../../src/context/AuthContext.tsx#L259), [PageStaffInvitation.tsx](../../src/components/PageStaffInvitation.tsx#L28), [PageManagerDashboard.tsx](../../src/components/PageManagerDashboard.tsx#L542), [session.ts](../../src/lib/session.ts#L45).

Both API helpers fulfill with `[]` for every HTTP 401, including mutations. Actual unauthenticated POST and DELETE requests to guarded staff endpoints returned 401, but the real helper fulfilled both promises and emitted session-expiration events. Neither request performed a domain mutation.

Affected UI paths treat fulfillment as success: staff deletion can remove the row locally and display a success notice after the server rejected it. A staff invitation password-proof failure can likewise reach the verified-success branch despite failed activation. The invitation example is source traced, not a consumed live invitation; invalid signup OTP is already mapped to 400. A separate invited identity's failed password proof can also clear an unrelated primary identity from the browser UI.

**Recommended change:** reject authentication failures with a typed error, require explicit success receipts for mutations, and distinguish a failed separate-identity proof from expiration of the current app session. Backend authorization itself remains intact.

### PV-03 — Reversed payments do not reconcile paid access

**Locations:** [payments.ts](../../supabase/payments.ts#L176), [payment evidence migration](../../supabase/migrations/20261009220000_verified_payment_fulfillment.sql#L53), [current access predicate](../../supabase/migrations/20261017231850_automatic_content_moderation.sql#L105).

The webhook handles `charge.success` and acknowledges other signed events without reconciliation. Verification short-circuits an already fulfilled payment. Installed PostgreSQL functions preserve fulfilled receipts and continue granting access, while expressly requiring a separate reviewed workflow for reversals. No such refund/dispute ledger or entitlement adjustment workflow was found in active code.

After a genuinely successful payment is reversed, paid access can persist until existing periods expire, and local revenue records remain unreconciled. This is a known deferred integration gap, not a demonstrated unpaid activation bypass or evidence of current financial loss. No real payment was refunded or disputed for this audit.

**Recommended change:** keep original receipts immutable and add an authenticated, idempotent reversal/adjustment workflow with reviewed entitlement policy. Validate official provider lifecycle events in a sandbox before relying on live paid access.

### PV-04 — Inbox work grows with all historical messages

**Locations:** [marketConversation.ts](../../supabase/marketConversation.ts#L27), [MarketplaceInbox.tsx](../../src/components/MarketplaceInbox.tsx#L60), [poll interval](../../src/components/MarketplaceInbox.tsx#L99).

The inbox query has no limit or cursor and returns all messages across the account's conversations. Every visible five-second poll downloads and iterates over that history again. Decryption caching, request deduplication, and hidden-tab suspension help, but do not bound the response, parsing, cache-key construction, or retained history. Send limits constrain arrival speed rather than total accumulated history.

Long histories can increase server load, bandwidth, and mobile memory/latency. An actual production slowdown or denial of service was not measured. Related unbounded order reads perform timeline/review queries for every order, plus buyer PIN queries ([orders.ts](../../supabase/orders.ts#L30)).

**Recommended change:** page conversation history, fetch incremental changes, and bound visible/thread data. Page order history and batch its related reads. Measure against an isolated real workflow rather than flooding customer conversations.

### PV-05 — Order cancellation and expiry recovery are incomplete in the UI

**Locations:** [orders.ts](../../supabase/orders.ts#L75), [seller actions](../../src/components/PageDigitalMarket.tsx#L1514), [buyer tracking](../../src/components/PageUserDashboard.tsx#L1834), [FAQ](../../src/components/faqContent.ts#L16).

The API supports ownership-checked cancellation for buyers and sellers, but frontend callers expose agreement, rejection, completion, and PIN renewal only. After seller agreement there is no normal cancellation control; the FAQ nevertheless describes cancellation as available.

Reservation expiry stops stock from being reserved, but does not change the saved active order status or its displayed pending label. No expiry transition worker was found. Abandoned orders can remain in pending work and affect unresolved-order lifecycle checks until an explicit action resolves them. PIN renewal is available for continuing an order, but does not provide cancellation or terminal cleanup.

**Recommended change:** expose authorized cancellation with confirmation, make expiry state explicit, and align pending counters, lifecycle checks, and FAQ with that policy. No customer order was changed during this audit.

### PV-06 — Companion retries lose the logical submission ID

**Locations:** [PineVelaCompanion.tsx](../../src/components/PineVelaCompanion.tsx#L100), [server replay lookup](../../supabase/companion.ts#L181), [commit and response](../../supabase/companion.ts#L266).

If a turn commits successfully but its HTTP response is lost, the client restores the text. Sending it again creates a new UUID instead of reusing the unresolved request ID or reconciling saved history. The previous successful commit clears the active-request lease, so the new request can reserve another attempt and save another turn. The server's matching-ID replay protection works; the client does not preserve that ID across this failure.

This can consume extra free allowance/provider work and create duplicate history. It is conditional on an ambiguous network outcome; no provider request or packet-loss reproduction was performed. There are no companion payment charges.

**Recommended change:** retain the ID and text for unresolved sends, reconcile completed history, and mint a new ID only for a new logical submission.

### PV-07 — Purchases acknowledges unseen order notifications

**Locations:** [PageUserDashboard.tsx](../../src/components/PageUserDashboard.tsx#L818), [NotificationViewportTracker.tsx](../../src/components/NotificationViewportTracker.tsx#L23).

The Purchases & Tracking tab effect marks every unread order notice as read, including newly received notices, without proving that its corresponding card/order update was visible. Offscreen/filtered orders and notices behind an open modal can lose their unread badge. This bypasses the visibility/modal checks used by the general notification tracker. Hidden-page polling is normally paused; continual background polling is not claimed.

**Recommended change:** acknowledge the actual visible notice or explicitly opened order update, preserving account/session guards. No saved notification read state was changed for this audit.

### PV-08 — Frontend HTML has no framing restriction

**Locations:** [staticFrontend.ts](../../supabase/staticFrontend.ts#L7), [app.ts](../../supabase/app.ts#L70), [cookie policy](../../supabase/auth.ts#L19).

An owned page on a different origin successfully embedded the genuine login form in isolated Chromium. The current local HTML response has neither CSP `frame-ancestors` nor `X-Frame-Options`; API/media headers do not protect the HTML document. This leaves a guest UI redressing/clickjacking surface.

Severity is Low: `SameSite=Strict` cookies materially limit ordinary cross-site authenticated framing. HttpOnly and production Secure provide separate cookie protections. No authenticated action, credential capture, or sibling-origin exploit was demonstrated. Local HTTP cannot establish the eventual deployment's TLS/HSTS posture.

**Recommended change:** deliver `frame-ancestors 'none'` and appropriate legacy framing protection on HTML at the app or deployment edge. Review other document security headers alongside deployment configuration.

### PV-09 — Map logo validation uses retired paths

**Locations:** [NearbyServicesMap.tsx](../../src/components/NearbyServicesMap.tsx#L127), [catalog serializer](../../supabase/catalog.ts#L42), [store branding](../../supabase/storeSetup.ts#L42).

The map accepts `/uploads/`, `/assets/`, and older public Supabase paths. Current owned uploads use `/api/media/<uuid>`, and the built-in logo is `/store-covers/pinevela-logo.svg`; both are rejected and replaced with the generic shop icon. The actual predicate was evaluated against the real default path. No artificial store or uploaded logo was created.

**Recommended change:** admit the supported same-origin media route and known default asset while retaining strict origin/path checks. This is a rendering regression, not a demonstrated injection issue.

### PV-10 — Malformed companion preferences produce a server error

**Locations:** [companionModel.ts](../../companionModel.ts#L36), [saveCompanionPreferences](../../supabase/companion.ts#L56), [error mapping](../../supabase/app.ts#L159).

`responseStyle: ["brief"]` passes the real validator because it coerces the value with `String()`, then sends the original array to PostgreSQL. An actual native actor on the isolated restore reproduced SQLSTATE `23514`; previous preferences remained unchanged. Generic HTTP 500 behavior follows from the current error mapper, rather than a live malformed settings submission.

**Recommended change:** require the correct JSON primitive type before enum validation and return a descriptive 400. The database constraint prevented invalid persisted state; no ownership or privilege bypass was found.

### PV-11 — Escrow and settlement wording overstates payment functionality

**Locations:** [seller revenue copy](../../src/components/PageDigitalMarket.tsx#L1448), [buyer PIN copy](../../src/components/PageUserDashboard.tsx#L1838), [order payment method](../../supabase/orders.ts#L34).

“Escrow Handshake PIN” and “Settled through system” imply held/verified platform funds. These marketplace purchases use “Pay on Campus Delivery”; PIN completion records physical handover without holding or releasing the buyer's money. Paystack covers platform fees rather than this goods-payment flow.

**Recommended change:** describe a delivery/handover confirmation and accurately label recorded sales. Add escrow wording only if a real funds-holding/settlement mechanism is implemented.

## Verification completed

| Check | Captured result | Practical limit |
| --- | --- | --- |
| All `tests/*.test.ts` | **139 passed, zero failed/skipped**, including companion, encryption, support, upload, session, Google, and map suites | Passing regression tests do not prove every business invariant |
| TypeScript (`npm run lint`) | Passed | This command runs `tsc --noEmit`, not a separate style/security linter |
| Frontend and backend production bundles | Both completed successfully into the private audit directory | No deployment or preview restart performed |
| `npm audit --json` | Zero reported dependency advisories | Application authorization/logic require separate checks |
| Anonymous API boundary sweep | **306 expected denials:** 245×401 and 61×404 | 241 direct-auth probes, four formerly public reads, 57 retired probes, four active invitation-proof routes with missing tokens; not 306 distinct endpoints |
| Current app on isolated PostgreSQL | **23 runtime assertions passed** | Two real primary identities from the existing checkpoint; not every operational role |
| Companion quota/security verifier | **47 assertions passed** | Real native sessions; no Groq calls or fabricated chat records |
| Hosted migration ledger | All **76** current migrations installed, no source digest mismatch | Read-only schema inspection; no hosted migration applied |
| Hosted RLS/grants | RLS enabled on all **37 public application tables**; no browser-role private-table grants; no public Storage buckets | Presence of RLS alone does not prove every policy |
| Hosted function/index posture | No ordinary exposed public SECURITY DEFINER function found; private definers had expected search-path/PUBLIC restrictions; no duplicate active resident or bed allocations | Provider `rls_auto_enable()` is an event trigger and was excluded from ordinary callable-function findings |
| Guest Chromium crawl | **30/30 scenes ready**, **16/16 protected-route guest redirects**, no uncaught JS errors, unhandled rejections, or horizontal overflow | 375×812 and 1440×1000; actual catalogs were empty |
| Bundle secret comparison | 135 text assets checked; no matches to configured server-secret values | Exact configured values, not every possible secret format |
| Local reachable Git history | 57 commits / 1,765 text blobs scanned; no recognized credential formats or current configured-secret matches | No unreachable/remote-only history or arbitrary-password guarantee |
| Private-file HTTP checks | `.env`, `.git`, `.security`, runtime data and backend bundle paths denied; apparent 200s for source paths were HTML SPA fallbacks, not source disclosures | Current local preview only |
| Private-data index check and final diff whitespace check | Passed | Existing unrelated dirty-tree changes were preserved |

The isolated actor checks exercised authorized own reads/settings, hidden foreign profiles, denied foreign updates, forged identity/context/kind, attempted role promotion, private quota-table denial, cross-user preference isolation, and revoked-session denial while another native user remained usable. The quota verifier additionally exercised concurrent final-attempt admission, token reservations, five-hour rollover, late settlement, restart persistence, and consent requirements. These are direct runtime/database checks rather than client-only assertions.

## Boundaries reviewed without a confirmed bypass

- Authentication and housing: provider-verified identity, native session and app binding, server-derived context/role, administrator membership, staff assignment, current room allocation, independent PIN versions, and SQL uniqueness/relationship guards.
- Marketplace: seller/listing ownership, verified enrollment generations, server prices/stock, serialized reservations, buyer-only PIN disclosure/renewal, bounded failed-PIN attempts, and verified payment receipts.
- Buyer–seller encryption: ciphertext-only new messages, authenticated encryption and signatures, identity pinning, account/participant binding, encrypted recovery backups, and selected-message disclosure for reports. The custom protocol has no independent cryptographic audit or forward secrecy; historical pre-cutover plaintext remains a documented limitation.
- Upload/moderation: authentication before parsing, bounded raster decoding, metadata removal, owned normalized media, fail-closed provider errors, and approvals bound to exact content digests. No new claim is made about classifier accuracy; automatic moderation cannot guarantee detection of every prohibited image/product.
- Help/reporting: private guest ticket tokens, requester/session ownership, internal-note filtering, invited-agent membership, selected-evidence ownership, and separate customer-service recommendations versus administrator sanction approval.
- Companion: consent, scoped account reads, bounded tools/outputs and provider destination, persistent quota, session isolation, and text rendering. No tool-based arbitrary file editing, code execution, or foreign account read was found in the reviewed flow.

These include source review and the specific runtime checks above; they are not assertions that every authenticated workflow or concurrency combination was executed.

## Coverage limits and blocked checks

Mutative database tests used an **existing encrypted checkpoint from 15 October**, restored locally with all 76 current migrations. No hosted user/account/product records were exported or modified for those tests. Current hosted checks were read-only metadata and aggregate counts. A fresh full hosted backup was rejected by automatic approval review because it would export account data and a delivery-PIN recovery key; it was not retried through another method.

Authenticated end-to-end browser journeys, populated market cards, actual purchases/refunds, consuming real invitations, password recovery mail, support replies/email delivery, applied sanctions, real model replies/adversarial scope testing, and production-scale load were not executed. No customer credentials or user browser profile were used. The local preview does not establish production DNS/TLS, reverse-proxy headers, WAF, dashboard exposure, provider settings, or infrastructure security.

A new Supabase CLI advisor run could not be completed because fetching the CLI failed with npm registry DNS resolution (`EAI_AGAIN`). Current SQL/RLS/grant checks above did complete; an older advisor result was not reused as a current pass.

Repeated private staff reviews were considered but **excluded from confirmed findings**: current policy does not define one review per pair/time interval, no rating aggregate or submission UI was found, and no abusive review was submitted. This remains a product-policy/abuse-hardening question.

## Recommended remediation order

1. Correct URL budget classification and propagate denied operations as errors (PV-01, PV-02).
2. Complete reversal reconciliation before relying on live paid entitlements (PV-03).
3. Bound history reads, complete order recovery, preserve companion retry IDs, and acknowledge only visible notices (PV-04–PV-07).
4. Add document framing protection and fix logo validation, preferences typing, and payment copy (PV-08–PV-11).
5. Verify each fix with focused positive/negative regression checks, then cover real isolated operational-role journeys and the eventual deployment configuration.

## Private evidence index

Evidence is retained locally under `.security/audit-2026-10-20/`, protected from public static delivery. It must remain outside version control and published frontend artifacts. This report intentionally omits secrets, customer names, emails, IDs, message contents, and recovery material.

- `all-tests.log`, `typecheck.log`, `frontend-build.log`, `backend-build.log`, `npm-audit.json`, `private-data-check.log`.
- `live-database.json`, `live-database-summary.json`, `housing-posture.json` — read-only schema/grant/index and aggregate evidence.
- `isolated-runtime.json`, `limiter-full-app.json`, `anonymous-boundaries-result.json`, `malformed-preferences.json`, `companion-allowance/verification.json` — isolated runtime proofs.
- `auth-housing/unauthorized-client-result.json`, `auth-housing/history-secret-summary.json`, `git-history.md`.
- `market/guest-crawl.json`, `market/framing-proof.json`, `market/guest-framed-login.png`, `delivery-and-bundle.json`.
- `support-ui/source-probes.json` and the three scoped audit notes distinguish evaluated predicates from source-traced behavior.
